# STM32CubeMX Automator

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

STM32CubeMX Automator 是一个基于 Node.js 编写的 CLI 工具，专为 LLM Agent（如 Claude Code, AutoGPT）设计。它允许程序通过 JSON 指令静默修改 STM32 项目的 `.ioc` 文件，并在后台调用 CubeMX 重新生成 C/C++ 驱动代码。

项目重点解决自动化调用 CubeMX 时常见的脏数据残留、进程挂起和并发冲突等工程问题，确保在无人值守环境下的执行稳定性。

## 核心特性

- **面向 Agent 设计**：提供标准的 CLI 参数输入（文件路径 + JSON 数组），便于大模型进行 Function Calling。
- **事务与状态机保障**：基于 FSM（有限状态机）设计。执行前自动备份 `.ioc` 文件，若遇到超时、抛错或人为中断，严格回滚至初始状态。
- **跨平台进程树清理**：针对 CubeMX 底层依赖 Java Wrapper 容易产生僵尸进程的问题，实现了 Windows (`taskkill /T`) 和 Unix (`kill(-pid)`) 的进程树级别清理。
- **动态信号处理**：在文件操作的“危险窗口期”动态挂载 `SIGINT/SIGTERM` 拦截器，确保按 `Ctrl+C` 也能触发安全回滚，且不造成全局事件监听器泄漏。
- **安全的解析与验证**：使用纯文本规则修改 `.ioc`，不破坏原有格式。生成结束后，自动校验 `main.c` 时间戳及外设初始化函数（如 `MX_USART1_UART_Init`）。

## 快速上手

### 1. 环境依赖
- Node.js >= 18.0.0
- 已安装 STM32CubeMX，且其可执行文件目录已加入系统 `PATH` 环境变量。

### 2. 安装
git clone https://github.com/fangdhonghong/STM32CubeMX-Automator.git

cd stm32-cubemx-automator

npm install

### 3.CLI 调用示例
// npx ts-node index.ts <.ioc文件路径> <引脚配置JSON>

npx ts-node index.ts ./project.ioc '[{"pin":"PA9","function":"USART1_TX"},{"pin":"PA10","function":"USART1_RX"}]'

## Agent 集成指南 (Tool/Skill 配置)
如果将此项目作为 AI Agent 的底层 Tool，建议使用以下 Schema 描述：

Tool Name: stm32_hw_configurator

Description: "用于修改 STM32 芯片引脚与外设配置，并调用 CubeMX 重新生成底层 C 驱动代码。支持事务回滚以保证工程安全。"

Parameters:

iocPath (string): 目标 .ioc 文件的相对或绝对路径。

config (string): JSON 数组字符串，描述引脚和功能映射。示例：[{"pin": "PA5", "function": "GPIO_Output"}]

## 内部设计说明
在处理 Node.js 异步 IO 与子进程管理时，本项目做了一些防御性处理：

防双重 Resolve：引入 Settled Guard 机制，配合安全的异常捕获（吞咽特定的 EBUSY），防止因清理操作失败导致 Node.js 触发 UnhandledRejection 而崩溃。

路径注入防御：在生成 CubeMX 临时执行脚本（.scr）时，对文件路径统一进行跨平台标准化（转为 POSIX 风格）并做双引号转义处理，避免路径包含空格或特殊字符引发解析失败。

## License
MIT License
