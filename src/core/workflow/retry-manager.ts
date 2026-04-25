/**
 * WorkflowEngine - 重试管理器
 *
 * 支持三种退避策略：fixed / linear / exponential
 * 借鉴 n8n 的 retryOnFail + maxTries 机制。
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowNode,
  NodeOutput,
  NodeError,
  RetryPolicy,
} from './types';
import type { NodeHandler, NodeExecutionInput, INodeContext } from './node-registry';
import type { IExecutionContext } from './execution-context';

// ==================== Types ====================

/**
 * 重试配置（从节点配置中提取）
 */
interface RetryConfig {
  /** 是否启用重试 */
  enabled: boolean;

  /** 最大尝试次数（包含首次执行） */
  maxAttempts: number;

  /** 退避策略 */
  backoff: 'fixed' | 'linear' | 'exponential';

  /** 初始延迟（毫秒） */
  initialDelay: number;

  /** 最大延迟（毫秒） */
  maxDelay?: number;

  /** 指数退避倍数 */
  multiplier?: number;
}

/**
 * 重试记录
 */
export interface RetryRecord {
  /** 节点 ID */
  nodeId: string;

  /** 尝试次数 */
  attempt: number;

  /** 时间戳 */
  timestamp: string;

  /** 错误信息 */
  error: {
    name: string;
    message: string;
  };

  /** 延迟时间（毫秒） */
  delay: number;
}

// ==================== RetryManager ====================

/**
 * 重试管理器
 *
 * 根据节点配置的重试策略，在节点执行失败时自动重试。
 * 支持三种退避策略：fixed / linear / exponential
 *
 * @example
 * ```typescript
 * const manager = new RetryManager();
 *
 * const output = await manager.executeWithRetry(
 *   node,
 *   handler,
 *   input,
 *   context
 * );
 *
 * // 查看重试记录
 * const records = manager.getRetryRecords('node-1');
 * ```
 */
export class RetryManager {
  /** 重试记录（按节点 ID 分组） */
  private readonly retryRecords: Map<string, RetryRecord[]>;

  /** 默认重试配置 */
  private readonly defaultConfig: RetryConfig;

  /**
   * 创建重试管理器实例
   *
   * @param defaultConfig - 默认重试配置
   */
  constructor(defaultConfig?: Partial<RetryConfig>) {
    this.retryRecords = new Map();

    this.defaultConfig = {
      enabled: false,
      maxAttempts: 3, // 默认最多 3 次（1 次初始 + 2 次重试）
      backoff: 'exponential',
      initialDelay: 1000, // 默认 1 秒
      maxDelay: 60000, // 默认最大 60 秒
      multiplier: 2, // 默认 2 倍
      ...defaultConfig,
    };
  }

  /**
   * 带重试机制的节点执行
   *
   * 检查 node.retryOnFail 和 node.maxTries，在失败时自动重试。
   * 每次重试都会记录到 context 和内部记录中。
   *
   * @param node - 工作流节点
   * @param handler - 节点处理器
   * @param input - 节点输入
   * @param context - 执行上下文
   * @returns 节点输出
   */
  async executeWithRetry(
    node: WorkflowNode,
    handler: NodeHandler,
    input: NodeExecutionInput,
    context: INodeContext
  ): Promise<NodeOutput> {
    const config = this.extractRetryConfig(node);

    // 如果未启用重试，直接执行
    if (!config.enabled) {
      return handler(input, context);
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        // 执行节点
        const output = await handler(input, context);

        // 如果成功，立即返回
        if (output.status === 'success') {
          return output;
        }

        // 如果输出状态为 failure，但有错误信息，则视为失败
        if (output.status === 'failure' && output.error) {
          throw new Error(output.error.message);
        }

        return output;
      } catch (error) {
        lastError = error as Error;

        // 如果不是最后一次尝试，等待退避
        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(config, attempt);

          // 记录重试
          this.recordRetry(node.id, attempt, lastError, delay);

          // 等待退避
          await this.sleep(delay);
        }
      }
    }

    // 所有尝试都失败，抛出最后的错误
    const nodeError: NodeError = {
      code: 'NODE_EXECUTION_ERROR_AFTER_RETRIES',
      message: lastError?.message || 'Node execution failed after all retries',
      stack: lastError?.stack,
      retryable: false,
    };

    // 返回失败输出
    return {
      nodeId: node.id,
      executionId: context.executionId,
      data: {},
      status: 'failure',
      error: nodeError,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
    };
  }

  /**
   * 获取节点的重试记录
   *
   * @param nodeId - 节点 ID
   * @returns 重试记录列表
   */
  getRetryRecords(nodeId: string): RetryRecord[] {
    return this.retryRecords.get(nodeId) || [];
  }

  /**
   * 获取所有重试记录
   *
   * @returns 重试记录映射表
   */
  getAllRetryRecords(): Map<string, RetryRecord[]> {
    return new Map(this.retryRecords);
  }

  /**
   * 清空重试记录
   */
  clearRetryRecords(): void {
    this.retryRecords.clear();
  }

  // ==================== Private Methods ====================

  /**
   * 从节点配置提取重试配置
   *
   * 优先级：
   * 1. node.retry（RetryPolicy）
   * 2. node.onError（ErrorHandlerConfig）
   * 3. 默认配置
   */
  private extractRetryConfig(node: WorkflowNode): RetryConfig {
    // 检查 retry 字段（RetryPolicy）
    if (node.retry) {
      return {
        enabled: true,
        maxAttempts: node.retry.maxAttempts,
        backoff: node.retry.backoff,
        initialDelay: node.retry.initialDelay,
        maxDelay: node.retry.maxDelay,
        multiplier: node.retry.multiplier,
      };
    }

    // 检查 onError 字段（ErrorHandlerConfig）
    if (node.onError && node.onError.strategy === 'retry') {
      return {
        enabled: true,
        maxAttempts: (node.onError.maxRetries || 2) + 1, // maxRetries 不包含首次执行
        backoff: 'exponential',
        initialDelay: 1000,
        maxDelay: 60000,
        multiplier: 2,
      };
    }

    // 使用默认配置（不启用重试）
    return { ...this.defaultConfig, enabled: false };
  }

  /**
   * 计算重试延迟
   *
   * 三种退避策略：
   * - fixed: 固定延迟
   * - linear: 线性递增（attempt * initialDelay）
   * - exponential: 指数退避（initialDelay * multiplier^(attempt-1)）
   */
  private calculateDelay(config: RetryConfig, attempt: number): number {
    let delay: number;

    switch (config.backoff) {
      case 'fixed':
        delay = config.initialDelay;
        break;

      case 'linear':
        delay = config.initialDelay * attempt;
        break;

      case 'exponential': {
        const multiplier = config.multiplier || 2;
        delay = config.initialDelay * Math.pow(multiplier, attempt - 1);
        break;
      }

      default:
        delay = config.initialDelay;
    }

    // 应用最大延迟限制
    if (config.maxDelay) {
      delay = Math.min(delay, config.maxDelay);
    }

    return delay;
  }

  /**
   * 记录重试
   */
  private recordRetry(
    nodeId: string,
    attempt: number,
    error: Error,
    delay: number
  ): void {
    const record: RetryRecord = {
      nodeId,
      attempt,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
      },
      delay,
    };

    if (!this.retryRecords.has(nodeId)) {
      this.retryRecords.set(nodeId, []);
    }

    this.retryRecords.get(nodeId)!.push(record);
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
