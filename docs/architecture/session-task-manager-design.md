# SessionTaskManager 接口设计文档

> **设计时间**: 2026-04-16  
> **设计者**: 架构专家  
> **版本**: v1.0  
> **状态**: 设计中

---

## 一、设计概述

### 1.1 核心定位

**SessionTaskManager** 是任务插件 v3.0 的核心协调器，负责：

1. **协调** OpenClawBridge 与上层应用
2. **提供** 统一的任务管理接口
3. **集成** 事件系统和记忆管理
4. **处理** 错误和恢复机制

### 1.2 架构位置

```
Application Layer (Plugin Entry, Webhook, Cron)
         ↓
┌─────────────────────────────────────────────┐
│  Coordination Layer                          │
│  ┌─────────────────────────────────────────┐ │
│  │     SessionTaskManager (本设计)         │ │
│  │  - 任务生命周期管理                      │ │
│  │  - 事件监听与分发                        │ │
│  │  - 记忆系统集成                          │ │
│  │  - 错误处理与恢复                        │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         ↓
Integration Layer (OpenClawBridge)
         ↓
Capability Layer (Memory, Workflow, Intelligence)
         ↓
Infrastructure Layer (Store, Timer, Notifier)
         ↓
OpenClaw Native (TaskFlow, Task, Events)
```

### 1.3 设计原则

| 原则 | 说明 | 实现方式 |
|------|------|----------|
| **单一职责** | 只负责任务协调，不处理具体业务逻辑 | 委托给子组件 |
| **依赖注入** | 通过构造函数注入依赖 | 接受 OpenClawBridge 实例 |
| **接口隔离** | 提供清晰的接口分离 | 分离任务管理、事件、记忆接口 |
| **开闭原则** | 对扩展开放，对修改关闭 | 使用策略模式处理不同场景 |

---

## 二、核心接口定义

### 2.1 主接口

```typescript
/**
 * SessionTaskManager - 会话级任务管理器
 * 
 * 核心协调器，管理当前会话的所有任务
 */
export interface ISessionTaskManager {
  // ==================== 生命周期管理 ====================
  
  /**
   * 初始化管理器
   * - 绑定会话
   * - 注册事件监听
   * - 启动健康检查
   */
  initialize(): Promise<void>;
  
  /**
   * 销毁管理器
   * - 清理事件监听
   * - 停止健康检查
   * - 保存记忆
   */
  destroy(): Promise<void>;
  
  // ==================== 任务管理 ====================
  
  /**
   * 创建主任务（TaskFlow）
   * @param goal 任务目标
   * @param options 任务选项
   * @returns TaskFlow记录
   */
  createMainTask(
    goal: string, 
    options?: TaskCreateOptions
  ): Promise<TaskFlowRecord>;
  
  /**
   * 创建子任务
   * @param params 子任务参数
   * @returns Task记录
   */
  createSubTask(params: SubTaskCreateParams): Promise<TaskRecord>;
  
  /**
   * 获取任务详情
   * @param taskId 任务ID
   */
  getTask(taskId: string): Promise<TaskRunDetail | undefined>;
  
  /**
   * 获取TaskFlow详情
   * @param flowId Flow ID
   */
  getTaskFlow(flowId: string): Promise<TaskFlowDetail | undefined>;
  
  /**
   * 列出当前会话的任务
   */
  listTasks(): Promise<TaskRunView[]>;
  
  /**
   * 查询任务（支持过滤）
   * @param filter 过滤条件
   */
  queryTasks(filter?: TaskQueryFilter): Promise<TaskRunView[]>;
  
  /**
   * 取消任务
   * @param taskId 任务ID
   * @param reason 取消原因
   */
  cancelTask(taskId: string, reason?: string): Promise<void>;
  
  /**
   * 完成任务
   * @param flowId Flow ID
   * @param result 任务结果
   */
  completeTask(flowId: string, result?: unknown): Promise<void>;
  
  /**
   * 标记任务失败
   * @param flowId Flow ID
   * @param error 错误信息
   */
  failTask(flowId: string, error: string): Promise<void>;
  
  // ==================== 事件管理 ====================
  
  /**
   * 注册事件监听器
   * @param eventType 事件类型
   * @param listener 监听器
   */
  on<K extends keyof TaskManagerEvents>(
    eventType: K, 
    listener: TaskManagerEvents[K]
  ): () => void;
  
  /**
   * 触发事件
   * @param eventType 事件类型
   * @param payload 事件数据
   */
  emit<K extends keyof TaskManagerEvents>(
    eventType: K, 
    payload: Parameters<TaskManagerEvents[K]>[0]
  ): void;
  
  // ==================== 记忆管理 ====================
  
  /**
   * 获取任务记忆
   * @param flowId Flow ID
   */
  getMemory(flowId: string): Promise<TaskMemory | undefined>;
  
  /**
   * 搜索相关记忆
   * @param query 查询字符串
   * @param limit 返回数量
   */
  searchMemories(query: string, limit?: number): Promise<TaskMemory[]>;
  
  /**
   * 刷新记忆到磁盘
   */
  flushMemory(): Promise<void>;
  
  // ==================== 健康检查 ====================
  
  /**
   * 执行健康检查
   */
  performHealthCheck(): Promise<HealthCheckResult>;
  
  /**
   * 获取统计信息
   */
  getStats(): TaskManagerStats;
}
```

