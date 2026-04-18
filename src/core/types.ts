/**
 * OpenClaw Task Plugin v3.0 - Core Types
 * 
 * 基于OpenClaw 2026.4.9 API的核心类型定义
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

// ==================== OpenClaw API Types ====================

/**
 * 其他运行时API（占位类型）
 */
export interface OpenClawEventsRuntime {
  // 事件API占位
}

export interface OpenClawSubagentRuntime {
  // 子代理API占位
}

export interface OpenClawCronRuntime {
  // 定时任务API占位
}

/**
 * TaskFlow基本类型（用于create返回）
 */
export interface TaskFlow {
  flowId: string;
  name: string;
  status: TaskFlowStatus;
  createdAt: string;
}

/**
 * OpenClaw Plugin API
 * 基于2026.4.9版本的正确API路径
 */
export interface OpenClawPluginApi {
  runtime: {
    // ✅ 正确的API路径：使用taskFlow而非tasks
    taskFlow: OpenClawTaskFlowRuntime;
    tasks: OpenClawTasksRuntime; // 备用访问方式
    
    // 其他运行时API
    events: OpenClawEventsRuntime;
    subagent: OpenClawSubagentRuntime;
    cron: OpenClawCronRuntime;
  };
  
  // 插件能力
  registerHook: (hook: string, handler: HookHandler) => void;
  registerHttpRoute: (route: HttpRouteConfig) => void;
  registerTool: (tool: ToolConfig) => void;
}

/**
 * TaskFlow Runtime - OpenClaw 2026.4.9的核心API
 */
export interface OpenClawTaskFlowRuntime {
  /**
   * ✅ 正确的会话绑定方法
   * 从工具上下文绑定当前会话
   */
  fromToolContext(ctx: ToolContext): BoundTaskFlowRuntime;
  
  /**
   * ✅ 显式会话绑定方法
   * 通过sessionKey绑定指定会话
   */
  bindSession(params: {
    sessionKey: string;
    requesterOrigin?: DeliveryContext;
  }): BoundTaskFlowRuntime;
}

/**
 * Bound TaskFlow Runtime - 绑定会话后的操作接口
 */
export interface BoundTaskFlowRuntime {
  /**
   * 创建任务流
   */
  create(flowDef: TaskFlowDefinition): Promise<TaskFlow>;
  
  /**
   * 获取任务流详情
   */
  get(flowId: string): Promise<TaskFlowDetail | undefined>;
  
  /**
   * 查询任务流列表
   * 注意：不接受filter参数，需在客户端过滤
   */
  list(): Promise<TaskFlowView[]>;
  
  /**
   * 更新任务流
   */
  update(flowId: string, updates: TaskFlowUpdates): Promise<TaskFlow>;
  
  /**
   * 取消任务流
   */
  cancel(flowId: string, reason?: string): Promise<TaskFlowCancelResult>;
}

/**
 * Tasks Runtime - OpenClaw任务运行API
 */
export interface OpenClawTasksRuntime {
  runs: {
    fromToolContext(ctx: ToolContext): BoundTaskRunsRuntime;
    bindSession(sessionKey: string): BoundTaskRunsRuntime;
  };
}

/**
 * Bound Task Runs Runtime - 任务运行操作接口
 */
export interface BoundTaskRunsRuntime {
  get(taskId: string): Promise<TaskRunDetail | undefined>;
  list(): Promise<TaskRunView[]>; // ✅ 不接受filter参数
  findLatest(): Promise<TaskRunDetail | undefined>;
  cancel(taskId: string, reason?: string): Promise<TaskRunCancelResult>;
}

// ==================== Task Types ====================

/**
 * 任务状态
 */
export type TaskStatus = 
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'lost';

/**
 * 任务运行类型
 */
export type TaskRuntime = 'subagent' | 'acp' | 'agent';

/**
 * 任务创建参数
 */
