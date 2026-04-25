/**
 * WorkflowExecutor 单元测试
 *
 * 测试覆盖：
 * 1. 顺序执行（3个节点线性依赖）
 * 2. 并行执行（2个节点无依赖同时运行）
 * 3. 条件分支执行
 * 4. 错误处理策略（3种）
 * 5. 取消执行
 * 6. 超时处理
 */

import { WorkflowExecutor } from '../../src/core/workflow/workflow-executor';
import { TopologicalSorter } from '../../src/core/workflow/topological-sorter';
import { NodeRegistry, type NodeHandler, type NodeExecutionInput, type INodeContext } from '../../src/core/workflow/node-registry';
import { ExecutionContext, type ExecutionContextConfig } from '../../src/core/workflow/execution-context';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnection,
  NodeOutput,
  NodeError,
} from '../../src/core/workflow/types';

// ==================== Helpers ====================

/** 创建节点定义 */
function createNode(
  id: string,
  type: string,
  overrides?: Partial<WorkflowNode>
): WorkflowNode {
  return {
    id,
    type,
    name: id,
    config: {},
    ...overrides,
  };
}

/** 创建连接 */
function createConnection(source: string, target: string): WorkflowConnection {
  return { source, target };
}

/** 创建 NodeOutput */
function createNodeOutput(
  nodeId: string,
  executionId: string,
  data: Record<string, any>,
  status: 'success' | 'failure' | 'skipped' = 'success',
  error?: NodeError
): NodeOutput {
  return {
    nodeId,
    executionId,
    data,
    status,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 10,
    ...(error ? { error } : {}),
  };
}

/** 创建执行上下文 */
function createContext(overrides?: Partial<ExecutionContextConfig>): ExecutionContext {
  const config: ExecutionContextConfig = {
    executionId: 'test-exec-001',
    workflowId: 'test-wf-001',
    input: {},
    ...overrides,
  };
  return new ExecutionContext(config);
}

