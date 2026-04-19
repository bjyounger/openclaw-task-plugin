/**
 * MemoryManager 类型定义
 * 
 * 三层记忆架构：
 * 1. EpisodicMemory（情境记忆）- 短期工作记忆
 * 2. SemanticMemory（语义记忆）- 长效结构化记忆  
 * 3. Knowledge（知识）- 提炼后的知识卡片
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import { TaskStatus } from '../types';

// ==================== 核心数据模型 ====================

/**
 * 记忆来源类型
 */
export type MemorySource = 
  | 'task_completion'    // 任务完成
  | 'user_correction'    // 用户纠正
  | 'user_decision'      // 用户决策
  | 'user_preference'     // 用户偏好
  | 'knowledge_gap'      // 知识缺口
  | 'error_recovery';    // 错误恢复

/**
 * 记忆优先级
 */
export type MemoryPriority = 'high' | 'medium' | 'low';

/**
 * 记忆状态
 */
export type MemoryStatus = 
  | 'active'      // 活跃（在工作记忆中）
  | 'archived'    // 已归档
  | 'promoted';   // 已提升为长效记忆

/**
 * 访问记录
 */
export interface AccessLog {
  /** 访问时间 */
  timestamp: number;
  /** 访问来源 */
  source: string;
  /** 访问上下文 */
  context?: Record<string, unknown>;
}

/**
 * 情境记忆（Episodic Memory）
 * 
 * 短期工作记忆，记录最近发生的事件
 * - 生命周期：会话级别（session-scoped）
 * - 容量：有限（默认保留最近100条）
 * - 特点：包含完整上下文
 */
export interface EpisodicMemory {
  /** 记忆ID */
  memoryId: string;
  
  /** 来源类型 */
  source: MemorySource;
  
  /** 优先级 */
  priority: MemoryPriority;
  
  /** 状态 */
  status: MemoryStatus;
  
  /** 标题（用于检索） */
  title: string;
  
  /** 内容摘要 */
  summary: string;
  
  /** 详细内容 */
  content: Record<string, unknown>;
  
  /** 标签（用于分类和搜索） */
  tags: string[];
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后访问时间 */
  lastAccessedAt: number;
  
  /** 访问次数 */
  accessCount: number;
  
  /** 访问记录 */
  accessLog: AccessLog[];
  
  /** 关联任务ID */
  relatedTaskIds?: string[];
  
  /** 关联记忆ID */
  relatedMemoryIds?: string[];
  
  /** 提升阈值累计（达到阈值后提升为长效记忆） */
  promotionScore: number;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 语义记忆（Semantic Memory）
 * 
 * 长效结构化记忆，从情境记忆提炼而来
 * - 生命周期：持久化（跨会话）
 * - 特点：去语境化、结构化、可检索
 */
export interface SemanticMemory {
  /** 记忆ID */
  memoryId: string;
  
  /** 记忆类型 */
  type: 'fact' | 'procedure' | 'concept' | 'preference' | 'decision';
  
  /** 标题 */
  title: string;
  
  /** 内容 */
  content: string;
  
  /** 关键词（用于索引） */
  keywords: string[];
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 来源记忆ID */
  sourceMemoryIds: string[];
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后更新时间 */
  updatedAt: number;
  
  /** 最后访问时间 */
  lastAccessedAt: number;
  
  /** 访问次数 */
  accessCount: number;
  
  /** 验证状态 */
  verified: boolean;
  
  /** 验证记录 */
  verificationLog?: Array<{
    timestamp: number;
    result: 'confirmed' | 'rejected' | 'updated';
    reason?: string;
  }>;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 知识卡片（Knowledge Card）
 * 
 * 最高层级的知识，可复用的经验
 * - 生命周期：长期
 * - 特点：高度抽象、可复用、带文档
 */
export interface Knowledge {
  /** 知识ID */
  knowledgeId: string;
  
  /** 知识类型 */
  category: 
    | 'best_practice'    // 最佳实践
    | 'lesson_learned'    // 教训总结
    | 'pattern'           // 模式
    | 'reference'         // 参考资料
    | 'tool_usage';       // 工具使用方法
  
  /** 标题 */
  title: string;
  
  /** 描述 */
  description: string;
  
  /** 详细内容（Markdown） */
  content: string;
  
  /** 标签 */
  tags: string[];
  
