---
name: ros-board-dev
description: 为 ROS2 弱板（带不动边编译边跑编辑器/clangd）搭「PC 上 VS Code 编辑 + clangd(sysroot) + lsyncd 热同步 + SSH 管道 gdb，板端本地编译」的开发环境，规避 ROS2 交叉编译地狱。AI 自动探测板子状态、自动化 PC 端配置生成与 sysroot 拉取；板端写入（装服务/推文件）由 AI 打印命令、用户手动执行。ROS2 专属——板子够强能直接 SSH 开发、或非 ROS2 项目、或纯 CLI 时不要用。触发词：ROS2 嵌入式、弱板、交叉编译地狱、板端编译、lsyncd、clangd sysroot、SSH 管道 gdb
disable-model-invocation: false
---

# ROS2 弱板远程开发环境搭建

> 核心策略：**不在 PC 上交叉编译，直接在板子上编译**，规避 ROS2 交叉编译地狱。
> 配套：`scripts/`（可执行件）、`reference/`（原理 + 排查）。本文件只讲**决策与编排**。

## 1. 首次进入本项目：先问要不要跑适配自检

判断「首次」：`~/.rosdev/rosdev.conf` 不存在 = 本项目还没用本 skill 配过。

若是首次（无 conf），**先弹一句问用户**：
> 「这是本项目第一次用 ros-board-dev。要我帮你判断当前项目（ROS2 + 弱板）适不适合用这套流程吗？」

- 用户说**要** → 跑下面三条自检（任何一条不成立就刹车，告诉用户为什么不适用 + 更优解，不要硬推）：
  - ① **交叉编译这个项目很痛苦？** → 否：直接交叉编译部署二进制，别用本 skill。
  - ② **板子能本地编译跑得动？** → 否：本 skill 救不了，逼回交叉编译。
  - ③ **板子带不动「边编译边跑编辑器/clangd」？** → 否（板子够强）：直接 SSH 上板开发更简单，别用本 skill。
  - 三条都「是」才进 onboarding。
- 用户说**不用**（自己已确认合适）→ 跳过自检，直接进 onboarding。
- **非首次**（conf 已存在）→ 跳过自检，按幂等检测看哪些步骤还要做（见 §4）。

## 2. 执行分流（贯穿全程的规矩）

**「板子上的事用户管，PC 上的事 AI 管。」**

| 类型 | 例子 | 谁执行 | 确认 |
|------|------|--------|------|
| 板端**读** | `hostname -I`、`ls /opt/ros`、`cat 日志`、`find` | **AI 直接 SSH 跑** | 免确认 |
| 板端**写** | `sudo apt`、推文件、`chmod`、`systemctl` | **AI 打印命令，用户自己在板子终端敲** | 用户执行=天然闸 |
| **PC 端** | 装 lsyncd、生成 `.vscode`、拉 sysroot、路径重写、build-and-sync | **AI 自动跑** | — |

- **AI 对板子永远只读**，从不直接写板子。
- **例外**：steady-state 的 lsyncd 源码热推是自动板端写入（这正是要的 flow①）；只有 setup 期的安装/推文件才手动。

**铁律：配置字段，AI 缺就问、绝不自己编——也不塞默认假设值。** 能探就探（版本/路径/状态），探不到的必问；用户没给的值一律问，绝不静默填默认。不止首跑，全程适用——这是反臆测底线。

**幂等优先**：每个 setup 步骤，先探「这步还需要做吗」（服务装了没/文件推了没），只对缺的提命令。

## 3. Onboarding（首次跑：填 `~/.rosdev/rosdev.conf`）

若 `~/.rosdev/rosdev.conf` 不存在，先做 intake。**只问 AI 探不到的字段**，其余自己 SSH 查，BINARY 留后期。

**问用户**（必填，**无默认**——AI 探不到的连接事实）：
- `BOARD_HOST`：板子 IP
- `BOARD_USER`：板子登录用户名
- （这俩是建立 SSH 的前提，没法探，必须用户给。）

**AI 自己探**（SSH 连上后 + PC 本地查，别问用户）：
- `ROS_DISTRO`：`ssh "$BOARD_ADDR" 'ls /opt/ros'`（取唯一/最新）
- `BOARD_HOME`：`ssh "$BOARD_ADDR" 'echo $HOME'`
- `PROJ`：找已有 colcon workspace——PC 和板子两边找含 `src/`+`package.xml` 的目录。找到一个→用它；多个→问用户选哪个；没有→问用户想建在哪。
- `PROJ_NAME`：从 workspace 的包名（读 `package.xml`）或目录名派生；派生不出再问。

