/**
 * IntelligenceEngine 类型定义
 *
 * 包含决策引擎、推荐引擎、分析引擎所需的所有类型定义
 *
 * @version 1.0.0
 * @author 孬蛋
 */

// ==================== 决策类型 ====================

/**
 * 决策类型
 */
export type DecisionType =
  | 'execute_now'    // 立即执行
  | 'defer'          // 延后执行
  | 'parallelize'    // 并行执行
  | 'skip'           // 跳过
  | 'fallback';      // 执行备选方案

/**
 * 决策来源
 */
export type DecisionSource =
  | 'rule_based'     // 规则表（P0）
  | 'ml_model';      // 机器学习模型（P2）

/**
 * 决策上下文
 */
export interface DecisionContext {
  /** 任务 ID */
  taskId: string;

  /** 资源使用率 (%) */
  resourceUsage: number;

  /** 依赖状态 */
  dependencyStatus: 'ready' | 'blocked' | 'partial';

  /** 历史成功率 (0-1) */
  historicalSuccessRate: number;

  /** 是否紧急 */
  isUrgent: boolean;

  /** 预估执行时间 (ms) */
  estimatedDuration: number;
}

/**
 * 决策结果
 */
export interface Decision {
  /** 决策 ID */
  decisionId: string;

  /** 决策类型 */
  type: DecisionType;

  /** 决策理由 */
  reason: string;

  /** 置信度 (0-100) */
  confidence: number;

  /** 决策来源 */
  source: DecisionSource;

  /** 触发的规则（规则引擎） */
  triggeredRules?: string[];

  /** 备选方案 */
  alternatives?: Decision[];

  /** 创建时间 */
  timestamp: number;

  /** 上下文快照 */
  context?: DecisionContext;
}

// ==================== 规则引擎类型 ====================

/**
 * 规则条件字段类型
 */
export type RuleConditionField =
  | keyof DecisionContext
  | 'historicalFailureRate'
  | 'dependencyCount'
  | 'estimatedWaitTime';

/**
 * 规则条件操作符
 */
export type RuleConditionOperator =
  | 'gt'    // 大于
  | 'gte'   // 大于等于
  | 'lt'    // 小于
  | 'lte'   // 小于等于
  | 'eq'    // 等于
  | 'neq'   // 不等于
  | 'in'    // 在列表中
  | 'contains'; // 包含

/**
 * 规则条件
 */
export interface RuleCondition {
  /** 条件字段 */
  field: RuleConditionField;

  /** 比较操作符 */
  operator: RuleConditionOperator;

  /** 目标值 */
  value: number | string | boolean | string[];
}

/**
 * 决策规则
 */
export interface DecisionRule {
  /** 规则 ID */
  ruleId: string;

  /** 规则名称 */
  name: string;

  /** 规则描述 */
  description: string;

  /** 优先级（数值越大优先级越高） */
  priority: number;

  /** 规则条件 */
  conditions: RuleCondition[];

  /** 条件组合方式 */
  conditionOperator: 'and' | 'or';

  /** 触发的决策类型 */
  decisionType: DecisionType;

  /** 决策理由模板 */
  reasonTemplate: string;

  /** 是否启用 */
  enabled: boolean;

  /** 标签 */
  tags?: string[];
}

// ==================== 推荐类型 ====================

/**
 * 执行策略类型
 */
export type StrategyType =
  | 'sequential'   // 串行执行
  | 'parallel'     // 并行执行
  | 'hybrid'       // 混合执行（部分并行）
  | 'adaptive';    // 自适应（P2）

/**
 * 资源预估
 */
export interface ResourceEstimate {
  /** CPU 使用率峰值 (%) */
  cpuPeak: number;

  /** 内存占用峰值 (MB) */
  memoryPeak: number;

  /** 网络带宽峰值 (MB/s) */
  networkPeak: number;

  /** 并发任务数 */
  concurrentTasks: number;
}

/**
 * 历史参考
 */
export interface HistoricalReference {
  /** 任务 ID */
  taskId: string;

  /** 执行时间 (ms) */
  executionTime: number;

  /** 成功状态 */
  status: 'success' | 'failed' | 'partial';

  /** 相似度分数 */
  similarity: number;
}

/**
 * 依赖分析结果
 */
export interface DependencyAnalysis {
  /** 可并行分组 */
  parallelGroups: string[][];

  /** 关键路径（最长依赖链） */
  criticalPath: string[];

  /** 关键路径预估时间 */
  criticalPathTime: number;

  /** 依赖深度 */
  maxDepth: number;
}

/**
 * 执行推荐
 */
export interface Recommendation {
  /** 推荐 ID */
  recommendationId: string;

  /** 推荐策略 */
  strategy: StrategyType;

  /** 预估总时间 (ms) */
  estimatedTime: number;

  /** 资源消耗预估 */
  estimatedResources: ResourceEstimate;

  /** 推荐理由 */
  rationale: string;

  /** 置信度 (0-100) */
  confidence: number;

  /** 历史参考案例 */
  historicalReferences: HistoricalReference[];

  /** 依赖图分析结果 */
  dependencyAnalysis: DependencyAnalysis;

  /** 执行计划（任务 ID 顺序） */
  executionPlan: string[][];

  /** 创建时间 */
  timestamp: number;
}

// ==================== 分析报告类型 ====================

/**
 * 时间周期
 */
export interface TimePeriod {
  /** 开始时间 (ISO 8601) */
  start: string;

  /** 结束时间 (ISO 8601) */
  end: string;
}

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  /** 时间戳 */
  timestamp: number;

  /** 数值 */
  value: number;

  /** 标签 */
  label?: string;
}

/**
 * 资源趋势
 */
