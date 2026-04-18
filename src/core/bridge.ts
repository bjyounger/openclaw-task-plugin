/**
 * OpenClaw Bridge - OpenClaw API桥接层
 * 
 * 核心职责：
 * 1. ✅ 正确使用 runtime.taskFlow API
 * 2. ✅ 实现会话绑定（fromToolContext / bindSession）
 * 3. ✅ 类型安全封装
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import {
  OpenClawPluginApi,
  ToolContext,
  BoundTaskFlowRuntime,
  BoundTaskRunsRuntime,
  TaskCreateParams,
  TaskCreateResult,
  TaskRunView,
  TaskRunDetail,
  TaskRunCancelResult,
  TaskFlowDefinition,
  TaskFlowView,
  TaskFlowDetail,
  TaskFlowCancelResult,
  TaskOperationError,
} from './types';

/**
 * OpenClaw Bridge配置
 */
export interface OpenClawBridgeConfig {
  api: OpenClawPluginApi;
  sessionKey: string;
  deliveryContext?: {
    channel?: string;
    accountId?: string;
    userId?: string;
  };
}

/**
 * OpenClaw Bridge - API桥接层
 * 
 * 这是任务插件与OpenClaw原生系统交互的唯一通道
 * 确保API使用正确性和类型安全
 */
export class OpenClawBridge {
  private api: OpenClawPluginApi;
  private sessionKey: string;
  private deliveryContext?: {
    channel?: string;
    accountId?: string;
    userId?: string;
  };
  
  // 绑定后的运行时实例
  private boundTaskFlow: BoundTaskFlowRuntime | null = null;
  private boundTaskRuns: BoundTaskRunsRuntime | null = null;
  
  constructor(config: OpenClawBridgeConfig) {
    this.api = config.api;
    this.sessionKey = config.sessionKey;
    this.deliveryContext = config.deliveryContext;
  }
  
  /**
   * 从工具上下文创建Bridge实例
   * 
   * ✅ 正确的会话绑定方式
   */
  static fromToolContext(ctx: ToolContext): OpenClawBridge {
    return new OpenClawBridge({
      api: ctx.api,
      sessionKey: ctx.sessionKey,
      deliveryContext: ctx.deliveryContext,
    });
  }
  
  /**
   * 显式绑定会话
   */
  bindSession(sessionKey: string, deliveryContext?: {
    channel?: string;
    accountId?: string;
    userId?: string;
  }): void {
    this.sessionKey = sessionKey;
    this.deliveryContext = deliveryContext;
    
    // 清除旧的绑定实例
    this.boundTaskFlow = null;
    this.boundTaskRuns = null;
  }
  
  /**
   * 获取绑定的TaskFlow运行时
   * 
   * ✅ 使用正确的API路径：runtime.taskFlow
   */
  private getBoundTaskFlow(): BoundTaskFlowRuntime {
    if (!this.boundTaskFlow) {
      // ✅ 正确：使用 runtime.taskFlow.fromToolContext
      this.boundTaskFlow = this.api.runtime.taskFlow.fromToolContext({
        sessionKey: this.sessionKey,
        deliveryContext: this.deliveryContext,
        api: this.api,
      });
    }
    return this.boundTaskFlow;
  }
  
  /**
   * 获取绑定的TaskRuns运行时
   * 
   * ✅ 使用 runtime.tasks.runs
   */
  private getBoundTaskRuns(): BoundTaskRunsRuntime {
    if (!this.boundTaskRuns) {
      // ✅ 正确：使用 runtime.tasks.runs.fromToolContext
      this.boundTaskRuns = this.api.runtime.tasks.runs.fromToolContext({
        sessionKey: this.sessionKey,
        deliveryContext: this.deliveryContext,
        api: this.api,
      });
    }
    return this.boundTaskRuns;
  }
  
  // ==================== Task Operations ====================
  
