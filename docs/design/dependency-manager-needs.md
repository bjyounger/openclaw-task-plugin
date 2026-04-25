# 依赖管理模块需求分析 v2

**版本**: 2.0.0
**作者**: 孬蛋 + CC 架构专家
**日期**: 2026-04-19
**状态**: Draft（待评审）

---

## 1. 概述

### 1.1 模块定位

DependencyManager 是任务插件中负责**任务级别依赖关系管理**的核心模块。

- **层级**: SessionTaskManager 层，与 WorkflowExecutor 平级
- **依赖粒度**: TaskRun 之间的依赖（非 WorkflowEngine 节点级）
- **触发模式**: 事件驱动（复用 EventManager）

### 1.2 与现有模块关系

```
SessionTaskManager
    ├── DependencyManager (新增)
    │   ├── 依赖定义存储
    │   ├── 状态追踪
    │   ├── 事件监听 (复用 EventManager)
    │   └── 自动触发逻辑
    ├── WorkflowExecutor (现有)
    │   └── 节点级依赖（TopologicalSorter）
    └── MemoryManager (现有)
```

**与 WorkflowEngine 的区别**：
- WorkflowEngine 管理**工作流内部节点**的依赖和执行顺序
- DependencyManager 管理**独立任务之间**的依赖和触发关系
- 两者可组合使用：任务 A 作为工作流执行，完成后触发任务 B

---

## 2. 核心需求

| ID | 需求 | 优先级 | 说明 |
|----|------|--------|------|
| DM-01 | 任务依赖定义 | P0 | 任务可声明前置依赖 |
| DM-02 | 依赖状态追踪 | P0 | 自动追踪依赖状态，判断可执行性 |
| DM-03 | 自动触发执行 | P0 | 前置依赖全部完成后自动触发 |
| DM-04 | 依赖图可视化 | P1 | 生成任务依赖关系图 |
| DM-05 | 循环依赖检测 | P0 | 检测并阻止循环依赖 |
| DM-06 | 依赖失败传播 | P0 | 前置任务失败时的处理策略 |
| DM-07 | 与 WorkflowEngine 集成 | P1 | 任务依赖作为工作流触发条件 |
| DM-08 | 依赖查询 API | P0 | 查询任务的上下游依赖 |
| DM-09 | 依赖超时机制 | P1 | 长时间未满足的依赖超时处理 |
| DM-10 | 动态依赖修改 | P2 | 运行时增删依赖（可选） |

**v2 调整**：
- DM-06 从 P1 → P0（失败传播是核心功能）
- 新增 DM-08（查询 API）
- 新增 DM-09（超时机制）
- 新增 DM-10（动态依赖）

---

## 3. 数据模型

### 3.1 TaskDependency（任务依赖定义）

```typescript
interface TaskDependency {
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
```

### 3.2 DependencyState（依赖状态）

```typescript
interface DependencyState {
  /** 任务 ID */
  taskId: string;

  /** 各依赖任务的状态 */
  dependencyStatus: Map<string, DependencyItemStatus>;

  /** 是否就绪（所有硬依赖满足） */
  ready: boolean;

  /** 阻塞原因（未就绪时） */
  blockedBy?: string[];

  /** 就绪时间 */
  readyTime?: number;

  /** 超时时间 */
  timeoutAt?: number;
}

type DependencyItemStatus =
  | 'pending'     // 等待中
  | 'satisfied'   // 已满足
  | 'failed'      // 已失败
  | 'timeout';    // 已超时
```

### 3.3 事件类型定义

```typescript
type DependencyEventType =
  | 'dependency:registered'   // 依赖注册
  | 'dependency:resolved'     // 单个依赖满足
  | 'dependency:failed'       // 单个依赖失败
  | 'dependency:timeout'      // 依赖超时
  | 'dependency:ready'        // 所有依赖就绪，可执行
  | 'dependency:blocked'      // 依赖阻塞
  | 'dependency:unregistered' // 依赖注销
  | 'dependency:triggered';   // 触发执行
```

---

## 4. 架构设计

### 4.1 模块位置

DependencyManager 作为独立模块，位于 `src/core/dependency-manager/`：

```
src/core/dependency-manager/
├── types.ts              # 类型定义
├── dependency-manager.ts # 核心管理器
├── dependency-store.ts   # 依赖存储
├── dependency-resolver.ts # 依赖解析器
└── index.ts              # 模块入口
```

