/**
 * WorkflowEngine - 工作流引擎类型定义
 *
 * 基于 n8n 工作流引擎架构分析，借鉴其节点模型、连接模型和错误处理策略。
 * 设计文档: docs/design/workflow-engine-design.md
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

// ==================== Workflow Definition Types ====================

/**
 * 工作流定义
 * 描述一个完整的工作流，包含节点、连接和配置
 */
export interface WorkflowDefinition {
  /** 唯一标识 */
  id: string;

  /** 工作流名称 */
  name: string;

  /** 描述 */
  description?: string;

  /** 版本号 */
  version: string;

  /** 标签 */
  tags?: string[];

  /** 触发配置 */
  triggers?: WorkflowTrigger[];

  /** 节点定义列表 */
  nodes: WorkflowNode[];

  /** 连接定义列表 */
  connections: WorkflowConnection[];

  /** 全局变量 */
  variables?: Record<string, any>;

  /** 工作流配置 */
  settings?: WorkflowSettings;

  /** 创建时间 */
  createdAt: string;

  /** 更新时间 */
  updatedAt: string;

  /** 创建者 */
  createdBy?: string;
}

/**
 * 工作流配置
 */
export interface WorkflowSettings {
  /** 执行超时（毫秒） */
  timeout?: number;

  /** 失败策略 */
  failureStrategy?: 'stop' | 'continue' | 'rollback';

  /** 重试配置 */
  retryPolicy?: RetryPolicy;

  /** 最大并发数 */
  maxConcurrency?: number;

  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 工作流触发器
 */
export interface WorkflowTrigger {
  /** 触发类型 */
  type: 'manual' | 'schedule' | 'webhook' | 'event';

  /** 触发配置 */
  config: Record<string, any>;

  /** 是否启用 */
  enabled: boolean;
}

// ==================== Node Types ====================

/**
 * 工作流节点
 * 工作流中的执行单元，借鉴 n8n 的 INode 接口设计
 */
export interface WorkflowNode {
  /** 节点唯一标识 */
  id: string;

  /** 节点类型 */
  type: string;

  /** 显示名称 */
  name: string;

  /** 位置信息（用于可视化） */
  position?: {
    x: number;
    y: number;
  };

  /** 节点配置 */
  config: Record<string, any>;

  /** 输入配置 */
  inputs?: NodeInput[];

  /** 输出配置 */
  outputs?: NodeOutputDef[];

  /** 条件表达式（条件节点专用） */
  condition?: ConditionExpression;

  /** 错误处理配置 */
  onError?: ErrorHandlerConfig;

  /** 超时设置（毫秒） */
  timeout?: number;

  /** 重试配置 */
  retry?: RetryPolicy;
}

/**
 * 节点输入定义
 */
export interface NodeInput {
  /** 输入名称 */
  name: string;

  /** 输入类型 */
  type: string;

  /** 是否必填 */
  required?: boolean;

  /** 默认值 */
  default?: any;

  /** 描述 */
  description?: string;

  /** 数据来源 */
  source?: NodeInputSource;
}

/**
 * 节点输入来源
 */
export interface NodeInputSource {
  /** 来源类型 */
  type: 'static' | 'expression' | 'previous';

  /** 来源值 */
  value: any;
}

/**
 * 节点输出定义
 */
export interface NodeOutputDef {
  /** 输出名称 */
  name: string;

  /** 输出类型 */
  type: string;

  /** 描述 */
  description?: string;
}

/**
 * 条件表达式
 * 支持三种求值方式：JavaScript、JSONata、简单表达式
 */
export interface ConditionExpression {
  /** 表达式类型 */
  type: 'javascript' | 'jsonata' | 'simple';

  /** 表达式内容 */
  expression: string;
}

/**
 * 错误处理配置
 * 借鉴 n8n 的 3 种错误处理策略
 */
export interface ErrorHandlerConfig {
  /** 错误处理策略 */
  strategy: 'retry' | 'skip' | 'fallback' | 'abort';

  /** 最大重试次数（strategy=retry 时有效） */
  maxRetries?: number;

  /** 回退节点 ID（strategy=fallback 时有效） */
  fallbackNode?: string;

  /** 是否发送通知 */
  notify?: boolean;
}

/**
 * 重试策略
 * 支持固定间隔、线性递增、指数退避三种方式
 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxAttempts: number;

  /** 退避策略 */
  backoff: 'fixed' | 'linear' | 'exponential';

  /** 初始延迟（毫秒） */
  initialDelay: number;

  /** 最大延迟（毫秒） */
  maxDelay?: number;

  /** 指数退避倍数（backoff=exponential 时有效） */
  multiplier?: number;
}

// ==================== Connection Types ====================

/**
 * 工作流连接
 * 定义节点之间的数据流向，借鉴 n8n 的多维连接模型
 */
export interface WorkflowConnection {
  /** 连接 ID（可选） */
  id?: string;

  /** 源节点 ID */
  source: string;

  /** 源节点输出端口 */
  sourceOutput?: string;

  /** 目标节点 ID */
  target: string;

  /** 目标节点输入端口 */
  targetInput?: string;

  /** 连接条件 */
  condition?: ConnectionCondition;

  /** 连接标签 */
  label?: string;
}

/**
 * 连接条件
 * 用于条件分支的连接
 */
