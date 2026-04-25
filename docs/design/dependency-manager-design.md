# 依赖管理模块详细设计

**版本**: 1.0.0
**作者**: CC 架构专家
**日期**: 2026-04-19
**状态**: Draft

---

## 1. 模块架构

### 1.1 文件结构

```
src/core/dependency-manager/
├── types.ts                    # 类型定义（含评审建议补充）
├── dependency-manager.ts       # 核心管理器
├── dependency-store.ts         # 存储层接口实现
├── dependency-resolver.ts      # 依赖解析器
├── dependency-event-listener.ts # 事件转换层（task:* → dependency:*）
├── timeout-registry.ts         # 超时定时器注册表
└── index.ts                    # 模块入口
```

### 1.2 模块依赖关系

```
DependencyManager (主控制器)
    ├── DependencyStore (存储层)
    ├── DependencyResolver (解析器)
    ├── DependencyEventListener (事件转换层)
    ├── TimeoutRegistry (超时管理)
    └── EventEmitter (事件系统 - 复用现有)
```

**与现有模块集成**：
- **EventEmitter**: 复用 `src/core/managers/event-emitter.ts`
- **TopologicalSorter**: 复用 `src/core/workflow/topological-sorter.ts` 的循环检测算法
- **SessionTaskManager**: 作为上层协调器，依赖 DependencyManager

---

## 2. 数据模型

### 2.1 核心类型定义

```typescript
/**
 * 任务依赖定义
 */
export interface TaskDependency {
  /** 任务 ID */
  taskId: string;

  /** 前置依赖任务 ID 列表 */
  dependsOn: string[];

  /** 依赖类型：硬依赖（必须满足）/ 软依赖（可选） */
  type: 'hard' | 'soft';

  /** 满足条件：全部满足 / 任一满足 */
  condition: 'all' | 'any';

  /** 依赖超时时间（毫秒），0 表示不超时 */
  timeout: number;

  /** 依赖失败策略 */
  onFailure: 'block' | 'skip' | 'fallback';

  /** fallback 策略的备用任务 ID */
  fallbackTaskId?: string;

  /** 创建时间 */
  createdAt: string;

  /** 更新时间 */
  updatedAt: string;
}

/**
 * 依赖项状态
 */
export type DependencyItemStatus =
  | 'pending'     // 等待中
  | 'satisfied'   // 已满足
  | 'failed'      // 已失败
  | 'timeout';    // 已超时

/**
 * 依赖项详情（补充评审建议）
 */
export interface DependencyItemDetail {
  /** 依赖任务 ID */
  dependsOnTaskId: string;

  /** 依赖状态 */
  status: DependencyItemStatus;

  /** 满足时间（新增） */
  satisfiedTime?: number;

  /** 跳过原因（新增，用于 skip/fallback 策略） */
  skipReason?: string;

  /** 错误信息（失败时） */
  error?: string;

  /** 超时时间戳（设置超时时） */
  timeoutAt?: number;
}

/**
 * 依赖状态
 */
export interface DependencyState {
  /** 任务 ID */
  taskId: string;

  /** 各依赖任务的详细状态 */
  dependencyDetails: Map<string, DependencyItemDetail>;

  /** 简化的状态映射（兼容旧版） */
  dependencyStatus: Map<string, DependencyItemStatus>;

  /** 是否就绪（所有硬依赖满足） */
  ready: boolean;

  /** 阻塞原因（未就绪时） */
  blockedBy?: string[];

  /** 就绪时间 */
  readyTime?: number;

  /** 超时时间（任务级别的整体超时） */
  timeoutAt?: number;
}

/**
 * 依赖历史记录（新增）
 */
export interface DependencyHistoryEntry {
  /** 记录 ID */
  id: string;

  /** 任务 ID */
  taskId: string;

  /** 事件类型 */
  eventType: DependencyEventType;

  /** 时间戳 */
  timestamp: number;

  /** 依赖任务 ID（如果事件与单个依赖相关） */
  relatedTaskId?: string;

  /** 详细信息 */
  details: Record<string, any>;
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  /** 节点列表 */
  nodes: DependencyGraphNode[];

  /** 边列表 */
  edges: DependencyGraphEdge[];
}

export interface DependencyGraphNode {
  taskId: string;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  label?: string;
}

export interface DependencyGraphEdge {
  from: string;
  to: string;
  type: 'hard' | 'soft';
}
```