**问用户**（纯偏好，**给提示不给默认**）：
- `SYSROOT`：PC 上 sysroot 放哪（提示：常见 `~/sysroot` 或 `~/.rosdev/sysroot`，用户定）

**后期再填**（先留空）：
- `BINARY`：编译出的可执行路径。首次 `colcon build` 后，AI 从 `package.xml`/colcon 输出读出包名+路径，补进 conf 和 `launch.json` 的 `program`。

写完 conf 后：
1. `source ~/.rosdev/rosdev.conf`
2. 把本 skill 的 `scripts/build-and-sync.sh`、`scripts/gen-configs.sh`、`scripts/probe-board.sh`、`scripts/pull-sysroot.sh` 复制到 `~/.rosdev/` 并 `chmod +x`（PC 端运行件落用户态，不留在 immutable skill 目录）
3. 后续命令只用变量名

## 4. Setup 编排（阶段 1-7，每步幂等）

每步先 `probe-board.sh` 探状态，再按「板端写=打印给用户 / PC 端=AI 自动」分流。

1. **网络 + SSH**（板端写，打印给用户敲）：板子装并起 `openssh-server` + `rsync`；PC `ssh-copy-id`；板上建 `~/$PROJ`。
2. **lsyncd 热同步**（PC 端，AI 跑）：PC 装 lsyncd；`gen-configs.sh` 从 conf 生成 lsyncd 配置（排除 `build/ install/ .git/ .vscode/ *.o`）；前台跑验证 → 固化后台 + alias `hzhy`。
3. **VS Code + clangd**（PC 端，AI 跑）：PC 装 VS Code + clangd 插件（不装 Remote-SSH）。
4. **sysroot**（PC 端，AI 跑，**带判断**）：看 `probe-board.sh` 报 sysroot 是 `[OK]`/`[STALE]`/`[MISS]`；缺或过期才跑 `~/.rosdev/pull-sysroot.sh`（rsync 拉取 ~2G + 写包清单指纹做基线）；`[OK]` 就跳过——别每次白拉。
5. **build-and-sync 脚本**（PC 端，AI 生成）：板子 `colcon build` 导 `compile_commands.json` → 拉回 → `sed` 路径重写（`/opt/ros/$ROS_DISTRO`→`$SYSROOT/opt/ros/$ROS_DISTRO`、`$BOARD_HOME`→`$HOME`）→ 拉回 `build/`、`install/` 的 `.h/.hpp`（含 `.msg` 生成的头）。
6. **VS Code 自动化**（PC 端，AI 跑）：生成 `.vscode/settings.json`（clangd 接管，禁 C_Cpp）、`tasks.json`（F5 调 build-and-sync）、`launch.json`（SSH 管道 gdb + `sourceFileMap`）。`program` 字段等 BINARY 补。
7. **gdb 包装**（板端写，打印给用户）：生成 `gdb-ros.sh`（先 `source install/setup.bash` 再 `exec gdb`），推到板子 `~/$PROJ/.dev/`，`chmod +x`。

## 5. 日常开发流

```bash
hzhy          # 启动 lsyncd 热同步（alias）
# VS Code 打开 $HOME/$PROJ：写代码 Ctrl+S 自动推板子 → F5 编译+断点调试
```

流②（build-and-sync）是**确定性哑脚本**，每次 F5 跑同样的活，AI 不掺和、不吹「智能同步」（rsync 增量已够）。

## 6. 文件落点（N5：两目录两寿命）

| 文件 | 位置 | 备注 |
|------|------|------|
| `rosdev.conf` | `~/.rosdev/` | 唯一配置源，所有脚本 `source` 它 |
| `build-and-sync.sh`、lsyncd `*.lua` | `~/.rosdev/` | PC 端脚本/配置 |
| `.vscode/{settings,tasks,launch}.json` | `$HOME/$PROJ/.vscode/` | VS Code 只认项目里的 |
| `compile_commands.json` | `$HOME/$PROJ/`（项目根） | clangd 在项目根找 |
| sysroot | `$SYSROOT`（默认 `~/sysroot`） | ROS 头文件镜像 |
| `gdb-ros.sh` | 板子 `~/$PROJ/.dev/` | 板端 gdb 用 |

**绝不往本 skill 目录（`~/.claude/skills/ros-board-dev/`）写用户数据**——那是 immutable 模板源。用户态全在 `~/.rosdev/` 和项目里。

## 7. 参考

原理（三条数据流心智模型）、完整排查表见 `reference/`。
