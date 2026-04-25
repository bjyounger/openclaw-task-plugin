# IntelligenceEngine 详细设计

**版本**: 1.0.0
**作者**: 孬蛋
**日期**: 2026-04-19
**状态**: Ready for Implementation

---

## 1. 模块架构

### 1.1 文件结构

```
src/core/intelligence/
├── types.ts                    # 类型定义（Decision/Recommendation/AnalyticsReport）
├── intelligence-engine.ts      # 主引擎（协调三个子引擎）
├── decision-engine.ts          # 决策引擎（基于规则表）
├── recommendation-engine.ts    # 推荐引擎（基于拓扑排序）
├── analytics-engine.ts         # 分析引擎（复用 MemoryManager.getStats）
├── knowledge-integration.ts    # 知识整合适配层
├── rule-engine.ts              # 规则引擎（P0 核心）
├── resource-monitor.ts         # 资源监控（IE-09）
├── index.ts                    # 模块入口
└── __tests__/
    ├── decision-engine.test.ts
    ├── recommendation-engine.test.ts
    ├── analytics-engine.test.ts
    ├── rule-engine.test.ts
    └── integration.test.ts
```

### 1.2 模块依赖关系

```
                    ┌─────────────────────────┐
                    │   IntelligenceEngine    │
                    │   (主协调器)            │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│DecisionEngine │     │Recommendation   │     │AnalyticsEngine  │
│ (决策引擎)    │     │Engine (推荐引擎)│     │ (分析引擎)      │
└───────┬───────┘     └────────┬────────┘     └────────┬────────┘
        │                      │                       │
        │                      │                       │
        ▼                      ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  RuleEngine   │     │DependencyManager│     │  MemoryManager  │
│  (规则引擎)   │     │ (依赖图分析)    │     │  (数据来源)     │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌───────────────┐
│ResourceMonitor│
│ (资源监控)    │
└───────────────┘
```

### 1.3 与现有模块集成点

| 现有模块 | 集成方式 | 用途 |
|---------|---------|------|
| `MemoryManager` | 构造函数注入 | 历史性能数据、统计分析 |
| `DependencyManager` | 构造函数注入 | 依赖图分析、拓扑排序 |
| `KnowledgeRefinement` | 适配层封装 | 知识提炼、复用现有功能 |
| `TopologicalSorter` | 直接使用 | 并行分组计算 |
| `EventEmitter` | 共享实例 | 事件通知 |

---

## 2. 数据模型

### 2.1 Decision（决策）

```typescript
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
```

### 2.2 Recommendation（推荐）

```typescript
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
```

### 2.3 AnalyticsReport（分析报告）

```typescript
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
```

### 2.4 PerformanceMetrics（性能指标）

```typescript
/**
 * 性能指标
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
```

---

## 3. DecisionEngine（决策引擎）

### 3.1 设计原则

P0 阶段只使用**规则表**，不使用机器学习。规则引擎基于：

1. **条件-动作规则**：IF condition THEN action
2. **优先级排序**：高优先级规则优先匹配
3. **置信度计算**：基于条件匹配程度

### 3.2 规则定义

```typescript
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

/**
 * 规则条件
 */
export interface RuleCondition {
  /** 条件字段 */
  field: keyof DecisionContext | 'historicalFailureRate' | 'dependencyCount' | 'estimatedWaitTime';
  
  /** 比较操作符 */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in' | 'contains';
  
  /** 目标值 */
  value: number | string | boolean | string[];
}

/**
 * 内置规则表（P0）
 */
export const BUILTIN_RULES: DecisionRule[] = [
  // R1: 资源不足 → 延后执行
  {
    ruleId: 'R001',
    name: 'resource_exhaustion_defer',
    description: '资源使用率超过阈值时延后执行',
    priority: 100,
    conditions: [
      { field: 'resourceUsage', operator: 'gte', value: 80 },
    ],
    conditionOperator: 'and',
    decisionType: 'defer',
    reasonTemplate: '资源使用率过高（{{resourceUsage}}%），建议延后执行',
    enabled: true,
    tags: ['resource', 'defer'],
  },
  
  // R2: 依赖就绪且资源充足 → 并行执行
  {
    ruleId: 'R002',
    name: 'ready_parallelize',
    description: '无依赖阻塞且资源充足时并行执行',
    priority: 90,
    conditions: [
      { field: 'dependencyStatus', operator: 'eq', value: 'ready' },
      { field: 'resourceUsage', operator: 'lt', value: 70 },
    ],
    conditionOperator: 'and',
    decisionType: 'parallelize',
    reasonTemplate: '依赖已就绪且资源充足，建议并行执行',
    enabled: true,
    tags: ['dependency', 'parallel'],
  },
  
  // R3: 紧急任务 → 立即执行
  {
    ruleId: 'R003',
    name: 'urgent_execute_now',
    description: '紧急任务立即执行',
    priority: 95,
    conditions: [
      { field: 'isUrgent', operator: 'eq', value: true },
      { field: 'dependencyStatus', operator: 'neq', value: 'blocked' },
    ],
    conditionOperator: 'and',
    decisionType: 'execute_now',
    reasonTemplate: '紧急任务，立即执行',
    enabled: true,
    tags: ['priority', 'urgent'],
  },
  
  // R4: 历史失败率高 → 跳过并回退
  {
    ruleId: 'R004',
    name: 'high_failure_skip',
    description: '历史失败率超过阈值时跳过',
    priority: 85,
    conditions: [
      { field: 'historicalSuccessRate', operator: 'lt', value: 0.5 },
    ],
    conditionOperator: 'and',
    decisionType: 'skip',
    reasonTemplate: '历史成功率过低（{{historicalSuccessRate}}%），建议跳过',
    enabled: true,
    tags: ['reliability', 'skip'],
  },
  
  // R5: 依赖阻塞 → 等待
  {
    ruleId: 'R005',
    name: 'dependency_blocked_defer',
    description: '依赖阻塞时延后执行',
    priority: 80,
    conditions: [
      { field: 'dependencyStatus', operator: 'eq', value: 'blocked' },
    ],
    conditionOperator: 'and',
    decisionType: 'defer',
    reasonTemplate: '存在阻塞依赖，等待依赖就绪',
    enabled: true,
    tags: ['dependency', 'defer'],
  },
  
  // R6: 默认规则 → 立即执行
  {
    ruleId: 'R099',
    name: 'default_execute',
    description: '默认执行策略',
    priority: 1,
    conditions: [],
    conditionOperator: 'and',
    decisionType: 'execute_now',
    reasonTemplate: '默认执行策略',
    enabled: true,
    tags: ['default'],
  },
];
```

