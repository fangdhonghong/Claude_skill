# CMake 维护详解（N4）

本文档解释 AI 如何维护 STM32CubeMX 6.10+ 生成的 CMake 工程。**不要按旧版 CubeMX 的"扁平 add_executable + file(GLOB)"模型工作** —— 6.x 改成了分层 CMake，规则不一样。

## 目录

1. [CubeMX 6.x CMake 真实结构](#cubemx-6x-cmake-真实结构)
2. [顶层 CMakeLists.txt 是 AI 可动的第二个例外](#顶层-cmakeliststxt-是-ai-可动的第二个例外)
3. [加 driver/bsp/middleware/app/sandbox 源文件](#加-driverbspmiddlewareappsandbox-源文件)
4. [启用新 HAL 模块（必须改两处）](#启用新-hal-模块必须改两处)
5. [include path 配置](#include-path-配置)
6. [跨层 include 单向约束的实现](#跨层-include-单向约束的实现)
7. [必须用 cmake --preset](#必须用-cmake---preset)
8. [何时提示用户重跑 cmake](#何时提示用户重跑-cmake)

---

## CubeMX 6.x CMake 真实结构

CubeMX 6.10+ 生成 CMake 工程时是**两层 CMake**：

```
project_root/                              ← AI 工作目录
└── code/                                  ← CubeMX 工程（= .ioc 所在目录）= VSCode 工作区根
    ├── CMakeLists.txt                     ← 顶层主入口（AI 可动，例外 2）
    ├── CMakePresets.json                  ← 定义 Debug/Release preset + 工具链文件
    ├── cmake/
    │   ├── gcc-arm-none-eabi.cmake        ← arm 工具链文件
    │   └── stm32cubemx/
    │       └── CMakeLists.txt             ← CubeMX 子 CMake（AI 不动）
    ├── Core/ Drivers/
    ├── driver/                            ← AI 加（在 code/ 下）
    ├── bsp/                               ← AI 加（在 code/ 下）
    ├── middleware/
    │   ├── protocol/                      ← AI 加（在 code/ 下）
    │   └── utils/                         ← AI 加（在 code/ 下）
    ├── app/                               ← AI 加（在 code/ 下）
    └── ...
```

`code/` 是 CubeMX 工程目录名（用户也可以用项目名如 `cs/`），driver/bsp/middleware/app 永远在 `code/` **里面**（与 Core/ Drivers/ 平级）。从 `code/CMakeLists.txt` 看 driver 是 `driver`（不带 `../`）。

### 顶层 `code/CMakeLists.txt` 长这样（CubeMX 6.17 实测）

```cmake
cmake_minimum_required(VERSION 3.22)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "Debug")
endif()

set(CMAKE_PROJECT_NAME cs)                  # ← 项目名（= .ioc 文件名）
project(${CMAKE_PROJECT_NAME})
enable_language(C ASM)

add_executable(${CMAKE_PROJECT_NAME})
add_subdirectory(cmake/stm32cubemx)          # ← 把 CubeMX 子 CMake 拉进来

target_sources(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user sources here                  # ← CubeMX 给 AI 留的钩子！driver/app 源文件加这
)

target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user defined include paths         # ← 同上，driver/app include path 加这
)

target_compile_definitions(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user defined symbols
)

list(REMOVE_ITEM CMAKE_C_IMPLICIT_LINK_LIBRARIES ob)
target_link_libraries(${CMAKE_PROJECT_NAME}
    stm32cubemx
)
```

**关键事实**：顶层 `CMakeLists.txt` 已经预留了空的 `target_sources` 和 `target_include_directories`，注释明确写着 `# Add user sources here`。AI 在这两个钩子里加内容即可，**不要改其他行**。

### `cmake/stm32cubemx/CMakeLists.txt` 子文件（AI 不动）

这个子文件做三件事：

1. 定义工具链相关的宏（`USE_HAL_DRIVER`、`STM32F103xE`）
2. 把所有 include path 集中（`Core/Inc`、`Drivers/.../Inc`、`CMSIS/.../Include`）
3. **把 HAL 源文件列表硬编码**进 `STM32_Drivers_Src`：

```cmake
set(STM32_Drivers_Src
    ${...}/Core/Src/system_stm32f1xx.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_gpio_ex.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_rcc.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_rcc_ex.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_gpio.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_dma.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_cortex.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_pwr.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_flash.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_flash_ex.c
    ${...}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_exti.c
)
```

**注意**：这个列表**只包含 CubeMX 在 `.ioc` 里勾选过的外设对应的 HAL 模块**。如果你新增了一个外设（比如 USART1，但 `.ioc` 没勾），`stm32f1xx_hal_uart.c` **不在列表里**。这是 CubeMX 6.x 的设计 —— 子目录 CMake 严格按 `.ioc` 状态生成。

> AI 不允许改这个子文件（它是 CubeMX 产物）。新 HAL 模块的源文件加到**顶层** `target_sources`，详见下文"启用新 HAL 模块"。

### `CMakePresets.json`

```json
{
    "version": 3,
    "configurePresets": [
        {
            "name": "default",
            "hidden": true,
            "generator": "Ninja",
            "binaryDir": "${sourceDir}/build/${presetName}",
            "toolchainFile": "${sourceDir}/cmake/gcc-arm-none-eabi.cmake"
        },
        {
            "name": "Debug",
            "inherits": "default",
            "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
        }
    ]
}
```

Preset 干两件事：

1. 指定用 Ninja 生成器
2. 指定 `cmake/gcc-arm-none-eabi.cmake` 为工具链文件（让 cmake 用 arm-none-eabi-gcc 而不是 host gcc）

**所以必须用 `cmake --preset Debug`**。直接 `cmake -B build` 不加载 preset，会用 host gcc，编出 x86 二进制（编译能过但板子跑不了）。

---

## 顶层 CMakeLists.txt 是 AI 可动的第二个例外

`code/` 目录原则上冻结，但顶层 `CMakeLists.txt` 是 AI 允许修改的第二个例外（第一个是 `Core/Inc/stm32xx_hal_conf.h`）。

**为什么允许**：

- 顶层 `CMakeLists.txt` 本质是"工程装配入口"，不是 CubeMX 的核心产物
- CubeMX 已经在里面预留了空的 `target_sources` / `target_include_directories` 钩子，注释 `# Add user sources here`
- AI 不动它的话，`driver/bsp/middleware/app/` 下的代码加不进编译

**AI 可以动的部分**：

- 顶层 `target_sources` 的源文件列表
- 顶层 `target_include_directories` 的 include path
- 顶层 `target_compile_definitions` 的宏定义（仅必要时，比如加 `ARM_MATH_CM7`）

**AI 不能动的部分**：

- `cmake_minimum_required` / `project()` / `set(CMAKE_C_STANDARD 11)`
- `add_subdirectory(cmake/stm32cubemx)`
- `target_link_libraries(... stm32cubemx)`
- `cmake/stm32cubemx/CMakeLists.txt`（整个子文件）
- `CMakePresets.json`（preset 定义）
- `cmake/gcc-arm-none-eabi.cmake`（工具链文件）

---

## 加 driver/bsp/middleware/app/sandbox 源文件

**推荐做法**：在顶层 `code/CMakeLists.txt` 的 `target_sources` 钩子里**显式**加源文件路径。driver/bsp/middleware/app 在 `code/` 里，路径直接写 `driver/foo.c`（不带 `../`）。

```cmake
# 顶层 code/CMakeLists.txt
target_sources(${CMAKE_PROJECT_NAME} PRIVATE
    driver/driver_led.c
    driver/driver_uart.c
    driver/driver_i2c.c
    bsp/bsp_mpu6050.c
    middleware/utils/mw_ring_buffer.c
    middleware/protocol/mw_frame_parser.c
    app/app_cli.c
    app/app_motion.c
)
```

**为什么显式列表而不是 `file(GLOB)`**：

1. **CubeMX 自己用显式列表**（看 `cmake/stm32cubemx/CMakeLists.txt` 的 `STM32_Drivers_Src`），跟随上游风格一致
2. GLOB 在加/删文件后不会自动重跑 cmake，AI 容易忘（即使显式列表，加完文件 AI 也得记得重跑 cmake，但显式列表至少让"什么文件进了编译"一眼可见）
3. 显式列表的修改记录在 git diff 里，方便用户审计"这次 AI 加了哪些源文件"

> 如果项目源文件数量很大（>20 个），可以考虑 GLOB：
>
> ```cmake
> file(GLOB_RECURSE DRIVER_SRC     "${CMAKE_CURRENT_SOURCE_DIR}/driver/*.c")
> file(GLOB_RECURSE BSP_SRC        "${CMAKE_CURRENT_SOURCE_DIR}/bsp/*.c")
> file(GLOB_RECURSE MIDDLEWARE_SRC "${CMAKE_CURRENT_SOURCE_DIR}/middleware/*.c")
> file(GLOB_RECURSE APP_SRC        "${CMAKE_CURRENT_SOURCE_DIR}/app/*.c")
> file(GLOB_RECURSE SANDBOX_SRC    "${CMAKE_CURRENT_SOURCE_DIR}/sandbox/*.c")
> target_sources(${CMAKE_PROJECT_NAME} PRIVATE ${DRIVER_SRC} ${BSP_SRC} ${MIDDLEWARE_SRC} ${APP_SRC} ${SANDBOX_SRC})
> ```
>
> 但 GLOB 加完文件**必须手动重跑 `cmake --preset Debug`**，否则新文件不进编译。SR8 提示用户重跑就是为这个。

---

## 启用新 HAL 模块（必须改两处）

**典型场景**：CubeMX `.ioc` 里没勾 USART1，AI 现在要加 USART1 驱动。

`.ioc` 不能改（SR2），所以走"USER CODE 段手写 HAL_UART_Init + 改 CMake"路径。**必须改两处**：

### 第一处：`code/Core/Inc/stm32xx_hal_conf.h`

取消注释对应模块的 `MODULE_ENABLED` 宏（SR1：只动这类宏）：

```c
// 改前：
/*#define HAL_UART_MODULE_ENABLED   */

// 改后：
#define HAL_UART_MODULE_ENABLED
```

不启用这个宏，`stm32f1xx_hal_uart.c` 里的所有 `HAL_UART_*` 函数会被 `#ifdef` 吞掉，编译时**仍能编过**（因为头文件还在），但**链接时报 undefined reference**。

### 第二处：顶层 `code/CMakeLists.txt` 的 `target_sources`

把对应 HAL 源文件加进去：

```cmake
target_sources(${CMAKE_PROJECT_NAME} PRIVATE
    driver/driver_uart.c
    app/app_cli.c
    ${CMAKE_CURRENT_SOURCE_DIR}/Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_uart.c    # ← 必须加
)
```

**为什么必须加**：`cmake/stm32cubemx/CMakeLists.txt` 的 `STM32_Drivers_Src` 是 CubeMX 按 `.ioc` 状态硬编码的。`.ioc` 没勾 USART，HAL UART 源文件就不在列表里。AI 不能改子目录 CMake（CubeMX 产物），所以只能在顶层补。

**HAL 源文件命名规律**：

| 外设 | HAL 源文件 |
|---|---|
| UART / USART | `stm32<系列>_hal_uart.c`（F1）或 `stm32<系列>_hal_uart.c` + `stm32<系列>_hal_uart_ex.c`（F4/G4/H7） |
| I2C | `stm32<系列>_hal_i2c.c` + `stm32<系列>_hal_i2c_ex.c` |
| SPI | `stm32<系列>_hal_spi.c` + `stm32<系列>_hal_spi_ex.c` |
| TIM | `stm32<系列>_hal_tim.c` + `stm32<系列>_hal_tim_ex.c` |
| ADC | `stm32<系列>_hal_adc.c` + `stm32<系列>_hal_adc_ex.c` |
| CAN | `stm32<系列>_hal_can.c`（F4+；F1 旧版叫 `stm32f1xx_hal_can.c`） |

**查证方法**：到 `code/Drivers/STM32F1xx_HAL_Driver/Src/` 下用 `ls | grep uart` 看实际文件名，**不要凭记忆**。

### 验证清单

启用新 HAL 模块后，自查：

- [ ] `hal_conf.h` 里 `HAL_xxx_MODULE_ENABLED` 已取消注释
- [ ] 顶层 `target_sources` 里已加 `Drivers/.../Src/stm32xx_hal_xxx.c`
- [ ] driver 层代码已写好（`driver_uart.c` 等）
- [ ] 在 `code/` 下跑 `cmake --preset Debug && cmake --build build/Debug` 编译通过，没有 undefined reference

---

## include path 配置

在顶层 `code/CMakeLists.txt` 的 `target_include_directories` 钩子里加（路径不带 `../`，driver/bsp/middleware/app 在 code/ 下）：

```cmake
target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    driver
    bsp
    middleware
    middleware/protocol
    middleware/utils
    app
    sandbox
)
```

这样 `code/Core/Src/main.c` 可以直接 `#include "app_cli.h"`（不必 `#include "../../app/app_cli.h"` —— 虽然 app 在 code/app，main.c 在 code/Core/Src，但 include path 配好后用文件名就够了），driver 层 `#include "driver_led.h"` 也通。

**注意**：`Core/Inc` 和 `Drivers/.../Inc` 已经在 cubemx 子 CMake 里配好了（`MX_Include_Dirs` 变量），顶层**不需要**重复加。

---

## 跨层 include 单向约束的实现

SR6 要求：`app → middleware → bsp → driver`，禁止反向。

**技术实现**：CMake 不直接支持"禁止某层 include 某层"。靠**命名约定 + 代码审查 + AI 自检**：

1. **命名约定**：每层文件名带前缀（`driver_`、`bsp_`、`app_`），一眼看出层级
2. **AI 写代码前自检**：写 `bsp/bsp_mpu6050.c` 时，AI 检查 include 列表，**不允许**出现 `app_*` 开头的头文件
3. **任务日志审计**：在任务日志的"代码改动"里显式列 include 关系，方便用户复核

**自检模板**（写完代码后 AI 跑一遍）：

```
□ driver/ 文件只 include：
   - code/Drivers/.../stm32xx_hal_*.h
   - 同层 driver/*.h
   - 标准库（string.h 等）
□ bsp/ 文件只 include：
   - code/Drivers/.../stm32xx_hal_*.h
   - driver/*.h
   - 同层 bsp/*.h
   - 标准库
□ middleware/ 文件只 include：
   - 同层 middleware/*.h（utils/ 与 protocol/ 互用）
   - 标准库
   - ❌ 禁止：HAL/CMSIS、driver/*.h、bsp/*.h、app/*.h
□ app/ 文件只 include：
   - driver/*.h
   - bsp/*.h
   - middleware/*.h
   - 同层 app/*.h
   - 标准库
```

---

## 必须用 cmake --preset

**正确命令**（在 `code/` 目录下执行）：

```bash
cd code/
cmake --preset Debug              # 配置（生成 code/build/Debug/）
cmake --build build/Debug         # 编译
```

**错误命令**（绝对不能用）：

```bash
cmake -B build                    # ❌ 不加载 preset，用 host gcc
cmake -B build -G Ninja           # ❌ 同上
cmake -B build -S . -G Ninja      # ❌ 同上（即使指定 source dir 也不走 preset）
```

**为什么不走 preset 会出事**：

- `cmake/gcc-arm-none-eabi.cmake` 工具链文件**只在 preset 里通过 `toolchainFile` 字段加载**
- 直接 `cmake -B build` 会用 cmake 找到的第一个 C 编译器（Windows 上通常是 MinGW 或 MSVC），编出 x86/x64 二进制
- 这个二进制**编译能过、链接能过**，但**烧到板子完全跑不了**（指令集都不对）

**怎么自查**：跑 `cmake --preset Debug` 后看输出第一行，应该出现：

```
-- The C compiler identification is GNU 13.3.1
-- Check for working C compiler: .../arm-none-eabi-gcc.exe - skipped
```

如果看到 `D:/C/bin/gcc.exe` 或 `cl.exe`（MSVC）—— 立刻清掉 `build/` 目录，重新走 preset。

清掉重来：

```bash
cd code/
rm -rf build/
cmake --preset Debug
cmake --build build/Debug
```

### preset 名字

CubeMX 默认生成两个 preset：

- `Debug`（默认推荐，带 `-g -O0`）
- `Release`（带 `-Os`）

如果用户的 `CMakePresets.json` 改过 preset 名，按实际名字用。

---

## 何时提示用户重跑 cmake

**SR8 触发条件**：

- 在 `driver/bsp/middleware/app/sandbox/` 下**新增** `.c` 文件
- 在 `driver/bsp/middleware/app/sandbox/` 下**删除** `.c` 文件
- 在 `driver/bsp/middleware/app/sandbox/` 下**重命名** `.c` 文件
- 在顶层 `code/CMakeLists.txt` 的 `target_sources` 里加了新的 HAL 源文件（如新启用 UART 模块）

**不触发**（不需要提示重跑）：

- 只修改 `.c` 或 `.h` 文件内容（增量编译会处理）
- 新增 `.h` 文件（include path 不变）

**提示语模板**：

> 我新增了 driver/driver_uart.c 和 app/app_cli.c，并在顶层 code/CMakeLists.txt 的 target_sources 里追加了它们。需要在 `code/` 下重跑 cmake 让新文件生效：
>
> ```bash
> cd code/
> cmake --preset Debug
> cmake --build build/Debug
> ```
>
> 我已经替你跑了第一遍，编译通过 ✅。但下次你自己加文件时记得重跑 cmake。

**注意**：AI 自己跑编译时（Step 6）会自动包含 cmake 配置阶段（`--preset Debug` 会重新走一遍 configure），所以 AI 加完文件跑 `cmake --preset Debug && cmake --build build/Debug` 就行。这条提示主要是给用户**未来手动加文件**时提个醒。
