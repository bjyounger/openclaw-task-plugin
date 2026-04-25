# IntelligenceEngine 需求分析

**版本**: 1.1.0
**作者**: 孬蛋
**日期**: 2026-04-19
**状态**: Draft（评审修订）

---

## 1. 概述

### 1.1 模块定位

IntelligenceEngine 是任务插件的"大脑"，负责：
- 智能决策支持
- 执行策略推荐
- 知识提炼与沉淀（通过适配层复用 KnowledgeRefinement）
- 历史数据分析（复用 MemoryManager 数据，专注分析）

### 1.2 与现有模块关系

```
已有模块:
├── MemoryManager + KnowledgeRefinement — 知识存储与提炼
├── SessionTaskManager — 任务管理
├── WorkflowExecutor — 工作流执行
└── DependencyManager — 依赖管理

新增模块:
IntelligenceEngine
    ├── 整合现有 KnowledgeRefinement
    ├── 决策引擎（DecisionEngine）
    ├── 推荐引擎（RecommendationEngine）
    └── 分析引擎（AnalyticsEngine）
```

---

## 2. 核心需求

| ID | 需求 | 优先级 | 说明 |
|----|------|--------|------|
| IE-01 | 决策支持 | P0 | 基于规则表（if-then）提供执行决策建议 |
| IE-02 | 执行策略推荐 | P0 | 推荐最优执行策略（串行/并行/混合） |
| IE-03 | 知识提炼整合 | P0 | 通过 knowledge-integration.ts 适配层复用 KnowledgeRefinement |
| IE-04 | 历史数据分析 | P1 | 复用 MemoryManager.getStats() 数据，专注分析而非存储 |
| IE-05 | 性能预测 | P1 | 预估任务执行时间和资源消耗 |
| IE-06 | 智能提醒 | P1 | 基于分析结果主动提醒用户 |
| IE-07 | 模式识别 | P2 | 识别常见执行模式，自动优化 |
| IE-08 | 自学习机制 | P2 | 从执行结果中学习，持续优化推荐（含 adaptive 策略与 ML 决策） |
| IE-09 | 资源监控 | P1 | 监控系统资源状态，作为决策引擎输入 |

---

## 3. 功能设计

### 3.1 决策引擎（DecisionEngine）

**输入**：
- 当前任务上下文
- 历史执行数据
- 系统约束（时间、资源）
- 资源监控数据（IE-09）

**输出**：
- 决策建议（execute_now / defer / parallelize / skip）
- 理由说明
- 置信度评分

**算法策略**：
| 阶段 | 算法 | 说明 |
|------|------|------|
| P0 | 基于规则的决策 | if-then 规则表，覆盖常见场景（资源不足→defer，无依赖→parallelize 等） |
| P2 | 机器学习决策 | 基于历史数据训练模型，替代手动规则 |

**规则表示例**：
```
IF resource_usage > 80%     → defer（资源不足，延后执行）
IF no_dependency(task)      → parallelize（无依赖，可并行）
IF deadline_urgent(task)    → execute_now（紧急，立即执行）
IF historical_fail > 50%    → skip + fallback（历史失败率高，跳过并回退）
```

**场景示例**：
```
任务A → 决策引擎 → 建议: parallelize
                  理由: 历史数据显示A与B、C无依赖，可并行
                  置信度: 85%
```

### 3.2 推荐引擎（RecommendationEngine）

**输入**：
- 任务集合
- 依赖关系图（由 DependencyManager 提供）
- 历史性能数据（从 MemoryManager.EpisodicMemory 提取 PerformanceMetrics）

**输出**：
- 推荐执行策略
- 预估执行时间
- 资源消耗预估

**与 DependencyManager 协同**：

RecommendationEngine 通过构造函数注入 DependencyManager，利用依赖图数据进行并行化推荐：

```typescript
class RecommendationEngine {
  constructor(
    private dependencyManager: DependencyManager,
    private memoryManager: MemoryManager,
  ) {}

  async recommendStrategy(tasks: TaskConfig[]): Promise<Recommendation> {
    // 1. 从 DependencyManager 获取依赖图
    const depGraph = this.dependencyManager.getDependencyGraph(tasks);
    // 2. 拓扑排序，识别可并行分组
    const groups = depGraph.parallelizableGroups();
    // 3. 从 EpisodicMemory 提取历史性能
    const metrics = await this.memoryManager.episodic.queryPerformance(tasks);
    // 4. 基于分组 + 历史数据生成推荐
    return this.generateRecommendation(groups, metrics);
  }
}
```

