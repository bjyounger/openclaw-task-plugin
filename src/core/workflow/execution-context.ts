/**
 * WorkflowEngine - 执行上下文
 *
 * 封装工作流执行状态和事件总线。
 * 提供节点级别的上下文隔离和状态持久化接口。
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowStatus,
  NodeOutput,
  WorkflowState,
  NodeState,
  WorkflowError,
  NodeExecution,
} from './types';
import type { INodeContext, NodeExecutionInput } from './node-registry';

// ==================== Types ====================

/**
 * 工作流执行状态（简化版）
 */
export interface WorkflowExecutionState {
  /** 执行 ID */
  executionId: string;

  /** 工作流 ID */
  workflowId: string;

  /** 执行状态 */
  status: WorkflowStatus;

  /** 当前执行节点 */
  currentNodeId?: string;

  /** 已完成节点 */
  completedNodes: string[];

  /** 失败节点 */
  failedNodes: string[];

  /** 执行开始时间 */
  startedAt: string;

  /** 执行完成时间 */
  completedAt?: string;

  /** 全局变量 */
  variables: Record<string, any>;

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 事件监听器类型
 */
export type EventListener = (event: string, data: any) => void;

/**
 * 执行上下文配置
 */
export interface ExecutionContextConfig {
  /** 执行 ID */
  executionId: string;

  /** 工作流 ID */
  workflowId: string;

  /** 工作流输入 */
  input?: Record<string, any>;

  /** 全局变量 */
  variables?: Record<string, any>;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 事件监听器 */
  eventListener?: EventListener;

  /** 日志函数 */
  logger?: (level: string, message: string, data?: any) => void;
}

/**
 * 执行上下文接口
 */
export interface IExecutionContext {
  /** 执行 ID */
  readonly executionId: string;

  /** 工作流 ID */
  readonly workflowId: string;

  /** 获取执行状态 */
  getState(): WorkflowExecutionState;

  /** 更新执行状态 */
  updateState(status: WorkflowStatus, currentNodeId?: string): void;

  /** 发送事件 */
  emit(event: string, data: any): void;

  /** 获取工作流输入 */
  getInput(): Record<string, any>;

  /** 获取节点输出 */
  getNodeOutput(nodeId: string): NodeOutput | undefined;

  /** 设置节点输出 */
  setNodeOutput(nodeId: string, output: NodeOutput): void;

  /** 获取所有节点输出 */
  getAllNodeOutputs(): Map<string, NodeOutput>;

  /** 创建节点上下文 */
  createNodeContext(nodeId: string, input: NodeExecutionInput, config?: Record<string, any>): INodeContext;

  /** 检查是否已取消 */
  isCancelled(): boolean;

  /** 取消执行 */
  cancel(reason?: string): void;

  /** 检查是否超时 */
  isTimeout(): boolean;

  /** 序列化状态 */
  serialize(): WorkflowState;

  /** 从序列化状态恢复 */
  deserialize(state: WorkflowState): void;
}

/**
 * 节点上下文实现
 */
export class NodeContext implements INodeContext {
  /** 节点 ID */
  readonly nodeId: string;

  /** 执行 ID */
  readonly executionId: string;

  /** 工作流 ID */
  readonly workflowId: string;

  /** 节点输入 */
  private readonly input: NodeExecutionInput;

  /** 节点配置 */
  private readonly config: Record<string, any>;

  /** 前一个节点的输出 */
  private readonly previousOutput?: NodeOutput;

  /** 事件发送函数 */
  private readonly emitEvent: (event: string, data: any) => void;

  /** 日志函数 */
  private readonly logFn: (level: string, message: string, data?: any) => void;

