/**
 * SessionTaskManager - 会话级任务管理器
 * 
 * 核心职责：
 * 1. 协调OpenClawBridge与上层应用
 * 2. 提供统一的任务管理接口
 * 3. 集成事件系统
 * 4. 处理错误和恢复机制
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import { 
  TaskRunView, 
  TaskRunDetail,
  TaskFlowView,
  TaskFlowDetail,
  TaskFlow,
  DeliveryContext,
} from '../types';
import { OpenClawBridge } from '../bridge';
import { 
  SessionTaskManagerConfig,
  TaskCreateOptions,
  SubTaskCreateParams,
  TaskQueryFilter,
  HealthCheckResult,
  HealthIssue,
  TaskManagerStats,
  TaskManagerEvents,
  TaskCreatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  SubTaskCreatedEvent,
  HealthCheckEvent,
  OperationErrorEvent,
  ManagerInitializedEvent,
  ManagerDestroyedEvent,
  TaskMemory,
  SessionTaskManagerError,
  isTaskStatus,
  isTaskRuntime,
} from './types';
import { EventEmitter } from './event-emitter';

/**
 * SessionTaskManager 实现
 * 
 * 管理当前会话的所有任务
 */
export class SessionTaskManager {
  // ==================== 成员变量 ====================
  
  /** 配置 */
  private config: Omit<Required<SessionTaskManagerConfig>, 'deliveryContext'> & { deliveryContext?: DeliveryContext };
  
  /** OpenClaw Bridge */
  private bridge: OpenClawBridge;
  
  /** 会话标识 */
  private sessionKey: string;
  
  /** 交付上下文 */
  private deliveryContext?: DeliveryContext;
  
  // 事件系统
  private eventEmitter: EventEmitter<TaskManagerEvents>;
  
  // 健康检查
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private lastHealthCheck?: HealthCheckResult;
  
  // 记忆存储（简化版）
  private memories: Map<string, TaskMemory> = new Map();
  
  // 活跃任务追踪
  private activeFlows: Map<string, TaskFlow> = new Map();
  
  // 状态
  private initialized: boolean = false;
  private destroyed: boolean = false;
  
  // ==================== 构造函数 ====================
  
  constructor(config: SessionTaskManagerConfig) {
    // 合并默认配置
    this.config = {
      sessionKey: config.sessionKey,
      bridge: config.bridge,
      deliveryContext: config.deliveryContext,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 60000, // 默认60秒
      timeoutThresholdMs: config.timeoutThresholdMs ?? 30 * 60 * 1000, // 默认30分钟
      maxRetries: config.maxRetries ?? 3,
      enableEvents: config.enableEvents ?? true,
      enableMemory: config.enableMemory ?? true,
    };
    
    this.bridge = config.bridge;
    this.sessionKey = config.sessionKey;
    this.deliveryContext = config.deliveryContext;
    
    // 初始化事件系统
    this.eventEmitter = new EventEmitter();
  }
  
  // ==================== 生命周期管理 ====================
  
  /**
   * 初始化管理器
   * - 验证API可用性
   * - 注册事件监听
   * - 启动健康检查
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new SessionTaskManagerError(
        'ALREADY_INITIALIZED',
        'SessionTaskManager already initialized'
      );
    }
    
    try {
      // 1. 验证API可用性
      this.verifyApiAvailability();
      
      // 2. 启动健康检查
      this.startHealthCheck();
      
      this.initialized = true;
      
      // 3. 触发初始化完成事件
      this.emit('manager:initialized', {
        sessionKey: this.sessionKey,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      throw new SessionTaskManagerError(
        'API_NOT_AVAILABLE',
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }
  
  /**
   * 销毁管理器
   * - 停止健康检查
   * - 清理资源
   * - 清空事件监听
   */
  async destroy(): Promise<void> {
    if (!this.initialized || this.destroyed) {
      return;
    }
    
    // 1. 停止健康检查
    this.stopHealthCheck();
    
    // 2. 清理记忆
    this.memories.clear();
    
    // 3. 清理活跃任务追踪
    this.activeFlows.clear();
    
    // 4. 标记为已销毁
    this.destroyed = true;
    
    // 5. 触发销毁事件（在清空监听器之前）
    this.emit('manager:destroyed', {
      sessionKey: this.sessionKey,
      timestamp: Date.now(),
    });
    
    // 6. 清空事件监听器
    this.eventEmitter.clearAll();
  }
  
