# My Claude Code Skills Library

这是一个用于管理和分发 Claude Code CLI 自定义 Skill（工具/提示词）的私有/公开仓库。

### 💡 设计哲学：按需引入，拒绝上下文膨胀
为了防止一次性加载过多 Skill 导致 Claude Code 上下文窗口（Tokens）拉满、推理能力下降，本项目倡导**“项目级隔离、按需链接”**的原则。不建议将所有 Skill 注册为全局工具，而是根据当前项目的开发需求，选择性地引入相关 Skill。

---

## 🛠 Skill 目录

| Skill 名称 | 适用领域 | 核心功能 | 触发前提/依赖 |
| :--- | :--- | :--- | :--- |
| **[embedded-debug-assistant](https://github.com/fangdhonghong/Claude_skill/tree/main/embedded-debug-assistant)** | 嵌入式调试 | 辅助分析 GDB 调试日志、寄存器状态及硬件异常（如 HardFault） | 适用于固件运行时或编译期排错 |
| **[logic-whetstone](https://github.com/fangdhonghong/Claude_skill/tree/main/logic-whetstone)** | 架构/逻辑设计 | 采用批判性”拷打式”追问，检验系统设计漏洞 | 适用于方案设计、协议制定等前期阶段 |
| **[ousterhout-strict-mode](https://github.com/fangdhonghong/Claude_skill/tree/main/ousterhout-strict-mode)** | 软件重构 | 基于《软件设计之道》消除设计红旗，构建深层模块 | 适用于代码审查、接口设计与模块重构 |
| **[autosar-wch](https://github.com/fangdhonghong/Claude_skill/tree/main/autosar-wch)** | 嵌入式 (WCH RISC-V) | 依据三层解耦架构 (App/Bsp/Mcal) 进行代码规范化设计 | 需先在MounRiver Studio中创建项目，并把后续的文件添加到项目中 |
| **[strict-stm32](https://github.com/fangdhonghong/Claude_skill/tree/main/strict-stm32)** | 嵌入式 (STM32) | STM32 强约束工作流：CubeMX 一次性产骨架 + AI 增量演进，反幻觉（写代码前必读 HAL/CMSIS 头文件不凭记忆）、对话式询问关键硬件决策、HARDWARE.md 作为真相源强制同步。任何 STM32 工程添加外设（USART/I2C/SPI/ADC/TIMER/DMA/CAN/USB/QSPI）、写 driver/bsp/components/app 代码、修改硬件配置、集成传感器或显示器芯片时都应触发本 skill | 需先用 CubeMX 6.10+ 生成 CMake 工程，配齐 gcc-arm-none-eabi 工具链 |
| **[ros-board-dev](https://github.com/fangdhonghong/Claude_skill/tree/main/ros-board-dev)** | 嵌入式 (ROS2 弱板) | ROS2 弱板「PC 编辑 + 板端编译」远程开发环境搭建：VS Code + clangd(sysroot) + lsyncd 热同步 + SSH 管道 gdb，规避 ROS2 交叉编译地狱；AI 自动探测板子状态与 PC 端配置生成，板端写入由用户手动执行；反臆测（缺值就问，绝不塞默认）、幂等 setup | 板子能本地 colcon build 但带不动编辑器/clangd；需配齐 openssh/rsync + lsyncd + clangd 插件 |