  /**
   * 创建节点上下文实例
   */
  constructor(
    nodeId: string,
    executionId: string,
    workflowId: string,
    input: NodeExecutionInput,
    config: Record<string, any>,
    previousOutput: NodeOutput | undefined,
    emitEvent: (event: string, data: any) => void,
    logFn: (level: string, message: string, data?: any) => void
  ) {
    this.nodeId = nodeId;
    this.executionId = executionId;
    this.workflowId = workflowId;
    this.input = input;
    this.config = config;
    this.previousOutput = previousOutput;
    this.emitEvent = emitEvent;
    this.logFn = logFn;
  }

  /**
   * 获取节点配置
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * 获取输入数据
   */
  getInput(): NodeExecutionInput {
    return this.input;
  }

  /**
   * 获取前一个节点的输出
   */
  getPreviousOutput(): NodeOutput | undefined {
    return this.previousOutput;
  }

  /**
   * 记录日志
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    this.logFn(level, message, {
      nodeId: this.nodeId,
      executionId: this.executionId,
      ...data,
    });
  }

  /**
   * 发送事件
   */
  emit(event: string, data: any): void {
    this.emitEvent(event, {
      nodeId: this.nodeId,
      executionId: this.executionId,
      ...data,
    });
  }
}

// ==================== ExecutionContext Implementation ====================

/**
 * 执行上下文
 *
 * 管理工作流执行的状态和数据流。
 * 提供节点级别的上下文隔离和状态持久化。
 *
 * @example
 * ```typescript
 * const context = new ExecutionContext({
 *   executionId: 'exec-001',
 *   workflowId: 'wf-001',
 *   input: { param1: 'value1' },
 * });
 *
 * // 创建节点上下文
 * const nodeCtx = context.createNodeContext('node-1', { data: {} });
 *
 * // 设置节点输出
 * context.setNodeOutput('node-1', {
 *   nodeId: 'node-1',
 *   executionId: 'exec-001',
 *   data: { result: 'success' },
 *   status: 'success',
 *   startTime: new Date().toISOString(),
 *   endTime: new Date().toISOString(),
 *   duration: 100,
 * });
 *
 * // 获取节点输出
 * const output = context.getNodeOutput('node-1');
 * ```
 */
export class ExecutionContext implements IExecutionContext {
  /** 执行 ID */
  readonly executionId: string;

  /** 工作流 ID */
  readonly workflowId: string;

  /** 执行状态 */
  private state: WorkflowExecutionState;

  /** 工作流输入 */
  private readonly input: Record<string, any>;

  /** 节点输出映射 */
  private readonly nodeOutputs: Map<string, NodeOutput>;

  /** 节点执行状态映射 */
  private readonly nodeExecutions: Map<string, NodeExecution>;

  /** 事件监听器 */
  private readonly eventListener?: EventListener;

  /** 日志函数 */
  private readonly logger: (level: string, message: string, data?: any) => void;

  /** 超时时间（毫秒） */
  private readonly timeout: number;

  /** 执行开始时间戳 */
  private readonly startTime: number;

  /** 是否已取消 */
  private cancelled: boolean;

  /** 取消原因 */
  private cancelReason?: string;

  /**
   * 创建执行上下文实例
   */
  constructor(config: ExecutionContextConfig) {
    this.executionId = config.executionId;
    this.workflowId = config.workflowId;
    this.input = config.input || {};
    this.timeout = config.timeout || 4 * 60 * 60 * 1000; // 默认 4 小时
    this.eventListener = config.eventListener;
    this.logger = config.logger || ((level, message, data) => {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    });

    this.startTime = Date.now();
    this.cancelled = false;
    this.nodeOutputs = new Map();
    this.nodeExecutions = new Map();

    // 初始化执行状态
    this.state = {
      executionId: config.executionId,
      workflowId: config.workflowId,
      status: 'pending',
      completedNodes: [],
      failedNodes: [],
      startedAt: new Date().toISOString(),
      variables: config.variables || {},
    };
  }

  /**
   * 获取执行状态
   */
  getState(): WorkflowExecutionState {
    return { ...this.state };
  }

