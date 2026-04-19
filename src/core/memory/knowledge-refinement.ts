/**
 * 知识提炼器（Knowledge Refinement）
 * 
 * 从情境记忆中提炼语义记忆和知识：
 * - 相似度聚类
 * - 模式提取
 * - 置信度计算
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import {
  EpisodicMemory,
  SemanticMemory,
  Knowledge,
  KnowledgeRefinementConfig,
  MemoryCluster,
  PatternRecognitionResult,
  MemoryManagerError,
} from './types';
import { EpisodicMemoryStorage } from './episodic-memory-storage';
import { SemanticMemoryStorage } from './semantic-memory-storage';
import { KnowledgeStorage } from './knowledge-storage';

/**
 * 简单相似度计算结果
 */
interface SimilarityResult {
  memoryId1: string;
  memoryId2: string;
  similarity: number;
}

/**
 * 知识提炼器实现
 */
export class KnowledgeRefinement {
  private config: Required<KnowledgeRefinementConfig>;
  private episodicStorage: EpisodicMemoryStorage;
  private semanticStorage: SemanticMemoryStorage;
  private knowledgeStorage: KnowledgeStorage;
  
  constructor(
    episodicStorage: EpisodicMemoryStorage,
    semanticStorage: SemanticMemoryStorage,
    knowledgeStorage: KnowledgeStorage,
    config?: KnowledgeRefinementConfig
  ) {
    this.episodicStorage = episodicStorage;
    this.semanticStorage = semanticStorage;
    this.knowledgeStorage = knowledgeStorage;
    
    this.config = {
      similarityThreshold: config?.similarityThreshold ?? 0.7,
      minClusterSize: config?.minClusterSize ?? 3,
      confidenceThreshold: config?.confidenceThreshold ?? 0.6,
      autoPromote: config?.autoPromote ?? false,
    };
  }
  
  /**
   * 执行知识提炼流程
   */
  async refine(): Promise<{
    clusters: MemoryCluster[];
    extractedKnowledge: PatternRecognitionResult;
    promotedMemories: number;
  }> {
    // 1. 获取待提炼的记忆
    const memories = await this.episodicStorage.query({
      status: 'active',
      orderBy: 'promotionScore',
      orderDirection: 'desc',
    });
    
    if (memories.length < this.config.minClusterSize) {
      return {
        clusters: [],
        extractedKnowledge: { patterns: [], extractedKnowledge: [] },
        promotedMemories: 0,
      };
    }
    
    // 2. 计算相似度矩阵
    const similarities = this.computeSimilarities(memories);
    
    // 3. 聚类
    const clusters = this.clusterMemories(memories, similarities);
    
    // 4. 从聚类中提取模式和知识
    const extractedKnowledge = await this.extractKnowledge(clusters);
    
    // 5. 自动提升（如果配置）
    let promotedMemories = 0;
    if (this.config.autoPromote) {
      promotedMemories = await this.promoteMemories(clusters);
    }
    
    return {
      clusters,
      extractedKnowledge,
      promotedMemories,
    };
  }
  
  /**
   * 从单个记忆创建语义记忆
   */
  async createSemanticMemory(episodicMemory: EpisodicMemory): Promise<SemanticMemory> {
    // 确定类型
    const type = this.determineMemoryType(episodicMemory);
    
    // 计算置信度
    const confidence = this.calculateConfidence(episodicMemory);
    
    // 创建语义记忆
    const semanticMemory = await this.semanticStorage.create({
      type,
      title: episodicMemory.title,
      content: episodicMemory.summary,
      keywords: episodicMemory.tags,
      confidence,
      sourceMemoryIds: [episodicMemory.memoryId],
      metadata: {
        originalPriority: episodicMemory.priority,
        accessCount: episodicMemory.accessCount,
      },
    });
    
    return semanticMemory;
  }
  
  /**
   * 从聚类创建知识卡片
   */
  async createKnowledgeCard(cluster: MemoryCluster, memories: EpisodicMemory[]): Promise<Knowledge> {
    // 确定分类
    const category = this.determineKnowledgeCategory(memories);
    
    // 生成标题
    const title = this.generateKnowledgeTitle(cluster, memories);
    
    // 生成内容
    const content = await this.generateKnowledgeContent(cluster, memories);
    
    // 提取标签
    const tags = this.extractCommonTags(memories);
    
    // 确定适用场景
    const applicability = this.extractApplicability(memories);
    
    // 创建知识卡片
    const knowledge = await this.knowledgeStorage.create({
      category,
      title,
      description: cluster.label,
      content,
      tags,
      applicability,
      source: {
        type: 'experience',
        reference: `cluster:${cluster.clusterId}`,
      },
      relatedKnowledgeIds: [],
    });
    
    return knowledge;
  }
  
