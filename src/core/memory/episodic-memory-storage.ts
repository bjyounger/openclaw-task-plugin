/**
 * 情境记忆存储（Episodic Memory Storage）
 * 
 * 内存级存储，支持：
 * - CRUD 操作
 * - 索引查询
 * - 自动归档（超过容量时）
 * - 持久化（可选）
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  EpisodicMemory, 
  MemoryQuery, 
  IMemoryStorage,
  MemorySource,
  MemoryPriority,
  MemoryStatus,
  MemoryManagerError,
  generateMemoryId,
  AccessLog,
} from './types';
import { MemoryIndex } from './memory-index';

/**
 * 情境记忆存储配置
 */
export interface EpisodicMemoryStorageConfig {
  /** 存储目录（用于持久化） */
  storageDir?: string;
  
  /** 最大记忆数量 */
  maxMemories?: number;
  
  /** 记忆过期时间（毫秒），0表示不过期 */
  ttl?: number;
  
  /** 是否启用持久化 */
  enablePersistence?: boolean;
  
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
}

/**
 * 情境记忆存储实现
 */
export class EpisodicMemoryStorage implements IMemoryStorage<EpisodicMemory> {
  private config: Required<EpisodicMemoryStorageConfig>;
  
  // 内存存储
  private memories: Map<string, EpisodicMemory> = new Map();
  
  // 索引
  private index: MemoryIndex = new MemoryIndex();
  
  // 持久化
  private autoSaveTimer?: ReturnType<typeof setInterval>;
  private dirty: boolean = false;
  
  constructor(config?: EpisodicMemoryStorageConfig) {
    this.config = {
      storageDir: config?.storageDir || '/tmp/openclaw/memory/episodic',
      maxMemories: config?.maxMemories ?? 1000,
      ttl: config?.ttl ?? 0,
      enablePersistence: config?.enablePersistence ?? false,
      autoSaveInterval: config?.autoSaveInterval ?? 60000,
    };
    
    if (this.config.enablePersistence) {
      this.ensureStorageDir();
      this.loadFromDisk();
      this.startAutoSave();
    }
  }
  
  /**
   * 保存记忆
   */
  async save(memory: EpisodicMemory): Promise<void> {
    // 验证
    if (!memory.memoryId) {
      throw new MemoryManagerError('INVALID_MEMORY', 'Memory ID is required');
    }
    
    // 检查容量
    if (!this.memories.has(memory.memoryId) && this.memories.size >= this.config.maxMemories) {
      await this.evictOldest();
    }
    
    // 保存
    this.memories.set(memory.memoryId, memory);
    
    // 更新索引
    this.index.index({
      memoryId: memory.memoryId,
      timestamp: memory.createdAt,
      tags: memory.tags,
      source: memory.source,
      priority: memory.priority,
      status: memory.status,
      searchText: `${memory.title} ${memory.summary}`,
      keywords: memory.tags,
      lastAccessedAt: memory.lastAccessedAt,
      accessCount: memory.accessCount,
      promotionScore: memory.promotionScore,
    });
    
    this.dirty = true;
  }
  
  /**
   * 加载记忆
   */
  async load(id: string): Promise<EpisodicMemory | undefined> {
    const memory = this.memories.get(id);
    
    if (memory) {
      // 检查是否过期
      if (this.isExpired(memory)) {
        await this.delete(id);
        return undefined;
      }
    }
    
    return memory;
  }
  
  /**
   * 批量加载
   */
  async loadBatch(ids: string[]): Promise<EpisodicMemory[]> {
    const results: EpisodicMemory[] = [];
    for (const id of ids) {
      const memory = await this.load(id);
      if (memory) results.push(memory);
    }
    return results;
  }
  
  /**
   * 查询记忆
   */
  async query(query: MemoryQuery): Promise<EpisodicMemory[]> {
    const memoryIds = this.index.query(query);
    const results: EpisodicMemory[] = [];
    
    for (const id of memoryIds) {
      const memory = this.memories.get(id);
      if (memory && !this.isExpired(memory)) {
        results.push(memory);
      }
    }
    
    return results;
  }
  
  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const memory = this.memories.get(id);
    if (!memory) return false;
    
    this.memories.delete(id);
    this.index.remove(id);
    this.dirty = true;
    
