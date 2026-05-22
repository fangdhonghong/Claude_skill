#!/usr/bin/env node
/**
 * STM32CubeMX Automator - 硬件驱动代码自动生成工具
 *
 * 模块架构：
 *   1. 解析与修改模块（事务安全）
 *   2. CLI 脚本生成与执行模块
 *   3. 验证与反馈模块（交叉验证）
 *   4. 异常处理、回退与诊断机制
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';

// ============================================================
// 类型定义
// ============================================================

type TxState = 'PENDING' | 'COMMITTED' | 'ROLLED_BACK';

interface IocSection {
  key: string;
  value: string;
  comment?: string;
}

interface PinConfig {
  pin: string;
  function: string;
  params?: Record<string, string>;
}

interface AutomatorOptions {
  iocPath: string;
  pinConfigs: PinConfig[];
  cubemxPath?: string;
}

interface OperationResult {
  success: boolean;
  message: string;
  diagnostics?: DiagnosticReport;
}

interface DiagnosticReport {
  currentState: string;
  failureStage: string;
  底层日志?: string;
  下一步建议: string;
}

// ============================================================
// 模块 1：解析与修改模块
// ============================================================

class IocParser {
  private lines: string[];
  private iocPath: string;
  private eol: string;

  constructor(iocPath: string) {
    if (!fs.existsSync(iocPath)) {
      throw new Error(`[IocParser] .ioc 文件不存在: ${iocPath}`);
    }
    const content = fs.readFileSync(iocPath, 'utf-8');
    // 兼容 Windows 和 Unix 换行符
    this.lines = content.split(/\r?\n/);
    // 记录原文件换行符格式
    this.eol = content.includes('\r\n') ? '\r\n' : '\n';
    this.iocPath = iocPath;
  }

  /**
   * 查找或设置 Key-Value（通用方法）
   * 如果 Key 已存在则更新，否则在末尾追加
   */
  setOrUpdateKey(key: string, value: string): void {
    const index = this.lines.findIndex(line => line.trim().startsWith(`${key}=`));
    if (index !== -1) {
      this.lines[index] = `${key}=${value}`;
      console.log(`[IocParser] 更新键值: ${key}=${value}`);
    } else {
      this.lines.push(`${key}=${value}`);
      console.log(`[IocParser] 新增键值: ${key}=${value}`);
    }
  }

  /**
   * 获取指定 Key 的值
   */
  getValue(key: string): string | null {
    const line = this.lines.find(l => l.trim().startsWith(`${key}=`));
    if (line) {
      const eqIndex = line.indexOf('=');
      return line.substring(eqIndex + 1).trim();
    }
    return null;
  }

  /**
   * 检查引脚是否已被占用
   */
  isPinOccupied(pin: string): boolean {
    const patterns = [
      new RegExp(`^${pin}\\.`),
      new RegExp(`VP_${pin}\\.`),
    ];

    for (const line of this.lines) {
      for (const pattern of patterns) {
        if (pattern.test(line.trim())) {
          console.log(`[IocParser] 检测到引脚冲突: ${pin} in "${line}"`);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查是否为只读区块（RCC, SYS, ProjectManager）
   */
  isReadOnlyBlock(key: string): boolean {
    const readOnlyPrefixes = ['RCC.', 'SYS.', 'ProjectManager.'];
    return readOnlyPrefixes.some(prefix => key.startsWith(prefix));
  }

  /**
   * 获取当前最大的 Mcu.IPx 序号
   */
  getMaxMcuIpIndex(): number {
    const ipPattern = /^Mcu\.IP(\d+)\./;
    let maxIndex = 0;

    for (const line of this.lines) {
      const match = line.trim().match(ipPattern);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index > maxIndex) {
          maxIndex = index;
        }
      }
    }

    console.log(`[IocParser] 当前最大 Mcu.IP 序号: ${maxIndex}`);
    return maxIndex;
  }

  /**
   * 添加新外设配置
   */
  addMcuIp(ipName: string, params: Record<string, string>): void {
    const newIndex = this.getMaxMcuIpIndex() + 1;

    // 使用 setOrUpdateKey 替代 push，防止残留相同引脚配置造成冲突
    this.setOrUpdateKey(`Mcu.IP${newIndex}.Name`, ipName);
    console.log(`[IocParser] 添加外设: Mcu.IP${newIndex}.Name=${ipName}`);

    // 更新外设总数
    const currentNb = parseInt(this.getValue('Mcu.IPNb') || '0', 10);
    this.setOrUpdateKey('Mcu.IPNb', (currentNb + 1).toString());

    // 追加参数也使用 setOrUpdateKey
    for (const [key, value] of Object.entries(params)) {
      this.setOrUpdateKey(`Mcu.IP${newIndex}.${key}`, value);
    }
  }

  /**
   * 修改引脚配置
   */
  modifyPin(pin: string, func: string, params?: Record<string, string>): void {
    // 检查只读区块
    if (this.isReadOnlyBlock(pin)) {
      throw new Error(`[IocParser] 禁止修改只读区块: ${pin}`);
    }

    // 检查引脚冲突
    if (this.isPinOccupied(pin)) {
      throw new Error(`[IocParser] 引脚已被占用: ${pin}`);
    }

    // 使用 setOrUpdateKey 替代 push，防止残留相同引脚配置造成冲突
    this.setOrUpdateKey(`${pin}.Mode`, func);
    console.log(`[IocParser] 修改引脚: ${pin}.Mode=${func}`);

    // 追加参数也使用 setOrUpdateKey
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        this.setOrUpdateKey(`${pin}.${key}`, value);
      }
    }
  }

  /**
   * 保存修改后的内容（直接覆写原文件，保留原换行符格式）
   */
  save(): void {
    const newContent = this.lines.join(this.eol);
    fs.writeFileSync(this.iocPath, newContent, 'utf-8');
    console.log(`[IocParser] 已保存: ${this.iocPath}`);
  }
}