export interface TaskCreateParams {
  title: string;
  runtime: TaskRuntime;
  scope?: 'session' | 'user';
  timeout?: number;
  parentFlowId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 任务创建结果
 */
export interface TaskCreateResult {
  taskId: string;
  flowId?: string;
  status: TaskStatus;
  createdAt: string;
}

/**
 * 任务视图
 */
export interface TaskRunView {
  taskId: string;
  status: TaskStatus;
  runtime: TaskRuntime;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 任务详情
 */
export interface TaskRunDetail extends TaskRunView {
  scope: 'session' | 'user';
  parentFlowId?: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/**
 * 任务取消结果
 */
export interface TaskRunCancelResult {
  taskId: string;
  cancelled: boolean;
  reason?: string;
}

// ==================== TaskFlow Types ====================

/**
 * TaskFlow状态
 */
export type TaskFlowStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * TaskFlow定义
 */
export interface TaskFlowDefinition {
  name: string;
  description?: string;
  tasks: TaskCreateParams[];
  metadata?: Record<string, unknown>;
}

/**
 * TaskFlow视图
 */
export interface TaskFlowView {
  flowId: string;
  name: string;
  status: TaskFlowStatus;
  createdAt: string;
  updatedAt?: string;
}

/**
 * TaskFlow详情
 */
export interface TaskFlowDetail extends TaskFlowView {
  description?: string;
  tasks: TaskRunView[];
  metadata?: Record<string, unknown>;
}

/**
 * TaskFlow更新参数
 */
export interface TaskFlowUpdates {
  name?: string;
  description?: string;
  status?: TaskFlowStatus;
  metadata?: Record<string, unknown>;
}

/**
 * TaskFlow取消结果
 */
export interface TaskFlowCancelResult {
  flowId: string;
  cancelled: boolean;
  reason?: string;
}

// ==================== Context Types ====================

/**
 * 工具上下文
 */
export interface ToolContext {
  sessionKey: string;
  deliveryContext?: DeliveryContext;
  api: OpenClawPluginApi;
  pluginConfig?: Record<string, unknown>;
}

/**
 * 交付上下文
 */
export interface DeliveryContext {
  channel?: string;
  accountId?: string;
  userId?: string;
  sessionId?: string;
}

// ==================== Hook & Route Types ====================

/**
 * Hook处理器
 */
export type HookHandler = (ctx: unknown) => Promise<void> | void;

/**
 * HTTP路由配置
 */
export interface HttpRouteConfig {
  path: string;
  auth: 'plugin' | 'session' | 'none';
  match: 'exact' | 'prefix' | 'regex';
  handler: (req: unknown) => Promise<unknown>;
}

/**
 * 工具配置
 */
export interface ToolConfig {
  name: string;
  description: string;
  parameters: unknown; // TypeBox Schema
  handler: (params: unknown, ctx: ToolContext) => Promise<unknown>;
}

// ==================== Plugin Types ====================

/**
 * 插件配置
 */
export interface SessionTaskManagerConfig {
  sessionKey: string;
  requesterOrigin?: DeliveryContext;
  maxConcurrent?: number;
  defaultTimeout?: number;
  enableEvents?: boolean;
  enableHooks?: boolean;
}

/**
 * 插件能力
 */
export interface PluginCapabilities {
  tools?: string[];
  hooks?: string[];
  routes?: string[];
}

// ==================== Error Types ====================

/**
 * 任务操作错误
 */
export class TaskOperationError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TaskOperationError';
  }
}

/**
 * 增强的任务错误
 */
export class EnhancedTaskError extends TaskOperationError {
  constructor(
    code: string,
    message: string,
    public timestamp: string,
    public stackTrace?: string,
    public relatedErrors?: EnhancedTaskError[],
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'EnhancedTaskError';
  }
  
  getUserMessage(): string {
    return `${this.message} (Code: ${this.code})`;
  }
}