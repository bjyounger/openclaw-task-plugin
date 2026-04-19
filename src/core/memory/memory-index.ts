/**
 * 记忆索引
 * 
 * 提供时间索引、标签索引、全文索引三种索引机制
 * 用于高效查询记忆
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import { MemoryQuery, MemoryStatus, MemoryPriority, MemorySource } from './types';

/**
 * 索引条目
 */
interface IndexEntry {
  memoryId: string;
  timestamp: number;
  tags: string[];
  source: MemorySource;
  priority: MemoryPriority;
  status: MemoryStatus;
  searchText: string;
  keywords: string[];
  lastAccessedAt: number;
  accessCount: number;
  promotionScore: number;
}

/**
 * 记忆索引
 * 
 * 内存索引，支持：
 * 1. 时间索引 - 按创建时间快速检索
 * 2. 标签索引 - 按标签快速过滤
 * 3. 全文索引 - 按关键词搜索
 */
export class MemoryIndex {
  // 主索引：memoryId -> 索引条目
  private entries: Map<string, IndexEntry> = new Map();
  
  // 时间索引：排序的memoryId数组（按时间降序）
  private timeIndex: string[] = [];
  
  // 标签索引：tag -> memoryId集合
  private tagIndex: Map<string, Set<string>> = new Map();
  
  // 来源索引：source -> memoryId集合
  private sourceIndex: Map<string, Set<string>> = new Map();
  
  // 全文索引：关键词 -> memoryId集合（小写）
  private textIndex: Map<string, Set<string>> = new Map();
  
  // 状态索引：status -> memoryId集合
  private statusIndex: Map<string, Set<string>> = new Map();
  
  // 优先级索引：priority -> memoryId集合
  private priorityIndex: Map<string, Set<string>> = new Map();
  
  // 是否需要重新排序
  private dirty: boolean = false;
  
  /**
   * 添加或更新索引条目
   */
  index(entry: IndexEntry): void {
    const existing = this.entries.get(entry.memoryId);
    
    // 如果已存在，先清除旧索引
    if (existing) {
      this.removeFromSecondaryIndexes(existing);
    }
    
    // 保存新条目
    this.entries.set(entry.memoryId, entry);
    
    // 更新二级索引
    this.addToSecondaryIndexes(entry);
    
    // 标记需要排序
    this.dirty = true;
  }
  
  /**
   * 删除索引条目
   */
  remove(memoryId: string): boolean {
    const entry = this.entries.get(memoryId);
    if (!entry) return false;
    
    // 从二级索引中移除
    this.removeFromSecondaryIndexes(entry);
    
    // 从主索引中移除
    this.entries.delete(memoryId);
    
    // 从时间索引中移除
    const timeIdx = this.timeIndex.indexOf(memoryId);
    if (timeIdx !== -1) {
      this.timeIndex.splice(timeIdx, 1);
    }
    
    return true;
  }
  
  /**
   * 查询记忆ID列表
   */
  query(query: MemoryQuery): string[] {
    // 先确保时间索引已排序
    this.ensureSorted();
    
    let candidates: Set<string> | null = null;
    
    // 按状态过滤
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      const statusSet = new Set<string>();
      for (const status of statuses) {
        const ids = this.statusIndex.get(status);
        if (ids) {
          for (const id of ids) statusSet.add(id);
        }
      }
      candidates = this.intersect(candidates, statusSet);
    }
    
    // 按来源过滤
    if (query.source) {
      const sources = Array.isArray(query.source) ? query.source : [query.source];
      const sourceSet = new Set<string>();
      for (const source of sources) {
        const ids = this.sourceIndex.get(source);
        if (ids) {
          for (const id of ids) sourceSet.add(id);
        }
      }
      candidates = this.intersect(candidates, sourceSet);
    }
    
