/**
 * DependencyManager - 依赖管理器核心类
 *
 * 核心职责：
 * 1. 依赖注册与注销
 * 2. 状态追踪与更新
 * 3. 循环依赖检测（复用 TopologicalSorter）
 * 4. 就绪状态检查
 * 5. 超时管理
 *
 * Phase 0 修复说明：
 * - detectCycle 参数格式：正确映射到 WorkflowNode/WorkflowConnection
 * - eventEmitter.emit 调用：使用 EventEmitter<DependencyEvents> 泛型实例
 * - scheduleTimeout 同步/异步模式：明确为同步调度、异步回调
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import { EventEmitter } from '../managers/event-emitter';
import { TopologicalSorter } from '../workflow/topological-sorter';
import { WorkflowNode, WorkflowConnection } from '../workflow/types';
import {
  TaskDependency,
  DependencyState,
  DependencyItemStatus,
  DependencyItemDetail,
  DependencyEvents,
  DependencyHistoryEntry,
  DependencyEventType,
  DependencyResolveResult,
  DependencyGraph,
  DependencyGraphNode,
  DependencyGraphEdge,
  CycleDetectedError,
  IDependencyStore,
} from './types';
import { InMemoryDependencyStore } from './dependency-store';

/**
 * 依赖解析器
 *
 * 负责：
 * 1. 解析依赖是否就绪
 * 2. 计算阻塞原因
 * 3. 构建依赖图
 */
export class DependencyResolver {
  /**
   * 解析依赖状态
   *
   * @param state 当前依赖状态
   * @param dependency 依赖定义
   * @returns 解析结果
   */
  resolve(
    state: DependencyState,
    dependency: TaskDependency
  ): DependencyResolveResult {
    const satisfiedDeps: string[] = [];
    const blockedDeps: string[] = [];
    const failedDeps: string[] = [];

    for (const depTaskId of dependency.dependsOn) {
      const detail = state.dependencyDetails.get(depTaskId);
      if (!detail) continue;

      switch (detail.status) {
        case 'satisfied':
          satisfiedDeps.push(depTaskId);
          break;
        case 'failed':
        case 'timeout':
          failedDeps.push(depTaskId);
          break;
        case 'pending':
          blockedDeps.push(depTaskId);
          break;
      }
    }

    // 检查是否就绪
    let ready = false;
    let blockedBy: string[] = [];
    let reason = '';

    if (dependency.condition === 'all') {
      // 全部满足模式
      if (satisfiedDeps.length === dependency.dependsOn.length) {
        ready = true;
        reason = 'All dependencies satisfied';
      } else if (failedDeps.length > 0) {
        blockedBy = failedDeps;
        reason = 'Some dependencies failed';
      } else {
        blockedBy = blockedDeps;
        reason = 'Waiting for dependencies';
      }
    } else {
      // 任一满足模式
      if (satisfiedDeps.length > 0) {
        ready = true;
        reason = 'At least one dependency satisfied';
      } else if (failedDeps.length === dependency.dependsOn.length) {
        blockedBy = failedDeps;
        reason = 'All dependencies failed';
      } else {
        blockedBy = blockedDeps;
        reason = 'Waiting for dependencies';
      }
    }

    return { ready, blockedBy, reason };
  }