### 3.3 RuleEngine 实现代码示例

```typescript
/**
 * 规则引擎
 * 
 * P0 阶段核心组件，基于 if-then 规则表进行决策
 */
export class RuleEngine {
  private rules: DecisionRule[] = [];
  
  constructor(initialRules?: DecisionRule[]) {
    this.rules = initialRules || [...BUILTIN_RULES];
    this.sortRules();
  }
  
  /**
   * 评估规则
   */
  evaluate(context: DecisionContext): {
    decision: DecisionType;
    reason: string;
    triggeredRules: string[];
    confidence: number;
  } {
    const triggeredRules: string[] = [];
    let matchedRule: DecisionRule | null = null;
    
    // 按优先级遍历规则
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      if (this.matchConditions(rule.conditions, rule.conditionOperator, context)) {
        triggeredRules.push(rule.ruleId);
        if (!matchedRule) matchedRule = rule;
      }
    }
    
    if (!matchedRule) {
      matchedRule = this.rules.find(r => r.ruleId === 'R099')!;
    }
    
    const reason = this.generateReason(matchedRule, context);
    const confidence = this.calculateConfidence(matchedRule, context);
    
    return { decision: matchedRule.decisionType, reason, triggeredRules, confidence };
  }
  
  /**
   * 匹配条件
   */
  private matchConditions(
    conditions: RuleCondition[],
    operator: 'and' | 'or',
    context: DecisionContext
  ): boolean {
    if (conditions.length === 0) return true;
    const results = conditions.map(cond => this.matchCondition(cond, context));
    return operator === 'and' ? results.every(Boolean) : results.some(Boolean);
  }
  
  /**
   * 匹配单个条件
   */
  private matchCondition(condition: RuleCondition, context: DecisionContext): boolean {
    const fieldValue = this.getFieldValue(condition.field, context);
    if (fieldValue === undefined) return false;
    
    switch (condition.operator) {
      case 'gt': return (fieldValue as number) > (condition.value as number);
      case 'gte': return (fieldValue as number) >= (condition.value as number);
      case 'lt': return (fieldValue as number) < (condition.value as number);
      case 'lte': return (fieldValue as number) <= (condition.value as number);
      case 'eq': return fieldValue === condition.value;
      case 'neq': return fieldValue !== condition.value;
      case 'in': return (condition.value as string[]).includes(fieldValue as string);
      case 'contains': return String(fieldValue).includes(condition.value as string);
      default: return false;
    }
  }
  
  /**
   * 获取字段值
   */
  private getFieldValue(field: RuleCondition['field'], context: DecisionContext): unknown {
    if (field === 'historicalFailureRate') return 1 - context.historicalSuccessRate;
    return context[field as keyof DecisionContext];
  }
  
  /**
   * 生成决策理由
   */
  private generateReason(rule: DecisionRule, context: DecisionContext): string {
    return rule.reasonTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => 
      String(context[key as keyof DecisionContext] ?? '')
    );
  }
  
  /**
   * 计算置信度
   */
  private calculateConfidence(rule: DecisionRule, context: DecisionContext): number {
    if (rule.conditions.length === 0) return 50;
    
    const matchScores = rule.conditions.map(cond => {
      const fieldValue = this.getFieldValue(cond.field, context);
      if (fieldValue === undefined) return 0;
      
      if (typeof fieldValue === 'number' && typeof cond.value === 'number') {
        const threshold = cond.value;
        const actual = fieldValue;
        if (cond.operator === 'gt' || cond.operator === 'gte') {
          return Math.min(100, 50 + (actual - threshold) * 5);
        } else if (cond.operator === 'lt' || cond.operator === 'lte') {
          return Math.min(100, 50 + (threshold - actual) * 5);
        }
      }
      
      if (typeof cond.value === 'boolean') return fieldValue === cond.value ? 95 : 0;
      if (typeof cond.value === 'string') return fieldValue === cond.value ? 90 : 0;
      return 70;
    });
    
    const avgScore = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;
    const priorityBonus = Math.min(10, rule.priority / 10);
    return Math.min(100, Math.round(avgScore + priorityBonus));
  }
  
  private sortRules(): void {
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  
  addRule(rule: DecisionRule): void {
    this.rules.push(rule);
    this.sortRules();
  }
  
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.ruleId === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }
  
  getRules(): DecisionRule[] {
    return [...this.rules];
  }
}
```

