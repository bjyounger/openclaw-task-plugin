/**
 * WorkflowEngine 示例 - 错误处理
 *
 * 演示三种错误处理策略：
 * 1. abort - 停止工作流
 * 2. skip - 继续，走错误输出
 * 3. fallback - 继续，使用上次成功输出
 *
 * @author 杨珂 (bjyounger)
 */

import {
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
  ErrorHandler,
  type WorkflowDefinition,
  type NodeOutput,
  type WorkflowNode,
} from '../../src/core/workflow';

// ==================== 辅助函数 ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toISOString();
}

// ==================== 主程序 ====================

async function main() {
  console.log('=== WorkflowEngine 错误处理示例 ===\n');

  // Step 1: 创建节点注册表
  console.log('Step 1: 创建节点注册表...');
  const registry = new NodeRegistry();

  // 注册成功节点
  registry.register('success', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`  [${node.name}] 执行成功`);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: { result: 'success', value: input.data.value },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 10,
    };

    return output;
  });

  // 注册失败节点（可控失败）
  registry.register('fail', (node) => async (input, context) => {
    const startTime = timestamp();
    const shouldFail = node.config.shouldFail !== false;

    console.log(`  [${node.name}] 执行 (shouldFail=${shouldFail})`);

    if (shouldFail) {
      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: {
          code: 'INTENTIONAL_ERROR',
          message: `节点 ${node.name} 故意失败`,
          retryable: true,
        },
        startTime,
        endTime: timestamp(),
        duration: 10,
      };

      console.log(`  [${node.name}] 失败 ✗`);
      return output;
    }

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: { result: 'success after all' },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 10,
    };

    console.log(`  [${node.name}] 成功 ✓`);
    return output;
  });

  // 注册日志节点
  registry.register('log', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`  [${node.name}] 接收到输入:`, input.data);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: { logged: true, input: input.data },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 10,
    };

    return output;
  });

  console.log(`  注册节点数量: ${registry.size}`);

  // Step 2: 测试 ErrorHandler
  console.log('\nStep 2: 测试 ErrorHandler...');
  const errorHandler = new ErrorHandler('abort');

  const mockNode: WorkflowNode = {
    id: 'test-node',
    type: 'test',
    name: '测试节点',
    config: {},
  };

  const mockContext = new ExecutionContext({
    executionId: 'test-exec',
    workflowId: 'test-wf',
  });

  // 测试 abort 策略
  mockNode.onError = { strategy: 'abort' };
  const abortAction = errorHandler.handle(new Error('测试错误'), mockNode, mockContext);
  console.log(`  abort 策略结果: ${abortAction.action}`);

  // 测试 skip 策略
  mockNode.onError = { strategy: 'skip' };
  const skipAction = errorHandler.handle(new Error('测试错误'), mockNode, mockContext);
  console.log(`  skip 策略结果: ${skipAction.action}`);

  // 测试 fallback 策略
  mockNode.onError = { strategy: 'fallback' };
  const fallbackAction = errorHandler.handle(new Error('测试错误'), mockNode, mockContext);
  console.log(`  fallback 策略结果: ${fallbackAction.action}`);

  // 查看错误日志
  const logs = errorHandler.getErrorLog();
  console.log(`  错误日志条数: ${logs.length}`);

  // Step 3: 场景 1 - abort 策略
  console.log('\nStep 3: 场景 1 - abort 策略（停止工作流）...');
  console.log('  ---');

  const sorter = new TopologicalSorter();
  const executor = new WorkflowExecutor(registry, sorter);

  const abortWorkflow: WorkflowDefinition = {
    id: 'abort-workflow',
    name: 'Abort策略工作流',
    version: '1.0.0',
    nodes: [
      { id: 'n1', type: 'success', name: '节点1', config: {} },
      { 
        id: 'n2', 
        type: 'fail', 
        name: '失败节点', 
        config: { shouldFail: true },
        onError: { strategy: 'abort' },
      },
      { id: 'n3', type: 'success', name: '节点3', config: {} },  // 不会执行
    ],
    connections: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const context1 = new ExecutionContext({
    executionId: 'exec-abort-001',
    workflowId: abortWorkflow.id,
    input: { value: 1 },
  });

  const result1 = await executor.execute(abortWorkflow, context1);

  console.log('  ---');
  console.log(`  状态: ${result1.status}`);
  console.log(`  已完成节点: ${Array.from(result1.results.keys()).join(', ')}`);
  console.log(`  说明: n2 失败后工作流停止，n3 未执行`);

  // Step 4: 场景 2 - skip 策略
  console.log('\nStep 4: 场景 2 - skip 策略（继续，错误输出）...');
  console.log('  ---');

  const skipWorkflow: WorkflowDefinition = {
    id: 'skip-workflow',
    name: 'Skip策略工作流',
    version: '1.0.0',
    nodes: [
      { id: 'n1', type: 'success', name: '节点1', config: {} },
      { 
        id: 'n2', 
        type: 'fail', 
        name: '失败节点', 
        config: { shouldFail: true },
        onError: { strategy: 'skip' },
      },
      { id: 'n3', type: 'log', name: '节点3', config: {} },  // 会执行，接收错误输出
    ],
    connections: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const context2 = new ExecutionContext({
    executionId: 'exec-skip-001',
    workflowId: skipWorkflow.id,
    input: { value: 2 },
  });

  const result2 = await executor.execute(skipWorkflow, context2);

  console.log('  ---');
  console.log(`  状态: ${result2.status}`);
  console.log(`  已完成节点: ${Array.from(result2.results.keys()).join(', ')}`);
  console.log(`  说明: n2 失败但跳过，n3 继续执行`);

  // Step 5: 场景 3 - fallback 策略
  console.log('\nStep 5: 场景 3 - fallback 策略（继续，使用上次成功输出）...');
  console.log('  ---');

  const fallbackWorkflow: WorkflowDefinition = {
    id: 'fallback-workflow',
    name: 'Fallback策略工作流',
    version: '1.0.0',
    nodes: [
      { id: 'n1', type: 'success', name: '节点1', config: {} },
      { 
        id: 'n2', 
        type: 'fail', 
        name: '失败节点', 
        config: { shouldFail: true },
        onError: { strategy: 'fallback' },
      },
      { id: 'n3', type: 'log', name: '节点3', config: {} },
    ],
    connections: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const context3 = new ExecutionContext({
    executionId: 'exec-fallback-001',
    workflowId: fallbackWorkflow.id,
    input: { value: 3 },
  });

  // 注意：首次执行没有历史，fallback 会退化为 skip
  const result3 = await executor.execute(fallbackWorkflow, context3);

  console.log('  ---');
  console.log(`  状态: ${result3.status}`);
  console.log(`  已完成节点: ${Array.from(result3.results.keys()).join(', ')}`);
  console.log(`  说明: 首次执行无历史，fallback 退化为 skip`);

  // Step 6: 总结
  console.log('\nStep 6: 错误处理策略总结');
  console.log('  ┌────────────┬───────────────────────────────────────┐');
  console.log('  │   策略     │              行为                     │');
  console.log('  ├────────────┼───────────────────────────────────────┤');
  console.log('  │   abort    │  停止工作流，后续节点不执行            │');
  console.log('  │   skip     │  继续，将错误传递给下游节点            │');
  console.log('  │   fallback │  继续，使用上次成功输出（无历史则skip）│');
  console.log('  └────────────┴───────────────────────────────────────┘');

  console.log('\n=== 示例执行完成 ===');
}

// ==================== 预期输出 ====================

/**
 * 预期输出:
 * 
 * === WorkflowEngine 错误处理示例 ===
 * 
 * Step 1: 创建节点注册表...
 *   注册节点数量: 7
 * 
 * Step 2: 测试 ErrorHandler...
 *   abort 策略结果: abort
 *   skip 策略结果: skip
 *   fallback 策略结果: fallback
 *   错误日志条数: 3
 * 
 * Step 3: 场景 1 - abort 策略（停止工作流）...
 *   ---
 *   [节点1] 执行成功
 *   [失败节点] 执行 (shouldFail=true)
 *   [失败节点] 失败 ✗
 *   ---
 *   状态: failed
 *   已完成节点: n1, n2
 *   说明: n2 失败后工作流停止，n3 未执行
 * 
 * Step 4: 场景 2 - skip 策略（继续，错误输出）...
 *   ---
 *   [节点1] 执行成功
 *   [失败节点] 执行 (shouldFail=true)
 *   [失败节点] 失败 ✗
 *   [节点3] 接收到输入: { ... error info ... }
 *   ---
 *   状态: completed
 *   已完成节点: n1, n2, n3
 *   说明: n2 失败但跳过，n3 继续执行
 * 
 * Step 5: 场景 3 - fallback 策略（继续，使用上次成功输出）...
 *   ---
 *   [节点1] 执行成功
 *   [失败节点] 执行 (shouldFail=true)
 *   [失败节点] 失败 ✗
 *   [节点3] 接收到输入: ...
 *   ---
 *   状态: completed
 *   已完成节点: n1, n2, n3
 *   说明: 首次执行无历史，fallback 退化为 skip
 * 
 * Step 6: 错误处理策略总结
 *   ┌────────────┬───────────────────────────────────────┐
 *   │   策略     │              行为                     │
 *   ├────────────┼───────────────────────────────────────┤
 *   │   abort    │  停止工作流，后续节点不执行            │
 *   │   skip     │  继续，将错误传递给下游节点            │
 *   │   fallback │  继续，使用上次成功输出（无历史则skip）│
 *   └────────────┴───────────────────────────────────────┘
 * 
 * === 示例执行完成 ===
 */

main().catch(console.error);