export interface ResourceTrend {
  /** CPU 趋势 */
  cpu: TrendDataPoint[];

  /** 内存趋势 */
  memory: TrendDataPoint[];

  /** 执行时间趋势 */
  executionTime: TrendDataPoint[];
}

/**
 * 任务统计
 */
export interface TaskStatistics {
  /** 任务总数 */
  total: number;

  /** 成功数 */
  success: number;

  /** 失败数 */
  failed: number;

  /** 超时数 */
  timeout: number;

  /** 成功率 */
  successRate: number;

  /** 平均执行时间 */
  avgExecutionTime: number;

  /** 最大执行时间 */
  maxExecutionTime: number;

  /** 最小执行时间 */
  minExecutionTime: number;
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  /** 建议 ID */
  id: string;

  /** 建议类型 */
  type: 'performance' | 'resource' | 'dependency' | 'reliability';

  /** 优先级 */
  priority: 'high' | 'medium' | 'low';

  /** 建议内容 */
  description: string;

  /** 预期收益 */
  expectedBenefit: string;

  /** 实施难度 */
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * 异常预警
 */
export interface Warning {
  /** 预警 ID */
  id: string;

  /** 预警级别 */
  level: 'info' | 'warning' | 'critical';

  /** 预警类型 */
  type: 'performance_degradation' | 'high_failure_rate' | 'resource_exhaustion' | 'dependency_bottleneck';

  /** 预警消息 */
  message: string;

  /** 相关任务 */
  relatedTasks?: string[];

  /** 时间戳 */
  timestamp: number;
}

/**
 * 依赖模式分析
 */
export interface DependencyPatternAnalysis {
  /** 最常见依赖模式 */
  commonPatterns: Array<{
    pattern: string;
    count: number;
    avgExecutionTime: number;
  }>;

  /** 瓶颈任务 */
  bottleneckTasks: Array<{
    taskId: string;
    avgWaitTime: number;
    impact: number;
  }>;
}

/**
 * 分析报告
 */
export interface AnalyticsReport {
  /** 报告 ID */
  reportId: string;

  /** 分析时间范围 */
  period: TimePeriod;

  /** 生成时间 */
  generatedAt: number;

  /** 任务统计 */
  taskStatistics: TaskStatistics;

  /** 资源趋势 */
  resourceTrend: ResourceTrend;

  /** 优化建议 */
  optimizationSuggestions: OptimizationSuggestion[];

  /** 异常预警 */
  warnings: Warning[];

  /** 依赖模式分析 */
  dependencyPatterns?: DependencyPatternAnalysis;
}

// ==================== 性能指标类型 ====================

/**
 * 性能指标内容
 * 用于 EpisodicMemory.content 中存储的性能数据
 */
export interface PerformanceMetricsContent {
  /** 任务 ID */
  taskId: string;

  /** 执行时间 (ms) */
  executionTime: number;

  /** 资源消耗峰值 (%) */
  peakResourceUsage: number;

  /** 成功/失败状态 */
  status: 'success' | 'failed' | 'partial';

  /** 执行时间戳 */
  timestamp: number;

  /** 重试次数 */
  retryCount?: number;

  /** 错误信息 */
  errorMessage?: string;

  /** CPU 使用率 (%) */
  cpuUsage?: number;

  /** 内存使用 (MB) */
  memoryUsage?: number;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 性能指标（兼容旧格式）
 */
export interface PerformanceMetrics {
  /** 任务 ID */
  taskId: string;

  /** 执行时间 (ms) */
  executionTime: number;

  /** 资源消耗峰值 */
  peakResourceUsage: number;

  /** 成功/失败状态 */
  status: 'success' | 'failed' | 'partial';

  /** 执行时间戳 */
  timestamp: number;

  /** 重试次数 */
  retryCount: number;

  /** 错误信息 */
  errorMessage?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 资源监控类型 ====================

/**
 * 系统资源状态（导出供其他模块使用）
 */
export type SystemResources = {
  /** CPU 使用率 (%) */
  cpuUsage: number;

  /** 内存使用率 (%) */
  memoryUsage: number;

  /** 空闲内存 (bytes) */
  freeMemory: number;

  /** 总内存 (bytes) */
  totalMemory: number;

  /** 负载均值 */
  loadAverage: number[];
}

// ==================== 知识整合适配层类型 ====================

/**
 * 知识提炼输入
 */
export interface RefinementInput {
  /** 限定时间范围 */
  startTime?: number;
  endTime?: number;
  /** 限定来源 */
  sources?: string[];
  /** 最小聚类大小 */
  minClusterSize?: number;
}

/**
 * 知识提炼输出
 */
export interface RefinementOutput {
  clusters: Array<{
    clusterId: string;
    label: string;
    members: string[];
    commonFeatures: string[];
  }>;
  extractedKnowledge: {
    patterns: Array<{
      pattern: string;
      occurrences: number;
      examples: string[];
    }>;
    extractedKnowledge: string[];
  };
  promotedMemories: number;
}

// ==================== 事件类型 ====================

/**
 * 决策事件
 */
export interface DecisionEvents {
  'decision:made': {
    decisionId: string;
    taskId: string;
    decision: DecisionType;
    confidence: number;
    timestamp: number;
  };
}

/**
 * 推荐事件
 */
export interface RecommendationEvents {
  'recommendation:generated': {
    recommendationId: string;
    strategy: StrategyType;
    estimatedTime: number;
    timestamp: number;
  };
}

/**
 * Intelligence 事件（合并）
 */
export interface IntelligenceEvents extends DecisionEvents, RecommendationEvents {
  'analytics:generated': {
    reportId: string;
    period: TimePeriod;
    timestamp: number;
  };
  'knowledge:refined': {
    promotedMemories: number;
    timestamp: number;
  };
}
