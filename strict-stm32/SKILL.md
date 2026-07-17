---
name: strict-stm32
description: STM32 嵌入式开发的强约束工作流 skill。基于"CubeMX 一次性产骨架 + AI 增量演进"架构，反幻觉（写代码前必读 HAL/CMSIS 头文件不凭记忆）、对话式询问关键硬件决策、HARDWARE.md 作为真相源强制同步。任何 STM32 工程需要添加外设（USART/I2C/SPI/ADC/TIMER/DMA/CAN/USB/QSPI）、写 driver/bsp/app 代码、修改硬件配置、集成传感器或显示器芯片时都应使用本 skill。即使用户没说"用 skill"，只要任务涉及 STM32 外设驱动、传感器 BSP、应用层业务逻辑实现，都应触发本 skill。新手配置第一个 LED 闪烁、老手做陀螺仪姿态解算，都走同一套工作流。
---

# strict-stm32

## 这个 skill 解决什么问题

STM32 嵌入式开发里，AI 凭记忆写底层代码的幻觉风险极高 —— 寄存器位配错、引脚 AF 选错、时钟使能漏调，任何一个都会让板子跑不起来。本 skill 用一套强约束工作流把 AI 锁在"读真值、问决策、留日志"的轨道上。

核心架构（来自 6 轮 logic-whetstone 决策审计）：

- **CubeMX 一次性产骨架**（MCU + 时钟 + CMake + 复制全量库）
- **AI 接管后续演进**：手写 HAL/LL 代码 + 维护 CMake
- **`.ioc` 冻结**，`HARDWARE.md` 作为硬件配置真相源

## 术语：project_root 和 code/

本 skill 工程是**两层目录**结构：

- **`project_root/`** —— AI 工作目录（用户 shell 的 cwd），只放 `.claude/`（Claude Code 配置）和 `code/`
- **`project_root/code/`** —— CubeMX 工程目录（= `.ioc` 所在目录）= VSCode 工作区根 = CMake 项目根。**所有 AI 写的代码和文档都加在这里**（driver/bsp/app/sandbox/hw/tasks/HARDWARE.md/PROJECT.md）。`code/` 是 skill 文档里的占位名，用户实际项目可以叫 `cs/` `myapp/` 等 —— 但 driver/bsp/app 等 AI 加的内容**永远在 code/ 里面**，不在 project_root 下与 code/ 平级
- **`project_root/code/Core/Inc`、`Core/Src`、`Drivers`、`cmake/`** —— CubeMX 6.10+ 的内部分层

**为什么 AI 加的内容放进 code/ 里**：

1. **VSCode 工作区一致性**：CMakeLists.txt 在 `code/`，用户用 VSCode 打开 `code/` 作为工作区根时，IntelliSense 才能索引到 driver/bsp/app 下的代码。如果放在 project_root 下与 code/ 平级，VSCode 打开 code/ 就看不到它们
2. **CMake 相对路径简化**：driver/bsp/app 在 code/ 下，CMake 直接写 `driver/driver_led.c`，不用 `../driver/driver_led.c`
3. **项目结构紧凑**：所有项目相关的东西在 code/ 里，project_root 只剩 `.claude/`，干净

**代价**：失去了"AI 代码与 CubeMX 产物的物理隔离"。但 CubeMX 重新生成时只动它自己生成的文件（`Core/` `Drivers/` `<project>.ioc` 等），不会动 AI 加的 `code/driver/` `code/bsp/` 这些目录 —— 实践中误伤风险很低。

> 用户在 CubeMX Project Manager 里把"Toolchain / IDE"选 CMake，"Project Name"填 `code`（或项目名如 `cs`），生成路径设到 `<project_root>/code/`。

## 工程结构

