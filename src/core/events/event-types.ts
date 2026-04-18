/**
 * OpenClaw Task Plugin v3.0 - Event Types Definition
 * 
 * 任务管理器事件类型定义，支持任务生命周期事件的监听和分发
 * 
 * @version 3.0.0
 * @author 架构专家
 */

// ==================== Task Lifecycle Events ====================

/**
 * 任务创建事件
 */
export interface TaskCreatedEvent {
  /** Flow ID */
  flowId: string;
  /** 任务目标 */
  goal: string;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务启动事件
 */
export interface TaskStartedEvent {
  /** Flow ID */
  flowId: string;
  /** 任务目标 */
  goal: string;
  /** 时间戳 */
  timestamp: number;
  /** 运行时类型 */
  runtime?: string;
}

/**
 * 任务完成事件
 */
export interface TaskCompletedEvent {
  /** Flow ID */
  flowId: string;
  /** 任务目标 */
  goal: string;
  /** 执行时长（毫秒） */
  duration: number;
  /** 任务结果 */
  result?: unknown;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 任务失败事件
 */
export interface TaskFailedEvent {
  /** Flow ID */
  flowId: string;
  /** 任务目标 */
  goal: string;
  /** 错误信息 */
  error: string;
  /** 失败分析 */
  analysis?: FailureAnalysis;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 任务取消事件
 */
export interface TaskCancelledEvent {
  /** 任务ID */
  taskId: string;
  /** Flow ID */
  flowId?: string;
  /** 取消原因 */
  reason?: string;
  /** 时间戳 */
  timestamp: number;
}

// ==================== Subtask Events ====================

/**
 * 子任务创建事件
 */
export interface SubTaskCreatedEvent {
  /** 父Flow ID */
  flowId: string;
  /** 子任务ID */
  taskId: string;
  /** 任务内容 */
  task: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 子任务完成事件
 */
export interface SubTaskCompletedEvent {
  /** 父Flow ID */
  flowId: string;
  /** 子任务ID */
  taskId: string;
  /** 任务内容 */
  task: string;
  /** 执行时长 */
  duration?: number;
  /** 结果 */
  result?: unknown;
  /** 时间戳 */
  timestamp: number;
}

// ==================== Health Check Events ====================

/**
 * 健康检查事件
 */
export interface HealthCheckEvent {
  /** 检查结果 */
  result: HealthCheckResult;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 健康问题事件
 */
export interface HealthIssueEvent {
  /** 健康问题 */
  issue: HealthIssue;
  /** 相关任务ID */
  taskId?: string;
  /** 时间戳 */
  timestamp: number;
}

// ==================== Error Events ====================

/**
 * 操作错误事件
 */
export interface OperationErrorEvent {
  /** 操作名称 */
  operation: string;
  /** 错误信息 */
  error: string;
  /** 上下文信息 */
  context?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 超时错误事件
 */
export interface TimeoutErrorEvent {
  /** 任务ID */
  taskId: string;
  /** Flow ID */
  flowId?: string;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 时间戳 */
  timestamp: number;
}

// ==================== Supporting Types ====================

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
 * 任务运行视图
 */
export interface TaskRunView {
  taskId: string;
  status: string;
  runtime?: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
}

// ==================== Event Map ====================

/**
 * TaskManager 事件数据映射
 * 
 * 定义所有支持的事件类型及其对应的事件数据结构
 * 用于EventEmitter的类型推断
 */
export interface TaskManagerEventData {
  // 任务生命周期事件
  'task:created': TaskCreatedEvent;
  'task:started': TaskStartedEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;
  'task:cancelled': TaskCancelledEvent;
  
  // 子任务事件
  'subtask:created': SubTaskCreatedEvent;
  'subtask:completed': SubTaskCompletedEvent;
  
  // 健康检查事件
  'health:check': HealthCheckEvent;
  'health:issue': HealthIssueEvent;
  
  // 错误事件
  'error:operation': OperationErrorEvent;
  'error:timeout': TimeoutErrorEvent;
}

/**
 * TaskManager 事件监听器映射
 * 
 * 定义所有支持的事件类型及其对应的监听器函数签名
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
}

/**
 * 事件类型常量
 */
export const EventTypes = {
  // 任务生命周期
  TASK_CREATED: 'task:created' as const,
  TASK_STARTED: 'task:started' as const,
  TASK_COMPLETED: 'task:completed' as const,
  TASK_FAILED: 'task:failed' as const,
  TASK_CANCELLED: 'task:cancelled' as const,
  
  // 子任务
  SUBTASK_CREATED: 'subtask:created' as const,
  SUBTASK_COMPLETED: 'subtask:completed' as const,
  
  // 健康检查
  HEALTH_CHECK: 'health:check' as const,
  HEALTH_ISSUE: 'health:issue' as const,
  
  // 错误
  ERROR_OPERATION: 'error:operation' as const,
  ERROR_TIMEOUT: 'error:timeout' as const,
} as const;

/**
 * 事件类型
 */
export type EventType = keyof TaskManagerEvents;
