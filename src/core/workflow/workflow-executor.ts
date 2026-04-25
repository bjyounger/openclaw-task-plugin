/**
 * WorkflowEngine - 工作流执行器
 *
 * 基于 BFS 并行执行策略，按拓扑层级逐层执行工作流节点。
 * 借鉴 n8n 执行引擎设计，支持：
 * 1. 拓扑排序 + BFS 层级并行执行
 * 2. Promise.allSettled 并行执行同层节点
 * 3. 三种错误处理策略（continueErrorOutput / continueRegularOutput / stopWorkflow）
 * 4. 重试机制（指数退避）
 * 5. 超时和取消控制
 * 6. 暂停/恢复执行
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnection,
  WorkflowResult,
  NodeOutput,
  NodeError,
  ErrorHandlerConfig,
  RetryPolicy,
} from './types';
import type { NodeHandler, NodeExecutionInput, INodeContext } from './node-registry';
import type { IExecutionContext } from './execution-context';
import { TopologicalSorter } from './topological-sorter';
import { NodeRegistry } from './node-registry';

// ==================== Types ====================

/**
 * 执行策略（借鉴 n8n 三种错误处理策略）
 *
 * 将现有 ErrorHandlerConfig 的 strategy 映射到执行引擎层面的行为：
 * - abort → stopWorkflow
 * - skip → continueErrorOutput
 * - fallback → continueRegularOutput
 * - retry → 先重试，再根据结果决定
 */
export type ErrorAction =
  | 'continueErrorOutput'   // 继续执行，将错误信息传递给下游
  | 'continueRegularOutput' // 继续执行，使用上一次成功的输出
  | 'stopWorkflow';         // 停止整个工作流

/**
 * 节点执行结果（内部使用）
 */
interface NodeExecutionResult {
  nodeId: string;
  output: NodeOutput;
  error?: Error;
}

/**
 * 暂停/恢复状态
 */
interface PauseState {
  /** 当前执行层级索引 */
  levelIndex: number;

  /** 当前层级已完成的节点 ID */
  completedInLevel: Set<string>;

  /** 是否已恢复 */
  resumed: boolean;

  /** 恢复 Promise 的 resolve 函数 */
  resolveResume?: () => void;
}

// ==================== WorkflowExecutor ====================

/**
 * 工作流执行器
 *
 * 负责按照拓扑排序结果和 BFS 层级并行执行工作流。
 *
 * @example
 * ```typescript
 * const executor = new WorkflowExecutor(nodeRegistry, topologicalSorter);
 * const result = await executor.execute(workflowDefinition, context);
 * ```
 */
export class WorkflowExecutor {
  /** 正在运行的执行（用于暂停/恢复/取消） */
  private readonly runningExecutions: Map<string, {
    context: IExecutionContext;
    pauseState?: PauseState;
    abortController?: AbortController;
  }>;

  /**
   * 创建工作流执行器实例
   *
   * @param nodeRegistry - 节点注册中心
   * @param topologicalSorter - 拓扑排序器
   */
  constructor(
    private readonly nodeRegistry: NodeRegistry,
    private readonly topologicalSorter: TopologicalSorter
  ) {
    this.runningExecutions = new Map();
  }