  /**
   * 计算单个记忆的知识价值
   */
  calculateKnowledgeValue(memory: EpisodicMemory): number {
    // 基于多个维度计算
    const recencyScore = 1 - Math.min(1, (Date.now() - memory.createdAt) / (7 * 24 * 60 * 60 * 1000));
    const accessScore = Math.min(1, memory.accessCount / 10);
    const priorityScore = memory.priority === 'high' ? 1 : memory.priority === 'medium' ? 0.6 : 0.3;
    
    // 综合
    return recencyScore * 0.2 + accessScore * 0.5 + priorityScore * 0.3;
  }
  
  /**
   * 批量评估记忆的知识价值
   */
  async evaluateMemories(): Promise<Array<{ memoryId: string; value: number }>> {
    const memories = await this.episodicStorage.query({ status: 'active' });
    
    return memories
      .map(m => ({
        memoryId: m.memoryId,
        value: this.calculateKnowledgeValue(m),
      }))
      .sort((a, b) => b.value - a.value);
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 计算相似度矩阵
   */
  private computeSimilarities(memories: EpisodicMemory[]): SimilarityResult[] {
    const results: SimilarityResult[] = [];
    
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const similarity = this.calculateSimilarity(memories[i], memories[j]);
        if (similarity >= this.config.similarityThreshold) {
          results.push({
            memoryId1: memories[i].memoryId,
            memoryId2: memories[j].memoryId,
            similarity,
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * 计算两个记忆的相似度
   */
  private calculateSimilarity(m1: EpisodicMemory, m2: EpisodicMemory): number {
    let score = 0;
    let factors = 0;
    
    // 标签相似度
    const tagSimilarity = this.tagSimilarity(m1.tags, m2.tags);
    score += tagSimilarity;
    factors++;
    
    // 来源相似度
    if (m1.source === m2.source) {
      score += 1;
      factors++;
    }
    
    // 优先级相似度
    if (m1.priority === m2.priority) {
      score += 1;
      factors++;
    }
    
    // 文本相似度（简化版）
    const textSimilarity = this.textSimilarity(m1.summary, m2.summary);
    score += textSimilarity;
    factors++;
    
    return factors > 0 ? score / factors : 0;
  }
  
  /**
   * 标签相似度（Jaccard）
   */
  private tagSimilarity(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 && tags2.length === 0) return 1;
    if (tags1.length === 0 || tags2.length === 0) return 0;
    
    const set1 = new Set(tags1.map(t => t.toLowerCase()));
    const set2 = new Set(tags2.map(t => t.toLowerCase()));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * 文本相似度（简单词重叠）
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    return intersection.size / Math.min(words1.size, words2.size);
  }
  
  /**
   * 聚类记忆
   */
  private clusterMemories(memories: EpisodicMemory[], similarities: SimilarityResult[]): MemoryCluster[] {
    // 简单的连通分量聚类
    const clusters: MemoryCluster[] = [];
    const visited = new Set<string>();
    
    for (const memory of memories) {
      if (visited.has(memory.memoryId)) continue;
      
      // BFS 找连通分量
      const cluster: string[] = [];
      const queue = [memory.memoryId];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        cluster.push(current);
        
        // 找相邻节点
        for (const sim of similarities) {
          if (sim.memoryId1 === current && !visited.has(sim.memoryId2)) {
            queue.push(sim.memoryId2);
          } else if (sim.memoryId2 === current && !visited.has(sim.memoryId1)) {
            queue.push(sim.memoryId1);
          }
        }
      }
      
      // 只保留足够大的聚类
      if (cluster.length >= this.config.minClusterSize) {
        const clusterMemory = memories.find(m => m.memoryId === cluster[0])!;
        
        clusters.push({
          clusterId: `cluster_${Date.now()}_${clusters.length}`,
          label: clusterMemory.title.slice(0, 50),
          members: cluster,
          commonFeatures: this.extractCommonFeatures(cluster, memories),
          centerMemoryId: cluster[0],
        });
      }
    }
    
    return clusters;
  }
  
  /**
   * 提取共同特征
   */
  private extractCommonFeatures(memoryIds: string[], allMemories: EpisodicMemory[]): string[] {
    const memories = allMemories.filter(m => memoryIds.includes(m.memoryId));
    const features: Set<string> = new Set();
    
    // 提取共同标签
    const tagCounts = new Map<string, number>();
    for (const m of memories) {
      for (const tag of m.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    
    const threshold = Math.ceil(memories.length * 0.5);
    for (const [tag, count] of tagCounts) {
      if (count >= threshold) {
        features.add(`tag:${tag}`);
      }
    }
    
    // 提取共同来源
    const sourceCounts = new Map<string, number>();
    for (const m of memories) {
      sourceCounts.set(m.source, (sourceCounts.get(m.source) || 0) + 1);
    }
    
    for (const [source, count] of sourceCounts) {
      if (count >= threshold) {
        features.add(`source:${source}`);
      }
    }
    
    return Array.from(features);
  }
  
  /**
   * 从聚类提取知识
   */
  private async extractKnowledge(clusters: MemoryCluster[]): Promise<PatternRecognitionResult> {
    const patterns: PatternRecognitionResult['patterns'] = [];
    const extractedKnowledge: string[] = [];
    
    for (const cluster of clusters) {
      // 从聚类标签中提取模式
      patterns.push({
        pattern: cluster.label,
        occurrences: cluster.members.length,
        examples: cluster.members.slice(0, 3),
      });
      
      // 提取简化的知识描述
      extractedKnowledge.push(`${cluster.label}: ${cluster.commonFeatures.join(', ')}`);
    }
    
    return { patterns, extractedKnowledge };
  }
  
  /**
   * 自动提升记忆
   */
  private async promoteMemories(clusters: MemoryCluster[]): Promise<number> {
    let promoted = 0;
    
    for (const cluster of clusters) {
      // 只提升高质量聚类
      if (cluster.members.length >= this.config.minClusterSize) {
        // 找到中心记忆
        const centerMemory = cluster.members[0];
        
        // 标记为已提升
        await this.episodicStorage.archive(centerMemory);
        promoted++;
      }
    }
    
    return promoted;
  }
  
  /**
   * 确定记忆类型
   */
  private determineMemoryType(memory: EpisodicMemory): SemanticMemory['type'] {
    switch (memory.source) {
      case 'user_preference':
        return 'preference';
      case 'user_decision':
        return 'decision';
      case 'task_completion':
        return 'fact';
      default:
        return 'concept';
    }
  }
  
  /**
   * 计算置信度
   */
  private calculateConfidence(memory: EpisodicMemory): number {
    // 基于访问次数和提升分数
    const accessConfidence = Math.min(1, memory.accessCount / 10);
    const promotionConfidence = Math.min(1, memory.promotionScore / 20);
    
    return (accessConfidence + promotionConfidence) / 2;
  }
  
  /**
   * 确定知识分类
   */
  private determineKnowledgeCategory(memories: EpisodicMemory[]): Knowledge['category'] {
    // 基于时间分布和来源判断
    const failureCount = memories.filter(m => m.source === 'error_recovery').length;
    const totalCount = memories.length;
    
    if (failureCount > totalCount * 0.5) {
      return 'lesson_learned';
    }
    
    return 'best_practice';
  }
  
  /**
   * 生成知识标题
   */
  private generateKnowledgeTitle(cluster: MemoryCluster, memories: EpisodicMemory[]): string {
    // 找到最高分记忆的标题
    const highest = memories.reduce((a, b) => 
      a.promotionScore > b.promotionScore ? a : b
    );
    return highest.title;
  }
  
  /**
   * 生成知识内容
   */
  private async generateKnowledgeContent(cluster: MemoryCluster, memories: EpisodicMemory[]): Promise<string> {
    // 构建简单的知识内容
    const sections: string[] = [];
    
    sections.push(`# ${cluster.label}`);
    sections.push('');
    sections.push('## 背景');
    sections.push(cluster.commonFeatures.map(f => `- ${f}`).join('\n'));
    sections.push('');
    sections.push('## 相关案例');
    
    for (const memoryId of cluster.members.slice(0, 3)) {
      const memory = memories.find(m => m.memoryId === memoryId);
      if (memory) {
        sections.push(`- ${memory.summary}`);
      }
    }
    
    return sections.join('\n');
  }
  
  /**
   * 提取共同标签
   */
  private extractCommonTags(memories: EpisodicMemory[]): string[] {
    const tagCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const tag of memory.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    
    const threshold = Math.ceil(memories.length * 0.5);
    return Array.from(tagCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([tag]) => tag);
  }
  
  /**
   * 提取适用场景
   */
  private extractApplicability(memories: EpisodicMemory[]): string[] {
    // 从标签和内容中提取
    const scenarios = new Set<string>();
    
    for (const memory of memories) {
      // 添加标签作为场景
      memory.tags.slice(0, 3).forEach(t => scenarios.add(t));
    }
    
    return Array.from(scenarios).slice(0, 5);
  }
}