  /** 适用场景 */
  applicability: string[];
  
  /** 警告事项 */
  warnings?: string[];
  
  /** 来源 */
  source: {
    type: 'experience' | 'document' | 'external';
    reference: string;
  };
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后更新时间 */
  updatedAt: number;
  
  /** 使用次数 */
  usageCount: number;
  
  /** 成功率 */
  successRate: number;
  
  /** 相关知识ID */
  relatedKnowledgeIds?: string[];
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 存储接口 ====================

/**
 * 记忆存储接口
 */
export interface IMemoryStorage<T> {
  /** 保存记忆 */
  save(memory: T): Promise<void>;
  
  /** 加载记忆 */
  load(id: string): Promise<T | undefined>;
  
  /** 批量加载 */
  loadBatch(ids: string[]): Promise<T[]>;
  
  /** 查询记忆 */
  query(query: MemoryQuery): Promise<T[]>;
  
  /** 删除记忆 */
  delete(id: string): Promise<boolean>;
  
  /** 批量删除 */
  deleteBatch(ids: string[]): Promise<number>;
  
  /** 归档记忆 */
  archive(id: string): Promise<void>;
  
  /** 清空所有 */
  clear(): Promise<void>;
  
  /** 计数 */
  count(): Promise<number>;
}

/**
 * 记忆查询参数
 */
export interface MemoryQuery {
  /** 标签过滤 */
  tags?: string[];
  
  /** 来源过滤 */
  source?: MemorySource | MemorySource[];
  
  /** 优先级过滤 */
  priority?: MemoryPriority | MemoryPriority[];
  
  /** 状态过滤 */
  status?: MemoryStatus | MemoryStatus[];
  
  /** 时间范围（开始） */
  startTime?: number;
  
  /** 时间范围（结束） */
  endTime?: number;
  
  /** 全文搜索 */
  searchText?: string;
  
  /** 关键词搜索 */
  keywords?: string[];
  
  /** 限制数量 */
  limit?: number;
  
  /** 偏移量 */
  offset?: number;
  
  /** 排序字段 */
  orderBy?: 'createdAt' | 'lastAccessedAt' | 'accessCount' | 'promotionScore';
  
  /** 排序方向 */
  orderDirection?: 'asc' | 'desc';
}

// ==================== 任务摘要 ====================

/**
 * 任务摘要
 */
export interface TaskSummary {
  /** 任务ID */
  taskId: string;
  
  /** Flow ID */
  flowId?: string;
  
  /** 任务目标 */
  goal: string;
  
  /** 任务状态 */
  status: TaskStatus;
  
  /** 执行时长（毫秒） */
  duration: number;
  
  /** 关键结果 */
  keyResults: string[];
  
  /** 学习点 */
  lessons: string[];
  
  /** 标签 */
  tags: string[];
  
  /** 创建时间 */
  createdAt: number;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务摘要生成器配置
 */
export interface TaskSummaryGeneratorConfig {
  /** 最大关键结果数量 */
  maxKeyResults?: number;
  
  /** 最大学习点数量 */
  maxLessons?: number;
  
  /** 是否提取模式 */
  extractPatterns?: boolean;
}

// ==================== 访问追踪 ====================

/**
 * 访问追踪器配置
 */
export interface AccessTrackerConfig {
  /** 记录间隔（毫秒） */
  recordInterval?: number;
  
  /** 最大访问记录数 */
  maxAccessLogSize?: number;
  
  /** 提升阈值 */
  promotionThreshold?: number;
  
  /** 访问频率阈值（用于提升） */
  accessFrequencyThreshold?: number;
}

/**
 * 访问统计
 */
export interface AccessStatistics {
  /** 总访问次数 */
  totalAccesses: number;
  
  /** 唯一来源数 */
  uniqueSources: number;
  
  /** 访问频率（次/小时） */
  accessFrequency: number;
  
  /** 最后访问时间 */
  lastAccessTime: number;
  
  /** 热门记忆（被访问最多） */
  hotMemories: Array<{
    memoryId: string;
    accessCount: number;
  }>;
}

// ==================== 知识提炼 ====================

/**
 * 知识提炼配置
 */
export interface KnowledgeRefinementConfig {
  /** 相似度阈值（0-1） */
  similarityThreshold?: number;
  
  /** 最小记忆数量（用于聚类） */
  minClusterSize?: number;
  
