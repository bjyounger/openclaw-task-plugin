/**
 * 语义记忆存储（Semantic Memory Storage）
 * 
 * 持久化存储，用于长效结构化记忆
 * - 事实（fact）
 * - 流程（procedure）
 * - 概念（concept）
 * - 偏好（preference）
 * - 决策（decision）
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  SemanticMemory, 
  MemoryQuery, 
  IMemoryStorage,
  MemoryManagerError,
  generateMemoryId,
} from './types';
import { MemoryIndex } from './memory-index';

/**
 * 语义记忆存储配置
 */
export interface SemanticMemoryStorageConfig {
  /** 存储目录 */
  storageDir?: string;
  
  /** 是否启用持久化 */
  enablePersistence?: boolean;
}

/**
 * 语义记忆存储实现
 */
export class SemanticMemoryStorage implements IMemoryStorage<SemanticMemory> {
  private config: Required<SemanticMemoryStorageConfig>;
  private memories: Map<string, SemanticMemory> = new Map();
  private index: MemoryIndex = new MemoryIndex();
  private dirty: boolean = false;
  
  constructor(config?: SemanticMemoryStorageConfig) {
    this.config = {
      storageDir: config?.storageDir || '/tmp/openclaw/memory/semantic',
      enablePersistence: config?.enablePersistence ?? true,
    };
    
    if (this.config.enablePersistence) {
      this.ensureStorageDir();
      this.loadFromDisk();
    }
  }
  
  /**
   * 保存语义记忆
   */
  async save(memory: SemanticMemory): Promise<void> {
    if (!memory.memoryId) {
      throw new MemoryManagerError('INVALID_MEMORY', 'Memory ID is required');
    }
    
    this.memories.set(memory.memoryId, memory);
    
    this.index.index({
      memoryId: memory.memoryId,
      timestamp: memory.createdAt,
      tags: memory.keywords,
      source: 'knowledge_gap' as any, // 语义记忆来源固定
      priority: 'high' as any,
      status: 'active' as any,
      searchText: `${memory.title} ${memory.content}`,
      keywords: memory.keywords,
      lastAccessedAt: memory.lastAccessedAt,
      accessCount: memory.accessCount,
      promotionScore: memory.confidence,
    });
    
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
  }
  
  /**
   * 加载语义记忆
   */
  async load(id: string): Promise<SemanticMemory | undefined> {
    const memory = this.memories.get(id);
    if (memory) {
      memory.lastAccessedAt = Date.now();
      memory.accessCount++;
    }
    return memory;
  }
  
  /**
   * 批量加载
   */
  async loadBatch(ids: string[]): Promise<SemanticMemory[]> {
    const results: SemanticMemory[] = [];
    for (const id of ids) {
      const memory = await this.load(id);
      if (memory) results.push(memory);
    }
    return results;
  }
  
  /**
   * 查询语义记忆
   */
  async query(query: MemoryQuery): Promise<SemanticMemory[]> {
    // 转换查询参数为索引查询
    const memoryIds = this.index.query({
      keywords: query.keywords,
      searchText: query.searchText,
      startTime: query.startTime,
      endTime: query.endTime,
      limit: query.limit,
      offset: query.offset,
      orderBy: query.orderBy,
      orderDirection: query.orderDirection,
    });
    
    const results: SemanticMemory[] = [];
    for (const id of memoryIds) {
      const memory = this.memories.get(id);
      if (memory) results.push(memory);
    }
    
    // 类型过滤
    if (query.source) {
      // 在语义记忆中，source 被重新映射为 type
      const types = Array.isArray(query.source) ? query.source : [query.source];
      return results.filter(m => types.includes(m.type as any));
    }
    
    return results;
  }
  
  /**
   * 删除语义记忆
   */
  async delete(id: string): Promise<boolean> {
    const memory = this.memories.get(id);
    if (!memory) return false;
    
    this.memories.delete(id);
    this.index.remove(id);
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
    
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
   * 归档语义记忆（语义记忆不真正归档，标记即可）
   */
  async archive(id: string): Promise<void> {
    // 语义记忆一般不归档，但保留接口兼容
  }
  
  /**
   * 清空所有
   */
  async clear(): Promise<void> {
    this.memories.clear();
    this.index.clear();
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
  }
  
  /**
   * 计数
   */
  async count(): Promise<number> {
    return this.memories.size;
  }
  
  /**
   * 创建语义记忆
   */
  async create(params: {
    type: SemanticMemory['type'];
    title: string;
    content: string;
    keywords?: string[];
    confidence?: number;
    sourceMemoryIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<SemanticMemory> {
    const now = Date.now();
    
    const memory: SemanticMemory = {
      memoryId: generateMemoryId(),
      type: params.type,
      title: params.title,
      content: params.content,
      keywords: params.keywords || [],
      confidence: params.confidence ?? 0.5,
      sourceMemoryIds: params.sourceMemoryIds || [],
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      verified: false,
      metadata: params.metadata,
    };
    
    await this.save(memory);
    return memory;
  }
  
  /**
   * 验证语义记忆
   */
  async verify(memoryId: string, result: 'confirmed' | 'rejected' | 'updated', reason?: string): Promise<void> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      throw new MemoryManagerError('MEMORY_NOT_FOUND', `Semantic memory not found: ${memoryId}`);
    }
    
    memory.verified = result === 'confirmed';
    if (!memory.verificationLog) {
      memory.verificationLog = [];
    }
    memory.verificationLog.push({
      timestamp: Date.now(),
      result,
      reason,
    });
    memory.updatedAt = Date.now();
    
    await this.save(memory);
  }
  
  /**
   * 按关键词搜索
   */
  async searchByKeywords(keywords: string[], limit?: number): Promise<SemanticMemory[]> {
    return this.query({
      keywords,
      limit: limit || 10,
    });
  }
  
  /**
   * 持久化到磁盘
   */
  async flush(): Promise<void> {
    if (!this.config.enablePersistence) return;
    
    const filePath = path.join(this.config.storageDir, 'semantic-memories.json');
    const data = Array.from(this.memories.values());
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        `Failed to flush semantic memories: ${error instanceof Error ? error.message : String(error)}`,
        { filePath, originalError: error }
      );
    }
  }
  
  // ==================== 私有方法 ====================
  
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }
  }
  
  private loadFromDisk(): void {
    const filePath = path.join(this.config.storageDir, 'semantic-memories.json');
    
    if (!fs.existsSync(filePath)) return;
    
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const memories: SemanticMemory[] = JSON.parse(data);
      
      for (const memory of memories) {
        this.memories.set(memory.memoryId, memory);
        this.index.index({
          memoryId: memory.memoryId,
          timestamp: memory.createdAt,
          tags: memory.keywords,
          source: 'knowledge_gap' as any,
          priority: 'high' as any,
          status: 'active' as any,
          searchText: `${memory.title} ${memory.content}`,
          keywords: memory.keywords,
          lastAccessedAt: memory.lastAccessedAt,
          accessCount: memory.accessCount,
          promotionScore: memory.confidence,
        });
      }
    } catch (error) {
      console.error('Failed to load semantic memories:', error);
    }
  }
}
