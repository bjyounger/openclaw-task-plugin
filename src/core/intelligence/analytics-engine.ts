/**
 * AnalyticsEngine - 分析引擎
 *
 * 复用 MemoryManager 数据，生成执行分析报告
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import { MemoryManager, EpisodicMemory } from '../memory';
import {
  AnalyticsReport,
  TimePeriod,
  TaskStatistics,
  ResourceTrend,
  OptimizationSuggestion,
  Warning,
  TrendDataPoint,
} from './types';

/**
 * 分析引擎配置
 */
export interface AnalyticsEngineConfig {
  /** 性能退化阈值（毫秒） */
  performanceDegradationThreshold?: number;
  /** 高失败率阈值 */
  highFailureRateThreshold?: number;
  /** 资源耗尽阈值 (%) */
  resourceExhaustionThreshold?: number;
}

/**
 * 分析引擎
 *
 * 核心职责：
 * 1. 复用 MemoryManager.getStats() 数据
 * 2. 计算任务统计
 * 3. 分析资源趋势
 * 4. 生成优化建议
 * 5. 检测异常预警
 */
export class AnalyticsEngine {
  /**
   * 创建分析引擎
   *
   * @param memoryManager 记忆管理器
   * @param config 配置
   */
  constructor(
    private memoryManager: MemoryManager,
    private config?: AnalyticsEngineConfig
  ) {}

  /**
   * 生成分析报告
   *
   * @param period 时间范围
   * @returns 分析报告
   */
  async generateReport(period: TimePeriod): Promise<AnalyticsReport> {
    // 1. 获取 MemoryManager 统计数据
    const stats = await this.memoryManager.getStats();

    // 2. 计算任务统计
    const taskStatistics = await this.calculateTaskStatistics(period);

    // 3. 分析资源趋势
    const resourceTrend = await this.analyzeResourceTrend(period);

    // 4. 生成优化建议
    const optimizationSuggestions = this.generateSuggestions(stats, taskStatistics);

    // 5. 检测异常预警
    const warnings = this.detectWarnings(taskStatistics);

    // 6. 生成报告 ID
    const reportId = this.generateReportId();

    return {
      reportId,
      period,
      generatedAt: Date.now(),
      taskStatistics,
      resourceTrend,
      optimizationSuggestions,
      warnings,
    };
  }

  /**
   * 计算任务统计
   */
  private async calculateTaskStatistics(period: TimePeriod): Promise<TaskStatistics> {
    // 查询时间范围内的记忆
    const memories = await this.memoryManager.queryEpisodicMemories({
      startTime: new Date(period.start).getTime(),
      endTime: new Date(period.end).getTime(),
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });

    // 统计执行数据
    const executionTimes: number[] = [];
    let success = 0;
    let failed = 0;
    let timeout = 0;

    for (const memory of memories) {
      const content = memory.content as Record<string, unknown>;
      const status = content?.status as string | undefined;

      // 统计状态
      if (status === 'success' || status === 'completed') {
        success++;
      } else if (status === 'failed') {
        failed++;
      } else if (status === 'timeout') {
        timeout++;
      }

      // 收集执行时间
      const executionTime = content?.executionTime;
      if (typeof executionTime === 'number') {
        executionTimes.push(executionTime);
      }
    }

    const total = memories.length;

    // 计算执行时间统计
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    const maxExecutionTime = executionTimes.length > 0
      ? Math.max(...executionTimes)
      : 0;

    const minExecutionTime = executionTimes.length > 0
      ? Math.min(...executionTimes)
      : 0;

    return {
      total,
      success,
      failed,
      timeout,
      successRate: total > 0 ? success / total : 0,
      avgExecutionTime,
      maxExecutionTime,
      minExecutionTime,
    };
  }

  /**
   * 分析资源趋势
   */
  private async analyzeResourceTrend(period: TimePeriod): Promise<ResourceTrend> {
    // 查询时间范围内的记忆
    const memories = await this.memoryManager.queryEpisodicMemories({
      startTime: new Date(period.start).getTime(),
      endTime: new Date(period.end).getTime(),
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });

    // 提取趋势数据点
    const cpuTrend: TrendDataPoint[] = [];
    const memoryTrend: TrendDataPoint[] = [];
    const executionTimeTrend: TrendDataPoint[] = [];

    for (const memory of memories) {
      const content = memory.content as Record<string, unknown>;
      const timestamp = memory.createdAt;

      // CPU 使用率
      const cpuUsage = content?.cpuUsage;
      const peakResourceUsage = content?.peakResourceUsage;
      if (typeof cpuUsage === 'number') {
        cpuTrend.push({ timestamp, value: cpuUsage });
      } else if (typeof peakResourceUsage === 'number') {
        // 使用 peakResourceUsage 作为 CPU 替代
        cpuTrend.push({ timestamp, value: peakResourceUsage });
      }

      // 内存使用
      const memoryUsage = content?.memoryUsage;
      if (typeof memoryUsage === 'number') {
        memoryTrend.push({ timestamp, value: memoryUsage });
      }

      // 执行时间
      const executionTime = content?.executionTime;
      if (typeof executionTime === 'number') {
        executionTimeTrend.push({
          timestamp,
          value: executionTime,
          label: content?.taskId as string | undefined,
        });
      }
    }

    return {
      cpu: cpuTrend,
      memory: memoryTrend,
      executionTime: executionTimeTrend,
    };
  }