  /**
   * 构建依赖图
   *
   * @param dependencies 依赖定义列表
   * @param states 依赖状态映射
   * @returns 依赖图
   */
  buildGraph(
    dependencies: TaskDependency[],
    states: Map<string, DependencyState>
  ): DependencyGraph {
    const nodeMap = new Map<string, DependencyGraphNode>();
    const edges: DependencyGraphEdge[] = [];

    // 构建节点
    for (const dep of dependencies) {
      const state = states.get(dep.taskId);
      let status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' = 'pending';

      if (state) {
        if (state.ready) {
          status = 'ready';
        } else if (state.blockedBy && state.blockedBy.length > 0) {
          status = 'pending';
        }
      }

      nodeMap.set(dep.taskId, {
        taskId: dep.taskId,
        status,
      });

      // 添加依赖节点
      for (const depId of dep.dependsOn) {
        if (!nodeMap.has(depId)) {
          nodeMap.set(depId, {
            taskId: depId,
            status: 'pending',
          });
        }
      }
    }

    // 构建边
    for (const dep of dependencies) {
      for (const depId of dep.dependsOn) {
        edges.push({
          from: depId,
          to: dep.taskId,
          type: dep.type,
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    };
  }
}

/**
 * 超时定时器注册表
 *
 * 管理依赖超时的定时器
 */
export class TimeoutRegistry {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 设置超时定时器
   *
   * @param taskId 任务 ID
   * @param timeout 超时时间（毫秒）
   * @param callback 超时回调
   */
  set(taskId: string, timeout: number, callback: () => void): void {
    // 清除旧定时器
    this.clear(taskId);

    const timer = setTimeout(() => {
      this.timers.delete(taskId);
      callback();
    }, timeout);

    this.timers.set(taskId, timer);
  }

  /**
   * 清除指定任务的超时定时器
   */
  clear(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  /**
   * 清除所有超时定时器
   */
  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * 获取活跃定时器数量
   */
  get size(): number {
    return this.timers.size;
  }
}

/**
 * 依赖管理器
 *
 * 核心职责：
 * 1. 依赖注册与注销
 * 2. 状态追踪与更新
 * 3. 循环依赖检测
 * 4. 自动触发逻辑
 */
export class DependencyManager {
  private store: IDependencyStore;
  private resolver: DependencyResolver;
  private timeoutRegistry: TimeoutRegistry;
  private eventEmitter: EventEmitter<DependencyEvents>;
  private topologicalSorter: TopologicalSorter;

  // 并发控制（debounce）
  private pendingChecks: Set<string> = new Set();
  private checkScheduled: boolean = false;

  /**
   * 创建依赖管理器
   *
   * @param store 依赖存储（默认使用内存存储）
   * @param eventEmitter 事件发射器（默认创建新实例）
   */
  constructor(
    store?: IDependencyStore,
    eventEmitter?: EventEmitter<DependencyEvents>
  ) {
    this.store = store || new InMemoryDependencyStore();
    this.eventEmitter = eventEmitter || new EventEmitter<DependencyEvents>();
    this.resolver = new DependencyResolver();
    this.timeoutRegistry = new TimeoutRegistry();
    this.topologicalSorter = new TopologicalSorter();
  }

  // ==================== 生命周期管理 ====================

  /**
   * 初始化依赖管理器
   * 恢复未完成依赖的超时定时器
   */
  async initialize(): Promise<void> {
    const dependencies = await this.store.getAll();
    for (const dep of dependencies) {
      if (dep.timeout > 0) {
        const state = await this.store.getState(dep.taskId);
        if (state && !state.ready) {
          this.scheduleTimeout(dep);
        }
      }
    }
  }

  /**
   * 销毁依赖管理器
   * 清理所有超时定时器和事件监听
   */
  async destroy(): Promise<void> {
    this.timeoutRegistry.clearAll();
    this.eventEmitter.clearAll();
  }

  // ==================== 依赖注册 ====================

  /**
   * 注册依赖
   *
   * 步骤：
   * 1. 循环依赖检测
   * 2. 保存依赖定义
   * 3. 初始化依赖状态
   * 4. 设置超时定时器
   * 5. 触发注册事件
   * 6. 检查就绪状态
   *
   * @param dependency 依赖定义
   * @throws CycleDetectedError 如果检测到循环依赖
   */
  async register(dependency: TaskDependency): Promise<void> {
    // 1. 循环依赖检测
    await this.detectCycle(dependency);

    // 2. 保存依赖定义
    const now = new Date().toISOString();
    await this.store.save({
      ...dependency,
      createdAt: dependency.createdAt || now,
      updatedAt: now,
    });

    // 3. 初始化依赖状态
    const state = this.createInitialState(dependency);
    await this.store.saveState(state);

    // 4. 设置超时定时器（同步调度）
    if (dependency.timeout > 0) {
      this.scheduleTimeout(dependency);
    }

    // 5. 触发注册事件
    this.eventEmitter.emit('dependency:registered', {
      taskId: dependency.taskId,
      dependsOn: dependency.dependsOn,
      timestamp: Date.now(),
    });

    // 6. 立即检查就绪状态（可能所有依赖都已满足）
    await this.checkReadiness(dependency.taskId);
  }

  /**
   * 注销依赖
   *
   * @param taskId 任务 ID
   */
  async unregister(taskId: string): Promise<void> {
    // 1. 清除超时定时器
    this.timeoutRegistry.clear(taskId);

    // 2. 删除依赖定义和状态
    await this.store.delete(taskId);

    // 3. 触发注销事件
    this.eventEmitter.emit('dependency:unregistered', {
      taskId,
      timestamp: Date.now(),
    });
  }

  // ==================== 依赖查询 ====================

  /**
   * 查询任务的上游依赖
   *
   * @param taskId 任务 ID
   * @returns 上游依赖定义列表
   */
  async getUpstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    return this.store.getUpstreamDependencies(taskId);
  }

  /**
   * 查询任务的下游依赖
   *
   * @param taskId 任务 ID
   * @returns 下游依赖定义列表
   */
  async getDownstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    return this.store.getDownstreamDependencies(taskId);
  }

  /**
   * 获取依赖状态
   *
   * @param taskId 任务 ID
   * @returns 依赖状态
   */
  async getDependencyState(taskId: string): Promise<DependencyState | undefined> {
    return this.store.getState(taskId);
  }

  /**
   * 检查任务是否就绪
   *
   * @param taskId 任务 ID
   * @returns 是否就绪
   */
  async isReady(taskId: string): Promise<boolean> {
    const state = await this.store.getState(taskId);
    return state?.ready ?? false;
  }

  /**
   * 获取所有阻塞的任务
   *
   * @returns 阻塞的任务 ID 列表
   */
  async getBlockedTasks(): Promise<string[]> {
    return this.store.getBlockedTasks();
  }

  /**
   * 获取依赖图
   *
   * @returns 依赖图
   */
  async getDependencyGraph(): Promise<DependencyGraph> {
    const dependencies = await this.store.getAll();
    const states = new Map<string, DependencyState>();

    for (const dep of dependencies) {
      const state = await this.store.getState(dep.taskId);
      if (state) {
        states.set(dep.taskId, state);
      }
    }

    return this.resolver.buildGraph(dependencies, states);
  }

  // ==================== 依赖历史查询 ====================

  /**
   * 获取依赖历史
   *
   * @param taskId 任务 ID
   * @param options 查询选项
   * @returns 历史记录列表
   */
  async getDependencyHistory(
    taskId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: DependencyEventType[];
    }
  ): Promise<DependencyHistoryEntry[]> {
    return this.store.getDependencyHistory(taskId, options);
  }

  // ==================== 强制解析 ====================

  /**
   * 强制解析依赖
   *
   * 用于：
   * 1. 跳过长时间阻塞的依赖
   * 2. 紧急情况下手动触发任务
   *
   * @param taskId 任务 ID
   * @param options 强制解析选项
   */
  async forceResolve(
    taskId: string,
    options: {
      reason: string;
      skipDependsOn?: string[];
      strategy?: 'skip' | 'force_ready';
    }
  ): Promise<void> {
    const dependency = await this.store.get(taskId);
    if (!dependency) {
      throw new Error(`Dependency not found: ${taskId}`);
    }

    const state = await this.store.getState(taskId);
    if (!state) {
      throw new Error(`Dependency state not found: ${taskId}`);
    }

    const skipSet = new Set(options.skipDependsOn || []);
    const now = Date.now();

    // 更新状态
    for (const [depTaskId, detail] of state.dependencyDetails) {
      if (skipSet.has(depTaskId) || options.strategy === 'force_ready') {
        detail.status = 'satisfied';
        detail.satisfiedTime = now;
        detail.skipReason = options.reason;

        await this.store.updateDependencyItemStatus(
          taskId,
          depTaskId,
          'satisfied',
          detail
        );
      }
    }

    // 记录历史
    await this.store.addHistoryEntry({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: 'dependency:ready',
      timestamp: now,
      details: {
        forced: true,
        reason: options.reason,
        strategy: options.strategy,
      },
    });

    // 检查就绪状态
    await this.checkReadiness(taskId);
  }

  // ==================== 状态更新 ====================

  /**
   * 更新依赖状态（内部方法）
   *
   * 当依赖项的状态发生变化时调用。更新存储中的状态，
   * 记录历史，触发相应的依赖事件，并调度就绪检查。
   *
   * @param taskId 任务 ID
   * @param dependsOnTaskId 依赖任务 ID
   * @param status 新状态
   * @param error 错误信息（失败时）
   * @param skipReason 跳过原因（用于 skip/fallback 策略，如任务取消时）
   */
  async updateDependencyStatus(
    taskId: string,
    dependsOnTaskId: string,
    status: DependencyItemStatus,
    error?: string,
    skipReason?: string
  ): Promise<void> {
    const state = await this.store.getState(taskId);
    if (!state) return;

    const detail = state.dependencyDetails.get(dependsOnTaskId);
    if (!detail) return;

    // 更新状态
    const now = Date.now();
    detail.status = status;
    if (status === 'satisfied') {
      detail.satisfiedTime = now;
    }
    if (error) {
      detail.error = error;
    }
    if (skipReason) {
      detail.skipReason = skipReason;
    }

    await this.store.updateDependencyItemStatus(
      taskId,
      dependsOnTaskId,
      status,
      detail
    );

    // 记录历史
    await this.store.addHistoryEntry({
      id: `history-${now}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: status === 'satisfied' ? 'dependency:resolved' : 'dependency:failed',
      timestamp: now,
      relatedTaskId: dependsOnTaskId,
      details: { status, error },
    });

    // 触发相应事件
    if (status === 'satisfied') {
      this.eventEmitter.emit('dependency:resolved', {
        taskId,
        resolvedTaskId: dependsOnTaskId,
        satisfiedTime: now,
        timestamp: now,
      });
    } else if (status === 'failed') {
      this.eventEmitter.emit('dependency:failed', {
        taskId,
        failedTaskId: dependsOnTaskId,
        error,
        skipReason,
        timestamp: now,
      });
    }

    // 调度就绪检查（debounce）
    this.scheduleReadinessCheck(taskId);
  }

  /**
   * 获取事件发射器（供外部监听事件）
   */
  getEventEmitter(): EventEmitter<DependencyEvents> {
    return this.eventEmitter;
  }

  // ==================== 私有方法 ====================

  /**
   * 创建初始依赖状态
   *
   * @param dependency 依赖定义
   * @returns 初始依赖状态
   */
  private createInitialState(dependency: TaskDependency): DependencyState {
    const details = new Map<string, DependencyItemDetail>();
    const statusMap = new Map<string, DependencyItemStatus>();

    for (const depTaskId of dependency.dependsOn) {
      details.set(depTaskId, {
        dependsOnTaskId: depTaskId,
        status: 'pending',
      });
      statusMap.set(depTaskId, 'pending');
    }

    return {
      taskId: dependency.taskId,
      dependencyDetails: details,
      dependencyStatus: statusMap,
      ready: false,
      blockedBy: dependency.dependsOn.length > 0 ? [...dependency.dependsOn] : undefined,
    };
  }

  /**
   * 循环依赖检测
   *
   * Phase 0 修复：正确映射到 WorkflowNode/WorkflowConnection 类型
   * 将依赖图转换为 TopologicalSorter 需要的格式
   *
   * @param dependency 新注册的依赖
   * @throws CycleDetectedError 如果检测到循环依赖
   */
  private async detectCycle(dependency: TaskDependency): Promise<void> {
    const dependencies = await this.store.getAll();

    // 构建节点列表（符合 WorkflowNode 接口）
    const nodeIds = new Set<string>();
    nodeIds.add(dependency.taskId);
    for (const dep of dependencies) {
      nodeIds.add(dep.taskId);
      for (const depId of dep.dependsOn) {
        nodeIds.add(depId);
      }
    }
    for (const depId of dependency.dependsOn) {
      nodeIds.add(depId);
    }

    const nodes: WorkflowNode[] = Array.from(nodeIds).map(id => ({
      id,
      type: 'task',
      name: id,
      config: {},
    }));

    // 构建连接列表（符合 WorkflowConnection 接口）
    const connections: WorkflowConnection[] = [];

    // 新依赖的边
    for (const depId of dependency.dependsOn) {
      connections.push({
        source: depId,
        target: dependency.taskId,
      });
    }

    // 已有依赖的边
    for (const dep of dependencies) {
      for (const depId of dep.dependsOn) {
        connections.push({
          source: depId,
          target: dep.taskId,
        });
      }
    }

    // 使用 TopologicalSorter 检测循环
    const cycles = this.topologicalSorter.detectCycle(nodes, connections);

    if (cycles.length > 0) {
      throw new CycleDetectedError(cycles);
    }
  }

  /**
   * 调度就绪检查（debounce）
   *
   * 使用 queueMicrotask 实现批量检查，避免多次快速状态更新导致的重复检查
   *
   * @param taskId 任务 ID
   */
  private scheduleReadinessCheck(taskId: string): void {
    this.pendingChecks.add(taskId);

    if (!this.checkScheduled) {
      this.checkScheduled = true;
      queueMicrotask(() => {
        const tasksToCheck = Array.from(this.pendingChecks);
        this.pendingChecks.clear();
        this.checkScheduled = false;

        // 批量检查
        for (const id of tasksToCheck) {
          this.checkReadiness(id);
        }
      });
    }
  }

  /**
   * 检查就绪状态
   *
   * @param taskId 任务 ID
   */
  private async checkReadiness(taskId: string): Promise<void> {
    const dependency = await this.store.get(taskId);
    const state = await this.store.getState(taskId);
    if (!dependency || !state) return;

    const result = this.resolver.resolve(state, dependency);

    if (result.ready && !state.ready) {
      // 更新为就绪
      state.ready = true;
      state.readyTime = Date.now();
      state.blockedBy = undefined;
      await this.store.saveState(state);

      // 清除超时定时器
      this.timeoutRegistry.clear(taskId);

      // 触发就绪事件
      this.eventEmitter.emit('dependency:ready', {
        taskId,
        readyTime: state.readyTime,
        timestamp: Date.now(),
      });
    } else if (!result.ready && state.ready) {
      // 更新为阻塞（通常不会发生，除非状态被手动回退）
      state.ready = false;
      state.blockedBy = result.blockedBy;
      await this.store.saveState(state);

      // 触发阻塞事件
      this.eventEmitter.emit('dependency:blocked', {
        taskId,
        blockedBy: result.blockedBy!,
        reason: result.reason,
        timestamp: Date.now(),
      });
    } else if (!result.ready && !state.ready) {
      // 仍然阻塞，更新阻塞原因
      if (JSON.stringify(state.blockedBy) !== JSON.stringify(result.blockedBy)) {
        state.blockedBy = result.blockedBy;
        await this.store.saveState(state);
      }
    }
  }

  /**
   * 调度超时定时器
   *
   * Phase 0 修复：明确为同步调度模式
   * - 定时器设置是同步操作
   * - 超时回调是异步操作
   * - 不需要 await 来设置定时器
   *
   * @param dependency 依赖定义
   */
  private scheduleTimeout(dependency: TaskDependency): void {
    // 同步调度超时定时器
    this.timeoutRegistry.set(
      dependency.taskId,
      dependency.timeout,
      () => this.handleTimeout(dependency.taskId)
    );

    // 异步更新状态中的超时时间戳（非阻塞）
    const timeoutAt = Date.now() + dependency.timeout;
    this.store.getState(dependency.taskId).then(state => {
      if (state) {
        state.timeoutAt = timeoutAt;
        this.store.saveState(state);
      }
    });
  }

  /**
   * 处理超时
   *
   * @param taskId 任务 ID
   */
  private async handleTimeout(taskId: string): Promise<void> {
    const dependency = await this.store.get(taskId);
    const state = await this.store.getState(taskId);
    if (!dependency || !state || state.ready) return;

    // 更新所有未满足的依赖为超时
    for (const [depTaskId, detail] of state.dependencyDetails) {
      if (detail.status === 'pending') {
        detail.status = 'timeout';
        detail.timeoutAt = Date.now();
        await this.store.updateDependencyItemStatus(
          taskId,
          depTaskId,
          'timeout',
          detail
        );
      }
    }

    // 记录历史
    await this.store.addHistoryEntry({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: 'dependency:timeout',
      timestamp: Date.now(),
      details: { timeoutAt: state.timeoutAt },
    });

    // 触发超时事件
    this.eventEmitter.emit('dependency:timeout', {
      taskId,
      timeoutTaskId: taskId,
      timestamp: Date.now(),
    });

    // 处理失败策略
    await this.handleFailureStrategy(dependency, 'timeout');
  }

  /**
   * 处理失败策略
   *
   * @param dependency 依赖定义
   * @param failureType 失败类型
   */
  private async handleFailureStrategy(
    dependency: TaskDependency,
    failureType: 'failed' | 'timeout'
  ): Promise<void> {
    switch (dependency.onFailure) {
      case 'block':
        // 已经阻塞，无需额外处理
        this.eventEmitter.emit('dependency:blocked', {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: `Dependency ${failureType}, task blocked`,
          timestamp: Date.now(),
        });
        break;

      case 'skip':
        // 跳过任务 - 由上层 SessionTaskManager 处理
        this.eventEmitter.emit('dependency:blocked', {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: `Dependency ${failureType}, task skipped`,
          timestamp: Date.now(),
        });
        break;

      case 'fallback':
        // 执行 fallback 任务 - 由上层 SessionTaskManager 处理
        this.eventEmitter.emit('dependency:blocked', {
          taskId: dependency.taskId,
          blockedBy: [],
          reason: dependency.fallbackTaskId
            ? `Dependency ${failureType}, fallback to ${dependency.fallbackTaskId}`
            : `Dependency ${failureType}, no fallback task configured`,
          timestamp: Date.now(),
        });
        break;
    }
  }
}