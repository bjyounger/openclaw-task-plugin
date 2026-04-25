/**
 * WorkflowEngine 示例 - 简单顺序工作流
 *
 * 演示最基本的工作流执行：
 * 1. 创建节点注册表
 * 2. 注册自定义节点
 * 3. 定义工作流（顺序执行）
 * 4. 执行工作流
 * 5. 获取结果
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

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建时间戳
 */
function timestamp(): string {
  return new Date().toISOString();
}

// ==================== 主程序 ====================

async function main() {
  console.log('=== WorkflowEngine 简单顺序工作流示例 ===\n');

  // Step 1: 创建节点注册表
  console.log('Step 1: 创建节点注册表...');
  const registry = new NodeRegistry();
  console.log(`  内置节点数量: ${registry.size}`);

  // Step 2: 注册自定义节点
  console.log('\nStep 2: 注册自定义节点...');

  // 注册日志节点
  registry.register('log', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`\n  [${node.name}] 执行中...`);
    console.log(`  输入数据:`, input.data);

    // 模拟处理延迟
    await sleep(100);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: { 
        message: `处理完成: ${input.data.message}`,
        processedAt: timestamp(),
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 100,
    };

    console.log(`  [${node.name}] 完成 ✓`);
    return output;
  });

  // 注册计数节点
  registry.register('count', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`\n  [${node.name}] 统计字符数...`);

    const text = input.data.message || '';
    const count = text.length;

    await sleep(50);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {
        originalText: text,
        characterCount: count,
        wordCount: text.split(/\s+/).filter(Boolean).length,
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 50,
    };

    console.log(`  [${node.name}] 字符数: ${count}, 单词数: ${output.data.wordCount} ✓`);
    return output;
  });

  console.log(`  注册后节点数量: ${registry.size}`);

  // Step 3: 定义工作流
  console.log('\nStep 3: 定义工作流...');
  const workflow: WorkflowDefinition = {
    id: 'simple-workflow-001',
    name: '文本处理工作流',
    description: '输入文本 → 处理 → 统计',
    version: '1.0.0',
    nodes: [
      {
        id: 'input',
        type: 'log',
        name: '输入处理',
        config: {},
      },
      {
        id: 'process',
        type: 'log',
        name: '文本处理',
        config: {},
      },
      {
        id: 'count',
        type: 'count',
        name: '统计',
        config: {},
      },
    ],
    connections: [
      { source: 'input', target: 'process' },
      { source: 'process', target: 'count' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  console.log(`  工作流 ID: ${workflow.id}`);
  console.log(`  节点数量: ${workflow.nodes.length}`);
  console.log(`  连接数量: ${workflow.connections.length}`);

  // Step 4: 创建执行器和上下文
  console.log('\nStep 4: 创建执行器和上下文...');
  const sorter = new TopologicalSorter();
  const executor = new WorkflowExecutor(registry, sorter);

  const context = new ExecutionContext({
    executionId: 'exec-simple-001',
    workflowId: workflow.id,
    input: {
      message: 'Hello WorkflowEngine! 这是一个简单的顺序工作流示例。',
    },
  });

  console.log(`  执行 ID: ${context.executionId}`);
  console.log(`  工作流 ID: ${context.workflowId}`);

  // Step 5: 执行工作流
  console.log('\nStep 5: 执行工作流...');
  console.log('  ---');

  const startTime = Date.now();
  const result = await executor.execute(workflow, context);
  const duration = Date.now() - startTime;

  console.log('  ---');

  // Step 6: 输出结果
  console.log('\nStep 6: 执行结果');
  console.log(`  状态: ${result.status}`);
  console.log(`  总耗时: ${duration}ms`);
  console.log(`  错误数: ${Object.keys(result.errors).length}`);

  // 显示各节点输出
  console.log('\n  各节点输出:');
  result.results.forEach((output, nodeId) => {
    console.log(`\n  [${nodeId}]:`);
    console.log(`    状态: ${output.status}`);
    console.log(`    耗时: ${output.duration}ms`);
    console.log(`    输出:`, output.data);
  });

  // Step 7: 执行统计
  console.log('\nStep 7: 执行统计');
  const stats = context.getStats();
  console.log(`  总节点数: ${stats.totalNodes}`);
  console.log(`  完成节点: ${stats.completedNodes}`);
  console.log(`  失败节点: ${stats.failedNodes}`);
  console.log(`  待处理节点: ${stats.pendingNodes}`);
  console.log(`  总执行时间: ${stats.duration}ms`);

  console.log('\n=== 示例执行完成 ===');
}

// ==================== 预期输出 ====================

/**
 * 预期输出:
 * 
 * === WorkflowEngine 简单顺序工作流示例 ===
 * 
 * Step 1: 创建节点注册表...
 *   内置节点数量: 4
 * 
 * Step 2: 注册自定义节点...
 *   注册后节点数量: 6
 * 
 * Step 3: 定义工作流...
 *   工作流 ID: simple-workflow-001
 *   节点数量: 3
 *   连接数量: 2
 * 
 * Step 4: 创建执行器和上下文...
 *   执行 ID: exec-simple-001
 *   工作流 ID: simple-workflow-001
 * 
 * Step 5: 执行工作流...
 *   ---
 *   [输入处理] 执行中...
 *   输入数据: { message: 'Hello WorkflowEngine! 这是一个简单的顺序工作流示例。' }
 *   [输入处理] 完成 ✓
 *   [文本处理] 执行中...
 *   输入数据: { message: '处理完成: Hello WorkflowEngine! 这是一个简单的顺序工作流示例。', ... }
 *   [文本处理] 完成 ✓
 *   [统计] 统计字符数...
 *   [统计] 字符数: XX, 单词数: XX ✓
 *   ---
 * 
 * Step 6: 执行结果
 *   状态: completed
 *   总耗时: XXms
 *   错误数: 0
 * 
 *   各节点输出:
 *   [input]: ...
 *   [process]: ...
 *   [count]: ...
 * 
 * Step 7: 执行统计
 *   总节点数: 3
 *   完成节点: 3
 *   失败节点: 0
 *   待处理节点: 0
 *   总执行时间: XXms
 * 
 * === 示例执行完成 ===
 */

// 运行示例
main().catch(console.error);
