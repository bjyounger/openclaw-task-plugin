/**
 * 任务摘要生成器（Task Summary Generator）
 * 
 * 从任务执行结果中提取：
 * - 关键结果
 * - 学习点
 * - 模式识别
 * 
 * @version 1.0.0
 * @author 孬蛋
 */

import { TaskStatus } from '../types';
import {
  TaskSummary,
  TaskSummaryGeneratorConfig,
  EpisodicMemory,
  MemorySource,
} from './types';

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  taskId: string;
  flowId?: string;
  goal: string;
  status: TaskStatus;
  startTime: number;
  endTime: number;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 模式提取器
 */
interface PatternExtractor {
  pattern: RegExp;
  type: 'success' | 'error' | 'decision' | 'action';
  extract: (match: RegExpMatchArray) => string;
}

/**
 * 任务摘要生成器实现
 */
export class TaskSummaryGenerator {
  private config: Required<TaskSummaryGeneratorConfig>;
  
  // 预定义模式
  private patterns: PatternExtractor[] = [
    {
      pattern: /(成功|完成|实现|完成)/g,
      type: 'success',
      extract: (match) => `成功: ${match[0]}`,
    },
    {
      pattern: /(失败|错误|异常|问题)/g,
      type: 'error',
      extract: (match) => `问题: ${match[0]}`,
    },
    {
      pattern: /(决定|选择|采用|使用)/g,
      type: 'decision',
      extract: (match) => `决策: ${match[0]}`,
    },
    {
      pattern: /(执行|运行|创建|删除|更新)/g,
      type: 'action',
      extract: (match) => `操作: ${match[0]}`,
    },
  ];
  
  constructor(config?: TaskSummaryGeneratorConfig) {
    this.config = {
      maxKeyResults: config?.maxKeyResults ?? 5,
      maxLessons: config?.maxLessons ?? 3,
      extractPatterns: config?.extractPatterns ?? true,
    };
  }
  
  /**
   * 生成任务摘要
   */
  generate(executionResult: TaskExecutionResult): TaskSummary {
    const duration = executionResult.endTime - executionResult.startTime;
    
    // 提取关键结果
    const keyResults = this.extractKeyResults(executionResult);
    
    // 提取学习点
    const lessons = this.extractLessons(executionResult);
    
    // 生成标签
    const tags = this.generateTags(executionResult);
    
    return {
      taskId: executionResult.taskId,
      flowId: executionResult.flowId,
      goal: executionResult.goal,
      status: executionResult.status,
      duration,
      keyResults,
      lessons,
      tags,
      createdAt: Date.now(),
      metadata: executionResult.metadata,
    };
  }
  
  /**
   * 从任务摘要创建情境记忆
   */
  createMemory(summary: TaskSummary): Omit<EpisodicMemory, 'memoryId'> {
    // 确定来源
    let source: MemorySource = 'task_completion';
    if (summary.status === 'failed') {
      source = 'error_recovery';
    }
    
    // 确定优先级
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (summary.status === 'failed' || summary.duration > 30 * 60 * 1000) {
      priority = 'high';
    } else if (summary.status === 'succeeded' && summary.duration < 5 * 60 * 1000) {
      priority = 'low';
    }
    
    // 构建内容
    const content: Record<string, unknown> = {
      goal: summary.goal,
      status: summary.status,
      duration: summary.duration,
      keyResults: summary.keyResults,
      lessons: summary.lessons,
      metadata: summary.metadata,
    };
    
    // 构建标题
    const statusEmoji = summary.status === 'succeeded' ? '✅' : 
                       summary.status === 'failed' ? '❌' : '⏳';
    const title = `${statusEmoji} ${summary.goal.slice(0, 50)}`;
    
    // 构建摘要
    const summaryText = this.buildSummaryText(summary);
    
    return {
      source,
      priority,
      status: 'active',
      title,
      summary: summaryText,
      content,
      tags: summary.tags,
      createdAt: summary.createdAt,
      lastAccessedAt: summary.createdAt,
      accessCount: 0,
      accessLog: [],
      relatedTaskIds: [summary.taskId],
      promotionScore: 0,
      metadata: summary.metadata,
    };
  }
  
  /**
   * 批量提取模式
   */
  extractPatternsFromSummaries(summaries: TaskSummary[]): Map<string, number> {
    const patternCounts = new Map<string, number>();
    
    for (const summary of summaries) {
      const patterns = this.identifyPatterns(summary);
      for (const pattern of patterns) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      }
    }
    
