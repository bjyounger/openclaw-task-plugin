/**
 * DependencyEventListener - 依赖事件监听器
 *
 * 核心职责：
 * 1. 监听任务事件（task:completed, task:failed, task:cancelled）
 * 2. 转换为依赖事件（dependency:resolved, dependency:failed）
 * 3. 触发 DependencyManager 更新状态
 *
 * 设计原则：
 * - 解耦任务系统与依赖系统
 * - 支持动态启用/禁用监听
 * - 提供完整的事件追踪
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import { EventEmitter } from '../managers/event-emitter';
import {
  TaskManagerEvents,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
} from '../managers/types';
import { DependencyManager } from './dependency-manager';
import { DependencyItemStatus } from './types';

/**
 * 任务状态到依赖状态的映射
 */
const TASK_STATUS_TO_DEPENDENCY_STATUS: Record<string, DependencyItemStatus> = {
  succeeded: 'satisfied',
  failed: 'failed',
  cancelled: 'failed',
  timed_out: 'failed',
};

/**
 * 事件监听器配置
 */
export interface DependencyEventListenerConfig {
  /** 是否自动开始监听（默认 true） */
  autoStart?: boolean;

  /** 是否记录事件转换日志（默认 false） */
  enableLogging?: boolean;

  /** 错误处理模式：'throw' 抛出异常，'log' 仅记录 */
  errorHandling?: 'throw' | 'log';
}

/**
 * 事件转换记录
 */
export interface EventConversionRecord {
  /** 原始事件类型 */
  originalEvent: string;

  /** 转换后事件类型 */
  convertedEvent: string;

  /** 任务 ID */
  taskId: string;

  /** 时间戳 */
  timestamp: number;

  /** 转换延迟（毫秒） */
  latency?: number;

  /** 错误信息（如果转换失败） */
  error?: string;
}

/**
 * 依赖事件监听器
 *
 * 监听任务系统的生命周期事件，转换为依赖系统的状态更新事件
 *
 * @example
 * ```typescript
 * const listener = new DependencyEventListener(
 *   taskManagerEventEmitter,
 *   dependencyManager,
 *   { autoStart: true }
 * );
 *
 * // 后续可以停止监听
 * listener.stopListening();
 *
 * // 重新开始监听
 * listener.startListening();
 * ```
 */
export class DependencyEventListener {
  private taskEventEmitter: EventEmitter<TaskManagerEvents>;
  private dependencyManager: DependencyManager;
  private config: Required<DependencyEventListenerConfig>;

  /** 取消订阅函数列表 */
  private unsubscribers: Array<() => void> = [];

  /** 是否正在监听 */
  private listening: boolean = false;

  /** 事件转换记录（用于调试） */
  private conversionRecords: EventConversionRecord[] = [];

  /** 统计信息 */
  private stats = {
    totalProcessed: 0,
    successfulConversions: 0,
    failedConversions: 0,
  };

  /**
   * 创建依赖事件监听器
   *
   * @param taskEventEmitter 任务管理器事件发射器
   * @param dependencyManager 依赖管理器
   * @param config 配置选项
   */
  constructor(
    taskEventEmitter: EventEmitter<TaskManagerEvents>,
    dependencyManager: DependencyManager,
    config: DependencyEventListenerConfig = {}
  ) {
    this.taskEventEmitter = taskEventEmitter;
    this.dependencyManager = dependencyManager;
    this.config = {
      autoStart: config.autoStart ?? true,
      enableLogging: config.enableLogging ?? false,
      errorHandling: config.errorHandling ?? 'log',
    };

    if (this.config.autoStart) {
      this.startListening();
    }
  }

  // ==================== 生命周期管理 ====================

  /**
   * 开始监听任务事件
   *
   * 订阅以下任务事件：
   * - task:completed → dependency:resolved
   * - task:failed → dependency:failed
   * - task:cancelled → dependency:failed
   *
   * @returns 取消监听函数
   */
  startListening(): () => void {
    if (this.listening) {
      this.log('Already listening, skip');
      return () => this.stopListening();
    }

    this.listening = true;
    this.log('Starting to listen for task events');

    // 订阅任务完成事件
    const unsubCompleted = this.taskEventEmitter.on(
      'task:completed',
      (event: TaskCompletedEvent) => this.handleTaskCompleted(event)
    );
    this.unsubscribers.push(unsubCompleted);

    // 订阅任务失败事件
    const unsubFailed = this.taskEventEmitter.on(
      'task:failed',
      (event: TaskFailedEvent) => this.handleTaskFailed(event)
    );
    this.unsubscribers.push(unsubFailed);

    // 订阅任务取消事件
    const unsubCancelled = this.taskEventEmitter.on(
      'task:cancelled',
      (event: TaskCancelledEvent) => this.handleTaskCancelled(event)
    );
    this.unsubscribers.push(unsubCancelled);

    return () => this.stopListening();
  }

