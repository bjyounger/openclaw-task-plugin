/**
 * 知识存储（Knowledge Storage）
 * 
 * 最高层级的知识存储，可复用的经验卡片
 * - 最佳实践（best_practice）
 * - 教训总结（lesson_learned）
 * - 模式（pattern）
 * - 参考资料（reference）
 * - 工具使用（tool_usage）
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Knowledge,
  MemoryManagerError,
  generateKnowledgeId,
} from './types';

/**
 * 知识查询参数
 */
export interface KnowledgeQuery {
  /** 分类过滤 */
  category?: Knowledge['category'];
  
  /** 标签过滤 */
  tags?: string[];
  
  /** 全文搜索 */
  searchText?: string;
  
  /** 适用场景搜索 */
  applicability?: string;
  
  /** 限制数量 */
  limit?: number;
  
  /** 偏移量 */
  offset?: number;
}

/**
 * 知识存储配置
 */
export interface KnowledgeStorageConfig {
  /** 存储目录 */
  storageDir?: string;
  
  /** 是否启用持久化 */
  enablePersistence?: boolean;
}

/**
 * 知识存储实现
 */
export class KnowledgeStorage {
  private config: Required<KnowledgeStorageConfig>;
  private knowledge: Map<string, Knowledge> = new Map();
  
  // 标签索引
  private tagIndex: Map<string, Set<string>> = new Map();
  
  // 分类索引
  private categoryIndex: Map<string, Set<string>> = new Map();
  
  // 关键词索引
  private keywordIndex: Map<string, Set<string>> = new Set() as any as Map<string, Set<string>>;
  
  private dirty: boolean = false;
  
  constructor(config?: KnowledgeStorageConfig) {
    this.config = {
      storageDir: config?.storageDir || '/tmp/openclaw/memory/knowledge',
      enablePersistence: config?.enablePersistence ?? true,
    };
    
    if (this.config.enablePersistence) {
      this.ensureStorageDir();
      this.loadFromDisk();
    }
  }
  
  /**
   * 保存知识
   */
  async save(knowledge: Knowledge): Promise<void> {
    if (!knowledge.knowledgeId) {
      throw new MemoryManagerError('INVALID_MEMORY', 'Knowledge ID is required');
    }
    
    // 清除旧索引
    const existing = this.knowledge.get(knowledge.knowledgeId);
    if (existing) {
      this.removeFromIndexes(existing);
    }
    
    // 保存
    this.knowledge.set(knowledge.knowledgeId, knowledge);
    
    // 更新索引
    this.addToIndexes(knowledge);
    
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
  }
  
  /**
   * 加载知识
   */
  async load(id: string): Promise<Knowledge | undefined> {
    return this.knowledge.get(id);
  }
  
  /**
   * 删除知识
   */
  async delete(id: string): Promise<boolean> {
    const knowledge = this.knowledge.get(id);
    if (!knowledge) return false;
    
    this.removeFromIndexes(knowledge);
    this.knowledge.delete(id);
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
    
    return true;
  }
  
  /**
   * 查询知识
   */
  async query(query: KnowledgeQuery): Promise<Knowledge[]> {
    let candidates: Set<string> | null = null;
    
    // 分类过滤
    if (query.category) {
      const ids = this.categoryIndex.get(query.category);
      candidates = ids ? new Set(ids) : new Set();
    }
    
    // 标签过滤
    if (query.tags && query.tags.length > 0) {
      const tagSet = new Set<string>();
      for (const tag of query.tags) {
        const ids = this.tagIndex.get(tag.toLowerCase());
        if (ids) {
          for (const id of ids) tagSet.add(id);
        }
      }
      candidates = this.intersect(candidates, tagSet);
    }
    
    // 适用场景搜索
    if (query.applicability) {
      const appSet = new Set<string>();
      const searchTerm = query.applicability.toLowerCase();
      for (const [id, k] of this.knowledge) {
        if (k.applicability.some(a => a.toLowerCase().includes(searchTerm))) {
          appSet.add(id);
        }
      }
      candidates = this.intersect(candidates, appSet);
    }
    
    // 全文搜索
    if (query.searchText) {
      const searchSet = new Set<string>();
      const terms = query.searchText.toLowerCase().split(/\s+/).filter(Boolean);
      for (const [id, k] of this.knowledge) {
        const text = `${k.title} ${k.description} ${k.content}`.toLowerCase();
        if (terms.every(term => text.includes(term))) {
          searchSet.add(id);
        }
      }
      candidates = this.intersect(candidates, searchSet);
    }
    
    // 如果没有过滤条件
    if (candidates === null) {
      candidates = new Set(this.knowledge.keys());
    }
    
    // 排序（按使用次数降序）
    let result = Array.from(candidates)
      .map(id => this.knowledge.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.usageCount - a.usageCount);
    
    // 分页
    const offset = query.offset || 0;
    const limit = query.limit || result.length;
    
    return result.slice(offset, offset + limit);
  }
  