```
project_root/                       # = AI 工作目录 = 用户 shell cwd
├── .claude/                        # Claude Code 配置（不动）
└── code/                           # CubeMX 工程目录（= .ioc 所在目录）= VSCode 工作区根
    ├── <project>.ioc               # CubeMX 配置（冻结，SR2）
    ├── CMakeLists.txt              # ← 顶层主入口（AI 可动，例外 2）
    ├── CMakePresets.json           # ← 必须用 cmake --preset <name> 才走 arm 工具链
    ├── Core/                       # CubeMX 6.x 产物
    │   ├── Inc/
    │   │   ├── main.h
    │   │   ├── stm32xx_hal_conf.h  # ← AI 可动（例外 1：只动 MODULE_ENABLED）
    │   │   └── stm32xx_it.h
    │   └── Src/
    │       ├── main.c              # ← AI 只在 USER CODE 段动
    │       ├── gpio.c / dma.c / ...# ← CubeMX 生成的外设 init（如启用）
    │       ├── stm32xx_hal_msp.c   # ← 保持 CubeMX 空函数
    │       ├── stm32xx_it.c        # ← AI 只在 USER CODE 段加 IRQHandler
    │       ├── system_stm32xx.c    # ← AI 不动
    │       ├── syscalls.c / sysmem.c
    │       └── stm32xx_hal_timebase_tim.c  # 如果 HAL 时间基准用 TIM（非默认）
    ├── Drivers/                    # CubeMX 产物（HAL/CMSIS 静态库，AI 只读，SR4）
    │   ├── CMSIS/
    │   └── STM32F1xx_HAL_Driver/
    ├── cmake/
    │   └── stm32cubemx/
    │       └── CMakeLists.txt      # ← CubeMX 子 CMake，硬编码 HAL 源列表，AI 不动
    ├── startup_stm32xxx.s          # CubeMX 产物（启动文件，AI 不动）
    ├── STM32xxxxx_FLASH.ld         # CubeMX 产物（链接脚本，AI 不动）
    │
    ├── driver/                     # AI 加（正式：通用驱动，如 driver_i2c.c）
    ├── bsp/                        # AI 加（正式：外设芯片驱动，如 bsp_mpu6050.c）
    ├── app/                        # AI 加（正式：业务逻辑）
    ├── sandbox/                    # AI 加（脚手架：婴儿步验证用）
    ├── hw/
    │   └── datasheets/             # AI 加（外设 datasheet）
    ├── tasks/                      # AI 加（任务级日志）
    ├── HARDWARE.md                 # AI 加（硬件配置真相源）
    └── PROJECT.md                  # AI 加（项目目标 + 婴儿步路线图）
```

> `code/` 是 skill 文档里的占位名。用户实际项目可以叫 `cs/` `myapp/` 等任意名字 —— CubeMX Project Manager 里的"Project Name"填什么，目录就叫什么。下方所有规则里的 `code/` 都按这个理解。

## 工作流（每次任务按此跑）

### Step 0 — 上下文重建

接到任何 STM32 任务的第一件事，先重建项目认知：

1. Read `code/PROJECT.md` — 理解项目目标和当前进度
2. Read `code/HARDWARE.md` — 理解硬件配置
3. Glob `code/tasks/*.md`，浏览最近 5 个任务 — 理解最近做了什么

**为什么**：用户可能几个月后回来继续做。AI 没有跨会话记忆，但这三个文件是项目的"自描述"。这一步让 AI 在 30 秒内追上项目状态，省去用户重新解释背景的成本。

### Step 1 — 项目初始化检查

如果 `code/PROJECT.md` 不存在 → 进入初始化流程：

1. 引导用户写 `code/PROJECT.md`（问：项目目标一句话？婴儿步路线图？）
2. 在 `code/` 下创建目录骨架：`driver/ bsp/ app/ sandbox/ hw/datasheets/ tasks/`（**6 个目录必须同时建**，即使 `bsp/` 等暂时为空也要建占位，SR13）
3. 用 `assets/HARDWARE.md.tmpl` 创建空 `code/HARDWARE.md`
4. 提示用户：打开 STM32CubeMX，选 MCU，配时钟树，**选 CMake + 复制所有库**，生成路径设到 `project_root/code/`（Project Name 填 `code` 或项目名 `cs` 等任意）

### Step 2 — 任务类型识别

| 用户说 | 任务类型 | 代码归属 |
|---|---|---|
| "先试 / 试一下 / 验证 / test / check / 看看 XX 行不行" | 脚手架 | `sandbox/` |
| "加 / 实现 / 写一个 XX 驱动 / 功能" | 正式功能 | `driver/` `bsp/` `app/` |

不确定就反问："这是脚手架验证，还是要写成正式代码？"

**为什么**：婴儿步是嵌入式开发的最佳实践（先验证最底层硬件 OK，再叠功能）。但脚手架代码最终要删，必须和正式代码物理隔离，否则几个月后回看项目，会被一堆临时验证代码污染。

### Step 3 — 知识收集（反幻觉核心）

