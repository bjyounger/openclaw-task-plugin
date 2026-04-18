/**
 * OpenClawBridge 高级示例：错误处理和最佳实践
 * 
 * 本示例展示了：
 * - 完整的错误处理流程
 * - 性能优化技巧
 * - 安全最佳实践
 * - 生产环境使用模式
 * 
 * @version 3.0.0
 */

import {
  OpenClawBridge,
  TaskOperationError,
  EnhancedTaskError,
  checkOpenClawVersion,
  TaskRunDetail,
  ToolContext,
} from '../src';

// ==================== 错误处理示例 ====================

/**
 * 示例1: 完整的错误处理流程
 */
export async function robustTaskCreation(
  ctx: ToolContext,
  taskParams: { title: string; runtime: 'subagent' | 'acp' | 'agent' }
) {
  console.log('=== 健壮的任务创建流程 ===\n');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 步骤1: 检查API可用性
  console.log('步骤1: 检查API可用性...');
  const availability = bridge.checkApiAvailability();
  
  if (!availability.taskFlow || !availability.tasks) {
    return {
      success: false,
      error: 'API_UNAVAILABLE',
      message: 'OpenClaw API 不可用，请检查版本',
      availability,
    };
  }
  console.log('✅ API可用\n');
  
  // 步骤2: 验证参数
  console.log('步骤2: 验证参数...');
  if (!taskParams.title || taskParams.title.trim().length === 0) {
    return {
      success: false,
      error: 'INVALID_PARAMS',
      message: '任务标题不能为空',
    };
  }
  console.log('✅ 参数有效\n');
  
  // 步骤3: 创建任务（带重试）
  console.log('步骤3: 创建任务...');
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1秒
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const task = await bridge.createTask({
        title: taskParams.title,
        runtime: taskParams.runtime,
        scope: 'session',
      });
      
      console.log(`✅ 任务创建成功 (尝试 ${attempt}/${MAX_RETRIES})\n`);
      
      return {
        success: true,
        task,
        attempts: attempt,
      };
      
    } catch (error) {
      if (error instanceof EnhancedTaskError) {
        console.error(`❌ 尝试 ${attempt}/${MAX_RETRIES} 失败`);
        console.error('错误码:', error.code);
        console.error('错误信息:', error.message);
        console.error('时间戳:', error.timestamp);
        
        if (attempt < MAX_RETRIES) {
          console.log(`等待 ${RETRY_DELAY}ms 后重试...\n`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } else {
          return {
            success: false,
            error: error.code,
            message: error.message,
            userMessage: error.getUserMessage(),
            timestamp: error.timestamp,
            attempts: attempt,
          };
        }
      } else if (error instanceof TaskOperationError) {
        console.error(`❌ 尝试 ${attempt}/${MAX_RETRIES} 失败`);
        console.error('错误码:', error.code);
        console.error('错误信息:', error.message);
        
        if (attempt < MAX_RETRIES) {
          console.log(`等待 ${RETRY_DELAY}ms 后重试...\n`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } else {
          return {
            success: false,
            error: error.code,
            message: error.message,
            context: error.context,
            attempts: attempt,
          };
        }
      } else {
        // 未知错误，不重试
        console.error('❌ 未知错误:', error);
        return {
          success: false,
          error: 'UNKNOWN_ERROR',
          message: String(error),
          attempts: attempt,
        };
      }
    }
  }
  
  // 不应该到达这里
  return {
    success: false,
    error: 'MAX_RETRIES_EXCEEDED',
    message: '超过最大重试次数',
  };
}

/**
 * 示例2: 批量操作的错误处理
 */
export async function batchTaskCancellation(
  ctx: ToolContext,
  taskIds: string[],
  reason: string
) {
  console.log('=== 批量取消任务 ===\n');
  
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 并行取消所有任务
  const results = await Promise.allSettled(
    taskIds.map(async (taskId) => {
      try {
        const result = await bridge.cancelTask(taskId, reason);
        return {
          taskId,
          success: result.cancelled,
          result,
        };
      } catch (error) {
        return {
          taskId,
          success: false,
          error: error instanceof TaskOperationError 
            ? { code: error.code, message: error.message }
            : { code: 'UNKNOWN', message: String(error) },
        };
      }
    })
  );
  
  // 统计结果
  const successful = results.filter(
    r => r.status === 'fulfilled' && r.value.success
  ).length;
  
  const failed = results.length - successful;
  
  console.log(`取消完成: 成功 ${successful}, 失败 ${failed}\n`);
  
  // 列出失败的任务
  if (failed > 0) {
    console.log('失败任务:');
    results.forEach(r => {
      if (r.status === 'fulfilled' && !r.value.success) {
        console.log(`  - ${r.value.taskId}: ${r.value.error?.message}`);
      } else if (r.status === 'rejected') {
        console.log(`  - 未知任务: ${r.reason}`);
      }
    });
  }
  
  return {
    total: taskIds.length,
    successful,
    failed,
    results: results.map(r => 
      r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
    ),
  };
}

// ==================== 性能优化示例 ====================

