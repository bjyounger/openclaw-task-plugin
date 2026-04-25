/**
 * IntelligenceEngine 模块入口
 *
 * @version 1.0.0
 * @author 孬蛋
 */

export { IntelligenceEngine } from './intelligence-engine';
export type { IntelligenceEngineConfig } from './intelligence-engine';

export { DecisionEngine } from './decision-engine';
export type { DecisionEngineConfig, MakeDecisionOptions } from './decision-engine';

export { RecommendationEngine } from './recommendation-engine';
export type { RecommendationEngineConfig } from './recommendation-engine';

export { AnalyticsEngine } from './analytics-engine';
export type { AnalyticsEngineConfig } from './analytics-engine';

export { RuleEngine, BUILTIN_RULES } from './rule-engine';
export type { RuleEvaluationResult } from './rule-engine';

export { ResourceMonitor } from './resource-monitor';

export { KnowledgeIntegration } from './knowledge-integration';

export * from './types';