  /**
   * 停止监听任务事件
   *
   * 清除所有事件订阅
   */
  stopListening(): void {
    if (!this.listening) {
      return;
    }

    this.log('Stopping listening for task events');

    // 执行所有取消订阅函数
    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        this.handleError('Failed to unsubscribe', error);
      }
    }

    this.unsubscribers = [];
    this.listening = false;
  }

  /**
   * 检查是否正在监听
   */
  isListening(): boolean {
    return this.listening;
  }

  // ==================== 事件处理 ====================

  /**
   * 处理任务完成事件
   *
   * @param event 任务完成事件
   */
  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const startTime = Date.now();
    const taskId = event.flowId;

    this.log(`Task ${taskId} completed, converting to dependency:resolved`);

    try {
      await this.updateDownstreamDependencies(taskId, 'satisfied');

      this.recordConversion({
        originalEvent: 'task:completed',
        convertedEvent: 'dependency:resolved',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
      });

      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: 'task:completed',
        convertedEvent: 'dependency:resolved',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:completed for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }

  /**
   * 处理任务失败事件
   *
   * @param event 任务失败事件
   */
  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const startTime = Date.now();
    const taskId = event.flowId;

    this.log(`Task ${taskId} failed: ${event.error}, converting to dependency:failed`);

    try {
      await this.updateDownstreamDependencies(taskId, 'failed', event.error);

      this.recordConversion({
        originalEvent: 'task:failed',
        convertedEvent: 'dependency:failed',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
      });

      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: 'task:failed',
        convertedEvent: 'dependency:failed',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:failed for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }

  /**
   * 处理任务取消事件
   *
   * @param event 任务取消事件
   */
  private async handleTaskCancelled(event: TaskCancelledEvent): Promise<void> {
    const startTime = Date.now();
    const taskId = event.taskId;

    this.log(`Task ${taskId} cancelled: ${event.reason}, converting to dependency:failed`);

    try {
      await this.updateDownstreamDependencies(
        taskId,
        'failed',
        undefined, // No error for cancelled
        event.reason || 'Task cancelled' // skipReason
      );

      this.recordConversion({
        originalEvent: 'task:cancelled',
        convertedEvent: 'dependency:failed',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
      });

      this.stats.successfulConversions++;
    } catch (error) {
      this.recordConversion({
        originalEvent: 'task:cancelled',
        convertedEvent: 'dependency:failed',
        taskId,
        timestamp: event.timestamp,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      this.stats.failedConversions++;
      this.handleError(`Failed to handle task:cancelled for ${taskId}`, error);
    } finally {
      this.stats.totalProcessed++;
    }
  }

  /**
   * 更新下游依赖状态
   *
   * 当一个任务完成/失败时，需要更新所有依赖它的任务的依赖状态
   *
   * @param taskId 任务 ID（触发者）
   * @param status 新的依赖状态
   * @param error 错误信息（失败时）
   * @param skipReason 跳过原因（取消时）
   */
  private async updateDownstreamDependencies(
    taskId: string,
    status: DependencyItemStatus,
    error?: string,
    skipReason?: string
  ): Promise<void> {
    // 获取所有依赖此任务的任务
    const downstreamDeps = await this.dependencyManager.getDownstreamDependencies(taskId);

    this.log(`Found ${downstreamDeps.length} downstream dependencies for ${taskId}`);

    // 更新每个下游任务的依赖状态
    for (const dep of downstreamDeps) {
      try {
        await this.dependencyManager.updateDependencyStatus(
          dep.taskId,
          taskId,
          status,
          error,
          skipReason
        );

        this.log(`Updated ${dep.taskId}'s dependency on ${taskId} to ${status}`);
      } catch (err) {
        // 单个更新失败不影响其他更新
        this.handleError(`Failed to update ${dep.taskId}'s dependency on ${taskId}`, err);
      }
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 记录事件转换
   */
  private recordConversion(record: EventConversionRecord): void {
    this.conversionRecords.push(record);

    // 限制记录数量，防止内存泄漏
    if (this.conversionRecords.length > 1000) {
      this.conversionRecords = this.conversionRecords.slice(-500);
    }
  }

  /**
   * 获取事件转换记录
   */
  getConversionRecords(): EventConversionRecord[] {
    return [...this.conversionRecords];
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 清除转换记录和统计
   */
  reset(): void {
    this.conversionRecords = [];
    this.stats = {
      totalProcessed: 0,
      successfulConversions: 0,
      failedConversions: 0,
    };
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[DependencyEventListener] ${message}`);
    }
  }

  /**
   * 错误处理
   */
  private handleError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.config.errorHandling === 'throw') {
      throw new Error(`${message}: ${errorMessage}`);
    } else {
      console.error(`[DependencyEventListener] ${message}:`, errorMessage);
    }
  }

  // ==================== 清理 ====================

  /**
   * 销毁监听器
   *
   * 停止监听并清理资源
   */
  destroy(): void {
    this.stopListening();
    this.reset();
  }
}
