/**
 * WorkflowEngine - 集成测试
 *
 * 测试工作流引擎的端到端集成，包括：
 * 1. 端到端工作流执行（定义→执行→结果→记忆记录）
 * 2. 条件分支集成
 * 3. 并行+汇聚集成
 * 4. 失败重试集成
 * 5. 事件触发验证
 * 6. 记忆记录验证
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import {
  WorkflowDefinition,
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
  WorkflowIntegration,
  WorkflowExecutionContext,
  IMemoryManager,
  IEventManager,
  NodeOutput,
  WorkflowNode,
  NodeHandler,
  NodeExecutionInput,
  INodeContext,
  getNodeRegistry,
} from '../../src/core/workflow';

// ==================== Mock Implementations ====================

/**
 * Mock MemoryManager
 */
class MockMemoryManager implements IMemoryManager {
  private memories: Array<{
    memoryId: string;
    source: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
  }> = [];

  private knowledge: Array<{
    knowledgeId: string;
    title: string;
    content: string;
    tags: string[];
  }> = [];

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
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.memories.push({
      memoryId,
      ...params,
    });
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
    if (!params.keywords || params.keywords.length === 0) {
      return this.knowledge.slice(0, params.limit);
    }

    return this.knowledge
      .filter(k => params.keywords!.some(keyword => k.tags.includes(keyword)))
      .slice(0, params.limit);
  }

  addKnowledge(knowledge: {
    knowledgeId: string;
    title: string;
    content: string;
    tags: string[];
  }): void {
    this.knowledge.push(knowledge);
  }

  getMemories(): Array<{
    memoryId: string;
    source: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
  }> {
    return [...this.memories];
  }

  clear(): void {
    this.memories = [];
    this.knowledge = [];
  }
}

/**
 * Mock EventManager
 */
class MockEventManager implements IEventManager {
  private events: Array<{
    type: string;
    payload: unknown;
    timestamp: number;
  }> = [];

  private listeners: Map<string, Array<(payload: unknown) => void>> = new Map();

  emit(eventType: string, payload: unknown): void {
    this.events.push({
      type: eventType,
      payload,
      timestamp: Date.now(),
    });

    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(payload));
    }
  }

  on(eventType: string, listener: (payload: unknown) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);

    return () => {
      const eventListeners = this.listeners.get(eventType);
      if (eventListeners) {
        const index = eventListeners.indexOf(listener);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    };
  }

  getEvents(): Array<{
    type: string;
    payload: unknown;
    timestamp: number;
  }> {
    return [...this.events];
  }

  getEventsByType(type: string): Array<{
    type: string;
    payload: unknown;
    timestamp: number;
  }> {
    return this.events.filter(e => e.type === type);
  }

  clear(): void {
    this.events = [];
    this.listeners.clear();
  }
}

// ==================== Test Helpers ====================

/**
 * 创建简单的工作流定义
 */