  // ==================== 任务管理 ====================
  
  /**
   * 创建主任务（TaskFlow）
   * @param goal 任务目标
   * @param options 任务选项
   * @returns TaskFlow记录
   */
  async createMainTask(
    goal: string, 
    options?: TaskCreateOptions
  ): Promise<TaskFlow> {
    this.ensureInitialized();
    
    // 验证参数
    if (!goal || typeof goal !== 'string') {
      throw new SessionTaskManagerError(
        'INVALID_PARAMS',
        'Goal must be a non-empty string'
      );
    }
    
    try {
      // 1. 创建TaskFlow
      const flow = await this.bridge.createTaskFlow({
        name: options?.title || goal,
        description: options?.description,
        tasks: [{
          title: goal,
          runtime: options?.runtime || 'acp',
          timeout: options?.timeout,
          metadata: options?.metadata,
        }],
        metadata: {
          tags: options?.tags,
          priority: options?.priority,
          createdAt: Date.now(),
        },
      });
      
      // 2. 记录到记忆系统
      if (this.config.enableMemory) {
        const memory: TaskMemory = {
          flowId: flow.flowId,
          goal,
          status: 'pending',
          startTime: Date.now(),
          metadata: options?.metadata,
        };
        this.memories.set(flow.flowId, memory);
      }
      
      // 3. 追踪活跃任务
      this.activeFlows.set(flow.flowId, flow);
      
      // 4. 触发事件
      const event: TaskCreatedEvent = {
        flowId: flow.flowId,
        goal,
        timestamp: Date.now(),
        metadata: options?.metadata,
      };
      this.emit('task:created', event);
      
      return flow;
      
    } catch (error) {
      throw new SessionTaskManagerError(
        'TASK_CREATION_FAILED',
        `Failed to create main task: ${error instanceof Error ? error.message : String(error)}`,
        { goal, options, originalError: error }
      );
    }
  }
  
