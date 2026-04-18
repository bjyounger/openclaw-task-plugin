/**
 * SessionTaskManager 类型定义
 * 
 * 包含配置、事件、过滤器等所有类型
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import { 
  TaskStatus, 
  TaskRuntime, 
  TaskRunView, 
  TaskRunDetail,
  TaskFlowView,
  TaskFlowDetail,
  TaskOperationError,
  DeliveryContext,
} from '../types';
import { OpenClawBridge } from '../bridge';

// ==================== 配置接口 ====================

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
  
  /** 健康检查间隔（毫秒） */
  healthCheckIntervalMs?: number;
  
  /** 超时阈值（毫秒） */
  timeoutThresholdMs?: number;
  
  /** 最大重试次数 */
  maxRetries?: number;
  
  /** 是否启用事件监听 */
  enableEvents?: boolean;
  
  /** 是否启用记忆管理 */
  enableMemory?: boolean;
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
  
  /** 开始时间范围（开始时间之后） */
  startedAfter?: number;
  
  /** 开始时间范围（开始时间之前） */
  startedBefore?: number;
  
  /** 标签过滤 */
  label?: string;
  
  /** 限制数量 */
  limit?: number;
}

// ==================== 健康检查 ====================

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
  
  /** 活跃定时器数 */
  activeTimers: number;
}

// ==================== 事件接口 ====================

/**
 * TaskManager 事件类型定义
 */
export interface TaskManagerEvents {
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
  
  // 初始化事件
  'manager:initialized': ManagerInitializedEvent;
  'manager:destroyed': ManagerDestroyedEvent;
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
 * 任务开始事件
 */
export interface TaskStartedEvent {
  taskId: string;
  flowId: string;
  timestamp: number;
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
 * 子任务创建事件
 */
export interface SubTaskCreatedEvent {
  flowId: string;
  taskId: string;
  task: string;
  timestamp: number;
}

/**
 * 子任务完成事件
 */
export interface SubTaskCompletedEvent {
  flowId: string;
  taskId: string;
  result?: unknown;
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

/**
 * 超时错误事件
 */
export interface TimeoutErrorEvent {
  taskId: string;
  timeoutMs: number;
  timestamp: number;
}

/**
 * 管理器初始化事件
 */
export interface ManagerInitializedEvent {
  sessionKey: string;
  timestamp: number;
}

/**
 * 管理器销毁事件
 */
export interface ManagerDestroyedEvent {
  sessionKey: string;
  timestamp: number;
}

// ==================== 记忆接口 ====================

/**
 * 任务记忆（简化版）
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
  
  /** 子任务 */
  subtasks?: SubTaskMemory[];
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
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

// ==================== 错误类型 ====================

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
  | 'INVALID_PARAMS';

/**
 * SessionTaskManager 错误
 */
export class SessionTaskManagerError extends TaskOperationError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'SessionTaskManagerError';
  }
  
  /**
   * 获取用户友好消息
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
    };
    
    return messages[this.code as ErrorCode] || this.message;
  }
}

// ==================== 类型守卫 ====================

/**
 * 检查是否为TaskStatus
 */
export function isTaskStatus(value: string): value is TaskStatus {
  const validStatuses: TaskStatus[] = [
    'pending', 'queued', 'running', 'succeeded', 
    'failed', 'cancelled', 'timed_out', 'lost'
  ];
  return validStatuses.includes(value as TaskStatus);
}

/**
 * 检查是否为TaskRuntime
 */
export function isTaskRuntime(value: string): value is TaskRuntime {
  const validRuntimes: TaskRuntime[] = ['subagent', 'acp', 'agent'];
  return validRuntimes.includes(value as TaskRuntime);
}

/**
 * 检查是否为有效的任务查询过滤器
 */
export function isValidTaskQueryFilter(filter: unknown): filter is TaskQueryFilter {
  if (!filter || typeof filter !== 'object') return false;
  
  const f = filter as TaskQueryFilter;
  
  // 检查status
  if (f.status !== undefined) {
    if (Array.isArray(f.status)) {
      return f.status.every(isTaskStatus);
    } else {
      return isTaskStatus(f.status);
    }
  }
  
  // 检查runtime
  if (f.runtime !== undefined) {
    if (Array.isArray(f.runtime)) {
      return f.runtime.every(isTaskRuntime);
    } else {
      return isTaskRuntime(f.runtime);
    }
  }
  
  // 检查limit
  if (f.limit !== undefined && typeof f.limit !== 'number') {
    return false;
  }
  
  return true;
}