  /**
   * 创建任务
   */
  async createTask(params: TaskCreateParams): Promise<TaskCreateResult> {
    try {
      const taskFlow = this.getBoundTaskFlow();
      
      // 创建TaskFlow来管理单个任务
      const flow = await taskFlow.create({
        name: params.title,
        tasks: [params],
        metadata: params.metadata,
      });
      
      // 获取创建的第一个任务
      const tasks = await taskFlow.get(flow.flowId);
      if (!tasks || !tasks.tasks || tasks.tasks.length === 0) {
        throw new TaskOperationError(
          'TASK_CREATION_FAILED',
          'Failed to create task'
        );
      }
      
      return {
        taskId: tasks.tasks[0].taskId,
        flowId: flow.flowId,
        status: tasks.tasks[0].status,
        createdAt: tasks.tasks[0].createdAt,
      };
    } catch (error) {
      throw new TaskOperationError(
        'TASK_CREATION_ERROR',
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        { params, originalError: error }
      );
    }
  }
  
  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<TaskRunDetail | undefined> {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.get(taskId);
    } catch (error) {
      throw new TaskOperationError(
        'TASK_GET_ERROR',
        `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId }
      );
    }
  }
  
  /**
   * 查询任务列表
   * 
   * ✅ 正确实现：list()不接受filter参数
   */
  async listTasks(): Promise<TaskRunView[]> {
    try {
      const taskRuns = this.getBoundTaskRuns();
      // ✅ 正确：list()不接受任何参数
      return await taskRuns.list();
    } catch (error) {
      throw new TaskOperationError(
        'TASK_LIST_ERROR',
        `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  
  /**
   * 查询任务（客户端过滤）
   * 
   * 由于OpenClaw API的list()不接受filter参数，
   * 我们在客户端实现过滤功能
   */
  async queryTasks(filter?: {
    status?: string | string[];
    runtime?: string | string[];
    limit?: number;
  }): Promise<TaskRunView[]> {
    // 获取所有任务
    const allTasks = await this.listTasks();
    
    // 客户端过滤
    let filtered = allTasks;
    
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter(task => statuses.includes(task.status));
    }
    
    if (filter?.runtime) {
      const runtimes = Array.isArray(filter.runtime) ? filter.runtime : [filter.runtime];
      filtered = filtered.filter(task => runtimes.includes(task.runtime));
    }
    
    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }
  
  /**
   * 取消任务
   */
  async cancelTask(taskId: string, reason?: string): Promise<TaskRunCancelResult> {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.cancel(taskId, reason);
    } catch (error) {
      throw new TaskOperationError(
        'TASK_CANCEL_ERROR',
        `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
        { taskId, reason }
      );
    }
  }
  
  /**
   * 查找最新任务
   */
  async findLatestTask(): Promise<TaskRunDetail | undefined> {
    try {
      const taskRuns = this.getBoundTaskRuns();
      return await taskRuns.findLatest();
    } catch (error) {
      throw new TaskOperationError(
        'TASK_FIND_LATEST_ERROR',
        `Failed to find latest task: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  
  // ==================== TaskFlow Operations ====================
  
  /**
   * 创建任务流
   */
  async createTaskFlow(definition: TaskFlowDefinition): Promise<TaskFlowView> {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.create(definition);
    } catch (error) {
      throw new TaskOperationError(
        'TASKFLOW_CREATION_ERROR',
        `Failed to create task flow: ${error instanceof Error ? error.message : String(error)}`,
        { definition }
      );
    }
  }
  
  /**
   * 获取任务流详情
   */
  async getTaskFlow(flowId: string): Promise<TaskFlowDetail | undefined> {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.get(flowId);
    } catch (error) {
      throw new TaskOperationError(
        'TASKFLOW_GET_ERROR',
        `Failed to get task flow: ${error instanceof Error ? error.message : String(error)}`,
        { flowId }
      );
    }
  }
  
  /**
   * 查询任务流列表
   */
  async listTaskFlows(): Promise<TaskFlowView[]> {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.list();
    } catch (error) {
      throw new TaskOperationError(
        'TASKFLOW_LIST_ERROR',
        `Failed to list task flows: ${error instanceof Error ? error.message : String(error)}`,
        { sessionKey: this.sessionKey }
      );
    }
  }
  
  /**
   * 取消任务流
   */
  async cancelTaskFlow(flowId: string, reason?: string): Promise<TaskFlowCancelResult> {
    try {
      const taskFlow = this.getBoundTaskFlow();
      return await taskFlow.cancel(flowId, reason);
    } catch (error) {
      throw new TaskOperationError(
        'TASKFLOW_CANCEL_ERROR',
        `Failed to cancel task flow: ${error instanceof Error ? error.message : String(error)}`,
        { flowId, reason }
      );
    }
  }
  
  // ==================== Utility Methods ====================
  
  /**
   * 检查API可用性
   */
  checkApiAvailability(): {
    taskFlow: boolean;
    tasks: boolean;
    events: boolean;
    subagent: boolean;
  } {
    return {
      taskFlow: !!this.api.runtime?.taskFlow?.fromToolContext,
      tasks: !!this.api.runtime?.tasks?.runs?.fromToolContext,
      events: !!this.api.runtime?.events,
      subagent: !!this.api.runtime?.subagent,
    };
  }
  
  /**
   * 获取会话信息
   */
  getSessionInfo(): {
    sessionKey: string;
    deliveryContext?: {
      channel?: string;
      accountId?: string;
      userId?: string;
    };
  } {
    return {
      sessionKey: this.sessionKey,
      deliveryContext: this.deliveryContext,
    };
  }
}