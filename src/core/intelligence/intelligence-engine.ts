/**
 * IntelligenceEngine - 智能引擎主协调器
 *
 * 协调决策引擎、推荐引擎、分析引擎和知识整合模块
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager } from '../memory/memory-manager';
import { DependencyManager } from '../dependency-manager/dependency-manager';
import { DecisionEngine, DecisionEngineConfig } from './decision-engine';
import { RecommendationEngine, RecommendationEngineConfig } from './recommendation-engine';
import { AnalyticsEngine, AnalyticsEngineConfig } from './analytics-engine';
import { KnowledgeIntegration } from './knowledge-integration';
import {
  Decision,
  Recommendation,
  AnalyticsReport,
  TimePeriod,
  DecisionRule,
  IntelligenceEvents,
  RefinementOutput,
  RefinementInput,
} from './types';

/**
 * 智能引擎配置
 */
export interface IntelligenceEngineConfig {
  /** 决策引擎配置 */
  decision?: DecisionEngineConfig;
  /** 推荐引擎配置 */
  recommendation?: RecommendationEngineConfig;
  /** 分析引擎配置 */
  analytics?: AnalyticsEngineConfig;
}

/**
 * 智能引擎
 *
 * 核心职责：
 * 1. 协调三个子引擎
 * 2. 提供统一的对外接口
 * 3. 管理事件流
 * 4. 整合知识提炼
 */
export class IntelligenceEngine {
  private decisionEngine: DecisionEngine;
  private recommendationEngine: RecommendationEngine;
  private analyticsEngine: AnalyticsEngine;
  private knowledgeIntegration: KnowledgeIntegration;
  private eventEmitter: EventEmitter<IntelligenceEvents>;

  /**
   * 创建智能引擎
   *
   * @param memoryManager 记忆管理器
   * @param dependencyManager 依赖管理器
   * @param config 配置
   */
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    config?: IntelligenceEngineConfig
  ) {
    // 初始化事件系统
    this.eventEmitter = new EventEmitter();

    // 初始化决策引擎
    this.decisionEngine = new DecisionEngine(
      memoryManager,
      dependencyManager,
      // DecisionEngine 使用 DecisionEvents，这里做类型适配
      this.eventEmitter as unknown as EventEmitter<any>,
      config?.decision
    );

    // 初始化推荐引擎
    this.recommendationEngine = new RecommendationEngine(
      memoryManager,
      dependencyManager,
      this.eventEmitter as unknown as EventEmitter<any>,
      config?.recommendation
    );

    // 初始化分析引擎
    this.analyticsEngine = new AnalyticsEngine(memoryManager, config?.analytics);

    // 初始化知识整合
    this.knowledgeIntegration = new KnowledgeIntegration(memoryManager);
  }

  // ==================== 决策接口 ====================

  /**
   * 生成决策
   *
   * @param taskId 任务 ID
   * @param options 决策选项
   * @returns 决策结果
   */
  async makeDecision(
    taskId: string,
    options?: { isUrgent?: boolean; estimatedDuration?: number }
  ): Promise<Decision> {
    return this.decisionEngine.makeDecision(taskId, options);
  }

  /**
   * 添加决策规则
   *
   * @param rule 新规则
   */
  addDecisionRule(rule: DecisionRule): void {
    this.decisionEngine.addRule(rule);
  }

  /**
   * 移除决策规则
   *
   * @param ruleId 规则 ID
   * @returns 是否移除成功
   */
  removeDecisionRule(ruleId: string): boolean {
    return this.decisionEngine.removeRule(ruleId);
  }

  // ==================== 推荐接口 ====================

  /**
   * 推荐执行策略
   *
   * @param taskIds 任务 ID 列表
   * @returns 执行推荐
   */
  async recommendStrategy(taskIds: string[]): Promise<Recommendation> {
    return this.recommendationEngine.recommendStrategy(taskIds);
  }

  // ==================== 分析接口 ====================

  /**
   * 生成分析报告
   *
   * @param period 时间范围
   * @returns 分析报告
   */
  async generateAnalyticsReport(period: TimePeriod): Promise<AnalyticsReport> {
    return this.analyticsEngine.generateReport(period);
  }

  /**
   * 快速健康检查
   */
  async quickHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    return this.analyticsEngine.quickHealthCheck();
  }

  // ==================== 知识提炼接口 ====================

  /**
   * 执行知识提炼
   *
   * @param input 提炼参数
   * @returns 提炼结果
   */
  async refineKnowledge(input?: RefinementInput): Promise<RefinementOutput> {
    return this.knowledgeIntegration.refine(input);
  }

  /**
   * 知识提炼（Markdown 格式）
   */
  async refineKnowledgeAsMarkdown(input?: RefinementInput): Promise<string> {
    return this.knowledgeIntegration.refineAsMarkdown(input);
  }

  // ==================== 事件监听 ====================

  /**
   * 注册事件监听器
   *
   * @param event 事件类型
   * @param listener 监听器
   * @returns 取消监听函数
   */
  on(event: string, listener: (event: any) => void): () => void {
    return this.eventEmitter.on(event as any, listener);
  }

  // ==================== 资源状态 ====================

  /**
   * 获取当前资源状态
   */
  getCurrentResources() {
    return this.decisionEngine.getCurrentResources();
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁引擎
   */
  destroy(): void {
    this.decisionEngine.destroy();
  }
}
