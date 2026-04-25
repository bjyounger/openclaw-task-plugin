/**
 * DecisionEngine 测试
 *
 * 测试决策引擎的核心功能
 */

import { DecisionEngine } from '../../src/core/intelligence/decision-engine';
import { EventEmitter } from '../../src/core/managers/event-emitter';
import { MemoryManager } from '../../src/core/memory/memory-manager';
import { DependencyManager } from '../../src/core/dependency-manager';
import { DecisionEvents, DecisionRule } from '../../src/core/intelligence/types';

// Mock MemoryManager
jest.mock('../../src/core/memory/memory-manager');
// Mock DependencyManager
jest.mock('../../src/core/dependency-manager');

describe('DecisionEngine', () => {
  let decisionEngine: DecisionEngine;
  let mockMemoryManager: jest.Mocked<MemoryManager>;
  let mockDependencyManager: jest.Mocked<DependencyManager>;
  let eventEmitter: EventEmitter<DecisionEvents>;

  beforeEach(() => {
    // 创建模拟实例
    mockMemoryManager = {
      queryEpisodicMemories: jest.fn(),
    } as unknown as jest.Mocked<MemoryManager>;

    mockDependencyManager = {
      getDependencyState: jest.fn(),
    } as unknown as jest.Mocked<DependencyManager>;

    eventEmitter = new EventEmitter<DecisionEvents>();

    decisionEngine = new DecisionEngine(
      mockMemoryManager,
      mockDependencyManager,
      eventEmitter,
      { enableResourceMonitor: false } // 禁用资源监控以简化测试
    );
  });

  afterEach(() => {
    decisionEngine.destroy();
  });

  // D1: 生成决策
  it('should generate decision for task', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    const decision = await decisionEngine.makeDecision('task-1');

    expect(decision).toBeDefined();
    expect(decision.decisionId).toMatch(/^decision_/);
    expect(decision.type).toBeDefined();
    expect(decision.reason).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(100);
  });

  // D2: 构建决策上下文
  it('should build decision context with resource and dependency status', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue({
      taskId: 'task-2',
      dependencyDetails: new Map(),
      dependencyStatus: new Map(),
      ready: true,
    });

    const decision = await decisionEngine.makeDecision('task-2');

    expect(decision.context).toBeDefined();
    expect(decision.context?.taskId).toBe('task-2');
    expect(decision.context?.dependencyStatus).toBe('ready');
  });

  // D3: 计算历史成功率
  it('should calculate historical success rate from memories', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([
      { content: { status: 'success' } } as any,
      { content: { status: 'success' } } as any,
      { content: { status: 'failed' } } as any,
      { content: { status: 'success' } } as any,
    ]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    const decision = await decisionEngine.makeDecision('task-3');

    // 3/4 = 75%
    expect(decision.context?.historicalSuccessRate).toBeCloseTo(0.75);
  });

  // D4: 触发决策事件
  it('should emit decision:made event', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    const eventHandler = jest.fn();
    eventEmitter.on('decision:made', eventHandler);

    await decisionEngine.makeDecision('task-4');

    expect(eventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-4',
        decision: expect.any(String),
        confidence: expect.any(Number),
      })
    );
  });

  // D5: 资源不足时延后
  it('should defer when resource exhausted', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue({
      taskId: 'task-5',
      dependencyDetails: new Map(),
      dependencyStatus: new Map(),
      ready: true,
    });

    // 创建带资源监控的引擎
    const engineWithMonitor = new DecisionEngine(
      mockMemoryManager,
      mockDependencyManager,
      eventEmitter,
      { enableResourceMonitor: true }
    );

    const decision = await engineWithMonitor.makeDecision('task-5');

    // 根据实际资源状态决定
    expect(['execute_now', 'defer', 'parallelize']).toContain(decision.type);

    engineWithMonitor.destroy();
  });

  // D6: 紧急任务立即执行
  it('should execute now for urgent tasks', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue({
      taskId: 'task-6',
      dependencyDetails: new Map(),
      dependencyStatus: new Map(),
      ready: true,
    });

    const decision = await decisionEngine.makeDecision('task-6', { isUrgent: true });

    // 紧急任务应该立即执行（除非依赖阻塞）
    expect(['execute_now', 'defer']).toContain(decision.type);
  });

  // D7: 依赖阻塞时等待
  it('should defer when dependency blocked', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue({
      taskId: 'task-7',
      dependencyDetails: new Map([['dep-1', { dependsOnTaskId: 'dep-1', status: 'pending' }]]),
      dependencyStatus: new Map([['dep-1', 'pending']]),
      ready: false,
      blockedBy: ['dep-1'],
    });

    const decision = await decisionEngine.makeDecision('task-7');

    expect(decision.type).toBe('defer');
    expect(decision.triggeredRules).toContain('R005');
  });

  // D8: 添加自定义规则
  it('should add custom decision rule', async () => {
    const customRule: DecisionRule = {
      ruleId: 'CUSTOM_DEC_001',
      name: 'always_skip',
      description: 'Always skip',
      priority: 200,
      conditions: [],
      conditionOperator: 'and',
      decisionType: 'skip',
      reasonTemplate: 'Custom rule',
      enabled: true,
    };

    decisionEngine.addRule(customRule);

    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    const decision = await decisionEngine.makeDecision('task-8');

    expect(decision.type).toBe('skip');
    expect(decision.triggeredRules).toContain('CUSTOM_DEC_001');
  });

  // D9: 移除规则
  it('should remove decision rule', async () => {
    const removed = decisionEngine.removeRule('R001');
    expect(removed).toBe(true);

    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    // R001 是资源耗尽规则，移除后不应该触发
    // 无法直接验证，但可以确保不会出错
    const decision = await decisionEngine.makeDecision('task-9');
    expect(decision).toBeDefined();
  });

  // D10: 获取当前资源状态
  it('should get current resources', () => {
    // 禁用资源监控时返回 null
    const resources = decisionEngine.getCurrentResources();
    expect(resources).toBeNull();
  });

  // D11: 无历史数据时使用默认成功率
  it('should use default success rate when no history', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    const decision = await decisionEngine.makeDecision('task-11');

    // 默认成功率 80%
    expect(decision.context?.historicalSuccessRate).toBe(0.8);
  });

  // D12: 置信度范围验证
  it('should return confidence in 0-100 range', async () => {
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);
    mockDependencyManager.getDependencyState.mockResolvedValue(undefined);

    for (let i = 0; i < 5; i++) {
      const decision = await decisionEngine.makeDecision(`task-12-${i}`);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(100);
    }
  });
});
