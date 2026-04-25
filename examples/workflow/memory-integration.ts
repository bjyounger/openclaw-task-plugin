/**
 * WorkflowEngine 示例 - 记忆集成
 *
 * 演示工作流与 MemoryManager 集成：
 * 1. 执行前查询相关知识
 * 2. 执行后自动记录记忆
 * 3. 触发生命周期事件
 *
 * @author 杨珂 (bjyounger)
 */

import {
  WorkflowIntegration,
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
  type WorkflowDefinition,
  type NodeOutput,
  type IMemoryManager,
  type IEventManager,
  type WorkflowExecutionResult,
} from '../../src/core/workflow';

// ==================== Mock Services ====================

/**
 * Mock MemoryManager
 */
class MockMemoryManager implements IMemoryManager {
  private memories: Map<string, any> = new Map();
  private knowledgeBase: any[] = [
    { knowledgeId: 'k1', title: '工作流最佳实践', content: '设置合理的超时时间', tags: ['workflow'] },
    { knowledgeId: 'k2', title: '错误处理指南', content: '使用 fallback 策略处理可恢复错误', tags: ['error'] },
  ];

  async createEpisodicMemory(params: {
    source: string;
    priority?: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    tags?: string[];
    relatedTaskIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<{ memoryId: string }> {
    const memoryId = `mem-${Date.now()}`;
    this.memories.set(memoryId, {
      id: memoryId,
      ...params,
      createdAt: new Date().toISOString(),
    });

    console.log(`    [MemoryManager] 创建记忆: ${params.title}`);
    console.log(`    [MemoryManager] 记忆ID: ${memoryId}`);
    console.log(`    [MemoryManager] 摘要: ${params.summary}`);

    return { memoryId };
  }

  async queryKnowledge(params: {
    keywords?: string[];
    category?: string;
    limit?: number;
  }): Promise<Array<{
    knowledgeId: string;
    title: string;
    content: string;
    tags: string[];
  }>> {
    console.log(`    [MemoryManager] 查询知识: 关键词=[${(params.keywords || []).join(', ')}]`);

    // 简单过滤
    const results = this.knowledgeBase
      .filter(k => {
        if (!params.keywords || params.keywords.length === 0) return true;
        return params.keywords.some(kw => 
          k.title.toLowerCase().includes(kw.toLowerCase()) ||
          k.tags.includes(kw.toLowerCase())
        );
      })
      .slice(0, params.limit || 5);

    console.log(`    [MemoryManager] 找到 ${results.length} 条相关知识`);
    return results;
  }

  getMemoryCount(): number {
    return this.memories.size;
  }
}

/**
 * Mock EventManager
 */
class MockEventManager implements IEventManager {
  private listeners: Map<string, Array<(payload: unknown) => void>> = new Map();
  private eventLog: Array<{ event: string; payload: any; timestamp: Date }> = [];

  emit(eventType: string, payload: unknown): void {
    this.eventLog.push({ event: eventType, payload, timestamp: new Date() });
    console.log(`    [EventManager] 触发事件: ${eventType}`);

    const listeners = this.listeners.get(eventType) || [];
    listeners.forEach(listener => {
      try {
        listener(payload);
      } catch (error) {
        console.error(`    [EventManager] 监听器错误:`, error);
      }
    });
  }

  on(eventType: string, listener: (payload: unknown) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);

    return () => {
      const listeners = this.listeners.get(eventType) || [];
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  getEventLog(): Array<{ event: string; payload: any; timestamp: Date }> {
    return [...this.eventLog];
  }

  getEventCount(): number {
    return this.eventLog.length;
  }
}

// ==================== 辅助函数 ====================

function timestamp(): string {
  return new Date().toISOString();
}

// ==================== 主程序 ====================

async function main() {
  console.log('=== WorkflowEngine 记忆集成示例 ===\n');

  // Step 1: 创建节点注册表
  console.log('Step 1: 创建节点注册表...');
  const registry = new NodeRegistry();

  // 注册任务节点
  registry.register('task', (node) => async (input, context) => {
    const startTime = timestamp();
    console.log(`  [${node.name}] 执行任务...`);

    const output: NodeOutput = {
      nodeId: node.id,
      executionId: context.executionId,
      data: {
        taskName: node.name,
        input: input.data,
        result: 'success',
        processedAt: timestamp(),
      },
      status: 'success',
      startTime,
      endTime: timestamp(),
      duration: 50,
    };

    console.log(`  [${node.name}] 完成 ✓`);
    return output;
  });

  console.log(`  注册节点数量: ${registry.size}`);

  // Step 2: 创建 Mock 服务
  console.log('\nStep 2: 创建 Mock 服务...');
  const memoryManager = new MockMemoryManager();
  const eventManager = new MockEventManager();

  // 注册事件监听器
  console.log('  注册事件监听器...');
  eventManager.on('workflow:created', (data: any) => {
    console.log(`    → 工作流创建: ${data.workflowName}`);
  });
  eventManager.on('workflow:started', (data: any) => {
    console.log(`    → 工作流启动: ${data.workflowName}, 节点数: ${data.nodeCount}`);
  });
  eventManager.on('workflow:completed', (data: any) => {
    console.log(`    → 工作流完成: ${data.workflowName}, 耗时: ${data.duration}ms`);
  });
  eventManager.on('workflow:failed', (data: any) => {
    console.log(`    → 工作流失败: ${data.workflowName}`);
  });

  // Step 3: 创建集成服务
  console.log('\nStep 3: 创建 WorkflowIntegration...');
  const sorter = new TopologicalSorter();
  const executor = new WorkflowExecutor(registry, sorter);

  const integration = new WorkflowIntegration(
    executor,
    memoryManager,
    eventManager,
    {
      enableMemory: true,
      enableEvents: true,
      queryKnowledgeBeforeExecution: true,
      memoryPriority: 'high',
    }
  );

  console.log('  配置:');
  console.log('    - 启用记忆: true');
  console.log('    - 启用事件: true');
  console.log('    - 执行前查询知识: true');

  // Step 4: 定义工作流
  console.log('\nStep 4: 定义工作流...');
  const workflow: WorkflowDefinition = {
    id: 'memory-integration-workflow',
    name: '数据处理工作流',
    description: '演示记忆集成的工作流',
    version: '1.0.0',
    nodes: [
      { id: 'n1', type: 'task', name: '数据采集', config: {} },
      { id: 'n2', type: 'task', name: '数据处理', config: {} },
      { id: 'n3', type: 'task', name: '结果输出', config: {} },
    ],
    connections: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  console.log(`  工作流 ID: ${workflow.id}`);
  console.log(`  节点数量: ${workflow.nodes.length}`);

  // Step 5: 执行工作流
  console.log('\nStep 5: 执行工作流（带记忆集成）...');
  console.log('  ---');

  const context = new ExecutionContext({
    executionId: `exec-mem-${Date.now()}`,
    workflowId: workflow.id,
    input: {
      dataSource: 'api',
      recordCount: 100,
    },
  });

  const workflowContext = {
    definition: workflow,
    executionContext: context,
    userId: 'user-001',
    sessionId: 'session-001',
  };

  const startTime = Date.now();
  const result = await integration.createAndExecute(workflow, workflowContext);
  const duration = Date.now() - startTime;

  console.log('  ---');

  // Step 6: 分析结果
  console.log('\nStep 6: 执行结果分析');
  console.log(`  状态: ${result.status}`);
  console.log(`  耗时: ${result.duration}ms`);
  console.log(`  记忆ID: ${result.memoryId || '未记录'}`);
  console.log(`  相关知识: ${result.relatedKnowledgeIds?.length || 0} 条`);

  console.log('\n  执行统计:');
  console.log(`    总节点数: ${result.stats.totalNodes}`);
  console.log(`    完成节点: ${result.stats.completedNodes}`);
  console.log(`    失败节点: ${result.stats.failedNodes}`);
  console.log(`    跳过节点: ${result.stats.skippedNodes}`);

  // Step 7: 查看服务统计
  console.log('\nStep 7: 服务统计');
  console.log(`  MemoryManager:`);
  console.log(`    创建记忆数: ${memoryManager.getMemoryCount()}`);
  
  console.log(`  EventManager:`);
  console.log(`    触发事件数: ${eventManager.getEventCount()}`);
  
  const eventLog = eventManager.getEventLog();
  console.log('    事件列表:');
  eventLog.forEach(entry => {
    console.log(`      - ${entry.event}`);
  });

  // Step 8: 总结
  console.log('\nStep 8: 集成流程总结');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │                    工作流执行生命周期                        │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log('  │  1. workflow:created    → 创建工作流                       │');
  console.log('  │  2. queryKnowledge      → 查询相关知识（可选）             │');
  console.log('  │  3. workflow:started    → 开始执行                         │');
  console.log('  │  4. node:*              → 节点执行事件                     │');
  console.log('  │  5. workflow:completed  → 执行完成                         │');
  console.log('  │  6. createMemory        → 记录到记忆（可选）               │');
  console.log('  └─────────────────────────────────────────────────────────────┘');

  console.log('\n=== 示例执行完成 ===');
}

// ==================== 预期输出 ====================

/**
 * 预期输出:
 * 
 * === WorkflowEngine 记忆集成示例 ===
 * 
 * Step 1: 创建节点注册表...
 *   注册节点数量: 5
 * 
 * Step 2: 创建 Mock 服务...
 *   注册事件监听器...
 * 
 * Step 3: 创建 WorkflowIntegration...
 *   配置:
 *     - 启用记忆: true
 *     - 启用事件: true
 *     - 执行前查询知识: true
 * 
 * Step 4: 定义工作流...
 *   工作流 ID: memory-integration-workflow
 *   节点数量: 3
 * 
 * Step 5: 执行工作流（带记忆集成）...
 *   ---
 *   [EventManager] 触发事件: workflow:created
 *   → 工作流创建: 数据处理工作流
 *   [MemoryManager] 查询知识: 关键词=[数据处理]
 *   [MemoryManager] 找到 X 条相关知识
 *   [EventManager] 触发事件: workflow:started
 *   → 工作流启动: 数据处理工作流, 节点数: 3
 *   [数据采集] 执行任务...
 *   [数据采集] 完成 ✓
 *   [数据处理] 执行任务...
 *   [数据处理] 完成 ✓
 *   [结果输出] 执行任务...
 *   [结果输出] 完成 ✓
 *   [EventManager] 触发事件: workflow:completed
 *   → 工作流完成: 数据处理工作流, 耗时: XXms
 *   [MemoryManager] 创建记忆: 工作流执行: 数据处理工作流
 *   [MemoryManager] 记忆ID: mem-XXX
 *   [MemoryManager] 摘要: 工作流 "数据处理工作流" 成功完成...
 *   ---
 * 
 * Step 6: 执行结果分析
 *   状态: completed
 *   耗时: XXms
 *   记忆ID: mem-XXX
 *   相关知识: X 条
 * 
 *   执行统计:
 *     总节点数: 3
 *     完成节点: 3
 *     失败节点: 0
 *     跳过节点: 0
 * 
 * Step 7: 服务统计
 *   MemoryManager:
 *     创建记忆数: 1
 *   EventManager:
 *     触发事件数: 3
 *     事件列表:
 *       - workflow:created
 *       - workflow:started
 *       - workflow:completed
 * 
 * Step 8: 集成流程总结
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                    工作流执行生命周期                        │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  1. workflow:created    → 创建工作流                       │
 *   │  2. queryKnowledge      → 查询相关知识（可选）             │
 *   │  3. workflow:started    → 开始执行                         │
 *   │  4. node:*              → 节点执行事件                     │
 *   │  5. workflow:completed  → 执行完成                         │
 *   │  6. createMemory        → 记录到记忆（可选）               │
 *   └─────────────────────────────────────────────────────────────┘
 * 
 * === 示例执行完成 ===
 */

main().catch(console.error);