### 3.4 DecisionEngine 实现代码示例

```typescript
import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager } from '../memory';
import { DependencyManager, DependencyState } from '../dependency-manager';
import { ResourceMonitor, SystemResources } from './resource-monitor';
import { RuleEngine } from './rule-engine';
import { Decision, DecisionContext, DecisionEvents } from './types';

export interface DecisionEngineConfig {
  enableResourceMonitor?: boolean;
  resourceMonitorInterval?: number;
  customRules?: DecisionRule[];
}

export class DecisionEngine {
  private ruleEngine: RuleEngine;
  private resourceMonitor: ResourceMonitor | null = null;
  
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    private eventEmitter: EventEmitter<DecisionEvents>,
    config?: DecisionEngineConfig
  ) {
    this.ruleEngine = new RuleEngine(config?.customRules);
    if (config?.enableResourceMonitor !== false) {
      this.resourceMonitor = new ResourceMonitor(config?.resourceMonitorInterval ?? 5000);
    }
  }
  
  /**
   * 生成决策
   */
  async makeDecision(taskId: string, options?: { isUrgent?: boolean; estimatedDuration?: number }): Promise<Decision> {
    const context = await this.buildDecisionContext(taskId, options);
    const evaluation = this.ruleEngine.evaluate(context);
    
    const decision: Decision = {
      decisionId: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: evaluation.decision,
      reason: evaluation.reason,
      confidence: evaluation.confidence,
      source: 'rule_based',
      triggeredRules: evaluation.triggeredRules,
      timestamp: Date.now(),
      context,
    };
    
    this.eventEmitter.emit('decision:made', {
      decisionId: decision.decisionId,
      taskId,
      decision: decision.type,
      confidence: decision.confidence,
      timestamp: decision.timestamp,
    });
    
    return decision;
  }
  
  private async buildDecisionContext(taskId: string, options?: { isUrgent?: boolean; estimatedDuration?: number }): Promise<DecisionContext> {
    let resourceUsage = 0;
    if (this.resourceMonitor) {
      const resources = this.resourceMonitor.getCurrentResources();
      resourceUsage = resources.cpuUsage;
    }
    
    const depState = await this.dependencyManager.getDependencyState(taskId);
    const dependencyStatus = this.mapDependencyStatus(depState);
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
  
  private mapDependencyStatus(state?: DependencyState): DecisionContext['dependencyStatus'] {
    if (!state) return 'ready';
    if (state.ready) return 'ready';
    if (state.blockedBy && state.blockedBy.length > 0) return 'blocked';
    return 'partial';
  }
  
  private async getHistoricalSuccessRate(taskId: string): Promise<number> {
    const memories = await this.memoryManager.queryEpisodicMemories({
      relatedTaskIds: [taskId],
      limit: 10,
    });
    if (memories.length === 0) return 0.8;
    const successCount = memories.filter(m => m.content && (m.content as any).status === 'success').length;
    return successCount / memories.length;
  }
  
  addRule(rule: DecisionRule): void { this.ruleEngine.addRule(rule); }
  removeRule(ruleId: string): boolean { return this.ruleEngine.removeRule(ruleId); }
  getCurrentResources(): SystemResources | null { return this.resourceMonitor?.getCurrentResources() ?? null; }
}
```

---

## 4. RecommendationEngine（推荐引擎）

### 4.1 设计原则

基于拓扑排序和依赖图分析：

1. **依赖图分析**：复用 `DependencyManager.getDependencyGraph()`
2. **并行分组**：复用 `TopologicalSorter.getExecutionLevels()`
3. **时间预估**：基于 `MemoryManager.EpisodicMemory` 历史数据
4. **策略生成**：根据分组结果生成执行策略

### 4.2 RecommendationEngine 实现代码示例