### 4.2 与 SessionTaskManager 集成

```typescript
class SessionTaskManager {
  private dependencyManager: DependencyManager;

  // 创建任务时注册依赖
  async createTask(config: TaskConfig): Promise<TaskRun> {
    const task = await this.taskStore.create(config);
    
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
}
```

### 4.3 与 EventManager 集成

```typescript
class DependencyManager {
  constructor(private eventManager: EventManager) {
    // 监听任务完成事件
    this.eventManager.on('task:completed', this.handleTaskCompleted.bind(this));
    this.eventManager.on('task:failed', this.handleTaskFailed.bind(this));
  }

  private async handleTaskCompleted(event: TaskEvent): Promise<void> {
    // 更新依赖状态
    // 检查是否有任务因此就绪
    // 触发就绪任务执行
  }
}
```

---

## 5. 边界场景处理

### 5.1 并发触发

**场景**: 任务 C 依赖任务 A 和 B，A 和 B 几乎同时完成。

**处理方案**:
- 使用 debounce 机制，在一个 microtask 内收集所有状态变更
- 在下一个微任务中统一检查就绪状态
- 避免重复触发

```typescript
private pendingChecks = new Set<string>();

private scheduleReadinessCheck(taskId: string): void {
  this.pendingChecks.add(taskId);
  queueMicrotask(() => {
    this.pendingChecks.forEach(id => this.checkReadiness(id));
    this.pendingChecks.clear();
  });
}
```

### 5.2 超时传递

**场景**: 依赖任务超时未完成。

**处理方案**:
- 超时视为失败，触发依赖失败传播
- 根据 onFailure 策略处理（block/skip/fallback）
- 超时时间从依赖注册时开始计算

```typescript
private startTimeoutTimer(dependency: TaskDependency): void {
  if (dependency.timeout > 0) {
    setTimeout(() => {
      this.handleDependencyTimeout(dependency);
    }, dependency.timeout);
  }
}
```

### 5.3 重试状态

**场景**: 依赖任务失败后进入重试。

**处理方案**:
- 重试期间：下游任务保持 blocked 状态
- 重试成功：更新依赖状态为 satisfied，重新检查就绪
- 重试耗尽：更新依赖状态为 failed，触发失败传播
- 不重复注册依赖

### 5.4 循环依赖

**场景**: 任务 A 依赖 B，B 依赖 A。

**处理方案**:
- 注册依赖时立即检测（复用 TopologicalSorter.detectCycle）
- 检测到循环时拒绝注册并抛出 CycleDetectedError
- 动态添加依赖时同样检测

---

## 6. 核心接口

```typescript
interface IDependencyManager {
  // 注册依赖
  register(dependency: TaskDependency): Promise<void>;

  // 注销依赖
  unregister(taskId: string): Promise<void>;

  // 查询任务的上游依赖
  getUpstreamDependencies(taskId: string): TaskDependency[];

  // 查询任务的下游依赖
  getDownstreamDependencies(taskId: string): TaskDependency[];

  // 获取依赖状态
  getDependencyState(taskId: string): DependencyState | undefined;

  // 检查任务是否就绪
  isReady(taskId: string): boolean;

  // 获取所有阻塞的任务
  getBlockedTasks(): string[];

  // 获取依赖图
  getDependencyGraph(): DependencyGraph;

  // 动态添加依赖
  addDependency(taskId: string, dependsOnTaskId: string): Promise<void>;

  // 动态移除依赖
  removeDependency(taskId: string, dependsOnTaskId: string): Promise<void>;
}
```

---

## 7. 依赖关系图

```
EventManager                    DependencyManager
    │                                │
    │ task:completed                 │
    ├───────────────────────────────>│
    │                                │ handleTaskCompleted()
    │                                │ → updateDependencyStatus()
    │                                │ → checkReadiness()
    │                                │
    │ task:failed                    │
    ├───────────────────────────────>│
    │                                │ handleTaskFailed()
    │                                │ → updateDependencyStatus()
    │                                │ → handleFailurePropagation()
    │                                │
    │ dependency:ready               │
    │<───────────────────────────────┤
    │                                │
    │                                │
    v                                v
SessionTaskManager.executeTask()
```

---

*创建日期: 2026-04-19*
*版本: v2 (根据 CC 专家评审意见修改)*
