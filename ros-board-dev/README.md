# ros-board-dev

> Claude Code Skill —— 给 **ROS2 弱板**搭「PC 编辑 + 板端编译」的远程开发环境,规避 ROS2 交叉编译地狱。

## 这是什么

一个 Claude Code skill(`SKILL.md` + 脚本 + 参考文档)。Claude 装上后,在 ROS2 弱板项目里首次跑会引导你走完一套环境搭建:**PC 上 VS Code 写代码 + clangd(sysroot) + lsyncd 热同步 + SSH 管道 gdb,板端本地 `colcon build`**。

核心策略一句话:**不在 PC 上交叉编译,直接在板子上编译。** ROS2 交叉编译是地狱(数百依赖逐一编译,版本稍不匹配就链接失败),板端本地编译完全规避。

## 架构:三条数据流

```
   PC  ──①源码 (lsyncd, 单向, 热)──▶  板子
   PC  ◀──②编译产物 (每次 build)───  板子
   AI  ──③SSH 只读 (看)──────────▶  板子
```

| 流 | 方向 | 搬什么 | 触发 | 给谁吃 |
|----|------|--------|------|--------|
| 源码 | PC → 板子 | 你写的源代码 | lsyncd 保存即推 | 板子编译/运行 |
| 编译产物 | 板子 → PC | `compile_commands.json` + 生成的头 | F5 触发 build-and-sync | PC 上 clangd |
| AI 查板子 | 不是文件流 | 版本/头/日志/状态(**只读**) | AI 想看就 SSH | AI 上下文 |

## 什么时候用 / 不用

| 场景 | 用? | 原因 |
|------|-----|------|
| ROS2 项目 + 板子弱(带不动 clangd/编辑器) + 能本地 colcon build | ✅ | 正是为此设计的 |
| 板子够强(树莓派 4/5、x86 NUC、Jetson 全血) | ❌ | 直接 Remote-SSH 更简单 |
| 非 ROS2 项目 | ❌ | ROS2 专属,触发词不匹配 |
| 交叉编译不痛苦(纯 C/C++ 小项目) | ❌ | 直接交叉编译部署二进制更快 |
| 板子连本地编译都跑不动 | ❌ | 本 skill 救不了,得回交叉编译 |

**触发词**:ROS2 嵌入式、弱板、交叉编译地狱、板端编译、lsyncd、clangd sysroot、SSH 管道 gdb。

## 执行分流(铁律)

> **板子上的事用户管,PC 上的事 AI 管。**

| 类型 | 谁执行 |
|------|--------|
| 板端**读**(`hostname -I`、`ls /opt/ros`、`cat 日志`) | AI 直接 SSH 跑 |
| 板端**写**(`sudo apt`、推文件、`systemctl`) | AI 打印命令,**用户手动敲** |
| **PC 端**(装 lsyncd、生成 `.vscode`、拉 sysroot、build-and-sync) | AI 自动跑 |

AI 对板子**永远只读**,从不直接写板子。唯一例外是 steady-state 的 lsyncd 源码热推——那正是要的自动 flow。

## 安装

把本仓库 clone 到 Claude Code 的 skills 目录:

```bash
git clone git@github.com:fangdhonghong/ros-board-dev.git ~/.claude/skills/ros-board-dev
```

然后在 Claude Code 里,任何 ROS2 弱板项目的首次对话触发即可。

## 日常开发流

```bash
hzhy          # 启动 lsyncd 热同步(alias)
# VS Code 打开 $HOME/$PROJ:写代码 Ctrl+S 自动推板子 → F5 编译+断点调试
```

## 文件落点

| 文件 | 位置 |
|------|------|
| `rosdev.conf` | `~/.rosdev/` (唯一配置源,所有脚本 `source` 它) |
| `build-and-sync.sh`、lsyncd `*.lua` | `~/.rosdev/` |
| `.vscode/{settings,tasks,launch}.json` | `$HOME/$PROJ/.vscode/` |
| `compile_commands.json` | `$HOME/$PROJ/` (项目根) |
| sysroot | `~/sysroot`(或你指定的 `$SYSROOT`) |
| `gdb-ros.sh` | 板子 `~/$PROJ/.dev/` |

本 skill 目录(`~/.claude/skills/ros-board-dev/`)是 **immutable** 模板源,运行时不写用户数据——所有用户态都在 `~/.rosdev/` 和项目里。

## 目录结构

```
ros-board-dev/
├── SKILL.md                       # 决策与编排(onboarding 7 步幂等 setup)
├── README.md                      # 本文件
├── reference/
│   ├── architecture.md            # 原理 + 心智模型(为什么这么设计)
│   └── troubleshooting.md         # 按症状查的排查表
└── scripts/
    ├── rosdev.conf.template       # 配置模板(占位符,无真实值)
    ├── probe-board.sh             # 探板子状态(幂等自检)
    ├── pull-sysroot.sh            # rsync 拉板子 ~2G 到 PC sysroot
    ├── gen-configs.sh             # 从 conf 生成 lsyncd / VS Code 配置
    ├── build-and-sync.sh          # F5 触发的确定性哑脚本
    └── gdb-ros.sh.template        # 板端 gdb 包装(source install/setup.bash 再 gdb)
```

## 排查

见 [`reference/troubleshooting.md`](reference/troubleshooting.md) —— 按症状索引。先跑 `~/.rosdev/probe-board.sh` 看全貌,按 `[OK]`/`[STALE]`/`[MISS]` 补。

## 设计原则

- **反臆测底线**:配置字段 AI 缺就问,**绝不编**、绝不塞默认假设值。能探就探,探不到必问。
- **幂等优先**:每个 setup 步骤先探「这步还需要做吗」,只对缺的提命令。
- **板端写=天然刹车**:不可逆操作(sudo/写文件)交给人执行,彻底消除"AI 写板子"的权限焦虑。