### 2.2 配置接口

```typescript
/**
 * SessionTaskManager 配置
 */
export interface SessionTaskManagerConfig {
  /** 会话标识 */
  sessionKey: string;
  
  /** 交付上下文 */
  deliveryContext?: DeliveryContext;
  
  /** OpenClaw Bridge实例 */
  bridge: OpenClawBridge;
  
  /** 记忆管理器配置 */
  memoryConfig?: MemoryManagerConfig;
  
  /** 工作流引擎配置 */
  workflowConfig?: WorkflowEngineConfig;
  
  /** 智能分析引擎配置 */
  intelligenceConfig?: IntelligenceEngineConfig;
  
  /** 健康检查间隔（毫秒） */
  healthCheckIntervalMs?: number;
  
  /** 超时阈值（毫秒） */
  timeoutThresholdMs?: number;
  
  /** 最大重试次数 */
  maxRetries?: number;
  
  /** 是否启用事件监听 */
  enableEvents?: boolean;
  
  /** 是否启用智能分析 */
  enableIntelligence?: boolean;
}

/**
 * 任务创建选项
 */
export interface TaskCreateOptions {
  /** 任务标题 */
  title?: string;
  
  /** 任务描述 */
  description?: string;
  
  /** 运行时类型 */
  runtime?: TaskRuntime;
  
  /** 超时时间（毫秒） */
  timeout?: number;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
  
  /** 标签 */
  tags?: string[];
  
  /** 优先级 */
  priority?: 'high' | 'normal' | 'low';
}

/**
 * 子任务创建参数
 */
export interface SubTaskCreateParams {
  /** 父Flow ID */
  flowId: string;
  
  /** 子会话标识 */
  childSessionKey: string;
  
  /** 任务内容 */
  task: string;
  
  /** 任务标签 */
  label?: string;
  
  /** 运行时类型 */
  runtime?: TaskRuntime;
  
  /** 超时时间 */
  timeout?: number;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务查询过滤器
 */
export interface TaskQueryFilter {
  /** 状态过滤 */
  status?: TaskStatus | TaskStatus[];
  
  /** 运行时过滤 */
  runtime?: TaskRuntime | TaskRuntime[];
  
  /** 开始时间范围 */
  startedAfter?: number;
  startedBefore?: number;
  
  /** 标签过滤 */
  label?: string;
  
  /** 限制数量 */
  limit?: number;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  /** 是否健康 */
  healthy: boolean;
  
  /** 运行中任务数 */
  runningCount: number;
  
  /** 超时任务 */
  timeoutTasks: TaskRunView[];
  
  /** 错误任务 */
  errorTasks: TaskRunView[];
  
  /** 检查时间 */
  checkedAt: number;
  
  /** 问题列表 */
  issues: HealthIssue[];
}

/**
 * 健康问题
 */
export interface HealthIssue {
  /** 问题类型 */
  type: 'timeout' | 'error' | 'stuck' | 'resource';
  
  /** 问题描述 */
  message: string;
  
  /** 相关任务ID */
  taskId?: string;
  
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high';
  
  /** 建议操作 */
  suggestedAction?: string;
}

/**
 * 统计信息
 */
export interface TaskManagerStats {
  /** 总任务数 */
  totalTasks: number;
  
  /** 运行中任务数 */
  runningTasks: number;
  
  /** 完成任务数 */
  completedTasks: number;
  
  /** 失败任务数 */
  failedTasks: number;
  
  /** 平均执行时长 */
  averageDuration: number;
  
  /** 成功率 */
  successRate: number;
  
  /** 记忆数量 */
  memoryCount: number;
  
  /** 活跃定时器数 */
  activeTimers: number;
}
```