  /**
   * 创建知识卡片
   */
  async create(params: {
    category: Knowledge['category'];
    title: string;
    description: string;
    content: string;
    tags?: string[];
    applicability?: string[];
    warnings?: string[];
    source?: Knowledge['source'];
    relatedKnowledgeIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Knowledge> {
    const now = Date.now();
    
    const knowledge: Knowledge = {
      knowledgeId: generateKnowledgeId(),
      category: params.category,
      title: params.title,
      description: params.description,
      content: params.content,
      tags: params.tags || [],
      applicability: params.applicability || [],
      warnings: params.warnings,
      source: params.source || {
        type: 'experience',
        reference: 'manual',
      },
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      successRate: 1.0,
      relatedKnowledgeIds: params.relatedKnowledgeIds,
      metadata: params.metadata,
    };
    
    await this.save(knowledge);
    return knowledge;
  }
  
  /**
   * 记录知识使用
   */
  async recordUsage(knowledgeId: string, success: boolean): Promise<void> {
    const knowledge = this.knowledge.get(knowledgeId);
    if (!knowledge) return;
    
    knowledge.usageCount++;
    // 更新成功率（指数移动平均）
    const alpha = 0.2;
    knowledge.successRate = knowledge.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    knowledge.updatedAt = Date.now();
    
    await this.save(knowledge);
  }
  
  /**
   * 计数
   */
  async count(): Promise<number> {
    return this.knowledge.size;
  }
  
  /**
   * 持久化到磁盘
   */
  async flush(): Promise<void> {
    if (!this.config.enablePersistence) return;
    
    const filePath = path.join(this.config.storageDir, 'knowledge-cards.json');
    const data = Array.from(this.knowledge.values());
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      throw new MemoryManagerError(
        'STORAGE_ERROR',
        `Failed to flush knowledge: ${error instanceof Error ? error.message : String(error)}`,
        { filePath, originalError: error }
      );
    }
  }
  
  /**
   * 清空所有知识
   */
  async clear(): Promise<void> {
    this.knowledge.clear();
    this.tagIndex.clear();
    this.categoryIndex.clear();
    this.dirty = true;
    
    if (this.config.enablePersistence) {
      await this.flush();
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats(): { total: number; byCategory: Record<string, number>; avgSuccessRate: number } {
    const byCategory: Record<string, number> = {};
    let totalSuccessRate = 0;
    
    for (const k of this.knowledge.values()) {
      byCategory[k.category] = (byCategory[k.category] || 0) + 1;
      totalSuccessRate += k.successRate;
    }
    
    return {
      total: this.knowledge.size,
      byCategory,
      avgSuccessRate: this.knowledge.size > 0 ? totalSuccessRate / this.knowledge.size : 0,
    };
  }
  
  // ==================== 私有方法 ====================
  
  private addToIndexes(knowledge: Knowledge): void {
    // 标签索引
    for (const tag of knowledge.tags) {
      const lowerTag = tag.toLowerCase();
      if (!this.tagIndex.has(lowerTag)) {
        this.tagIndex.set(lowerTag, new Set());
      }
      this.tagIndex.get(lowerTag)!.add(knowledge.knowledgeId);
    }
    
    // 分类索引
    if (!this.categoryIndex.has(knowledge.category)) {
      this.categoryIndex.set(knowledge.category, new Set());
    }
    this.categoryIndex.get(knowledge.category)!.add(knowledge.knowledgeId);
  }
  
  private removeFromIndexes(knowledge: Knowledge): void {
    for (const tag of knowledge.tags) {
      const lowerTag = tag.toLowerCase();
      const ids = this.tagIndex.get(lowerTag);
      if (ids) {
        ids.delete(knowledge.knowledgeId);
        if (ids.size === 0) this.tagIndex.delete(lowerTag);
      }
    }
    
    const catIds = this.categoryIndex.get(knowledge.category);
    if (catIds) {
      catIds.delete(knowledge.knowledgeId);
      if (catIds.size === 0) this.categoryIndex.delete(knowledge.category);
    }
  }
  
  private intersect(a: Set<string> | null, b: Set<string>): Set<string> {
    if (a === null) return b;
    return new Set([...a].filter(x => b.has(x)));
  }
  
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }
  }
  
  private loadFromDisk(): void {
    const filePath = path.join(this.config.storageDir, 'knowledge-cards.json');
    if (!fs.existsSync(filePath)) return;
    
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const items: Knowledge[] = JSON.parse(data);
      for (const k of items) {
        this.knowledge.set(k.knowledgeId, k);
        this.addToIndexes(k);
      }
    } catch (error) {
      console.error('Failed to load knowledge:', error);
    }
  }
}