**策略类型**（按阶段实现）：
| 策略 | 阶段 | 适用场景 |
|------|------|----------|
| sequential | P1 | 强依赖链、资源受限 |
| parallel | P1 | 无依赖、资源充足 |
| hybrid | P1 | 混合依赖、部分可并行 |
| adaptive | P2 | 动态调整策略（需运行时反馈闭环，复杂度高，移至 P2） |

### 3.3 知识提炼整合

**整合方案**：新建 `knowledge-integration.ts` 作为适配层，复用现有 KnowledgeRefinement 功能，而非重写。

**适配层职责**：
```typescript
// knowledge-integration.ts — 适配层
export class KnowledgeIntegration {
  constructor(private knowledgeRefinement: KnowledgeRefinement) {}

  /** 代理调用：提炼知识 */
  async refine(input: RefinementInput): Promise<RefinementOutput> {
    return this.knowledgeRefinement.refine(input);
  }

  /** 扩展：多格式输出 */
  async refineWithFormat(input: RefinementInput, format: 'json' | 'yaml' | 'markdown'): Promise<string> {
    const result = await this.knowledgeRefinement.refine(input);
    return this.formatOutput(result, format);
  }

  /** 扩展：增量提炼（仅处理新增内容） */
  async incrementalRefine(input: IncrementalInput): Promise<RefinementOutput> {
    // 只提炼上次处理后的新增数据
    const delta = this.extractDelta(input);
    return this.knowledgeRefinement.refine(delta);
  }
}
```

**现有 KnowledgeRefinement 功能（复用，不重写）**：
- 提取关键信息
- 分类存储
- 关联分析

**扩展需求（在适配层实现）**：
- 支持多格式输出（JSON/YAML/Markdown）
- 支持增量提炼
- 支持提炼结果回用

### 3.4 分析引擎（AnalyticsEngine）

**核心原则**：复用 MemoryManager.getStats() 数据，专注"分析"而非"存储"。AnalyticsEngine 不维护独立的数据存储，所有原始数据来自 MemoryManager。

**数据来源**：
```typescript
class AnalyticsEngine {
  constructor(private memoryManager: MemoryManager) {}

  async analyze(period: TimePeriod): Promise<AnalyticsReport> {
    // 复用 MemoryManager 已有的统计数据
    const stats = this.memoryManager.getStats(period);
    // 专注分析逻辑
    return this.generateReport(stats);
  }
}
```

**分析维度**：
- 执行时间分布
- 成功/失败率
- 资源消耗趋势
- 依赖模式统计

**输出**：
- 分析报告
- 优化建议
- 异常预警

---

## 4. 数据模型

### 4.1 Decision（决策）

```typescript
interface Decision {
  /** 决策类型 */
  type: 'execute_now' | 'defer' | 'parallelize' | 'skip' | 'fallback';

  /** 理由说明 */
  reason: string;

  /** 置信度 (0-100) */
  confidence: number;

  /** 备选方案 */
  alternatives?: Decision[];

  /** 生成时间 */
  timestamp: string;

  /** 决策来源（P0: 规则表，P2: ML模型） */
  source: 'rule_based' | 'ml_model';
}
```

### 4.2 Recommendation（推荐）

```typescript
interface Recommendation {
  /** 推荐策略 */
  strategy: 'sequential' | 'parallel' | 'hybrid' | 'adaptive';

  /** 预估时间（毫秒） */
  estimatedTime: number;

  /** 资源消耗预估 */
  estimatedResources: ResourceEstimate;

  /** 推荐理由 */
  rationale: string;

  /** 历史参考 */
  historicalReferences: HistoricalReference[];

  /** 依赖图分析结果 */
  dependencyAnalysis?: DependencyAnalysis;
}

interface DependencyAnalysis {
  /** 可并行分组 */
  parallelGroups: string[][];
  /** 关键依赖链 */
  criticalPath: string[];
}
```

### 4.3 PerformanceMetrics（性能指标）

```typescript
interface PerformanceMetrics {
  /** 任务 ID */
  taskId: string;

  /** 执行时间（毫秒） */
  executionTime: number;

  /** 资源消耗峰值 */
  peakResourceUsage: number;

  /** 成功/失败 */
  status: 'success' | 'failed' | 'partial';

  /** 执行时间戳 */
  timestamp: string;

  /** 重试次数 */
  retryCount: number;
}
```

**数据来源**：从 MemoryManager.EpisodicMemory 中提取历史任务执行记录，聚合为 PerformanceMetrics。