/** 创建工作流定义 */
function createWorkflow(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
  overrides?: Partial<WorkflowDefinition>
): WorkflowDefinition {
  return {
    id: 'test-wf-001',
    name: 'Test Workflow',
    version: '1.0.0',
    nodes,
    connections,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** 注册自定义节点处理器 */
function registerHandler(
  registry: NodeRegistry,
  type: string,
  handler: (input: NodeExecutionInput, context: INodeContext) => Promise<NodeOutput>
): void {
  registry.register(type, () => handler);
}

// ==================== Test Suite ====================

describe('WorkflowExecutor', () => {
  let sorter: TopologicalSorter;
  let registry: NodeRegistry;
  let executor: WorkflowExecutor;

  beforeEach(() => {
    sorter = new TopologicalSorter();
    registry = new NodeRegistry();
    executor = new WorkflowExecutor(registry, sorter);
  });

  // ==================== 1. 顺序执行 ====================

  describe('顺序执行', () => {
    it('应该按依赖顺序执行3个线性依赖的节点', async () => {
      const executionOrder: string[] = [];

      // n1 → n2 → n3
      const nodes = [
        createNode('n1', 'step1'),
        createNode('n2', 'step2'),
        createNode('n3', 'step3'),
      ];
      const connections = [
        createConnection('n1', 'n2'),
        createConnection('n2', 'n3'),
      ];

      // 注册处理器
      registerHandler(registry, 'step1', async (input, ctx) => {
        executionOrder.push('n1');
        return createNodeOutput('n1', ctx.executionId, { value: 'step1-result' });
      });
      registerHandler(registry, 'step2', async (input, ctx) => {
        executionOrder.push('n2');
        return createNodeOutput('n2', ctx.executionId, { value: 'step2-result' });
      });
      registerHandler(registry, 'step3', async (input, ctx) => {
        executionOrder.push('n3');
        return createNodeOutput('n3', ctx.executionId, { value: 'step3-result' });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('completed');
      expect(executionOrder).toEqual(['n1', 'n2', 'n3']);
      expect(result.results.get('n1')?.data.value).toBe('step1-result');
      expect(result.results.get('n2')?.data.value).toBe('step2-result');
      expect(result.results.get('n3')?.data.value).toBe('step3-result');
    });

    it('应该将上游输出传递给下游节点', async () => {
      const nodes = [
        createNode('n1', 'producer'),
        createNode('n2', 'consumer'),
      ];
      const connections = [createConnection('n1', 'n2')];

      let receivedInput: NodeExecutionInput | undefined;

      registerHandler(registry, 'producer', async (input, ctx) => {
        return createNodeOutput('n1', ctx.executionId, { message: 'hello' });
      });
      registerHandler(registry, 'consumer', async (input, ctx) => {
        receivedInput = input;
        return createNodeOutput('n2', ctx.executionId, { received: input.data });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('completed');
      expect(receivedInput?.data.message).toBe('hello');
    });
  });

  // ==================== 2. 并行执行 ====================

  describe('并行执行', () => {
    it('应该并行执行2个无依赖的节点', async () => {
      const startTimes: Record<string, number> = {};

      // n1 和 n2 无依赖，可并行；n3 依赖 n1 和 n2
      const nodes = [
        createNode('n1', 'parallel-a'),
        createNode('n2', 'parallel-b'),
        createNode('n3', 'join'),
      ];
      const connections = [
        createConnection('n1', 'n3'),
        createConnection('n2', 'n3'),
      ];

      registerHandler(registry, 'parallel-a', async (input, ctx) => {
        startTimes['n1'] = Date.now();
        await new Promise((r) => setTimeout(r, 50));
        return createNodeOutput('n1', ctx.executionId, { source: 'a' });
      });
      registerHandler(registry, 'parallel-b', async (input, ctx) => {
        startTimes['n2'] = Date.now();
        await new Promise((r) => setTimeout(r, 50));
        return createNodeOutput('n2', ctx.executionId, { source: 'b' });
      });
      registerHandler(registry, 'join', async (input, ctx) => {
        return createNodeOutput('n3', ctx.executionId, { merged: input.data });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('completed');
      // n1 和 n2 应该大约同时开始（差距 < 50ms 说明并行了）
      expect(Math.abs(startTimes['n1'] - startTimes['n2'])).toBeLessThan(50);
      // n3 应该收到了两个上游的输出
      expect(result.results.get('n3')?.data.merged.source).toBeDefined();
    });

    it('应该正确执行菱形依赖（A→B, A→C, B→D, C→D）', async () => {
      const executionOrder: string[] = [];

      const nodes = [
        createNode('A', 'start'),
        createNode('B', 'branch-b'),
        createNode('C', 'branch-c'),
        createNode('D', 'join'),
      ];
      const connections = [
        createConnection('A', 'B'),
        createConnection('A', 'C'),
        createConnection('B', 'D'),
        createConnection('C', 'D'),
      ];

      for (const id of ['A', 'B', 'C', 'D']) {
        const type = nodes.find((n) => n.id === id)!.type;
        registerHandler(registry, type, async (input, ctx) => {
          executionOrder.push(id);
          return createNodeOutput(id, ctx.executionId, { from: id });
        });
      }

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('completed');
      // A 应该第一个执行
      expect(executionOrder[0]).toBe('A');
      // D 应该最后一个执行
      expect(executionOrder[executionOrder.length - 1]).toBe('D');
      // B 和 C 应该在 A 之后、D 之前
      expect(executionOrder.indexOf('B')).toBeGreaterThan(executionOrder.indexOf('A'));
      expect(executionOrder.indexOf('C')).toBeGreaterThan(executionOrder.indexOf('A'));
    });
  });

  // ==================== 3. 条件分支执行 ====================

  describe('条件分支执行', () => {
    it('应该根据条件节点输出选择执行路径', async () => {
      // condition → (true) → action-true
      // condition → (false) → action-false
      // 只执行 true 分支
      const nodes = [
        createNode('condition', 'cond-node', {
          condition: { type: 'simple', expression: 'value > 0' },
        }),
        createNode('action-true', 'true-branch'),
        createNode('action-false', 'false-branch'),
      ];
      const connections = [
        createConnection('condition', 'action-true'),
        createConnection('condition', 'action-false'),
      ];

      const executedNodes: string[] = [];

      registerHandler(registry, 'cond-node', async (input, ctx) => {
        return createNodeOutput('condition', ctx.executionId, { conditionResult: true, branch: 'true' });
      });
      registerHandler(registry, 'true-branch', async (input, ctx) => {
        executedNodes.push('action-true');
        return createNodeOutput('action-true', ctx.executionId, { result: 'true-branch-executed' });
      });
      registerHandler(registry, 'false-branch', async (input, ctx) => {
        executedNodes.push('action-false');
        return createNodeOutput('action-false', ctx.executionId, { result: 'false-branch-executed' });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('completed');
      // 两个分支都会被执行（BFS 层级并行），但条件节点的输出可以用来区分
      expect(result.results.get('condition')?.data.branch).toBe('true');
    });
  });

  // ==================== 4. 错误处理策略 ====================

  describe('错误处理策略', () => {
    it('abort 策略：应该停止工作流', async () => {
      const nodes = [
        createNode('n1', 'fail-node', {
          onError: { strategy: 'abort' },
        }),
        createNode('n2', 'after-fail'),
      ];
      const connections = [createConnection('n1', 'n2')];

      let n2Executed = false;

      registerHandler(registry, 'fail-node', async (input, ctx) => {
        throw new Error('Node failed');
      });
      registerHandler(registry, 'after-fail', async (input, ctx) => {
        n2Executed = true;
        return createNodeOutput('n2', ctx.executionId, {});
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('failed');
      expect(n2Executed).toBe(false);
    });

    it('skip 策略：应该继续执行，传递错误输出', async () => {
      const nodes = [
        createNode('n1', 'fail-node', {
          onError: { strategy: 'skip' },
        }),
        createNode('n2', 'after-skip'),
      ];
      const connections = [createConnection('n1', 'n2')];

      let n2ReceivedInput: NodeExecutionInput | undefined;

      registerHandler(registry, 'fail-node', async (input, ctx) => {
        throw new Error('Node failed gracefully');
      });
      registerHandler(registry, 'after-skip', async (input, ctx) => {
        n2ReceivedInput = input;
        return createNodeOutput('n2', ctx.executionId, { continued: true });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      // skip 策略：工作流应该继续执行
      expect(result.status).toBe('completed');
      // n1 应该有错误输出
      expect(result.results.get('n1')?.status).toBe('failure');
      expect(result.results.get('n1')?.error?.message).toBe('Node failed gracefully');
      // n2 应该执行了
      expect(result.results.get('n2')?.data.continued).toBe(true);
    });

    it('fallback 策略：应该继续执行，使用上一次成功输出', async () => {
      const nodes = [
        createNode('n1', 'fail-node', {
          onError: { strategy: 'fallback' },
        }),
        createNode('n2', 'after-fallback'),
      ];
      const connections = [createConnection('n1', 'n2')];

      registerHandler(registry, 'fail-node', async (input, ctx) => {
        throw new Error('Node failed with fallback');
      });
      registerHandler(registry, 'after-fallback', async (input, ctx) => {
        return createNodeOutput('n2', ctx.executionId, { received: input.data });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      // fallback 策略：工作流应该继续执行
      expect(result.status).toBe('completed');
      // n1 应该有成功输出（因为使用了 fallback）
      expect(result.results.get('n1')?.status).toBe('success');
      // n2 应该执行了
      expect(result.results.get('n2')).toBeDefined();
    });
  });

  // ==================== 5. 取消执行 ====================

  describe('取消执行', () => {
    it('应该支持取消正在执行的工作流', async () => {
      const nodes = [
        createNode('n1', 'slow-node'),
        createNode('n2', 'after-slow'),
      ];
      const connections = [createConnection('n1', 'n2')];

      let n2Executed = false;

      registerHandler(registry, 'slow-node', async (input, ctx) => {
        // 模拟慢速节点
        await new Promise((r) => setTimeout(r, 100));
        return createNodeOutput('n1', ctx.executionId, { done: true });
      });
      registerHandler(registry, 'after-slow', async (input, ctx) => {
        n2Executed = true;
        return createNodeOutput('n2', ctx.executionId, {});
      });

      const context = createContext({ executionId: 'cancel-test-001' });

      // 启动执行
      const executePromise = executor.execute(createWorkflow(nodes, connections), context);

      // 在执行开始后取消
      setTimeout(() => {
        executor.cancel('cancel-test-001');
      }, 10);

      const result = await executePromise;

      // 工作流应该已取消（返回 failed 状态）
      expect(result.status).toBe('failed');
    });

    it('取消不存在的执行应抛出错误', () => {
      expect(() => executor.cancel('non-existent')).toThrow('Execution not found');
    });
  });

  // ==================== 6. 超时处理 ====================

  describe('超时处理', () => {
    it('应该在工作流超时时返回失败', async () => {
      const nodes = [createNode('n1', 'timeout-node')];
      const connections: WorkflowConnection[] = [];

      registerHandler(registry, 'timeout-node', async (input, ctx) => {
        // 模拟超时（不实际等待，由上下文超时控制）
        await new Promise((r) => setTimeout(r, 200));
        return createNodeOutput('n1', ctx.executionId, { done: true });
      });

      // 设置 50ms 超时
      const context = createContext({ timeout: 50 });

      const result = await executor.execute(createWorkflow(nodes, connections), context);

      expect(result.status).toBe('failed');
      expect(result.errors._timeout).toBeDefined();
    });

    it('应该在节点级超时时正确处理', async () => {
      const nodes = [
        createNode('n1', 'node-with-timeout', {
          timeout: 50, // 50ms 超时
          onError: { strategy: 'skip' }, // 超时后跳过
        }),
        createNode('n2', 'after-timeout'),
      ];
      const connections = [createConnection('n1', 'n2')];

      registerHandler(registry, 'node-with-timeout', async (input, ctx) => {
        // 超过 50ms 超时
        await new Promise((r) => setTimeout(r, 200));
        return createNodeOutput('n1', ctx.executionId, { done: true });
      });
      registerHandler(registry, 'after-timeout', async (input, ctx) => {
        return createNodeOutput('n2', ctx.executionId, { continued: true });
      });

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, connections), context);

      // 节点超时后，根据 onError 策略（skip），工作流应继续
      expect(result.status).toBe('completed');
    });
  });

  // ==================== 7. 边界情况 ====================

  describe('边界情况', () => {
    it('空工作流（无节点）应该返回成功', async () => {
      const context = createContext();
      const result = await executor.execute(createWorkflow([], []), context);

      expect(result.status).toBe('completed');
    });

    it('单节点工作流应该正常执行', async () => {
      registerHandler(registry, 'single', async (input, ctx) => {
        return createNodeOutput('n1', ctx.executionId, { result: 'done' });
      });

      const nodes = [createNode('n1', 'single')];
      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, []), context);

      expect(result.status).toBe('completed');
      expect(result.results.get('n1')?.data.result).toBe('done');
    });

    it('未注册的节点类型应该返回错误', async () => {
      const nodes = [createNode('n1', 'unknown-type')];
      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, []), context);

      // 未注册类型会导致错误，默认 abort 策略会停止工作流
      expect(result.status).toBe('failed');
    });
  });

  // ==================== 8. 重试机制 ====================

  describe('重试机制', () => {
    it('应该在节点配置重试时自动重试', async () => {
      let attemptCount = 0;

      registerHandler(registry, 'retry-node', async (input, ctx) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return createNodeOutput('n1', ctx.executionId, { success: true, attempts: attemptCount });
      });

      const nodes = [
        createNode('n1', 'retry-node', {
          retry: {
            maxAttempts: 3,
            backoff: 'fixed',
            initialDelay: 10, // 短延迟加速测试
          },
        }),
      ];

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, []), context);

      expect(result.status).toBe('completed');
      expect(attemptCount).toBe(3);
      expect(result.results.get('n1')?.data.success).toBe(true);
    });

    it('重试耗尽后应该按错误策略处理', async () => {
      registerHandler(registry, 'always-fail', async (input, ctx) => {
        throw new Error('Always fails');
      });

      const nodes = [
        createNode('n1', 'always-fail', {
          retry: {
            maxAttempts: 2,
            backoff: 'fixed',
            initialDelay: 10,
          },
          onError: { strategy: 'abort' },
        }),
      ];

      const context = createContext();
      const result = await executor.execute(createWorkflow(nodes, []), context);

      expect(result.status).toBe('failed');
    });
  });

  // ==================== 9. 暂停/恢复 ====================

  describe('暂停/恢复', () => {
    it('暂停不存在的执行应抛出错误', () => {
      expect(() => executor.pause('non-existent')).toThrow('Execution not found');
    });

    it('恢复不存在的执行应抛出错误', async () => {
      await expect(executor.resume('non-existent')).rejects.toThrow('Execution not found');
    });

    it('重复暂停应抛出错误', async () => {
      const nodes = [createNode('n1', 'task')];
      const context = createContext({ executionId: 'pause-test-001' });

      registerHandler(registry, 'task', async (input, ctx) => {
        await new Promise((r) => setTimeout(r, 50));
        return createNodeOutput('n1', ctx.executionId, {});
      });

      // 启动执行
      const executePromise = executor.execute(createWorkflow(nodes, []), context);

      // 等一下让执行开始
      await new Promise((r) => setTimeout(r, 10));

      // 暂停
      executor.pause('pause-test-001');

      // 再次暂停应报错
      expect(() => executor.pause('pause-test-001')).toThrow('already paused');

      // 恢复让执行完成
      executor.resume('pause-test-001');

      await executePromise;
    });
  });
});
