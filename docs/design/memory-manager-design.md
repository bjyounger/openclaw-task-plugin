# MemoryManager 详细设计方案

> **设计时间**: 2026-04-19  
> **设计者**: 专家团队（架构、存储、算法、测试）  
> **版本**: v1.0  
> **状态**: 设计完成

---

## 目录

1. [架构设计](#1-架构设计)
2. [数据模型](#2-数据模型)
3. [存储策略](#3-存储策略)
4. [知识提炼算法](#4-知识提炼算法)
5. [访问追踪机制](#5-访问追踪机制)
6. [集成方案](#6-集成方案)
7. [测试策略](#7-测试策略)
8. [实施计划](#8-实施计划)

---

## 1. 架构设计

### 1.1 核心定位

**MemoryManager** 是任务插件 v3.0 的记忆核心，负责：

1. **任务摘要生成** - 从任务执行过程中提取关键信息
2. **情境记忆存储** - 高效存储和检索短期记忆
3. **知识提炼** - 将经验转化为可复用的知识
4. **访问追踪** - 追踪记忆使用频率，支持知识提升

### 1.2 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
│              SessionTaskManager / Plugin Entry                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MemoryManager (Core)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Coordinator Layer                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │   Config    │  │   Logger    │  │   Event Emitter     │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Processing Layer                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │ │
│  │  │ TaskSummary     │  │ Knowledge       │                  │ │
│  │  │ Generator       │  │ Refinement      │                  │ │
│  │  └─────────────────┘  └─────────────────┘                  │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │ │
│  │  │ Access Tracker  │  │ Pattern         │                  │ │
│  │  │                 │  │ Detector        │                  │ │
│  │  └─────────────────┘  └─────────────────┘                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Storage Layer                            │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │ │
│  │  │ Episodic Memory │  │ Knowledge Base  │                  │ │
│  │  │ Storage         │  │ Manager         │                  │ │
│  │  └─────────────────┘  └─────────────────┘                  │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │ │
│  │  │ Index Manager   │  │ Access Log      │                  │ │
│  │  │                 │  │ Manager         │                  │ │
│  │  └─────────────────┘  └─────────────────┘                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Infrastructure Layer                        │
│          File System / JSON Storage / Cache Layer               │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| **TaskSummaryGenerator** | 从任务执行数据生成结构化摘要 | 无 |
| **EpisodicMemoryStorage** | 存储和检索情境记忆（短期） | IndexManager |
| **KnowledgeRefinement** | 从情境记忆提炼知识（长期） | PatternDetector |
| **AccessTracker** | 追踪记忆访问，统计使用频率 | AccessLogManager |
| **PatternDetector** | 检测任务执行模式 | 无 |
| **IndexManager** | 管理多维度索引 | 无 |
| **AccessLogManager** | 管理访问日志 | 无 |

### 1.4 设计原则

| 原则 | 说明 | 实现 |
|------|------|------|
| **分层架构** | 协调层、处理层、存储层分离 | 依赖注入、接口隔离 |
| **单一职责** | 每个模块只负责一个核心功能 | 模块化设计 |
| **性能优先** | 满足 <50ms 保存、<100ms 检索 | 索引优化、缓存策略 |
| **可扩展性** | 支持未来存储后端替换 | 抽象存储接口 |
| **类型安全** | 完整的 TypeScript 类型定义 | 严格类型检查 |

---

## 2. 数据模型

### 2.1 核心类型定义

```typescript
// ==================== 记忆类型 ====================

/**
 * 记忆类型枚举
 */
export enum MemoryType {
  /** 情境记忆 - 短期，具体任务细节 */
  EPISODIC = 'episodic',
  /** 语义记忆 - 长期，抽象知识 */
  SEMANTIC = 'semantic',
  /** 程序记忆 - 技能、流程 */
  PROCEDURAL = 'procedural',
}

/**
 * 记忆优先级
 */
export enum MemoryPriority {
  /** 高优先级 - 关键决策、重大错误 */
  HIGH = 'high',
  /** 普通优先级 - 常规任务 */
  NORMAL = 'normal',
  /** 低优先级 - 临时信息 */
  LOW = 'low',
}

/**
 * 知识来源
 */
export enum KnowledgeSource {
  /** 从任务成功提取 */
  TASK_SUCCESS = 'task_success',
  /** 从任务失败学习 */
  TASK_FAILURE = 'task_failure',
  /** 从用户纠正学习 */
  USER_CORRECTION = 'user_correction',
  /** 从模式识别提取 */
  PATTERN_DETECTED = 'pattern_detected',
  /** 从外部导入 */
  IMPORTED = 'imported',
}
```

### 2.2 情境记忆模型 (EpisodicMemory)

```typescript
/**
 * 情境记忆 - 完整的任务执行记录
 */
export interface EpisodicMemory {
  // ==================== 基础信息 ====================
  
  /** 唯一标识符 */
  id: string;
  
  /** 记忆类型 */
  type: MemoryType.EPISODIC;
  
  /** 关联的 Flow ID */
  flowId: string;
  
  /** 会话标识 */
  sessionKey: string;
  
  /** 创建时间戳 */
  createdAt: number;
  
  /** 最后更新时间 */
  updatedAt: number;
  
  // ==================== 任务信息 ====================
  
  /** 任务目标 */
  goal: string;
  
  /** 任务状态 */
  status: TaskStatus;
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime?: number;
  
  /** 执行时长（毫秒） */
  duration?: number;
  
  // ==================== 执行细节 ====================
  
  /** 任务摘要 */
  summary: TaskSummary;
  
  /** 工具调用记录 */
  toolCalls: ToolCallRecord[];
  
  /** 决策记录 */
  decisions: DecisionRecord[];
  
  /** 子任务记录 */
  subtasks: SubtaskRecord[];
  
  // ==================== 结果信息 ====================
  
  /** 任务结果 */
  result?: unknown;
  
  /** 错误信息 */
  error?: ErrorRecord;
  
  /** 经验教训 */
  lessons: LessonRecord[];
  
  // ==================== 元数据 ====================
  
  /** 标签 */
  tags: string[];
  
  /** 优先级 */
  priority: MemoryPriority;
  
  /** 访问次数 */
  accessCount: number;
  
  /** 最后访问时间 */
  lastAccessedAt?: number;
  
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务摘要
 */
export interface TaskSummary {
  /** 摘要标题 */
  title: string;
  
  /** 摘要描述（2-3句话） */
  description: string;
  
  /** 关键成果 */
  keyResults: string[];
  
  /** 关键挑战 */
  keyChallenges: string[];
  
  /** 解决方案 */
  solutions: string[];
  
  /** 影响因素 */
  factors: {
    /** 促进因素 */
    enablers: string[];
    /** 阻碍因素 */
    blockers: string[];
  };
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  /** 调用ID */
  id: string;
  
  /** 工具名称 */
  tool: string;
  
  /** 调用参数摘要 */
  paramsSummary: string;
  
  /** 结果摘要 */
  resultSummary: string;
  
  /** 调用时间 */
  timestamp: number;
  
  /** 执行时长 */
  duration: number;
  
  /** 是否成功 */
  success: boolean;
  
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 决策记录
 */
export interface DecisionRecord {
  /** 决策ID */
  id: string;
  
  /** 决策描述 */
  description: string;
  
  /** 决策上下文 */
  context: string;
  
  /** 可选方案 */
  options: string[];
  
  /** 选择的方案 */
  chosen: string;
  
  /** 决策理由 */
  reasoning: string;
  
  /** 决策时间 */
  timestamp: number;
  
  /** 决策结果评估 */
  outcome: 'positive' | 'neutral' | 'negative' | 'unknown';
}

/**
 * 子任务记录
 */
export interface SubtaskRecord {
  /** 子任务ID */
  taskId: string;
  
  /** 子任务标题 */
  title: string;
  
  /** 子任务状态 */
  status: TaskStatus;
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime?: number;
  
  /** 执行时长 */
  duration?: number;
  
  /** 结果摘要 */
  resultSummary?: string;
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  /** 错误类型 */
  type: string;
  
  /** 错误消息 */
  message: string;
  
  /** 错误堆栈 */
  stack?: string;
  
  /** 发生时间 */
  timestamp: number;
  
  /** 根因分析 */
  rootCause?: string;
  
  /** 解决方案 */
  resolution?: string;
  
  /** 是否可重试 */
  retryable: boolean;
}

/**
 * 经验教训记录
 */
export interface LessonRecord {
  /** 教训ID */
  id: string;
  
  /** 教训类型 */
  type: 'success' | 'failure' | 'optimization' | 'best_practice';
  
  /** 教训描述 */
  description: string;
  
  /** 相关背景 */
  context?: string;
  
  /** 应用场景 */
  applicability: string[];
  
  /** 提取时间 */
  timestamp: number;
}
```

### 2.3 语义记忆模型 (SemanticMemory)

```typescript
/**
 * 语义记忆 - 提炼后的知识
 */
export interface SemanticMemory {
  // ==================== 基础信息 ====================
  
  /** 唯一标识符 */
  id: string;
  
  /** 记忆类型 */
  type: MemoryType.SEMANTIC;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后更新时间 */
  updatedAt: number;
  
  // ==================== 知识内容 ====================
  
  /** 知识标题 */
  title: string;
  
  /** 知识描述 */
  description: string;
  
  /** 知识类别 */
  category: KnowledgeCategory;
  
  /** 知识来源 */
  source: KnowledgeSource;
  
  /** 来源记忆ID列表 */
  sourceMemoryIds: string[];
  
  // ==================== 知识内容 ====================
  
  /** 知识内容 */
  content: KnowledgeContent;
  
  /** 置信度 (0-1) */
  confidence: number;
  
  /** 验证次数 */
  validationCount: number;
  
  /** 成功应用次数 */
  applicationCount: number;
  
  // ==================== 应用信息 ====================
  
  /** 适用场景 */
  applicableScenarios: string[];
  
  /** 前置条件 */
  preconditions: string[];
  
  /** 注意事项 */
  caveats: string[];
  
  /** 相关知识ID */
  relatedKnowledgeIds: string[];
  
  // ==================== 元数据 ====================
  
  /** 标签 */
  tags: string[];
  
  /** 访问次数 */
  accessCount: number;
  
  /** 最后访问时间 */
  lastAccessedAt?: number;
  
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 知识类别
 */
export enum KnowledgeCategory {
  /** 最佳实践 */
  BEST_PRACTICE = 'best_practice',
  /** 故障排查 */
  TROUBLESHOOTING = 'troubleshooting',
  /** 性能优化 */
  PERFORMANCE = 'performance',
  /** 安全规范 */
  SECURITY = 'security',
  /** 架构模式 */
  ARCHITECTURE = 'architecture',
  /** 工作流程 */
  WORKFLOW = 'workflow',
  /** 工具使用 */
  TOOL_USAGE = 'tool_usage',
  /** 领域知识 */
  DOMAIN = 'domain',
}

/**
 * 知识内容
 */
export interface KnowledgeContent {
  /** 问题/场景描述 */
  problem?: string;
  
  /** 解决方案 */
  solution: string;
  
  /** 代码示例 */
  codeExamples?: CodeExample[];
  
  /** 参考链接 */
  references?: string[];
  
  /** 详细步骤 */
  steps?: string[];
}

/**
 * 代码示例
 */
export interface CodeExample {
  /** 语言 */
  language: string;
  
  /** 代码内容 */
  code: string;
  
  /** 说明 */
  description?: string;
}
```

### 2.4 访问日志模型

```typescript
/**
 * 访问日志
 */
export interface AccessLog {
  /** 日志ID */
  id: string;
  
  /** 记忆ID */
  memoryId: string;
  
  /** 记忆类型 */
  memoryType: MemoryType;
  
  /** 访问类型 */
  accessType: 'read' | 'search' | 'update' | 'delete';
  
  /** 访问时间 */
  timestamp: number;
  
  /** 访问上下文 */
  context?: {
    /** 查询关键词 */
    query?: string;
    /** 关联任务ID */
    flowId?: string;
    /** 访问来源 */
    source?: string;
  };
}

/**
 * 访问统计
 */
export interface AccessStatistics {
  /** 记忆ID */
  memoryId: string;
  
  /** 总访问次数 */
  totalAccessCount: number;
  
  /** 读取次数 */
  readCount: number;
  
  /** 搜索命中次数 */
  searchHitCount: number;
  
  /** 最近7天访问次数 */
  recent7DaysCount: number;
  
  /** 最近30天访问次数 */
  recent30DaysCount: number;
  
  /** 首次访问时间 */
  firstAccessedAt: number;
  
  /** 最后访问时间 */
  lastAccessedAt: number;
  
  /** 访问频率趋势 */
  accessTrend: 'increasing' | 'stable' | 'decreasing';
}
```

### 2.5 索引模型

```typescript
/**
 * 记忆索引
 */
export interface MemoryIndex {
  // 时间索引
  byTime: TimeIndex;
  
  // 会话索引
  bySession: Map<string, string[]>;
  
  // 标签索引
  byTag: Map<string, string[]>;
  
  // 状态索引
  byStatus: Map<TaskStatus, string[]>;
  
  // 全文搜索索引
  fullText: FullTextIndex;
}

/**
 * 时间索引
 */
export interface TimeIndex {
  /** 按日期分组的记忆ID */
  byDate: Map<string, string[]>;
  
  /** 按小时分组的记忆ID */
  byHour: Map<string, string[]>;
  
  /** 最早时间 */
  earliest: number;
  
  /** 最晚时间 */
  latest: number;
}

/**
 * 全文索引
 */
export interface FullTextIndex {
  /** 关键词到记忆ID的映射 */
  keywordToIds: Map<string, string[]>;
  
  /** 最后更新时间 */
  lastUpdated: number;
}
```

---

## 3. 存储策略

### 3.1 存储架构

```
data/
├── memories/
│   ├── episodic/
│   │   ├── 2026-04/
│   │   │   ├── 2026-04-19.jsonl     # 按日期存储
│   │   │   ├── 2026-04-18.jsonl
│   │   │   └── ...
│   │   └── index.json              # 情境记忆索引
│   │
│   └── semantic/
│       ├── best_practice.jsonl      # 按类别存储
│       ├── troubleshooting.jsonl
│       ├── performance.jsonl
│       └── index.json              # 语义记忆索引
│
├── access/
│   ├── 2026-04-19.jsonl            # 按日期存储访问日志
│   └── statistics.json             # 访问统计
│
├── knowledge/
│   ├── pending.jsonl               # 待提炼的记忆
│   └── refined.jsonl               # 已提炼的知识
│
└── config/
    └── memory-config.json          # 配置文件
```

### 3.2 存储接口

```typescript
/**
 * 存储接口
 */
export interface IStorage {
  /**
   * 保存记录
   */
  save<T>(record: T): Promise<void>;
  
  /**
   * 批量保存
   */
  saveBatch<T>(records: T[]): Promise<void>;
  
  /**
   * 根据ID查询
   */
  findById<T>(id: string): Promise<T | undefined>;
  
  /**
   * 根据条件查询
   */
  query<T>(filter: QueryFilter): Promise<T[]>;
  
  /**
   * 更新记录
   */
  update<T>(id: string, updates: Partial<T>): Promise<void>;
  
  /**
   * 删除记录
   */
  delete(id: string): Promise<void>;
  
  /**
   * 批量删除
   */
  deleteBatch(ids: string[]): Promise<void>;
}

/**
 * 查询过滤器
 */
export interface QueryFilter {
  /** ID列表 */
  ids?: string[];
  
  /** 时间范围 */
  timeRange?: {
    start: number;
    end: number;
  };
  
  /** 标签 */
  tags?: string[];
  
  /** 状态 */
  status?: TaskStatus[];
  
  /** 全文搜索 */
  fullText?: string;
  
  /** 限制数量 */
  limit?: number;
  
  /** 排序 */
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}
```

### 3.3 EpisodicMemoryStorage 实现

```typescript
/**
 * 情境记忆存储
 */
export class EpisodicMemoryStorage implements IStorage {
  private config: StorageConfig;
  private index: MemoryIndex;
  private cache: LRUCache<string, EpisodicMemory>;
  private writeBuffer: EpisodicMemory[];
  private flushTimer?: ReturnType<typeof setInterval>;
  
  constructor(config: StorageConfig) {
    this.config = {
      dataDir: './data/memories/episodic',
      cacheSize: 100,
      flushIntervalMs: 5000,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      ...config,
    };
    
    this.cache = new LRUCache(this.config.cacheSize);
    this.writeBuffer = [];
    this.index = this.loadIndex();
    
    this.startFlushTimer();
  }
  
  // ==================== 保存操作 ====================
  
  /**
   * 保存情境记忆
   * 目标：<50ms
   */
  async save(memory: EpisodicMemory): Promise<void> {
    const startTime = Date.now();
    
    // 1. 更新缓存
    this.cache.set(memory.id, memory);
    
    // 2. 加入写缓冲区
    this.writeBuffer.push(memory);
    
    // 3. 更新索引
    this.updateIndex(memory);
    
    const duration = Date.now() - startTime;
    if (duration > 50) {
      console.warn(`Memory save took ${duration}ms (target: <50ms)`);
    }
  }
  
  /**
   * 批量保存
   */
  async saveBatch(memories: EpisodicMemory[]): Promise<void> {
    for (const memory of memories) {
      await this.save(memory);
    }
  }
  
  /**
   * 刷新缓冲区到磁盘
   */
  async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;
    
    // 按日期分组
    const grouped = this.groupByDate(this.writeBuffer);
    
    // 写入文件
    for (const [date, memories] of grouped) {
      await this.appendToFile(date, memories);
    }
    
    // 清空缓冲区
    this.writeBuffer = [];
    
    // 保存索引
    await this.saveIndex();
  }
  
  // ==================== 查询操作 ====================
  
  /**
   * 根据ID查询
   * 目标：<100ms
   */
  async findById(id: string): Promise<EpisodicMemory | undefined> {
    const startTime = Date.now();
    
    // 1. 检查缓存
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }
    
    // 2. 从索引查找位置
    const location = this.findInIndex(id);
    if (!location) {
      return undefined;
    }
    
    // 3. 从文件读取
    const memory = await this.readFromFile(location.file, location.offset);
    
    // 4. 更新缓存
    if (memory) {
      this.cache.set(id, memory);
    }
    
    const duration = Date.now() - startTime;
    if (duration > 100) {
      console.warn(`Memory findById took ${duration}ms (target: <100ms)`);
    }
    
    return memory;
  }
  
  /**
   * 根据条件查询
   */
  async query(filter: QueryFilter): Promise<EpisodicMemory[]> {
    // 1. 使用索引缩小范围
    const candidateIds = this.queryIndex(filter);
    
    // 2. 加载候选记忆
    const memories: EpisodicMemory[] = [];
    for (const id of candidateIds) {
      const memory = await this.findById(id);
      if (memory && this.matchesFilter(memory, filter)) {
        memories.push(memory);
      }
    }
    
    // 3. 排序
    if (filter.orderBy) {
      memories.sort((a, b) => this.compare(a, b, filter.orderBy!));
    }
    
    // 4. 限制数量
    if (filter.limit && memories.length > filter.limit) {
      return memories.slice(0, filter.limit);
    }
    
    return memories;
  }
  
  // ==================== 索引管理 ====================
  
  /**
   * 更新索引
   */
  private updateIndex(memory: EpisodicMemory): void {
    const id = memory.id;
    
    // 更新时间索引
    const date = this.formatDate(memory.createdAt);
    const hour = this.formatHour(memory.createdAt);
    
    if (!this.index.byTime.byDate.has(date)) {
      this.index.byTime.byDate.set(date, []);
    }
    this.index.byTime.byDate.get(date)!.push(id);
    
    if (!this.index.byTime.byHour.has(hour)) {
      this.index.byTime.byHour.set(hour, []);
    }
    this.index.byTime.byHour.get(hour)!.push(id);
    
    // 更新会话索引
    if (!this.index.bySession.has(memory.sessionKey)) {
      this.index.bySession.set(memory.sessionKey, []);
    }
    this.index.bySession.get(memory.sessionKey)!.push(id);
    
    // 更新标签索引
    for (const tag of memory.tags) {
      if (!this.index.byTag.has(tag)) {
        this.index.byTag.set(tag, []);
      }
      this.index.byTag.get(tag)!.push(id);
    }
    
    // 更新状态索引
    if (!this.index.byStatus.has(memory.status)) {
      this.index.byStatus.set(memory.status, []);
    }
    this.index.byStatus.get(memory.status)!.push(id);
    
    // 更新全文索引
    this.updateFullTextIndex(memory);
  }
  
  /**
   * 更新全文索引
   */
  private updateFullTextIndex(memory: EpisodicMemory): void {
    // 提取关键词
    const keywords = this.extractKeywords(memory);
    
    // 更新索引
    for (const keyword of keywords) {
      if (!this.index.fullText.keywordToIds.has(keyword)) {
        this.index.fullText.keywordToIds.set(keyword, []);
      }
      this.index.fullText.keywordToIds.get(keyword)!.push(memory.id);
    }
  }
  
  /**
   * 提取关键词
   */
  private extractKeywords(memory: EpisodicMemory): string[] {
    const text = [
      memory.goal,
      memory.summary.title,
      memory.summary.description,
      ...memory.summary.keyResults,
      ...memory.tags,
    ].join(' ');
    
    // 简单的关键词提取（实际可使用更复杂的NLP）
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were']);
    
    return words
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 50); // 限制关键词数量
  }
  
  // ==================== 辅助方法 ====================
  
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('Failed to flush memory buffer:', err);
      });
    }, this.config.flushIntervalMs);
  }
  
  private groupByDate(memories: EpisodicMemory[]): Map<string, EpisodicMemory[]> {
    const grouped = new Map<string, EpisodicMemory[]>();
    
    for (const memory of memories) {
      const date = this.formatDate(memory.createdAt);
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(memory);
    }
    
    return grouped;
  }
  
  private async appendToFile(date: string, memories: EpisodicMemory[]): Promise<void> {
    const filePath = path.join(this.config.dataDir, `${date}.jsonl`);
    
    // 追加写入
    const lines = memories.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.appendFile(filePath, lines, 'utf-8');
  }
  
  private formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
  }
  
  private formatHour(timestamp: number): string {
    const date = new Date(timestamp);
    return `${this.formatDate(timestamp)}-${date.getHours().toString().padStart(2, '0')}`;
  }
  
  // ... 其他辅助方法
}
```

### 3.4 存储优化策略

| 优化策略 | 说明 | 预期效果 |
|----------|------|----------|
| **写缓冲** | 批量写入，减少IO操作 | 保存延迟 < 50ms |
| **LRU缓存** | 缓存热点数据 | 检索延迟 < 100ms |
| **索引优化** | 多维度索引，快速定位 | 查询性能提升 10x |
| **文件分割** | 按日期分割，避免大文件 | 单文件 < 10MB |
| **异步刷新** | 后台异步刷新缓冲区 | 不阻塞主流程 |

---

## 4. 知识提炼算法

### 4.1 提炼流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Refinement Pipeline                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  触发器检测   │   │  模式识别     │   │  质量评估     │
│  - 时间触发   │   │  - 相似度分析 │   │  - 置信度计算 │
│  - 事件触发   │   │  - 聚类分析   │   │  - 验证检查   │
│  - 阈值触发   │   │  - 序列挖掘   │   │  - 冲突检测   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Extraction                         │
│  - 摘要提取                                                      │
│  - 规则提取                                                      │
│  - 关联提取                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Validation                         │
│  - 交叉验证                                                      │
│  - 一致性检查                                                    │
│  - 用户确认（可选）                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Storage                            │
│  - 存储到 SemanticMemory                                         │
│  - 更新索引                                                      │
│  - 建立关联                                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 提炼触发器

```typescript
/**
 * 知识提炼触发器
 */
export interface RefinementTrigger {
  /** 触发类型 */
  type: 'time' | 'event' | 'threshold';
  
  /** 触发条件 */
  condition: RefinementCondition;
  
  /** 是否满足 */
  check(): boolean;
}

/**
 * 时间触发器
 */
export class TimeTrigger implements RefinementTrigger {
  type: 'time' = 'time';
  condition: { intervalMs: number };
  private lastTriggered: number = 0;
  
  constructor(intervalMs: number) {
    this.condition = { intervalMs };
  }
  
  check(): boolean {
    const now = Date.now();
    if (now - this.lastTriggered >= this.condition.intervalMs) {
      this.lastTriggered = now;
      return true;
    }
    return false;
  }
}

/**
 * 事件触发器
 */
export class EventTrigger implements RefinementTrigger {
  type: 'event' = 'event';
  condition: { eventType: string; count: number };
  private eventCount: number = 0;
  
  constructor(eventType: string, count: number) {
    this.condition = { eventType, count };
  }
  
  recordEvent(): void {
    this.eventCount++;
  }
  
  check(): boolean {
    if (this.eventCount >= this.condition.count) {
      this.eventCount = 0;
      return true;
    }
    return false;
  }
}

/**
 * 阈值触发器
 */
export class ThresholdTrigger implements RefinementTrigger {
  type: 'threshold' = 'threshold';
  condition: { metric: string; threshold: number };
  
  constructor(metric: string, threshold: number) {
    this.condition = { metric, threshold };
  }
  
  check(): boolean {
    // 检查指标是否达到阈值
    const value = this.getMetricValue();
    return value >= this.condition.threshold;
  }
  
  private getMetricValue(): number {
    // 实现获取指标值的逻辑
    return 0;
  }
}
```

### 4.3 知识提取器

```typescript
/**
 * 知识提取器
 */
export class KnowledgeExtractor {
  /**
   * 从情境记忆提取知识
   */
  extract(memories: EpisodicMemory[]): ExtractedKnowledge[] {
    const extracted: ExtractedKnowledge[] = [];
    
    // 1. 提取成功模式
    const successPatterns = this.extractSuccessPatterns(memories);
    extracted.push(...successPatterns);
    
    // 2. 提取失败教训
    const failureLessons = this.extractFailureLessons(memories);
    extracted.push(...failureLessons);
    
    // 3. 提取最佳实践
    const bestPractices = this.extractBestPractices(memories);
    extracted.push(...bestPractices);
    
    return extracted;
  }
  
  /**
   * 提取成功模式
   */
  private extractSuccessPatterns(memories: EpisodicMemory[]): ExtractedKnowledge[] {
    // 筛选成功的记忆
    const successMemories = memories.filter(m => m.status === 'succeeded');
    
    // 聚类相似的成功案例
    const clusters = this.clusterMemories(successMemories);
    
    // 从每个聚类提取共同模式
    const patterns: ExtractedKnowledge[] = [];
    
    for (const cluster of clusters) {
      if (cluster.length < 2) continue; // 至少需要2个相似案例
      
      const pattern = this.extractCommonPattern(cluster);
      if (pattern) {
        patterns.push({
          type: 'success_pattern',
          title: pattern.title,
          description: pattern.description,
          confidence: this.calculateConfidence(cluster),
          sourceMemoryIds: cluster.map(m => m.id),
          content: pattern.content,
        });
      }
    }
    
    return patterns;
  }
  
  /**
   * 提取失败教训
   */
  private extractFailureLessons(memories: EpisodicMemory[]): ExtractedKnowledge[] {
    // 筛选失败的记忆
    const failureMemories = memories.filter(m => m.status === 'failed');
    
    const lessons: ExtractedKnowledge[] = [];
    
    for (const memory of failureMemories) {
      if (!memory.error || !memory.lessons.length) continue;
      
      // 提取关键教训
      for (const lesson of memory.lessons) {
        lessons.push({
          type: 'failure_lesson',
          title: `避免: ${lesson.description}`,
          description: lesson.context || '',
          confidence: 0.8, // 失败教训初始置信度
          sourceMemoryIds: [memory.id],
          content: {
            problem: lesson.description,
            solution: lesson.context || '',
            caveats: lesson.applicability,
          },
        });
      }
    }
    
    return lessons;
  }
  
  /**
   * 提取最佳实践
   */
  private extractBestPractices(memories: EpisodicMemory[]): ExtractedKnowledge[] {
    // 找出高质量的决策
    const highQualityDecisions = memories
      .flatMap(m => m.decisions.filter(d => d.outcome === 'positive'))
      .filter(d => d.reasoning);
    
    // 聚类相似决策
    const clusters = this.clusterDecisions(highQualityDecisions);
    
    const practices: ExtractedKnowledge[] = [];
    
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      
      const practice = this.extractCommonDecision(cluster);
      if (practice) {
        practices.push({
          type: 'best_practice',
          title: practice.title,
          description: practice.description,
          confidence: this.calculateConfidence(cluster),
          sourceMemoryIds: cluster.map(d => d.memoryId),
          content: practice.content,
        });
      }
    }
    
    return practices;
  }
  
  /**
   * 聚类相似记忆
   */
  private clusterMemories(memories: EpisodicMemory[]): EpisodicMemory[][] {
    // 简单的相似度聚类（实际可使用更复杂的算法）
    const clusters: EpisodicMemory[][] = [];
    const used = new Set<string>();
    
    for (const memory of memories) {
      if (used.has(memory.id)) continue;
      
      const cluster: EpisodicMemory[] = [memory];
      used.add(memory.id);
      
      for (const other of memories) {
        if (used.has(other.id)) continue;
        
        const similarity = this.calculateSimilarity(memory, other);
        if (similarity > 0.7) { // 相似度阈值
          cluster.push(other);
          used.add(other.id);
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }
  
  /**
   * 计算记忆相似度
   */
  private calculateSimilarity(a: EpisodicMemory, b: EpisodicMemory): number {
    // 基于多个维度计算相似度
    const weights = {
      goal: 0.3,
      tags: 0.2,
      tools: 0.2,
      result: 0.3,
    };
    
    const goalSimilarity = this.textSimilarity(a.goal, b.goal);
    const tagSimilarity = this.setTagSimilarity(a.tags, b.tags);
    const toolSimilarity = this.setSimilarity(
      a.toolCalls.map(t => t.tool),
      b.toolCalls.map(t => t.tool)
    );
    const resultSimilarity = a.status === b.status ? 1 : 0;
    
    return (
      weights.goal * goalSimilarity +
      weights.tags * tagSimilarity +
      weights.tools * toolSimilarity +
      weights.result * resultSimilarity
    );
  }
  
  /**
   * 文本相似度（简单的词袋模型）
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }
  
  /**
   * 集合相似度
   */
  private setSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
  
  /**
   * 标签集合相似度（带权重）
   */
  private setTagSimilarity(a: string[], b: string[]): number {
    return this.setSimilarity(a, b);
  }
  
  /**
   * 计算置信度
   */
  private calculateConfidence(cluster: { id?: string; memoryId?: string }[]): number {
    // 基于聚类大小计算置信度
    // 大小越大，置信度越高
    const baseConfidence = 0.6;
    const bonus = Math.min(cluster.length * 0.05, 0.3); // 最多加 0.3
    
    return Math.min(baseConfidence + bonus, 0.95);
  }
  
  /**
   * 提取共同模式
   */
  private extractCommonPattern(cluster: EpisodicMemory[]): {
    title: string;
    description: string;
    content: KnowledgeContent;
  } | null {
    if (cluster.length === 0) return null;
    
    // 找出共同的关键词
    const commonKeywords = this.findCommonKeywords(cluster.map(m => m.goal));
    
    // 找出共同的工具
    const commonTools = this.findCommonTools(cluster);
    
    // 找出共同的决策模式
    const commonDecisions = this.findCommonDecisions(cluster);
    
    return {
      title: `成功模式: ${commonKeywords.slice(0, 3).join(', ')}`,
      description: `基于 ${cluster.length} 个成功案例提取的共同模式`,
      content: {
        problem: commonKeywords.join(', '),
        solution: [
          `使用工具: ${commonTools.join(', ')}`,
          ...commonDecisions,
        ].join('\n'),
        steps: commonDecisions,
      },
    };
  }
  
  /**
   * 找出共同关键词
   */
  private findCommonKeywords(texts: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const text of texts) {
      const words = new Set(text.toLowerCase().split(/\s+/));
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    // 出现在大多数文本中的词
    const threshold = texts.length * 0.5;
    return [...wordCounts.entries()]
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .filter(w => w.length > 2)
      .slice(0, 10);
  }
  
  /**
   * 找出共同工具
   */
  private findCommonTools(memories: EpisodicMemory[]): string[] {
    const toolCounts = new Map<string, number>();
    
    for (const memory of memories) {
      const tools = new Set(memory.toolCalls.map(t => t.tool));
      for (const tool of tools) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }
    }
    
    const threshold = memories.length * 0.5;
    return [...toolCounts.entries()]
      .filter(([_, count]) => count >= threshold)
      .map(([tool]) => tool);
  }
  
  /**
   * 找出共同决策
   */
  private findCommonDecisions(memories: EpisodicMemory[]): string[] {
    const decisionCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const decision of memory.decisions) {
        if (decision.outcome === 'positive') {
          const key = `${decision.description}:${decision.chosen}`;
          decisionCounts.set(key, (decisionCounts.get(key) || 0) + 1);
        }
      }
    }
    
    const threshold = memories.length * 0.3;
    return [...decisionCounts.entries()]
      .filter(([_, count]) => count >= threshold)
      .map(([key]) => key.split(':')[1]);
  }
  
  // 聚类决策
  private clusterDecisions(decisions: (DecisionRecord & { memoryId: string })[]): (DecisionRecord & { memoryId: string })[][] {
    // 简化实现，实际应使用聚类算法
    return decisions.map(d => [d]);
  }
  
  // 提取共同决策
  private extractCommonDecision(cluster: (DecisionRecord & { memoryId: string })[]): {
    title: string;
    description: string;
    content: KnowledgeContent;
  } | null {
    if (cluster.length === 0) return null;
    
    const first = cluster[0];
    return {
      title: `最佳实践: ${first.description}`,
      description: `基于 ${cluster.length} 个成功决策`,
      content: {
        problem: first.context,
        solution: first.chosen,
        steps: [first.reasoning],
      },
    };
  }
}

/**
 * 提取的知识
 */
export interface ExtractedKnowledge {
  type: 'success_pattern' | 'failure_lesson' | 'best_practice';
  title: string;
  description: string;
  confidence: number;
  sourceMemoryIds: string[];
  content: KnowledgeContent;
}
```

### 4.4 置信度计算

```typescript
/**
 * 置信度计算器
 */
export class ConfidenceCalculator {
  /**
   * 计算知识置信度
   * 
   * 公式: confidence = base_confidence * validation_factor * application_factor * time_decay
   */
  calculate(knowledge: SemanticMemory, context: ConfidenceContext): number {
    // 1. 基础置信度（来源质量）
    const baseConfidence = this.getBaseConfidence(knowledge.source);
    
    // 2. 验证因子（被验证次数）
    const validationFactor = this.getValidationFactor(knowledge.validationCount);
    
    // 3. 应用因子（成功应用次数）
    const applicationFactor = this.getApplicationFactor(
      knowledge.applicationCount,
      knowledge.validationCount
    );
    
    // 4. 时间衰减（知识可能过时）
    const timeDecay = this.getTimeDecay(knowledge.createdAt);
    
    // 5. 综合置信度
    const confidence = baseConfidence * validationFactor * applicationFactor * timeDecay;
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }
  
  /**
   * 获取基础置信度
   */
  private getBaseConfidence(source: KnowledgeSource): number {
    const baseConfidences: Record<KnowledgeSource, number> = {
      [KnowledgeSource.TASK_SUCCESS]: 0.7,
      [KnowledgeSource.TASK_FAILURE]: 0.8, // 失败教训更可靠
      [KnowledgeSource.USER_CORRECTION]: 0.95, // 用户纠正最可靠
      [KnowledgeSource.PATTERN_DETECTED]: 0.6,
      [KnowledgeSource.IMPORTED]: 0.5,
    };
    
    return baseConfidences[source] || 0.5;
  }
  
  /**
   * 获取验证因子
   */
  private getValidationFactor(count: number): number {
    // 验证越多，置信度越高
    // 使用对数增长，避免过度增长
    return Math.min(1.0, 0.8 + Math.log10(count + 1) * 0.1);
  }
  
  /**
   * 获取应用因子
   */
  private getApplicationFactor(successCount: number, totalCount: number): number {
    if (totalCount === 0) return 1.0;
    
    // 成功率越高，置信度越高
    const successRate = successCount / totalCount;
    return 0.7 + successRate * 0.3;
  }
  
  /**
   * 获取时间衰减
   */
  private getTimeDecay(createdAt: number): number {
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    
    // 知识半衰期：90天
    const halfLife = 90;
    
    // 指数衰减
    return Math.exp(-0.693 * ageDays / halfLife);
  }
}

/**
 * 置信度计算上下文
 */
export interface ConfidenceContext {
  /** 当前时间 */
  now: number;
  
  /** 相关任务上下文 */
  taskContext?: {
    flowId: string;
    goal: string;
  };
}
```

---

## 5. 访问追踪机制

### 5.1 访问追踪架构

```typescript
/**
 * 访问追踪器
 */
export class AccessTracker {
  private config: AccessTrackerConfig;
  private accessLogManager: AccessLogManager;
  private statisticsManager: StatisticsManager;
  private promotionRules: PromotionRule[];
  
  constructor(config: AccessTrackerConfig) {
    this.config = {
      logAccess: true,
      trackStatistics: true,
      promotionThreshold: 3, // 访问3次以上考虑提升
      promotionWindowMs: 7 * 24 * 60 * 60 * 1000, // 7天窗口
      ...config,
    };
    
    this.accessLogManager = new AccessLogManager();
    this.statisticsManager = new StatisticsManager();
    this.promotionRules = this.initializePromotionRules();
  }
  
  /**
   * 记录访问
   */
  async recordAccess(params: {
    memoryId: string;
    memoryType: MemoryType;
    accessType: 'read' | 'search' | 'update';
    context?: {
      query?: string;
      flowId?: string;
      source?: string;
    };
  }): Promise<void> {
    // 1. 记录访问日志
    if (this.config.logAccess) {
      await this.accessLogManager.log({
        id: this.generateId(),
        memoryId: params.memoryId,
        memoryType: params.memoryType,
        accessType: params.accessType,
        timestamp: Date.now(),
        context: params.context,
      });
    }
    
    // 2. 更新统计
    if (this.config.trackStatistics) {
      await this.statisticsManager.recordAccess(params.memoryId, params.accessType);
    }
  }
  
  /**
   * 检查是否需要提升
   */
  async checkPromotion(memoryId: string): Promise<PromotionDecision | null> {
    // 1. 获取统计信息
    const stats = await this.statisticsManager.getStatistics(memoryId);
    
    // 2. 检查提升规则
    for (const rule of this.promotionRules) {
      const decision = rule.check(stats);
      if (decision.shouldPromote) {
        return decision;
      }
    }
    
    return null;
  }
  
  /**
   * 初始化提升规则
   */
  private initializePromotionRules(): PromotionRule[] {
    return [
      // 规则1: 高频访问提升
      new FrequencyPromotionRule({
        threshold: this.config.promotionThreshold!,
        windowMs: this.config.promotionWindowMs!,
      }),
      
      // 规则2: 跨会话复用提升
      new CrossSessionPromotionRule({
        minSessions: 2,
        windowMs: 30 * 24 * 60 * 60 * 1000, // 30天
      }),
      
      // 规则3: 搜索命中率提升
      new SearchHitPromotionRule({
        minHits: 5,
        windowMs: 7 * 24 * 60 * 60 * 1000, // 7天
      }),
    ];
  }
  
  private generateId(): string {
    return `access-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 访问日志管理器
 */
export class AccessLogManager {
  private config: AccessLogConfig;
  private writeBuffer: AccessLog[];
  
  constructor(config?: Partial<AccessLogConfig>) {
    this.config = {
      dataDir: './data/access',
      retentionDays: 90, // 保留90天
      ...config,
    };
    this.writeBuffer = [];
  }
  
  /**
   * 记录访问日志
   */
  async log(log: AccessLog): Promise<void> {
    this.writeBuffer.push(log);
    
    // 缓冲区满时刷新
    if (this.writeBuffer.length >= 100) {
      await this.flush();
    }
  }
  
  /**
   * 刷新到磁盘
   */
  async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;
    
    const grouped = this.groupByDate(this.writeBuffer);
    
    for (const [date, logs] of grouped) {
      const filePath = path.join(this.config.dataDir, `${date}.jsonl`);
      const lines = logs.map(l => JSON.stringify(l)).join('\n') + '\n';
      await fs.appendFile(filePath, lines, 'utf-8');
    }
    
    this.writeBuffer = [];
  }
  
  /**
   * 按日期分组
   */
  private groupByDate(logs: AccessLog[]): Map<string, AccessLog[]> {
    const grouped = new Map<string, AccessLog[]>();
    
    for (const log of logs) {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(log);
    }
    
    return grouped;
  }
}

/**
 * 统计管理器
 */
export class StatisticsManager {
  private statistics: Map<string, AccessStatistics>;
  private filePath: string;
  
  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'statistics.json');
    this.statistics = new Map();
    this.loadStatistics();
  }
  
  /**
   * 记录访问
   */
  async recordAccess(memoryId: string, accessType: string): Promise<void> {
    let stats = this.statistics.get(memoryId);
    
    if (!stats) {
      stats = {
        memoryId,
        totalAccessCount: 0,
        readCount: 0,
        searchHitCount: 0,
        recent7DaysCount: 0,
        recent30DaysCount: 0,
        firstAccessedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessTrend: 'stable',
      };
      this.statistics.set(memoryId, stats);
    }
    
    // 更新计数
    stats.totalAccessCount++;
    stats.lastAccessedAt = Date.now();
    
    if (accessType === 'read') {
      stats.readCount++;
    } else if (accessType === 'search') {
      stats.searchHitCount++;
    }
    
    // 更新趋势
    stats.accessTrend = this.calculateTrend(stats);
  }
  
  /**
   * 获取统计信息
   */
  async getStatistics(memoryId: string): Promise<AccessStatistics | undefined> {
    return this.statistics.get(memoryId);
  }
  
  /**
   * 计算趋势
   */
  private calculateTrend(stats: AccessStatistics): 'increasing' | 'stable' | 'decreasing' {
    // 简化实现：基于最近访问频率判断
    const avgPerDay = stats.totalAccessCount / 
      Math.max(1, (Date.now() - stats.firstAccessedAt) / (24 * 60 * 60 * 1000));
    
    const recentPerDay = stats.recent7DaysCount / 7;
    
    if (recentPerDay > avgPerDay * 1.5) {
      return 'increasing';
    } else if (recentPerDay < avgPerDay * 0.5) {
      return 'decreasing';
    }
    
    return 'stable';
  }
  
  /**
   * 加载统计信息
   */
  private loadStatistics(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        for (const [id, stats] of Object.entries(data)) {
          this.statistics.set(id, stats as AccessStatistics);
        }
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }
  
  /**
   * 保存统计信息
   */
  async save(): Promise<void> {
    const data = Object.fromEntries(this.statistics);
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

### 5.2 提升规则

```typescript
/**
 * 提升规则接口
 */
export interface PromotionRule {
  /** 规则名称 */
  name: string;
  
  /** 检查是否满足提升条件 */
  check(stats: AccessStatistics): PromotionDecision;
}

/**
 * 提升决策
 */
export interface PromotionDecision {
  /** 是否应提升 */
  shouldPromote: boolean;
  
  /** 规则名称 */
  rule: string;
  
  /** 提升原因 */
  reason: string;
  
  /** 提升类型 */
  promotionType: 'episodic_to_semantic' | 'priority_boost';
}

/**
 * 频率提升规则
 */
export class FrequencyPromotionRule implements PromotionRule {
  name = 'frequency_promotion';
  
  constructor(private config: {
    threshold: number;
    windowMs: number;
  }) {}
  
  check(stats: AccessStatistics): PromotionDecision {
    const shouldPromote = stats.recent7DaysCount >= this.config.threshold;
    
    return {
      shouldPromote,
      rule: this.name,
      reason: shouldPromote 
        ? `最近7天访问 ${stats.recent7DaysCount} 次，超过阈值 ${this.config.threshold}`
        : '',
      promotionType: 'episodic_to_semantic',
    };
  }
}

/**
 * 跨会话提升规则
 */
export class CrossSessionPromotionRule implements PromotionRule {
  name = 'cross_session_promotion';
  
  constructor(private config: {
    minSessions: number;
    windowMs: number;
  }) {}
  
  check(stats: AccessStatistics): PromotionDecision {
    // 需要额外的会话统计信息
    // 简化实现
    const shouldPromote = stats.totalAccessCount >= this.config.minSessions;
    
    return {
      shouldPromote,
      rule: this.name,
      reason: shouldPromote
        ? `被多个会话复用，总访问 ${stats.totalAccessCount} 次`
        : '',
      promotionType: 'episodic_to_semantic',
    };
  }
}

/**
 * 搜索命中提升规则
 */
export class SearchHitPromotionRule implements PromotionRule {
  name = 'search_hit_promotion';
  
  constructor(private config: {
    minHits: number;
    windowMs: number;
  }) {}
  
  check(stats: AccessStatistics): PromotionDecision {
    const shouldPromote = stats.searchHitCount >= this.config.minHits;
    
    return {
      shouldPromote,
      rule: this.name,
      reason: shouldPromote
        ? `搜索命中 ${stats.searchHitCount} 次，超过阈值 ${this.config.minHits}`
        : '',
      promotionType: 'priority_boost',
    };
  }
}
```

### 5.3 访问追踪与知识提升流程

```typescript
/**
 * 知识提升处理器
 */
export class KnowledgePromotionProcessor {
  private tracker: AccessTracker;
  private memoryManager: MemoryManager;
  
  constructor(tracker: AccessTracker, memoryManager: MemoryManager) {
    this.tracker = tracker;
    this.memoryManager = memoryManager;
  }
  
  /**
   * 处理知识提升
   */
  async process(): Promise<PromotionResult[]> {
    const results: PromotionResult[] = [];
    
    // 1. 获取所有记忆的统计信息
    const allStats = await this.tracker.getAllStatistics();
    
    // 2. 检查每个记忆是否需要提升
    for (const stats of allStats) {
      const decision = await this.tracker.checkPromotion(stats.memoryId);
      
      if (decision && decision.shouldPromote) {
        const result = await this.executePromotion(stats.memoryId, decision);
        results.push(result);
      }
    }
    
    return results;
  }
  
  /**
   * 执行提升
   */
  private async executePromotion(
    memoryId: string,
    decision: PromotionDecision
  ): Promise<PromotionResult> {
    try {
      if (decision.promotionType === 'episodic_to_semantic') {
        // 从情境记忆提升为语义记忆
        const episodicMemory = await this.memoryManager.getEpisodicMemory(memoryId);
        
        if (episodicMemory) {
          const semanticMemory = await this.memoryManager.promoteToSemantic(episodicMemory);
          
          return {
            success: true,
            memoryId,
            fromType: MemoryType.EPISODIC,
            toType: MemoryType.SEMANTIC,
            reason: decision.reason,
            timestamp: Date.now(),
          };
        }
      } else if (decision.promotionType === 'priority_boost') {
        // 提升优先级
        await this.memoryManager.updatePriority(memoryId, MemoryPriority.HIGH);
        
        return {
          success: true,
          memoryId,
          fromType: MemoryType.EPISODIC,
          toType: MemoryType.EPISODIC,
          reason: decision.reason,
          timestamp: Date.now(),
        };
      }
      
      return {
        success: false,
        memoryId,
        fromType: MemoryType.EPISODIC,
        toType: MemoryType.EPISODIC,
        reason: 'Unknown promotion type',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        memoryId,
        fromType: MemoryType.EPISODIC,
        toType: MemoryType.EPISODIC,
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * 提升结果
 */
export interface PromotionResult {
  success: boolean;
  memoryId: string;
  fromType: MemoryType;
  toType: MemoryType;
  reason: string;
  timestamp: number;
}
```

---

## 6. 集成方案

### 6.1 与 SessionTaskManager 集成

```typescript
/**
 * MemoryManager 集成到 SessionTaskManager
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private summaryGenerator: TaskSummaryGenerator;
  private episodicStorage: EpisodicMemoryStorage;
  private semanticStorage: SemanticMemoryStorage;
  private knowledgeRefinement: KnowledgeRefinement;
  private accessTracker: AccessTracker;
  private promotionProcessor: KnowledgePromotionProcessor;
  
  constructor(config: MemoryManagerConfig) {
    this.config = config;
    
    // 初始化子组件
    this.summaryGenerator = new TaskSummaryGenerator();
    this.episodicStorage = new EpisodicMemoryStorage(config.storage);
    this.semanticStorage = new SemanticMemoryStorage(config.storage);
    this.knowledgeRefinement = new KnowledgeRefinement(config.refinement);
    this.accessTracker = new AccessTracker(config.tracking);
    this.promotionProcessor = new KnowledgePromotionProcessor(
      this.accessTracker,
      this
    );
  }
  
  // ==================== 集成接口 ====================
  
  /**
   * 记录任务开始
   */
  async recordTaskStart(
    flowId: string,
    goal: string,
    options?: TaskCreateOptions
  ): Promise<EpisodicMemory> {
    const memory: EpisodicMemory = {
      id: this.generateId(),
      type: MemoryType.EPISODIC,
      flowId,
      sessionKey: this.config.sessionKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      goal,
      status: 'running',
      startTime: Date.now(),
      summary: {
        title: options?.title || goal,
        description: '',
        keyResults: [],
        keyChallenges: [],
        solutions: [],
        factors: { enablers: [], blockers: [] },
      },
      toolCalls: [],
      decisions: [],
      subtasks: [],
      lessons: [],
      tags: options?.tags || [],
      priority: this.mapPriority(options?.priority),
      accessCount: 0,
      metadata: options?.metadata,
    };
    
    await this.episodicStorage.save(memory);
    
    return memory;
  }
  
  /**
   * 记录工具调用
   */
  async recordToolCall(
    flowId: string,
    toolCall: Omit<ToolCallRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    const memory = await this.getMemoryByFlowId(flowId);
    if (!memory) return;
    
    memory.toolCalls.push({
      ...toolCall,
      id: this.generateId(),
      timestamp: Date.now(),
    });
    
    memory.updatedAt = Date.now();
    
    await this.episodicStorage.save(memory);
  }
  
  /**
   * 记录决策
   */
  async recordDecision(
    flowId: string,
    decision: Omit<DecisionRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    const memory = await this.getMemoryByFlowId(flowId);
    if (!memory) return;
    
    memory.decisions.push({
      ...decision,
      id: this.generateId(),
      timestamp: Date.now(),
    });
    
    memory.updatedAt = Date.now();
    
    await this.episodicStorage.save(memory);
  }
  
  /**
   * 记录任务完成
   */
  async recordTaskCompletion(
    flowId: string,
    result: unknown,
    lessons: LessonRecord[]
  ): Promise<void> {
    const memory = await this.getMemoryByFlowId(flowId);
    if (!memory) return;
    
    // 更新基本信息
    memory.status = 'succeeded';
    memory.endTime = Date.now();
    memory.duration = memory.endTime - memory.startTime;
    memory.result = result;
    memory.lessons = lessons;
    
    // 生成摘要
    memory.summary = await this.summaryGenerator.generate(memory);
    
    memory.updatedAt = Date.now();
    
    await this.episodicStorage.save(memory);
    
    // 触发知识提炼检查
    await this.knowledgeRefinement.checkAndRefine(flowId);
  }
  
  /**
   * 记录任务失败
   */
  async recordTaskFailure(
    flowId: string,
    error: ErrorRecord,
    lessons: LessonRecord[]
  ): Promise<void> {
    const memory = await this.getMemoryByFlowId(flowId);
    if (!memory) return;
    
    memory.status = 'failed';
    memory.endTime = Date.now();
    memory.duration = memory.endTime - memory.startTime;
    memory.error = error;
    memory.lessons = lessons;
    
    memory.summary = await this.summaryGenerator.generate(memory);
    
    memory.updatedAt = Date.now();
    
    await this.episodicStorage.save(memory);
    
    // 失败案例优先提炼
    await this.knowledgeRefinement.refineFailure(memory);
  }
  
  /**
   * 获取记忆
   */
  async getMemory(flowId: string): Promise<EpisodicMemory | undefined> {
    const memory = await this.getMemoryByFlowId(flowId);
    
    if (memory) {
      // 记录访问
      await this.accessTracker.recordAccess({
        memoryId: memory.id,
        memoryType: MemoryType.EPISODIC,
        accessType: 'read',
        context: { flowId },
      });
      
      // 检查提升
      const promotion = await this.accessTracker.checkPromotion(memory.id);
      if (promotion && promotion.shouldPromote) {
        await this.promotionProcessor.process();
      }
    }
    
    return memory;
  }
  
  /**
   * 搜索相关记忆
   */
  async searchRelatedMemories(
    query: string,
    limit: number = 10
  ): Promise<EpisodicMemory[]> {
    // 1. 搜索情境记忆
    const episodicMemories = await this.episodicStorage.query({
      fullText: query,
      limit: limit * 2,
    });
    
    // 2. 搜索语义记忆
    const semanticMemories = await this.semanticStorage.query({
      fullText: query,
      limit,
    });
    
    // 3. 合并结果
    const results = [...episodicMemories];
    
    // 4. 记录访问
    for (const memory of results.slice(0, limit)) {
      await this.accessTracker.recordAccess({
        memoryId: memory.id,
        memoryType: MemoryType.EPISODIC,
        accessType: 'search',
        context: { query },
      });
    }
    
    return results.slice(0, limit);
  }
  
  /**
   * 提升为语义记忆
   */
  async promoteToSemantic(episodic: EpisodicMemory): Promise<SemanticMemory> {
    const semantic: SemanticMemory = {
      id: this.generateId(),
      type: MemoryType.SEMANTIC,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: episodic.summary.title,
      description: episodic.summary.description,
      category: this.inferCategory(episodic),
      source: KnowledgeSource.TASK_SUCCESS,
      sourceMemoryIds: [episodic.id],
      content: {
        problem: episodic.goal,
        solution: episodic.summary.solutions.join('\n'),
      },
      confidence: 0.8,
      validationCount: 1,
      applicationCount: 0,
      applicableScenarios: episodic.tags,
      preconditions: [],
      caveats: episodic.summary.keyChallenges,
      relatedKnowledgeIds: [],
      tags: episodic.tags,
      accessCount: 0,
    };
    
    await this.semanticStorage.save(semantic);
    
    return semantic;
  }
  
  // ==================== 辅助方法 ====================
  
  private async getMemoryByFlowId(flowId: string): Promise<EpisodicMemory | undefined> {
    const memories = await this.episodicStorage.query({
      ids: [flowId], // 假设有按 flowId 的索引
    });
    return memories[0];
  }
  
  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private mapPriority(priority?: string): MemoryPriority {
    const map: Record<string, MemoryPriority> = {
      high: MemoryPriority.HIGH,
      normal: MemoryPriority.NORMAL,
      low: MemoryPriority.LOW,
    };
    return map[priority || 'normal'] || MemoryPriority.NORMAL;
  }
  
  private inferCategory(memory: EpisodicMemory): KnowledgeCategory {
    // 根据内容推断类别
    if (memory.error) return KnowledgeCategory.TROUBLESHOOTING;
    if (memory.tags.includes('performance')) return KnowledgeCategory.PERFORMANCE;
    if (memory.tags.includes('security')) return KnowledgeCategory.SECURITY;
    return KnowledgeCategory.BEST_PRACTICE;
  }
}
```

### 6.2 SessionTaskManager 集成点

```typescript
// 在 SessionTaskManager 中集成

export class SessionTaskManager {
  // ... 现有代码 ...
  
  private memoryManager: MemoryManager;
  
  async initialize(): Promise<void> {
    // ... 现有初始化代码 ...
    
    // 初始化 MemoryManager
    this.memoryManager = new MemoryManager({
      sessionKey: this.sessionKey,
      storage: {
        dataDir: './data/memories',
        cacheSize: 100,
        flushIntervalMs: 5000,
      },
      refinement: {
        intervalMs: 60 * 60 * 1000, // 1小时
        minMemories: 5,
      },
      tracking: {
        logAccess: true,
        trackStatistics: true,
        promotionThreshold: 3,
      },
    });
  }
  
  async createMainTask(
    goal: string,
    options?: TaskCreateOptions
  ): Promise<TaskFlow> {
    // ... 创建任务 ...
    
    // 记录任务开始到记忆系统
    await this.memoryManager.recordTaskStart(flow.flowId, goal, options);
    
    return flow;
  }
  
  // 钩子方法供 OpenClawBridge 调用
  
  async onToolCall(flowId: string, toolCall: ToolCallRecord): Promise<void> {
    await this.memoryManager.recordToolCall(flowId, toolCall);
  }
  
  async onDecision(flowId: string, decision: DecisionRecord): Promise<void> {
    await this.memoryManager.recordDecision(flowId, decision);
  }
  
  async onTaskComplete(flowId: string, result: unknown): Promise<void> {
    // 从执行过程提取教训
    const lessons = await this.extractLessons(flowId);
    
    await this.memoryManager.recordTaskCompletion(flowId, result, lessons);
  }
  
  async onTaskFail(flowId: string, error: Error): Promise<void> {
    const lessons = await this.extractLessons(flowId);
    
    await this.memoryManager.recordTaskFailure(flowId, {
      type: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      retryable: this.isRetryable(error),
    }, lessons);
  }
}
```

---

## 7. 测试策略

### 7.1 单元测试

```typescript
/**
 * MemoryManager 单元测试
 */
describe('MemoryManager', () => {
  let manager: MemoryManager;
  let config: MemoryManagerConfig;
  
  beforeEach(() => {
    config = {
      sessionKey: 'test-session',
      storage: {
        dataDir: './test-data/memories',
        cacheSize: 10,
        flushIntervalMs: 100,
      },
      refinement: {
        intervalMs: 1000,
        minMemories: 2,
      },
      tracking: {
        logAccess: true,
        trackStatistics: true,
        promotionThreshold: 2,
      },
    };
    
    manager = new MemoryManager(config);
  });
  
  // ==================== 情境记忆测试 ====================
  
  describe('EpisodicMemory', () => {
    it('should record task start', async () => {
      const memory = await manager.recordTaskStart(
        'flow-1',
        'Test goal',
        { title: 'Test Task', tags: ['test'] }
      );
      
      expect(memory.id).toBeDefined();
      expect(memory.flowId).toBe('flow-1');
      expect(memory.goal).toBe('Test goal');
      expect(memory.status).toBe('running');
      expect(memory.tags).toContain('test');
    });
    
    it('should record tool call', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      
      await manager.recordToolCall('flow-1', {
        tool: 'read',
        paramsSummary: 'file: test.txt',
        resultSummary: 'content: hello',
        duration: 100,
        success: true,
      });
      
      const memory = await manager.getMemory('flow-1');
      expect(memory?.toolCalls).toHaveLength(1);
      expect(memory?.toolCalls[0].tool).toBe('read');
    });
    
    it('should record decision', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      
      await manager.recordDecision('flow-1', {
        description: 'Choose implementation',
        context: 'Need to choose between A and B',
        options: ['A', 'B'],
        chosen: 'A',
        reasoning: 'A is faster',
        outcome: 'positive',
      });
      
      const memory = await manager.getMemory('flow-1');
      expect(memory?.decisions).toHaveLength(1);
      expect(memory?.decisions[0].chosen).toBe('A');
    });
    
    it('should record task completion', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      
      await manager.recordTaskCompletion('flow-1', 
        { result: 'success' },
        [{ id: '1', type: 'success', description: 'Test lesson', applicability: [], timestamp: Date.now() }]
      );
      
      const memory = await manager.getMemory('flow-1');
      expect(memory?.status).toBe('succeeded');
      expect(memory?.endTime).toBeDefined();
      expect(memory?.duration).toBeGreaterThan(0);
    });
    
    it('should record task failure', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      
      await manager.recordTaskFailure('flow-1',
        { type: 'Error', message: 'Test error', timestamp: Date.now(), retryable: false },
        []
      );
      
      const memory = await manager.getMemory('flow-1');
      expect(memory?.status).toBe('failed');
      expect(memory?.error?.message).toBe('Test error');
    });
  });
  
  // ==================== 存储性能测试 ====================
  
  describe('Storage Performance', () => {
    it('should save memory within 50ms', async () => {
      const memory = createTestMemory();
      
      const start = Date.now();
      await manager['episodicStorage'].save(memory);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
    
    it('should retrieve memory within 100ms', async () => {
      const memory = createTestMemory();
      await manager['episodicStorage'].save(memory);
      
      const start = Date.now();
      const retrieved = await manager['episodicStorage'].findById(memory.id);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
      expect(retrieved).toEqual(memory);
    });
    
    it('should handle 1000+ records efficiently', async () => {
      // 创建 1000 条记忆
      const memories = Array.from({ length: 1000 }, () => createTestMemory());
      
      const start = Date.now();
      for (const memory of memories) {
        await manager['episodicStorage'].save(memory);
      }
      const duration = Date.now() - start;
      
      // 平均每条 < 5ms
      expect(duration / 1000).toBeLessThan(5);
    });
  });
  
  // ==================== 知识提炼测试 ====================
  
  describe('Knowledge Refinement', () => {
    it('should extract success pattern', async () => {
      // 创建相似的成功记忆
      for (let i = 0; i < 3; i++) {
        await manager.recordTaskStart(`flow-${i}`, 'Test goal');
        await manager.recordTaskCompletion(`flow-${i}`, 
          { result: 'success' },
          []
        );
      }
      
      // 触发提炼
      const knowledge = await manager['knowledgeRefinement'].refine();
      
      expect(knowledge.length).toBeGreaterThan(0);
      expect(knowledge[0].type).toBe('success_pattern');
    });
    
    it('should extract failure lessons', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      await manager.recordTaskFailure('flow-1',
        { type: 'Error', message: 'Test error', timestamp: Date.now(), retryable: false },
        [{ id: '1', type: 'failure', description: 'Avoid this', applicability: [], timestamp: Date.now() }]
      );
      
      const knowledge = await manager['knowledgeRefinement'].refine();
      
      expect(knowledge.some(k => k.type === 'failure_lesson')).toBe(true);
    });
  });
  
  // ==================== 访问追踪测试 ====================
  
  describe('Access Tracking', () => {
    it('should track memory access', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      const memory = await manager.getMemory('flow-1');
      
      const stats = await manager['accessTracker'].getStatistics(memory!.id);
      
      expect(stats?.totalAccessCount).toBeGreaterThan(0);
    });
    
    it('should promote memory on high access', async () => {
      await manager.recordTaskStart('flow-1', 'Test');
      const memory = await manager.getMemory('flow-1');
      
      // 多次访问
      for (let i = 0; i < 5; i++) {
        await manager.getMemory('flow-1');
      }
      
      const promotion = await manager['accessTracker'].checkPromotion(memory!.id);
      
      expect(promotion?.shouldPromote).toBe(true);
    });
  });
});

// 辅助函数
function createTestMemory(): EpisodicMemory {
  return {
    id: `mem-${Date.now()}-${Math.random()}`,
    type: MemoryType.EPISODIC,
    flowId: `flow-${Date.now()}`,
    sessionKey: 'test-session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    goal: 'Test goal',
    status: 'succeeded',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    duration: 1000,
    summary: {
      title: 'Test',
      description: 'Test description',
      keyResults: [],
      keyChallenges: [],
      solutions: [],
      factors: { enablers: [], blockers: [] },
    },
    toolCalls: [],
    decisions: [],
    subtasks: [],
    lessons: [],
    tags: ['test'],
    priority: MemoryPriority.NORMAL,
    accessCount: 0,
  };
}
```

### 7.2 集成测试

```typescript
/**
 * MemoryManager 集成测试
 */
describe('MemoryManager Integration', () => {
  let sessionManager: SessionTaskManager;
  let memoryManager: MemoryManager;
  
  beforeAll(async () => {
    // 设置完整的测试环境
    const bridge = new OpenClawBridge(/* mock context */);
    
    sessionManager = new SessionTaskManager({
      bridge,
      sessionKey: 'integration-test',
    });
    
    await sessionManager.initialize();
    
    memoryManager = sessionManager['memoryManager'];
  });
  
  afterAll(async () => {
    await sessionManager.destroy();
  });
  
  it('should integrate with task lifecycle', async () => {
    // 1. 创建任务
    const flow = await sessionManager.createMainTask('Integration test', {
      title: 'Integration Test Task',
      tags: ['integration'],
    });
    
    // 2. 验证记忆已创建
    const memory = await memoryManager.getMemory(flow.flowId);
    expect(memory).toBeDefined();
    expect(memory?.goal).toBe('Integration test');
    
    // 3. 模拟工具调用
    await sessionManager.onToolCall(flow.flowId, {
      tool: 'test-tool',
      paramsSummary: 'test params',
      resultSummary: 'test result',
      duration: 100,
      success: true,
    });
    
    // 4. 验证工具调用已记录
    const updatedMemory = await memoryManager.getMemory(flow.flowId);
    expect(updatedMemory?.toolCalls).toHaveLength(1);
    
    // 5. 完成任务
    await sessionManager.completeTask(flow.flowId, { result: 'success' });
    
    // 6. 验证记忆已完成
    const finalMemory = await memoryManager.getMemory(flow.flowId);
    expect(finalMemory?.status).toBe('succeeded');
  });
  
  it('should refine knowledge after multiple tasks', async () => {
    // 创建多个相似任务
    for (let i = 0; i < 5; i++) {
      const flow = await sessionManager.createMainTask('Similar task', {
        tags: ['similar'],
      });
      
      await sessionManager.onToolCall(flow.flowId, {
        tool: 'common-tool',
        paramsSummary: 'common params',
        resultSummary: 'common result',
        duration: 100,
        success: true,
      });
      
      await sessionManager.completeTask(flow.flowId, { result: 'success' });
    }
    
    // 触发知识提炼
    await memoryManager['knowledgeRefinement'].checkAndRefine();
    
    // 验证知识已生成
    const knowledge = await memoryManager['semanticStorage'].query({
      fullText: 'similar',
    });
    
    expect(knowledge.length).toBeGreaterThan(0);
  });
});
```

### 7.3 性能基准测试

```typescript
/**
 * MemoryManager 性能基准
 */
describe('MemoryManager Performance Benchmarks', () => {
  const ITERATIONS = 1000;
  let manager: MemoryManager;
  
  beforeAll(() => {
    manager = new MemoryManager({
      sessionKey: 'benchmark',
      storage: { dataDir: './benchmark-data' },
    });
  });
  
  it('save latency < 50ms', async () => {
    const latencies: number[] = [];
    
    for (let i = 0; i < ITERATIONS; i++) {
      const memory = createTestMemory();
      
      const start = performance.now();
      await manager['episodicStorage'].save(memory);
      const end = performance.now();
      
      latencies.push(end - start);
    }
    
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];
    
    console.log(`Save latency: avg=${avg.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);
    
    expect(avg).toBeLessThan(50);
    expect(p99).toBeLessThan(100);
  });
  
  it('retrieve latency < 100ms', async () => {
    // 先保存一批数据
    const ids: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const memory = createTestMemory();
      await manager['episodicStorage'].save(memory);
      ids.push(memory.id);
    }
    
    // 测试检索延迟
    const latencies: number[] = [];
    
    for (const id of ids) {
      const start = performance.now();
      await manager['episodicStorage'].findById(id);
      const end = performance.now();
      
      latencies.push(end - start);
    }
    
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];
    
    console.log(`Retrieve latency: avg=${avg.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);
    
    expect(avg).toBeLessThan(100);
    expect(p99).toBeLessThan(200);
  });
  
  it('knowledge refinement < 5s for 100 memories', async () => {
    // 创建 100 条记忆
    for (let i = 0; i < 100; i++) {
      const memory = createTestMemory();
      await manager['episodicStorage'].save(memory);
    }
    
    // 测试提炼时间
    const start = performance.now();
    await manager['knowledgeRefinement'].refine();
    const end = performance.now();
    
    const duration = end - start;
    
    console.log(`Refinement time for 100 memories: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(5000);
  });
  
  it('storage space < 10MB for 1000 memories', async () => {
    // 创建 1000 条记忆
    for (let i = 0; i < 1000; i++) {
      const memory = createTestMemory();
      await manager['episodicStorage'].save(memory);
    }
    
    // 刷新到磁盘
    await manager['episodicStorage'].flush();
    
    // 检查存储大小
    const stats = await getDirSize('./benchmark-data/memories/episodic');
    
    console.log(`Storage size for 1000 memories: ${(stats / 1024 / 1024).toFixed(2)}MB`);
    
    expect(stats).toBeLessThan(10 * 1024 * 1024); // 10MB
  });
});

// 辅助函数
async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const files = await fs.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isDirectory()) {
      size += await getDirSize(filePath);
    } else {
      size += stat.size;
    }
  }
  
  return size;
}
```

---

## 8. 实施计划

### 8.1 开发任务分解

| 任务 | 预估时间 | 优先级 | 依赖 |
|------|----------|--------|------|
| **核心数据模型** | 2h | P0 | 无 |
| **存储接口定义** | 1h | P0 | 数据模型 |
| **EpisodicMemoryStorage** | 4h | P0 | 存储接口 |
| **TaskSummaryGenerator** | 3h | P0 | 数据模型 |
| **AccessTracker** | 3h | P1 | 存储接口 |
| **KnowledgeRefinement** | 4h | P1 | 数据模型 |
| **MemoryManager 集成** | 3h | P0 | 所有模块 |
| **单元测试** | 4h | P0 | 所有模块 |
| **集成测试** | 2h | P1 | 所有模块 |
| **性能优化** | 2h | P1 | 所有模块 |
| **文档编写** | 2h | P2 | 所有模块 |

**总计**: 约 30 小时（4 个工作日）

### 8.2 开发顺序

```
Day 1 (上午):
  ├─ 核心数据模型定义 (2h)
  └─ 存储接口定义 (1h)

