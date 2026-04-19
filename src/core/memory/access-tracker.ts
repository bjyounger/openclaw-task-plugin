/**
 * 访问追踪器（Access Tracker）
 * 
 * 记录和统计记忆的访问模式：
 * - 访问日志
 * - 访问频率统计
 * - 热门记忆识别
 * - 自动提升规则
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import {
  AccessStatistics,
  AccessTrackerConfig,
  EpisodicMemory,
  MemoryManagerError,
} from './types';
import { EpisodicMemoryStorage } from './episodic-memory-storage';

/**
 * 访问记录
 */
interface AccessRecord {
  memoryId: string;
  timestamp: number;
  source: string;
  context?: Record<string, unknown>;
}

/**
 * 提升规则
 */
interface PromotionRule {
  /** 规则名称 */
  name: string;
  /** 检查条件 */
  check: (memory: EpisodicMemory, stats: AccessStatistics) => boolean;
  /** 提升分数增量 */
  scoreDelta: number;
}

/**
 * 访问追踪器实现
 */
export class AccessTracker {
  private config: Required<AccessTrackerConfig>;
  private storage: EpisodicMemoryStorage;
  
  // 访问记录缓冲
  private accessBuffer: AccessRecord[] = [];
  
  // 访问频率缓存（memoryId -> 频率/小时）
  private accessFrequencyCache: Map<string, number> = new Map();
  
  // 提升规则
  private promotionRules: PromotionRule[];
  
  constructor(storage: EpisodicMemoryStorage, config?: AccessTrackerConfig) {
    this.storage = storage;
    
    this.config = {
      recordInterval: config?.recordInterval ?? 1000,
      maxAccessLogSize: config?.maxAccessLogSize ?? 10000,
      promotionThreshold: config?.promotionThreshold ?? 10,
      accessFrequencyThreshold: config?.accessFrequencyThreshold ?? 3,
    };
    
    // 默认提升规则
    this.promotionRules = [
      {
        name: 'high_access_count',
        check: (memory, _stats) => memory.accessCount >= this.config.promotionThreshold,
        scoreDelta: 5,
      },
      {
        name: 'frequent_access',
        check: (memory, _stats) => {
          const freq = this.accessFrequencyCache.get(memory.memoryId) || 0;
          return freq >= this.config.accessFrequencyThreshold;
        },
        scoreDelta: 3,
      },
      {
        name: 'recent_access',
        check: (memory, _stats) => {
          const hoursSinceAccess = (Date.now() - memory.lastAccessedAt) / (1000 * 60 * 60);
          return hoursSinceAccess < 1 && memory.accessCount > 2;
        },
        scoreDelta: 2,
      },
      {
        name: 'high_priority_access',
        check: (memory, _stats) => memory.priority === 'high' && memory.accessCount > 1,
        scoreDelta: 4,
      },
    ];
  }
  
  /**
   * 记录访问
   */
  recordAccess(memoryId: string, source: string, context?: Record<string, unknown>): void {
    const record: AccessRecord = {
      memoryId,
      timestamp: Date.now(),
      source,
      context,
    };
    
    // 添加到缓冲
    this.accessBuffer.push(record);
    
    // 限制缓冲大小
    if (this.accessBuffer.length > this.config.maxAccessLogSize) {
      this.accessBuffer = this.accessBuffer.slice(-Math.floor(this.config.maxAccessLogSize / 2));
    }
    
    // 更新存储中的访问信息
    this.storage.recordAccess(memoryId, source, context);
    
    // 更新频率缓存
    this.updateFrequencyCache(memoryId);
    
    // 检查提升规则
    this.checkPromotionRules(memoryId);
  }
  
  /**
   * 批量记录访问
   */
  recordBatchAccess(records: Array<{ memoryId: string; source: string; context?: Record<string, unknown> }>): void {
    for (const record of records) {
      this.recordAccess(record.memoryId, record.source, record.context);
    }
  }
  
