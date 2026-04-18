/**
 * OpenClaw Task Plugin v3.0 - Event Manager
 * 
 * 事件管理器实现，提供任务生命周期事件的监听和分发功能
 * 
 * @version 3.0.0
 * @author 架构专家
 */

import { EventEmitter } from '../managers/event-emitter';
import {
  TaskManagerEvents,
  TaskManagerEventData,
  EventType,
  TaskCreatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  SubTaskCreatedEvent,
  SubTaskCompletedEvent,
  HealthCheckEvent,
  HealthIssueEvent,
  OperationErrorEvent,
  TimeoutErrorEvent,
} from './event-types';

/**
 * 事件监听器配置
 */
export interface EventListenerConfig {
  /** 是否只监听一次 */
  once?: boolean;
  /** 优先级（数值越大优先级越高） */
  priority?: number;
}

/**
 * 事件统计信息
 */
export interface EventStats {
  /** 总事件数 */
  totalEvents: number;
  /** 各类型事件数量 */
  eventsByType: Map<EventType, number>;
  /** 总监听器数 */
  totalListeners: number;
  /** 各类型监听器数量 */
  listenersByType: Map<EventType, number>;
}

/**
 * 事件管理器
 * 
 * 提供类型安全的事件管理功能，支持：
 * - 事件监听（on）
 * - 事件发射（emit）
 * - 取消监听（off）
 * - 一次性监听（once）
 * - 批量监听（onMultiple）
 * - 事件统计（getStats）
 */
export class EventManager {
  /** 内部事件发射器 */
  private eventEmitter: EventEmitter<TaskManagerEventData>;
  
  /** 事件监听器映射（用于统计和off调用） */
  private listenerMap: Map<string, Map<Function, Function>>;
  
  /** 事件统计 */
  private eventStats: EventStats;
  