### 2.2 事件类型定义

```typescript
/**
 * 依赖事件类型
 */
export type DependencyEventType =
  | 'dependency:registered'   // 依赖注册
  | 'dependency:resolved'     // 单个依赖满足
  | 'dependency:failed'       // 单个依赖失败
  | 'dependency:timeout'      // 依赖超时
  | 'dependency:ready'        // 所有依赖就绪，可执行
  | 'dependency:blocked'      // 依赖阻塞
  | 'dependency:unregistered' // 依赖注销
  | 'dependency:triggered';   // 触发执行

/**
 * 依赖事件映射
 */
export interface DependencyEvents {
  'dependency:registered': DependencyRegisteredEvent;
  'dependency:resolved': DependencyResolvedEvent;
  'dependency:failed': DependencyFailedEvent;
  'dependency:timeout': DependencyTimeoutEvent;
  'dependency:ready': DependencyReadyEvent;
  'dependency:blocked': DependencyBlockedEvent;
  'dependency:unregistered': DependencyUnregisteredEvent;
  'dependency:triggered': DependencyTriggeredEvent;
}

export interface DependencyRegisteredEvent {
  taskId: string;
  dependsOn: string[];
  timestamp: number;
}

export interface DependencyResolvedEvent {
  taskId: string;
  resolvedTaskId: string;
  satisfiedTime: number;
  timestamp: number;
}

export interface DependencyFailedEvent {
  taskId: string;
  failedTaskId: string;
  error?: string;
  skipReason?: string;
  timestamp: number;
}

export interface DependencyTimeoutEvent {
  taskId: string;
  timeoutTaskId: string;
  timestamp: number;
}

export interface DependencyReadyEvent {
  taskId: string;
  readyTime: number;
  timestamp: number;
}

export interface DependencyBlockedEvent {
  taskId: string;
  blockedBy: string[];
  reason: string;
  timestamp: number;
}

export interface DependencyUnregisteredEvent {
  taskId: string;
  timestamp: number;
}

export interface DependencyTriggeredEvent {
  taskId: string;
  triggeredBy: string[];
  timestamp: number;
}
```

### 2.3 存储接口设计（评审遗留问题 2）

```typescript
/**
 * 依赖存储接口
 * 
 * 设计原则：
 * 1. 抽象存储层，便于测试和扩展
 * 2. 支持内存、Redis、SQLite 等多种后端
 * 3. 提供原子操作保证
 */
export interface IDependencyStore {
  // ==================== 依赖定义 CRUD ====================

  /**
   * 保存依赖定义
   */
  save(dependency: TaskDependency): Promise<void>;

  /**
   * 批量保存依赖定义
   */
  saveBatch(dependencies: TaskDependency[]): Promise<void>;

  /**
   * 获取依赖定义
   */
  get(taskId: string): Promise<TaskDependency | undefined>;

  /**
   * 获取所有依赖定义
   */
  getAll(): Promise<TaskDependency[]>;

  /**
   * 删除依赖定义
   */
  delete(taskId: string): Promise<void>;

  /**
   * 批量删除依赖定义
   */
  deleteBatch(taskIds: string[]): Promise<void>;

  // ==================== 依赖状态管理 ====================

  /**
   * 获取依赖状态
   */
  getState(taskId: string): Promise<DependencyState | undefined>;

  /**
   * 保存依赖状态
   */
  saveState(state: DependencyState): Promise<void>;

  /**
   * 更新单个依赖项状态
   */
  updateDependencyItemStatus(
    taskId: string,
    dependsOnTaskId: string,
    status: DependencyItemStatus,
    details?: Partial<DependencyItemDetail>
  ): Promise<void>;

  // ==================== 依赖历史记录（新增） ====================

  /**
   * 添加历史记录
   */
  addHistoryEntry(entry: DependencyHistoryEntry): Promise<void>;

  /**
   * 获取依赖历史
   */
  getDependencyHistory(
    taskId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: DependencyEventType[];
    }
  ): Promise<DependencyHistoryEntry[]>;

  // ==================== 查询接口 ====================

  /**
   * 查询任务的下游依赖
   */
  getDownstreamDependencies(taskId: string): Promise<TaskDependency[]>;

  /**
   * 查询任务的上游依赖
   */
  getUpstreamDependencies(taskId: string): Promise<TaskDependency[]>;

  /**
   * 获取所有阻塞的任务
   */
  getBlockedTasks(): Promise<string[]>;

  // ==================== 生命周期 ====================

  /**
   * 清空所有数据
   */
  clear(): Promise<void>;
}

/**
 * 内存存储实现（默认）
 */
export class InMemoryDependencyStore implements IDependencyStore {
  private dependencies: Map<string, TaskDependency> = new Map();
  private states: Map<string, DependencyState> = new Map();
  private history: Map<string, DependencyHistoryEntry[]> = new Map();
  private downstreamIndex: Map<string, Set<string>> = new Map();
  private upstreamIndex: Map<string, Set<string>> = new Map();

  // ... 实现细节见第 3 节
}
```