  /**
   * 更新执行状态
   */
  updateState(status: WorkflowStatus, currentNodeId?: string): void {
    this.state.status = status;
    this.state.currentNodeId = currentNodeId;

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.state.completedAt = new Date().toISOString();
    }

    this.emit('workflow:state:changed', { status, currentNodeId });
    this.logger('info', `Workflow state updated`, { status, currentNodeId });
  }

  /**
   * 发送事件
   */
  emit(event: string, data: any): void {
    if (this.eventListener) {
      this.eventListener(event, data);
    }
  }

  /**
   * 获取工作流输入
   */
  getInput(): Record<string, any> {
    return { ...this.input };
  }

  /**
   * 获取节点输出
   */
  getNodeOutput(nodeId: string): NodeOutput | undefined {
    return this.nodeOutputs.get(nodeId);
  }

  /**
   * 设置节点输出
   */
  setNodeOutput(nodeId: string, output: NodeOutput): void {
    this.nodeOutputs.set(nodeId, output);

    // 更新执行状态
    if (output.status === 'success') {
      if (!this.state.completedNodes.includes(nodeId)) {
        this.state.completedNodes.push(nodeId);
      }
    } else if (output.status === 'failure') {
      if (!this.state.failedNodes.includes(nodeId)) {
        this.state.failedNodes.push(nodeId);
      }
    }

    this.emit('node:output:created', { nodeId, output });
    this.logger('debug', `Node output set`, { nodeId, status: output.status });
  }

  /**
   * 获取节点执行状态
   */
  getNodeExecution(nodeId: string): NodeExecution | undefined {
    return this.nodeExecutions.get(nodeId);
  }

  /**
   * 更新节点执行状态
   */
  updateNodeExecution(nodeId: string, execution: Partial<NodeExecution>): void {
    const existing = this.nodeExecutions.get(nodeId);
    if (existing) {
      this.nodeExecutions.set(nodeId, { ...existing, ...execution });
    } else {
      this.nodeExecutions.set(nodeId, {
        nodeId,
        status: execution.status || 'pending',
        ...execution,
      } as NodeExecution);
    }

    this.emit('node:state:changed', { nodeId, execution });
  }

  /**
   * 创建节点上下文
   */
  createNodeContext(
    nodeId: string,
    input: NodeExecutionInput,
    config?: Record<string, any>
  ): INodeContext {
    // 获取前一个节点的输出（如果有的话）
    const previousNodeId = this.getPreviousNodeId(nodeId);
    const previousOutput = previousNodeId ? this.nodeOutputs.get(previousNodeId) : undefined;

    return new NodeContext(
      nodeId,
      this.executionId,
      this.workflowId,
      input,
      config || {},
      previousOutput,
      this.emit.bind(this),
      this.logger
    );
  }

  /**
   * 获取前一个节点 ID
   * 简化实现：返回最后一个完成的节点
   */
  private getPreviousNodeId(nodeId: string): string | undefined {
    const completedCount = this.state.completedNodes.length;
    if (completedCount === 0) {
      return undefined;
    }
    return this.state.completedNodes[completedCount - 1];
  }

  /**
   * 检查是否已取消
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * 取消执行
   */
  cancel(reason?: string): void {
    this.cancelled = true;
    this.cancelReason = reason || 'User cancelled';
    this.updateState('cancelled');
    this.emit('workflow:cancelled', { reason: this.cancelReason });
    this.logger('warn', `Workflow cancelled`, { reason: this.cancelReason });
  }

  /**
   * 获取取消原因
   */
  getCancelReason(): string | undefined {
    return this.cancelReason;
  }