### 2.3 事件接口

```typescript
/**
 * TaskManager 事件类型定义
 */
export interface TaskManagerEvents {
  // 任务生命周期事件
  'task:created': (event: TaskCreatedEvent) => void;
  'task:started': (event: TaskStartedEvent) => void;
  'task:completed': (event: TaskCompletedEvent) => void;
  'task:failed': (event: TaskFailedEvent) => void;
  'task:cancelled': (event: TaskCancelledEvent) => void;
  
  // 子任务事件
  'subtask:created': (event: SubTaskCreatedEvent) => void;
  'subtask:completed': (event: SubTaskCompletedEvent) => void;
  
  // 健康检查事件
  'health:check': (event: HealthCheckEvent) => void;
  'health:issue': (event: HealthIssueEvent) => void;
  
  // 错误事件
  'error:operation': (event: OperationErrorEvent) => void;
  'error:timeout': (event: TimeoutErrorEvent) => void;
  
  // 记忆事件
  'memory:saved': (event: MemorySavedEvent) => void;
  'memory:refined': (event: MemoryRefinedEvent) => void;
}

/**
 * 任务创建事件
 */
export interface TaskCreatedEvent {
  flowId: string;
  goal: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 任务完成事件
 */
export interface TaskCompletedEvent {
  flowId: string;
  goal: string;
  duration: number;
  result?: unknown;
  timestamp: number;
}

/**
 * 任务失败事件
 */
export interface TaskFailedEvent {
  flowId: string;
  goal: string;
  error: string;
  analysis?: FailureAnalysis;
  timestamp: number;
}

/**
 * 任务取消事件
 */
export interface TaskCancelledEvent {
  taskId: string;
  flowId?: string;
  reason?: string;
  timestamp: number;
}

/**
 * 健康检查事件
 */
export interface HealthCheckEvent {
  result: HealthCheckResult;
  timestamp: number;
}

/**
 * 健康问题事件
 */
export interface HealthIssueEvent {
  issue: HealthIssue;
  taskId?: string;
  timestamp: number;
}

/**
 * 操作错误事件
 */
export interface OperationErrorEvent {
  operation: string;
  error: string;
  context?: Record<string, unknown>;
  timestamp: number;
}
```

### 2.4 记忆接口

```typescript
/**
 * 任务记忆
 */
export interface TaskMemory {
  /** Flow ID */
  flowId: string;
  
  /** 任务目标 */
  goal: string;
  
  /** 任务状态 */
  status: TaskStatus;
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime?: number;
  
  /** 执行时长 */
  duration?: number;
  
  /** 任务结果 */
  result?: unknown;
  
  /** 错误信息 */
  error?: string;
  
  /** 工具使用记录 */
  tools: ToolUsage[];
  
  /** 决策记录 */
  decisions: Decision[];
  
  /** 经验教训 */
  lessons: Lesson[];
  
  /** 子任务 */
  subtasks?: SubTaskMemory[];
  
  /** 失败分析 */
  failureAnalysis?: FailureAnalysis;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 工具使用记录
 */
export interface ToolUsage {
  /** 工具名称 */
  tool: string;
  
  /** 调用参数 */
  params?: Record<string, unknown>;
  
  /** 返回结果 */
  result?: unknown;
  
  /** 调用时间 */
  timestamp: number;
  
  /** 执行时长 */
  duration?: number;
  
  /** 是否成功 */
  success: boolean;
}

/**
 * 决策记录
 */
export interface Decision {
  /** 决策ID */
  id: string;
  
  /** 决策描述 */
  description: string;
  
  /** 决策选项 */
  options: string[];
  
  /** 选择的选项 */
  chosen: string;
  
  /** 决策理由 */
  reasoning?: string;
  
  /** 决策时间 */
  timestamp: number;
  
  /** 决策结果 */
  outcome?: 'positive' | 'neutral' | 'negative';
}

/**
 * 经验教训
 */
export interface Lesson {
  /** 教训类型 */
  type: 'success' | 'failure' | 'optimization';
  
  /** 教训描述 */
  description: string;
  
  /** 相关因素 */
  factors?: string[];
  
  /** 预防措施 */
  prevention?: string[];
  
  /** 时间戳 */
  timestamp: number;
}

/**
 * 子任务记忆
 */
export interface SubTaskMemory {
  /** 任务ID */
  taskId: string;
  
  /** 任务标题 */
  title: string;
  
  /** 任务状态 */
  status: TaskStatus;
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime?: number;
  
  /** 执行时长 */
  duration?: number;
  
  /** 结果 */
  result?: unknown;
}

/**
 * 失败分析
 */
export interface FailureAnalysis {
  /** 失败因素 */
  factors: string[];
  
  /** 是否应该重试 */
  shouldRetry: boolean;
  
  /** 重试延迟（毫秒） */
  retryDelay: number;
  
  /** 预防措施 */
  prevention: string[];
  
  /** 建议 */
  suggestion?: string;
}
```

