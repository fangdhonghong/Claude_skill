# 项目演进详解（N6）

本文档解释项目初始化、HARDWARE.md 同步、上下文重建等长期演进机制。

## 目录

1. [项目初始化流程](#项目初始化流程)
2. [上下文重建流程](#上下文重建流程)
3. [HARDWARE.md 同步强规则](#hardwaremd-同步强规则)
4. [HARDWARE.md 各表格的含义](#hardwaremd-各表格的含义)
5. [PROJECT.md 维护](#projectmd-维护)
6. [搁置后回归的特殊处理](#搁置后回归的特殊处理)
7. [迭代时的死代码对冲](#迭代时的死代码对冲)

---

## 项目初始化流程

**触发条件**：用户第一次让 AI 在某个目录做 STM32 开发，且该目录没有 `PROJECT.md`。

**流程**：

### Step 1：检查现有状态

```bash
ls project_root/
```

- 有 `code/` + `code/*.ioc` → 用户已跑过 CubeMX，进入 Step 3
- 没有 `code/` → 提示用户先用 CubeMX 生成骨架，进入 Step 2
- 有 `PROJECT.md` → 不是初始化场景，跳到"上下文重建流程"

> 用户也可能把 CubeMX 工程目录起名为 `cs/`、`myapp/` 等（不叫 code/）。这时 `cs/` 扮演 code/ 的角色。本 skill 文档统一写 `code/`，遇到实际项目按 PROJECT.md 的"工程根"字段（详见 PROJECT.md.tmpl）映射到实际目录名。

### Step 2：引导用户跑 CubeMX（如果没有 code/）

向用户输出操作指引：

```
开始一个新 STM32 工程前，请先用 STM32CubeMX 产骨架：

1. 打开 STM32CubeMX
2. 选 MCU 型号（或开发板）
3. 配时钟树（SystemClock）
4. Project Manager → Project：
   - Project Name: code（或你的项目名）
   - Toolchain / IDE: **CMake**
   - Code Generator → 勾选 "Copy all the libraries into the project folder"
   - 把生成路径设到 <project_root>/code/（未来的 driver/bsp/app 等会建在 code/ 里）
5. 点 GENERATE CODE

完成后告诉我，我接着帮你写 PROJECT.md 和初始化目录骨架。
```

### Step 3：引导用户写 PROJECT.md

用 AskUserQuestion（或直接发问）问：

```
开始写项目档案。请回答：

1. 项目目标一句话是什么？（例："通过 USART3 接收命令控制核心板 LED"）

2. 你计划的婴儿步路线图？（例：
   - 步骤 1：流水灯试 LED（脚手架）
   - 步骤 2：串口回显试 UART（脚手架）
   - 步骤 3：串口控 LED（正式功能））

3. 关键硬件约束？（例："板子是 WeAct Studio H7"，"LED 在 PC0-PC7"）

4. CubeMX 工程目录名是？（如果你起的不是 code/，记下来填到 PROJECT.md 的"工程根"字段）
```

拿到回答后，用 `assets/PROJECT.md.tmpl` 生成 `PROJECT.md`。

### Step 4：创建目录骨架

```bash
mkdir -p driver bsp app sandbox hw/datasheets tasks
```

### Step 5：创建 HARDWARE.md

用 `assets/HARDWARE.md.tmpl` 创建空的 `HARDWARE.md`。

填入 CubeMX 已有的信息：

- MCU 型号（从 `code/Core/Src/main.c` 顶部注释或 `code/Drivers/CMSIS/.../stm32xx.h` 看）
- 时钟配置（从 `code/Core/Src/main.c::SystemClock_Config()` 读）
- CubeMX 已经启用的外设（如果有）

### Step 6：改 code/CMakeLists.txt

按 `references/cmake.md` 的说明，在顶层 `target_sources` 钩子追加 `driver/*.c` 等源文件（不带 `../`），在 `target_include_directories` 钩子追加 `driver bsp app sandbox` 等 include path。**不要动** `add_subdirectory(cmake/stm32cubemx)` 和其他 CubeMX 自动生成的部分。

### Step 7：验证工具链

```bash
arm-none-eabi-gcc --version
cmake --version
```

缺失就提示用户装。

### Step 8：跑一次编译验证骨架

```bash
cd code/
cmake --preset Debug
cmake --build build/Debug
```

骨架默认能编（CubeMX 一次性产的就是能编的）。如果编不过，可能是 CMakeLists.txt 改错或工具链问题，定位修。

**注意**：必须用 `cmake --preset Debug`，不能直接 `cmake -B build`。直接后者会用 host gcc 编出 x86 二进制。详见 `references/cmake.md`。

完成后告诉用户：

```
项目初始化完成 ✅

工程结构（两层）：
- project_root/             你的工作目录
  - .claude/                Claude Code 配置
  - code/                   CubeMX 工程 = VSCode 工作区根
    - Core/ Drivers/ cmake/ CMakeLists.txt 等 CubeMX 产物
    - driver/bsp/app/       正式代码层（空，按需添加）
    - sandbox/              脚手架代码（空）
    - hw/datasheets/        外设 datasheet（空）
    - tasks/                任务日志（空）
    - HARDWARE.md           硬件配置真相源
    - PROJECT.md            项目目标 + 进度

接下来你可以直接说"先跑流水灯试 LED"或"加 MPU6050 驱动"等，我按 strict-stm32 工作流处理。
```

## 上下文重建流程

**触发条件**：用户开始一个新会话、或者会话中间换了任务主题。

**流程**：

### Step 1：Read 项目级文档

```bash
Read PROJECT.md
Read HARDWARE.md
```

**PROJECT.md 不存在** → 进入"项目初始化流程"。

### Step 2：浏览最近任务

```bash
Glob tasks/*.md
```

读最近 3-5 个任务的标题和状态。**不需要读全文**，扫一眼知道最近做了什么即可。

### Step 3：浏览代码结构

```bash
Glob driver/*.c bsp/*.c app/*.c sandbox/*.c
```

看每层有哪些文件，对项目代码结构有概览。

### Step 4：构建认知

把以上信息综合成一句话认知，告诉自己（在 thinking 里）：

```
这是一个 [项目目标] 项目，[当前进度]。
最近做了 [最近任务]。
driver/ 有 [...]，bsp/ 有 [...], app/ 有 [...]。
现在用户说 [新任务]，对应 [脚手架/正式] 任务类型，可能影响 [哪些层]。
```

**为什么这么做**：用户几个月后回来，AI 没有跨会话记忆。这一步让 AI 在 30 秒内追上项目状态，省去用户重新解释背景的成本。

## HARDWARE.md 同步强规则

**SR7**：任何修改硬件配置的任务，结束前必须同步更新 `HARDWARE.md`。不更新视为任务未完成。

### "修改硬件配置"的定义

| 改动 | 是否触发同步 |
|---|---|
| 启用新外设（如启用 I2C1） | ✅ |
| 禁用外设 | ✅ |
| 改外设引脚（PA2 → PD8） | ✅ |
| 改外设参数（波特率 9600 → 115200） | ✅ |
| 改中断优先级 | ✅ |
| 启用/禁用 DMA 通道 | ✅ |
| 改外设芯片配置（如 MPU6050 量程从 ±8g → ±16g） | ✅ |
| 改 app 层业务逻辑（不改硬件） | ❌ |
| 改 bsp 层算法（不改硬件） | ❌ |
| 改 sandbox 代码 | ❌（脚手架不更新 HARDWARE.md） |

### 同步流程

每次任务结束前（Step 7）：

1. 找出本次任务对硬件配置的所有改动
2. 在 `HARDWARE.md` 对应表格里**追加**或**修改**条目
3. 在条目后标日期

### 例：加 USART3

任务前 `HARDWARE.md` 的外设配置表：

```
| 外设 | 实例 | 引脚 | 关键参数 | 启用日期 |
|---|---|---|---|---|
```

任务后：

```
| 外设 | 实例 | 引脚 | 关键参数 | 启用日期 |
|---|---|---|---|---|
| UART | USART3 | PD8(TX)/PD9(RX) | 115200 8N1 无流控 | 2026-07-16 |
```

中断分配表也同步：

```
| IRQ | 用途 | 优先级（抢占:子） |
|---|---|---|
| USART3_IRQn | 串口接收 | 5:0 |
```

## HARDWARE.md 各表格的含义

完整结构见 `assets/HARDWARE.md.tmpl`，这里解释每个表格的用途：

### MCU

记型号 / Revision / 主频。Revision 信息从芯片丝印或 `DBGMCU.IDCODE` 寄存器读。**为什么记 Revision**：不同 Rev 的芯片有不同 errata，影响某些外设用法。

### 时钟

记 HSE 频率、PLL 配置、SYSCLK、AHB/APB1/APB2 频率。来自 CubeMX 一次性生成，**AI 不动**。

**为什么记**：很多外设的计算依赖时钟（比如 UART 波特率 = APBx / 分频）。把它写进 HARDWARE.md，AI 算外设参数时有依据。

### 外设配置表

每个外设一行，记：实例、引脚、关键参数、启用日期。

这是最常更新的表格。每次加/改外设都要同步。

### 中断分配表

记 IRQ 号、用途、优先级。

**为什么单独列表**：STM32 优先级资源有限（4-bit 共 16 级），多个外设的优先级要**全局协调**，不能各自为政。这张表让 AI 加新中断时能看全局。

### DMA 通道分配表

类似中断分配表。STM32 的 DMA 通道资源有限（H7 上 DMA1/DMA2 各 8 流），需要全局协调。

### 外设芯片地址表

I2C/SPI 总线上的外设芯片。记芯片名、总线、地址、备注（如 AD0 拉低）。

**为什么单独列表**：同一 I2C 总线上多个芯片时，地址不能冲突。这张表让 AI 加新芯片时检查冲突。

## PROJECT.md 维护

### 何时更新 PROJECT.md

| 场景 | 更新哪个字段 |
|---|---|
| 完成一个婴儿步 | "婴儿步路线图"勾选完成项 |
| 发现要加新婴儿步 | "婴儿步路线图"追加新步骤 |
| 做出影响选型的决策 | "关键决策摘要"追加 |
| 完成一个任务 | "历史任务索引"追加 |

### 关键决策摘要的写法

只记**影响选型**的决策，不记技术细节：

✅ 好的写法：

```
- 2026-07-16 选 USART3 + PD8/PD9：原理图上 PA9/PA10 被 ST-LINK 占用
- 2026-07-16 MPU6050 AD0 拉低（地址 0x68）：板子默认设计
- 2026-07-17 加速度量程 ±8g：项目用于无人机姿态，需要兼顾冲击容忍
```

❌ 不好的写法（细节进任务日志就够）：

```
- 2026-07-16 在 bsp_mpu6050.c 第 47 行调用 HAL_I2C_Master_Transmit_IT，超时设为 100ms
```

### 历史任务索引的写法

按时间倒序或正序，简短记：

```
- 2026-07-16 led-test        [脚手架] ✅ 验证通过
- 2026-07-16 uart-echo       [脚手架] ✅ 验证通过
- 2026-07-16 uart-ctrl-led   [正式]   ⚠️ 编译通过，未实测
- 2026-07-17 mpu6050-driver  [正式]   ✅ 完整验证通过
```

## 搁置后回归的特殊处理

用户几个月后回来，可能发生：

### 情况 1：HARDWARE.md 和代码不一致

如果 AI 发现 HARDWARE.md 说的配置和代码不符（比如 HARDWARE.md 说 USART3 115200，但代码里是 9600）：

**处理**：以**代码**为准（代码是事实），更新 HARDWARE.md。然后告诉用户："HARDWARE.md 和代码不一致，我已按代码同步 HARDWARE.md。可能是上次有任务忘了同步，建议下次任务前核对一下。"

### 情况 2：忘记项目进度

如果用户说"我忘了这个项目做到哪了"：

**处理**：Read PROJECT.md 后，给用户一个简短的进度回顾：

```
项目：[目标]
进度：婴儿步路线图 3 步，已完成 2 步（流水灯 + 串口回显），第 3 步（串口控 LED）未完成。
最近任务：2026-07-16 uart-echo ✅
未完成原因：（看 PROJECT.md 和最近任务推断）
```

### 情况 3：tools/工具链变了

如果用户换了电脑、重装了工具链：

**处理**：第一次跑编译时验证 `arm-none-eabi-gcc --version` 和 `cmake --version`，提示用户装好。

## 迭代时的死代码对冲

每次修改**现有文件**（不是新建）后，AI 主动扫描：

- 该文件本身
- 该文件直接相关的几个文件（include 关系）

列出"可能可以删除的死代码"：

| 类型 | 例 |
|---|---|
| 注释掉的旧实现 | `// void old_init() { ... }` 整段注释 |
| 未使用的 include | `#include "xxx.h"` 但文件里没用 xxx 的符号 |
| 未使用的宏 | `#define FOO 1` 但代码里没引用 FOO |
| 孤立的 static 函数 | `static void helper()` 但没人调用 |
| TODO/FIXME 标记 | `// TODO: rewrite this` |

**处理**：列出来给用户看，**由用户决定删不删**。AI **不强制清理**。

**为什么**：

- 学生项目没有 lint 工具链，靠 AI 主动扫
- 但强制清理风险大（AI 可能误删还在用的代码）
- 所以走"AI 提示 + 用户决策"模式

输出格式：

```markdown
## 死代码扫描

我在修改 bsp/bsp_mpu6050.c 时发现以下可能可以清理：

1. `bsp_mpu6050.c:45` —— 注释掉的旧版 `mpu6050_read_polled()`（已被中断版替代）
2. `bsp_mpu6050.c:12` —— `#include "driver_uart.h"` 但代码里没用 UART
3. `bsp_mpu6050.h:23` —— `#define MPU6050_DEBUG 0` 但代码里没引用

要我清理吗？默认不动，你决定。
```