/**
 * 示例3: 高效的任务轮询
 */
export class TaskPoller {
  private bridge: OpenClawBridge;
  private pollInterval: number;
  private maxAttempts: number;
  
  constructor(bridge: OpenClawBridge, options?: {
    pollInterval?: number;
    maxAttempts?: number;
  }) {
    this.bridge = bridge;
    this.pollInterval = options?.pollInterval || 5000; // 默认5秒
    this.maxAttempts = options?.maxAttempts || 100; // 默认最多尝试100次
  }
  
  /**
   * 等待任务完成
   */
  async waitForCompletion(
    taskId: string,
    onProgress?: (task: TaskRunDetail) => void
  ): Promise<TaskRunDetail> {
    let attempts = 0;
    
    while (attempts < this.maxAttempts) {
      attempts++;
      
      const task = await this.bridge.getTask(taskId);
      
      if (!task) {
        throw new TaskOperationError(
          'TASK_NOT_FOUND',
          `Task ${taskId} not found`,
          { taskId }
        );
      }
      
      // 回调进度
      if (onProgress) {
        onProgress(task);
      }
      
      // 检查是否完成
      if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
        return task;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
    
    throw new TaskOperationError(
      'POLL_TIMEOUT',
      `Task polling timed out after ${this.maxAttempts} attempts`,
      { taskId, attempts }
    );
  }
  
  /**
   * 批量等待多个任务
   */
  async waitForAll(
    taskIds: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, TaskRunDetail>> {
    const results = new Map<string, TaskRunDetail>();
    let completed = 0;
    
    // 并行等待所有任务
    await Promise.all(
      taskIds.map(async (taskId) => {
        const task = await this.waitForCompletion(taskId);
        results.set(taskId, task);
        completed++;
        
        if (onProgress) {
          onProgress(completed, taskIds.length);
        }
      })
    );
    
    return results;
  }
}

/**
 * 示例4: 使用缓存优化查询
 */
export class CachedTaskQuery {
  private bridge: OpenClawBridge;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private ttl: number; // 缓存生存时间（毫秒）
  
  constructor(bridge: OpenClawBridge, ttl: number = 60000) {
    this.bridge = bridge;
    this.ttl = ttl;
  }
  
  /**
   * 获取任务（带缓存）
   */
  async getTask(taskId: string): Promise<TaskRunDetail | undefined> {
    const cached = this.cache.get(taskId);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`[Cache] Hit for task ${taskId}`);
      return cached.data;
    }
    
    console.log(`[Cache] Miss for task ${taskId}`);
    const task = await this.bridge.getTask(taskId);
    
    if (task) {
      this.cache.set(taskId, {
        data: task,
        timestamp: Date.now(),
      });
    }
    
    return task;
  }
  
  /**
   * 清除缓存
   */
  clearCache(taskId?: string): void {
    if (taskId) {
      this.cache.delete(taskId);
    } else {
      this.cache.clear();
    }
  }
}

// ==================== 安全最佳实践示例 ====================

/**
 * 示例5: 安全的任务管理器
 */
export class SecureTaskManager {
  private bridge: OpenClawBridge;
  private allowedRuntimes: Set<string>;
  private maxTasksPerSession: number;
  
  constructor(
    bridge: OpenClawBridge,
    options?: {
      allowedRuntimes?: string[];
      maxTasksPerSession?: number;
    }
  ) {
    this.bridge = bridge;
    this.allowedRuntimes = new Set(options?.allowedRuntimes || ['subagent', 'acp', 'agent']);
    this.maxTasksPerSession = options?.maxTasksPerSession || 100;
  }
  
  /**
   * 安全创建任务
   */
  async createTask(params: {
    title: string;
    runtime: string;
    timeout?: number;
    metadata?: Record<string, unknown>;
  }) {
    // 验证运行时
    if (!this.allowedRuntimes.has(params.runtime)) {
      throw new TaskOperationError(
        'INVALID_RUNTIME',
        `Runtime '${params.runtime}' is not allowed`,
        { allowedRuntimes: Array.from(this.allowedRuntimes) }
      );
    }
    
    // 检查任务数量限制
    const existingTasks = await this.bridge.listTasks();
    if (existingTasks.length >= this.maxTasksPerSession) {
      throw new TaskOperationError(
        'TASK_LIMIT_EXCEEDED',
        `Maximum tasks per session (${this.maxTasksPerSession}) exceeded`,
        { 
          current: existingTasks.length,
          max: this.maxTasksPerSession,
        }
      );
    }
    
    // 验证超时时间
    const MAX_TIMEOUT = 7200000; // 2小时
    if (params.timeout && params.timeout > MAX_TIMEOUT) {
      throw new TaskOperationError(
        'INVALID_TIMEOUT',
        `Timeout ${params.timeout}ms exceeds maximum ${MAX_TIMEOUT}ms`,
        { timeout: params.timeout, max: MAX_TIMEOUT }
      );
    }
    
    // 创建任务
    return await this.bridge.createTask({
      title: params.title,
      runtime: params.runtime as any,
      timeout: params.timeout,
      metadata: params.metadata,
    });
  }
  