---

## 三、类实现设计

### 3.1 类结构

```typescript
/**
 * SessionTaskManager 实现
 */
export class SessionTaskManager implements ISessionTaskManager {
  // ==================== 成员变量 ====================
  
  /** 配置 */
  private config: SessionTaskManagerConfig;
  
  /** OpenClaw Bridge */
  private bridge: OpenClawBridge;
  
  /** 会话标识 */
  private sessionKey: string;
  
  /** 交付上下文 */
  private deliveryContext?: DeliveryContext;
  
  // 子组件
  private memoryManager: MemoryManager;
  private workflowEngine: WorkflowEngine;
  private intelligenceEngine: IntelligenceEngine;
  private timerManager: TimerManager;
  private notifier: Notifier;
  
  // 事件系统
  private eventEmitter: EventEmitter<TaskManagerEvents>;
  private agentEventUnsubscribe?: () => void;
  
  // 健康检查
  private healthCheckTimer?: NodeJS.Timeout;
  private lastHealthCheck?: HealthCheckResult;
  
  // 状态
  private initialized: boolean = false;
  private destroyed: boolean = false;
  
  // ==================== 构造函数 ====================
  
  constructor(config: SessionTaskManagerConfig) {
    this.config = {
      healthCheckIntervalMs: 60000,
      timeoutThresholdMs: 30 * 60 * 1000, // 30分钟
      maxRetries: 3,
      enableEvents: true,
      enableIntelligence: true,
      ...config,
    };
    
    this.bridge = config.bridge;
    this.sessionKey = config.sessionKey;
    this.deliveryContext = config.deliveryContext;
    
    // 初始化子组件
    this.memoryManager = new MemoryManager(config.memoryConfig);
    this.workflowEngine = new WorkflowEngine(config.workflowConfig);
    this.intelligenceEngine = new IntelligenceEngine(config.intelligenceConfig);
    this.timerManager = new TimerManager();
    this.notifier = new Notifier(this.deliveryContext);
    
    // 初始化事件系统
    this.eventEmitter = new EventEmitter();
  }
  
  // ==================== 生命周期管理 ====================
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new TaskOperationError(
        'ALREADY_INITIALIZED',
        'SessionTaskManager already initialized'
      );
    }
    
    // 1. 验证API可用性
    this.verifyApiAvailability();
    
    // 2. 注册事件监听
    if (this.config.enableEvents) {
      this.registerAgentEventListeners();
    }
    
    // 3. 启动健康检查
    this.startHealthCheck();
    
    // 4. 初始化子组件
    await this.memoryManager.initialize();
    await this.workflowEngine.initialize();
    
    this.initialized = true;
    
    // 触发初始化完成事件
    this.emit('task:created', {
      flowId: 'init',
      goal: 'SessionTaskManager initialized',
      timestamp: Date.now(),
    });
  }
  
  async destroy(): Promise<void> {
    if (!this.initialized || this.destroyed) {
      return;
    }
    
    // 1. 停止健康检查
    this.stopHealthCheck();
    
    // 2. 取消事件监听
    if (this.agentEventUnsubscribe) {
      this.agentEventUnsubscribe();
      this.agentEventUnsubscribe = undefined;
    }
    
    // 3. 清理定时器
    this.timerManager.clearAll();
    
    // 4. 保存记忆
    await this.memoryManager.flush();
    
    // 5. 清理子组件
    await this.memoryManager.destroy();
    await this.workflowEngine.destroy();
    
    this.destroyed = true;
  }
  
  // ==================== 任务管理 ====================
  
  async createMainTask(
    goal: string,
    options?: TaskCreateOptions
  ): Promise<TaskFlowRecord> {
    this.ensureInitialized();
    
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
    await this.memoryManager.recordTaskStart(flow.flowId, goal, options);
    
    // 3. 触发事件
    this.emit('task:created', {
      flowId: flow.flowId,
      goal,
      timestamp: Date.now(),
      metadata: options?.metadata,
    });
    
    // 4. 发送通知
    await this.notifier.notify('task_created', `主任务已创建: ${goal}`);
    
    return flow;
  }
  
  async createSubTask(params: SubTaskCreateParams): Promise<TaskRecord> {
    this.ensureInitialized();
    
    // 1. 验证父Flow存在
    const parentFlow = await this.bridge.getTaskFlow(params.flowId);
    if (!parentFlow) {
      throw new TaskOperationError(
        'PARENT_FLOW_NOT_FOUND',
        `Parent flow not found: ${params.flowId}`
      );
    }
    
    // 2. 创建子任务（使用OpenClaw的runTask或类似API）
    // 注意：具体实现需要根据OpenClaw API调整
    const task = await this.createTaskInFlow(params);
    
    // 3. 记录到记忆系统
    await this.memoryManager.recordSubtaskStart(params.flowId, task);
    
    // 4. 触发事件
    this.emit('subtask:created', {
      flowId: params.flowId,
      taskId: task.taskId,
      task: params.task,
      timestamp: Date.now(),
    });
    
    return task;
  }
  
  async getTask(taskId: string): Promise<TaskRunDetail | undefined> {
    this.ensureInitialized();
    return this.bridge.getTask(taskId);
  }
  
  async getTaskFlow(flowId: string): Promise<TaskFlowDetail | undefined> {
    this.ensureInitialized();
    return this.bridge.getTaskFlow(flowId);
  }
  
  async listTasks(): Promise<TaskRunView[]> {
    this.ensureInitialized();
    return this.bridge.listTasks();
  }
  
  async queryTasks(filter?: TaskQueryFilter): Promise<TaskRunView[]> {
    this.ensureInitialized();
    return this.bridge.queryTasks(filter);
  }
  
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    this.ensureInitialized();
    
    // 1. 取消任务
    const result = await this.bridge.cancelTask(taskId, reason);
    
    if (!result.cancelled) {
      throw new TaskOperationError(
        'CANCEL_FAILED',
        `Failed to cancel task: ${result.reason}`
      );
    }
    
    // 2. 触发事件
    this.emit('task:cancelled', {
      taskId,
      reason,
      timestamp: Date.now(),
    });
    
    // 3. 发送通知
    await this.notifier.notify('task_cancelled', `任务已取消: ${taskId}`);
  }
  
  async completeTask(flowId: string, result?: unknown): Promise<void> {
    this.ensureInitialized();
    
    // 1. 获取TaskFlow
    const flow = await this.bridge.getTaskFlow(flowId);
    if (!flow) {
      throw new TaskOperationError(
        'FLOW_NOT_FOUND',
        `TaskFlow not found: ${flowId}`
      );
    }
    
    // 2. 提取记忆
    const memory = await this.memoryManager.extractMemory(flowId, result);
    await this.memoryManager.saveMemory(flowId, memory);
    
    // 3. 智能分析
    if (this.config.enableIntelligence) {
      const suggestions = await this.intelligenceEngine.analyzeAndSuggest(flowId);
      if (suggestions.length > 0) {
        await this.notifier.notify(
          'task_suggestions',
          `优化建议:\n${suggestions.map(s => `- ${s}`).join('\n')}`
        );
      }
    }
    
    // 4. 触发事件
    this.emit('task:completed', {
      flowId,
      goal: flow.name,
      duration: memory.duration || 0,
      result,
      timestamp: Date.now(),
    });
    
    // 5. 发送通知
    await this.notifier.notify('task_completed', `任务已完成: ${flow.name}`);
  }
  
  async failTask(flowId: string, error: string): Promise<void> {
    this.ensureInitialized();
    
    // 1. 分析失败原因
    const analysis = this.config.enableIntelligence
      ? await this.intelligenceEngine.analyzeFailure(flowId, error)
      : { shouldRetry: false, retryDelay: 0, factors: [], prevention: [] };
    
    // 2. 判断是否重试
    if (analysis.shouldRetry) {
      await this.scheduleRetry(flowId, analysis.retryDelay);
    }
    
    // 3. 记录失败经验
    await this.memoryManager.recordFailureExperience(flowId, error, analysis);
    
    // 4. 触发事件
    this.emit('task:failed', {
      flowId,
      goal: '', // 需要从flow获取
      error,
      analysis,
      timestamp: Date.now(),
    });
    
    // 5. 发送通知
    await this.notifier.notify(
      'task_failed',
      `任务失败: ${error}${analysis.suggestion ? `\n建议: ${analysis.suggestion}` : ''}`
    );
  }
  
  // ==================== 事件管理 ====================
  
  on<K extends keyof TaskManagerEvents>(
    eventType: K,
    listener: TaskManagerEvents[K]
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }
  
  emit<K extends keyof TaskManagerEvents>(
    eventType: K,
    payload: Parameters<TaskManagerEvents[K]>[0]
  ): void {
    this.eventEmitter.emit(eventType, payload);
  }
  
  // ==================== 记忆管理 ====================
  
  async getMemory(flowId: string): Promise<TaskMemory | undefined> {
    this.ensureInitialized();
    return this.memoryManager.getMemory(flowId);
  }
  
  async searchMemories(query: string, limit: number = 10): Promise<TaskMemory[]> {
    this.ensureInitialized();
    return this.memoryManager.searchRelatedMemories(query, limit);
  }
  
  async flushMemory(): Promise<void> {
    await this.memoryManager.flush();
  }
  
  // ==================== 健康检查 ====================
  
  async performHealthCheck(): Promise<HealthCheckResult> {
    this.ensureInitialized();
    
    const now = Date.now();
    const issues: HealthIssue[] = [];
    const timeoutTasks: TaskRunView[] = [];
    const errorTasks: TaskRunView[] = [];
    
    // 1. 获取运行中任务
    const runningTasks = await this.queryTasks({ status: 'running' });
    
    // 2. 检查超时
    for (const task of runningTasks) {
      const lastEventAt = task.updatedAt || task.createdAt;
      const lastEventTime = new Date(lastEventAt).getTime();
      
      if (now - lastEventTime > this.config.timeoutThresholdMs!) {
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
    this.emit('health:check', { result, timestamp: now });
    
    if (issues.length > 0) {
      this.emit('health:issue', {
        issue: issues[0],
        taskId: issues[0].taskId,
        timestamp: now,
      });
    }
    
    return result;
  }
  
  getStats(): TaskManagerStats {
    return {
      totalTasks: 0, // 从memoryManager获取
      runningTasks: this.lastHealthCheck?.runningCount || 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      successRate: 0,
      memoryCount: this.memoryManager.getMemoryCount(),
      activeTimers: this.timerManager.getActiveCount(),
    };
  }
  
  // ==================== 私有方法 ====================
  
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new TaskOperationError(
        'NOT_INITIALIZED',
        'SessionTaskManager not initialized, call initialize() first'
      );
    }
    
    if (this.destroyed) {
      throw new TaskOperationError(
        'DESTROYED',
        'SessionTaskManager has been destroyed'
      );
    }
  }
  
  private verifyApiAvailability(): void {
    const availability = this.bridge.checkApiAvailability();
    
    if (!availability.taskFlow) {
      throw new TaskOperationError(
        'API_NOT_AVAILABLE',
        'TaskFlow API not available'
      );
    }
    
    if (!availability.tasks) {
      throw new TaskOperationError(
        'API_NOT_AVAILABLE',
        'Tasks API not available'
      );
    }
  }
  
  private registerAgentEventListeners(): void {
    // 使用Bridge注册OpenClaw事件监听
    this.agentEventUnsubscribe = this.bridge.onAgentEvent((event) => {
      this.handleAgentEvent(event);
    });
  }
  
  private handleAgentEvent(event: AgentEvent): void {
    // 根据事件类型分发
    switch (event.type) {
      case 'lifecycle':
        this.handleLifecycleEvent(event);
        break;
      case 'tool':
        this.handleToolEvent(event);
        break;
      case 'error':
        this.handleErrorEvent(event);
        break;
    }
  }
  
  private handleLifecycleEvent(event: AgentEvent): void {
    // 处理生命周期事件
    // TODO: 实现具体逻辑
  }
  
  private handleToolEvent(event: AgentEvent): void {
    // 记录工具调用
    this.memoryManager.recordToolCall(event.data);
  }
  
  private handleErrorEvent(event: AgentEvent): void {
    // 分析错误
    const analysis = this.intelligenceEngine.analyzeError(event.data);
    
    this.emit('error:operation', {
      operation: 'agent_event',
      error: event.data.message,
      context: event.data,
      timestamp: Date.now(),
    });
  }
  
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
  
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
  
  private async scheduleRetry(flowId: string, delayMs: number): Promise<void> {
    // 使用TimerManager安排重试
    this.timerManager.scheduleTimer({
      id: `retry-${flowId}`,
      delayMs,
      callback: async () => {
        await this.executeRetry(flowId);
      },
    });
    
    await this.notifier.notify(
      'task_retry_scheduled',
      `已安排任务重试: ${flowId}，延迟 ${Math.floor(delayMs / 1000)} 秒`
    );
  }
  
  private async executeRetry(flowId: string): Promise<void> {
    // 实现重试逻辑
    // TODO: 根据具体业务实现
  }
  
  private async createTaskInFlow(params: SubTaskCreateParams): Promise<TaskRecord> {
    // 实现创建任务的逻辑
    // TODO: 根据OpenClaw API实现
    throw new Error('Not implemented');
  }
}
```