---

## 3. 核心实现

### 3.1 DependencyManager 主类

```typescript
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
  private eventListener: DependencyEventListener;
  private timeoutRegistry: TimeoutRegistry;
  private eventEmitter: EventEmitter<DependencyEvents>;
  
  // 并发控制
  private pendingChecks: Set<string> = new Set();
  private checkScheduled: boolean = false;

  constructor(
    store?: IDependencyStore,
    eventEmitter?: EventEmitter<DependencyEvents>
  ) {
    this.store = store || new InMemoryDependencyStore();
    this.eventEmitter = eventEmitter || new EventEmitter();
    this.resolver = new DependencyResolver(this.store);
    this.timeoutRegistry = new TimeoutRegistry();
    this.eventListener = new DependencyEventListener(
      this,
      this.eventEmitter
    );
  }

  // ==================== 生命周期管理 ====================

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 恢复超时定时器（如果有未完成的依赖）
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
   * 销毁
   */
  async destroy(): Promise<void> {
    this.timeoutRegistry.clearAll();
    this.eventListener.stopListening();
  }

  // ==================== 依赖注册 ====================

  /**
   * 注册依赖
   */
  async register(dependency: TaskDependency): Promise<void> {
    // 1. 循环依赖检测
    await this.detectCycle(dependency);

    // 2. 保存依赖定义
    const now = new Date().toISOString();
    await this.store.save({
      ...dependency,
      createdAt: now,
      updatedAt: now,
    });

    // 3. 初始化依赖状态
    const state = this.createInitialState(dependency);
    await this.store.saveState(state);

    // 4. 设置超时定时器
    if (dependency.timeout > 0) {
      this.scheduleTimeout(dependency);
    }

    // 5. 触发事件
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
   */
  async unregister(taskId: string): Promise<void> {
    // 1. 清除超时定时器
    this.timeoutRegistry.clear(taskId);

    // 2. 删除依赖定义
    await this.store.delete(taskId);

    // 3. 触发事件
    this.eventEmitter.emit('dependency:unregistered', {
      taskId,
      timestamp: Date.now(),
    });
  }

  // ==================== 依赖查询 ====================

  /**
   * 查询任务的上游依赖
   */
  async getUpstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    return this.store.getUpstreamDependencies(taskId);
  }

  /**
   * 查询任务的下游依赖
   */
  async getDownstreamDependencies(taskId: string): Promise<TaskDependency[]> {
    return this.store.getDownstreamDependencies(taskId);
  }

  /**
   * 获取依赖状态
   */
  async getDependencyState(taskId: string): Promise<DependencyState | undefined> {
    return this.store.getState(taskId);
  }

  /**
   * 检查任务是否就绪
   */
  async isReady(taskId: string): Promise<boolean> {
    const state = await this.store.getState(taskId);
    return state?.ready ?? false;
  }

  /**
   * 获取所有阻塞的任务
   */
  async getBlockedTasks(): Promise<string[]> {
    return this.store.getBlockedTasks();
  }

  /**
   * 获取依赖图
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

  // ==================== 依赖历史查询（新增） ====================

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
    return this.store.getDependencyHistory(taskId, options);
  }

  // ==================== 强制解析（新增） ====================

  /**
   * 强制解析依赖
   * 
   * 用于：
   * 1. 跳过长时间阻塞的依赖
   * 2. 紧急情况下手动触发任务
   */
  async forceResolve(
    taskId: string,
    options: {
      reason: string;
      skipDependsOn?: string[];  // 跳过特定依赖
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
   */
  async updateDependencyStatus(
    taskId: string,
    dependsOnTaskId: string,
    status: DependencyItemStatus,
    error?: string
  ): Promise<void> {
    const state = await this.store.getState(taskId);
    if (!state) return;

    const detail = state.dependencyDetails.get(dependsOnTaskId);
    if (!detail) return;

    // 更新状态
    detail.status = status;
    if (status === 'satisfied') {
      detail.satisfiedTime = Date.now();
    }
    if (error) {
      detail.error = error;
    }

    await this.store.updateDependencyItemStatus(
      taskId,
      dependsOnTaskId,
      status,
      detail
    );

    // 记录历史
    await this.store.addHistoryEntry({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      eventType: status === 'satisfied' ? 'dependency:resolved' : 'dependency:failed',
      timestamp: Date.now(),
      relatedTaskId: dependsOnTaskId,
      details: { status, error },
    });

    // 调度就绪检查（debounce）
    this.scheduleReadinessCheck(taskId);
  }

  // ==================== 私有方法 ====================

  /**
   * 创建初始状态
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
      blockedBy: dependency.dependsOn,
    };
  }

  /**
   * 循环依赖检测
   */
  private async detectCycle(dependency: TaskDependency): Promise<void> {
    const dependencies = await this.store.getAll();
    
    // 构建临时图
    const nodes = [
      { id: dependency.taskId },
      ...dependencies.map(d => ({ id: d.taskId })),
    ];
    
    const connections: Array<{ source: string; target: string }> = [
      ...dependency.dependsOn.map(depId => ({
        source: depId,
        target: dependency.taskId,
      })),
      ...dependencies.flatMap(d =>
        d.dependsOn.map(depId => ({
          source: depId,
          target: d.taskId,
        }))
      ),
    ];

    // 使用 TopologicalSorter 检测循环
    const sorter = new TopologicalSorter();
    const cycles = sorter.detectCycle(
      nodes.map(n => ({ id: n.id, type: 'task', name: n.id, config: {} })),
      connections.map((c, i) => ({
        id: `conn-${i}`,
        source: c.source,
        target: c.target,
      }))
    );

    if (cycles.length > 0) {
      throw new CycleDetectedError(cycles);
    }
  }

  /**
   * 调度就绪检查（debounce）
   */
  private scheduleReadinessCheck(taskId: string): void {
    this.pendingChecks.add(taskId);

    if (!this.checkScheduled) {
      this.checkScheduled = true;
      queueMicrotask(() => {
        const tasks = Array.from(this.pendingChecks);
        this.pendingChecks.clear();
        this.checkScheduled = false;

        // 批量检查
        tasks.forEach(id => this.checkReadiness(id));
      });
    }
  }

  /**
   * 检查就绪状态
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
      // 更新为阻塞
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
    }
  }

  /**
   * 调度超时定时器
   */
  private scheduleTimeout(dependency: TaskDependency): void {
    const state = await this.store.getState(dependency.taskId);
    if (!state || state.ready) return;

    const timeoutAt = Date.now() + dependency.timeout;
    state.timeoutAt = timeoutAt;
    await this.store.saveState(state);

    this.timeoutRegistry.set(
      dependency.taskId,
      dependency.timeout,
      () => this.handleTimeout(dependency.taskId)
    );
  }

  /**
   * 处理超时
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
   */
  private async handleFailureStrategy(
    dependency: TaskDependency,
    failureType: 'failed' | 'timeout'
  ): Promise<void> {
    switch (dependency.onFailure) {
      case 'block':
        // 已经阻塞，无需处理
        break;

      case 'skip':
        // 跳过任务，触发 skipped 事件
        // TODO: 与 SessionTaskManager 集成
        break;

      case 'fallback':
        // 执行 fallback 任务
        if (dependency.fallbackTaskId) {
          // TODO: 触发 fallback 任务执行
        }
        break;
    }
  }
}
```

