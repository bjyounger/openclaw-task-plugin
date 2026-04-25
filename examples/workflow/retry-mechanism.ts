/**
 * WorkflowEngine 示例 - 重试机制
 *
 * 演示三种退避策略：
 * 1. fixed - 固定延迟
 * 2. linear - 线性递增
 * 3. exponential - 指数退避
 *
 * @author 杨珂 (bjyounger)
 */

import {
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
  RetryManager,
  type WorkflowDefinition,
  type NodeOutput,
  type RetryPolicy,
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
  console.log('=== WorkflowEngine 重试机制示例 ===\n');

  // Step 1: 创建节点注册表
  console.log('Step 1: 创建节点注册表...');
  const registry = new NodeRegistry();

  // 记录执行次数的节点（模拟失败后成功）
  const executionCounts = new Map<string, number>();
  const successAfter = new Map<string, number>(); // 第几次后成功

  registry.register('retryable', (node) => async (input, context) => {
    const startTime = timestamp();
    const nodeId = node.id;
    
    // 获取当前执行次数
    const count = (executionCounts.get(nodeId) || 0) + 1;
    executionCounts.set(nodeId, count);
    
    // 获取成功阈值
    const succeedAfter = successAfter.get(nodeId) || 3;

    console.log(`  [${node.name}] 执行尝试 #${count}`);

    if (count < succeedAfter) {
      // 前几次失败
      console.log(`  [${node.name}] 失败 (需要 ${succeedAfter} 次后成功)`);
      
      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: {
          code: 'RETRYABLE_ERROR',
          message: `第 ${count} 次执行失败，需要重试`,
          retryable: true,
        },
        startTime,
        endTime: timestamp(),
        duration: 10,
      };

      return output;
    }

    // 达到阈值，成功
    console.log(`  [${node.name}] 成功 ✓`);
    
    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: { 
        attempt: count,
        message: `经过 ${count} 次尝试后成功`,
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 10,
    };

    return output;
  });

  console.log(`  注册节点数量: ${registry.size}`);

  // Step 2: 测试 RetryManager
  console.log('\nStep 2: 测试 RetryManager...');

  // 测试指数退避计算
  const manager = new RetryManager({
    enabled: true,
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 100,
    multiplier: 2,
  });

  console.log('  指数退避延迟计算:');
  console.log('    尝试 1 失败后等待: 100ms (initialDelay)');
  console.log('    尝试 2 失败后等待: 200ms (100 * 2)');
  console.log('    尝试 3 失败后等待: 400ms (100 * 2^2)');

  // Step 3: 场景 1 - fixed 策略
  console.log('\nStep 3: 场景 1 - fixed 固定延迟...');
  console.log('  ---');

  executionCounts.clear();
  successAfter.set('n1', 2);  // 第 2 次成功

  const fixedPolicy: RetryPolicy = {
    maxAttempts: 3,
    backoff: 'fixed',
    initialDelay: 100,
  };

  const fixedWorkflow: WorkflowDefinition = {
    id: 'fixed-retry-workflow',
    name: 'Fixed策略重试',
    version: '1.0.0',
    nodes: [
      { 
        id: 'n1', 
        type: 'retryable', 
        name: '固定延迟重试节点', 
        config: {},
        retry: fixedPolicy,
      },
    ],
    connections: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const sorter = new TopologicalSorter();
  const executor = new WorkflowExecutor(registry, sorter);

  const startTime1 = Date.now();
  const context1 = new ExecutionContext({
    executionId: 'exec-fixed-001',
    workflowId: fixedWorkflow.id,
    input: {},
  });

  const result1 = await executor.execute(fixedWorkflow, context1);
  const duration1 = Date.now() - startTime1;

  console.log('  ---');
  console.log(`  状态: ${result1.status}`);
  console.log(`  总耗时: ${duration1}ms`);
  console.log(`  重试次数: ${executionCounts.get('n1')}`);
  console.log(`  说明: 固定等待 100ms * 1 = 100ms`);

  // Step 4: 场景 2 - linear 策略
  console.log('\nStep 4: 场景 2 - linear 线性递增...');
  console.log('  ---');

  executionCounts.clear();
  successAfter.set('n2', 3);  // 第 3 次成功

  const linearPolicy: RetryPolicy = {
    maxAttempts: 4,
    backoff: 'linear',
    initialDelay: 50,
  };

  const linearWorkflow: WorkflowDefinition = {
    id: 'linear-retry-workflow',
    name: 'Linear策略重试',
    version: '1.0.0',
    nodes: [
      { 
        id: 'n2', 
        type: 'retryable', 
        name: '线性递增重试节点', 
        config: {},
        retry: linearPolicy,
      },
    ],
    connections: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const startTime2 = Date.now();
  const context2 = new ExecutionContext({
    executionId: 'exec-linear-001',
    workflowId: linearWorkflow.id,
    input: {},
  });

  const result2 = await executor.execute(linearWorkflow, context2);
  const duration2 = Date.now() - startTime2;

  console.log('  ---');
  console.log(`  状态: ${result2.status}`);
  console.log(`  总耗时: ${duration2}ms`);
  console.log(`  重试次数: ${executionCounts.get('n2')}`);
  console.log(`  说明: 线性等待 50ms * 1 + 50ms * 2 = 150ms`);

  // Step 5: 场景 3 - exponential 策略
  console.log('\nStep 5: 场景 3 - exponential 指数退避...');
  console.log('  ---');

  executionCounts.clear();
  successAfter.set('n3', 4);  // 第 4 次成功

  const exponentialPolicy: RetryPolicy = {
    maxAttempts: 5,
    backoff: 'exponential',
    initialDelay: 50,
    maxDelay: 500,
    multiplier: 2,
  };

  const exponentialWorkflow: WorkflowDefinition = {
    id: 'exponential-retry-workflow',
    name: 'Exponential策略重试',
    version: '1.0.0',
    nodes: [
      { 
        id: 'n3', 
        type: 'retryable', 
        name: '指数退避重试节点', 
        config: {},
        retry: exponentialPolicy,
      },
    ],
    connections: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const startTime3 = Date.now();
  const context3 = new ExecutionContext({
    executionId: 'exec-exp-001',
    workflowId: exponentialWorkflow.id,
    input: {},
  });

  const result3 = await executor.execute(exponentialWorkflow, context3);
  const duration3 = Date.now() - startTime3;

  console.log('  ---');
  console.log(`  状态: ${result3.status}`);
  console.log(`  总耗时: ${duration3}ms`);
  console.log(`  重试次数: ${executionCounts.get('n3')}`);
  console.log(`  说明: 指数等待 50*1 + 50*2 + 50*4 = 350ms`);

  // Step 6: 对比三种策略
  console.log('\nStep 6: 三种退避策略对比');
  console.log('  ┌─────────────┬─────────────────────────────────────────┐');
  console.log('  │    策略     │              延迟计算                   │');
  console.log('  ├─────────────┼─────────────────────────────────────────┤');
  console.log('  │   fixed     │  delay = initialDelay                    │');
  console.log('  │   linear    │  delay = initialDelay * attempt          │');
  console.log('  │ exponential │  delay = initialDelay * multiplier^atm   │');
  console.log('  └─────────────┴─────────────────────────────────────────┘');

  console.log('\n  策略选择建议:');
  console.log('  - fixed: 简单场景，固定间隔重试');
  console.log('  - linear: 预期快速恢复的场景');
  console.log('  - exponential: 网络/API 调用，避免雪崩');

  console.log('\n=== 示例执行完成 ===');
}

// ==================== 预期输出 ====================

/**
 * 预期输出:
 * 
 * === WorkflowEngine 重试机制示例 ===
 * 
 * Step 1: 创建节点注册表...
 *   注册节点数量: 5
 * 
 * Step 2: 测试 RetryManager...
 *   指数退避延迟计算:
 *     尝试 1 失败后等待: 100ms (initialDelay)
 *     尝试 2 失败后等待: 200ms (100 * 2)
 *     尝试 3 失败后等待: 400ms (100 * 2^2)
 * 
 * Step 3: 场景 1 - fixed 固定延迟...
 *   ---
 *   [固定延迟重试节点] 执行尝试 #1
 *   [固定延迟重试节点] 失败 (需要 2 次后成功)
 *   [固定延迟重试节点] 执行尝试 #2
 *   [固定延迟重试节点] 成功 ✓
 *   ---
 *   状态: completed
 *   总耗时: ~120ms
 *   重试次数: 2
 *   说明: 固定等待 100ms * 1 = 100ms
 * 
 * Step 4: 场景 2 - linear 线性递增...
 *   ---
 *   [线性递增重试节点] 执行尝试 #1
 *   [线性递增重试节点] 失败 (需要 3 次后成功)
 *   [线性递增重试节点] 执行尝试 #2
 *   [线性递增重试节点] 失败 (需要 3 次后成功)
 *   [线性递增重试节点] 执行尝试 #3
 *   [线性递增重试节点] 成功 ✓
 *   ---
 *   状态: completed
 *   总耗时: ~170ms
 *   重试次数: 3
 *   说明: 线性等待 50ms * 1 + 50ms * 2 = 150ms
 * 
 * Step 5: 场景 3 - exponential 指数退避...
 *   ---
 *   [指数退避重试节点] 执行尝试 #1
 *   ...
 *   [指数退避重试节点] 成功 ✓
 *   ---
 *   状态: completed
 *   总耗时: ~370ms
 *   重试次数: 4
 *   说明: 指数等待 50*1 + 50*2 + 50*4 = 350ms
 * 
 * Step 6: 三种退避策略对比
 *   ...
 * 
 * === 示例执行完成 ===
 */

main().catch(console.error);