export interface ConnectionCondition {
  /** 条件类型 */
  type: 'always' | 'on_success' | 'on_failure' | 'custom';

  /** 自定义条件表达式 */
  expression?: string;
}

// ==================== Execution Types ====================

/**
 * 节点输出结果
 */
export interface NodeOutput {
  /** 节点 ID */
  nodeId: string;

  /** 执行 ID */
  executionId: string;

  /** 输出数据 */
  data: Record<string, any>;

  /** 输出状态 */
  status: 'success' | 'failure' | 'skipped';

  /** 错误信息（如果失败） */
  error?: NodeError;

  /** 执行开始时间 */
  startTime: string;

  /** 执行结束时间 */
  endTime: string;

  /** 执行耗时（毫秒） */
  duration: number;

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 多输出节点的输出结果（如条件分支）
 */
export interface MultiNodeOutput {
  /** 节点 ID */
  nodeId: string;

  /** 执行 ID */
  executionId: string;

  /** 各端口的输出结果 */
  outputs: Map<string, NodeOutput>;

  /** 默认输出端口 */
  defaultOutput: string;
}

/**
 * 节点错误信息
 */
export interface NodeError {
  /** 错误代码 */
  code: string;

  /** 错误消息 */
  message: string;

  /** 错误堆栈 */
  stack?: string;

  /** 是否可重试 */
  retryable: boolean;
}

// ==================== Execution State Types ====================

/**
 * 工作流执行状态
 */
export interface WorkflowExecution {
  /** 执行 ID */
  id: string;

  /** 工作流定义 ID */
  workflowId: string;

  /** 执行状态 */
  status: WorkflowStatus;

  /** 触发信息 */
  trigger: {
    type: string;
    source?: string;
    timestamp: string;
  };

  /** 输入参数 */
  input: Record<string, any>;

  /** 输出结果 */
  output?: Record<string, any>;

  /** 节点执行状态 */
  nodeExecutions: Map<string, NodeExecution>;

  /** 执行开始时间 */
  startedAt: string;

  /** 执行完成时间 */
  completedAt?: string;

  /** 错误信息 */
  error?: WorkflowError;

  /** 统计信息 */
  stats: WorkflowExecutionStats;
}

/**
 * 节点执行状态
 */
export interface NodeExecution {
  /** 节点 ID */
  nodeId: string;

  /** 节点状态 */
  status: NodeStatus;

  /** 节点输入 */
  input?: any;

  /** 节点输出 */
  output?: NodeOutput;

  /** 错误信息 */
  error?: NodeError;

  /** 执行开始时间 */
  startedAt?: string;

  /** 执行完成时间 */
  completedAt?: string;

  /** 重试次数 */
  retryCount?: number;

  /** 重试历史 */
  retryHistory?: RetryAttempt[];

  /** 父节点（用于并行合并） */
  parentNodes?: string[];
}

/**
 * 工作流执行统计
 */
export interface WorkflowExecutionStats {
  /** 总节点数 */
  totalNodes: number;

  /** 已完成节点数 */
  completedNodes: number;

  /** 失败节点数 */
  failedNodes: number;

  /** 跳过节点数 */
  skippedNodes: number;
}

/**
 * 工作流状态（用于持久化）
 */
export interface WorkflowState {
  /** 执行 ID */
  executionId: string;

  /** 工作流定义 ID */
  workflowId: string;

  /** 状态 */
  status: WorkflowStatus;

  /** 序列化的执行状态 */
  serializedState: {
    nodeStates: Record<string, NodeState>;
    variables: Record<string, any>;
    checkpoint?: string;
  };

  /** 更新时间 */
  updatedAt: string;

  /** 过期时间（用于清理） */
  expiresAt?: string;
}

/**
 * 节点状态
 */
export interface NodeState {
  /** 节点状态 */
  status: NodeStatus;

  /** 输出数据 */
  output?: any;

  /** 错误信息 */
  error?: string;

  /** 重试次数 */
  retryCount?: number;
}

/**
 * 重试尝试记录
 */
export interface RetryAttempt {
  /** 尝试次数 */
  attempt: number;

  /** 时间戳 */
  timestamp: string;

  /** 错误信息 */
  error: {
    name: string;
    message: string;
  };
}

// ==================== Status Enums ====================

/**
 * 工作流执行状态
 */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * 节点执行状态
 */
export type NodeStatus =
  | 'pending'
  | 'waiting'    // 等待依赖完成
  | 'running'
  | 'success'
  | 'failure'
  | 'skipped'
  | 'timeout';

/**
 * 工作流执行错误
 */
export interface WorkflowError {
  /** 错误代码 */
  code: string;

  /** 错误消息 */
  message: string;

  /** 失败节点 ID */
  failedNodeId?: string;

  /** 原始错误 */
  originalError?: Error;
}

// ==================== Result Types ====================

/**
 * 工作流执行结果
 */
export interface WorkflowResult {
  /** 执行状态 */
  status: 'completed' | 'failed';

  /** 各节点输出结果 */
  results: Map<string, NodeOutput>;

  /** 错误信息 */
  errors: Record<string, Error>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;

  /** 错误列表 */
  errors: ValidationError[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误字段 */
  field: string;

  /** 错误消息 */
  message: string;

  /** 错误值 */
  value?: any;
}