```typescript
import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager, EpisodicMemory } from '../memory';
import { DependencyManager, DependencyGraph } from '../dependency-manager';
import { TopologicalSorter } from '../workflow/topological-sorter';
import { WorkflowNode, WorkflowConnection } from '../workflow/types';
import { Recommendation, StrategyType, ResourceEstimate, DependencyAnalysis, PerformanceMetrics } from './types';

export interface RecommendationEngineConfig {
  enableHistoricalReference?: boolean;
  similarityThreshold?: number;
  maxHistoricalReferences?: number;
}

export class RecommendationEngine {
  private topologicalSorter: TopologicalSorter;
  
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    private eventEmitter: EventEmitter<any>,
    private config?: RecommendationEngineConfig
  ) {
    this.topologicalSorter = new TopologicalSorter();
  }
  
  /**
   * 推荐执行策略
   */
  async recommendStrategy(taskIds: string[]): Promise<Recommendation> {
    // 1. 获取依赖图
    const depGraph = await this.dependencyManager.getDependencyGraph();
    
    // 2. 过滤相关任务
    const relevantGraph = this.filterRelevantGraph(depGraph, taskIds);
    
    // 3. 转换为工作流图
    const { nodes, connections } = this.convertToWorkflowGraph(relevantGraph);
    
    // 4. 获取执行层级（并行分组）
    const executionLevels = this.topologicalSorter.getExecutionLevels(nodes, connections);
    
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
    
    return {
      recommendationId: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
  }
  
  private filterRelevantGraph(graph: DependencyGraph, taskIds: string[]): DependencyGraph {
    const taskIdSet = new Set(taskIds);
    return {
      nodes: graph.nodes.filter(n => taskIdSet.has(n.taskId)),
      edges: graph.edges.filter(e => taskIdSet.has(e.from) && taskIdSet.has(e.to)),
    };
  }
  
  private convertToWorkflowGraph(graph: DependencyGraph): { nodes: WorkflowNode[]; connections: WorkflowConnection[] } {
    const nodes: WorkflowNode[] = graph.nodes.map(n => ({
      id: n.taskId,
      type: 'task' as const,
      name: n.label || n.taskId,
      config: {},
    }));
    const connections: WorkflowConnection[] = graph.edges.map(e => ({ source: e.from, target: e.to }));
    return { nodes, connections };
  }
  
  private analyzeDependency(graph: DependencyGraph, levels: string[][]): DependencyAnalysis {
    return {
      parallelGroups: levels,
      criticalPath: levels.length > 0 ? levels.map(l => l[0]).filter(Boolean) : [],
      criticalPathTime: 0,
      maxDepth: levels.length,
    };
  }
  
  private determineStrategy(levels: string[][]): StrategyType {
    if (levels.length === 0) return 'sequential';
    if (levels.length === 1 && levels[0].length > 1) return 'parallel';
    if (levels.some(l => l.length > 1)) return 'hybrid';
    return 'sequential';
  }
  
  private estimateTotalTime(levels: string[][], metrics: Map<string, PerformanceMetrics>): number {
    let totalTime = 0;
    for (const level of levels) {
      const levelTime = Math.max(...level.map(taskId => metrics.get(taskId)?.executionTime ?? 1000));
      totalTime += levelTime;
    }
    return totalTime;
  }
  
  private estimateResources(levels: string[][], metrics: Map<string, PerformanceMetrics>): ResourceEstimate {
    const maxConcurrency = Math.max(...levels.map(l => l.length));
    const avgResource = Array.from(metrics.values()).reduce((sum, m) => sum + m.peakResourceUsage, 0) / (metrics.size || 1);
    
    return {
      cpuPeak: Math.min(100, avgResource * maxConcurrency),
      memoryPeak: 256 * maxConcurrency,
      networkPeak: 10 * maxConcurrency,
      concurrentTasks: maxConcurrency,
    };
  }
  
  private async getHistoricalMetrics(taskIds: string[]): Promise<Map<string, PerformanceMetrics>> {
    const metricsMap = new Map<string, PerformanceMetrics>();
    for (const taskId of taskIds) {
      const memories = await this.memoryManager.queryEpisodicMemories({
        relatedTaskIds: [taskId],
        limit: 5,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });
      if (memories.length > 0) {
        metricsMap.set(taskId, this.aggregateMetrics(taskId, memories));
      }
    }
    return metricsMap;
  }
  
  private aggregateMetrics(taskId: string, memories: EpisodicMemory[]): PerformanceMetrics {
    const executionTimes = memories.map(m => (m.content as any)?.executionTime).filter((t): t is number => t !== undefined);
    const statuses = memories.map(m => (m.content as any)?.status as string);
    
    return {
      taskId,
      executionTime: executionTimes.length > 0 ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 1000,
      peakResourceUsage: 50,
      status: statuses.includes('success') ? 'success' : statuses.includes('failed') ? 'failed' : 'partial',
      timestamp: Date.now(),
      retryCount: 0,
    };
  }
  
  private generateRationale(strategy: StrategyType, analysis: DependencyAnalysis, metrics: Map<string, PerformanceMetrics>): string {
    const parts: string[] = [];
    parts.push(`推荐策略：${strategy}`);
    parts.push(`依赖深度：${analysis.maxDepth} 层`);
    parts.push(`可并行分组：${analysis.parallelGroups.length} 组`);
    if (metrics.size > 0) {
      const avgTime = Array.from(metrics.values()).reduce((s, m) => s + m.executionTime, 0) / metrics.size;
      parts.push(`平均历史执行时间：${Math.round(avgTime)}ms`);
    }
    return parts.join('；');
  }
  
  private calculateConfidence(levels: string[][], metrics: Map<string, PerformanceMetrics>): number {
    let base = 70;
    if (levels.length > 0 && levels.every(l => l.length > 0)) base += 10;
    if (metrics.size > 0) base += 10;
    if (metrics.size >= levels.flat().length * 0.5) base += 10;
    return Math.min(100, base);
  }
}
```

---

## 5. AnalyticsEngine（分析引擎）

### 5.1 设计原则

核心原则：**复用 MemoryManager.getStats() 数据，专注"分析"而非"存储"**