  /** 是否启用调试模式 */
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.eventEmitter = new EventEmitter<TaskManagerEventData>();
    this.listenerMap = new Map();
    this.debug = debug;
    this.eventStats = {
      totalEvents: 0,
      eventsByType: new Map(),
      totalListeners: 0,
      listenersByType: new Map(),
    };
  }

  /**
   * 注册事件监听器
   * 
   * @param eventType 事件类型
   * @param listener 监听器函数
   * @returns 取消监听函数
   */
  on<K extends EventType>(
    eventType: K,
    listener: TaskManagerEvents[K]
  ): () => void {
    // 更新统计
    const currentCount = this.eventStats.listenersByType.get(eventType) || 0;
    this.eventStats.listenersByType.set(eventType, currentCount + 1);
    this.eventStats.totalListeners++;

    // 注册监听器（类型安全转换）
    const wrappedListener = listener as (payload: TaskManagerEventData[K]) => void;
    const unsubscribe = this.eventEmitter.on(eventType, wrappedListener);

    // 保存监听器映射
    if (!this.listenerMap.has(eventType)) {
      this.listenerMap.set(eventType, new Map());
    }
    this.listenerMap.get(eventType)!.set(listener, wrappedListener);

    if (this.debug) {
      console.log(`[EventManager] Registered listener for event: ${eventType}`);
    }

    // 返回包装后的取消函数
    return () => {
      this.off(eventType, listener);
    };
  }

  /**
   * 发射事件
   * 
   * @param eventType 事件类型
   * @param payload 事件数据
   */
  emit<K extends EventType>(
    eventType: K,
    payload: TaskManagerEventData[K]
  ): void {
    // 更新统计
    const currentCount = this.eventStats.eventsByType.get(eventType) || 0;
    this.eventStats.eventsByType.set(eventType, currentCount + 1);
    this.eventStats.totalEvents++;

    if (this.debug) {
      console.log(`[EventManager] Emitting event: ${eventType}`, payload);
    }

    // 发射事件
    this.eventEmitter.emit(eventType, payload);
  }

  /**
   * 取消事件监听
   * 
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  off<K extends EventType>(
    eventType: K,
    listener: TaskManagerEvents[K]
  ): void {
    // 更新统计
    const currentCount = this.eventStats.listenersByType.get(eventType) || 0;
    if (currentCount > 0) {
      this.eventStats.listenersByType.set(eventType, currentCount - 1);
      this.eventStats.totalListeners--;
    }

    // 获取包装后的监听器
    const wrappedListener = this.listenerMap.get(eventType)?.get(listener);
    if (wrappedListener) {
      // 取消监听
      this.eventEmitter.off(eventType, wrappedListener as (payload: TaskManagerEventData[K]) => void);
      // 清理映射
      this.listenerMap.get(eventType)?.delete(listener);
    }

    if (this.debug) {
      console.log(`[EventManager] Unregistered listener for event: ${eventType}`);
    }
  }

  /**
   * 注册一次性事件监听器
   * 
   * @param eventType 事件类型
   * @param listener 监听器函数
   * @returns 取消监听函数
   */
  once<K extends EventType>(
    eventType: K,
    listener: TaskManagerEvents[K]
  ): () => void {
    // 更新统计
    const currentCount = this.eventStats.listenersByType.get(eventType) || 0;
    this.eventStats.listenersByType.set(eventType, currentCount + 1);
    this.eventStats.totalListeners++;

    if (this.debug) {
      console.log(`[EventManager] Registered once listener for event: ${eventType}`);
    }

    // 注册一次性监听器
    const wrappedListener = listener as (payload: TaskManagerEventData[K]) => void;
    const unsubscribe = this.eventEmitter.once(eventType, wrappedListener);
    
    // 保存映射
    if (!this.listenerMap.has(eventType)) {
      this.listenerMap.set(eventType, new Map());
    }
    this.listenerMap.get(eventType)!.set(listener, wrappedListener);
    
    return () => {
      // 手动触发后需要清理统计和映射
      const count = this.eventStats.listenersByType.get(eventType) || 0;
      if (count > 0) {
        this.eventStats.listenersByType.set(eventType, count - 1);
        this.eventStats.totalListeners--;
      }
      this.listenerMap.get(eventType)?.delete(listener);
      unsubscribe();
    };
  }

  /**
   * 批量注册事件监听器
   * 
   * @param listeners 监听器映射
   * @returns 取消所有监听的函数
   */
  onMultiple(
    listeners: Partial<{
      [K in EventType]: TaskManagerEvents[K];
    }>
  ): () => void {
    const unsubscribers: Array<() => void> = [];

    for (const [eventType, listener] of Object.entries(listeners)) {
      const unsubscribe = this.on(
        eventType as EventType,
        listener as TaskManagerEvents[EventType]
      );
      unsubscribers.push(unsubscribe);
    }

    // 返回取消所有监听的函数
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * 获取事件统计信息
   */
  getStats(): EventStats {
    return {
      ...this.eventStats,
      eventsByType: new Map(this.eventStats.eventsByType),
      listenersByType: new Map(this.eventStats.listenersByType),
    };
  }

  /**
   * 获取特定事件的监听器数量
   * 
   * @param eventType 事件类型
   */
  getListenerCount(eventType: EventType): number {
    return this.eventEmitter.listenerCount(eventType);
  }

  /**
   * 清除所有事件监听器
   */
  clearAll(): void {
    this.eventEmitter.clearAll();
    this.listenerMap.clear();
    this.eventStats.listenersByType.clear();
    this.eventStats.totalListeners = 0;

    if (this.debug) {
      console.log('[EventManager] Cleared all listeners');
    }
  }

  /**
   * 重置事件统计
   */
  resetStats(): void {
    this.eventStats.totalEvents = 0;
    this.eventStats.eventsByType.clear();
  }

  // ==================== 便捷方法 ====================

  /**
   * 发射任务创建事件
   */
  emitTaskCreated(flowId: string, goal: string, metadata?: Record<string, unknown>): void {
    this.emit('task:created', {
      flowId,
      goal,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * 发射任务启动事件
   */
  emitTaskStarted(flowId: string, goal: string, runtime?: string): void {
    this.emit('task:started', {
      flowId,
      goal,
      timestamp: Date.now(),
      runtime,
    });
  }

  /**
   * 发射任务完成事件
   */
  emitTaskCompleted(
    flowId: string,
    goal: string,
    duration: number,
    result?: unknown
  ): void {
    this.emit('task:completed', {
      flowId,
      goal,
      duration,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射任务失败事件
   */
  emitTaskFailed(
    flowId: string,
    goal: string,
    error: string,
    analysis?: any
  ): void {
    this.emit('task:failed', {
      flowId,
      goal,
      error,
      analysis,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射任务取消事件
   */
  emitTaskCancelled(taskId: string, flowId?: string, reason?: string): void {
    this.emit('task:cancelled', {
      taskId,
      flowId,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射子任务创建事件
   */
  emitSubTaskCreated(flowId: string, taskId: string, task: string): void {
    this.emit('subtask:created', {
      flowId,
      taskId,
      task,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射子任务完成事件
   */
  emitSubTaskCompleted(
    flowId: string,
    taskId: string,
    task: string,
    duration?: number,
    result?: unknown
  ): void {
    this.emit('subtask:completed', {
      flowId,
      taskId,
      task,
      duration,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射健康检查事件
   */
  emitHealthCheck(result: any): void {
    this.emit('health:check', {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射健康问题事件
   */
  emitHealthIssue(issue: any, taskId?: string): void {
    this.emit('health:issue', {
      issue,
      taskId,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射操作错误事件
   */
  emitOperationError(
    operation: string,
    error: string,
    context?: Record<string, unknown>
  ): void {
    this.emit('error:operation', {
      operation,
      error,
      context,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射超时错误事件
   */
  emitTimeoutError(taskId: string, timeout: number, flowId?: string): void {
    this.emit('error:timeout', {
      taskId,
      flowId,
      timeout,
      timestamp: Date.now(),
    });
  }
}