    return patternCounts;
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 提取关键结果
   */
  private extractKeyResults(result: TaskExecutionResult): string[] {
    const keyResults: string[] = [];
    
    // 从结果中提取
    if (result.result) {
      const resultStr = typeof result.result === 'string' 
        ? result.result 
        : JSON.stringify(result.result);
      
      // 按句子分割
      const sentences = resultStr.split(/[.。!！?？\n]+/).filter(s => s.trim());
      
      // 提取关键句子
      for (const sentence of sentences) {
        if (keyResults.length >= this.config.maxKeyResults) break;
        
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          keyResults.push(trimmed);
        }
      }
    }
    
    // 如果结果为空，根据状态生成默认结果
    if (keyResults.length === 0) {
      if (result.status === 'succeeded') {
        keyResults.push(`任务成功完成: ${result.goal}`);
      } else if (result.status === 'failed') {
        keyResults.push(`任务失败: ${result.error || '未知错误'}`);
      } else {
        keyResults.push(`任务状态: ${result.status}`);
      }
    }
    
    return keyResults;
  }
  
  /**
   * 提取学习点
   */
  private extractLessons(result: TaskExecutionResult): string[] {
    const lessons: string[] = [];
    
    // 从错误中学习
    if (result.status === 'failed' && result.error) {
      lessons.push(`错误原因: ${result.error}`);
      
      // 提取可能的解决方案
      if (result.error.includes('timeout')) {
        lessons.push('建议: 增加超时时间或优化执行效率');
      } else if (result.error.includes('not found')) {
        lessons.push('建议: 检查资源是否存在，确保路径正确');
      } else if (result.error.includes('permission')) {
        lessons.push('建议: 检查权限配置');
      }
    }
    
    // 从元数据中提取
    if (result.metadata?.lessons) {
      const metadataLessons = result.metadata.lessons;
      if (Array.isArray(metadataLessons)) {
        lessons.push(...metadataLessons.filter(l => typeof l === 'string'));
      }
    }
    
    // 限制数量
    return lessons.slice(0, this.config.maxLessons);
  }
  
  /**
   * 生成标签
   */
  private generateTags(result: TaskExecutionResult): string[] {
    const tags: Set<string> = new Set();
    
    // 状态标签
    tags.add(result.status);
    
    // 时长标签
    const durationMinutes = (result.endTime - result.startTime) / 60000;
    if (durationMinutes < 1) {
      tags.add('quick');
    } else if (durationMinutes > 30) {
      tags.add('long-running');
    }
    
    // 从目标中提取关键词
    const keywords = this.extractKeywords(result.goal);
    keywords.forEach(k => tags.add(k));
    
    // 从元数据中提取
    if (result.metadata?.tags) {
      const metadataTags = result.metadata.tags;
      if (Array.isArray(metadataTags)) {
        metadataTags.forEach(t => {
          if (typeof t === 'string') tags.add(t);
        });
      }
    }
    
    return Array.from(tags);
  }
  
  /**
   * 识别模式
   */
  private identifyPatterns(summary: TaskSummary): string[] {
    if (!this.config.extractPatterns) return [];
    
    const patterns: string[] = [];
    const text = `${summary.goal} ${summary.keyResults.join(' ')} ${summary.lessons.join(' ')}`;
    
    for (const extractor of this.patterns) {
      const matches = text.matchAll(extractor.pattern);
      for (const match of matches) {
        patterns.push(extractor.extract(match));
      }
    }
    
    return [...new Set(patterns)];
  }
  
  /**
   * 构建摘要文本
   */
  private buildSummaryText(summary: TaskSummary): string {
    const parts: string[] = [];
    
    parts.push(`目标: ${summary.goal}`);
    parts.push(`状态: ${summary.status}`);
    parts.push(`耗时: ${Math.round(summary.duration / 1000)}秒`);
    
    if (summary.keyResults.length > 0) {
      parts.push(`关键结果: ${summary.keyResults.slice(0, 2).join('; ')}`);
    }
    
    if (summary.lessons.length > 0) {
      parts.push(`学习点: ${summary.lessons[0]}`);
    }
    
    return parts.join(' | ');
  }
  
  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取（实际应用中可使用更复杂的NLP方法）
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
    
    return text
      .toLowerCase()
      .split(/[\s,.;:!?()[\]{}'"\/\\，。；：！？（）【】]+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 5);
  }
}