AnalyticsEngine 不维护独立的数据存储，所有原始数据来自 MemoryManager。

### 5.2 AnalyticsEngine 实现代码示例

```typescript
import { MemoryManager } from '../memory';
import { AnalyticsReport, TimePeriod, TaskStatistics, ResourceTrend, OptimizationSuggestion, Warning } from './types';

export interface AnalyticsEngineConfig {
  /** 性能退化阈值 */
  performanceDegradationThreshold?: number;
  /** 高失败率阈值 */
  highFailureRateThreshold?: number;
  /** 资源耗尽阈值 */
  resourceExhaustionThreshold?: number;
}

export class AnalyticsEngine {
  constructor(
    private memoryManager: MemoryManager,
    private config?: AnalyticsEngineConfig
  ) {}
  
  /**
   * 生成分析报告
   */
  async generateReport(period: TimePeriod): Promise<AnalyticsReport> {
    // 1. 获取 MemoryManager 统计数据
    const stats = await this.memoryManager.getStats();
    
    // 2. 计算任务统计
    const taskStatistics = this.calculateTaskStatistics(stats);
    
    // 3. 分析资源趋势
    const resourceTrend = await this.analyzeResourceTrend(period);
    
    // 4. 生成优化建议
    const optimizationSuggestions = this.generateSuggestions(stats, taskStatistics);
    
    // 5. 检测异常预警
    const warnings = this.detectWarnings(stats, taskStatistics);
    
    return {
      reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      period,
      generatedAt: Date.now(),
      taskStatistics,
      resourceTrend,
      optimizationSuggestions,
      warnings,
    };
  }
  
  private calculateTaskStatistics(stats: any): TaskStatistics {
    const episodicStats = stats.episodic;
    const total = episodicStats.total;
    const success = episodicStats.byStatus['completed'] ?? episodicStats.byStatus['success'] ?? 0;
    const failed = episodicStats.byStatus['failed'] ?? 0;
    const timeout = episodicStats.byStatus['timeout'] ?? 0;
    
    return {
      total,
      success,
      failed,
      timeout,
      successRate: total > 0 ? success / total : 0,
      avgExecutionTime: 0, // 从 EpisodicMemory 内容中提取
      maxExecutionTime: 0,
      minExecutionTime: 0,
    };
  }
  
  private async analyzeResourceTrend(period: TimePeriod): Promise<ResourceTrend> {
    // 从 MemoryManager 查询历史数据
    const memories = await this.memoryManager.queryEpisodicMemories({
      startTime: new Date(period.start).getTime(),
      endTime: new Date(period.end).getTime(),
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });
    
    const cpuTrend = memories.map(m => ({
      timestamp: m.createdAt,
      value: (m.content as any)?.resourceUsage ?? 50,
    }));
    
    const memoryTrend = memories.map(m => ({
      timestamp: m.createdAt,
      value: (m.content as any)?.memoryUsage ?? 256,
    }));
    
    const executionTimeTrend = memories.map(m => ({
      timestamp: m.createdAt,
      value: (m.content as any)?.executionTime ?? 1000,
    }));
    
    return {
      cpu: cpuTrend,
      memory: memoryTrend,
      executionTime: executionTimeTrend,
    };
  }
  
  private generateSuggestions(stats: any, taskStats: TaskStatistics): OptimizationSuggestion[] {
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
    
    // 性能建议
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
    
    return suggestions;
  }
  
  private detectWarnings(stats: any, taskStats: TaskStatistics): Warning[] {
    const warnings: Warning[] = [];
    const config = this.config || {};
    
    // 高失败率预警
    if (taskStats.successRate < (config.highFailureRateThreshold ?? 0.5)) {
      warnings.push({
        id: 'warn_001',
        level: 'critical',
        type: 'high_failure_rate',
        message: `任务成功率过低（${(taskStats.successRate * 100).toFixed(1)}%），需要立即关注`,
        timestamp: Date.now(),
      });
    }
    
    // 性能退化预警
    if (taskStats.avgExecutionTime > (config.performanceDegradationThreshold ?? 10000)) {
      warnings.push({
        id: 'warn_002',
        level: 'warning',
        type: 'performance_degradation',
        message: `平均执行时间过长（${taskStats.avgExecutionTime}ms），存在性能问题`,
        timestamp: Date.now(),
      });
    }
    
    return warnings;
  }
}
```

---

## 6. 与现有模块集成

### 6.1 IntelligenceEngine 主引擎