    return true;
  }
  
  /**
   * 批量删除
   */
  async deleteBatch(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) deleted++;
    }
    return deleted;
  }
  
  /**
   * 归档记忆
   */
  async archive(id: string): Promise<void> {
    const memory = this.memories.get(id);
    if (!memory) {
      throw new MemoryManagerError('MEMORY_NOT_FOUND', `Memory not found: ${id}`);
    }
    
    memory.status = 'archived';
    this.index.index({
      memoryId: memory.memoryId,
      timestamp: memory.createdAt,
      tags: memory.tags,
      source: memory.source,
      priority: memory.priority,
      status: memory.status,
      searchText: `${memory.title} ${memory.summary}`,
      keywords: memory.tags,
      lastAccessedAt: memory.lastAccessedAt,
      accessCount: memory.accessCount,
      promotionScore: memory.promotionScore,
    });
    
    this.dirty = true;
  }
  
  /**
   * 清空所有
   */
  async clear(): Promise<void> {
    this.memories.clear();
    this.index.clear();
    this.dirty = true;
  }
  
  /**
   * 计数
   */
  async count(): Promise<number> {
    return this.memories.size;
  }
  
  /**
   * 创建新的情境记忆
   */
  async create(params: {
    source: MemorySource;
    priority?: MemoryPriority;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    tags?: string[];
    relatedTaskIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<EpisodicMemory> {
    const now = Date.now();
    
    const memory: EpisodicMemory = {
      memoryId: generateMemoryId(),
      source: params.source,
      priority: params.priority || 'medium',
      status: 'active',
      title: params.title,
      summary: params.summary,
      content: params.content,
      tags: params.tags || [],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      accessLog: [],
      relatedTaskIds: params.relatedTaskIds,
      promotionScore: 0,
      metadata: params.metadata,
    };
    
    await this.save(memory);
    return memory;
  }
  
  /**
   * 记录访问
   */
  recordAccess(memoryId: string, source: string, context?: Record<string, unknown>): void {
    const memory = this.memories.get(memoryId);
    if (!memory) return;
    
    const now = Date.now();
    
    // 更新访问信息
    memory.lastAccessedAt = now;
    memory.accessCount++;
    
    // 添加访问记录
    const log: AccessLog = {
      timestamp: now,
      source,
      context,
    };
    memory.accessLog.push(log);
    
    // 限制访问记录大小
    if (memory.accessLog.length > 100) {
      memory.accessLog = memory.accessLog.slice(-50);
    }
    
    // 更新索引
    this.index.index({
      memoryId: memory.memoryId,
      timestamp: memory.createdAt,
      tags: memory.tags,
      source: memory.source,
      priority: memory.priority,
      status: memory.status,
      searchText: `${memory.title} ${memory.summary}`,
      keywords: memory.tags,
      lastAccessedAt: memory.lastAccessedAt,
      accessCount: memory.accessCount,
      promotionScore: memory.promotionScore,
    });
    
    this.dirty = true;
  }
  
  /**
   * 更新提升分数
   */
  updatePromotionScore(memoryId: string, delta: number): void {
    const memory = this.memories.get(memoryId);
    if (!memory) return;
    
    memory.promotionScore += delta;
    
    // 更新索引
    this.index.index({
      memoryId: memory.memoryId,
      timestamp: memory.createdAt,
      tags: memory.tags,
      source: memory.source,
      priority: memory.priority,
      status: memory.status,
      searchText: `${memory.title} ${memory.summary}`,
      keywords: memory.tags,
      lastAccessedAt: memory.lastAccessedAt,
      accessCount: memory.accessCount,
      promotionScore: memory.promotionScore,
    });
    
    this.dirty = true;
  }
  
  /**
   * 获取索引统计
   */
  getIndexStats() {
    return this.index.getStats();
  }
  
  /**
   * 持久化到磁盘
   */
  async flush(): Promise<void> {
    if (!this.config.enablePersistence) return;
    
    const filePath = path.join(this.config.storageDir, 'episodic-memories.json');
    const data = Array.from(this.memories.values());
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        `Failed to flush memories: ${error instanceof Error ? error.message : String(error)}`,
        { filePath, originalError: error }
      );
    }
  }
  
  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
    
    if (this.dirty && this.config.enablePersistence) {
      await this.flush();
    }
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 检查记忆是否过期
   */
  private isExpired(memory: EpisodicMemory): boolean {
    if (this.config.ttl === 0) return false;
    return Date.now() - memory.createdAt > this.config.ttl;
  }
  
  /**
   * 驱逐最旧的记忆
   */
  private async evictOldest(): Promise<void> {
    // 按提升分数排序，分数最低的优先淘汰
    const entries = Array.from(this.memories.values())
      .filter(m => m.status === 'active')
      .sort((a, b) => a.promotionScore - b.promotionScore);
    
    if (entries.length > 0) {
      // 归档而不是删除
      await this.archive(entries[0].memoryId);
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
  
  /**
   * 从磁盘加载
   */
  private loadFromDisk(): void {
    const filePath = path.join(this.config.storageDir, 'episodic-memories.json');
    
    if (!fs.existsSync(filePath)) return;
    
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const memories: EpisodicMemory[] = JSON.parse(data);
      
      for (const memory of memories) {
        this.memories.set(memory.memoryId, memory);
        this.index.index({
          memoryId: memory.memoryId,
          timestamp: memory.createdAt,
          tags: memory.tags,
          source: memory.source,
          priority: memory.priority,
          status: memory.status,
          searchText: `${memory.title} ${memory.summary}`,
          keywords: memory.tags,
          lastAccessedAt: memory.lastAccessedAt,
          accessCount: memory.accessCount,
          promotionScore: memory.promotionScore,
        });
      }
    } catch (error) {
      // 加载失败不阻塞，重新开始
      console.error('Failed to load episodic memories:', error);
    }
  }
  
  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.flush().catch(err => {
          console.error('Auto-save failed:', err);
        });
      }
    }, this.config.autoSaveInterval);
  }
}