  /** 置信度阈值 */
  confidenceThreshold?: number;
  
  /** 是否自动提升 */
  autoPromote?: boolean;
}

/**
 * 记忆聚类
 */
export interface MemoryCluster {
  /** 聚类ID */
  clusterId: string;
  
  /** 聚类标签 */
  label: string;
  
  /** 聚类成员 */
  members: string[];
  
  /** 共同特征 */
  commonFeatures: string[];
  
  /** 中心记忆ID */
  centerMemoryId: string;
}

/**
 * 模式识别结果
 */
export interface PatternRecognitionResult {
  /** 识别出的模式 */
  patterns: Array<{
    pattern: string;
    occurrences: number;
    examples: string[];
  }>;
  
  /** 提取的知识点 */
  extractedKnowledge: string[];
}

// ==================== MemoryManager 配置 ====================

/**
 * MemoryManager 配置
 */
export interface MemoryManagerConfig {
  /** 会话标识 */
  sessionKey: string;
  
  /** 存储目录 */
  storageDir?: string;
  
  /** 最大情境记忆数量 */
  maxEpisodicMemories?: number;
  
  /** 情境记忆过期时间（毫秒） */
  episodicMemoryTTL?: number;
  
  /** 是否启用持久化 */
  enablePersistence?: boolean;
  
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
  
  /** 任务摘要生成器配置 */
  summaryGenerator?: TaskSummaryGeneratorConfig;
  
  /** 访问追踪器配置 */
  accessTracker?: AccessTrackerConfig;
  
  /** 知识提炼配置 */
  knowledgeRefinement?: KnowledgeRefinementConfig;
}

// ==================== 事件类型 ====================

/**
 * MemoryManager 事件
 */
export interface MemoryManagerEvents {
  'memory:created': { memoryId: string; source: MemorySource; timestamp: number };
  'memory:accessed': { memoryId: string; source: string; timestamp: number };
  'memory:promoted': { memoryId: string; promotedTo: 'semantic' | 'knowledge'; timestamp: number };
  'memory:archived': { memoryId: string; reason: string; timestamp: number };
  'memory:deleted': { memoryId: string; timestamp: number };
  'knowledge:created': { knowledgeId: string; category: string; timestamp: number };
  'knowledge:used': { knowledgeId: string; context: string; success: boolean; timestamp: number };
}

// ==================== 错误类型 ====================

/**
 * MemoryManager 错误代码
 */
export type MemoryErrorCode = 
  | 'STORAGE_ERROR'
  | 'MEMORY_NOT_FOUND'
  | 'INVALID_MEMORY'
  | 'PROMOTION_FAILED'
  | 'QUERY_ERROR'
  | 'SERIALIZATION_ERROR';

/**
 * MemoryManager 错误
 */
export class MemoryManagerError extends Error {
  constructor(
    public code: MemoryErrorCode,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MemoryManagerError';
  }
  
  getUserMessage(): string {
    const messages: Record<MemoryErrorCode, string> = {
      STORAGE_ERROR: '存储操作失败',
      MEMORY_NOT_FOUND: '记忆不存在',
      INVALID_MEMORY: '记忆数据无效',
      PROMOTION_FAILED: '记忆提升失败',
      QUERY_ERROR: '查询失败',
      SERIALIZATION_ERROR: '序列化失败',
    };
    
    return messages[this.code] || this.message;
  }
}

// ==================== 类型守卫 ====================

/**
 * 检查是否为有效的 MemorySource
 */
export function isMemorySource(value: string): value is MemorySource {
  const validSources: MemorySource[] = [
    'task_completion',
    'user_correction',
    'user_decision',
    'user_preference',
    'knowledge_gap',
    'error_recovery',
  ];
  return validSources.includes(value as MemorySource);
}

/**
 * 检查是否为有效的 MemoryPriority
 */
export function isMemoryPriority(value: string): value is MemoryPriority {
  return ['high', 'medium', 'low'].includes(value as MemoryPriority);
}

/**
 * 检查是否为有效的 MemoryStatus
 */
export function isMemoryStatus(value: string): value is MemoryStatus {
  return ['active', 'archived', 'promoted'].includes(value as MemoryStatus);
}

/**
 * 生成唯一ID
 */
export function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成知识ID
 */
export function generateKnowledgeId(): string {
  return `know_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