---

## 四、与OpenClawBridge的集成

### 4.1 集成方式

```typescript
/**
 * 集成示例
 */

// 1. 创建Bridge实例
const bridge = OpenClawBridge.fromToolContext(ctx);

// 2. 创建SessionTaskManager
const manager = new SessionTaskManager({
  bridge,
  sessionKey: ctx.sessionKey,
  deliveryContext: ctx.deliveryContext,
  enableEvents: true,
  enableIntelligence: true,
});

// 3. 初始化
await manager.initialize();

// 4. 使用
const flow = await manager.createMainTask('完成用户注册功能', {
  title: '用户注册',
  runtime: 'acp',
  tags: ['feature', 'user'],
});

// 5. 监听事件
manager.on('task:completed', (event) => {
  console.log(`任务完成: ${event.goal}`);
});

// 6. 销毁
await manager.destroy();
```

### 4.2 职责分离

| 组件 | 职责 | 依赖 |
|------|------|------|
| **SessionTaskManager** | 协调任务生命周期、事件分发、记忆集成 | OpenClawBridge |
| **OpenClawBridge** | 封装OpenClaw API调用、类型安全 | OpenClaw API |
| **MemoryManager** | 记忆提取、存储、检索、提炼 | 无 |
| **WorkflowEngine** | 工作流定义、条件执行、依赖管理 | OpenClawBridge |
| **IntelligenceEngine** | 模式检测、预测分析、优化建议 | 无 |
| **TimerManager** | 定时任务调度 | 无 |
| **Notifier** | 通知发送、去重 | 无 |

