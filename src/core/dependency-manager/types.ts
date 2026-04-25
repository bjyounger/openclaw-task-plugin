/**
 * DependencyManager - 核心类型定义
 *
 * 定义依赖管理的核心数据模型和接口
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

// ==================== 依赖定义类型 ====================

/**
 * 任务依赖定义
 */
export interface TaskDependency {
  /** 任务 ID */
  taskId: string;

  /** 前置依赖任务 ID 列表 */
  dependsOn: string[];

  /** 依赖类型：硬依赖（必须满足）/ 软依赖（可选） */
  type: 'hard' | 'soft';

  /** 满足条件：全部满足 / 任一满足 */
  condition: 'all' | 'any';

  /** 依赖超时时间（毫秒），0 表示不超时 */
  timeout: number;

  /** 依赖失败策略 */
  onFailure: 'block' | 'skip' | 'fallback';

  /** fallback 策略的备用任务 ID */
  fallbackTaskId?: string;

  /** 创建时间 */
  createdAt: string;

  /** 更新时间 */
  updatedAt: string;
}

// ==================== 依赖状态类型 ====================

/**
 * 依赖项状态
 */
export type DependencyItemStatus =
  | 'pending'     // 等待中
  | 'satisfied'   // 已满足
  | 'failed'      // 已失败
  | 'timeout';    // 已超时

/**
 * 依赖项详情
 */
export interface DependencyItemDetail {
  /** 依赖任务 ID */
  dependsOnTaskId: string;

  /** 依赖状态 */
  status: DependencyItemStatus;

  /** 满足时间 */
  satisfiedTime?: number;

  /** 跳过原因（用于 skip/fallback 策略） */
  skipReason?: string;

  /** 错误信息（失败时） */
  error?: string;

  /** 超时时间戳（设置超时时） */
  timeoutAt?: number;
}

/**
 * 依赖状态
 */
export interface DependencyState {
  /** 任务 ID */
  taskId: string;

  /** 各依赖任务的详细状态 */
  dependencyDetails: Map<string, DependencyItemDetail>;

  /** 简化的状态映射（兼容旧版） */
  dependencyStatus: Map<string, DependencyItemStatus>;

  /** 是否就绪（所有硬依赖满足） */
  ready: boolean;

  /** 阻塞原因（未就绪时） */
  blockedBy?: string[];

  /** 就绪时间 */
  readyTime?: number;

  /** 超时时间（任务级别的整体超时） */
  timeoutAt?: number;
}

// ==================== 事件类型 ====================

/**
 * 依赖事件类型
 */
export type DependencyEventType =
  | 'dependency:registered'   // 依赖注册
  | 'dependency:resolved'     // 单个依赖满足
  | 'dependency:failed'       // 单个依赖失败
  | 'dependency:timeout'      // 依赖超时
  | 'dependency:ready'        // 所有依赖就绪，可执行
  | 'dependency:blocked'      // 依赖阻塞
  | 'dependency:unregistered' // 依赖注销
  | 'dependency:triggered';   // 触发执行

/**
 * 依赖事件映射
 */
export interface DependencyEvents {
  'dependency:registered': DependencyRegisteredEvent;
  'dependency:resolved': DependencyResolvedEvent;
  'dependency:failed': DependencyFailedEvent;
  'dependency:timeout': DependencyTimeoutEvent;
  'dependency:ready': DependencyReadyEvent;
  'dependency:blocked': DependencyBlockedEvent;
  'dependency:unregistered': DependencyUnregisteredEvent;
  'dependency:triggered': DependencyTriggeredEvent;
}

export interface DependencyRegisteredEvent {
  taskId: string;
  dependsOn: string[];
  timestamp: number;
}

export interface DependencyResolvedEvent {
  taskId: string;
  resolvedTaskId: string;
  satisfiedTime: number;
  timestamp: number;
}

export interface DependencyFailedEvent {
  taskId: string;
  failedTaskId: string;
  error?: string;
  skipReason?: string;
  timestamp: number;
}

export interface DependencyTimeoutEvent {
  taskId: string;
  timeoutTaskId: string;
  timestamp: number;
}

export interface DependencyReadyEvent {
  taskId: string;
  readyTime: number;
  timestamp: number;
}

