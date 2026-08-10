# 验证机制详解（N5）

本文档解释编译验证、任务分类（脚手架 vs 正式）、烧录验证清单等机制。

## 目录

1. [工具链前置检查](#工具链前置检查)
2. [编译验证流程](#编译验证流程)
3. [任务分类识别规则](#任务分类识别规则)
4. [sandbox/ 目录用法](#sandbox-目录用法)
5. [烧录验证清单格式](#烧录验证清单格式)
6. [编译失败的处理](#编译失败的处理)

---

## 工具链前置检查

第一次启动本 skill 时（或编译验证前），用 Bash 检查工具链：

```bash
arm-none-eabi-gcc --version
cmake --version
ninja --version    # 可选，但 CubeMX 默认用 ninja
```

**任一缺失就提示用户安装**：

- `arm-none-eabi-gcc`：Windows 推荐 [ARM GNU 工具链](https://developer.arm.com/tools-and-software/open-source-software/developer-tools/gnu-toolchain)，或通过 STM32CubeIDE 附带
- `cmake`：[cmake.org](https://cmake.org/download/) 下安装包
- `ninja`：通过 `pip install ninja` 或独立安装

工具链在 PATH 里是前提。

## 编译验证流程

每次写完代码（Step 5）后，在 `code/` 目录下主动跑：

```bash
cd code/
cmake --preset Debug              # 配置（走 CMakePresets.json 里的 gcc-arm-none-eabi.cmake 工具链）
cmake --build build/Debug         # 编译
```

**或简化为一行**（首次配置后，且已经在 `code/` 下）：

```bash
cmake --build build/Debug
```

**绝对不能直接 `cmake -B build`** —— 不加载 preset 会用 host gcc，编出 x86 二进制。详见 `references/cmake.md` 的"必须用 cmake --preset"一节。

### 编译产物

成功后 `code/build/Debug/` 下会有：

- `${PROJECT_NAME}.elf` —— ELF 文件（调试用，**CubeMX 默认只产这个**，烧录用 STM32CubeProgrammer 可直接吃 elf）
- `${PROJECT_NAME}.hex` —— Intel HEX（烧录用，**CubeMX 默认不出**，需在 CMake 加 `objcopy` post-build）
- `${PROJECT_NAME}.bin` —— 裸二进制（同上）
- `${PROJECT_NAME}.map` —— 内存映射（查代码大小用）

### 编译失败的应对

见本文档末节"编译失败的处理"。

## 任务分类识别规则

strict-stm32 把每次 skill 调用分两类，**代码归属和文档归属都不一样**：

| 任务类型 | 例 | 代码归属 | 影响 HARDWARE.md？ | 任务日志 |
|---|---|---|---|---|
| **脚手架**（验证硬件用，最终要删） | "先跑流水灯试 LED"、"串口回显试串口" | `sandbox/` | ❌ 不更新硬件配置 | 短期，验证后归档/删 |
| **正式功能**（最终交付） | "加 MPU6050 驱动"、"实现串口控 LED"、"实现 Modbus 从站解析" | `driver/` `bsp/` `components/` `app/` | ✅ 更新硬件配置 | 长期保留 |

### 识别规则（按优先级）

**显式信号**：

| 用户措辞 | 任务类型 |
|---|---|
| "先试 / 试一下 / 验证 / test / check / 看看 XX 行不行" | 脚手架 |
| "加 / 实现 / 写一个 XX 驱动 / 功能" | 正式功能 |

**隐式信号**（措辞模糊时）：

- 用户请求里只关心"功能验证"（"先确认 LED 能亮"） → 脚手架
- 用户请求里关心"完整实现"（"实现串口命令解析"） → 正式功能
- 用户在 PROJECT.md 婴儿步路线图里标了"脚手架" → 脚手架

**反问兜底**：

不确定就反问："这是脚手架验证，还是要写成正式代码？"

### 为什么这么分

用户的婴儿步工作流：

```
大任务："串口控 LED"
├─ 步骤 1：流水灯（验证 LED 硬件）—— 脚手架，最终删
├─ 步骤 2：串口回显（验证 UART）—— 脚手架，最终删
└─ 步骤 3：串口控 LED —— 正式功能
```

脚手架代码的**价值**是验证硬件（"LED 硬件 OK"、"UART 通信 OK"），但**代码本身**最终要被正式版替换。

如果不分开放：

- 脚手架的"流水灯"和正式版的"串口控 LED"会混在 `main.c` 里，几个月后看不懂
- 脚手架的硬件配置污染 `HARDWARE.md`（比如记录了"PC0 是流水灯"，但正式版里 PC0 是命令 LED）
- 脚手架的决策日志污染 `tasks/`（看到 10 个任务，但 7 个是已删的脚手架）

所以脚手架代码物理隔离到 `sandbox/`，硬件配置不进 `HARDWARE.md`，决策日志可短期归档。

## sandbox/ 目录用法

```
sandbox/
├── led_test.c              ← 流水灯验证 LED
├── uart_echo.c             ← 串口回实验证 UART
├── i2c_scan.c              ← I2C 总线扫描
└── ...
```

### sandbox/ 代码的特点

- **不依赖** `driver/bsp/components/app/`（自包含）
- 可以直接调 HAL（如 `HAL_GPIO_TogglePin(...)`）
- 在 `main.c` 的 `USER CODE BEGIN 2` 段调用 `sandbox_led_test()`
- 验证完成后可以删（或保留作为参考）

### sandbox/ 文件结构模板

```c
// sandbox/led_test.c
// 用途：验证 PC0-PC7 LED 硬件可用
// 关联：PROJECT.md 步骤 1

#include "main.h"

void sandbox_led_test(void) {
    while (1) {
        for (int i = 0; i < 8; i++) {
            HAL_GPIO_TogglePin(GPIOC, 1 << i);
            HAL_Delay(100);
        }
    }
}
```

### 脚手架完成后的提示

任务完成后 AI 主动问：

> 步骤 1（流水灯验证 LED）已完成，硬件 OK ✅。
>
> `sandbox/led_test.c` 是否清理？
> - 选项 A：删除（脚手架使命完成）
> - 选项 B：保留作为参考
> - 选项 C：迁移到 `bsp/`（如果将来要复用）

## 烧录验证清单格式

AI 编译过了、代码交付前，**强制输出**烧录验证清单 —— 用户烧录后按清单逐项验证。

### 清单设计原则

- **最小化**：只列必要验证项，不堆砌
- **由浅入深**：先验证底层硬件，再验证通信，最后验证业务
- **可观察**：每项验证有用户可看的"信号"（LED 亮、串口输出、数据值）

### 通用模板

```markdown
## 烧录验证清单

烧录 `code/build/Debug/<project>.elf` 后，按顺序确认：

### 第一层：基础启动（任一失败 = 整个工程挂了）
□ 上电后 LED 心跳（说明 HAL_Init + SystemClock 正常）
□ 串口（如果有）能输出 boot 信息

### 第二层：本次任务的核心功能
□ <根据任务具体写>
□ <根据任务具体写>

### 第三层：边界与异常
□ <根据任务具体写>
□ <根据任务具体写>

### 失败时怎么定位
- 第一层失败：检查启动文件、链接脚本、时钟配置（基本不会错，CubeMX 一次性产）
- 第二层失败：检查 HAL 模块启用（hal_conf.h）、引脚 AF（gpio_ex.h）、外设句柄初始化
- 第三层失败：检查参数边界、异常处理、中断优先级
```

### 具体例子（MPU6050 任务）

```markdown
## 烧录验证清单

### 第一层：基础启动
□ 上电后 LED 心跳（PC0 每 500ms 翻转）

### 第二层：MPU6050 通信
□ 串口输出 "MPU6050 init OK"（说明 I2C 总线通了 + WHO_AM_I 寄存器读到 0x68）
□ 串口周期输出 6 轴数据（每 100ms 一次）

### 第三层：数据合理性
□ 静态平放：加速度 Z ≈ 9.8 m/s²（±0.2 容差），X/Y ≈ 0
□ 静态平放：陀螺仪三轴 ≈ 0（±0.5 °/s 容差）
□ 手动晃动：对应轴数据变化（X 晃动 → accel_x 大幅波动）

### 失败时怎么定位
- 第一层失败：检查启动文件、链接脚本、时钟配置
- 第二层 "init OK" 没打印：检查 I2C 引脚 AF（应是 GPIO_AF4_I2C1）、上拉电阻、AD0 引脚（地址 0x68 vs 0x69）
- 第二层 WHO_AM_I 读不到 0x68：检查 I2C 时钟（100k/400k）、上拉电阻、线路连接
- 第三层数据全 0：检查 MPU6050 是否退出睡眠（写 PWR_MGMT_1 = 0x00）
- 第三层数据溢出（如 ±32767）：量程设置错，检查 init 函数里的 AFS_SEL/GFS_SEL
```

## 编译失败的处理

AI 跑 `cmake --build build/Debug` 失败时的处理：

### 第一步：读错误信息

```bash
cd code/
cmake --build build/Debug 2>&1 | tee /tmp/build_log.txt
```

读错误日志，定位：

- 是哪个文件错？
- 是哪个函数 / 宏 / 类型错？
- 是编译错（语法、类型）还是链接错（undefined reference）？

### 第二步：分类处理

| 错误类型 | 典型信息 | 处理 |
|---|---|---|
| 找不到 HAL 函数 | `undefined reference to HAL_I2C_Init` | hal_conf.h 里没启用 `HAL_I2C_MODULE_ENABLED`，启用它 |
| 找不到 HAL 头文件 | `stm32h7xx_hal_i2c.h: No such file` | CMakeLists.txt 的 include path 漏了，补上 |
| 找不到 CMSIS 宏 | `GPIO_AF7_I2C1 undeclared` | 漏 include `stm32h7xx_hal_gpio_ex.h` |
| 类型不匹配 | `incompatible pointer type` | 检查 HAL API 签名，重新 Read 头文件 |
| 链接错（重复定义） | `multiple definition of ...` | sandbox 和正式代码冲突，删一个 |

### 第三步：自修复循环

```
While (编译失败 && 尝试次数 < 5):
    1. 读错误
    2. 分类
    3. 修复
    4. 重跑 cmake --build

如果 5 次还不行：停下，把错误日志和 AI 的修复尝试总结给用户，问怎么办。
```

**为什么有次数限制**：AI 反复改可能陷入"改一处错就引入新错"的循环。5 次还搞不定说明问题超出 AI 单独解决能力，需要用户介入。

### 第四步：成功后报告

```markdown
## 编译验证

✅ cmake --preset Debug —— 配置通过（GNU arm-none-eabi）
✅ cmake --build build/Debug —— 编译通过

构建产物：
- code/build/Debug/<project>.elf（XX KB code, XX KB data, XX KB RAM）

下一步：烧录 code/build/Debug/<project>.elf 到板子，按"烧录验证清单"逐项确认。
```