### 4.3 数据流

```
┌─────────────────────────────────────────────────────────┐
│  用户请求                                                │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  SessionTaskManager.createMainTask()                    │
│  - 验证参数                                              │
│  - 创建记忆记录                                          │
│  - 触发事件                                              │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  OpenClawBridge.createTaskFlow()                        │
│  - 绑定会话                                              │
│  - 调用OpenClaw API                                      │
│  - 错误处理                                              │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  OpenClaw Native (TaskFlow Registry)                    │
│  - 创建TaskFlow                                          │
│  - 持久化                                                │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  SessionTaskManager (回调)                              │
│  - MemoryManager.recordTaskStart()                      │
│  - EventEmitter.emit('task:created')                    │
│  - Notifier.notify()                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 五、错误处理设计

### 5.1 错误类型

```typescript
/**
 * 任务操作错误
 */
export class TaskOperationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TaskOperationError';
  }
  
  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    const messages: Record<ErrorCode, string> = {
      NOT_INITIALIZED: '管理器未初始化',
      ALREADY_INITIALIZED: '管理器已初始化',
      DESTROYED: '管理器已销毁',
      API_NOT_AVAILABLE: 'API不可用',
      TASK_NOT_FOUND: '任务不存在',
      FLOW_NOT_FOUND: '任务流不存在',
      PARENT_FLOW_NOT_FOUND: '父任务流不存在',
      TASK_CREATION_FAILED: '任务创建失败',
      CANCEL_FAILED: '任务取消失败',
      INVALID_PARAMS: '参数无效',
      TIMEOUT: '操作超时',
      PERMISSION_DENIED: '权限不足',
    };
    
    return messages[this.code] || this.message;
  }
}