  /**
   * 安全取消任务
   */
  async cancelTask(taskId: string, reason: string, userId?: string) {
    // 获取任务详情
    const task = await this.bridge.getTask(taskId);
    
    if (!task) {
      throw new TaskOperationError(
        'TASK_NOT_FOUND',
        `Task ${taskId} not found`,
        { taskId }
      );
    }
    
    // 检查任务状态
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      throw new TaskOperationError(
        'TASK_ALREADY_COMPLETED',
        `Cannot cancel task in status '${task.status}'`,
        { taskId, status: task.status }
      );
    }
    
    // 记录审计日志
    console.log(`[Audit] Task ${taskId} cancelled by ${userId || 'unknown'}. Reason: ${reason}`);
    
    // 执行取消
    return await this.bridge.cancelTask(taskId, reason);
  }
}

// ==================== 生产环境模式示例 ====================

/**
 * 示例6: 生产环境任务处理器
 */
export class ProductionTaskProcessor {
  private bridge: OpenClawBridge;
  private poller: TaskPoller;
  private secureManager: SecureTaskManager;
  private cachedQuery: CachedTaskQuery;
  
  constructor(ctx: ToolContext) {
    this.bridge = OpenClawBridge.fromToolContext(ctx);
    this.poller = new TaskPoller(this.bridge, {
      pollInterval: 10000,
      maxAttempts: 60,
    });
    this.secureManager = new SecureTaskManager(this.bridge, {
      maxTasksPerSession: 50,
    });
    this.cachedQuery = new CachedTaskQuery(this.bridge, 30000);
  }
  
  /**
   * 创建并监控任务
   */
  async createAndWait(params: {
    title: string;
    runtime: 'subagent' | 'acp' | 'agent';
    timeout?: number;
    metadata?: Record<string, unknown>;
  }) {
    console.log('\n=== 生产环境任务处理流程 ===\n');
    
    // 1. 安全创建任务
    console.log('步骤1: 创建任务...');
    const task = await this.secureManager.createTask(params);
    console.log(`✅ 任务已创建: ${task.taskId}\n`);
    
    // 2. 等待完成（带进度回调）
    console.log('步骤2: 等待任务完成...');
    const result = await this.poller.waitForCompletion(
      task.taskId,
      (t) => console.log(`  状态: ${t.status}`)
    );
    console.log(`✅ 任务已完成: ${result.status}\n`);
    
    // 3. 返回结果
    if (result.status === 'succeeded') {
      return {
        success: true,
        taskId: task.taskId,
        result: result.result,
      };
    } else {
      return {
        success: false,
        taskId: task.taskId,
        status: result.status,
        error: result.error,
      };
    }
  }
  
  /**
   * 批量处理任务
   */
  async batchProcess(
    tasks: Array<{
      title: string;
      runtime: 'subagent' | 'acp' | 'agent';
    }>
  ) {
    console.log(`\n=== 批量处理 ${tasks.length} 个任务 ===\n`);
    
    // 创建所有任务
    const taskIds: string[] = [];
    
    for (const taskParams of tasks) {
      const task = await this.secureManager.createTask(taskParams);
      taskIds.push(task.taskId);
      console.log(`创建任务: ${task.taskId} - ${taskParams.title}`);
    }
    
    console.log('\n等待所有任务完成...\n');
    
    // 等待所有任务完成
    const results = await this.poller.waitForAll(
      taskIds,
      (completed, total) => {
        console.log(`进度: ${completed}/${total}`);
      }
    );
    
    // 统计结果
    const succeeded = Array.from(results.values())
      .filter(t => t.status === 'succeeded').length;
    
    console.log(`\n完成: ${succeeded}/${tasks.length} 成功\n`);
    
    return {
      total: tasks.length,
      succeeded,
      failed: tasks.length - succeeded,
      results,
    };
  }
}

/**
 * 运行高级示例
 */
export async function runAdvancedExamples(ctx: ToolContext) {
  console.log('\n========================================');
  console.log('OpenClawBridge 高级示例');
  console.log('========================================\n');
  
  // 示例1: 健壮的任务创建
  const result1 = await robustTaskCreation(ctx, {
    title: '测试任务',
    runtime: 'subagent',
  });
  console.log('创建结果:', result1);
  
  // 示例6: 生产环境处理器
  const processor = new ProductionTaskProcessor(ctx);
  
  const result2 = await processor.createAndWait({
    title: '生产任务',
    runtime: 'subagent',
    timeout: 60000,
    metadata: {
      priority: 'high',
      department: 'engineering',
    },
  });
  
  console.log('生产任务结果:', result2);
  
  console.log('\n========================================');
  console.log('所有高级示例执行完成');
  console.log('========================================\n');
}

// 导出示例
export const advancedExamples = {
  robustTaskCreation,
  batchTaskCancellation,
  TaskPoller,
  CachedTaskQuery,
  SecureTaskManager,
  ProductionTaskProcessor,
  runAdvancedExamples,
};