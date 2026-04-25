/**
 * DependencyManager - 内存存储实现
 *
 * 提供 IDependencyStore 的内存实现，使用 Map 数据结构
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import {
  IDependencyStore,
  TaskDependency,
  DependencyState,
  DependencyItemStatus,
  DependencyItemDetail,
  DependencyHistoryEntry,
  DependencyEventType,
} from './types';

/**
 * 内存存储实现
 *
 * 使用 Map 数据结构存储依赖定义、状态和历史记录
 * 维护上游/下游索引以加速查询
 */
export class InMemoryDependencyStore implements IDependencyStore {
  private dependencies: Map<string, TaskDependency> = new Map();
  private states: Map<string, DependencyState> = new Map();
  private history: Map<string, DependencyHistoryEntry[]> = new Map();

  // 索引（加速查询）
  private downstreamIndex: Map<string, Set<string>> = new Map();
  private upstreamIndex: Map<string, Set<string>> = new Map();

  // ==================== 依赖定义 CRUD ====================

  /**
   * 保存依赖定义
   */
  async save(dependency: TaskDependency): Promise<void> {
    // 更新索引
    for (const depId of dependency.dependsOn) {
      // 下游索引：depId -> taskId（depId 被谁依赖）
      if (!this.downstreamIndex.has(depId)) {
        this.downstreamIndex.set(depId, new Set());
      }
      this.downstreamIndex.get(depId)!.add(dependency.taskId);

      // 上游索引：taskId -> depId（taskId 依赖谁）
      if (!this.upstreamIndex.has(dependency.taskId)) {
        this.upstreamIndex.set(dependency.taskId, new Set());
      }
      this.upstreamIndex.get(dependency.taskId)!.add(depId);
    }

    this.dependencies.set(dependency.taskId, dependency);
  }

  /**
   * 批量保存依赖定义
   */
  async saveBatch(dependencies: TaskDependency[]): Promise<void> {
    for (const dep of dependencies) {
      await this.save(dep);
    }
  }

  /**
   * 获取依赖定义
   */
  async get(taskId: string): Promise<TaskDependency | undefined> {
    return this.dependencies.get(taskId);
  }

  /**
   * 获取所有依赖定义
   */
  async getAll(): Promise<TaskDependency[]> {
    return Array.from(this.dependencies.values());
  }

  /**
   * 删除依赖定义
   */
  async delete(taskId: string): Promise<void> {
    const dependency = this.dependencies.get(taskId);
    if (!dependency) return;

    // 清理索引
    for (const depId of dependency.dependsOn) {
      this.downstreamIndex.get(depId)?.delete(taskId);
      this.upstreamIndex.get(taskId)?.delete(depId);
    }

    this.dependencies.delete(taskId);
    this.states.delete(taskId);
  }

  /**
   * 批量删除依赖定义
   */
  async deleteBatch(taskIds: string[]): Promise<void> {
    for (const taskId of taskIds) {
      await this.delete(taskId);
    }
  }

  // ==================== 依赖状态管理 ====================

  /**
   * 获取依赖状态
   */
  async getState(taskId: string): Promise<DependencyState | undefined> {
    return this.states.get(taskId);
  }

  /**
   * 保存依赖状态
   */
  async saveState(state: DependencyState): Promise<void> {
    this.states.set(state.taskId, state);
  }

  /**
   * 更新单个依赖项状态
   */
  async updateDependencyItemStatus(
    taskId: string,
    dependsOnTaskId: string,
    status: DependencyItemStatus,
    details?: Partial<DependencyItemDetail>
  ): Promise<void> {
    const state = this.states.get(taskId);
    if (!state) return;

    const detail = state.dependencyDetails.get(dependsOnTaskId);
    if (!detail) return;

    // 更新详情
    Object.assign(detail, details, { status });
    state.dependencyDetails.set(dependsOnTaskId, detail);
    state.dependencyStatus.set(dependsOnTaskId, status);

    this.states.set(taskId, state);
  }

  // ==================== 依赖历史记录 ====================

  /**
   * 添加历史记录
   */
  async addHistoryEntry(entry: DependencyHistoryEntry): Promise<void> {
    if (!this.history.has(entry.taskId)) {
      this.history.set(entry.taskId, []);
    }
    this.history.get(entry.taskId)!.push(entry);
  }

  /**
   * 获取依赖历史
   */
  async getDependencyHistory(
    taskId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: DependencyEventType[];
    }
  ): Promise<DependencyHistoryEntry[]> {
    let entries = this.history.get(taskId) || [];

    // 过滤事件类型
    if (options?.eventTypes) {
      entries = entries.filter(e => options.eventTypes!.includes(e.eventType));
    }

    // 排序（最新的在前）
    entries.sort((a, b) => b.timestamp - a.timestamp);

    // 分页
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return entries.slice(offset, offset + limit);
  }

  // ==================== 查询接口 ====================

  /**
   * 查询任务的下游依赖
   * 返回依赖此任务的所有任务定义
   */
  async getDownstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    const taskIds = this.downstreamIndex.get(taskId) || new Set();
    const result: TaskDependency[] = [];

    for (const id of taskIds) {
      const dep = this.dependencies.get(id);
      if (dep) {
        result.push(dep);
      }
    }

    return result;
  }

  /**
   * 查询任务的上游依赖
   * 返回此任务依赖的所有任务定义
   */
  async getUpstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    const taskIds = this.upstreamIndex.get(taskId) || new Set();
    const result: TaskDependency[] = [];

    for (const id of taskIds) {
      const dep = this.dependencies.get(id);
      if (dep) {
        result.push(dep);
      }
    }

    return result;
  }

  /**
   * 获取所有阻塞的任务
   */
  async getBlockedTasks(): Promise<string[]> {
    const result: string[] = [];

    for (const [taskId, state] of this.states) {
      if (!state.ready && state.blockedBy && state.blockedBy.length > 0) {
        result.push(taskId);
      }
    }

    return result;
  }

  // ==================== 生命周期 ====================

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    this.dependencies.clear();
    this.states.clear();
    this.history.clear();
    this.downstreamIndex.clear();
    this.upstreamIndex.clear();
  }
}