export interface DependencyBlockedEvent {
  taskId: string;
  blockedBy: string[];
  reason: string;
  timestamp: number;
}

export interface DependencyUnregisteredEvent {
  taskId: string;
  timestamp: number;
}

export interface DependencyTriggeredEvent {
  taskId: string;
  triggeredBy: string[];
  timestamp: number;
}

// ==================== 历史记录类型 ====================

/**
 * 依赖历史记录
 */
export interface DependencyHistoryEntry {
  /** 记录 ID */
  id: string;

  /** 任务 ID */
  taskId: string;

  /** 事件类型 */
  eventType: DependencyEventType;

  /** 时间戳 */
  timestamp: number;

  /** 依赖任务 ID（如果事件与单个依赖相关） */
  relatedTaskId?: string;

  /** 详细信息 */
  details: Record<string, any>;
}

// ==================== 依赖图类型 ====================

/**
 * 依赖图
 */
export interface DependencyGraph {
  /** 节点列表 */
  nodes: DependencyGraphNode[];

  /** 边列表 */
  edges: DependencyGraphEdge[];
}

export interface DependencyGraphNode {
  taskId: string;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  label?: string;
}

export interface DependencyGraphEdge {
  from: string;
  to: string;
  type: 'hard' | 'soft';
}

// ==================== 存储接口 ====================

/**
 * 依赖存储接口
 *
 * 设计原则：
 * 1. 抽象存储层，便于测试和扩展
 * 2. 支持内存、Redis、SQLite 等多种后端
 * 3. 提供原子操作保证
 */
export interface IDependencyStore {
  // ==================== 依赖定义 CRUD ====================

  /**
   * 保存依赖定义
   */
  save(dependency: TaskDependency): Promise<void>;

  /**
   * 批量保存依赖定义
   */
  saveBatch(dependencies: TaskDependency[]): Promise<void>;

  /**
   * 获取依赖定义
   */
  get(taskId: string): Promise<TaskDependency | undefined>;

  /**
   * 获取所有依赖定义
   */
  getAll(): Promise<TaskDependency[]>;

  /**
   * 删除依赖定义
   */
  delete(taskId: string): Promise<void>;

  /**
   * 批量删除依赖定义
   */
  deleteBatch(taskIds: string[]): Promise<void>;

  // ==================== 依赖状态管理 ====================

  /**
   * 获取依赖状态
   */
  getState(taskId: string): Promise<DependencyState | undefined>;

  /**
   * 保存依赖状态
   */
  saveState(state: DependencyState): Promise<void>;

  /**
   * 更新单个依赖项状态
   */
  updateDependencyItemStatus(
    taskId: string,
    dependsOnTaskId: string,
    status: DependencyItemStatus,
    details?: Partial<DependencyItemDetail>
  ): Promise<void>;

  // ==================== 依赖历史记录 ====================

  /**
   * 添加历史记录
   */
  addHistoryEntry(entry: DependencyHistoryEntry): Promise<void>;

  /**
   * 获取依赖历史
   */
  getDependencyHistory(
    taskId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: DependencyEventType[];
    }
  ): Promise<DependencyHistoryEntry[]>;

  // ==================== 查询接口 ====================

  /**
   * 查询任务的下游依赖
   */
  getDownstreamDependencies(taskId: string): Promise<TaskDependency[]>;

  /**
   * 查询任务的上游依赖
   */
  getUpstreamDependencies(taskId: string): Promise<TaskDependency[]>;

  /**
   * 获取所有阻塞的任务
   */
  getBlockedTasks(): Promise<string[]>;

  // ==================== 生命周期 ====================

  /**
   * 清空所有数据
   */
  clear(): Promise<void>;
}

// ==================== 错误类型 ====================

/**
 * 循环依赖错误
 */
export class CycleDetectedError extends Error {
  constructor(public cycles: string[][]) {
    super(`Circular dependency detected: ${cycles.map(c => c.join(' → ')).join(', ')}`);
    this.name = 'CycleDetectedError';
  }
}

// ==================== 解析结果类型 ====================

/**
 * 依赖解析结果
 */
export interface DependencyResolveResult {
  /** 是否就绪 */
  ready: boolean;

  /** 阻塞原因 */
  blockedBy?: string[];

  /** 原因描述 */
  reason: string;
}