    // 按优先级过滤
    if (query.priority) {
      const priorities = Array.isArray(query.priority) ? query.priority : [query.priority];
      const prioritySet = new Set<string>();
      for (const priority of priorities) {
        const ids = this.priorityIndex.get(priority);
        if (ids) {
          for (const id of ids) prioritySet.add(id);
        }
      }
      candidates = this.intersect(candidates, prioritySet);
    }
    
    // 按标签过滤
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
    
    // 按关键词搜索
    if (query.keywords && query.keywords.length > 0) {
      const keywordSet = new Set<string>();
      for (const keyword of query.keywords) {
        const ids = this.textIndex.get(keyword.toLowerCase());
        if (ids) {
          for (const id of ids) keywordSet.add(id);
        }
      }
      candidates = this.intersect(candidates, keywordSet);
    }
    
    // 全文搜索
    if (query.searchText) {
      const terms = query.searchText.toLowerCase().split(/\s+/).filter(Boolean);
      const searchSet = new Set<string>();
      for (const term of terms) {
        // 前缀匹配
        for (const [key, ids] of this.textIndex) {
          if (key.includes(term)) {
            for (const id of ids) searchSet.add(id);
          }
        }
      }
      candidates = this.intersect(candidates, searchSet);
    }
    
    // 如果没有过滤条件，使用所有记忆
    if (candidates === null) {
      candidates = new Set(this.timeIndex);
    }
    
    // 按时间范围过滤
    let result = Array.from(candidates);
    
    if (query.startTime) {
      result = result.filter(id => {
        const entry = this.entries.get(id);
        return entry && entry.timestamp >= query.startTime!;
      });
    }
    
    if (query.endTime) {
      result = result.filter(id => {
        const entry = this.entries.get(id);
        return entry && entry.timestamp <= query.endTime!;
      });
    }
    
    // 排序
    const orderBy = query.orderBy || 'createdAt';
    const direction = query.orderDirection || 'desc';
    
    result.sort((a, b) => {
      const entryA = this.entries.get(a);
      const entryB = this.entries.get(b);
      if (!entryA || !entryB) return 0;
      
      let cmp = 0;
      switch (orderBy) {
        case 'createdAt':
          cmp = entryA.timestamp - entryB.timestamp;
          break;
        case 'lastAccessedAt':
          cmp = entryA.lastAccessedAt - entryB.lastAccessedAt;
          break;
        case 'accessCount':
          cmp = entryA.accessCount - entryB.accessCount;
          break;
        case 'promotionScore':
          cmp = entryA.promotionScore - entryB.promotionScore;
          break;
      }
      
      return direction === 'desc' ? -cmp : cmp;
    });
    
    // 分页
    const offset = query.offset || 0;
    const limit = query.limit || result.length;
    