### 3.2 DependencyStore 存储层

```typescript
/**
 * 内存存储实现
 */
export class InMemoryDependencyStore implements IDependencyStore {
  private dependencies: Map<string, TaskDependency> = new Map();
  private states: Map<string, DependencyState> = new Map();
  private history: Map<string, DependencyHistoryEntry[]> = new Map();
  
  // 索引（加速查询）
  private downstreamIndex: Map<string, Set<string>> = new Map();
  private upstreamIndex: Map<string, Set<string>> = new Map();

  // ==================== 依赖定义 CRUD ====================

  async save(dependency: TaskDependency): Promise<void> {
    // 更新索引
    for (const depId of dependency.dependsOn) {
      // 下游索引：depId -> taskId
      if (!this.downstreamIndex.has(depId)) {
        this.downstreamIndex.set(depId, new Set());
      }
      this.downstreamIndex.get(depId)!.add(dependency.taskId);

      // 上游索引：taskId -> depId
      if (!this.upstreamIndex.has(dependency.taskId)) {
        this.upstreamIndex.set(dependency.taskId, new Set());
      }
      this.upstreamIndex.get(dependency.taskId)!.add(depId);
    }

    this.dependencies.set(dependency.taskId, dependency);
  }

  async saveBatch(dependencies: TaskDependency[]): Promise<void> {
    for (const dep of dependencies) {
      await this.save(dep);
    }
  }

  async get(taskId: string): Promise<TaskDependency | undefined> {
    return this.dependencies.get(taskId);
  }

  async getAll(): Promise<TaskDependency[]> {
    return Array.from(this.dependencies.values());
  }

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

  async deleteBatch(taskIds: string[]): Promise<void> {
    for (const taskId of taskIds) {
      await this.delete(taskId);
    }
  }

  // ==================== 依赖状态管理 ====================

  async getState(taskId: string): Promise<DependencyState | undefined> {
    return this.states.get(taskId);
  }

  async saveState(state: DependencyState): Promise<void> {
    this.states.set(state.taskId, state);
  }

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

  async addHistoryEntry(entry: DependencyHistoryEntry): Promise<void> {
    if (!this.history.has(entry.taskId)) {
      this.history.set(entry.taskId, []);
    }
    this.history.get(entry.taskId)!.push(entry);
  }

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

  async clear(): Promise<void> {
    this.dependencies.clear();
    this.states.clear();
    this.history.clear();
    this.downstreamIndex.clear();
    this.upstreamIndex.clear();
  }
}
```