写任何 `driver/` `bsp/` 代码前，**必须**先 Read：

1. `code/Drivers/<芯片系列>_HAL_Driver/Inc/<对应外设>.h` — HAL API 真值
2. `code/Drivers/CMSIS/Device/ST/<芯片系列>/Include/stm32<系列>.h` — 寄存器基地址宏
3. `code/Drivers/<芯片系列>_HAL_Driver/Inc/stm32<系列>_hal_gpio_ex.h` — GPIO AF 编号宏

写 `bsp/`（外设芯片）代码前，还要：

4. 查 `code/hw/datasheets/` 是否有对应 PDF
   - 有 → Read 后写
   - 无 → **反问用户**："写 MPU6050 驱动需要 datasheet，请把 PDF 放到 `code/hw/datasheets/` 或给路径。"
   - 不允许凭训练记忆写冷门芯片

**为什么**：AI 凭记忆写 STM32 底层代码是幻觉的主要来源 —— `USART2` 基地址、`GPIO_AF7` 在 H7 和 F4 上完全不一样。HAL 库源码（由 CubeMX 复制到 `code/Drivers/`）是 ST 官方验证过、与芯片 errata 同步的零幻觉知识源。强制读它就是反幻觉。

详见 `references/anti-hallucination.md`。

### Step 4 — 内部自检 + 对话式询问

写代码前，AI 内部逐项核对以下 7 项决策点。每项必须能在 (a) 用户请求 (b) `code/HARDWARE.md` (c) `code/hw/datasheets/` 中找到答案。缺哪项就**对话式**问哪项，每问必带理由：

```
□ 外设实例号      （USART1 vs USART2 vs ...）
□ 引脚选择        （PA2/PA3 / PB6/PB7 / ...）
□ 关键参数        （波特率 / 速率 / 量程 / 分辨率 / 数据位停止位校验）
□ 是否用中断/DMA  （polled / IT / DMA）
□ 中断优先级      （抢占 : 子优先级）
□ 板级连接        （外设芯片 SCL/SDA 接哪？ADDR 引脚拉高/低？）
□ 用量约束        （量程范围、最大速率、电源约束等影响配置的边界）
```

**为什么**：AI 容易"未知的未知" —— 比如 AI 默认 8N1 串口，但用户的应用需要 8E1；AI 不觉得自己不知道，就不问。把决策点列死作为兜底，但又不能像填表一样抛给用户，所以走工程师式的对话："我看了一下 datasheet 和你的需求，在开始写之前要确认几个点..."

### Step 5 — 写代码

按任务类型分发：

**脚手架任务**：`sandbox/<name>.c` 自由写，不受 USER CODE 限制。

**正式功能任务**：

- `driver/` `bsp/` `app/` 自由写（创建新文件）
- `code/Core/Src/main.c` 只在 `/* USER CODE BEGIN x */ ... /* USER CODE END x */` 段加调用
- `code/Core/Src/stm32xx_it.c` 只在 USER CODE 段加 IRQHandler
- `code/Core/Inc/stm32xx_hal_conf.h` 只动 `#define HAL_xxx_MODULE_ENABLED` 这类宏（其他不碰）
- 跨层 include 单向：`app → bsp → driver`，反向禁止
- 共享外设（如 I2C1）单例：`bsp/` 层禁止直接碰 `hi2c1` 句柄，必须通过 `driver_i2c_*()` API
- **代码风格**：禁用泛化变量名（`temp` / `flag` / `data` / `count` / `val`），注释遵守奥斯特豪特原则（详见 SR11/SR12）

**启用新外设时还必须**（CubeMX 没生成的情形）：

1. 在 `code/Core/Inc/stm32xx_hal_conf.h` 取消注释对应 `HAL_xxx_MODULE_ENABLED`
2. 在 `code/CMakeLists.txt` 的顶层 `target_sources` 里追加 `Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_uart.c` 这类 HAL 源文件（**cubemx 子目录 CMake 把 HAL 源列表硬编码了，新增模块不在里面**）
3. 详细操作见 `references/cmake.md`

**为什么 `hal_conf.h` 只动 MODULE_ENABLED**：这个文件还含晶振值（HSE_VALUE）、Tick 优先级、HAL 时间基准等 CubeMX 算好的关键配置，动错就时钟崩。

详见 `references/architecture.md`。

### Step 6 — 编译验证

写完后**主动**跑（在 `code/` 目录下执行）：