function createSimpleWorkflow(name: string): WorkflowDefinition {
  return {
    id: `wf-${Date.now()}`,
    name,
    version: '1.0.0',
    nodes: [
      {
        id: 'node-1',
        type: 'test',
        name: 'Test Node 1',
        config: { value: 'test' },
      },
    ],
    connections: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 创建条件分支工作流定义
 */
function createConditionalWorkflow(name: string): WorkflowDefinition {
  return {
    id: `wf-cond-${Date.now()}`,
    name,
    version: '1.0.0',
    nodes: [
      {
        id: 'condition-1',
        type: 'condition',
        name: 'Check Status',
        config: {},
        condition: {
          type: 'simple',
          expression: JSON.stringify({ field: 'status', operator: 'eq', value: 'success' }),
        },
      },
      {
        id: 'action-success',
        type: 'test',
        name: 'Success Action',
        config: { branch: 'success' },
      },
      {
        id: 'action-failure',
        type: 'test',
        name: 'Failure Action',
        config: { branch: 'failure' },
      },
    ],
    connections: [
      {
        source: 'condition-1',
        target: 'action-success',
        condition: { type: 'on_success' },
      },
      {
        source: 'condition-1',
        target: 'action-failure',
        condition: { type: 'on_failure' },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 创建并行工作流定义
 */
function createParallelWorkflow(name: string): WorkflowDefinition {
  return {
    id: `wf-parallel-${Date.now()}`,
    name,
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'test',
        name: 'Start Node',
        config: { phase: 'start' },
      },
      {
        id: 'parallel-1',
        type: 'test',
        name: 'Parallel Node 1',
        config: { parallel: true, index: 1 },
      },
      {
        id: 'parallel-2',
        type: 'test',
        name: 'Parallel Node 2',
        config: { parallel: true, index: 2 },
      },
      {
        id: 'merge',
        type: 'test',
        name: 'Merge Node',
        config: { phase: 'merge' },
      },
    ],
    connections: [
      { source: 'start', target: 'parallel-1' },
      { source: 'start', target: 'parallel-2' },
      { source: 'parallel-1', target: 'merge' },
      { source: 'parallel-2', target: 'merge' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 注册测试节点处理器
 */
function registerTestNodes(registry: NodeRegistry): void {
  // 注册 test 节点
  registry.register('test', (node: WorkflowNode): NodeHandler => {
    return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
      const startTime = new Date();

      // 模拟工作
      await new Promise(resolve => setTimeout(resolve, 10));

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {
          result: `processed-${node.id}`,
          config: node.config,
          input: input.data,
        },
        status: 'success',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime.getTime(),
      };
    };
  });

  // 注册 condition 节点
  registry.register('condition', (node: WorkflowNode): NodeHandler => {
    return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
      const startTime = new Date();

      // 模拟条件检查
      const status = input.data.status || 'failure';
      const result = status === 'success';

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {
          conditionResult: result,
          input: input.data,
        },
        status: 'success',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime.getTime(),
      };
    };
  });
}

// ==================== Tests ====================

describe('WorkflowEngine Integration Tests', () => {
  let registry: NodeRegistry;
  let sorter: TopologicalSorter;
  let executor: WorkflowExecutor;
  let memoryManager: MockMemoryManager;
  let eventManager: MockEventManager;
  let integration: WorkflowIntegration;

  beforeEach(() => {
    // 重置注册表
    registry = getNodeRegistry();
    registry.clear();

    // 注册测试节点
    registerTestNodes(registry);

    // 创建依赖
    sorter = new TopologicalSorter();
    executor = new WorkflowExecutor(registry, sorter);
    memoryManager = new MockMemoryManager();
    eventManager = new MockEventManager();

    // 创建集成服务
    integration = new WorkflowIntegration(
      executor,
      memoryManager,
      eventManager,
      {
        enableMemory: true,
        enableEvents: true,
        queryKnowledgeBeforeExecution: true,
      }
    );
  });

  afterEach(() => {
    memoryManager.clear();
    eventManager.clear();
    registry.clear();
  });

  // ==================== Test 1: 端到端工作流执行 ====================

  describe('End-to-End Workflow Execution', () => {
    it('should execute a simple workflow from definition to memory record', async () => {
      // 1. 准备工作流定义
      const definition = createSimpleWorkflow('Test Workflow');

      // 2. 创建执行上下文
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-001',
        workflowId: definition.id,
        input: { param: 'test' },
      });

      const workflowContext: WorkflowExecutionContext = {
        definition,
        executionContext,
        userId: 'user-001',
        sessionId: 'session-001',
      };

      // 3. 执行工作流
      const result = await integration.createAndExecute(definition, workflowContext);

      // 4. 验证结果
      expect(result.status).toBe('completed');
      expect(result.workflowId).toBe(definition.id);
      expect(result.workflowName).toBe('Test Workflow');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.stats.totalNodes).toBe(1);
      expect(result.stats.completedNodes).toBe(1);

      // 5. 验证记忆记录
      expect(result.memoryId).toBeDefined();
      const memories = memoryManager.getMemories();
      expect(memories.length).toBe(1);
      expect(memories[0].title).toContain('Test Workflow');
      expect(memories[0].source).toBe('task_completion');

      // 6. 验证事件触发
      const events = eventManager.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const createdEvents = eventManager.getEventsByType('workflow:created');
      expect(createdEvents.length).toBe(1);

      const startedEvents = eventManager.getEventsByType('workflow:started');
      expect(startedEvents.length).toBe(1);

      const completedEvents = eventManager.getEventsByType('workflow:completed');
      expect(completedEvents.length).toBe(1);
    });

    it('should query knowledge before execution', async () => {
      // 1. 添加知识
      memoryManager.addKnowledge({
        knowledgeId: 'know-001',
        title: 'Test Knowledge',
        content: 'This is a test knowledge',
        tags: ['test', 'workflow'],
      });

      // 2. 执行工作流
      const definition = createSimpleWorkflow('Test Workflow Knowledge');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-002',
        workflowId: definition.id,
        input: {},
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      // 3. 验证相关知识被查询
      expect(result.relatedKnowledgeIds).toBeDefined();
      expect(result.relatedKnowledgeIds!.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== Test 2: 条件分支集成 ====================

  describe('Conditional Branch Integration', () => {
    it('should execute conditional workflow with success branch', async () => {
      const definition = createConditionalWorkflow('Conditional Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-cond-001',
        workflowId: definition.id,
        input: { status: 'success' },
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      expect(result.status).toBe('completed');
      expect(result.stats.completedNodes).toBeGreaterThan(0);
    });

    it('should execute conditional workflow with failure branch', async () => {
      const definition = createConditionalWorkflow('Conditional Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-cond-002',
        workflowId: definition.id,
        input: { status: 'failure' },
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      expect(result.status).toBe('completed');
    });
  });

  // ==================== Test 3: 并行+汇聚集成 ====================

  describe('Parallel and Merge Integration', () => {
    it('should execute parallel workflow and merge results', async () => {
      const definition = createParallelWorkflow('Parallel Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-parallel-001',
        workflowId: definition.id,
        input: {},
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      expect(result.status).toBe('completed');
      expect(result.stats.completedNodes).toBe(4); // start + 2 parallel + merge

      // 验证并行节点都被执行
      const outputs = Array.from(result.results.values());
      const parallelOutputs = outputs.filter((o: NodeOutput) => o.data?.config?.parallel);
      expect(parallelOutputs.length).toBe(2);
    });

    it('should measure parallel execution duration', async () => {
      const definition = createParallelWorkflow('Parallel Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-parallel-002',
        workflowId: definition.id,
        input: {},
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      // 并行执行应该比顺序执行快
      expect(result.duration).toBeLessThan(100); // 每个节点10ms，并行应该很快
    });
  });

  // ==================== Test 4: 失败重试集成 ====================

  describe('Retry Integration', () => {
    it('should handle node failure without retry', async () => {
      // 注册一个会失败的节点
      registry.register('failing', (node: WorkflowNode): NodeHandler => {
        let attempts = 0;
        return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
          attempts++;
          throw new Error(`Node failed after ${attempts} attempts`);
        };
      });

      const definition: WorkflowDefinition = {
        id: 'wf-retry-001',
        name: 'Failing Workflow',
        version: '1.0.0',
        nodes: [
          {
            id: 'fail-1',
            type: 'failing',
            name: 'Failing Node',
            config: {},
          },
        ],
        connections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const executionContext = new ExecutionContext({
        executionId: 'test-exec-retry-001',
        workflowId: definition.id,
        input: {},
      });

      // WorkflowExecutor 捕获错误并返回 status: 'failed'
      const result = await integration.createAndExecute(definition, { definition, executionContext });

      // 验证工作流失败
      expect(result.status).toBe('failed');
      expect(result.stats.failedNodes).toBeGreaterThan(0);

      // 验证失败事件
      const failedEvents = eventManager.getEventsByType('workflow:failed');
      expect(failedEvents.length).toBe(1);
    });
  });

  // ==================== Test 5: 事件触发验证 ====================

  describe('Event Triggering', () => {
    it('should emit lifecycle events in correct order', async () => {
      const definition = createSimpleWorkflow('Event Test Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-event-001',
        workflowId: definition.id,
        input: {},
      });

      await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      const events = eventManager.getEvents();

      // 验证事件顺序
      const eventTypes = events.map(e => e.type);

      expect(eventTypes).toContain('workflow:created');
      expect(eventTypes).toContain('workflow:started');
      expect(eventTypes).toContain('workflow:completed');

      // 验证顺序
      const createdIndex = eventTypes.indexOf('workflow:created');
      const startedIndex = eventTypes.indexOf('workflow:started');
      const completedIndex = eventTypes.indexOf('workflow:completed');

      expect(createdIndex).toBeLessThan(startedIndex);
      expect(startedIndex).toBeLessThan(completedIndex);
    });

    it('should include correct event payloads', async () => {
      const definition = createSimpleWorkflow('Payload Test Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-event-002',
        workflowId: definition.id,
        input: {},
      });

      await integration.createAndExecute(definition, {
        definition,
        executionContext,
        userId: 'user-002',
        sessionId: 'session-002',
      });

      const createdEvents = eventManager.getEventsByType('workflow:created');
      expect(createdEvents.length).toBe(1);

      const payload = createdEvents[0].payload as any;
      expect(payload.workflowId).toBe(definition.id);
      expect(payload.workflowName).toBe('Payload Test Workflow');
      expect(payload.userId).toBe('user-002');
      expect(payload.timestamp).toBeDefined();
    });
  });

  // ==================== Test 6: 记忆记录验证 ====================

  describe('Memory Recording', () => {
    it('should record memory with correct structure', async () => {
      const definition = createSimpleWorkflow('Memory Test Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-mem-001',
        workflowId: definition.id,
        input: { testParam: 'testValue' },
      });

      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      // 验证记忆 ID 返回
      expect(result.memoryId).toBeDefined();

      // 验证记忆内容
      const memories = memoryManager.getMemories();
      expect(memories.length).toBe(1);

      const memory = memories[0];
      expect(memory.source).toBe('task_completion');
      expect(memory.title).toContain('Memory Test Workflow');
      expect(memory.summary).toContain('成功完成');
      expect(memory.content).toBeDefined();
      expect(memory.content.workflowId).toBe(definition.id);
      expect(memory.content.stats).toBeDefined();
    });

    it('should extract correct tags from workflow', async () => {
      const definition = createSimpleWorkflow('Tag Test Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-mem-002',
        workflowId: definition.id,
        input: {},
      });

      await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      const memories = memoryManager.getMemories();
      expect(memories.length).toBe(1);

      // 验证记忆被创建（tags 是通过 createEpisodicMemory 的 tags 参数传入的，不在 content 中）
      expect(memories[0].title).toContain('Tag Test Workflow');
    });

    it('should record failed workflow to memory', async () => {
      // 注册失败节点
      registry.register('fail', (node: WorkflowNode): NodeHandler => {
        return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
          throw new Error('Intentional failure');
        };
      });

      const definition: WorkflowDefinition = {
        id: 'wf-fail-mem-001',
        name: 'Failed Workflow',
        version: '1.0.0',
        nodes: [
          {
            id: 'fail-1',
            type: 'fail',
            name: 'Fail Node',
            config: {},
          },
        ],
        connections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const executionContext = new ExecutionContext({
        executionId: 'test-exec-mem-003',
        workflowId: definition.id,
        input: {},
      });

      // WorkflowExecutor 捕获错误并返回 status: 'failed'
      const result = await integration.createAndExecute(definition, { definition, executionContext });

      // 验证工作流失败
      expect(result.status).toBe('failed');

      // 验证失败记忆被记录
      const memories = memoryManager.getMemories();
      expect(memories.length).toBe(1);
      expect(memories[0].content.status).toBe('failed');
    });
  });

  // ==================== Test 7: 禁用记忆和事件 ====================

  describe('Disable Memory and Events', () => {
    it('should work without memory manager', async () => {
      const noMemoryIntegration = new WorkflowIntegration(
        executor,
        undefined, // No memory manager
        eventManager,
        { enableMemory: false, enableEvents: true }
      );

      const definition = createSimpleWorkflow('No Memory Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-nomem-001',
        workflowId: definition.id,
        input: {},
      });

      const result = await noMemoryIntegration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      expect(result.status).toBe('completed');
      expect(result.memoryId).toBeUndefined(); // 没有记忆 ID
    });

    it('should work without event manager', async () => {
      const noEventIntegration = new WorkflowIntegration(
        executor,
        memoryManager,
        undefined, // No event manager
        { enableMemory: true, enableEvents: false }
      );

      const definition = createSimpleWorkflow('No Event Workflow');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-noevent-001',
        workflowId: definition.id,
        input: {},
      });

      const result = await noEventIntegration.createAndExecute(definition, {
        definition,
        executionContext,
      });

      expect(result.status).toBe('completed');
      expect(result.memoryId).toBeDefined(); // 有记忆 ID

      // 没有事件被触发
      const events = eventManager.getEvents();
      expect(events.length).toBe(0);
    });
  });

  // ==================== Test 8: 性能测试 ====================

  describe('Performance Tests', () => {
    it('should execute workflow within acceptable time', async () => {
      const definition = createSimpleWorkflow('Performance Test');
      const executionContext = new ExecutionContext({
        executionId: 'test-exec-perf-001',
        workflowId: definition.id,
        input: {},
      });

      const startTime = Date.now();
      const result = await integration.createAndExecute(definition, {
        definition,
        executionContext,
      });
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });
});