/**
 * 错误代码
 */
export type ErrorCode = 
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'DESTROYED'
  | 'API_NOT_AVAILABLE'
  | 'TASK_NOT_FOUND'
  | 'FLOW_NOT_FOUND'
  | 'PARENT_FLOW_NOT_FOUND'
  | 'TASK_CREATION_FAILED'
  | 'CANCEL_FAILED'
  | 'INVALID_PARAMS'
  | 'TIMEOUT'
  | 'PERMISSION_DENIED';
```

### 5.2 错误处理策略

```typescript
/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 处理错误
   */
  async handle(error: Error, context: {
    manager: SessionTaskManager;
    operation: string;
    params?: unknown;
  }): Promise<void
 {
    if (error instanceof TaskOperationError) {
      // 记录错误
      console.error(`[${error.code}] ${error.message}`, error.context);
      
      // 触发错误事件
      context.manager.emit('error:operation', {
        operation: context.operation,
        error: error.message,
        context: error.context,
        timestamp: Date.now(),
      });
      
      // 发送通知
      // await context.manager.notifier.notify('error', error.getUserMessage());
    } else {
      // 未知错误
      console.error('Unknown error:', error);
      
      context.manager.emit('error:operation', {
        operation: context.operation,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }
}
```

### 5.3 重试机制

```typescript
/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 初始延迟（毫秒） */
  initialDelayMs: number;
  
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  
  /** 退避因子 */
  backoffFactor: number;
}

/**
 * 重试执行器
 */
export class RetryExecutor {
  constructor(private config: RetryConfig) {}
  
  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry?: (error: Error) => boolean
  ): Promise<T> {
    let lastError: Error;
    let delay = this.config.initialDelayMs;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // 检查是否应该重试
        if (shouldRetry && !shouldRetry(error)) {
          throw error;
        }
        
        // 最后一次尝试不再等待
        if (attempt < this.config.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(delay * this.config.backoffFactor, this.config.maxDelayMs);
        }
      }
    }
    
    throw lastError;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 六、使用示例

