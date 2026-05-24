# Embedded Debug Assistant (System Prompt)

这是一个专为嵌入式系统和底层软件开发设计的 AI 系统提示词（System Prompt）。它旨在将大语言模型（LLM）配置为一个遵循结构化方法论的**逻辑调试助手**，协助拥有物理板卡访问权限的开发人员（您）进行系统级排故。

## 📌 项目定位

由于 AI 运行在纯软件的终端环境中，无法直接接触硬件，本提示词通过建立**“AI作为逻辑大脑，开发者作为物理眼手”**的协同模式，克服软硬件调试中的物理隔阂。它强调物理信号确认、控制变量、双向验证，并在工作区自动维护一份结构化的调试日志（`DEBUG_LOG.md`）。

---

## 🛠️ 如何使用 (Quick Start)

您可以将本仓库中的 `debug_skill` 提示词内容复制，并配置到您常用的 AI 工具中：

### 1. 在 Cursor / Windsurf 等 AI 编程编辑器中使用（推荐）
这类编辑器具有工作区文件读写权限，能最大化发挥本提示词自动创建和更新 `DEBUG_LOG.md` 的功能。
*   **方法**：在项目根目录下创建 `.cursorrules` 文件，或者在编辑器的 `System Prompt` / `Instructions` 设置中，将 `debug_skill` 的全部文本粘贴进去。

### 2. 在 ChatGPT (Custom Instructions) / Claude (System Prompt) 中使用
*   **方法**：在创建自定义 GPTs、Claude Projects 或在个人设置的“自定义指令（Custom Instructions）”中，将本提示词填入“你希望模型如何扮演角色/回复”的输入框中。

### 3. 在 Coze / Dify 等 Agent 平台中使用
*   **方法**：创建一个单 Agent 节点，将本提示词作为 Agent 的 **System Prompt / 提示词**，并可以关联本地目录读写插件（如有）。

---

## 💡 开发者协同建议

为了获得最佳的辅助调试效果，建议您在向 AI 发起提问时，做好以下准备：

1.  **准备好物理测量工具**：手边备有万用表、示波器或逻辑分析仪，因为 AI 在推导陷入瓶颈时，会主动向您索取特定引脚的波形或电压数据。
2.  **提供基础上下文**：在对话开始时，简单告知 AI 您的 MCU/CPU 型号、RTOS/OS 类型、遇到问题的外设或模块名称。
3.  **配合维护日志**：由于部分非 Agent 环境下的 AI 无法直接在您的本地创建文件，当 AI 输出 `DEBUG_LOG.md` 的更新内容时，建议您手动将其保存到本地项目目录的 `docs/troubleshooting/DEBUG_LOG.md` 中，以便长期跟踪。

---

## ⚖️ 许可证

本项目基于 [MIT License](LICENSE) 开源。
