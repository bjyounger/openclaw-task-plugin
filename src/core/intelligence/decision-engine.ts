/**
 * DecisionEngine - 决策引擎
 *
 * 基于规则引擎进行任务执行决策
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import { DependencyState } from '../dependency-manager';
import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager } from '../memory/memory-manager';
import { DependencyManager } from '../dependency-manager';
import { ResourceMonitor } from './resource-monitor';
import { RuleEngine, RuleEvaluationResult } from './rule-engine';
import {
  Decision,
  DecisionContext,
  DecisionType,
  DecisionEvents,
  DecisionRule,
  SystemResources,
} from './types';

/**
 * 决策引擎配置
 */
export interface DecisionEngineConfig {
  /** 是否启用资源监控 */
  enableResourceMonitor?: boolean;
  /** 资源监控间隔（毫秒） */
  resourceMonitorInterval?: number;
  /** 自定义规则 */
  customRules?: DecisionRule[];
}

/**
 * 决策选项
 */
export interface MakeDecisionOptions {
  /** 是否紧急任务 */
  isUrgent?: boolean;
  /** 预估执行时间（毫秒） */
  estimatedDuration?: number;
}

/**
 * 决策引擎
 *
 * 核心职责：
 * 1. 基于规则引擎生成决策
 * 2. 构建决策上下文
 * 3. 发出决策事件
 */
export class DecisionEngine {
  private ruleEngine: RuleEngine;
  private resourceMonitor: ResourceMonitor | null = null;

  /**
   * 创建决策引擎
   *
   * @param memoryManager 记忆管理器
   * @param dependencyManager 依赖管理器
   * @param eventEmitter 事件发射器
   * @param config 配置
   */
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    private eventEmitter: EventEmitter<DecisionEvents>,
    config?: DecisionEngineConfig
  ) {
    // 初始化规则引擎
    this.ruleEngine = new RuleEngine(config?.customRules);

    // 初始化资源监控
    if (config?.enableResourceMonitor !== false) {
      this.resourceMonitor = new ResourceMonitor(
        config?.resourceMonitorInterval ?? 5000
      );
    }
  }

  /**
   * 生成决策
   *
   * @param taskId 任务 ID
   * @param options 决策选项
   * @returns 决策结果
   */
  async makeDecision(
    taskId: string,
    options?: MakeDecisionOptions
  ): Promise<Decision> {
    // 1. 构建决策上下文
    const context = await this.buildDecisionContext(taskId, options);

    // 2. 规则引擎评估
    const evaluation = this.ruleEngine.evaluate(context);

    // 3. 生成决策 ID
    const decisionId = this.generateDecisionId();

    // 4. 构建决策结果
    const decision: Decision = {
      decisionId,
      type: evaluation.decision,
      reason: evaluation.reason,
      confidence: evaluation.confidence,
      source: 'rule_based',
      triggeredRules: evaluation.triggeredRules,
      timestamp: Date.now(),
      context,
    };

    // 5. 发出决策事件
    this.eventEmitter.emit('decision:made', {
      decisionId: decision.decisionId,
      taskId,
      decision: decision.type,
      confidence: decision.confidence,
      timestamp: decision.timestamp,
    });

    return decision;
  }

  /**
   * 构建决策上下文
   *
   * @param taskId 任务 ID
   * @param options 决策选项
   * @returns 决策上下文
   */
  private async buildDecisionContext(
    taskId: string,
    options?: MakeDecisionOptions
  ): Promise<DecisionContext> {
    // 获取资源使用率
    let resourceUsage = 0;
    if (this.resourceMonitor) {
      const resources = this.resourceMonitor.getCurrentResources();
      resourceUsage = resources.cpuUsage;
    }

    // 获取依赖状态
    const depState = await this.dependencyManager.getDependencyState(taskId);
    const dependencyStatus = this.mapDependencyStatus(depState);

    // 获取历史成功率
    const historicalSuccessRate = await this.getHistoricalSuccessRate(taskId);

    return {
      taskId,
      resourceUsage,
      dependencyStatus,
      historicalSuccessRate,
      isUrgent: options?.isUrgent ?? false,
      estimatedDuration: options?.estimatedDuration ?? 0,
    };
  }

  /**
   * 映射依赖状态
   *
   * @param state 依赖状态
   * @returns 简化的依赖状态
   */
  private mapDependencyStatus(state?: DependencyState): DecisionContext['dependencyStatus'] {
    if (!state) return 'ready';

    if (state.ready) return 'ready';

    if (state.blockedBy && state.blockedBy.length > 0) return 'blocked';

    return 'partial';
  }

  /**
   * 获取历史成功率
   *
   * 从 MemoryManager 查询相关任务的执行历史
   *
   * @param taskId 任务 ID
   * @returns 历史成功率 (0-1)
   */
  private async getHistoricalSuccessRate(taskId: string): Promise<number> {
    try {
      // 查询与该任务相关的情境记忆
      const memories = await this.memoryManager.queryEpisodicMemories({
        searchText: taskId,
        limit: 10,
      });

      // 无历史数据时使用默认值
      if (memories.length === 0) {
        return 0.8; // 默认成功率 80%
      }

      // 统计成功数量
      const successCount = memories.filter(m => {
        const content = m.content as { status?: string };
        return content?.status === 'success' || content?.status === 'completed';
      }).length;

      return successCount / memories.length;
    } catch {
      // 查询失败时返回默认值
      return 0.8;
    }
  }

  /**
   * 生成决策 ID
   */
  private generateDecisionId(): string {
    return `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加决策规则
   *
   * @param rule 新规则
   */
  addRule(rule: DecisionRule): void {
    this.ruleEngine.addRule(rule);
  }

  /**
   * 移除决策规则
   *
   * @param ruleId 规则 ID
   * @returns 是否移除成功
   */
  removeRule(ruleId: string): boolean {
    return this.ruleEngine.removeRule(ruleId);
  }

  /**
   * 获取当前资源状态
   *
   * @returns 系统资源快照
   */
  getCurrentResources(): SystemResources | null {
    return this.resourceMonitor?.getCurrentResources() ?? null;
  }

  /**
   * 获取规则引擎
   */
  getRuleEngine(): RuleEngine {
    return this.ruleEngine;
  }

  /**
   * 销毁决策引擎
   */
  destroy(): void {
    if (this.resourceMonitor) {
      this.resourceMonitor.destroy();
      this.resourceMonitor = null;
    }
  }
}