### 3.3 DependencyResolver 解析器

```typescript
/**
 * 依赖解析器
 * 
 * 负责：
 * 1. 解析依赖是否就绪
 * 2. 计算阻塞原因
 * 3. 构建依赖图
 */
export class DependencyResolver {
  constructor(private store: IDependencyStore) {}

  /**
   * 解析依赖状态
   */
  resolve(
    state: DependencyState,
    dependency: TaskDependency
  ): {
    ready: boolean;
    blockedBy?: string[];
    reason: string;
  } {
    const hardDeps = dependency.dependsOn.filter(
      (_, index) => dependency.type === 'hard' || 
        (dependency.type === 'soft' && index < dependency.dependsOn.length)
    );

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
      // 全部满足
      if (satisfiedDeps.length === dependency.dependsOn.length) {
        ready = true;
        reason = 'All dependencies satisfied';
      } else if (failedDeps.length > 0) {
        // 有失败依赖
        blockedBy = failedDeps;
        reason = 'Some dependencies failed';
      } else {
        // 等待中
        blockedBy = blockedDeps;
        reason = 'Waiting for dependencies';
      }
    } else {
      // 任一满足
      if (satisfiedDeps.length > 0) {
        ready = true;
        reason = 'At least one dependency satisfied';
      } else if (failedDeps.length === dependency.dependsOn.length) {
        // 全部失败
        blockedBy = failedDeps;
        reason = 'All dependencies failed';
      } else {
        // 等待中
        blockedBy = blockedDeps;
        reason = 'Waiting for dependencies';
      }
    }

    return { ready, blockedBy, reason };
  }

  /**
   * 构建依赖图
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
```

### 3.4 DependencyEventListener 事件转换层（评审遗留问题 1）

