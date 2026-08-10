# 反幻觉规则与对话式询问（N3）

本文档解释 strict-stm32 的反幻觉机制，包括必读 HAL 头文件、必问清单、对话式询问示例。

## 目录

1. [为什么 AI 必须读 HAL 头文件](#为什么-ai-必须读-hal-头文件)
2. [HAL 头文件路径速查](#hal-头文件路径速查)
3. [datasheet 查找规则](#datasheet-查找规则)
4. [必问清单 7 项详解](#必问清单-7-项详解)
5. [对话式询问 vs 审问表](#对话式询问-vs-审问表)

---

## 为什么 AI 必须读 HAL 头文件

STM32 底层代码需要的硬事实分 5 类：

| # | 硬事实 | 例 | 来源 |
|---|---|---|---|
| 1 | 寄存器基地址 | `USART2` = `0x40004400` | CMSIS 设备头文件 |
| 2 | HAL 模块 API 与初始化序列 | `HAL_I2C_Init()` 内部会回调 `MspInit` | HAL 库源码 |
| 3 | GPIO AF 编号 | PA2 做 USART2_TX = `GPIO_AF7_USART2` | HAL 的 `gpio_ex.h` |
| 4 | 引脚选择 | USART2_TX 选 PA2 还是 PD7？ | ⚠️ HAL 不提供，靠参考手册或用户决策 |
| 5 | 外设芯片寄存器 | MPU6050 PWR_MGMT_1 = `0x6B` | 外设芯片 datasheet |

**核心洞察**：STM32CubeMX 的"复制所有库"决定，把 #1/#2/#3 的真相源**完整地静态化到 `code/Drivers/`** 里。这就是 AI 的内置事实数据库。

**反幻觉硬约束（SR4）**：写 `driver/` 或 `bsp/` 任何文件前，**必须**先用 Read 工具读对应 HAL/CMSIS 头文件，基于读到的真实宏/API 写代码，**不许凭记忆**。

## HAL 头文件路径速查

按芯片系列路径不同，下面以 STM32H7 为例：

```
code/Drivers/
├── CMSIS/
│   └── Device/ST/STM32H7xx/Include/
│       ├── stm32h7xx.h                 ← 寄存器基地址、所有外设宏
│       └── stm32h7xx_hal_conf.h
└── STM32H7xx_HAL_Driver/
    └── Inc/
        ├── stm32h7xx_hal.h             ← HAL 总头
        ├── stm32h7xx_hal_i2c.h         ← I2C HAL API
        ├── stm32h7xx_hal_uart.h        ← UART HAL API
        ├── stm32h7xx_hal_spi.h
        ├── stm32h7xx_hal_tim.h
        ├── stm32h7xx_hal_adc.h
        ├── stm32h7xx_hal_gpio.h
        ├── stm32h7xx_hal_gpio_ex.h     ← GPIO AF 编号宏（关键！）
        ├── stm32h7xx_hal_dma.h
        ├── stm32h7xx_hal_can.h
        └── ...
```

### 写不同外设时必读的最小集合

| 任务 | 必读文件 |
|---|---|
| I2C 驱动 | `stm32h7xx_hal_i2c.h`、`stm32h7xx_hal_gpio_ex.h`（查 AF）、`stm32h7xx.h`（查 I2C 基地址宏） |
| UART 驱动 | `stm32h7xx_hal_uart.h`、`stm32h7xx_hal_gpio_ex.h` |
| SPI 驱动 | `stm32h7xx_hal_spi.h`、`stm32h7xx_hal_gpio_ex.h` |
| 定时器 | `stm32h7xx_hal_tim.h` |
| ADC | `stm32h7xx_hal_adc.h`、`stm32h7xx_hal_adc_ex.h` |
| DMA | `stm32h7xx_hal_dma.h`、`stm32h7xx_hal_dma_ex.h` |
| 外设芯片驱动（bsp） | 对应总线 HAL 头文件 + 外设 datasheet |

注意路径里的芯片系列名要按实际工程调整（F4/G4/H7/L4 等）。

## datasheet 查找规则

写 `bsp/<chip>.c` 前的处理流程：

```
1. 查 hw/datasheets/ 是否有对应 PDF
   ├─ 有 → Read 后写
   └─ 无 → 反问用户："写 <chip> 驱动需要 datasheet，请把 PDF 放到 hw/datasheets/ 或给路径"

2. 不允许凭训练记忆写冷门芯片
   ├─ 主流芯片（MPU6050、BMP280、SSD1306、WS2812 等）AI 记忆较多，可兜底但仍建议查 PDF
   └─ 冷门芯片（ICM-42688、LSM6DSO、MAX17048 等）AI 记忆不可靠，必须查 PDF
```

**为什么**：训练数据对经典芯片覆盖好，对近年新芯片覆盖差。不查 PDF 凭记忆写冷门芯片 = 必错。

## middleware 的真值源：协议规范与帧格式定义

写 `middleware/`（纯软件层）代码前，**不读 HAL 头文件**（middleware 不依赖硬件）。真值源是协议规范：

| middleware 内容 | 真值源 |
|---|---|
| 协议解析（帧头/切帧/长度字段） | 协议文档 / 用户提供的帧格式定义 |
| CRC 校验 | 标准 CRC 规范（如 CRC-16/MODBUS 多项式 0x8005，初始值 0xFFFF） |
| 数据结构（RingBuffer/FIFO） | 通用计算机科学定义（无硬件依赖） |

**处理流程**：

```
1. 查 code/hw/datasheets/ 或用户提供的协议文档（Modbus 标准、自定义帧格式定义）
   ├─ 有 → Read 后写
   └─ 无 → 反问用户："协议帧格式怎么定义？帧头 / 长度 / 校验字段分别是什么？"
2. CRC 查标准规范，不允许凭记忆写多项式
```

**为什么**：帧格式（帧头、长度字段位置、校验方式、大小端）每个协议都不一样，AI 凭记忆猜 = 必错。CRC 多项式写错一位，整条链路静默出错。

## 必问清单 7 项详解

写代码前 AI 内部核对这 7 项。每项必须能在 (a) 用户请求 (b) `HARDWARE.md` (c) `hw/datasheets/` 中找到答案。缺哪项就对话式问哪项。

### 1. 外设实例号

不同实例对应的硬件资源完全不同：

- `USART1` vs `USART2` vs `USART3` —— 基地址、时钟域、可选引脚都不同
- `I2C1` vs `I2C2` vs `I2C3` —— 同上
- `TIM1` vs `TIM2` vs `TIM3` —— 高级定时器 vs 通用定时器，功能不一样

AI 不能默认（"USART 通常用 USART1"），必须问。

### 2. 引脚选择

同一外设实例的同一功能可能对应多个引脚：

- STM32H7 上 USART2_TX 可以是 PA2、PD8、PG11 等
- HAL 提供宏 `GPIO_AF7_USART2` 但不告诉你"该选哪个"

AI 必须问，或者从用户提供的板子原理图/HARDWARE.md 找答案。

### 3. 关键参数

不同外设的关键参数：

| 外设 | 关键参数 |
|---|---|
| UART | 波特率、数据位、停止位、校验位、流控 |
| I2C | 速率（100k/400k/1M）、7-bit/10-bit 地址 |
| SPI | 时钟极性/相位（CPOL/CPHA）、分频、位序 |
| ADC | 采样率、分辨率、参考电压、通道 |
| 定时器 | 预分频、自动重装载值、计数模式 |
| 传感器 | 量程（如 MPU6050 加速度 ±2/±4/±8/±16g）、采样率、滤波器带宽 |

### 4. 是否用中断/DMA

| 模式 | 函数后缀 | 适用场景 |
|---|---|---|
| 轮询 | `_Transmit` / `_Receive` | 简单、阻塞、CPU 占用高 |
| 中断 | `_Transmit_IT` / `_Receive_IT` | 非阻塞、回调驱动 |
| DMA | `_Transmit_DMA` / `_Receive_DMA` | 大数据量、CPU 完全解放 |

选择影响代码骨架（中断要写 IRQHandler，DMA 要配 DMA 通道）。

### 5. 中断优先级

STM32 默认用 4-bit 抢占优先级（NVIC_PriorityGroup_4）。AI 不能默认（"给个 5 吧"），要按应用优先级问：

- 系统核心（HAL Tick、RTOS 调度器）：0-1
- 关键实时控制（电机控制、传感器采样）：2-4
- 通信外设（UART、SPI）：5-7
- 低优先级（LED、按键）：10-15

### 6. 板级连接

外设芯片驱动要知道物理连接：

- I2C 设备：接在哪个 I2C？AD0/SA0 引脚拉高/低？（决定设备地址）
- SPI 设备：接在哪个 SPI？CS 引脚是哪个？
- 传感器：INT 引脚接哪个 GPIO？（如果要用中断）

### 7. 用量约束

应用级约束影响配置：

- 量程范围（冲击测试要 ±16g，姿态测量 ±2g 够）
- 最大速率（高速场景要 1kHz 采样率，普通 100Hz 够）
- 电源约束（电池供电要低功耗模式）

## 对话式询问 vs 审问表

**反模式（审问表）**：

```
请填写：
- 外设实例号：______
- 引脚选择：______
- 关键参数：______
- 是否用中断/DMA：______
- 中断优先级：______
- 板级连接：______
- 用量约束：______
```

用户感受：填表，烦。

**正模式（对话式）**：

```
我看了一下 SSD1306 datasheet 和你的需求。在开始写之前要跟你确认几个点：

1. 屏幕规格：128×64 还是 128×32？显存布局和初始化序列都不同
   （页地址范围 0-7 vs 0-3，初始化命令序列也不同）。

2. 接在哪个 I2C？哪两个引脚（SCL/SDA）？（HARDWARE.md 里没记）

3. I2C 地址：0x3C 还是 0x3D？这取决于板子上 SA0（D/C）引脚拉高还是低。

4. 显示方式：
   - RAM 全屏缓冲（约 1 KB SRAM，整屏刷新流畅，但吃内存）
   - 分页直写（零 SRAM 开销，但刷新慢、可能有撕裂）
   你的 MCU SRAM 余量多少？比如 F103C8 只有 20 KB，1 KB 缓冲不算小。
```

用户感受：和工程师同事讨论，每问带理由，能做有信息的决策。

**关键差异**：

- 每个问题都带**为什么问**和**选项的影响**
- 不是列表抛出，而是组织成对话
- AI 先表达"我看了一下你的需求"，体现已经做了功课