```bash
cd code/
cmake --preset Debug          # 走 CMakePresets.json 里指定的 gcc-arm-none-eabi.cmake 工具链
cmake --build build/Debug
```

**绝对不能直接 `cmake -B build`** —— 这样会用 host gcc 编译成 x86 二进制，编出"看起来对但完全跑不了"的产物。

编不过自己改，直到编过。前置：启动时验证 `arm-none-eabi-gcc --version` 和 `cmake --version` 都能跑，跑不通就提示用户装工具链。

**为什么**：编译过 ≠ 板子能跑，但编译不过 = 一定跑不了。AI 自己跑编译能在交付前抓掉低级错误（undefined reference、类型不匹配、漏 include），省用户大量调试时间。

详见 `references/verification.md`。

### Step 7 — 强制同步 HARDWARE.md

如果本次任务改了硬件配置（启用/禁用外设、改引脚、改参数、改量程、改波特率），**任务结束前必须**更新 `code/HARDWARE.md`。不更新视为任务未完成。

`HARDWARE.md` 结构见 `assets/HARDWARE.md.tmpl`。

**为什么**：`HARDWARE.md` 是这个工程的硬件配置真相源（`.ioc` 已冻结）。如果 AI 改了代码但忘了改 `code/HARDWARE.md`，几个月后用户回看时 `code/HARDWARE.md` 就是谎言，比没有还糟。

详见 `references/evolution.md`。

### Step 8 — 同步 PROJECT.md

如果本次任务对应婴儿步的进度变化（完成一步、新增一步、调整方向），更新 `code/PROJECT.md` 的：

- "婴儿步路线图"（勾选完成项 / 加新步骤）
- "关键决策摘要"（记影响选型的决策，如"选 USART3 是因为原理图 PA9 被 ST-LINK 占"）
- "历史任务索引"（追加本次任务条目）

### Step 9 — 输出任务日志

写 `code/tasks/<YYYY-MM-DD>-<任务名>.md`，记录：

- 信息源（Read 过的 HAL/datasheet 文件路径）
- 用户决策（来自对话，标日期）
- AI 决策（每条带文件路径或行号引用）
- 代码改动（新增/修改的文件列表）
- 烧录验证清单（最小验证步骤）
- 状态（✅ 编译通过 / ⚠️ 硬件未测试）

模板见 `assets/task.md.tmpl`。

**为什么**：用户审计一份决策日志 5 分钟搞定，比读 500 行 C 代码快 10 倍。每条决策带来源让幻觉无处藏身 —— 如果某条 AI 决策没有文件路径支撑，用户一眼能看出。

### Step 10 — 提示

根据本次任务情况，主动给用户以下提示（适用的才提示）：

- 加/删了 `code/driver/bsp/app/sandbox/` 下 `.c` 文件 → "需要重跑 `cmake --preset Debug && cmake --build build/Debug` 才会让文件列表生效"
- 启用了新的 `HAL_xxx_MODULE_ENABLED` 宏但忘了补 HAL 源 → 自查顶层 `target_sources` 是否含对应 `stm32f1xx_hal_uart.c` 等
- 脚手架任务完成 → "code/sandbox/ 里的脚手架代码是否清理？"
- 有死代码（注释掉的旧实现、未使用的 include、孤立的 static 函数）→ 列出来让用户决定删不删，**不强制清理**
- 有“硬件未测试”项 → “请烧录验证，按烧录验证清单逐项确认”

## 代码风格约束

写 `code/driver/bsp/app/` 代码时必须遵守两条风格规则。和架构约束（SR1–SR10、SR13）不同，这两条是**可读性**约束，但同样强制。

### 窄命名原则（Narrow Names，SR11）

禁止使用无具体物理量或业务语义的泛化变量名。

**禁用清单**：`temp` / `flag` / `data` / `count` / `val`。

**启用示范**：

| 禁用 | 启用 |
|---|---|
| `temp` | `current_celsius`（当前摄氏度） |
| `flag` | `bus_busy_flag`（总线忙标志） |
| `count` | `uart_rx_byte_count`（串口接收字节数） |
| `data` | `accel_x_raw`（加速度 X 轴原始值） |
| `val` | `pwr_mgmt1_value`（PWR_MGMT_1 寄存器值） |

**判定原则**：变量名必须能让读者**不看声明、不读上下文**就推断出它承载的物理量或业务语义。循环计数器 `i/j/k` 在 < 10 行作用域内例外。

