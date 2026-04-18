# task-plugin-v3 依赖关系图

## 核心架构（4层模型）

```
┌─────────────────────────────────────────────────────────┐
│           Application Layer (应用层)                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │        SessionTaskManager (核心协调器)           │  │
│  │                                                 │  │
│  │  • createMainTask()                            │  │
│  │  • createSubTask()                             │  │
│  │  • getTask() / getTaskFlow()                   │  │
│  │  • queryTasks()                                │  │
│  │  • cancelTask() / completeTask() / failTask()  │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Coordination Layer (协调层)                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ EventManager │  │ MemoryManager│  │ AuditLogger │ │
│  │              │  │              │  │             │ │
│  │ • emit()     │  │ • record()   │  │ • log()     │ │
│  │ • on()       │  │ • search()   │  │ • query()   │ │
│  │ • off()      │  │ • analyze()  │  │ • archive() │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Capability Layer (能力层)                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │OpenClawBridge│  │EncryptionMgt │  │ StorageMgt  │ │
│  │              │  │              │  │             │ │
│  │ • create()   │  │ • encrypt()  │  │ • save()    │ │
│  │ • get()      │  │ • decrypt()  │  │ • load()    │ │
│  │ • list()     │  │ • rotateKey()│  │ • query()   │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│       OpenClaw Native Layer (原生层)                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │      OpenClaw API (runtime.taskFlow)            │  │
│  │                                                 │  │
│  │  • createTaskFlow()                            │  │
│  │  • createTask()                                │  │
│  │  • getTask() / getTaskFlow()                   │  │
│  │  • listTasks()                                 │  │
│  │  • cancelTask()                                │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 模块依赖关系

### 核心依赖

```
src/index.ts
├── src/core/types.ts
├── src/core/bridge.ts
│   └── src/core/types.ts
└── src/core/managers/session-task-manager.ts
    ├── src/core/types.ts
    ├── src/core/bridge.ts
    ├── src/core/managers/types.ts
    ├── src/core/managers/event-emitter.ts
    │   └── src/core/events/event-types.ts
    └── src/core/events/event-manager.ts
        └── src/core/events/event-types.ts
```

### 文件依赖矩阵

| 文件 | 依赖数量 | 被依赖次数 | 核心依赖 |
|------|----------|-----------|---------|
| **types.ts** | 0 | 4 | 无依赖（基础类型） |
| **bridge.ts** | 1 | 1 | types.ts |
| **session-task-manager.ts** | 5 | 1 | bridge, types, event-emitter |
| **event-manager.ts** | 1 | 1 | event-types.ts |
| **index.ts** | 3 | 0 | types, bridge, session-task-manager |

## 数据流向

### 任务创建流程

```
用户请求
  → SessionTaskManager.createMainTask()
    → OpenClawBridge.createTaskFlow()
      → OpenClaw API (runtime.taskFlow)
    ← TaskFlow ID
  → EventManager.emit('task:created')
  → AuditLogger.log('TASK_CREATE')
  ← Task Created
```

### 事件处理流程

```
任务状态变更
  → SessionTaskManager
    → EventEmitter.emit(event)
      → EventManager
        → 监听器1 (日志记录)
        → 监听器2 (通知发送)
        → 监听器3 (记忆更新)
```

### 记忆管理流程

```
任务完成
  → SessionTaskManager.completeTask()
    → MemoryManager.record()
      → MemoryStorage.save()
      → MemorySearch.index()
    → MemoryManager.analyze()
      → 发现模式
      → 生成建议
```

## 关键接口

### ISessionTaskManager

```typescript
interface ISessionTaskManager {
  // 任务管理
  createMainTask(options: TaskCreateOptions): Promise<TaskRunView>;
  createSubTask(params: SubTaskCreateParams): Promise<TaskRunView>;
  getTask(taskId: string): Promise<TaskRunDetail>;
  getTaskFlow(flowId: string): Promise<TaskFlowDetail>;
  queryTasks(filter?: TaskQueryFilter): Promise<TaskRunView[]>;
  
  // 任务操作
  cancelTask(taskId: string): Promise<void>;
  completeTask(taskId: string, result: any): Promise<void>;
  failTask(taskId: string, error: Error): Promise<void>;
  
  // 生命周期
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}
```

### IOpenClawBridge

```typescript
interface IOpenClawBridge {
  createTaskFlow(flow: TaskFlow): Promise<TaskFlowView>;
  createTask(task: TaskRun): Promise<TaskRunView>;
  getTaskFlow(flowId: string): Promise<TaskFlowDetail>;
  getTask(taskId: string): Promise<TaskRunDetail>;
  listTasks(): Promise<TaskRunView[]>;
  cancelTask(taskId: string): Promise<void>;
  checkApiAvailability(): Promise<ApiAvailability>;
}
```

## 设计亮点

### 1. 依赖注入

```typescript
// 通过构造函数注入依赖
constructor(config: SessionTaskManagerConfig) {
  this.bridge = config.bridge || new OpenClawBridge(config);
}
```

**优势**：
- 易于测试（可注入mock对象）
- 依赖关系清晰
- 支持多个独立实例

### 2. 事件驱动

```typescript
// 15种类型安全的事件类型
type TaskManagerEvents = 
  | TaskCreatedEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  // ... 12 more
```

**优势**：
- 类型安全的事件系统
- 松耦合的组件通信
- 易于扩展新功能

### 3. 错误处理

```typescript
class SessionTaskManagerError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

**优势**：
- 结构化错误信息
- 错误代码分类
- 上下文信息完整

## 总结

task-plugin-v3采用了清晰的4层架构：

1. **应用层**：SessionTaskManager作为核心协调器
2. **协调层**：事件、记忆、审计等横切关注点
3. **能力层**：OpenClaw桥接、加密、存储等基础能力
4. **原生层**：OpenClaw API调用

依赖关系清晰，模块职责明确，易于理解和维护。