```typescript
// MemoryManager.EpisodicMemory 中存储的原始事件
interface EpisodicEvent {
  eventType: 'task_start' | 'task_end' | 'task_retry';
  taskId: string;
  timestamp: string;
  metadata: {
    executionTime?: number;
    resourceUsage?: number;
    status?: string;
    retryCount?: number;
  };
}

// 提取逻辑（RecommendationEngine 中使用）
async function extractPerformanceMetrics(
  episodic: EpisodicMemory, taskId: string
): Promise<PerformanceMetrics> {
  const events = await episodic.queryEvents({ taskId });
  return aggregateMetrics(events);
}
```

### 4.4 AnalyticsReport（分析报告）

```typescript
interface AnalyticsReport {
  /** 时间范围 */
  period: { start: string; end: string };

  /** 任务总数 */
  totalTasks: number;

  /** 成功率 */
  successRate: number;

  /** 平均执行时间 */
  avgExecutionTime: number;

  /** 资源消耗趋势 */
  resourceTrend: TrendData[];

  /** 优化建议 */
  optimizationSuggestions: string[];

  /** 异常预警 */
  warnings: string[];
}
```

---

## 5. 数据流图

IntelligenceEngine 核心数据流：

```
任务创建 → 决策引擎 → 推荐引擎 → 执行 → MemoryManager → AnalyticsEngine
    │          │          │                        │              │
    │          │          │                        │              │
    └──任务上下文─┴─依赖图(DM)──┴─性能数据(EM)──┴─执行记录─────┴─分析报告

说明:
- 决策引擎: 输入任务上下文 + 资源监控(IE-09) → 输出决策建议
- 推荐引擎: 输入依赖图(DependencyManager) + 性能数据(EpisodicMemory) → 输出策略推荐
- AnalyticsEngine: 输入 MemoryManager.getStats() → 输出分析报告
```

---

## 6. 架构设计

### 6.1 模块位置

```
src/core/intelligence/
├── types.ts              # 类型定义
├── intelligence-engine.ts # 主引擎
├── decision-engine.ts    # 决策引擎
├── recommendation-engine.ts # 推荐引擎
├── analytics-engine.ts   # 分析引擎
├── knowledge-integration.ts # 知识整合
└── index.ts              # 模块入口
```

### 6.2 与 SessionTaskManager 集成

```typescript
class SessionTaskManager {
  private intelligenceEngine: IntelligenceEngine;

  async planExecution(tasks: TaskConfig[]): Promise<Recommendation> {
    return this.intelligenceEngine.recommendStrategy(tasks);
  }

  async getDecision(taskId: string): Promise<Decision> {
    return this.intelligenceEngine.getDecision(taskId);
  }
}
```

### 6.3 与 DependencyManager 协同

RecommendationEngine 通过构造函数注入 DependencyManager，利用依赖图数据进行并行化推荐：

```typescript
class RecommendationEngine {
  constructor(
    private dependencyManager: DependencyManager,
    private memoryManager: MemoryManager,
  ) {}

  async recommendStrategy(tasks: TaskConfig[]): Promise<Recommendation> {
    // 从 DependencyManager 获取依赖图
    const depGraph = this.dependencyManager.getDependencyGraph(tasks);
    // 拓扑分析，识别可并行分组
    const groups = depGraph.parallelizableGroups();
    // 从 MemoryManager.EpisodicMemory 提取历史性能
    const metrics = await this.memoryManager.episodic.queryPerformance(tasks);
    // 基于分组 + 历史数据生成推荐
    return this.generateRecommendation(groups, metrics);
  }
}
```

---

## 7. 测试策略

| 模块 | 用例数 | 覆盖内容 |
|------|--------|----------|
| DecisionEngine | 12 | 决策生成、置信度计算、备选方案 |
| RecommendationEngine | 15 | 策略推荐、时间预估、资源预估 |
| AnalyticsEngine | 10 | 数据分析、报告生成、预警 |
| IntelligenceEngine | 20 | 整合测试、集成测试 |

**总计**: 57 个测试

---

## 8. 实现路线图

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0 | DecisionEngine（规则表） + RecommendationEngine（sequential/parallel/hybrid） + knowledge-integration.ts | 无 |
| P1 | AnalyticsEngine + 资源监控（IE-09） + 性能预测 | MemoryManager.getStats() |
| P2 | ML 决策引擎 + adaptive 策略 + 自学习机制 | P0/P1 数据积累 |

---

*创建日期: 2026-04-19*
*修订日期: 2026-04-19（v1.1.0 评审修订）*