```typescript
/**
 * 依赖事件监听器
 * 
 * 核心职责：
 * 1. 监听任务事件（task:*）
 * 2. 转换为依赖事件（dependency:*）
 * 3. 触发依赖状态更新
 * 
 * 事件转换映射：
 * - task:completed → dependency:resolved
 * - task:failed → dependency:failed
 * - task:cancelled → dependency:failed (skipReason: cancelled)
 */
export class DependencyEventListener {
  private manager: DependencyManager;
  private eventEmitter: EventEmitter<DependencyEvents>;
  private unsubscribers: Array<() => void> = [];
  private listening: boolean = false;

  constructor(
    manager: DependencyManager,
    eventEmitter: EventEmitter<DependencyEvents>
  ) {
    this.manager = manager;
    this.eventEmitter = eventEmitter;
  }

  /**
   * 开始监听任务事件
   */
  startListening(taskEventEmitter: EventEmitter<any>): void {
    if (this.listening) return;

    // 监听任务完成事件
    const unsubCompleted = taskEventEmitter.on(
      'task:completed',
      (event: TaskCompletedEvent) => this.handleTaskCompleted(event)
    );
    this.unsubscribers.push(unsubCompleted);

    // 监听任务失败事件
    const unsubFailed = taskEventEmitter.on(
      'task:failed',
      (event: TaskFailedEvent) => this.handleTaskFailed(event)
    );
    this.unsubscribers.push(unsubFailed);

    // 监听任务取消事件
    const unsubCancelled = taskEventEmitter.on(
      'task:cancelled',
      (event: TaskCancelledEvent) => this.handleTaskCancelled(event)
    );
    this.unsubscribers.push(unsubCancelled);

    this.listening = true;
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.listening = false;
  }

  // ==================== 事件处理 ====================

  /**
   * 处理任务完成事件
   */
  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const completedTaskId = event.flowId;

    // 查找依赖此任务的所有下游任务
    const downstreamDeps = await this.manager.getDownstreamDependencies(completedTaskId);

    for (const dep of downstreamDeps) {
      if (dep.dependsOn.includes(completedTaskId)) {        // 更新依赖状态
        await this.manager.updateDependencyStatus(dep.taskId, completedTaskId, 'satisfied');
        
        // 检查是否就绪
        const state = await this.manager.getDependencyState(dep.taskId);
        if (state?.ready) {
          this.manager.emit('dependency:ready', { taskId: dep.taskId });
        }
      }
    }
  }

  /**
   * 处理任务失败事件
   */
  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const failedTaskId = event.flowId;
    const downstreamDeps = await this.manager.getDownstreamDependencies(failedTaskId);

    for (const dep of downstreamDeps) {
      if (dep.dependsOn.includes(failedTaskId)) {
        // 更新依赖状态
        await this.manager.updateDependencyStatus(dep.taskId, failedTaskId, 'failed');
        
        // 触发失败传播
        await this.manager.handleFailurePropagation(dep.taskId, failedTaskId);
      }
    }
  }

  /**
   * 处理任务取消事件
   */
  private async handleTaskCancelled(event: TaskCancelledEvent): Promise<void> {
    const cancelledTaskId = event.flowId;
    const downstreamDeps = await this.manager.getDownstreamDependencies(cancelledTaskId);

    for (const dep of downstreamDeps) {
      if (dep.dependsOn.includes(cancelledTaskId)) {
        await this.manager.updateDependencyStatus(dep.taskId, cancelledTaskId, 'failed');
        await this.manager.handleFailurePropagation(dep.taskId, cancelledTaskId);
      }
    }
  }
}
```

---

## 4. 事件系统

### 4.1 事件转换机制

DependencyEventListener 负责将任务生命周期事件转换为依赖事件：

```
任务事件                  依赖事件
task:completed    →    dependency:resolved
task:failed       →    dependency:failed
task:cancelled    →    dependency:failed
(所有依赖满足)     →    dependency:ready
(依赖超时)        →    dependency:timeout
(注册依赖)        →    dependency:registered
(注销依赖)        →    dependency:unregistered
(触发执行)        →    dependency:triggered
```

### 4.2 事件流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          EventManager                                │
│  task:completed | task:failed | task:cancelled                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   DependencyEventListener                            │
│  handleTaskCompleted() | handleTaskFailed() | handleTaskCancelled() │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DependencyManager                              │
│  updateDependencyStatus() → checkReadiness() → emit dependency:*    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SessionTaskManager                                 │
│  监听 dependency:ready → executeTask()                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 边界场景实现方案