```typescript
import { EventEmitter } from '../managers/event-emitter';
import { MemoryManager } from '../memory';
import { DependencyManager } from '../dependency-manager';
import { DecisionEngine, DecisionEngineConfig } from './decision-engine';
import { RecommendationEngine, RecommendationEngineConfig } from './recommendation-engine';
import { AnalyticsEngine, AnalyticsEngineConfig } from './analytics-engine';
import { KnowledgeIntegration } from './knowledge-integration';
import { Decision, Recommendation, AnalyticsReport, TimePeriod } from './types';

export interface IntelligenceEngineConfig {
  decision?: DecisionEngineConfig;
  recommendation?: RecommendationEngineConfig;
  analytics?: AnalyticsEngineConfig;
}

export class IntelligenceEngine {
  private decisionEngine: DecisionEngine;
  private recommendationEngine: RecommendationEngine;
  private analyticsEngine: AnalyticsEngine;
  private knowledgeIntegration: KnowledgeIntegration;
  private eventEmitter: EventEmitter<any>;
  
  constructor(
    private memoryManager: MemoryManager,
    private dependencyManager: DependencyManager,
    config?: IntelligenceEngineConfig
  ) {
    this.eventEmitter = new EventEmitter();
    
    this.decisionEngine = new DecisionEngine(
      memoryManager,
      dependencyManager,
      this.eventEmitter,
      config?.decision
    );
    
    this.recommendationEngine = new RecommendationEngine(
      memoryManager,
      dependencyManager,
      this.eventEmitter,
      config?.recommendation
    );
    
    this.analyticsEngine = new AnalyticsEngine(memoryManager, config?.analytics);
    
    this.knowledgeIntegration = new KnowledgeIntegration(memoryManager);
  }
  
  // ==================== 决策接口 ====================
  
  async makeDecision(taskId: string, options?: { isUrgent?: boolean; estimatedDuration?: number }): Promise<Decision> {
    return this.decisionEngine.makeDecision(taskId, options);
  }
  
  addDecisionRule(rule: DecisionRule): void {
    this.decisionEngine.addRule(rule);
  }
  
  removeDecisionRule(ruleId: string): boolean {
    return this.decisionEngine.removeRule(ruleId);
  }
  
  // ==================== 推荐接口 ====================
  
  async recommendStrategy(taskIds: string[]): Promise<Recommendation> {
    return this.recommendationEngine.recommendStrategy(taskIds);
  }
  
  // ==================== 分析接口 ====================
  
  async generateAnalyticsReport(period: TimePeriod): Promise<AnalyticsReport> {
    return this.analyticsEngine.generateReport(period);
  }
  
  // ==================== 知识提炼接口 ====================
  
  async refineKnowledge(): Promise<any> {
    return this.knowledgeIntegration.refine();
  }
  
  // ==================== 事件监听 ====================
  
  on(event: string, listener: (event: any) => void): () => void {
    return this.eventEmitter.on(event as any, listener);
  }
}
```

### 6.2 KnowledgeIntegration 适配层

```typescript
import { MemoryManager, KnowledgeRefinement, MemoryCluster, PatternRecognitionResult } from '../memory';

export interface RefinementInput {
  /** 限定时间范围 */
  startTime?: number;
  endTime?: number;
  /** 限定来源 */
  sources?: string[];
  /** 最小聚类大小 */
  minClusterSize?: number;
}

export interface RefinementOutput {
  clusters: MemoryCluster[];
  extractedKnowledge: PatternRecognitionResult;
  promotedMemories: number;
}

export class KnowledgeIntegration {
  private knowledgeRefinement: KnowledgeRefinement;
  
  constructor(private memoryManager: MemoryManager) {
    // 复用 MemoryManager 内部的 KnowledgeRefinement
    // 注意：实际实现需要 MemoryManager 暴露 knowledgeRefinement 实例
  }
  
  /**
   * 执行知识提炼
   */
  async refine(input?: RefinementInput): Promise<RefinementOutput> {
    // 直接调用 MemoryManager.refine()
    const result = await (this.memoryManager as any).refine();
    return result;
  }
  
  /**
   * 扩展：多格式输出
   */
  async refineWithFormat(format: 'json' | 'yaml' | 'markdown'): Promise<string> {
    const result = await this.refine();
    
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      case 'yaml':
        return this.toYaml(result);
      case 'markdown':
        return this.toMarkdown(result);
      default:
        return JSON.stringify(result, null, 2);
    }
  }
  
  private toYaml(output: RefinementOutput): string {
    // 简化实现
    return `clusters:
${output.clusters.map(c => `  - id: ${c.clusterId}
    label: ${c.label}
    members: ${c.members.length}`).join('\n')}
promotedMemories: ${output.promotedMemories}`;
  }
  
  private toMarkdown(output: RefinementOutput): string {
    return `# 知识提炼报告

## 聚类统计
- 聚类数量：${output.clusters.length}
- 提升记忆数：${output.promotedMemories}

## 聚类详情
${output.clusters.map(c => `### ${c.label}
- 成员数：${c.members.length}
- 共同特征：${c.commonFeatures.join(', ')}
`).join('\n')}`;
  }
}
```

### 6.3 ResourceMonitor 资源监控