  /**
   * 执行工作流
   *
   * 1. 使用 TopologicalSorter 获取执行层级
   * 2. BFS 按层级分组，同层节点并行执行
   * 3. 处理错误、超时、取消
   *
   * @param definition - 工作流定义
   * @param context - 执行上下文
   * @returns 工作流执行结果
   */
  async execute(
    definition: WorkflowDefinition,
    context: IExecutionContext
  ): Promise<WorkflowResult> {
    const { nodes, connections } = definition;

    // 注册执行
    const abortController = new AbortController();
    this.runningExecutions.set(context.executionId, {
      context,
      abortController,
    });

    try {
      // 1. 拓扑排序获取执行层级
      const levels = this.topologicalSorter.getExecutionLevels(nodes, connections);

      // 2. 构建节点 ID → 节点定义的映射
      const nodeMap = new Map<string, WorkflowNode>();
      for (const node of nodes) {
        nodeMap.set(node.id, node);
      }

      // 3. 构建连接映射（source → targets）
      const connectionMap = this.buildConnectionMap(connections);

      // 4. 更新执行状态为 running
      context.updateState('running');

      // 5. 逐层执行
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        // 检查取消
        if (context.isCancelled()) {
          return this.buildCancelledResult(context);
        }

        // 检查超时
        if (context.isTimeout()) {
          context.updateState('timeout');
          return this.buildTimeoutResult(context);
        }

        const level = levels[levelIndex];

        // 并行执行同层节点
        const levelResults = await this.executeLevel(
          level,
          nodeMap,
          connectionMap,
          context,
          abortController
        );

        // 层级执行完成后再次检查超时（处理长时间运行节点的情况）
        if (context.isTimeout()) {
          context.updateState('timeout');
          return this.buildTimeoutResult(context);
        }

        // 处理层级结果
        let shouldStop = false;
        for (const result of levelResults) {
          // 设置节点输出到上下文
          context.setNodeOutput(result.nodeId, result.output);

          // 检查是否有需要停止工作流的错误
          if (result.output.status === 'failure' && result.error) {
            const node = nodeMap.get(result.nodeId)!;
            const action = this.resolveErrorAction(node.onError, result.error);

            if (action === 'stopWorkflow') {
              shouldStop = true;
              break;
            }
            // continueErrorOutput / continueRegularOutput → 继续执行
          }
        }

        if (shouldStop) {
          context.updateState('failed');
          return this.buildFailedResult(context, 'Workflow stopped due to node error');
        }
      }

      // 6. 执行完成
      context.updateState('completed');
      return this.buildSuccessResult(context);

    } finally {
      // 清理运行中记录
      this.runningExecutions.delete(context.executionId);
    }
  }

  /**
   * 暂停执行
   *
   * @param executionId - 执行 ID
   */
  pause(executionId: string): void {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.pauseState && !execution.pauseState.resumed) {
      throw new Error(`Execution already paused: ${executionId}`);
    }

    // 设置暂停状态
    execution.pauseState = {
      levelIndex: 0,
      completedInLevel: new Set(),
      resumed: false,
      resolveResume: undefined,
    };

    execution.context.updateState('paused');
  }

  /**
   * 恢复执行
   *
   * @param executionId - 执行 ID
   * @returns 工作流执行结果
   */
  async resume(executionId: string): Promise<WorkflowResult> {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (!execution.pauseState || execution.pauseState.resumed) {
      throw new Error(`Execution not paused: ${executionId}`);
    }

    // 标记已恢复
    execution.pauseState.resumed = true;
    execution.context.updateState('running');

    // 如果有等待的 resolve，调用它
    if (execution.pauseState.resolveResume) {
      execution.pauseState.resolveResume();
    }

    // 恢复后等待执行完成
    // 注意：实际的恢复逻辑在 executeLevel 中通过暂停检查实现
    // 这里只是标记恢复，execute 方法会继续运行
    return this.buildSuccessResult(execution.context);
  }

  /**
   * 取消执行
   *
   * @param executionId - 执行 ID
   */
  cancel(executionId: string): void {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    // 1. 设置上下文取消
    execution.context.cancel('User cancelled');

    // 2. 触发 AbortController
    if (execution.abortController) {
      execution.abortController.abort();
    }

    // 3. 如果暂停中，先恢复让它检测到取消
    if (execution.pauseState && !execution.pauseState.resumed) {
      execution.pauseState.resumed = true;
      if (execution.pauseState.resolveResume) {
        execution.pauseState.resolveResume();
      }
    }
  }

  // ==================== Private Methods ====================

  /**
   * 执行一个层级的所有节点（并行）
   */
  private async executeLevel(
    levelNodeIds: string[],
    nodeMap: Map<string, WorkflowNode>,
    connectionMap: Map<string, WorkflowConnection[]>,
    context: IExecutionContext,
    abortController: AbortController
  ): Promise<NodeExecutionResult[]> {
    // 检查暂停
    await this.checkPause(context);

    // 为每个节点创建执行任务
    const tasks = levelNodeIds.map(async (nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) {
        return this.createErrorResult(nodeId, context.executionId, 'NODE_NOT_FOUND', `Node not found: ${nodeId}`);
      }

      // 再次检查取消/超时
      if (context.isCancelled()) {
        return this.createSkippedResult(nodeId, context.executionId, 'Execution cancelled');
      }
      if (context.isTimeout()) {
        return this.createSkippedResult(nodeId, context.executionId, 'Execution timeout');
      }

      return this.executeNode(node, connectionMap, context, abortController);
    });

    // 并行执行，使用 Promise.allSettled 确保一个失败不影响其他
    const settled = await Promise.allSettled(tasks);

    // 收集结果
    const results: NodeExecutionResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Promise 被拒绝（不应该发生，因为 executeNode 内部已捕获错误）
        const error = result.reason as Error;
        results.push({
          nodeId: 'unknown',
          output: {
            nodeId: 'unknown',
            executionId: context.executionId,
            data: {},
            status: 'failure',
            error: {
              code: 'UNHANDLED_ERROR',
              message: error.message,
              retryable: false,
            },
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 0,
          },
          error,
        });
      }
    }

    return results;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: WorkflowNode,
    connectionMap: Map<string, WorkflowConnection[]>,
    context: IExecutionContext,
    abortController: AbortController
  ): Promise<NodeExecutionResult> {
    const startTime = new Date();

    // 1. 获取节点处理器
    const factory = this.nodeRegistry.get(node.type);
    if (!factory) {
      return this.createErrorResult(
        node.id,
        context.executionId,
        'NODE_TYPE_NOT_REGISTERED',
        `Node type not registered: ${node.type}`
      );
    }

    // 2. 构建节点输入（从上游节点输出合并）
    const input = this.buildNodeInput(node.id, connectionMap, context);

    // 3. 创建节点上下文
    const nodeContext = context.createNodeContext(node.id, input, node.config);

    // 4. 创建节点处理器
    const handler = factory(node);

    try {
      // 5. 带重试执行
      const output = await this.executeWithRetry(
        node,
        handler,
        input,
        nodeContext,
        abortController
      );

      return { nodeId: node.id, output };
    } catch (error) {
      // 节点执行失败，根据错误策略处理
      const err = error as Error;
      const nodeError: NodeError = {
        code: 'NODE_EXECUTION_ERROR',
        message: err.message,
        stack: err.stack,
        retryable: true,
      };

      const action = this.resolveErrorAction(node.onError, err);

      if (action === 'continueErrorOutput') {
        // 继续执行，将错误包装到输出中
        const errorOutput: NodeOutput = {
          nodeId: node.id,
          executionId: context.executionId,
          data: {},
          status: 'failure',
          error: nodeError,
          startTime: startTime.toISOString(),
          endTime: new Date().toISOString(),
          duration: Date.now() - startTime.getTime(),
        };
        return { nodeId: node.id, output: errorOutput, error: err };
      }

      if (action === 'continueRegularOutput') {
        // 继续执行，使用上一次成功输出或空输出
        const previousOutput = context.getNodeOutput(node.id);
        const regularOutput: NodeOutput = {
          nodeId: node.id,
          executionId: context.executionId,
          data: previousOutput?.data || {},
          status: 'success',
          startTime: startTime.toISOString(),
          endTime: new Date().toISOString(),
          duration: Date.now() - startTime.getTime(),
        };
        return { nodeId: node.id, output: regularOutput, error: err };
      }

      // stopWorkflow
      const stopOutput: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: nodeError,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime.getTime(),
      };
      return { nodeId: node.id, output: stopOutput, error: err };
    }
  }

  /**
   * 带重试机制的节点执行
   */
  private async executeWithRetry(
    node: WorkflowNode,
    handler: NodeHandler,
    input: NodeExecutionInput,
    nodeContext: INodeContext,
    abortController: AbortController
  ): Promise<NodeOutput> {
    const retryPolicy = node.retry || node.onError;
    const maxAttempts = this.getMaxAttempts(retryPolicy);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 检查取消
      if (abortController.signal.aborted) {
        throw new Error('Execution aborted');
      }

      try {
        // 节点级超时控制
        const output = await this.executeWithTimeout(
          handler,
          input,
          nodeContext,
          node.timeout
        );
        return output;
      } catch (error) {
        lastError = error as Error;

        // 如果不是最后一次重试，等待退避
        if (attempt < maxAttempts) {
          const delay = this.calculateRetryDelay(retryPolicy, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Node execution failed after retries');
  }

  /**
   * 带超时的节点执行
   */
  private async executeWithTimeout(
    handler: NodeHandler,
    input: NodeExecutionInput,
    nodeContext: INodeContext,
    timeout?: number
  ): Promise<NodeOutput> {
    if (!timeout) {
      return handler(input, nodeContext);
    }

    return new Promise<NodeOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Node execution timeout after ${timeout}ms`));
      }, timeout);

      handler(input, nodeContext)
        .then((output) => {
          clearTimeout(timer);
          resolve(output);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 检查暂停状态，如果暂停则等待恢复
   */
  private async checkPause(context: IExecutionContext): Promise<void> {
    const execution = this.runningExecutions.get(context.executionId);
    if (!execution || !execution.pauseState || execution.pauseState.resumed) {
      return;
    }

    // 等待恢复
    await new Promise<void>((resolve) => {
      if (execution.pauseState!) {
        execution.pauseState.resolveResume = resolve;
      }
    });
  }

  /**
   * 构建连接映射（source → targets）
   */
  private buildConnectionMap(
    connections: WorkflowConnection[]
  ): Map<string, WorkflowConnection[]> {
    const map = new Map<string, WorkflowConnection[]>();
    for (const conn of connections) {
      const existing = map.get(conn.source) || [];
      existing.push(conn);
      map.set(conn.source, existing);
    }
    return map;
  }

  /**
   * 构建节点输入数据
   * 合并所有上游节点的输出作为当前节点的输入
   */
  private buildNodeInput(
    nodeId: string,
    connectionMap: Map<string, WorkflowConnection[]>,
    context: IExecutionContext
  ): NodeExecutionInput {
    const mergedData: Record<string, any> = {};
    let sourceNodeId: string | undefined;

    // 收集所有指向当前节点的连接
    for (const [, conns] of connectionMap) {
      for (const conn of conns) {
        if (conn.target === nodeId) {
          const sourceOutput = context.getNodeOutput(conn.source);
          if (sourceOutput) {
            // 合并上游输出
            Object.assign(mergedData, sourceOutput.data);
            sourceNodeId = conn.source;
          }
        }
      }
    }

    // 如果没有上游节点，使用工作流输入
    if (Object.keys(mergedData).length === 0) {
      Object.assign(mergedData, context.getInput());
    }

    return {
      data: mergedData,
      sourceNodeId,
    };
  }

  /**
   * 解析错误处理动作
   *
   * 将 ErrorHandlerConfig.strategy 映射到 n8n 风格的执行动作
   */
  private resolveErrorAction(
    onError?: ErrorHandlerConfig,
    error?: Error
  ): ErrorAction {
    if (!onError) {
      // 默认策略：停止工作流
      return 'stopWorkflow';
    }

    switch (onError.strategy) {
      case 'skip':
        // skip → continueErrorOutput：跳过节点，将错误传递给下游
        return 'continueErrorOutput';

      case 'fallback':
        // fallback → continueRegularOutput：使用回退值继续执行
        return 'continueRegularOutput';

      case 'retry':
        // retry 已在 executeWithRetry 中处理
        // 如果重试耗尽，默认停止工作流
        return 'stopWorkflow';

      case 'abort':
      default:
        // abort → stopWorkflow
        return 'stopWorkflow';
    }
  }

  /**
   * 获取最大重试次数
   */
  private getMaxAttempts(retryPolicy?: RetryPolicy | ErrorHandlerConfig): number {
    if (!retryPolicy) {
      return 1; // 不重试
    }

    if ('maxAttempts' in retryPolicy) {
      return retryPolicy.maxAttempts;
    }

    // ErrorHandlerConfig
    if ('maxRetries' in retryPolicy && retryPolicy.maxRetries !== undefined) {
      return retryPolicy.maxRetries + 1; // maxRetries 不包含首次执行
    }

    return 1;
  }

  /**
   * 计算重试延迟
   */
  private calculateRetryDelay(
    retryPolicy: RetryPolicy | ErrorHandlerConfig | undefined,
    attempt: number
  ): number {
    if (!retryPolicy || !('backoff' in retryPolicy)) {
      // 默认 1 秒固定延迟
      return 1000;
    }

    const policy = retryPolicy as RetryPolicy;
    const initialDelay = policy.initialDelay || 1000;

    switch (policy.backoff) {
      case 'fixed':
        return initialDelay;

      case 'linear':
        return initialDelay * attempt;

      case 'exponential': {
        const multiplier = policy.multiplier || 2;
        const delay = initialDelay * Math.pow(multiplier, attempt - 1);
        return policy.maxDelay ? Math.min(delay, policy.maxDelay) : delay;
      }

      default:
        return initialDelay;
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    nodeId: string,
    executionId: string,
    code: string,
    message: string
  ): NodeExecutionResult {
    const now = new Date().toISOString();
    const error: NodeError = {
      code,
      message,
      retryable: false,
    };
    return {
      nodeId,
      output: {
        nodeId,
        executionId,
        data: {},
        status: 'failure',
        error,
        startTime: now,
        endTime: now,
        duration: 0,
      },
      error: new Error(message),
    };
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(
    nodeId: string,
    executionId: string,
    reason: string
  ): NodeExecutionResult {
    const now = new Date().toISOString();
    return {
      nodeId,
      output: {
        nodeId,
        executionId,
        data: {},
        status: 'skipped',
        error: {
          code: 'SKIPPED',
          message: reason,
          retryable: false,
        },
        startTime: now,
        endTime: now,
        duration: 0,
      },
    };
  }

  /**
   * 构建成功结果
   */
  private buildSuccessResult(context: IExecutionContext): WorkflowResult {
    return {
      status: 'completed',
      results: context.getAllNodeOutputs(),
      errors: {},
    };
  }

  /**
   * 构建失败结果
   */
  private buildFailedResult(context: IExecutionContext, message: string): WorkflowResult {
    const errors: Record<string, Error> = {};
    const outputs = context.getAllNodeOutputs();
    for (const [nodeId, output] of outputs) {
      if (output.status === 'failure' && output.error) {
        errors[nodeId] = new Error(output.error.message);
      }
    }

    return {
      status: 'failed',
      results: outputs,
      errors,
    };
  }

  /**
   * 构建取消结果
   */
  private buildCancelledResult(context: IExecutionContext): WorkflowResult {
    return {
      status: 'failed',
      results: context.getAllNodeOutputs(),
      errors: { _cancelled: new Error('Execution cancelled') },
    };
  }

  /**
   * 构建超时结果
   */
  private buildTimeoutResult(context: IExecutionContext): WorkflowResult {
    return {
      status: 'failed',
      results: context.getAllNodeOutputs(),
      errors: { _timeout: new Error('Execution timeout') },
    };
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
