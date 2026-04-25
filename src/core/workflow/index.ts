/**
 * WorkflowEngine - 工作流引擎模块
 *
 * 提供 DAG 工作流编排和执行能力，借鉴 n8n 架构设计。
 *
 * 核心组件：
 * - TopologicalSorter: 拓扑排序和并行层级计算
 * - NodeRegistry: 节点类型注册和管理
 * - ExecutionContext: 执行上下文和状态管理
 * - 类型定义: 完整的工作流数据模型
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

// 核心类
export { TopologicalSorter, CycleDetectedError } from './topological-sorter';
export { NodeRegistry, getNodeRegistry, resetNodeRegistry, BUILT_IN_NODE_TYPES } from './node-registry';
export { ExecutionContext, NodeContext, createExecutionContext } from './execution-context';
export { WorkflowExecutor } from './workflow-executor';
export type { ErrorAction } from './workflow-executor';

// Phase 3 模块
export { ConditionalExecutor } from './conditional-executor';
export { ErrorHandler } from './error-handler';
export type { ErrorAction as ErrorHandlerAction, ErrorLogEntry } from './error-handler';
export { RetryManager } from './retry-manager';
export type { RetryRecord } from './retry-manager';

// Phase 4 模块 - 集成层
export { WorkflowIntegration } from './workflow-integration';
export type {
  IMemoryManager,
  IEventManager,
  WorkflowIntegrationConfig,
  WorkflowExecutionContext,
  WorkflowExecutionResult,
} from './workflow-integration';

// 接口和类型
export type {
  // NodeRegistry 类型
  NodeExecutionInput,
  INodeContext,
  NodeHandler,
  NodeTypeInfo,
  NodeInputDefinition,
  NodeOutputDefinition,
  NodeFactory,
  INodeRegistry,
} from './node-registry';

export type {
  // ExecutionContext 类型
  WorkflowExecutionState,
  EventListener,
  ExecutionContextConfig,
  IExecutionContext,
} from './execution-context';

// 类型定义
export type {
  // 工作流定义
  WorkflowDefinition,
  WorkflowSettings,
  WorkflowTrigger,

  // 节点类型
  WorkflowNode,
  NodeInput,
  NodeInputSource,
  NodeOutputDef,
  ConditionExpression,
  ErrorHandlerConfig,
  RetryPolicy,

  // 连接类型
  WorkflowConnection,
  ConnectionCondition,

  // 执行类型
  NodeOutput,
  MultiNodeOutput,
  NodeError,

  // 执行状态类型
  WorkflowExecution,
  NodeExecution,
  WorkflowExecutionStats,
  WorkflowState,
  NodeState,
  RetryAttempt,

  // 状态枚举
  WorkflowStatus,
  NodeStatus,
  WorkflowError,

  // 结果类型
  WorkflowResult,
  ValidationResult,
  ValidationError,
} from './types';