```typescript
export interface SystemResources {
  cpuUsage: number;      // CPU 使用率 (%)
  memoryUsage: number;   // 内存使用率 (%)
  freeMemory: number;    // 空闲内存 (bytes)
  totalMemory: number;   // 总内存 (bytes)
  loadAverage: number[]; // 负载均值
}

export class ResourceMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private currentResources: SystemResources;
  
  constructor(private interval: number = 5000) {
    this.currentResources = this.getInitialResources();
    this.start();
  }
  
  private start(): void {
    this.intervalId = setInterval(() => {
      this.updateResources();
    }, this.interval);
  }
  
  private updateResources(): void {
    // Node.js 环境下获取系统资源
    const os = require('os');
    
    this.currentResources = {
      cpuUsage: this.calculateCpuUsage(),
      memoryUsage: (1 - os.freemem() / os.totalmem()) * 100,
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      loadAverage: os.loadavg(),
    };
  }
  
  private calculateCpuUsage(): number {
    // 简化实现：使用负载均值估算
    const os = require('os');
    const load = os.loadavg()[0];
    const cpus = os.cpus().length;
    return Math.min(100, (load / cpus) * 100);
  }
  
  private getInitialResources(): SystemResources {
    const os = require('os');
    return {
      cpuUsage: 0,
      memoryUsage: (1 - os.freemem() / os.totalmem()) * 100,
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      loadAverage: os.loadavg(),
    };
  }
  
  getCurrentResources(): SystemResources {
    return { ...this.currentResources };
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

---

## 7. 测试策略

### 7.1 测试用例分布

| 模块 | 用例数 | 覆盖内容 |
|------|--------|----------|
| **RuleEngine** | 10 | 规则匹配、优先级、置信度计算、条件组合 |
| **DecisionEngine** | 12 | 决策生成、上下文构建、历史数据查询、事件触发 |
| **RecommendationEngine** | 15 | 策略推荐、并行分组、时间预估、资源预估、历史参考 |
| **AnalyticsEngine** | 10 | 报告生成、统计分析、优化建议、异常预警 |
| **KnowledgeIntegration** | 5 | 知识提炼、格式转换 |
| **ResourceMonitor** | 5 | 资源获取、定时更新 |
| **集成测试** | 20 | 模块间协作、端到端流程、事件传递 |
| **总计** | **77** | |

### 7.2 测试用例详情

#### RuleEngine 测试（10 个）

```typescript
describe('RuleEngine', () => {
  // R1: 规则按优先级排序
  it('should sort rules by priority', () => {});
  
  // R2: 匹配资源不足规则
  it('should match resource_exhaustion_defer when CPU > 80%', () => {});
  
  // R3: 匹配并行执行规则
  it('should match ready_parallelize when dependencies ready and resources sufficient', () => {});
  
  // R4: 匹配紧急任务规则
  it('should match urgent_execute_now for urgent tasks', () => {});
  
  // R5: 匹配高失败率规则
  it('should match high_failure_skip when success rate < 50%', () => {});
  
  // R6: 匹配依赖阻塞规则
  it('should match dependency_blocked_defer when blocked', () => {});
  
  // R7: 默认规则兜底
  it('should fallback to default_execute when no rule matches', () => {});
  
  // R8: 添加自定义规则
  it('should support custom rules', () => {});
  
  // R9: 移除规则
  it('should remove rule by ID', () => {});
  
  // R10: 置信度计算
  it('should calculate confidence correctly', () => {});
});
```

#### DecisionEngine 测试（12 个）

```typescript
describe('DecisionEngine', () => {
  // D1: 生成决策
  it('should generate decision for task', () => {});
  
  // D2: 构建决策上下文
  it('should build decision context with resource and dependency status', () => {});
  
  // D3: 计算历史成功率
  it('should calculate historical success rate from memories', () => {});
  
  // D4: 触发决策事件
  it('should emit decision:made event', () => {});
  
  // D5: 资源不足时延后
  it('should defer when resource exhausted', () => {});
  
  // D6: 紧急任务立即执行
  it('should execute now for urgent tasks', () => {});
  
  // D7: 依赖阻塞时等待
  it('should defer when dependency blocked', () => {});
  
  // D8: 添加自定义规则
  it('should add custom decision rule', () => {});
  
  // D9: 移除规则
  it('should remove decision rule', () => {});
  
  // D10: 获取当前资源状态
  it('should get current resources', () => {});
  
  // D11: 无历史数据时使用默认成功率
  it('should use default success rate when no history', () => {});
  
  // D12: 置信度范围验证
  it('should return confidence in 0-100 range', () => {});
});
```

#### RecommendationEngine 测试（15 个）

```typescript
describe('RecommendationEngine', () => {
  // Rec1: 串行策略
  it('should recommend sequential for single path', () => {});
  
  // Rec2: 并行策略
  it('should recommend parallel for independent tasks', () => {});
  
  // Rec3: 混合策略
  it('should recommend hybrid for mixed dependencies', () => {});
  
  // Rec4: 执行层级计算
  it('should calculate execution levels correctly', () => {});
  
  // Rec5: 关键路径分析
  it('should identify critical path', () => {});
  
  // Rec6: 时间预估
  it('should estimate total time based on history', () => {});
  
  // Rec7: 资源预估
  it('should estimate resource consumption', () => {});
  
  // Rec8: 依赖图转换
  it('should convert dependency graph to workflow graph', () => {});
  
  // Rec9: 历史性能数据获取
  it('should get historical metrics from MemoryManager', () => {});
  
  // Rec10: 生成推荐理由
  it('should generate rationale with key insights', () => {});
  
  // Rec11: 置信度计算
  it('should calculate confidence based on data quality', () => {});
  
  // Rec12: 无历史数据时预估
  it('should estimate when no historical data', () => {});
  
  // Rec13: 触发事件
  it('should emit recommendation:generated event', () => {});
  
  // Rec14: 过滤相关任务
  it('should filter relevant tasks from graph', () => {});
  
  // Rec15: 执行计划生成
  it('should generate execution plan', () => {});
});
```

#### AnalyticsEngine 测试（10 个）

```typescript
describe('AnalyticsEngine', () => {
  // A1: 生成报告
  it('should generate analytics report', () => {});
  
  // A2: 任务统计计算
  it('should calculate task statistics', () => {});
  
  // A3: 资源趋势分析
  it('should analyze resource trend', () => {});
  
  // A4: 优化建议生成
  it('should generate optimization suggestions', () => {});
  
  // A5: 失败率高预警
  it('should warn on high failure rate', () => {});
  
  // A6: 性能退化预警
  it('should warn on performance degradation', () => {});
  
  // A7: 复用 MemoryManager.getStats
  it('should reuse MemoryManager.getStats data', () => {});
  
  // A8: 时间范围过滤
  it('should filter by time period', () => {});
  
  // A9: 报告 ID 生成
  it('should generate unique report ID', () => {});
  
  // A10: 空数据处理
  it('should handle empty data gracefully', () => {});
});
```

---

## 8. 实施计划

### 8.1 P0 阶段（核心功能）

**目标**：规则引擎 + 基本推荐 + 知识整合

| 任务 | 文件 | 预计时间 | 依赖 |
|------|------|----------|------|
| 类型定义 | `types.ts` | 2h | 无 |
| 规则引擎 | `rule-engine.ts` | 4h | types.ts |
| 资源监控 | `resource-monitor.ts` | 2h | 无 |
| 决策引擎 | `decision-engine.ts` | 4h | rule-engine.ts, resource-monitor.ts |
| 推荐引擎 | `recommendation-engine.ts` | 6h | types.ts |
| 知识整合 | `knowledge-integration.ts` | 2h | MemoryManager |
| 主引擎 | `intelligence-engine.ts` | 4h | 所有子引擎 |
| 单元测试 | `__tests__/*.test.ts` | 8h | 实现代码 |
| **总计** | | **32h** | |

### 8.2 P1 阶段（增强功能）

**目标**：分析引擎 + 性能预测 + 智能提醒

| 任务 | 文件 | 预计时间 | 依赖 |
|------|------|----------|------|
| 分析引擎 | `analytics-engine.ts` | 6h | P0 |
| 性能预测 | 扩展 `recommendation-engine.ts` | 4h | P0 |
| 智能提醒 | 新增 `alert-manager.ts` | 4h | analytics-engine.ts |
| 集成测试 | `__tests__/integration.test.ts` | 4h | 所有模块 |
| **总计** | | **18h** | |

### 8.3 P2 阶段（高级功能）

**目标**：ML 决策 + 自适应策略 + 自学习

| 任务 | 文件 | 预计时间 | 依赖 |
|------|------|----------|------|
| ML 决策引擎 | `ml-decision-engine.ts` | 8h | P0/P1 数据积累 |
| 自适应策略 | 扩展 `recommendation-engine.ts` | 6h | P0 |
| 自学习机制 | `self-learning.ts` | 6h | P0/P1 |
| A/B 测试框架 | `ab-test-framework.ts` | 4h | P2 模块 |
| **总计** | | **24h** | |

### 8.4 里程碑

```
Week 1: P0 核心功能
├── Day 1-2: 类型定义 + 规则引擎
├── Day 3-4: 决策引擎 + 资源监控
├── Day 5-6: 推荐引擎
└── Day 7: 知识整合 + 主引擎

Week 2: P0 测试 + P1 开发
├── Day 1-2: 单元测试
├── Day 3-4: 分析引擎
└── Day 5: 性能预测 + 智能提醒

Week 3+: P2 高级功能
├── ML 决策引擎
├── 自适应策略
└── 自学习机制
```

---

## 9. 附录

### 9.1 类型导出

```typescript
// types.ts 导出清单
export type {
  DecisionType,
  DecisionSource,
  Decision,
  DecisionContext,
  StrategyType,
  ResourceEstimate,
  HistoricalReference,
  DependencyAnalysis,
  Recommendation,
  TimePeriod,
  TrendDataPoint,
  ResourceTrend,
  TaskStatistics,
  OptimizationSuggestion,
  Warning,
  AnalyticsReport,
  PerformanceMetrics,
  DecisionRule,
  RuleCondition,
};

export interface DecisionEvents {
  'decision:made': {
    decisionId: string;
    taskId: string;
    decision: DecisionType;
    confidence: number;
    timestamp: number;
  };
}

export interface RecommendationEvents {
  'recommendation:generated': {
    recommendationId: string;
    strategy: StrategyType;
    estimatedTime: number;
    timestamp: number;
  };
}
```

### 9.2 模块入口

```typescript
// index.ts
export { IntelligenceEngine } from './intelligence-engine';
export { DecisionEngine } from './decision-engine';
export { RecommendationEngine } from './recommendation-engine';
export { AnalyticsEngine } from './analytics-engine';
export { RuleEngine } from './rule-engine';
export { ResourceMonitor } from './resource-monitor';
export { KnowledgeIntegration } from './knowledge-integration';
export { BUILTIN_RULES } from './rule-engine';
export * from './types';
```

---

*创建日期: 2026-04-19*
*状态: Ready for Implementation*