  /**
   * 生成优化建议
   */
  private generateSuggestions(
    stats: any,
    taskStats: TaskStatistics
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // 失败率高建议
    if (taskStats.successRate < 0.8) {
      suggestions.push({
        id: 'sugg_001',
        type: 'reliability',
        priority: 'high',
        description: '任务成功率较低，建议检查失败任务的根本原因',
        expectedBenefit: '提高任务执行稳定性',
        difficulty: 'medium',
      });
    }

    // 执行时间过长建议
    if (taskStats.avgExecutionTime > 5000) {
      suggestions.push({
        id: 'sugg_002',
        type: 'performance',
        priority: 'medium',
        description: '平均执行时间较长，建议优化任务执行流程',
        expectedBenefit: '降低执行延迟',
        difficulty: 'hard',
      });
    }

    // 并行化建议
    suggestions.push({
      id: 'sugg_003',
      type: 'dependency',
      priority: 'medium',
      description: '建议使用依赖图分析，识别可并行执行的任务',
      expectedBenefit: '提升执行效率',
      difficulty: 'easy',
    });

    // 资源优化建议
    if (taskStats.total > 10) {
      suggestions.push({
        id: 'sugg_004',
        type: 'resource',
        priority: 'low',
        description: '任务数量较多，建议优化资源分配策略',
        expectedBenefit: '提高资源利用率',
        difficulty: 'medium',
      });
    }

    return suggestions;
  }

  /**
   * 检测异常预警
   */
  private detectWarnings(taskStats: TaskStatistics): Warning[] {
    const warnings: Warning[] = [];
    const config = this.config || {};

    const now = Date.now();

    // 高失败率预警
    const failureThreshold = config.highFailureRateThreshold ?? 0.5;
    if (taskStats.successRate < failureThreshold) {
      warnings.push({
        id: 'warn_001',
        level: 'critical',
        type: 'high_failure_rate',
        message: `任务成功率过低（${(taskStats.successRate * 100).toFixed(1)}%），需要立即关注`,
        timestamp: now,
      });
    }

    // 性能退化预警
    const perfThreshold = config.performanceDegradationThreshold ?? 10000;
    if (taskStats.avgExecutionTime > perfThreshold) {
      warnings.push({
        id: 'warn_002',
        level: 'warning',
        type: 'performance_degradation',
        message: `平均执行时间过长（${taskStats.avgExecutionTime}ms），存在性能问题`,
        timestamp: now,
      });
    }

    // 超时任务预警
    if (taskStats.timeout > 0) {
      warnings.push({
        id: 'warn_003',
        level: 'warning',
        type: 'performance_degradation',
        message: `存在 ${taskStats.timeout} 个超时任务，建议检查超时原因`,
        timestamp: now,
      });
    }

    // 资源耗尽预警（基于失败率推断）
    const resourceThreshold = config.resourceExhaustionThreshold ?? 0.3;
    if (taskStats.failed > taskStats.total * resourceThreshold) {
      warnings.push({
        id: 'warn_004',
        level: 'warning',
        type: 'resource_exhaustion',
        message: '大量任务失败，可能存在资源耗尽问题',
        timestamp: now,
      });
    }

    return warnings;
  }

  /**
   * 生成报告 ID
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 快速健康检查
   *
   * @returns 健康状态摘要
   */
  async quickHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const nowStr = new Date(now).toISOString();

    const report = await this.generateReport({
      start: oneHourAgo,
      end: nowStr,
    });

    const issues: string[] = [];
    const recommendations: string[] = [];
    let healthy = true;

    // 检查失败率
    if (report.taskStatistics.successRate < 0.7) {
      healthy = false;
      issues.push(`成功率过低：${(report.taskStatistics.successRate * 100).toFixed(1)}%`);
      recommendations.push('检查失败任务的错误日志');
    }

    // 检查预警
    if (report.warnings.length > 0) {
      healthy = false;
      for (const warning of report.warnings) {
        if (warning.level === 'critical') {
          issues.push(warning.message);
        }
      }
      recommendations.push('查看详细分析报告');
    }

    // 添加优化建议
    for (const suggestion of report.optimizationSuggestions) {
      if (suggestion.priority === 'high') {
        recommendations.push(suggestion.description);
      }
    }

    return { healthy, issues, recommendations };
  }
}