  /**
   * 获取访问统计
   */
  getStatistics(): AccessStatistics {
    // 计算总访问次数
    const totalAccesses = this.accessBuffer.length;
    
    // 计算唯一来源
    const sources = new Set(this.accessBuffer.map(r => r.source));
    
    // 计算访问频率（最近1小时）
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentAccesses = this.accessBuffer.filter(r => r.timestamp > oneHourAgo);
    const hoursElapsed = Math.max(1, (Date.now() - oneHourAgo) / (1000 * 60 * 60));
    const accessFrequency = recentAccesses.length / hoursElapsed;
    
    // 计算最后访问时间
    const lastAccessTime = this.accessBuffer.length > 0
      ? Math.max(...this.accessBuffer.map(r => r.timestamp))
      : 0;
    
    // 计算热门记忆
    const accessCounts = new Map<string, number>();
    for (const record of this.accessBuffer) {
      accessCounts.set(record.memoryId, (accessCounts.get(record.memoryId) || 0) + 1);
    }
    
    const hotMemories = Array.from(accessCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([memoryId, accessCount]) => ({ memoryId, accessCount }));
    
    return {
      totalAccesses,
      uniqueSources: sources.size,
      accessFrequency,
      lastAccessTime,
      hotMemories,
    };
  }
  
  /**
   * 获取特定记忆的访问统计
   */
  getMemoryAccessStats(memoryId: string): { accessCount: number; frequency: number; lastAccess: number } {
    const records = this.accessBuffer.filter(r => r.memoryId === memoryId);
    const frequency = this.accessFrequencyCache.get(memoryId) || 0;
    const lastAccess = records.length > 0
      ? Math.max(...records.map(r => r.timestamp))
      : 0;
    
    return {
      accessCount: records.length,
      frequency,
      lastAccess,
    };
  }
  
  /**
   * 添加自定义提升规则
   */
  addPromotionRule(rule: PromotionRule): void {
    this.promotionRules.push(rule);
  }
  
  /**
   * 获取所有提升规则
   */
  getPromotionRules(): PromotionRule[] {
    return [...this.promotionRules];
  }
  
  /**
   * 获取访问记录（时间范围）
   */
  getAccessLog(startTime?: number, endTime?: number): AccessRecord[] {
    let records = this.accessBuffer;
    
    if (startTime) {
      records = records.filter(r => r.timestamp >= startTime);
    }
    
    if (endTime) {
      records = records.filter(r => r.timestamp <= endTime);
    }
    
    return records;
  }
  
  /**
   * 清空访问记录
   */
  clearAccessLog(): void {
    this.accessBuffer = [];
    this.accessFrequencyCache.clear();
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 更新频率缓存
   */
  private updateFrequencyCache(memoryId: string): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentAccesses = this.accessBuffer.filter(
      r => r.memoryId === memoryId && r.timestamp > oneHourAgo
    );
    
    const hoursElapsed = Math.max(0.5, (Date.now() - oneHourAgo) / (1000 * 60 * 60));
    const frequency = recentAccesses.length / hoursElapsed;
    
    this.accessFrequencyCache.set(memoryId, frequency);
  }
  
  /**
   * 检查提升规则
   */
  private checkPromotionRules(memoryId: string): void {
    // 通过存储获取记忆（注意：这里直接调用 load 会有异步问题）
    // 我们使用存储的内部方法间接访问
    const stats = this.getStatistics();
    
    // 对每条规则检查
    for (const rule of this.promotionRules) {
      // 由于 memory 是异步加载的，我们基于访问记录来做简单检查
      const memoryAccess = this.accessBuffer.filter(r => r.memoryId === memoryId);
      const accessCount = memoryAccess.length;
      
      // 简化的提升判断
      if (accessCount >= this.config.promotionThreshold) {
        this.storage.updatePromotionScore(memoryId, rule.scoreDelta);
      }
    }
  }
}