    return result.slice(offset, offset + limit);
  }
  
  /**
   * 获取索引条目
   */
  get(memoryId: string): IndexEntry | undefined {
    return this.entries.get(memoryId);
  }
  
  /**
   * 获取所有标签
   */
  getAllTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }
  
  /**
   * 获取统计信息
   */
  getStats(): { total: number; byStatus: Record<string, number>; bySource: Record<string, number> } {
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    
    for (const entry of this.entries.values()) {
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
    }
    
    return {
      total: this.entries.size,
      byStatus,
      bySource,
    };
  }
  
  /**
   * 清空索引
   */
  clear(): void {
    this.entries.clear();
    this.timeIndex = [];
    this.tagIndex.clear();
    this.sourceIndex.clear();
    this.textIndex.clear();
    this.statusIndex.clear();
    this.priorityIndex.clear();
    this.dirty = false;
  }
  
  /**
   * 获取索引大小
   */
  get size(): number {
    return this.entries.size;
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 添加到二级索引
   */
  private addToSecondaryIndexes(entry: IndexEntry): void {
    // 标签索引
    for (const tag of entry.tags) {
      const lowerTag = tag.toLowerCase();
      if (!this.tagIndex.has(lowerTag)) {
        this.tagIndex.set(lowerTag, new Set());
      }
      this.tagIndex.get(lowerTag)!.add(entry.memoryId);
    }
    
    // 来源索引
    if (!this.sourceIndex.has(entry.source)) {
      this.sourceIndex.set(entry.source, new Set());
    }
    this.sourceIndex.get(entry.source)!.add(entry.memoryId);
    
    // 状态索引
    if (!this.statusIndex.has(entry.status)) {
      this.statusIndex.set(entry.status, new Set());
    }
    this.statusIndex.get(entry.status)!.add(entry.memoryId);
    
    // 优先级索引
    if (!this.priorityIndex.has(entry.priority)) {
      this.priorityIndex.set(entry.priority, new Set());
    }
    this.priorityIndex.get(entry.priority)!.add(entry.memoryId);
    
    // 全文索引（标题 + 摘要分词）
    const textToIndex = entry.searchText.toLowerCase();
    const words = this.tokenize(textToIndex);
    for (const word of words) {
      if (!this.textIndex.has(word)) {
        this.textIndex.set(word, new Set());
      }
      this.textIndex.get(word)!.add(entry.memoryId);
    }
    
    // 关键词索引
    for (const keyword of entry.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (!this.textIndex.has(lowerKeyword)) {
        this.textIndex.set(lowerKeyword, new Set());
      }
      this.textIndex.get(lowerKeyword)!.add(entry.memoryId);
    }
  }
  
  /**
   * 从二级索引中移除
   */
  private removeFromSecondaryIndexes(entry: IndexEntry): void {
    // 标签索引
    for (const tag of entry.tags) {
      const lowerTag = tag.toLowerCase();
      const ids = this.tagIndex.get(lowerTag);
      if (ids) {
        ids.delete(entry.memoryId);
        if (ids.size === 0) this.tagIndex.delete(lowerTag);
      }
    }
    
    // 来源索引
    const sourceIds = this.sourceIndex.get(entry.source);
    if (sourceIds) {
      sourceIds.delete(entry.memoryId);
      if (sourceIds.size === 0) this.sourceIndex.delete(entry.source);
    }
    
    // 状态索引
    const statusIds = this.statusIndex.get(entry.status);
    if (statusIds) {
      statusIds.delete(entry.memoryId);
      if (statusIds.size === 0) this.statusIndex.delete(entry.status);
    }
    
    // 优先级索引
    const priorityIds = this.priorityIndex.get(entry.priority);
    if (priorityIds) {
      priorityIds.delete(entry.memoryId);
      if (priorityIds.size === 0) this.priorityIndex.delete(entry.priority);
    }
    
    // 全文索引
    const textToIndex = entry.searchText.toLowerCase();
    const words = this.tokenize(textToIndex);
    for (const word of [...words, ...entry.keywords.map(k => k.toLowerCase())]) {
      const textIds = this.textIndex.get(word);
      if (textIds) {
        textIds.delete(entry.memoryId);
        if (textIds.size === 0) this.textIndex.delete(word);
      }
    }
  }
  
  /**
   * 集合交集
   */
  private intersect(a: Set<string> | null, b: Set<string>): Set<string> {
    if (a === null) return b;
    return new Set([...a].filter(x => b.has(x)));
  }
  
  /**
   * 确保时间索引已排序
   */
  private ensureSorted(): void {
    if (!this.dirty) return;
    
    this.timeIndex = Array.from(this.entries.keys()).sort((a, b) => {
      const entryA = this.entries.get(a);
      const entryB = this.entries.get(b);
      if (!entryA || !entryB) return 0;
      return entryB.timestamp - entryA.timestamp; // 降序
    });
    
    this.dirty = false;
  }
  
  /**
   * 简单分词
   */
  private tokenize(text: string): string[] {
    // 按空格、标点符号分割，过滤空字符串和过短的词
    return text
      .split(/[\s,.;:!?()[\]{}'"\/\\]+/)
      .filter(word => word.length > 1);
  }
}
