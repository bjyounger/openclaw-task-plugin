/**
 * MemoryManager - 记忆管理器
 * 
 * 整合三层记忆架构：
 * 1. EpisodicMemory（情境记忆）- 短期工作记忆
 * 2. SemanticMemory（语义记忆）- 长效结构化记忆
 * 3. Knowledge（知识）- 提炼后的知识卡片
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  MemoryManagerConfig,
  EpisodicMemory,
  SemanticMemory,
  Knowledge,
  MemoryQuery,
  MemorySource,
  MemoryPriority,
  MemoryManagerEvents,
  MemoryManagerError,
  TaskSummary,
  AccessStatistics,
  MemoryCluster,
  PatternRecognitionResult,
} from './types';
import { EpisodicMemoryStorage } from './episodic-memory-storage';
import { SemanticMemoryStorage } from './semantic-memory-storage';
import { KnowledgeStorage, KnowledgeQuery } from './knowledge-storage';
import { TaskSummaryGenerator, TaskExecutionResult } from './task-summary-generator';
import { AccessTracker } from './access-tracker';
import { KnowledgeRefinement } from './knowledge-refinement';
import { EventEmitter } from '../managers/event-emitter';

/**
 * MemoryManager 实现类
 */
export class MemoryManager {
  // 配置
  private config: Required<MemoryManagerConfig>;
  
  // 存储层
  private episodicStorage: EpisodicMemoryStorage;
  private semanticStorage: SemanticMemoryStorage;
  private knowledgeStorage: KnowledgeStorage;
  
  // 功能模块
  private summaryGenerator: TaskSummaryGenerator;
  private accessTracker: AccessTracker;
  private knowledgeRefinement: KnowledgeRefinement;
  
  // 事件系统
  private eventEmitter: EventEmitter<MemoryManagerEvents>;
  
  // 状态
  private initialized: boolean = false;
  private destroyed: boolean = false;
  
