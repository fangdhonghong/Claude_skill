---
name: stm32-cubemx-automator
description: 通过修改 STM32 的 .ioc 配置文件并静默调用 STM32CubeMX CLI，实现硬件驱动代码的自动生成。
version: 1.0.0
---

# STM32CubeMX Automator

通过修改 STM32 的 `.ioc` 配置文件并静默调用 STM32CubeMX CLI，实现硬件驱动代码的自动生成。

## 触发词

- `stm32`
- `cubemx`
- `ioc`
- `生成代码`
- `stm32代码生成`
- `cubemx自动化`

## 使用方法

```typescript
import { automateSTM32 } from './index';

// 示例：配置 PA9 为 USART1_TX
const result = await automateSTM32({
  iocPath: './project.ioc',
  pinConfigs: [
    { pin: 'PA9', function: 'USART1_TX' },
    { pin: 'PA10', function: 'USART1_RX' }
  ]
});
```

## 核心模块架构

### 模块 1：解析与修改模块
- 纯文本按行解析，保留空行和注释
- 读写保护：RCC/SYS/ProjectManager 只读
- Mcu.IPx 序号自动计算与自增

### 模块 2：CLI 脚本生成与执行
- 生成临时脚本 `config load` + `project generate code`
- 无头模式执行，timeout 60秒
- 超时强制 Kill

### 模块 3：验证与反馈
- 新鲜度校验（mtime 比较）
- 初始化函数扫描（MX_xxx_Init）
- 交叉验证防止静默失败

### 模块 4：事务与回退
- 原子化操作：修改前备份
- 最大重试 3 次
- 失败时自动回退 + 诊断报告

## 返回格式

成功时返回：
```json
{
  "success": true,
  "message": "成功生成硬件驱动代码"
}
```

失败时返回诊断报告：
```json
{
  "success": false,
  "message": "自动化流程失败，已回退到原始状态",
  "diagnostics": {
    "currentState": ".ioc 已安全回退到修改前",
    "failureStage": "源码验证阶段",
    "底层日志": "main.c 中未找到 MX_USART1_Init",
    "下一步建议": "请重新评估修改参数，或检查 CubeMX 依赖配置是否完整"
  }
}
```