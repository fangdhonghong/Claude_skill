# My Claude Code Skills Library

这是一个用于管理和分发 Claude Code CLI 自定义 Skill（工具/提示词）的私有/公开仓库。

### 💡 设计哲学：按需引入，拒绝上下文膨胀
为了防止一次性加载过多 Skill 导致 Claude Code 上下文窗口（Tokens）拉满、推理能力下降，本项目倡导**“项目级隔离、按需链接”**的原则。不建议将所有 Skill 注册为全局工具，而是根据当前项目的开发需求，选择性地引入相关 Skill。

---

## 🛠 Skill 目录

| Skill 名称 | 适用领域 | 核心功能 | 触发前提/依赖 |
| :--- | :--- | :--- | :--- |
| **[STM32CubeMX-Automator](./skills/STM32CubeMX-Automator)** | 嵌入式 (STM32) | 自动配置外设与引脚，生成初始化代码 | 需先创建 `.ioc` 文件并配置好时钟树 |
| **[debug_skill](./skills/debug_skill)** | 嵌入式调试 | 辅助分析 GDB 调试日志、寄存器状态及硬件异常（如 HardFault） | 适用于固件运行时或编译期排错 |
| **[Logic Whetstone](./skills/Logic_Whetstone)** | 架构/逻辑设计 | 采用批判性“拷打式”追问，检验系统设计漏洞 | 适用于方案设计、协议制定等前期阶段 |
| **[Ousterhout-Mode](./skills/Ousterhout-Mode)** | 软件重构 | 基于《软件设计之道》消除设计红旗，构建深层模块 | 适用于代码审查、接口设计与模块重构 |