  constructor(config?: MemoryManagerConfig) {
    // 合并默认配置
    this.config = {
      sessionKey: config?.sessionKey || 'default',
      storageDir: config?.storageDir || '/tmp/openclaw/memory',
      maxEpisodicMemories: config?.maxEpisodicMemories ?? 1000,
      episodicMemoryTTL: config?.episodicMemoryTTL ?? 7 * 24 * 60 * 60 * 1000, // 7天
      enablePersistence: config?.enablePersistence ?? true,
      autoSaveInterval: config?.autoSaveInterval ?? 60000,
      summaryGenerator: config?.summaryGenerator ?? {},
      accessTracker: config?.accessTracker ?? {},
      knowledgeRefinement: config?.knowledgeRefinement ?? {},
    };
    
    // 初始化事件系统
    this.eventEmitter = new EventEmitter();
    
    // 初始化存储层
    this.episodicStorage = new EpisodicMemoryStorage({
      storageDir: path.join(this.config.storageDir, 'episodic'),
      maxMemories: this.config.maxEpisodicMemories,
      ttl: this.config.episodicMemoryTTL,
      enablePersistence: this.config.enablePersistence,
      autoSaveInterval: this.config.autoSaveInterval,
    });
    
    this.semanticStorage = new SemanticMemoryStorage({
      storageDir: path.join(this.config.storageDir, 'semantic'),
      enablePersistence: this.config.enablePersistence,
    });
    
    this.knowledgeStorage = new KnowledgeStorage({
      storageDir: path.join(this.config.storageDir, 'knowledge'),
      enablePersistence: this.config.enablePersistence,
    });
    
    // 初始化功能模块
    this.summaryGenerator = new TaskSummaryGenerator(this.config.summaryGenerator);
    this.accessTracker = new AccessTracker(this.episodicStorage, this.config.accessTracker);
    this.knowledgeRefinement = new KnowledgeRefinement(
      this.episodicStorage,
      this.semanticStorage,
      this.knowledgeStorage,
      this.config.knowledgeRefinement
    );
  }
  
  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        'MemoryManager already initialized'
      );
    }
    
    // 确保存储目录存在
    this.ensureStorageDir();
    
    this.initialized = true;
  }
  
  /**
   * 销毁管理器
   */
  async destroy(): Promise<void> {
    if (!this.initialized || this.destroyed) {
      return;
    }
    
    // 刷新所有存储
    await this.flush();
    
    // 关闭存储
    await this.episodicStorage.close();
    
    this.destroyed = true;
    this.eventEmitter.clearAll();
  }
  
  // ==================== 情境记忆管理 ====================
  
  /**
   * 创建情境记忆
   */
  async createEpisodicMemory(params: {
    source: MemorySource;
    priority?: MemoryPriority;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    tags?: string[];
    relatedTaskIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<EpisodicMemory> {
    this.ensureInitialized();
    
    const memory = await this.episodicStorage.create(params);
    
    this.emit('memory:created', {
      memoryId: memory.memoryId,
      source: memory.source,
      timestamp: Date.now(),
    });
    
    return memory;
  }
  
  /**
   * 从任务执行结果创建记忆
   */
  async createMemoryFromTask(result: TaskExecutionResult): Promise<EpisodicMemory> {
    this.ensureInitialized();
    
    // 生成摘要
    const summary = this.summaryGenerator.generate(result);
    
    // 创建记忆
    const memoryData = this.summaryGenerator.createMemory(summary);
    
    const memory = await this.episodicStorage.create({
      source: memoryData.source,
      priority: memoryData.priority,
      title: memoryData.title,
      summary: memoryData.summary,
      content: memoryData.content,
      tags: memoryData.tags,
      relatedTaskIds: memoryData.relatedTaskIds,
      metadata: memoryData.metadata,
    });
    
    this.emit('memory:created', {
      memoryId: memory.memoryId,
      source: memory.source,
      timestamp: Date.now(),
    });
    
    return memory;
  }
  
  /**
   * 获取情境记忆
   */
  async getEpisodicMemory(memoryId: string): Promise<EpisodicMemory | undefined> {
    this.ensureInitialized();
    
    const memory = await this.episodicStorage.load(memoryId);
    
    if (memory) {
      // 记录访问
      this.accessTracker.recordAccess(memoryId, 'get');
      
      this.emit('memory:accessed', {
        memoryId,
        source: 'get',
        timestamp: Date.now(),
      });
    }
    
    return memory;
  }
  
  /**
   * 查询情境记忆
   */
  async queryEpisodicMemories(query: MemoryQuery): Promise<EpisodicMemory[]> {
    this.ensureInitialized();
    return this.episodicStorage.query(query);
  }
  
  /**
   * 删除情境记忆
   */
  async deleteEpisodicMemory(memoryId: string): Promise<boolean> {
    this.ensureInitialized();
    
    const deleted = await this.episodicStorage.delete(memoryId);
    
    if (deleted) {
      this.emit('memory:deleted', {
        memoryId,
        timestamp: Date.now(),
      });
    }
    
    return deleted;
  }
  
  // ==================== 语义记忆管理 ====================
  
  /**
   * 创建语义记忆
   */
  async createSemanticMemory(params: {
    type: SemanticMemory['type'];
    title: string;
    content: string;
    keywords?: string[];
    confidence?: number;
    sourceMemoryIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<SemanticMemory> {
    this.ensureInitialized();
    
    const memory = await this.semanticStorage.create(params);
    
    this.emit('memory:promoted', {
      memoryId: memory.memoryId,
      promotedTo: 'semantic',
      timestamp: Date.now(),
    });
    
    return memory;
  }
  
  /**
   * 搜索语义记忆
   */
  async searchSemanticMemories(keywords: string[], limit?: number): Promise<SemanticMemory[]> {
    this.ensureInitialized();
    return this.semanticStorage.searchByKeywords(keywords, limit);
  }
  
  // ==================== 知识管理 ====================
  
  /**
   * 创建知识卡片
   */
  async createKnowledge(params: {
    category: Knowledge['category'];
    title: string;
    description: string;
    content: string;
    tags?: string[];
    applicability?: string[];
    warnings?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Knowledge> {
    this.ensureInitialized();
    
    const knowledge = await this.knowledgeStorage.create(params);
    
    this.emit('knowledge:created', {
      knowledgeId: knowledge.knowledgeId,
      category: knowledge.category,
      timestamp: Date.now(),
    });
    
    return knowledge;
  }
  
  /**
   * 查询知识
   */
  async queryKnowledge(query: KnowledgeQuery): Promise<Knowledge[]> {
    this.ensureInitialized();
    return this.knowledgeStorage.query(query);
  }
  
  /**
   * 记录知识使用
   */
  async recordKnowledgeUsage(knowledgeId: string, success: boolean): Promise<void> {
    this.ensureInitialized();
    
    await this.knowledgeStorage.recordUsage(knowledgeId, success);
    
    this.emit('knowledge:used', {
      knowledgeId,
      context: 'manual',
      success,
      timestamp: Date.now(),
    });
  }
  
  // ==================== 知识提炼 ====================
  
  /**
   * 执行知识提炼
   */
  async refine(): Promise<{
    clusters: MemoryCluster[];
    extractedKnowledge: PatternRecognitionResult;
    promotedMemories: number;
  }> {
    this.ensureInitialized();
    return this.knowledgeRefinement.refine();
  }
  
  /**
   * 从情境记忆提升到语义记忆
   */
  async promoteToSemantic(memoryId: string): Promise<SemanticMemory> {
    this.ensureInitialized();
    
    const memory = await this.episodicStorage.load(memoryId);
    if (!memory) {
      throw new MemoryManagerError(
        'MEMORY_NOT_FOUND',
        `Episodic memory not found: ${memoryId}`
      );
    }
    
    const semanticMemory = await this.knowledgeRefinement.createSemanticMemory(memory);
    
    // 归档原记忆
    await this.episodicStorage.archive(memoryId);
    
    this.emit('memory:promoted', {
      memoryId,
      promotedTo: 'semantic',
      timestamp: Date.now(),
    });
    
    return semanticMemory;
  }
  
  /**
   * 从聚类创建知识卡片
   */
  async createKnowledgeFromCluster(clusterId: string): Promise<Knowledge | null> {
    this.ensureInitialized();
    
    // 执行提炼以获取聚类
    const result = await this.knowledgeRefinement.refine();
    const cluster = result.clusters.find(c => c.clusterId === clusterId);
    
    if (!cluster) return null;
    
    // 获取聚类成员
    const memories = await this.episodicStorage.loadBatch(cluster.members);
    
    const knowledge = await this.knowledgeRefinement.createKnowledgeCard(cluster, memories);
    
    this.emit('knowledge:created', {
      knowledgeId: knowledge.knowledgeId,
      category: knowledge.category,
      timestamp: Date.now(),
    });
    
    return knowledge;
  }
  
  // ==================== 访问统计 ====================
  
  /**
   * 获取访问统计
   */
  getAccessStatistics(): AccessStatistics {
    return this.accessTracker.getStatistics();
  }
  
  /**
   * 评估记忆的知识价值
   */
  async evaluateMemoryValues(): Promise<Array<{ memoryId: string; value: number }>> {
    return this.knowledgeRefinement.evaluateMemories();
  }
  
  // ==================== 事件管理 ====================
  
  /**
   * 注册事件监听器
   */
  on<K extends keyof MemoryManagerEvents>(
    eventType: K,
    listener: (event: MemoryManagerEvents[K]) => void
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }
  
  /**
   * 触发事件
   */
  private emit<K extends keyof MemoryManagerEvents>(
    eventType: K,
    payload: MemoryManagerEvents[K]
  ): void {
    this.eventEmitter.emit(eventType, payload);
  }
  
  // ==================== 统计和状态 ====================
  
  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    episodic: { total: number; byStatus: Record<string, number>; bySource: Record<string, number> };
    semantic: number;
    knowledge: { total: number; byCategory: Record<string, number>; avgSuccessRate: number };
    access: AccessStatistics;
  }> {
    const episodicStats = this.episodicStorage.getIndexStats();
    const semanticCount = await this.semanticStorage.count();
    const knowledgeStats = this.knowledgeStorage.getStats();
    const accessStats = this.getAccessStatistics();
    
    return {
      episodic: episodicStats,
      semantic: semanticCount,
      knowledge: knowledgeStats,
      access: accessStats,
    };
  }
  
  /**
   * 持久化所有存储
   */
  async flush(): Promise<void> {
    await this.episodicStorage.flush();
    await this.semanticStorage.flush();
    await this.knowledgeStorage.flush();
  }
  
  /**
   * 清空所有记忆
   */
  async clear(): Promise<void> {
    await this.episodicStorage.clear();
    await this.semanticStorage.clear();
    await this.knowledgeStorage.clear();
    this.accessTracker.clearAccessLog();
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        'MemoryManager not initialized, call initialize() first'
      );
    }
    
    if (this.destroyed) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        'MemoryManager has been destroyed'
      );
    }
  }
  
  /**
   * 确保存储目录存在
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }
  }
}