### 5.1 并发触发（Debounce）

```typescript
class DependencyManager {
  private pendingChecks = new Set<string>();
  private checkScheduled = false;

  private scheduleReadinessCheck(taskId: string): void {
    this.pendingChecks.add(taskId);
    
    if (!this.checkScheduled) {
      this.checkScheduled = true;
      queueMicrotask(() => {
        const tasksToCheck = [...this.pendingChecks];
        this.pendingChecks.clear();
        this.checkScheduled = false;
        
        // 批量检查
        for (const id of tasksToCheck) {
          this.checkReadiness(id);
        }
      });
    }
  }
}
```

### 5.2 超时处理

```typescript
class DependencyManager {
  private timeoutTimers = new Map<string, NodeJS.Timeout>();

  private startTimeoutTimer(dependency: TaskDependency): void {
    if (dependency.timeout <= 0) return;

    const timerId = `${dependency.taskId}:timeout`;
    
    // 清除旧定时器
    if (this.timeoutTimers.has(timerId)) {
      clearTimeout(this.timeoutTimers.get(timerId)!);
    }

    const timer = setTimeout(async () => {
      await this.handleDependencyTimeout(dependency);
      this.timeoutTimers.delete(timerId);
    }, dependency.timeout);

    this.timeoutTimers.set(timerId, timer);
  }

  private async handleDependencyTimeout(dependency: TaskDependency): Promise<void> {
    const state = await this.getDependencyState(dependency.taskId);
    
    if (!state?.ready) {
      // 更新超时状态
      for (const depId of dependency.dependsOn) {
        const status = state?.dependencyStatus.get(depId);
        if (status === 'pending') {
          await this.updateDependencyStatus(dependency.taskId, depId, 'timeout');
        }
      }

      this.emit('dependency:timeout', { taskId: dependency.taskId });

      // 触发失败传播
      await this.handleFailurePropagation(dependency.taskId, 'timeout');
    }
  }

  // 注销时清理定时器
  async unregister(taskId: string): Promise<void> {
    // 清理超时定时器
    for (const [timerId, timer] of this.timeoutTimers) {
      if (timerId.startsWith(taskId)) {
        clearTimeout(timer);
        this.timeoutTimers.delete(timerId);
      }
    }

    // ... 其他清理逻辑
  }
}
```

### 5.3 重试状态处理

```typescript
class DependencyManager {
  // 重试期间依赖状态保持不变
  // 重试成功后触发 dependency:resolved
  // 重试耗尽后触发 dependency:failed

  private async handleTaskRetrying(event: TaskRetryingEvent): Promise<void> {
    // 重试中不改变依赖状态
    // 可选：触发 dependency:retrying 事件
    this.emit('dependency:retrying', {
      taskId: event.flowId,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
    });
  }
}
```

### 5.4 循环依赖检测

```typescript
class DependencyManager {
  private topologicalSorter = new TopologicalSorter();

  async register(dependency: TaskDependency): Promise<void> {
    // 临时添加依赖边
    const existingDeps = await this.getAllDependencies();
    const edges = this.buildEdges(existingDeps, dependency);

    // 检测循环
    const cycle = this.topologicalSorter.detectCycle(
      this.extractNodes(edges),
      edges
    );

    if (cycle) {
      throw new CycleDetectedError(
        `Circular dependency detected: ${cycle.join(' → ')}`,
        cycle
      );
    }

    // 无循环，保存依赖
    await this.store.save(dependency);
  }

  async addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    const existing = await this.store.get(taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} has no dependency configuration`);
    }

    // 动态添加也要检测循环
    const newDep = {
      ...existing,
      dependsOn: [...existing.dependsOn, dependsOnTaskId],
    };

    await this.register(newDep);
  }
}
```

---

## 6. 与 SessionTaskManager 集成

### 6.1 集成方式

```typescript
// src/core/managers/session-task-manager.ts

import { DependencyManager } from '../dependency-manager';

export class SessionTaskManager {
  private dependencyManager: DependencyManager;

  constructor(config: SessionTaskManagerConfig) {
    // ... 现有初始化
    
    this.dependencyManager = new DependencyManager({
      eventManager: this.eventManager,
      store: new InMemoryDependencyStore(),
    });
  }

  // ==================== 扩展 API ====================