Day 1 (下午):
  └─ EpisodicMemoryStorage 实现 (4h)

Day 2 (上午):
  └─ TaskSummaryGenerator 实现 (3h)

Day 2 (下午):
  ├─ AccessTracker 实现 (2h)
  └─ 单元测试编写开始 (1h)

Day 3 (上午):
  ├─ KnowledgeRefinement 实现 (3h)
  └─ 单元测试继续 (1h)

Day 3 (下午):
  ├─ MemoryManager 集成 (3h)
  └─ 单元测试完成 (1h)

Day 4 (上午):
  ├─ 集成测试 (2h)
  └─ 性能测试和优化 (2h)

Day 4 (下午):
  ├─ 文档编写 (2h)
  └─ 代码审查和修复 (2h)
```

### 8.3 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| **M1: 数据层完成** | Day 1 结束 | 数据模型 + 存储实现 |
| **M2: 处理层完成** | Day 2 结束 | 摘要生成器 + 访问追踪器 |
| **M3: 提炼层完成** | Day 3 中午 | 知识提炼器 |
| **M4: 集成完成** | Day 3 结束 | MemoryManager 完整实现 |
| **M5: 验收通过** | Day 4 结束 | 测试通过 + 文档完整 |

### 8.4 验收标准

| 标准 | 指标 | 验证方法 |
|------|------|----------|
| **功能完整性** | 所有核心功能实现 | 功能测试 |
| **性能达标** | 保存<50ms, 检索<100ms | 性能基准测试 |
| **代码质量** | TypeScript 编译通过，无 lint 错误 | CI/CD |
| **测试覆盖** | 单元测试覆盖率 > 80% | Jest 覆盖率报告 |
| **文档完整** | API 文档 + 使用示例 | 文档审查 |

---

## 附录

### A. 配置参数

```typescript
/**
 * MemoryManager 完整配置
 */
