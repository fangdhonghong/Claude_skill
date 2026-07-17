# 工程结构详解（N1-N2）

本文档解释 strict-stm32 工程结构的“为什么”，是 `SKILL.md` 里工程结构部分的设计依据。

## 目录

1. [CubeMX 一次性骨架策略](#cubemx-一次性骨架策略)
2. [.ioc 冻结的含义](#ioc-冻结的含义)
3. [分层架构详解](#分层架构详解)
4. [`code/` 的两个 AI 可动例外](#code-的两个-ai-可动例外)
5. [USER CODE 段约束](#user-code-段约束)
6. [共享外设单例规则](#共享外设单例规则)
7. [跨层 include 单向约束](#跨层-include-单向约束)

---

## CubeMX 一次性骨架策略

工程开始时，用户用 STM32CubeMX 走一遍：

1. 选 MCU 型号（或开发板）
2. 配时钟树（SystemClock）
3. 项目设置：**选 CMake** 作为构建系统
4. **选"复制所有库"**（Copy all libraries）—— 把所有 HAL/CMSIS 源文件复制进 `code/Drivers/`
5. 生成路径设到 `project_root/code/`（driver/bsp/app 等 AI 加的内容会建在 code/ 里）

生成出来的就是工程骨架。**此后禁止再用 CubeMX 启用/修改任何外设**。后续所有外设演进由 AI 通过手写 HAL/LL 代码 + 维护 CMake 完成。

**为什么这么做**：

- CubeMX 的真正价值不是"代码生成工具"，而是它内置的**ST 官方 AF 表 / 寄存器位域 / 时钟树数据库**。这个数据库甩不掉，只能换一种方式调用它。所以"复制所有库"= 把这个数据库静态化到工程里。
- 之后 AI 写 HAL 代码就**直接读这些静态库**作为真值，不依赖 CubeMX 重新生成。

## .ioc 冻结的含义

`.ioc` 文件是 CubeMX 的工程配置文件。**冻结**意味着：

- ❌ 不允许在 CubeMX 里勾选/取消外设
- ❌ 不允许在 CubeMX 里改引脚分配
- ❌ 不允许在 CubeMX 里改时钟树（这条有例外，见下）
- ✅ 允许在 CubeMX 里重新生成代码（但通常不需要）

**时钟树的例外**：如果未来真的要改时钟配置（比如从 480MHz 改到 520MHz），AI **不允许**直接改 `main.c::SystemClock_Config()`（因为 PLL 参数计算错就死机）。这种情况强制走"重新跑 CubeMX 改时钟树"流程，让 CubeMX 重新算 PLL 参数。

但这种情况很少见。绝大多数项目从一开就定好主频，后续不动。

## 分层架构详解

```
┌────────────────────────────────────────────┐
│  app/         业务逻辑（姿态解算、状态机）  │
└────────────────────────────────────────────┘
       ↓ 调用
┌────────────────────────────────────────────┐
│  bsp/         外设芯片驱动（MPU6050、OLED） │
└────────────────────────────────────────────┘
       ↓ 调用
┌────────────────────────────────────────────┐
│  driver/      通用驱动（I2C、SPI、UART）    │
└────────────────────────────────────────────┘
       ↓ 调用
┌────────────────────────────────────────────┐
│  code/Drivers/  HAL 库 + CMSIS（只读）      │
└────────────────────────────────────────────┘
```

**物理位置**：app/bsp/driver/sandbox 都在 `code/` 下（与 `Core/` `Drivers/` 平级）；`code/` 是 CubeMX 工程目录 = VSCode 工作区根。CMake 里 driver 源文件路径直接写作 `driver/foo.c`，详见 `references/cmake.md`。

### 各层职责

| 层 | 职责 | 例 |
|---|---|---|
| `app/` | 应用层业务逻辑 | `app_motion.c`（姿态解算）、`app_state_machine.c` |
| `bsp/` | 板级外设芯片驱动 | `bsp_mpu6050.c`、`bsp_oled_ssd1306.c`、`bsp_led.c` |
| `driver/` | 通用外设驱动 | `driver_i2c.c`（包 HAL_I2C_*）、`driver_uart.c` |
| `code/Drivers/` | HAL/CMSIS 静态库 | 由 CubeMX 复制，AI 只读 |

### 分层规则

- `app/` 可以 include `bsp/` 和 `driver/`（但通常通过 bsp 间接用 driver）
- `bsp/` 可以 include `driver/`，**不允许** include `app/`
- `driver/` **不允许** include `bsp/` 或 `app/`
- 任何层都可以 include `code/Drivers/` 的 HAL 头文件

**为什么这么分**：

- 让"通用驱动"（driver）可以跨项目复用 —— 下个项目换个 MCU，driver_i2c.c 改改就能用
- 让"外设芯片驱动"（bsp）独立于应用 —— MPU6050 驱动既能给姿态解算用，也能给数据记录用
- 让"业务逻辑"（app）独立于硬件细节 —— 改 MPU6050 为 ICM42688 时，app 层 API 不变

## `code/` 的两个 AI 可动例外

`code/` 目录是 CubeMX 产物，原则上冻结。但有两个文件允许 AI 修改：

### 例外 1：`code/Core/Inc/stm32xx_hal_conf.h`

这个文件控制每个 HAL 模块的开关，比如：

```c
#define HAL_USART_MODULE_ENABLED
// #define HAL_I2C_MODULE_ENABLED    ← 注释掉 = I2C HAL 函数编译时被 #ifdef 吞掉
```

AI 启用新外设时必须在这里取消对应宏的注释。

**约束（SR1）**：**只动 `MODULE_ENABLED` 这类宏**。这个文件还含：

- `HSE_VALUE` / `HSI_VALUE`（晶振频率）
- `TICK_INT_PRIORITY`（SysTick 优先级）
- 各种 HAL 库的参数阈值

这些值都是 CubeMX 算好的，动错会时钟崩或 HAL 异常。

> CubeMX 6.x 把 hal_conf.h 放在 `code/Core/Inc/` 下（旧版是 `code/Inc/`）。Skill 文档统一用新路径，遇到旧工程按实际路径找。

### 例外 2：`code/CMakeLists.txt`

CubeMX 生成的 CMake 主入口。AI 在顶层 `target_sources` 钩子里追加 `driver/bsp/app/sandbox/` 下的源文件（直接写 `driver/foo.c`，不带 `../`），在 `target_include_directories` 里追加 `driver bsp app sandbox` 等 include path。

详见 `references/cmake.md`。

## USER CODE 段约束

CubeMX 生成的 `main.c`（在 `code/Core/Src/main.c`）里有几对 `/* USER CODE BEGIN x */ ... /* USER CODE END x */` 注释，**即使重新跑 CubeMX 也不会覆盖这些段的内容**。

AI 修改 `main.c` 时**只能**在这些段内写代码。常用段：

```c
/* USER CODE BEGIN 0 */
// includes、宏定义、全局变量
/* USER CODE END 0 */

int main(void) {
    /* USER CODE BEGIN 1 */
    // main 函数内的局部变量
    /* USER CODE END 1 */

    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    // ...

    /* USER CODE BEGIN 2 */
    // 用户初始化代码（init 调用）
    /* USER CODE END 2 */

    while (1) {
        /* USER CODE BEGIN WHILE */
        // 主循环代码
        /* USER CODE END WHILE */
    }
}
```

**典型用法**：

- `USER CODE BEGIN 0`：`#include "app_motion.h"`、extern 声明
- `USER CODE BEGIN 2`：调用 `driver_i2c_init()`、`bsp_mpu6050_init()`、`app_motion_init()`
- `USER CODE BEGIN WHILE`：调用 `app_motion_step()` 等周期任务

> `code/Core/Src/stm32xx_it.c` 同样有 USER CODE 段，AI 在那里加外设的 IRQHandler（调用 driver 层提供的 `driver_xxx_irq_handler()`）。

**为什么不用 USER CODE 段堆代码**：

短期看省事，但 `main.c` 必然膨胀成屎山。所有业务代码进 `driver/bsp/app/`，`main.c` 只做"装配"（init 调用 + 主循环 step 调用）。这样 `main.c` 永远干净，一眼能看出"这个项目做了什么"。

## 共享外设单例规则

很多 bsp 设备共享同一外设 —— 比如 MPU6050 和 OLED 都用 I2C1，多个传感器都用 SPI2。

**规则（SR5）**：

- 共享外设的句柄（如 `I2C_HandleTypeDef hi2c1`）**只**在 `driver/driver_i2c.c` 里定义和初始化
- `bsp/` 层**禁止**直接 `extern hi2c1` 然后调 `HAL_I2C_Master_Transmit(&hi2c1, ...)`
- `bsp/` 层**必须**通过 `driver/` 层的 API 操作，如 `driver_i2c_write_reg(DEV_MPU6050, reg, val)`

**为什么**：

- 如果 bsp 直接碰句柄，两个 bsp 会互相踩对方的中断配置 / DMA 通道 / 状态机
- `driver_i2c.c` 做单例管理：谁先 init、谁后 init、总线忙怎么排队、出错怎么重试 —— 这些都在 driver 层封装

**反例（错）**：

```c
// bsp/bsp_mpu6050.c
extern I2C_HandleTypeDef hi2c1;  // ❌ 直接碰句柄

uint8_t bsp_mpu6050_read(uint8_t reg) {
    uint8_t val;
    HAL_I2C_Master_Receive(&hi2c1, 0x68, &val, 1, 100);  // ❌
    return val;
}
```

**正例（对）**：

```c
// bsp/bsp_mpu6050.c
#include "driver_i2c.h"

uint8_t bsp_mpu6050_read(uint8_t reg) {
    return driver_i2c_read_reg(I2C_BUS_1, 0x68, reg);  // ✅ 通过 driver API
}
```

## 跨层 include 单向约束

```
app ──include──→ bsp ──include──→ driver ──include──→ code/Drivers/
```

**禁止反向**：

- `bsp/` 不能 include `app/`
- `driver/` 不能 include `bsp/` 或 `app/`

**为什么**：

- 允许反向就引入了循环依赖 —— 改 driver 会影响 app，改 app 会影响 bsp，工程结构退化成一团
- 单向依赖让"底层不知道上层存在"，符合"高内聚低耦合"

实现上靠 CMake 的 include path 控制，详见 `references/cmake.md`。