### 6.1 基本使用

```typescript
import { OpenClawBridge } from './core/bridge';
import { SessionTaskManager } from './core/manager';

/**
 * 插件工具处理器
 */
export async function handleTaskRequest(ctx: ToolContext): Promise<void> {
  // 1. 创建Bridge实例
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 2. 创建SessionTaskManager
  const manager = new SessionTaskManager({
    bridge,
    sessionKey: ctx.sessionKey,
    deliveryContext: ctx.deliveryContext,
    enableEvents: true,
    enableIntelligence: true,
  });
  
  // 3. 初始化
  await manager.initialize();
  
  try {
    // 4. 创建主任务
    const flow = await manager.createMainTask('完成用户注册功能', {
      title: '用户注册功能开发',
      runtime: 'acp',
      tags: ['feature', 'user'],
      priority: 'high',
    });
    
    console.log(`任务已创建: ${flow.flowId}`);
    
    // 5. 创建子任务
    const subtask = await manager.createSubTask({
      flowId: flow.flowId,
      childSessionKey: 'subtask-1',
      task: '实现注册表单验证',
      label: '表单验证',
    });
    
    // 6. 查询任务
    const tasks = await manager.listTasks();
    console.log(`当前任务数: ${tasks.length}`);
    
    // 7. 完成任务
    await manager.completeTask(flow.flowId, {
      result: 'success',
      message: '用户注册功能开发完成',
    });
    
  } finally {
    // 8. 销毁
    await manager.destroy();
  }
}
```

---

## 七、总结

### 7.1 设计要点

| 设计要点 | 实现方式 | 优势 |
|----------|----------|------|
| **依赖注入** | 通过构造函数注入OpenClawBridge | 易于测试、解耦 |
| **事件驱动** | 使用EventEmitter实现事件系统 | 松耦合、易扩展 |
| **记忆集成** | 委托给MemoryManager | 单一职责、可插拔 |
| **错误恢复** | RetryExecutor + 智能分析 | 提高可靠性 |
| **健康检查** | 定时检查 + 事件通知 | 及时发现问题 |
| **类型安全** | 完整的TypeScript接口定义 | 编译期错误检查 |

### 7.2 与OpenClawBridge的协作

- **SessionTaskManager**: 协调器，管理生命周期和事件
- **OpenClawBridge**: 桥接器，封装API调用
- **职责清晰**: Manager不直接调用OpenClaw API

### 7.3 下一步

1. **实现核心类**: 基于此设计实现SessionTaskManager类
2. **编写单元测试**: 确保接口实现正确
3. **集成测试**: 与OpenClawBridge联调
4. **性能优化**: 添加缓存和批量操作

---

**文档版本**: v1.0  
**设计时间**: 2026-04-16  
**设计者**: 架构专家  
**状态**: 设计完成，待实现