export interface MemoryManagerConfig {
  /** 会话标识 */
  sessionKey: string;
  
  /** 存储配置 */
  storage: {
    /** 数据目录 */
    dataDir: string;
    
    /** 缓存大小 */
    cacheSize?: number;
    
    /** 刷新间隔（毫秒） */
    flushIntervalMs?: number;
    
    /** 最大文件大小 */
    maxFileSize?: number;
  };
  
  /** 知识提炼配置 */
  refinement: {
    /** 提炼间隔（毫秒） */
    intervalMs?: number;
    
    /** 最小记忆数量 */
    minMemories?: number;
    
    /** 置信度阈值 */
    confidenceThreshold?: number;
  };
  
  /** 访问追踪配置 */
  tracking: {
    /** 是否记录访问日志 */
    logAccess?: boolean;
    
    /** 是否追踪统计 */
    trackStatistics?: boolean;
    
    /** 提升阈值 */
    promotionThreshold?: number;
    
    /** 提升窗口（毫秒） */
    promotionWindowMs?: number;
  };
}
```

### B. 错误代码

| 错误代码 | 说明 | 处理建议 |
|----------|------|----------|
| `MEMORY_NOT_FOUND` | 记忆不存在 | 检查 ID 是否正确 |
| `STORAGE_ERROR` | 存储操作失败 | 检查磁盘空间和权限 |
| `REFINEMENT_FAILED` | 知识提炼失败 | 检查输入数据质量 |
| `INDEX_CORRUPTED` | 索引损坏 | 重建索引 |
| `CACHE_OVERFLOW` | 缓存溢出 | 增加缓存大小 |

### C. 性能优化建议

1. **缓存优化**
   - 使用 LRU 缓存淘汰策略
   - 预加载热点数据
   - 定期清理冷数据

2. **索引优化**
   - 使用多维度索引
   - 定期重建索引
   - 使用布隆过滤器加速查询

3. **存储优化**
   - 批量写入减少 IO
   - 压缩存储减少空间
   - 分区存储提高并发

---

**文档版本**: v1.0  
**设计时间**: 2026-04-19  
**设计者**: 专家团队  
**状态**: 设计完成，待实施
