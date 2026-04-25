/**
 * WorkflowEngine - 错误处理器
 *
 * 借鉴 n8n 三种错误处理策略：
 * 1. abort - 停止工作流
 * 2. skip - 继续，走错误输出
 * 3. fallback - 继续，用上次成功输出
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowNode,
  NodeOutput,
  NodeError,
  ErrorHandlerConfig,
} from './types';
import type { IExecutionContext } from './execution-context';

// ==================== Types ====================

/**
 * 错误处理动作
 *
 * 定义错误发生后执行引擎应采取的动作：
 * - abort: 停止整个工作流
 * - skip: 继续执行，将错误信息包装到输出中传递给下游
 * - fallback: 继续执行，使用上一次成功的输出
 */
export type ErrorAction =
  | { action: 'abort' }
  | { action: 'skip'; output: NodeOutput }
  | { action: 'fallback'; output: NodeOutput };

/**
 * 错误处理日志条目
 */
export interface ErrorLogEntry {
  /** 时间戳 */
  timestamp: string;

  /** 节点 ID */
  nodeId: string;

  /** 节点名称 */
  nodeName: string;

  /** 错误信息 */
  error: {
    name: string;
    message: string;
    code?: string;
  };

  /** 选择的策略 */
  strategy: ErrorHandlerConfig['strategy'];

  /** 采取的动作 */
  action: ErrorAction['action'];
}

// ==================== ErrorHandler ====================

/**
 * 错误处理器
 *
 * 根据节点配置的错误处理策略，决定执行引擎应采取的动作。
 * 每次错误处理决策都会被记录到日志中。
 *
 * @example
 * ```typescript
 * const handler = new ErrorHandler();
 *
 * const action = handler.handle(error, node, context);
 * // action: { action: 'abort' } | { action: 'skip', output } | { action: 'fallback', output }
 *
 * // 查看错误日志
 * const logs = handler.getErrorLog();
 * ```
 */
export class ErrorHandler {
  /** 错误处理日志 */
  private readonly errorLog: ErrorLogEntry[] = [];

  /** 默认策略 */
  private readonly defaultStrategy: ErrorHandlerConfig['strategy'];

  /**
   * 创建错误处理器实例
   *
   * @param defaultStrategy - 默认错误处理策略（默认为 'abort'）
   */
  constructor(defaultStrategy: ErrorHandlerConfig['strategy'] = 'abort') {
    this.defaultStrategy = defaultStrategy;
  }

  /**
   * 处理节点错误
   *
   * 根据节点配置的 onError 策略，决定执行引擎应采取的动作。
   * 每次调用都会记录一条错误日志。
   *
   * @param error - 节点执行错误
   * @param node - 工作流节点
   * @param context - 执行上下文
   * @returns 错误处理动作
   */
  handle(error: Error, node: WorkflowNode, context: IExecutionContext): ErrorAction {
    const strategy = node.onError?.strategy || this.defaultStrategy;

    let action: ErrorAction;

    switch (strategy) {
      case 'skip':
        action = this.handleSkip(error, node, context);
        break;

      case 'fallback':
        action = this.handleFallback(error, node, context);
        break;

      case 'retry':
        // retry 策略在 RetryManager 中处理
        // 如果重试耗尽，则走 abort 逻辑
        action = { action: 'abort' };
        break;

      case 'abort':
      default:
        action = { action: 'abort' };
        break;
    }

    // 记录错误日志
    this.logError(error, node, strategy, action.action);

    return action;
  }

  /**
   * 获取错误日志
   *
   * @returns 错误日志条目列表
   */
  getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  /**
   * 清空错误日志
   */
  clearErrorLog(): void {
    this.errorLog.length = 0;
  }

  // ==================== Private Methods ====================

  /**
   * 处理 skip 策略
   *
   * 继续执行工作流，将错误信息包装到输出中传递给下游节点。
   */
  private handleSkip(
    error: Error,
    node: WorkflowNode,
    context: IExecutionContext
  ): ErrorAction {
    const nodeError: NodeError = {
      code: 'NODE_ERROR_SKIPPED',
      message: error.message,
      stack: error.stack,
      retryable: false,
    };

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {},
      status: 'failure',
      error: nodeError,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
    };

    return { action: 'skip', output };
  }

  /**
   * 处理 fallback 策略
   *
   * 继续执行工作流，使用上一次成功的输出。
   * 如果没有上一次成功输出，则退化为 skip 策略。
   */
  private handleFallback(
    error: Error,
    node: WorkflowNode,
    context: IExecutionContext
  ): ErrorAction {
    // 尝试从上下文获取上一次成功输出
    const previousOutput = context.getNodeOutput(node.id);

    if (previousOutput && previousOutput.status === 'success') {
      // 使用上次成功的输出
      const fallbackOutput: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { ...previousOutput.data },
        status: 'success',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        metadata: {
          fallback: true,
          originalError: error.message,
        },
      };

      return { action: 'fallback', output: fallbackOutput };
    }

    // 没有上一次成功输出，退化为 skip
    const nodeError: NodeError = {
      code: 'NODE_ERROR_FALLBACK_NO_HISTORY',
      message: `Fallback failed: no previous successful output for node ${node.id}. Original error: ${error.message}`,
      stack: error.stack,
      retryable: false,
    };

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {},
      status: 'failure',
      error: nodeError,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
    };

    return { action: 'skip', output };
  }

  /**
   * 记录错误日志
   */
  private logError(
    error: Error,
    node: WorkflowNode,
    strategy: ErrorHandlerConfig['strategy'],
    action: ErrorAction['action']
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      nodeId: node.id,
      nodeName: node.name,
      error: {
        name: error.name,
        message: error.message,
      },
      strategy,
      action,
    };

    this.errorLog.push(entry);
  }
}