  /**
   * 创建子任务
   * @param params 子任务参数
   * @returns Task记录
   */
  async createSubTask(params: SubTaskCreateParams): Promise<TaskRunDetail> {
    this.ensureInitialized();
    
    // 验证参数
    if (!params.flowId || !params.childSessionKey || !params.task) {
      throw new SessionTaskManagerError(
        'INVALID_PARAMS',
        'flowId, childSessionKey, and task are required'
      );
    }
    
    try {
      // 1. 验证父Flow存在
      const parentFlow = await this.bridge.getTaskFlow(params.flowId);
      if (!parentFlow) {
        throw new SessionTaskManagerError(
          'PARENT_FLOW_NOT_FOUND',
          `Parent flow not found: ${params.flowId}`
        );
      }
      
      // 2. 创建子任务
      const task = await this.bridge.createTask({
        title: params.task,
        runtime: params.runtime || 'acp',
        timeout: params.timeout,
        parentFlowId: params.flowId,
        metadata: {
          childSessionKey: params.childSessionKey,
          label: params.label,
          ...params.metadata,
        },
      });
      
      // 3. 更新记忆
      if (this.config.enableMemory) {
        const memory = this.memories.get(params.flowId);
        if (memory) {
          if (!memory.subtasks) {
            memory.subtasks = [];
          }
          memory.subtasks.push({
            taskId: task.taskId,
            title: params.task,
            status: 'pending',
            startTime: Date.now(),
          });
        }
      }
      
      // 4. 触发事件
      const event: SubTaskCreatedEvent = {
        flowId: params.flowId,
        taskId: task.taskId,
        task: params.task,
        timestamp: Date.now(),
      };
      this.emit('subtask:created', event);
      
      // 5. 获取完整详情并返回
      const taskDetail = await this.bridge.getTask(task.taskId);
      if (!taskDetail) {
        throw new SessionTaskManagerError(
          'TASK_NOT_FOUND',
          `Created task not found: ${task.taskId}`
        );
      }
      
      return taskDetail;
      
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        'TASK_CREATION_FAILED',
        `Failed to create subtask: ${error instanceof Error ? error.message : String(error)}`,
        { params, originalError: error }
      );
    }
  }
  
  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<TaskRunDetail | undefined> {
    this.ensureInitialized();
    return this.bridge.getTask(taskId);
  }
  
  /**
   * 获取TaskFlow详情
   */
  async getTaskFlow(flowId: string): Promise<TaskFlowDetail | undefined> {
    this.ensureInitialized();
    return this.bridge.getTaskFlow(flowId);
  }
  
  /**
   * 列出当前会话的任务
   */
  async listTasks(): Promise<TaskRunView[]> {
    this.ensureInitialized();
    return this.bridge.listTasks();
  }
  
  /**
   * 查询任务（支持过滤）
   * 
   * 实现客户端过滤，因为OpenClaw API的list()不支持参数
   */
  async queryTasks(filter?: TaskQueryFilter): Promise<TaskRunView[]> {
    this.ensureInitialized();
    
    // 获取所有任务
    let tasks = await this.bridge.listTasks();
    
    // 应用过滤器
    if (filter) {
      tasks = this.applyTaskFilter(tasks, filter);
    }
    
    return tasks;
  }
  
  /**
   * 取消任务
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      // 1. 取消任务
      const result = await this.bridge.cancelTask(taskId, reason);
      
      if (!result.cancelled) {
        throw new SessionTaskManagerError(
          'CANCEL_FAILED',
          `Failed to cancel task: ${result.reason}`
        );
      }
      
      // 2. 触发事件
      const event: TaskCancelledEvent = {
        taskId,
        reason,
        timestamp: Date.now(),
      };
      this.emit('task:cancelled', event);
      
      // 3. 更新记忆
      if (this.config.enableMemory) {
        for (const [flowId, memory] of this.memories) {
          if (memory.subtasks) {
            const subtask = memory.subtasks.find(s => s.taskId === taskId);
            if (subtask) {
              subtask.status = 'cancelled';
              subtask.endTime = Date.now();
              break;
            }
          }
        }
      }
      
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        'CANCEL_FAILED',
        `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, reason, originalError: error }
      );
    }
  }
  
  /**
   * 完成任务
   */
  async completeTask(flowId: string, result?: unknown): Promise<void> {
    this.ensureInitialized();
    
    try {
      // 1. 获取TaskFlow
      const flow = await this.bridge.getTaskFlow(flowId);
      if (!flow) {
        throw new SessionTaskManagerError(
          'FLOW_NOT_FOUND',
          `TaskFlow not found: ${flowId}`
        );
      }
      
      // 2. 更新记忆
      if (this.config.enableMemory) {
        const memory = this.memories.get(flowId);
        if (memory) {
          memory.status = 'succeeded';
          memory.endTime = Date.now();
          memory.duration = memory.endTime - memory.startTime;
          memory.result = result;
        }
      }
      
      // 3. 发送通知（简化版，暂不实现）
      // TODO: 集成通知系统
      
      // 4. 触发事件
      const event: TaskCompletedEvent = {
        flowId,
        goal: flow.name,
        duration: this.memories.get(flowId)?.duration || 0,
        result,
        timestamp: Date.now(),
      };
      this.emit('task:completed', event);
      
      // 5. 从活跃任务中移除
      this.activeFlows.delete(flowId);
      
    } catch (error) {
      if (error instanceof SessionTaskManagerError) {
        throw error;
      }
      throw new SessionTaskManagerError(
        'TASK_NOT_FOUND',
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
        { flowId, originalError: error }
      );
    }
  }
  
  /**
   * 标记任务失败
   */
  async failTask(flowId: string, error: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      // 1. 获取TaskFlow
      const flow = await this.bridge.getTaskFlow(flowId);
      if (!flow) {
        throw new SessionTaskManagerError(
          'FLOW_NOT_FOUND',
          `TaskFlow not found: ${flowId}`
        );
      }
      
      // 2. 更新记忆
      if (this.config.enableMemory) {
        const memory = this.memories.get(flowId);
        if (memory) {
          memory.status = 'failed';
          memory.endTime = Date.now();
          memory.duration = memory.endTime - memory.startTime;
          memory.error = error;
        }
      }
      
      // 3. 触发事件
      const event: TaskFailedEvent = {
        flowId,
        goal: flow.name,
        error,
        timestamp: Date.now(),
      };
      this.emit('task:failed', event);
      
      // 4. 从活跃任务中移除
      this.activeFlows.delete(flowId);
      
    } catch (err) {
      if (err instanceof SessionTaskManagerError) {
        throw err;
      }
      throw new SessionTaskManagerError(
        'FLOW_NOT_FOUND',
        `Failed to mark task as failed: ${err instanceof Error ? err.message : String(err)}`,
        { flowId, error, originalError: err }
      );
    }
  }
  
  // ==================== 事件管理 ====================
  
  /**
   * 注册事件监听器
   */
  on<K extends keyof TaskManagerEvents>(
    eventType: K, 
    listener: (event: TaskManagerEvents[K]) => void
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }
  
  /**
   * 触发事件
   */
  emit<K extends keyof TaskManagerEvents>(
    eventType: K, 
    payload: TaskManagerEvents[K]
  ): void {
    this.eventEmitter.emit(eventType, payload);
  }
  
  // ==================== 记忆管理 ====================
  
  /**
   * 获取任务记忆
   */
  async getMemory(flowId: string): Promise<TaskMemory | undefined> {
    this.ensureInitialized();
    return this.memories.get(flowId);
  }
  
  /**
   * 搜索相关记忆（简化版）
   */
  async searchMemories(query: string, limit?: number): Promise<TaskMemory[]> {
    this.ensureInitialized();
    
    const memories: TaskMemory[] = [];
    let count = 0;
    const maxResults = limit ?? 10;
    
    for (const memory of this.memories.values()) {
      if (count >= maxResults) break;
      
      // 简单的字符串匹配
      if (memory.goal.includes(query)) {
        memories.push(memory);
        count++;
      }
    }
    
    return memories;
  }
  
  /**
   * 刷新记忆到磁盘（简化版，暂不实现）
   */
  async flushMemory(): Promise<void> {
    // TODO: 实现持久化
    console.log('Memory flush not implemented yet');
  }
  
  // ==================== 健康检查 ====================
  
  /**
   * 执行健康检查
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    this.ensureInitialized();
    
    const now = Date.now();
    const issues: HealthIssue[] = [];
    const timeoutTasks: TaskRunView[] = [];
    const errorTasks: TaskRunView[] = [];
    
    try {
      // 1. 获取运行中任务
      const runningTasks = await this.queryTasks({ status: 'running' });
      
      // 2. 检查超时
      for (const task of runningTasks) {
        const lastEventAt = task.updatedAt || task.createdAt;
        const lastEventTime = new Date(lastEventAt).getTime();
        
        if (now - lastEventTime > this.config.timeoutThresholdMs) {
          timeoutTasks.push(task);
          issues.push({
            type: 'timeout',
            message: `任务超时: ${task.title || task.taskId}`,
            taskId: task.taskId,
            severity: 'high',
            suggestedAction: '取消或重试任务',
          });
        }
      }
      
      // 3. 检查错误任务
      const failedTasks = await this.queryTasks({ status: 'failed' });
      for (const task of failedTasks) {
        errorTasks.push(task);
        issues.push({
          type: 'error',
          message: `任务失败: ${task.title || task.taskId}`,
          taskId: task.taskId,
          severity: 'medium',
          suggestedAction: '分析失败原因并重试',
        });
      }
      
      // 4. 构建结果
      const result: HealthCheckResult = {
        healthy: issues.length === 0,
        runningCount: runningTasks.length,
        timeoutTasks,
        errorTasks,
        checkedAt: now,
        issues,
      };
      
      this.lastHealthCheck = result;
      
      // 5. 触发事件
      const event: HealthCheckEvent = {
        result,
        timestamp: now,
      };
      this.emit('health:check', event);
      
      if (issues.length > 0) {
        this.emit('health:issue', {
          issue: issues[0],
          taskId: issues[0].taskId,
          timestamp: now,
        });
      }
      
      return result;
      
    } catch (error) {
      // 健康检查失败，记录错误
      const errorEvent: OperationErrorEvent = {
        operation: 'health_check',
        error: error instanceof Error ? error.message : String(error),
        timestamp: now,
      };
      this.emit('error:operation', errorEvent);
      
      // 返回异常结果
      return {
        healthy: false,
        runningCount: 0,
        timeoutTasks: [],
        errorTasks: [],
        checkedAt: now,
        issues: [{
          type: 'error',
          message: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'high',
        }],
      };
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats(): TaskManagerStats {
    const memories = Array.from(this.memories.values());
    
    const completed = memories.filter(m => m.status === 'succeeded');
    const failed = memories.filter(m => m.status === 'failed');
    const running = memories.filter(m => m.status === 'running');
    
    // 计算平均执行时长
    const durations = completed
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);
    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;
    
    // 计算成功率
    const total = completed.length + failed.length;
    const successRate = total > 0 ? completed.length / total : 0;
    
    return {
      totalTasks: this.memories.size,
      runningTasks: running.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      averageDuration,
      successRate,
      activeTimers: this.healthCheckTimer ? 1 : 0,
    };
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new SessionTaskManagerError(
        'NOT_INITIALIZED',
        'SessionTaskManager not initialized, call initialize() first'
      );
    }
    
    if (this.destroyed) {
      throw new SessionTaskManagerError(
        'DESTROYED',
        'SessionTaskManager has been destroyed'
      );
    }
  }
  
  /**
   * 验证API可用性
   */
  private verifyApiAvailability(): void {
    const availability = this.bridge.checkApiAvailability();
    
    if (!availability.taskFlow) {
      throw new SessionTaskManagerError(
        'API_NOT_AVAILABLE',
        'TaskFlow API not available'
      );
    }
    
    if (!availability.tasks) {
      throw new SessionTaskManagerError(
        'API_NOT_AVAILABLE',
        'Tasks API not available'
      );
    }
  }
  
  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check failed:', error);
      });
    }, this.config.healthCheckIntervalMs);
  }
  
  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
  
  /**
   * 应用任务过滤器
   */
  private applyTaskFilter(tasks: TaskRunView[], filter: TaskQueryFilter): TaskRunView[] {
    let filtered = tasks;
    
    // 状态过滤
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter(task => {
        const taskStatus = task.status;
        return statuses.some(s => s === taskStatus);
      });
    }
    
    // 运行时过滤
    if (filter.runtime) {
      const runtimes = Array.isArray(filter.runtime) ? filter.runtime : [filter.runtime];
      filtered = filtered.filter(task => {
        const taskRuntime = task.runtime;
        return runtimes.some(r => r === taskRuntime);
      });
    }
    
    // 标签过滤（简化实现）
    if (filter.label) {
      filtered = filtered.filter(task => 
        task.title && task.title.includes(filter.label!)
      );
    }
    
    // 数量限制
    if (filter.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }
}