// ============================================================
// 模块 2：CLI 脚本生成与执行模块
// ============================================================

class CubeMXCliExecutor {
  private iocPath: string;
  private scriptPath: string;
  private cubemxPath: string;
  private timeout: number;

  constructor(iocPath: string, cubemxPath?: string) {
    this.iocPath = iocPath;
    this.cubemxPath = cubemxPath || this.findCubeMX();
    this.timeout = 60000;
    this.scriptPath = path.join(path.dirname(iocPath), `cubemx_script_${Date.now()}.scr`);
  }

  getScriptPath(): string {
    return this.scriptPath;
  }

  /**
   * 查找 STM32CubeMX 可执行文件
   */
  private findCubeMX(): string {
    // 优先检查环境变量
    if (process.env.CUBEMX_PATH && fs.existsSync(process.env.CUBEMX_PATH)) {
      console.log(`[CubeMX Executor] 从环境变量找到 CubeMX: ${process.env.CUBEMX_PATH}`);
      if (process.env.CUBEMX_PATH) { const p = process.env.CUBEMX_PATH; if (p.endsWith(".js") || p.endsWith(".bat") || p.endsWith(".cmd")) { return "node " + p; } return p; }
    }

    const commonPaths = [
      'C:/Program Files/STMicroelectronics/STM32Cube/STM32CubeMX/STM32CubeMX.exe',
      'C:/Program Files (x86)/STMicroelectronics/STM32Cube/STM32CubeMX/STM32CubeMX.exe',
      '/usr/local/bin/STM32CubeMX',
      '/Applications/STM32CubeMX.app/Contents/MacOS/STM32CubeMX',
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        console.log(`[CubeMX Executor] 找到 CubeMX: ${p}`);
        return p;
      }
    }

