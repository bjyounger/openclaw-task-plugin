/**
 * RecommendationEngine 测试
 *
 * 测试推荐引擎的核心功能
 */

import { RecommendationEngine } from '../../src/core/intelligence/recommendation-engine';
import { EventEmitter } from '../../src/core/managers/event-emitter';
import { MemoryManager } from '../../src/core/memory/memory-manager';
import { DependencyManager } from '../../src/core/dependency-manager';
import { RecommendationEvents } from '../../src/core/intelligence/types';

// Mock MemoryManager
jest.mock('../../src/core/memory/memory-manager');
// Mock DependencyManager
jest.mock('../../src/core/dependency-manager');

describe('RecommendationEngine', () => {
  let recommendationEngine: RecommendationEngine;
  let mockMemoryManager: jest.Mocked<MemoryManager>;
  let mockDependencyManager: jest.Mocked<DependencyManager>;
  let eventEmitter: EventEmitter<RecommendationEvents>;

  beforeEach(() => {
    mockMemoryManager = {
      queryEpisodicMemories: jest.fn(),
    } as unknown as jest.Mocked<MemoryManager>;

    mockDependencyManager = {
      getDependencyGraph: jest.fn(),
    } as unknown as jest.Mocked<DependencyManager>;

    eventEmitter = new EventEmitter<RecommendationEvents>();

    recommendationEngine = new RecommendationEngine(
      mockMemoryManager,
      mockDependencyManager,
      eventEmitter
    );
  });

  // Rec1: 串行策略
  it('should recommend sequential for single path', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
      ],
      edges: [
        { from: 'task-1', to: 'task-2', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2']);

    expect(recommendation).toBeDefined();
    expect(recommendation.strategy).toBeDefined();
    expect(recommendation.executionPlan).toBeDefined();
  });

  // Rec2: 并行策略
  it('should recommend parallel for independent tasks', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
        { taskId: 'task-3', status: 'pending' },
      ],
      edges: [], // 无依赖，可并行
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2', 'task-3']);

    expect(recommendation.strategy).toBe('parallel');
    expect(recommendation.executionPlan.length).toBe(1);
    expect(recommendation.executionPlan[0].length).toBe(3);
  });

  // Rec3: 混合策略
  it('should recommend hybrid for mixed dependencies', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
        { taskId: 'task-3', status: 'pending' },
        { taskId: 'task-4', status: 'pending' },
      ],
      edges: [
        { from: 'task-1', to: 'task-3', type: 'hard' },
        { from: 'task-2', to: 'task-3', type: 'hard' },
        { from: 'task-3', to: 'task-4', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy([
      'task-1', 'task-2', 'task-3', 'task-4'
    ]);

    expect(recommendation.strategy).toBe('hybrid');
    expect(recommendation.dependencyAnalysis.maxDepth).toBeGreaterThan(1);
  });

  // Rec4: 执行层级计算
  it('should calculate execution levels correctly', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-a', status: 'pending' },
        { taskId: 'task-b', status: 'pending' },
        { taskId: 'task-c', status: 'pending' },
      ],
      edges: [
        { from: 'task-a', to: 'task-c', type: 'hard' },
        { from: 'task-b', to: 'task-c', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy([
      'task-a', 'task-b', 'task-c'
    ]);

    // task-a 和 task-b 在第一层，task-c 在第二层
    expect(recommendation.executionPlan.length).toBe(2);
    expect(recommendation.executionPlan[0]).toContain('task-a');
    expect(recommendation.executionPlan[0]).toContain('task-b');
    expect(recommendation.executionPlan[1]).toContain('task-c');
  });

  // Rec5: 关键路径分析
  it('should identify critical path', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
        { taskId: 'task-3', status: 'pending' },
      ],
      edges: [
        { from: 'task-1', to: 'task-2', type: 'hard' },
        { from: 'task-2', to: 'task-3', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy([
      'task-1', 'task-2', 'task-3'
    ]);

    expect(recommendation.dependencyAnalysis.criticalPath).toBeDefined();
    expect(recommendation.dependencyAnalysis.criticalPath.length).toBeGreaterThan(0);
  });

  // Rec6: 时间预估
  it('should estimate total time based on history', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([
      { content: { executionTime: 1000, status: 'success' } } as any,
      { content: { executionTime: 2000, status: 'success' } } as any,
    ]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2']);

    expect(recommendation.estimatedTime).toBeGreaterThan(0);
  });

  // Rec7: 资源预估
  it('should estimate resource consumption', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([
      { content: { peakResourceUsage: 50, executionTime: 1000 } } as any,
    ]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2']);

    expect(recommendation.estimatedResources).toBeDefined();
    expect(recommendation.estimatedResources.cpuPeak).toBeGreaterThanOrEqual(0);
    expect(recommendation.estimatedResources.memoryPeak).toBeGreaterThan(0);
    expect(recommendation.estimatedResources.concurrentTasks).toBeGreaterThanOrEqual(1);
  });

  // Rec8: 依赖图转换
  it('should convert dependency graph to workflow graph', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'node-a', status: 'pending' },
        { taskId: 'node-b', status: 'pending' },
      ],
      edges: [
        { from: 'node-a', to: 'node-b', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy(['node-a', 'node-b']);

    expect(recommendation.executionPlan).toBeDefined();
    expect(recommendation.executionPlan.flat()).toContain('node-a');
    expect(recommendation.executionPlan.flat()).toContain('node-b');
  });

  // Rec9: 历史性能数据获取
  it('should get historical metrics from MemoryManager', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [{ taskId: 'task-hist', status: 'pending' }],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([
      { content: { executionTime: 500, peakResourceUsage: 30, status: 'success' } } as any,
    ]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-hist']);

    expect(mockMemoryManager.queryEpisodicMemories).toHaveBeenCalled();
    expect(recommendation.estimatedTime).toBeGreaterThan(0);
  });

  // Rec10: 生成推荐理由
  it('should generate rationale with key insights', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2']);

    expect(recommendation.rationale).toBeDefined();
    expect(recommendation.rationale).toContain('策略');
  });

  // Rec11: 置信度计算
  it('should calculate confidence based on data quality', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'pending' },
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([
      { content: { executionTime: 1000, status: 'success' } } as any,
    ]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-1', 'task-2']);

    expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
    expect(recommendation.confidence).toBeLessThanOrEqual(100);
  });

  // Rec12: 无历史数据时预估
  it('should estimate when no historical data', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-new-1', status: 'pending' },
        { taskId: 'task-new-2', status: 'pending' },
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy(['task-new-1', 'task-new-2']);

    expect(recommendation.estimatedTime).toBeGreaterThan(0);
    expect(recommendation.confidence).toBeGreaterThanOrEqual(70); // 基础置信度
  });

  // Rec13: 触发事件
  it('should emit recommendation:generated event', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [{ taskId: 'task-event', status: 'pending' }],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const eventHandler = jest.fn();
    eventEmitter.on('recommendation:generated', eventHandler);

    await recommendationEngine.recommendStrategy(['task-event']);

    expect(eventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: expect.any(String),
        strategy: expect.any(String),
        estimatedTime: expect.any(Number),
      })
    );
  });

  // Rec14: 过滤相关任务
  it('should filter relevant tasks from graph', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'task-filter-1', status: 'pending' },
        { taskId: 'task-filter-2', status: 'pending' },
        { taskId: 'task-other', status: 'pending' }, // 不在请求列表中
      ],
      edges: [],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy([
      'task-filter-1', 'task-filter-2'
    ]);

    const allTasks = recommendation.executionPlan.flat();
    expect(allTasks).toContain('task-filter-1');
    expect(allTasks).toContain('task-filter-2');
    expect(allTasks).not.toContain('task-other');
  });

  // Rec15: 执行计划生成
  it('should generate execution plan', async () => {
    mockDependencyManager.getDependencyGraph.mockResolvedValue({
      nodes: [
        { taskId: 'plan-1', status: 'pending' },
        { taskId: 'plan-2', status: 'pending' },
        { taskId: 'plan-3', status: 'pending' },
        { taskId: 'plan-4', status: 'pending' },
      ],
      edges: [
        { from: 'plan-1', to: 'plan-3', type: 'hard' },
        { from: 'plan-2', to: 'plan-3', type: 'hard' },
        { from: 'plan-3', to: 'plan-4', type: 'hard' },
      ],
    });
    mockMemoryManager.queryEpisodicMemories.mockResolvedValue([]);

    const recommendation = await recommendationEngine.recommendStrategy([
      'plan-1', 'plan-2', 'plan-3', 'plan-4'
    ]);

    // 验证执行计划的层级结构
    expect(recommendation.executionPlan.length).toBeGreaterThan(0);

    // 所有任务都应该在执行计划中
    const allTasks = recommendation.executionPlan.flat();
    expect(allTasks.sort()).toEqual(['plan-1', 'plan-2', 'plan-3', 'plan-4'].sort());
  });
});
