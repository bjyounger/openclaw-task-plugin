/**
 * WorkflowEngine - 工作流集成服务
 *
 * 整合 WorkflowExecutor、MemoryManager、EventManager，提供完整的工作流生命周期管理。
 *
 * 核心功能：
 * 1. 创建并执行工作流（定义 → 执行 → 结果 → 记忆记录）
 * 2. 工作流执行前查询相关知识
 * 3. 工作流完成后自动记录记忆
 * 4. 触发工作流生命周期事件
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowDefinition,
  WorkflowResult,
  NodeOutput,
  WorkflowNode,
} from './types';
import type { IExecutionContext } from './execution-context';
import { WorkflowExecutor } from './workflow-executor';
import { NodeRegistry, getNodeRegistry } from './node-registry';
import { TopologicalSorter } from './topological-sorter';
import { ExecutionContext } from './execution-context';

// ==================== Types ====================

/**
 * 记忆管理器接口（简化版）
 *
 * 完整实现见 src/core/memory/memory-manager.ts
 */
export interface IMemoryManager {
  createEpisodicMemory(params: {
    source: string;
    priority?: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    tags?: string[];
    relatedTaskIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<{ memoryId: string }>;

  queryKnowledge(params: {
    keywords?: string[];
    category?: string;
    limit?: number;
  }): Promise<Array<{
    knowledgeId: string;
    title: string;
    content: string;
    tags: string[];
  }>>;
}

/**
 * 事件管理器接口（简化版）
 *
 * 完整实现见 src/core/events/event-manager.ts
 */
export interface IEventManager {
  emit(eventType: string, payload: unknown): void;
  on(eventType: string, listener: (payload: unknown) => void): () => void;
}

/**
 * 工作流集成配置
 */
export interface WorkflowIntegrationConfig {
  /** 是否启用记忆记录 */
  enableMemory?: boolean;

  /** 是否启用事件触发 */
  enableEvents?: boolean;

  /** 工作流执行超时（毫秒） */
  executionTimeout?: number;

  /** 是否在执行前查询相关知识 */
  queryKnowledgeBeforeExecution?: boolean;

  /** 记忆优先级 */
  memoryPriority?: 'high' | 'medium' | 'low';

  /** 自定义节点注册表 */
  nodeRegistry?: NodeRegistry;
}

/**
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext {
  /** 工作流定义 */
  definition: WorkflowDefinition;

  /** 执行上下文 */
  executionContext: IExecutionContext;

  /** 相关知识（执行前查询） */
  relatedKnowledge?: Array<{
    knowledgeId: string;
    title: string;
    content: string;
  }>;

  /** 用户 ID（用于权限校验） */
  userId?: string;

  /** 会话 ID */
  sessionId?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 工作流执行结果（扩展版）
 */
export interface WorkflowExecutionResult extends WorkflowResult {
  /** 执行 ID */
  executionId: string;

  /** 工作流 ID */
  workflowId: string;

  /** 工作流名称 */
  workflowName: string;

  /** 执行时长（毫秒） */
  duration: number;

  /** 记忆 ID（如果记录到记忆） */
  memoryId?: string;

  /** 相关知识 ID */
  relatedKnowledgeIds?: string[];

  /** 执行统计 */
  stats: {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    skippedNodes: number;
  };
}

// ==================== WorkflowIntegration ====================

/**
 * 工作流集成服务
 *
 * 整合 WorkflowExecutor、MemoryManager、EventManager，提供完整的工作流生命周期管理。
 *
 * @example
 * ```typescript
 * const integration = new WorkflowIntegration(
 *   executor,
 *   memoryManager,
 *   eventManager,
 *   { enableMemory: true, enableEvents: true }
 * );
 *
 * const result = await integration.createAndExecute(definition, context);
 * ```
 */
export class WorkflowIntegration {
  /** 工作流执行器 */
  private readonly executor: WorkflowExecutor;

  /** 记忆管理器 */
  private readonly memoryManager?: IMemoryManager;

  /** 事件管理器 */
  private readonly eventManager?: IEventManager;

  /** 节点注册表 */
  private readonly nodeRegistry: NodeRegistry;

  /** 拓扑排序器 */
  private readonly topologicalSorter: TopologicalSorter;

  /** 配置 */
  private readonly config: Required<WorkflowIntegrationConfig>;

  /**
   * 创建工作流集成服务实例
   */
  constructor(
    executor: WorkflowExecutor,
    memoryManager?: IMemoryManager,
    eventManager?: IEventManager,
    config?: WorkflowIntegrationConfig
  ) {
    this.executor = executor;
    this.memoryManager = memoryManager;
    this.eventManager = eventManager;
    this.nodeRegistry = config?.nodeRegistry || getNodeRegistry();
    this.topologicalSorter = new TopologicalSorter();

    // 合并默认配置（不包含 nodeRegistry）
    this.config = {
      enableMemory: config?.enableMemory ?? true,
      enableEvents: config?.enableEvents ?? true,
      executionTimeout: config?.executionTimeout ?? 4 * 60 * 60 * 1000, // 4小时
      queryKnowledgeBeforeExecution: config?.queryKnowledgeBeforeExecution ?? true,
      memoryPriority: config?.memoryPriority ?? 'medium',
      nodeRegistry: this.nodeRegistry,
    };
  }

  /**
   * 创建并执行工作流（完整流程）
   *
   * 流程：
   * 1. 触发 workflow:created 事件
   * 2. 查询相关知识（如果启用）
   * 3. 触发 workflow:started 事件
   * 4. 执行工作流
   * 5. 触发 workflow:completed 或 workflow:failed 事件
   * 6. 记录到记忆（如果启用）
   *
   * @param definition - 工作流定义
   * @param context - 执行上下文
   * @returns 工作流执行结果
   */
  async createAndExecute(
    definition: WorkflowDefinition,
    context: WorkflowExecutionContext
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();

    // 1. 触发 workflow:created 事件
    this.emitLifecycleEvent('workflow:created', {
      workflowId: definition.id,
      workflowName: definition.name,
      timestamp: startTime,
      userId: context.userId,
      sessionId: context.sessionId,
    });

    try {
      // 2. 查询相关知识（如果启用）
      let relatedKnowledge: Array<{
        knowledgeId: string;
        title: string;
        content: string;
      }> = [];

      if (this.config.queryKnowledgeBeforeExecution && this.memoryManager) {
        relatedKnowledge = await this.queryKnowledge(definition.name);
        context.relatedKnowledge = relatedKnowledge;
      }

      // 3. 触发 workflow:started 事件
      this.emitLifecycleEvent('workflow:started', {
        workflowId: definition.id,
        workflowName: definition.name,
        timestamp: Date.now(),
        nodeCount: definition.nodes.length,
        relatedKnowledgeCount: relatedKnowledge.length,
      });

      // 4. 执行工作流
      const result = await this.executor.execute(
        definition,
        context.executionContext
      );

      // 5. 构建执行统计
      const outputs = result.results;
      let completedNodes = 0;
      let failedNodes = 0;
      let skippedNodes = 0;

      outputs.forEach((output) => {
        switch (output.status) {
          case 'success':
            completedNodes++;
            break;
          case 'failure':
            failedNodes++;
            break;
          case 'skipped':
            skippedNodes++;
            break;
        }
      });

      const duration = Date.now() - startTime;

      // 6. 构建执行结果
      const executionResult: WorkflowExecutionResult = {
        ...result,
        executionId: context.executionContext.executionId,
        workflowId: definition.id,
        workflowName: definition.name,
        duration,
        relatedKnowledgeIds: relatedKnowledge.map(k => k.knowledgeId),
        stats: {
          totalNodes: definition.nodes.length,
          completedNodes,
          failedNodes,
          skippedNodes,
        },
      };

      // 7. 触发完成或失败事件
      if (result.status === 'completed') {
        this.emitLifecycleEvent('workflow:completed', {
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          stats: executionResult.stats,
          timestamp: Date.now(),
        });
      } else {
        this.emitLifecycleEvent('workflow:failed', {
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          errors: result.errors,
          stats: executionResult.stats,
          timestamp: Date.now(),
        });
      }

      // 8. 记录到记忆（如果启用）
      if (this.config.enableMemory && this.memoryManager) {
        const memoryId = await this.recordToMemory(executionResult);
        executionResult.memoryId = memoryId;
      }

      return executionResult;

    } catch (error) {
      const err = error as Error;
      const duration = Date.now() - startTime;

      // 触发失败事件
      this.emitLifecycleEvent('workflow:failed', {
        workflowId: definition.id,
        workflowName: definition.name,
        duration,
        error: {
          message: err.message,
          stack: err.stack,
        },
        timestamp: Date.now(),
      });

      // 记录失败到记忆
      if (this.config.enableMemory && this.memoryManager) {
        await this.recordToMemory({
          status: 'failed',
          executionId: context.executionContext.executionId,
          workflowId: definition.id,
          workflowName: definition.name,
          duration,
          results: new Map(),
          errors: { _error: err },
          stats: {
            totalNodes: definition.nodes.length,
            completedNodes: 0,
            failedNodes: definition.nodes.length,
            skippedNodes: 0,
          },
        });
      }

      throw error;
    }
  }

  // ==================== Private Methods ====================

  /**
   * 工作流完成后记录记忆
   */
  private async recordToMemory(result: WorkflowExecutionResult): Promise<string> {
    if (!this.memoryManager) {
      throw new Error('MemoryManager not configured');
    }

    // 构建摘要
    const summary = this.buildMemorySummary(result);

    // 提取标签
    const tags = this.extractTags(result);

    // 创建记忆
    const memory = await this.memoryManager.createEpisodicMemory({
      source: 'task_completion',
      priority: this.config.memoryPriority,
      title: `工作流执行: ${result.workflowName}`,
      summary,
      content: {
        workflowId: result.workflowId,
        workflowName: result.workflowName,
        executionId: result.executionId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        nodeOutputs: Array.from(result.results.entries()).map(([nodeId, output]) => ({
          nodeId,
          status: output.status,
          data: output.data,
        })),
      },
      tags,
      relatedTaskIds: [result.executionId],
      metadata: {
        relatedKnowledgeIds: result.relatedKnowledgeIds,
      },
    });

    return memory.memoryId;
  }

  /**
   * 工作流执行前查询相关知识
   */
  private async queryKnowledge(workflowName: string): Promise<Array<{
    knowledgeId: string;
    title: string;
    content: string;
  }>> {
    if (!this.memoryManager) {
      return [];
    }

    try {
      // 从工作流名称提取关键词
      const keywords = this.extractKeywords(workflowName);

      // 查询知识
      const knowledge = await this.memoryManager.queryKnowledge({
        keywords,
        limit: 5,
      });

      return knowledge;
    } catch (error) {
      // 查询失败不影响执行
      console.error('Failed to query knowledge:', error);
      return [];
    }
  }

  /**
   * 触发工作流生命周期事件
   */
  private emitLifecycleEvent(event: string, data: unknown): void {
    if (!this.config.enableEvents || !this.eventManager) {
      return;
    }

    try {
      this.eventManager.emit(event, data);
    } catch (error) {
      // 事件触发失败不影响执行
      console.error(`Failed to emit event ${event}:`, error);
    }
  }

  /**
   * 构建记忆摘要
   */
  private buildMemorySummary(result: WorkflowExecutionResult): string {
    const statusText = result.status === 'completed' ? '成功完成' : '执行失败';
    const durationText = this.formatDuration(result.duration);

    const parts = [
      `工作流 "${result.workflowName}" ${statusText}`,
      `执行时长: ${durationText}`,
      `节点统计: ${result.stats.completedNodes}/${result.stats.totalNodes} 成功`,
    ];

    if (result.stats.failedNodes > 0) {
      parts.push(`失败节点: ${result.stats.failedNodes}`);
    }

    return parts.join('。');
  }

  /**
   * 提取标签
   */
  private extractTags(result: WorkflowExecutionResult): string[] {
    const tags: string[] = [
      'workflow',
      result.status,
      result.workflowName.toLowerCase().replace(/\s+/g, '-'),
    ];

    // 根据执行状态添加标签
    if (result.status === 'completed') {
      tags.push('success');
    } else {
      tags.push('failed');
    }

    // 根据执行时长添加标签
    if (result.duration < 1000) {
      tags.push('fast');
    } else if (result.duration > 60000) {
      tags.push('slow');
    }

    return tags;
  }

  /**
   * 从工作流名称提取关键词
   */
  private extractKeywords(workflowName: string): string[] {
    // 简单实现：按空格和常见分隔符拆分
    const words = workflowName.split(/[\s\-_\/]+/);

    // 过滤停用词和短词
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'to', 'for', 'and', 'or']);
    const keywords = words
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .map(word => word.toLowerCase());

    return [...new Set(keywords)]; // 去重
  }

  /**
   * 格式化时长
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
}