    throw new Error('[CubeMX Executor] 未找到 STM32CubeMX，请手动指定 cubemxPath');
  }

  /**
   * 生成临时脚本（防御路径注入）
   */
  generateScript(): void {
    const absolutePath = path.resolve(this.iocPath).replace(/\\/g, '/');
    console.log(`[CubeMX Executor] 绝对路径: ${absolutePath}`);

    // 转义双引号，防止闭合逃逸
    const safePath = absolutePath.replace(/"/g, '\\"');

    const scriptContent = [
      `config load "${safePath}"`,
      'project generate code',
      'exit',
    ].join('\n');

    fs.writeFileSync(this.scriptPath, scriptContent, 'utf-8');
    console.log(`[CubeMX Executor] 已生成脚本: ${this.scriptPath}`);
  }

  /**
   * 执行 CubeMX CLI（终极防御形态）
   * - Settled Guard：确保 resolve/reject 只调用一次
   * - 安全清理：cleanup 异常被吞咽，不打断 Promise 链
   * - 跨平台进程树绞杀：Unix 用进程组，Windows 用 taskkill
   */
  execute(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      console.log(`[CubeMX Executor] 开始执行 CLI (超时: ${this.timeout}ms)...`);

      let isSettled = false;
      const safeResolve = (val: any) => { if (!isSettled) { isSettled = true; resolve(val); } };
      const safeReject = (err: any) => { if (!isSettled) { isSettled = true; reject(err); } };
      const safeCleanup = () => { try { this.cleanup(); } catch (e) { console.warn(`[执行器] 清理异常 (忽略): ${e}`); } };

      // 注入环境变量防止 headless 报错
      const env = { ...process.env, _JAVA_OPTIONS: '-Djava.awt.headless=true' };

      // 解析命令：如果是 "node script.js" 形式，需要拆分成 [node, script.js]
      const cmdParts = this.cubemxPath.split(' ');
      const isNodeCommand = cmdParts[0] === 'node' || cmdParts[0] === 'node.exe';
      const isWindows = os.platform() === 'win32';

      const executable = isNodeCommand ? 'node' : this.cubemxPath;
      const execArgs = isNodeCommand ? cmdParts.slice(1).concat(['-q', this.scriptPath]) : ['-q', this.scriptPath];

      console.log(`[CubeMX Executor] 执行命令: ${executable} ${execArgs.join(' ')}`);

      let stdout = '';
      let stderr = '';

      // Unix 下使用 detached 创建独立进程组，Windows 下禁用（避免进程组隔离问题）
      const proc = spawn(executable, execArgs, {
        env,
        detached: !isWindows && !isNodeCommand,  // Node 脚本不用 detached
        windowsHide: true,
      });

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        safeCleanup();
        if (code === 0) {
          safeResolve({ exitCode: code || 0, stdout, stderr });
        } else {
          safeReject(new Error(`[CubeMX Executor] 执行失败，Exit Code: ${code}\nstderr: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        safeCleanup();
        safeReject(new Error(`[CubeMX Executor] 进程错误: ${err.message}`));
      });

      // 超时与进程树绞杀机制
      const timer = setTimeout(() => {
        if (isSettled) return;
        console.error(`[CubeMX Executor] ⏳ 超过 ${this.timeout}ms，启动进程树绞杀机制...`);

        try {
          if (isWindows) {
            // Windows: 强制杀死进程树 (/T = 包含子进程, /F = 强制)
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
          } else {
            // Unix: 发送 SIGKILL 给整个进程组 (-pid 表示进程组)
            process.kill(-proc.pid!, 'SIGKILL');
          }
        } catch (e) {
          // 忽略绞杀失败（进程可能刚刚自行退出）
          console.warn(`[CubeMX Executor] 进程树绞杀失败（忽略）: ${e}`);
        }

        safeCleanup();
        safeReject(new Error(`[CubeMX Executor] 执行超时 (${this.timeout}ms)，已强制终止`));
      }, this.timeout);

      // 确保 resolve/reject 后清理定时器
      proc.on('close', () => { clearTimeout(timer); });
    });
  }

  /**
   * 清理临时脚本（安全版）
   */
  cleanup(): void {
    if (this.scriptPath && fs.existsSync(this.scriptPath)) {
      try {
        fs.unlinkSync(this.scriptPath);
        console.log(`[CubeMX Executor] 已清理临时脚本: ${this.scriptPath}`);
      } catch (e) {
        console.warn(`[CubeMX Executor] 清理临时脚本失败（忽略）: ${this.scriptPath}`);
      }
    }
  }
}

// ============================================================
// 模块 3：验证与反馈模块
// ============================================================

class CodeVerifier {
  private projectPath: string;

  constructor(iocPath: string) {
    this.projectPath = path.dirname(iocPath);
  }

  /**
   * 验证 main.c 是否被更新
   */
  verifyMainCFreshness(cliExecutionTime: Date): boolean {
    const mainCPath = path.join(this.projectPath, 'Core/Src/main.c');

    if (!fs.existsSync(mainCPath)) {
      console.log(`[CodeVerifier] main.c 不存在: ${mainCPath}`);
      return false;
    }

    const stats = fs.statSync(mainCPath);
    const mtime = stats.mtime;

    console.log(`[CodeVerifier] main.c 修改时间: ${mtime}`);
    console.log(`[CodeVerifier] CLI 执行时间(容差-2s): ${cliExecutionTime}`);

    const isFresh = mtime.getTime() >= cliExecutionTime.getTime();
    console.log(`[CodeVerifier] 新鲜度校验: ${isFresh ? '通过' : '失败'}`);

    return isFresh;
  }

  /**
   * 扫描初始化函数（支持模糊匹配）
   * CubeMX 生成的初始化函数是以外设级命名，如 MX_USART1_Init、GPIO_Init 等
   */
  scanForInitFunction(targetPattern: string): boolean {
    const mainCPath = path.join(this.projectPath, 'Core/Src/main.c');

    if (!fs.existsSync(mainCPath)) {
      console.log(`[CodeVerifier] main.c 不存在: ${mainCPath}`);
      return false;
    }

    const content = fs.readFileSync(mainCPath, 'utf-8');
    const found = content.includes(targetPattern);

    console.log(`[CodeVerifier] 初始化函数扫描 "${targetPattern}": ${found ? '找到' : '未找到'}`);

    return found;
  }

  /**
   * 综合验证
   */
  verify(targetPattern: string, cliExecutionTime: Date): VerificationResult {
    const freshness = this.verifyMainCFreshness(cliExecutionTime);
    const initFound = this.scanForInitFunction(targetPattern);

    return {
      fresh: freshness,
      initFound,
      success: freshness && initFound,
    };
  }
}

interface VerificationResult {
  fresh: boolean;
  initFound: boolean;
  success: boolean;
}

// ============================================================
// 模块 4：异常处理、回退与诊断机制
// ============================================================

class TransactionManager {
  private iocPath: string;
  private backupPath: string;
  private scriptPath: string | null;
  private maxRetries: number;
  private state: TxState = 'PENDING';

  // 预先绑定上下文，确保 removeListener 时引用一致
  private readonly sigintHandler = () => this.handleEmergencyExit('SIGINT');
  private readonly sigtermHandler = () => this.handleEmergencyExit('SIGTERM');

  constructor(iocPath: string, maxRetries = 3) {
    this.iocPath = iocPath;
    this.backupPath = iocPath + '.bak';
    this.scriptPath = null;
    this.maxRetries = maxRetries;
  }

  /**
   * 创建事务备份
   */
  beginTransaction(): void {
    if (!fs.existsSync(this.iocPath)) {
      throw new Error(`[TransactionManager] .ioc 文件不存在: ${this.iocPath}`);
    }
    fs.copyFileSync(this.iocPath, this.backupPath);
    this.state = 'PENDING';
    console.log(`[TransactionManager] 事务开始，备份: ${this.backupPath}`);

    // 挂载紧急撤回钩子（只在危险窗口期生效）
    process.once('SIGINT', this.sigintHandler);
    process.once('SIGTERM', this.sigtermHandler);
  }

  /**
   * 紧急退出处理（信号拦截器触发）
   */
  private handleEmergencyExit(signal: string): void {
    console.error(`\n[TransactionManager] 💥 收到 ${signal} 信号，正在紧急回滚现场...`);
    this.rollback();
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  }

  /**
   * 回滚事务
   */
  rollback(): void {
    if (this.state !== 'PENDING') return;
    this.state = 'ROLLED_BACK';
    this.removeHooks();

    if (fs.existsSync(this.backupPath)) {
      fs.copyFileSync(this.backupPath, this.iocPath);
      console.log(`[TransactionManager] ⏪ 现场已安全回滚: ${this.iocPath}`);
    }
    this.cleanup();
  }

  /**
   * 提交事务（删除备份）
   */
  commit(): void {
    if (this.state !== 'PENDING') return;
    this.state = 'COMMITTED';
    this.removeHooks();

    if (fs.existsSync(this.backupPath)) {
      fs.unlinkSync(this.backupPath);
      console.log(`[TransactionManager] ✅ 事务提交，已删除备份`);
    }
  }

  /**
   * 移除信号监听器
   */
  private removeHooks(): void {
    process.removeListener('SIGINT', this.sigintHandler);
    process.removeListener('SIGTERM', this.sigtermHandler);
  }

  /**
   * 清理临时脚本
   */
  setScriptPath(scriptPath: string): void {
    this.scriptPath = scriptPath;
  }

  /**
   * 清理所有临时文件
   */
  cleanup(): void {
    if (this.scriptPath && fs.existsSync(this.scriptPath)) {
      try {
        fs.unlinkSync(this.scriptPath);
        console.log(`[TransactionManager] 已清理临时脚本: ${this.scriptPath}`);
      } catch (e) {
        console.warn(`[TransactionManager] 清理临时脚本失败（忽略）: ${this.scriptPath}`);
      }
    }
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }
}

// ============================================================
// 主自动化类
// ============================================================

export class STM32CubeMXAutomator {
  private options: AutomatorOptions;
  private transactionManager: TransactionManager;
  private cliStartTime: Date | null = null;

  constructor(options: AutomatorOptions) {
    this.options = options;
    this.transactionManager = new TransactionManager(options.iocPath);
  }

  /**
   * 执行完整的自动化流程
   */
  async run(): Promise<OperationResult> {
    const iocPath = this.options.iocPath;
    console.log('===========================================');
    console.log('[STM32CubeMXAutomator] 开始自动化流程');
    console.log(`[STM32CubeMXAutomator] IOC: ${iocPath}`);
    console.log(`[STM32CubeMXAutomator] 目标引脚配置: ${JSON.stringify(this.options.pinConfigs)}`);
    console.log('===========================================');

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < this.transactionManager.getMaxRetries()) {
      try {
        console.log(`\n[STM32CubeMXAutomator] 第 ${retryCount + 1} 次尝试...`);

        // 事务开始：创建备份
        this.transactionManager.beginTransaction();

        // 步骤 1：解析与修改
        await this.step1ParseAndModify();

        // 步骤 2：CLI 执行
        await this.step2ExecuteCli();

        // 步骤 3：验证
        await this.step3Verify();

        // 成功：提交事务
        this.transactionManager.commit();

        console.log('\n===========================================');
        console.log('[STM32CubeMXAutomator] 自动化流程完成!');
        console.log('===========================================');

        return {
          success: true,
          message: `成功生成硬件驱动代码。引脚配置: ${JSON.stringify(this.options.pinConfigs)}`,
        };

      } catch (error) {
        lastError = error as Error;
        console.error(`\n[STM32CubeMXAutomator] 第 ${retryCount + 1} 次尝试失败: ${lastError.message}`);

        // 【架构修复】确定性错误直接跳出，不盲目重试
        if (this.isDeterministicError(lastError)) {
          console.error(`[STM32CubeMXAutomator] 检测到确定性错误，放弃重试。`);
          this.transactionManager.rollback(); // 死前必须回滚，确保现场恢复！
          break;
        }

        // 回滚
        this.transactionManager.rollback();

        retryCount++;
        console.log(`[STM32CubeMXAutomator] 已回滚，准备重试...`);
      }
    }

    // 达到最大重试次数或确定性错误，返回诊断报告
    return this.generateDiagnosticReport(lastError);
  }

  /**
   * 判断是否为确定性错误（不应重试）
   */
  private isDeterministicError(error: Error): boolean {
    const deterministicPatterns = [
      '[步骤 1]',      // 引脚冲突、只读区块等
      '[IocParser]',   // 解析错误
      '[TransactionManager]', // 文件不存在
      'main.c 不存在', // 文件不存在
      '未找到',        // 验证失败
      '.ioc 文件不存在',
    ];

    return deterministicPatterns.some(pattern => error.message.includes(pattern));
  }

  /**
   * 步骤 1：解析与修改
   */
  private async step1ParseAndModify(): Promise<void> {
    console.log('\n[步骤 1] 解析与修改 .ioc 文件...');

    const parser = new IocParser(this.options.iocPath);

    for (const config of this.options.pinConfigs) {
      // 检查引脚冲突
      if (parser.isPinOccupied(config.pin)) {
        throw new Error(`[步骤 1] 引脚冲突: ${config.pin} 已被占用`);
      }

      // 修改引脚
      parser.modifyPin(config.pin, config.function, config.params);
    }

    // 保存修改（直接覆写原文件）
    parser.save();
    console.log('[步骤 1] .ioc 文件修改完成');
  }

  /**
   * 步骤 2：CLI 执行
   */
  private async step2ExecuteCli(): Promise<void> {
    console.log('\n[步骤 2] 生成并执行 CubeMX CLI 脚本...');

    // 记录 CLI 开始时间（减去2秒作为文件系统容差）
    this.cliStartTime = new Date(Date.now() - 2000);
    console.log(`[步骤 2] CLI 开始时间(容差-2s): ${this.cliStartTime}`);

    const executor = new CubeMXCliExecutor(this.options.iocPath, this.options.cubemxPath);
    this.transactionManager.setScriptPath(executor.getScriptPath());

    executor.generateScript();

    const result = await executor.execute();

    console.log(`[步骤 2] CLI 执行完成，Exit Code: ${result.exitCode}`);
    if (result.stdout) {
      console.log(`[步骤 2] stdout: ${result.stdout.substring(0, 500)}`);
    }

    if (result.exitCode !== 0) {
      throw new Error(`[步骤 2] CubeMX CLI 执行失败，Exit Code: ${result.exitCode}\nstderr: ${result.stderr}`);
    }
  }

  /**
   * 步骤 3：验证
   */
  private async step3Verify(): Promise<void> {
    console.log('\n[步骤 3] 验证生成的代码...');

    if (!this.cliStartTime) {
      throw new Error('[步骤 3] 内部错误：cliStartTime 未被设置');
    }

    const verifier = new CodeVerifier(this.options.iocPath);

    for (const config of this.options.pinConfigs) {
      // 【关键修复】降维处理 function 名称
      // CubeMX 生成的初始化函数是以外设级命名，而非引脚级
      // USART1_TX -> MX_USART1（模糊匹配即可）
      // GPIO_Output -> MX_GPIO
      let basePeripheral = config.function.split('_')[0];

      const initFunctionPattern = `MX_${basePeripheral}`;
      console.log(`[步骤 3] 扫描初始化函数模式: ${initFunctionPattern}`);

      const result = verifier.verify(initFunctionPattern, this.cliStartTime);

      if (!result.success) {
        const diagnostics: DiagnosticReport = {
          currentState: '.ioc 已安全回退到修改前。',
          failureStage: '源码验证阶段',
          底层日志: `main.c 中未找到 ${initFunctionPattern}。新鲜度: ${result.fresh}, 初始化函数: ${result.initFound}`,
          下一步建议: `请重新评估修改参数，或检查 CubeMX 依赖配置是否完整。`,
        };

        throw new Error(
          `[步骤 3] 验证失败: 未在 main.c 中找到 ${initFunctionPattern}。` +
          `新鲜度: ${result.fresh}, 初始化函数: ${result.initFound}`
        );
      }
    }

    console.log('[步骤 3] 代码验证通过');
  }

  /**
   * 生成诊断报告
   */
  private generateDiagnosticReport(error: Error | null): OperationResult {
    const diagnostic: DiagnosticReport = {
      currentState: '.ioc 已安全回退到修改前。',
      failureStage: error?.message.includes('确定性错误') ? '确定性错误（不重试）' : '达到最大重试次数 (3次)',
      底层日志: error?.message || '未知错误',
      下一步建议: '请重新评估修改参数，或提示用户是否需要唤起 GUI 手动解决。',
    };

    return {
      success: false,
      message: '自动化流程失败，已回退到原始状态。',
      diagnostics: diagnostic,
    };
  }
}

// ============================================================
// 导出入口函数
// ============================================================

export async function automateSTM32(options: AutomatorOptions): Promise<OperationResult> {
  const automator = new STM32CubeMXAutomator(options);
  return automator.run();
}

// ============================================================
// CLI 入口（用于测试）
// ============================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('用法: npx ts-node index.ts <ioc路径> <引脚配置JSON>');
    console.log('示例: npx ts-node index.ts ./project.ioc \'[{"pin":"PA9","function":"USART1_TX"}]\'');
    process.exit(1);
  }

  const iocPath = args[0];
  let pinConfigs: PinConfig[];

  try {
    pinConfigs = JSON.parse(args[1]);
  } catch {
    console.error('[CLI] 无效的 JSON 格式');
    process.exit(1);
  }

  automateSTM32({ iocPath, pinConfigs })
    .then((result) => {
      console.log('\n========== 执行结果 ==========');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('\n[CLI] 未处理的异常:', err);
      process.exit(1);
    });
}