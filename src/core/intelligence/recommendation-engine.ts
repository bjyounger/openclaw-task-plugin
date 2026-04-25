/**
 * RecommendationEngine - 推荐引擎
 *
 * 基于拓扑排序和历史数据分析，推荐最优执行策略
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager, EpisodicMemory } from '../memory';
import { DependencyManager, DependencyGraph } from '../dependency-manager';
import { TopologicalSorter } from '../workflow/topological-sorter';
import { WorkflowNode, WorkflowConnection } from '../workflow/types';
import {
  Recommendation,
  StrategyType,
  ResourceEstimate,
  DependencyAnalysis,
  PerformanceMetrics,
  RecommendationEvents,
} from './types';

/**
 * 推荐引擎配置
 */
export interface RecommendationEngineConfig {
  /** 是否启用历史参考 */
  enableHistoricalReference?: boolean;
  /** 相似度阈值 */
  similarityThreshold?: number;
  /** 最大历史参考数量 */
  maxHistoricalReferences?: number;
}

/**
 * 推荐引擎
 *
 * 核心职责：
 * 1. 分析任务依赖图
 * 2. 计算并行执行层级
 * 3. 预估执行时间和资源消耗
 * 4. 推荐最优执行策略
 */
export class RecommendationEngine {
  private topologicalSorter: TopologicalSorter;

