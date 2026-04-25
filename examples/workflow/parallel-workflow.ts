/**
 * WorkflowEngine 示例 - 并行执行工作流
 *
 * 演示工作流的并行执行能力：
 * 1. 定义多个可并行执行的节点
 * 2. 拓扑排序计算执行层级
 * 3. 同层级节点并行执行
 * 4. 汇聚结果
 *
 * 工作流结构:
 *
 *          [start]
 *          /   |   \
 *     [task1][task2][task3]  <- 并行执行
 *          \   |   /
 *          [merge]
 *
 * @author 杨珂 (bjyounger)
 */

import {
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
  type WorkflowDefinition,
  type NodeOutput,
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
  console.log('=== WorkflowEngine 并行执行工作流示例 ===\n');

  // Step 1: 创建节点注册表
  console.log('Step 1: 创建节点注册表...');
  const registry = new NodeRegistry();

  // 注册模拟任务节点
  registry.register('worker', (node) => async (input, context) => {
    const startTime = timestamp();
    const delay = node.config.delay || 500;

    console.log(`  [${node.name}] 开始执行 (预计 ${delay}ms)`);
    await sleep(delay);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {
        workerId: node.id,
        result: `任务 ${node.name} 完成`,
        delay,
        completedAt: timestamp(),
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: delay,
    };

    console.log(`  [${node.name}] 完成 ✓`);
    return output;
  });

  // 注册汇聚节点
  registry.register('merge', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`  [${node.name}] 汇聚结果...`);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {
        mergedAt: timestamp(),
        inputSource: input.sourceNodeId,
        mergedData: input.data,
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 10,
    };

    console.log(`  [${node.name}] 汇聚完成 ✓`);
    return output;
  });

  console.log(`  注册节点数量: ${registry.size}`);

  // Step 2: 定义并行工作流
  console.log('\nStep 2: 定义并行工作流...');
  const workflow: WorkflowDefinition = {
    id: 'parallel-workflow-001',
    name: '并行任务工作流',
    description: '三个任务并行执行后汇聚结果',
    version: '1.0.0',
    nodes: [
      // 起始节点
      { id: 'start', type: 'worker', name: '起始任务', config: { delay: 100 } },
      
      // 并行任务（同层级）
      { id: 'task1', type: 'worker', name: '并行任务1', config: { delay: 300 } },
      { id: 'task2', type: 'worker', name: '并行任务2', config: { delay: 200 } },
      { id: 'task3', type: 'worker', name: '并行任务3', config: { delay: 400 } },
      
      // 汇聚节点
      { id: 'merge', type: 'merge', name: '结果汇聚', config: {} },
    ],
    connections: [
      // start → task1, task2, task3
      { source: 'start', target: 'task1' },
      { source: 'start', target: 'task2' },
      { source: 'start', target: 'task3' },
      
      // task1, task2, task3 → merge
      { source: 'task1', target: 'merge' },
      { source: 'task2', target: 'merge' },
      { source: 'task3', target: 'merge' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  console.log(`  工作流 ID: ${workflow.id}`);
  console.log(`  节点数量: ${workflow.nodes.length}`);
  console.log(`  连接数量: ${workflow.connections.length}`);

  // Step 3: 查看执行层级
  console.log('\nStep 3: 计算执行层级...');
  const sorter = new TopologicalSorter();
  const levels = sorter.getExecutionLevels(workflow.nodes, workflow.connections);

  console.log('  执行层级:');
  levels.forEach((level, index) => {
    console.log(`    Level ${index}: [${level.join(', ')}]`);
  });

  // Step 4: 执行工作流
  console.log('\nStep 4: 执行工作流...');
  console.log('  ---');

  const executor = new WorkflowExecutor(registry, sorter);
  const context = new ExecutionContext({
    executionId: 'exec-parallel-001',
    workflowId: workflow.id,
    input: { trigger: 'manual' },
  });

  const startTime = Date.now();
  const result = await executor.execute(workflow, context);
  const duration = Date.now() - startTime;

  console.log('  ---');

  // Step 5: 分析执行时间
  console.log('\nStep 5: 执行时间分析');
  console.log(`  实际总耗时: ${duration}ms`);
  
  // 计算理论串行时间
  const serialTime = workflow.nodes.reduce((sum, node) => {
    return sum + (node.config.delay || 0);
  }, 0);
  console.log(`  理论串行时间: ${serialTime}ms`);
  console.log(`  并行加速比: ${(serialTime / duration).toFixed(2)}x`);

  // Step 6: 输出结果
  console.log('\nStep 6: 执行结果');
  console.log(`  状态: ${result.status}`);
  console.log(`  错误数: ${Object.keys(result.errors).length}`);

  // 显示各节点输出
  console.log('\n  各节点输出:');
  result.results.forEach((output, nodeId) => {
    console.log(`  [${nodeId}]: 耗时 ${output.duration}ms`);
  });

  console.log('\n=== 示例执行完成 ===');
}

// ==================== 预期输出 ====================

/**
 * 预期输出:
 * 
 * === WorkflowEngine 并行执行工作流示例 ===
 * 
 * Step 1: 创建节点注册表...
 *   注册节点数量: 6
 * 
 * Step 2: 定义并行工作流...
 *   工作流 ID: parallel-workflow-001
 *   节点数量: 5
 *   连接数量: 6
 * 
 * Step 3: 计算执行层级...
 *   执行层级:
 *     Level 0: [start]
 *     Level 1: [task1, task2, task3]
 *     Level 2: [merge]
 * 
 * Step 4: 执行工作流...
 *   ---
 *   [起始任务] 开始执行 (预计 100ms)
 *   [起始任务] 完成 ✓
 *   [并行任务1] 开始执行 (预计 300ms)
 *   [并行任务2] 开始执行 (预计 200ms)
 *   [并行任务3] 开始执行 (预计 400ms)
 *   [并行任务2] 完成 ✓
 *   [并行任务1] 完成 ✓
 *   [并行任务3] 完成 ✓
 *   [结果汇聚] 汇聚结果...
 *   [结果汇聚] 汇聚完成 ✓
 *   ---
 * 
 * Step 5: 执行时间分析
 *   实际总耗时: ~550ms
 *   理论串行时间: 1000ms
 *   并行加速比: ~1.8x
 * 
 * Step 6: 执行结果
 *   状态: completed
 *   错误数: 0
 * 
 * === 示例执行完成 ===
 * 
 * 关键观察:
 * - task1, task2, task3 并行执行
 * - 实际耗时 ≈ max(300, 200, 400) + 100 + 10 ≈ 510ms
 * - 而串行执行需要 100+300+200+400+10 = 1010ms
 * - 并行加速比 ≈ 1.8x - 2.0x
 */

main().catch(console.error);