  /**
   * 检查是否超时
   */
  isTimeout(): boolean {
    return Date.now() - this.startTime > this.timeout;
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingTime(): number {
    return Math.max(0, this.timeout - (Date.now() - this.startTime));
  }

  /**
   * 设置变量
   */
  setVariable(key: string, value: any): void {
    this.state.variables[key] = value;
    this.emit('variable:changed', { key, value });
  }

  /**
   * 获取变量
   */
  getVariable(key: string): any {
    return this.state.variables[key];
  }

  /**
   * 获取所有变量
   */
  getVariables(): Record<string, any> {
    return { ...this.state.variables };
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: any): void {
    if (!this.state.metadata) {
      this.state.metadata = {};
    }
    this.state.metadata[key] = value;
  }

  /**
   * 获取元数据
   */
  getMetadata(key: string): any {
    return this.state.metadata?.[key];
  }

  /**
   * 序列化状态（用于持久化）
   */
  serialize(): WorkflowState {
    const nodeStates: Record<string, NodeState> = {};

    this.nodeExecutions.forEach((execution, nodeId) => {
      nodeStates[nodeId] = {
        status: execution.status,
        output: execution.output?.data,
        error: execution.error?.message,
        retryCount: execution.retryCount,
      };
    });

    return {
      executionId: this.executionId,
      workflowId: this.workflowId,
      status: this.state.status,
      serializedState: {
        nodeStates,
        variables: this.state.variables,
        checkpoint: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 从序列化状态恢复
   */
  deserialize(state: WorkflowState): void {
    if (state.executionId !== this.executionId) {
      throw new Error(`Execution ID mismatch: expected ${this.executionId}, got ${state.executionId}`);
    }

    if (state.workflowId !== this.workflowId) {
      throw new Error(`Workflow ID mismatch: expected ${this.workflowId}, got ${state.workflowId}`);
    }

    // 恢复状态
    this.state.status = state.status;
    this.state.variables = state.serializedState.variables;

    // 恢复节点状态
    const nodeStates = state.serializedState.nodeStates;
    Object.entries(nodeStates).forEach(([nodeId, nodeState]) => {
      this.nodeExecutions.set(nodeId, {
        nodeId,
        status: nodeState.status,
        output: nodeState.output ? {
          nodeId,
          executionId: this.executionId,
          data: nodeState.output,
          status: nodeState.status === 'success' ? 'success' : 'failure',
          startTime: state.updatedAt,
          endTime: state.updatedAt,
          duration: 0,
        } as NodeOutput : undefined,
        error: nodeState.error ? {
          code: 'RESTORED_ERROR',
          message: nodeState.error,
          retryable: false,
        } : undefined,
        retryCount: nodeState.retryCount,
      } as NodeExecution);

      // 恢复完成/失败节点列表
      if (nodeState.status === 'success') {
        this.state.completedNodes.push(nodeId);
      } else if (nodeState.status === 'failure') {
        this.state.failedNodes.push(nodeId);
      }
    });

    this.emit('workflow:restored', { state });
    this.logger('info', `Workflow state restored`, { executionId: this.executionId });
  }

  /**
   * 记录错误
   */
  recordError(error: WorkflowError): void {
    this.state.status = 'failed';
    this.state.completedAt = new Date().toISOString();
    this.emit('workflow:failed', { error });
    this.logger('error', `Workflow failed`, { error });
  }

  /**
   * 获取所有节点输出
   */
  getAllNodeOutputs(): Map<string, NodeOutput> {
    return new Map(this.nodeOutputs);
  }

  /**
   * 获取执行统计信息
   */
  getStats(): {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    pendingNodes: number;
    duration: number;
  } {
    return {
      totalNodes: this.nodeExecutions.size,
      completedNodes: this.state.completedNodes.length,
      failedNodes: this.state.failedNodes.length,
      pendingNodes: this.nodeExecutions.size - this.state.completedNodes.length - this.state.failedNodes.length,
      duration: Date.now() - this.startTime,
    };
  }
}

// ==================== Factory Functions ====================

/**
 * 创建执行上下文实例
 */
export function createExecutionContext(config: ExecutionContextConfig): ExecutionContext {
  return new ExecutionContext(config);
}