### 奥斯特豪特注释原则（Ousterhout Comments，SR12）

注释按“在哪一层”区分职责。

**头文件 `.h` —— 关注 What（接口契约）**：说明接口**做什么**、**怎么用**、**边界条件**。严禁泄露实现细节。

```c
// 获取当前空气的物理温度（℃）。
// 若传感器掉线，函数将返回上一次读取的有效值。
float Bsp_TempSensor_GetCelsius(void);
```

**源文件 `.c` —— 关注 Why（设计意图）**：解释代码背后**不明显的决策** —— 硬件限制、规避措施、协议细节、魔法数字来源。严禁逐行翻译代码。

```c
// 硬件设计限制：在外设启动前需要等待至少 2ms 确保电荷泵电容稳定充电
HAL_Delay(2);
```

**判定原则**：删掉这条注释后读者会困惑“为什么这么写”？→ 保留。删掉后照样能看懂？→ 删掉（噪音注释）。

## 强规则速查表（SR1-SR13）

这 13 条是工作流里反复出现的硬约束，列在这里方便快速参考。完整 why 见各 reference 文件。

| ID | 规则 |
|---|---|
| SR1 | 改 `code/Core/Inc/stm32xx_hal_conf.h` 只动 `#define HAL_xxx_MODULE_ENABLED` 这类宏，其余一律不碰 |
| SR2 | 禁止在 CubeMX 内启用/修改任何外设。CubeMX 仅用于首次工程生成 |
| SR3 | 禁止修改 `code/Core/Src/main.c::SystemClock_Config()`。时钟改动强制走"重新跑 CubeMX"流程 |
| SR4 | 写 `driver/` 或 `bsp/` 前必须先 Read `code/Drivers/` 下对应 HAL/CMSIS 头文件，基于真值写代码 |
| SR5 | `bsp/` 层禁止直接碰外设句柄（`hi2c1` / `huart2` / ...），必须通过 `driver/` 层 API |
| SR6 | include 单向：`app → bsp → driver`。bsp 不允许 include app，driver 不允许 include bsp |
| SR7 | 任何修改硬件配置的任务，结束前必须同步更新 `code/HARDWARE.md`。不更新视为任务未完成 |
| SR8 | 加/删 `code/driver/bsp/app/sandbox/` 下 `.c` 文件后，必须显式提示用户在 `code/` 下重跑 `cmake --preset Debug && cmake --build build/Debug` |
| SR9 | 关键硬件决策缺失时必须对话式询问，每问必带理由，不允许默认值 |
| SR10 | 不允许凭训练记忆写冷门外设芯片，必须先查 `code/hw/datasheets/`，无则问用户要 PDF |
| SR11 | 禁用泛化变量名（`temp` / `flag` / `data` / `count` / `val`），必须用承载物理量或业务语义的窄命名 |
| SR12 | 头文件 `.h` 注释只写 What（接口契约），源文件 `.c` 注释只写 Why（设计意图），严禁逐行翻译代码 |
| SR13 | 项目代码必须按 `app/bsp/driver` 三层组织。项目初始化时三个目录必须同时建（即使 `bsp/` 暂时空着也要建占位）。业务代码不许跳过 `bsp/` 直接 driver ↔ app —— 即使当前只有 LED/UART 这种 MCU 内部外设，也要走 `app → driver`，等接外部芯片时 `bsp/` 自然填上，分层骨架一开始就立起来 |

## Reference 索引（按需读，不要一开始就全读）

| 文件 | 何时读 |
|---|---|
| `references/architecture.md` | 第一次接触本工程，或需要理解分层/code 例外/共享外设单例时 |
| `references/anti-hallucination.md` | 写 driver/bsp 前，或要确认必问清单/对话式询问示例时 |
| `references/cmake.md` | 涉及加源文件、改 CMakeLists、include 配置、启用新 HAL 模块时 |
| `references/verification.md` | 编译验证流程、任务分类（脚手架 vs 正式）、烧录验证清单格式 |
| `references/evolution.md` | 项目初始化、搁置后回归、HARDWARE.md 同步规则 |

## Asset 索引

- `assets/HARDWARE.md.tmpl` — 硬件配置真相源模板
- `assets/PROJECT.md.tmpl` — 项目目标 + 婴儿步路线图模板
- `assets/task.md.tmpl` — 任务级决策日志模板