  /**
   * 创建带依赖的任务
   */
  async createTask(config: TaskConfig & DependencyConfig): Promise<TaskRun> {
    const task = await this.taskStore.create(config);

    // 注册依赖
    if (config.dependsOn?.length) {
      await this.dependencyManager.register({
        taskId: task.id,
        dependsOn: config.dependsOn,
        type: config.dependencyType || 'hard',
        condition: config.dependencyCondition || 'all',
        timeout: config.dependencyTimeout || 0,
        onFailure: config.onDependencyFailure || 'block',
        fallbackTaskId: config.fallbackTaskId,
      });
    }

    return task;
  }

  /**
   * 查询任务的依赖状态
   */
  async getTaskDependencyState(taskId: string): Promise<DependencyState | undefined> {
    return this.dependencyManager.getDependencyState(taskId);
  }

  /**
   * 获取被阻塞的任务列表
   */
  async getBlockedTasks(): Promise<string[]> {
    return this.dependencyManager.getBlockedTasks();
  }
}
```

### 6.2 API 扩展

```typescript
// 新增配置接口
interface DependencyConfig {
  /** 前置依赖任务 ID 列表 */
  dependsOn?: string[];

  /** 依赖类型 */
  dependencyType?: 'hard' | 'soft';

  /** 满足条件 */
  dependencyCondition?: 'all' | 'any';

  /** 依赖超时（毫秒） */
  dependencyTimeout?: number;

  /** 依赖失败策略 */
  onDependencyFailure?: 'block' | 'skip' | 'fallback';

  /** fallback 备用任务 ID */
  fallbackTaskId?: string;
}
```

---

## 7. 测试策略

### 7.1 单元测试

| 模块 | 用例数 | 覆盖内容 |
|------|--------|----------|
| DependencyManager | 15 | 注册/注销/状态查询/就绪检测 |
| DependencyStore | 8 | CRUD 操作 |
| DependencyResolver | 10 | 拓扑排序/循环检测/依赖解析 |
| DependencyEventListener | 12 | 事件转换/监听/停止 |
| 超时机制 | 6 | 定时器启动/触发/清理 |
| 失败传播 | 9 | block/skip/fallback 三种策略 |

**总计**: 60 个单元测试

### 7.2 集成测试

| 场景 | 说明 |
|------|------|
| 端到端依赖流程 | 注册依赖 → 任务完成 → 自动触发 |
| 并发触发 | 多个依赖同时完成 |
| 失败传播 | 依赖失败 → 下游任务处理 |
| 超时处理 | 依赖超时 → 触发传播 |
| 循环依赖 | 检测并拒绝注册 |
| 动态依赖 | 运行时添加/移除依赖 |

### 7.3 性能基准

| 指标 | 目标 |
|------|------|
| 依赖注册 | < 5ms |
| 状态查询 | < 2ms |
| 循环检测 (100节点) | < 10ms |
| 就绪检查 | < 1ms |

---

## 8. 实施计划

### 8.1 任务分解

| 阶段 | 任务 | 工时 |
|------|------|------|
| Phase 1 | types.ts + DependencyStore | 2h |
| Phase 2 | DependencyManager 核心逻辑 | 4h |
| Phase 3 | DependencyEventListener 事件转换 | 2h |
| Phase 4 | 与 SessionTaskManager 集成 | 2h |
| Phase 5 | 测试 + 文档 | 3h |
| **总计** | | **13h** |

### 8.2 文件清单

```
src/core/dependency-manager/
├── types.ts                 # 类型定义
├── dependency-manager.ts    # 核心管理器
├── dependency-store.ts      # 存储层
├── dependency-resolver.ts   # 解析器
├── dependency-listener.ts   # 事件监听器
└── index.ts                 # 模块入口

test/dependency-manager/
├── dependency-manager.test.ts
├── dependency-store.test.ts
├── dependency-resolver.test.ts
├── dependency-listener.test.ts
└── integration.test.ts
```

### 8.3 验收标准

- [ ] TypeScript 编译零错误
- [ ] 60 个单元测试全部通过
- [ ] 6 个集成测试全部通过
- [ ] 性能基准达标
- [ ] 与 SessionTaskManager 集成正常
- [ ] 文档完整

---

*创建日期: 2026-04-19*
*版本: 1.0.0*