  /**
   * 创建推荐引擎
   *
   * @param memoryManager 记忆管理器
   * @param dependencyManager 依赖管理器
   * @param eventEmitter 事件发射器
   * @param config 配置
   */
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    private eventEmitter: EventEmitter<RecommendationEvents>,
    private config?: RecommendationEngineConfig
  ) {
    this.topologicalSorter = new TopologicalSorter();
  }

  /**
   * 推荐执行策略
   *
   * @param taskIds 任务 ID 列表
   * @returns 执行推荐
   */
  async recommendStrategy(taskIds: string[]): Promise<Recommendation> {
    // 1. 获取依赖图
    const depGraph = await this.dependencyManager.getDependencyGraph();

    // 2. 过滤相关任务
    const relevantGraph = this.filterRelevantGraph(depGraph, taskIds);

    // 3. 转换为工作流图
    const { nodes, connections } = this.convertToWorkflowGraph(relevantGraph);

    // 4. 获取执行层级（并行分组）
    const executionLevels = this.getExecutionLevels(nodes, connections);

    // 5. 分析依赖
    const dependencyAnalysis = this.analyzeDependency(relevantGraph, executionLevels);

    // 6. 获取历史性能
    const historicalMetrics = await this.getHistoricalMetrics(taskIds);

    // 7. 确定策略类型
    const strategy = this.determineStrategy(executionLevels);

    // 8. 预估时间
    const estimatedTime = this.estimateTotalTime(executionLevels, historicalMetrics);

    // 9. 资源预估
    const estimatedResources = this.estimateResources(executionLevels, historicalMetrics);

    // 10. 生成理由
    const rationale = this.generateRationale(strategy, dependencyAnalysis, historicalMetrics);

    // 11. 计算置信度
    const confidence = this.calculateConfidence(executionLevels, historicalMetrics);

    // 12. 生成推荐 ID
    const recommendationId = this.generateRecommendationId();

    // 13. 构建推荐结果
    const recommendation: Recommendation = {
      recommendationId,
      strategy,
      estimatedTime,
      estimatedResources,
      rationale,
      confidence,
      historicalReferences: [],
      dependencyAnalysis,
      executionPlan: executionLevels,
      timestamp: Date.now(),
    };

    // 14. 发出推荐事件
    this.eventEmitter.emit('recommendation:generated', {
      recommendationId: recommendation.recommendationId,
      strategy: recommendation.strategy,
      estimatedTime: recommendation.estimatedTime,
      timestamp: recommendation.timestamp,
    });

    return recommendation;
  }

  /**
   * 过滤相关任务的依赖图
   */
  private filterRelevantGraph(
    graph: DependencyGraph,
    taskIds: string[]
  ): DependencyGraph {
    const taskIdSet = new Set(taskIds);

    return {
      nodes: graph.nodes.filter(n => taskIdSet.has(n.taskId)),
      edges: graph.edges.filter(e =>
        taskIdSet.has(e.from) && taskIdSet.has(e.to)
      ),
    };
  }

  /**
   * 将依赖图转换为工作流图
   */
  private convertToWorkflowGraph(
    graph: DependencyGraph
  ): { nodes: WorkflowNode[]; connections: WorkflowConnection[] } {
    const nodes: WorkflowNode[] = graph.nodes.map(n => ({
      id: n.taskId,
      type: 'task' as const,
      name: n.taskId,
      config: {},
    }));

    const connections: WorkflowConnection[] = graph.edges.map(e => ({
      source: e.from,
      target: e.to,
    }));

    return { nodes, connections };
  }

  /**
   * 获取执行层级
   *
   * 使用 TopologicalSorter 计算可并行执行的层级
   */
  private getExecutionLevels(
    nodes: WorkflowNode[],
    connections: WorkflowConnection[]
  ): string[][] {
    try {
      return this.topologicalSorter.getExecutionLevels(nodes, connections);
    } catch {
      // 如果存在环，返回顺序执行
      return nodes.map(n => [n.id]);
    }
  }

  /**
   * 分析依赖结构
   */
  private analyzeDependency(
    graph: DependencyGraph,
    levels: string[][]
  ): DependencyAnalysis {
    // 计算关键路径
    const criticalPath = this.calculateCriticalPath(graph, levels);

    return {
      parallelGroups: levels,
      criticalPath,
      criticalPathTime: 0, // 后续计算
      maxDepth: levels.length,
    };
  }

  /**
   * 计算关键路径
   *
   * 简化实现：取每层的第一个任务
   */
  private calculateCriticalPath(
    graph: DependencyGraph,
    levels: string[][]
  ): string[] {
    if (levels.length === 0) return [];

    // 简化：取每层的第一个任务作为关键路径
    return levels.map(level => level[0]).filter(Boolean);
  }

  /**
   * 确定策略类型
   */
  private determineStrategy(levels: string[][]): StrategyType {
    if (levels.length === 0) return 'sequential';

    // 只有一层且多个任务 → 并行
    if (levels.length === 1 && levels[0].length > 1) {
      return 'parallel';
    }

    // 多层且某些层有多个任务 → 混合
    if (levels.some(l => l.length > 1)) {
      return 'hybrid';
    }

    // 其他情况 → 串行
    return 'sequential';
  }

  /**
   * 预估总执行时间
   */
  private estimateTotalTime(
    levels: string[][],
    metrics: Map<string, PerformanceMetrics>
  ): number {
    let totalTime = 0;

    for (const level of levels) {
      // 每层的时间取该层最长任务的时间
      const levelTime = Math.max(
        ...level.map(taskId => {
          const m = metrics.get(taskId);
          return m?.executionTime ?? 1000; // 默认 1 秒
        })
      );
      totalTime += levelTime;
    }

    return totalTime;
  }

  /**
   * 预估资源消耗
   */
  private estimateResources(
    levels: string[][],
    metrics: Map<string, PerformanceMetrics>
  ): ResourceEstimate {
    // 计算最大并发数
    const maxConcurrency = Math.max(0, ...levels.map(l => l.length));

    // 计算平均资源消耗
    const allMetrics = Array.from(metrics.values());
    const avgResource = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.peakResourceUsage, 0) / allMetrics.length
      : 50;

    return {
      cpuPeak: Math.min(100, avgResource * Math.max(1, maxConcurrency)),
      memoryPeak: 256 * Math.max(1, maxConcurrency),
      networkPeak: 10 * Math.max(1, maxConcurrency),
      concurrentTasks: maxConcurrency,
    };
  }

  /**
   * 获取历史性能指标
   */
  private async getHistoricalMetrics(
    taskIds: string[]
  ): Promise<Map<string, PerformanceMetrics>> {
    const metricsMap = new Map<string, PerformanceMetrics>();

    for (const taskId of taskIds) {
      try {
        const memories = await this.memoryManager.queryEpisodicMemories({
          searchText: taskId,
          limit: 5,
          orderBy: 'createdAt',
          orderDirection: 'desc',
        });

        if (memories.length > 0) {
          metricsMap.set(taskId, this.aggregateMetrics(taskId, memories));
        }
      } catch {
        // 忽略错误，使用默认值
      }
    }

    return metricsMap;
  }

  /**
   * 聚合多个记忆的性能指标
   */
  private aggregateMetrics(
    taskId: string,
    memories: EpisodicMemory[]
  ): PerformanceMetrics {
    const executionTimes: number[] = [];
    const peakResources: number[] = [];
    const statuses: string[] = [];
    let retryCount = 0;

    for (const memory of memories) {
      const content = memory.content as Record<string, unknown>;

      const executionTime = content?.executionTime;
      if (typeof executionTime === 'number') {
        executionTimes.push(executionTime);
      }

      const peakResourceUsage = content?.peakResourceUsage;
      if (typeof peakResourceUsage === 'number') {
        peakResources.push(peakResourceUsage);
      }

      const statusVal = content?.status;
      if (typeof statusVal === 'string') {
        statuses.push(statusVal);
      }

      const retryCountVal = content?.retryCount;
      if (typeof retryCountVal === 'number') {
        retryCount = Math.max(retryCount, retryCountVal);
      }
    }

    // 计算平均值
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 1000;

    const avgPeakResource = peakResources.length > 0
      ? peakResources.reduce((a, b) => a + b, 0) / peakResources.length
      : 50;

    // 确定状态
    let status: 'success' | 'failed' | 'partial' = 'success';
    if (statuses.includes('failed')) {
      status = statuses.includes('success') ? 'partial' : 'failed';
    }

    return {
      taskId,
      executionTime: avgExecutionTime,
      peakResourceUsage: avgPeakResource,
      status,
      timestamp: Date.now(),
      retryCount,
    };
  }

  /**
   * 生成推荐理由
   */
  private generateRationale(
    strategy: StrategyType,
    analysis: DependencyAnalysis,
    metrics: Map<string, PerformanceMetrics>
  ): string {
    const parts: string[] = [];

    // 策略描述
    const strategyNames: Record<StrategyType, string> = {
      sequential: '串行执行',
      parallel: '并行执行',
      hybrid: '混合执行',
      adaptive: '自适应执行',
    };
    parts.push(`推荐策略：${strategyNames[strategy]}`);

    // 依赖分析
    parts.push(`依赖深度：${analysis.maxDepth} 层`);
    parts.push(`可并行分组：${analysis.parallelGroups.length} 组`);

    // 历史数据
    if (metrics.size > 0) {
      const avgTime = Array.from(metrics.values())
        .reduce((s, m) => s + m.executionTime, 0) / metrics.size;
      parts.push(`平均历史执行时间：${Math.round(avgTime)}ms`);
    }

    return parts.join('；');
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    levels: string[][],
    metrics: Map<string, PerformanceMetrics>
  ): number {
    let base = 70;

    // 层级完整加分
    if (levels.length > 0 && levels.every(l => l.length > 0)) {
      base += 10;
    }

    // 有历史数据加分
    if (metrics.size > 0) {
      base += 10;
    }

    // 历史数据覆盖率高加分
    const totalTasks = levels.flat().length;
    if (totalTasks > 0 && metrics.size >= totalTasks * 0.5) {
      base += 10;
    }

    return Math.min(100, base);
  }

  /**
   * 生成推荐 ID
   */
  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
