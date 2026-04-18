# EventManager 使用文档

## 概述

EventManager 是 OpenClaw Task Plugin v3.0 的核心事件管理系统，提供类型安全的事件监听和分发功能，支持任务生命周期事件的完整管理。

## 安装

```typescript
import { EventManager } from 'openclaw-task-plugin-v3';
```

## 快速开始

### 基本用法

```typescript
// 创建事件管理器实例
const eventManager = new EventManager();

// 注册事件监听器
eventManager.on('task:created', (event) => {
  console.log(`任务已创建: ${event.goal}`);
});

// 发射事件
eventManager.emit('task:created', {
  flowId: 'flow-123',
  goal: '完成用户注册功能',
  timestamp: Date.now(),
});

// 清理资源
eventManager.clearAll();
```

## API 文档

### 构造函数

```typescript
constructor(debug?: boolean)
```

**参数**：
- `debug` (可选): 是否启用调试模式，默认为 `false`

**示例**：
```typescript
const eventManager = new EventManager(true); // 启用调试模式
```

### 核心方法

#### on() - 注册事件监听器

```typescript
on<K extends EventType>(
  eventType: K,
  listener: TaskManagerEvents[K]
): () => void
```

**参数**：
- `eventType`: 事件类型
- `listener`: 监听器函数

**返回值**：
- 返回取消订阅函数

**示例**：
```typescript
// 注册监听器
const unsubscribe = eventManager.on('task:completed', (event) => {
  console.log(`任务完成: ${event.goal}, 耗时: ${event.duration}ms`);
});

// 取消订阅
unsubscribe();
```

#### emit() - 发射事件

```typescript
emit<K extends EventType>(
  eventType: K,
  payload: TaskManagerEventData[K]
): void
```

**参数**：
- `eventType`: 事件类型
- `payload`: 事件数据

**示例**：
```typescript
eventManager.emit('task:failed', {
  flowId: 'flow-123',
  goal: '数据库迁移',
  error: '连接超时',
  timestamp: Date.now(),
});
```

#### off() - 取消事件监听

```typescript
off<K extends EventType>(
  eventType: K,
  listener: TaskManagerEvents[K]
): void
```

**参数**：
- `eventType`: 事件类型
- `listener`: 要移除的监听器函数

**示例**：
```typescript
const listener = (event) => {
  console.log('任务创建:', event.goal);
};

eventManager.on('task:created', listener);
eventManager.off('task:created', listener);
```

#### once() - 一次性监听

```typescript
once<K extends EventType>(
  eventType: K,
  listener: TaskManagerEvents[K]
): () => void
```

**参数**：
- `eventType`: 事件类型
- `listener`: 监听器函数（只触发一次）

**返回值**：
- 返回取消订阅函数

**示例**：
```typescript
eventManager.once('task:completed', (event) => {
  console.log('第一个完成的任务:', event.goal);
});
```

### 高级方法

#### onMultiple() - 批量注册监听器

```typescript
onMultiple(
  listeners: Partial<{
    [K in EventType]: TaskManagerEvents[K];
  }>
): () => void
```

**参数**：
- `listeners`: 监听器映射对象

**返回值**：
- 返回取消所有监听的函数

**示例**：
```typescript
const unsubscribe = eventManager.onMultiple({
  'task:created': (event) => console.log('创建:', event.goal),
  'task:completed': (event) => console.log('完成:', event.goal),
  'task:failed': (event) => console.error('失败:', event.error),
});

// 取消所有监听
unsubscribe();
```

#### getStats() - 获取事件统计

```typescript
getStats(): EventStats
```

**返回值**：
```typescript
interface EventStats {
  totalEvents: number;
  eventsByType: Map<EventType, number>;
  totalListeners: number;
  listenersByType: Map<EventType, number>;
}
```

**示例**：
```typescript
const stats = eventManager.getStats();
console.log(`总事件数: ${stats.totalEvents}`);
console.log(`总监听器数: ${stats.totalListeners}`);
```

#### clearAll() - 清除所有监听器

```typescript
clearAll(): void
```

**示例**：
```typescript
// 应用关闭时清理
eventManager.clearAll();
```

### 便捷方法

EventManager 提供了便捷方法用于发射常见事件：

#### 任务相关

```typescript
// 任务创建
emitTaskCreated(flowId: string, goal: string, metadata?: Record<string, unknown>): void

// 任务启动
emitTaskStarted(flowId: string, goal: string, runtime?: string): void

// 任务完成
emitTaskCompleted(flowId: string, goal: string, duration: number, result?: unknown): void

// 任务失败
emitTaskFailed(flowId: string, goal: string, error: string, analysis?: FailureAnalysis): void

// 任务取消
emitTaskCancelled(taskId: string, flowId?: string, reason?: string): void
```

#### 子任务相关

```typescript
// 子任务创建
emitSubTaskCreated(flowId: string, taskId: string, task: string): void

// 子任务完成
emitSubTaskCompleted(flowId: string, taskId: string, task: string, duration?: number, result?: unknown): void
```

#### 健康检查相关

```typescript
// 健康检查
emitHealthCheck(result: HealthCheckResult): void

// 健康问题
emitHealthIssue(issue: HealthIssue, taskId?: string): void
```

#### 错误相关

```typescript
// 操作错误
emitOperationError(operation: string, error: string, context?: Record<string, unknown>): void

// 超时错误
emitTimeoutError(taskId: string, timeout: number, flowId?: string): void
```

## 事件类型

### 任务生命周期事件

| 事件类型 | 描述 | 事件数据 |
|---------|------|---------|
| `task:created` | 任务创建 | `TaskCreatedEvent` |
| `task:started` | 任务启动 | `TaskStartedEvent` |
| `task:completed` | 任务完成 | `TaskCompletedEvent` |
| `task:failed` | 任务失败 | `TaskFailedEvent` |
| `task:cancelled` | 任务取消 | `TaskCancelledEvent` |

### 子任务事件

| 事件类型 | 描述 | 事件数据 |
|---------|------|---------|
| `subtask:created` | 子任务创建 | `SubTaskCreatedEvent` |
| `subtask:completed` | 子任务完成 | `SubTaskCompletedEvent` |

### 健康检查事件

| 事件类型 | 描述 | 事件数据 |
|---------|------|---------|
| `health:check` | 健康检查 | `HealthCheckEvent` |
| `health:issue` | 健康问题 | `HealthIssueEvent` |

### 错误事件

| 事件类型 | 描述 | 事件数据 |
|---------|------|---------|
| `error:operation` | 操作错误 | `OperationErrorEvent` |
| `error:timeout` | 超时错误 | `TimeoutErrorEvent` |

## 完整示例

### 示例 1：任务生命周期管理

```typescript
import { EventManager } from 'openclaw-task-plugin-v3';

const eventManager = new EventManager();

// 监听所有任务生命周期事件
eventManager.onMultiple({
  'task:created': (event) => {
    console.log(`[${new Date(event.timestamp).toISOString()}] 任务创建: ${event.goal}`);
    console.log(`Flow ID: ${event.flowId}`);
    if (event.metadata) {
      console.log('元数据:', event.metadata);
    }
  },

  'task:started': (event) => {
    console.log(`任务启动: ${event.goal}`);
    console.log(`运行时: ${event.runtime || 'default'}`);
  },

  'task:completed': (event) => {
    console.log(`任务完成: ${event.goal}`);
    console.log(`耗时: ${event.duration}ms`);
    if (event.result) {
      console.log('结果:', event.result);
    }
  },

  'task:failed': (event) => {
    console.error(`任务失败: ${event.goal}`);
    console.error(`错误: ${event.error}`);
    if (event.analysis?.shouldRetry) {
      console.log(`将在 ${event.analysis.retryDelay}ms 后重试`);
    }
  },

  'task:cancelled': (event) => {
    console.log(`任务取消: ${event.taskId}`);
    if (event.reason) {
      console.log(`原因: ${event.reason}`);
    }
  },
});

// 模拟任务生命周期
const flowId = 'flow-123';
const goal = '完成用户注册功能';

// 1. 创建任务
eventManager.emitTaskCreated(flowId, goal, { priority: 'high' });

// 2. 启动任务
eventManager.emitTaskStarted(flowId, goal, 'acp');

// 3. 完成任务
setTimeout(() => {
  const duration = 1234;
  eventManager.emitTaskCompleted(flowId, goal, duration, { success: true });
  
  // 清理
  eventManager.clearAll();
}, 1234);
```

### 示例 2：健康监控系统

```typescript
import { EventManager } from 'openclaw-task-plugin-v3';

const eventManager = new EventManager();

// 监听健康检查事件
eventManager.on('health:check', (event) => {
  const { result } = event;
  
  if (!result.healthy) {
    console.warn('系统健康检查未通过');
    console.warn(`运行中任务: ${result.runningCount}`);
    console.warn(`超时任务: ${result.timeoutTasks.length}`);
    console.warn(`错误任务: ${result.errorTasks.length}`);
    
    result.issues.forEach(issue => {
      console.warn(`- [${issue.severity}] ${issue.message}`);
      if (issue.suggestedAction) {
        console.warn(`  建议: ${issue.suggestedAction}`);
      }
    });
  } else {
    console.log('系统健康，运行正常');
  }
});

// 监听健康问题事件
eventManager.on('health:issue', (event) => {
  const { issue, taskId } = event;
  
  // 发送告警
  sendAlert({
    type: issue.type,
    severity: issue.severity,
    message: issue.message,
    taskId: taskId,
    action: issue.suggestedAction,
  });
});

// 定时健康检查
setInterval(() => {
  // 执行健康检查逻辑
  const healthCheckResult = performHealthCheck();
  
  eventManager.emitHealthCheck(healthCheckResult);
}, 60000); // 每分钟检查一次

function sendAlert(alert: any) {
  // 实现告警逻辑
  console.log('发送告警:', alert);
}

function performHealthCheck(): any {
  // 实现健康检查逻辑
  return {
    healthy: true,
    runningCount: 5,
    timeoutTasks: [],
    errorTasks: [],
    checkedAt: Date.now(),
    issues: [],
  };
}
```

### 示例 3：错误追踪系统

```typescript
import { EventManager } from 'openclaw-task-plugin-v3';

const eventManager = new EventManager();

// 错误统计
const errorStats = {
  operationErrors: 0,
  timeoutErrors: 0,
  errorsByOperation: new Map<string, number>(),
};

// 监听操作错误
eventManager.on('error:operation', (event) => {
  errorStats.operationErrors++;
  
  const count = errorStats.errorsByOperation.get(event.operation) || 0;
  errorStats.errorsByOperation.set(event.operation, count + 1);
  
  // 记录错误详情
  console.error('操作错误:', {
    operation: event.operation,
    error: event.error,
    context: event.context,
    timestamp: new Date(event.timestamp).toISOString(),
  });
});

// 监听超时错误
eventManager.on('error:timeout', (event) => {
  errorStats.timeoutErrors++;
  
  console.error('超时错误:', {
    taskId: event.taskId,
    flowId: event.flowId,
    timeout: event.timeout,
    timestamp: new Date(event.timestamp).toISOString(),
  });
});

// 模拟错误场景
eventManager.emitOperationError('createTask', '参数验证失败', {
  taskId: 'task-123',
  field: 'title',
});

eventManager.emitTimeoutError('task-456', 30000, 'flow-789');

// 查看统计
console.log('错误统计:', {
  操作错误: errorStats.operationErrors,
  超时错误: errorStats.timeoutErrors,
  错误分布: Object.fromEntries(errorStats.errorsByOperation),
});
```

## 最佳实践

### 1. 及时清理监听器

```typescript
// ✅ 推荐：保存取消订阅函数
const unsubscribe = eventManager.on('task:created', handler);

// 使用完后取消订阅
unsubscribe();

// 或者使用 clearAll
eventManager.clearAll();
```

### 2. 错误处理

```typescript
// ✅ 推荐：在监听器中捕获错误
eventManager.on('task:completed', (event) => {
  try {
    processTask(event);
  } catch (error) {
    console.error('处理任务时出错:', error);
    // 可以发射错误事件
    eventManager.emitOperationError('processTask', error.message, {
      flowId: event.flowId,
    });
  }
});
```

### 3. 使用便捷方法

```typescript
// ✅ 推荐：使用便捷方法
eventManager.emitTaskCreated('flow-123', '任务目标');

// ❌ 不推荐：手动构造事件对象
eventManager.emit('task:created', {
  flowId: 'flow-123',
  goal: '任务目标',
  timestamp: Date.now(),
});
```

### 4. 批量注册监听器

```typescript
// ✅ 推荐：使用 onMultiple 批量注册
const unsubscribe = eventManager.onMultiple({
  'task:created': handleCreated,
  'task:completed': handleCompleted,
  'task:failed': handleFailed,
});

// 一次性取消所有
unsubscribe();

// ❌ 不推荐：单独注册多个监听器
const unsub1 = eventManager.on('task:created', handleCreated);
const unsub2 = eventManager.on('task:completed', handleCompleted);
const unsub3 = eventManager.on('task:failed', handleFailed);
// 需要单独取消每个
```

### 5. 使用调试模式

```typescript
// 开发环境启用调试
const eventManager = new EventManager(process.env.NODE_ENV === 'development');

// 生产环境关闭调试
const eventManager = new EventManager(false);
```

## 性能考虑

1. **监听器数量**：EventManager 支持大量监听器，但建议避免在同一事件上注册过多监听器（建议 < 100）

2. **事件发射频率**：EventManager 经过优化，可以处理高频率事件发射（1000+ events/s）

3. **内存管理**：使用 `clearAll()` 及时清理不再需要的监听器，避免内存泄漏

4. **监听器性能**：监听器应该是轻量级的，耗时操作应该异步执行

## 故障排查

### 问题 1：监听器未触发

**可能原因**：
- 监听器被提前取消
- 事件类型拼写错误
- 监听器抛出错误被捕获

**解决方法**：
```typescript
// 启用调试模式查看详细日志
const eventManager = new EventManager(true);

// 检查监听器数量
console.log(eventManager.getListenerCount('task:created'));

// 检查事件统计
const stats = eventManager.getStats();
console.log('已发射事件:', stats.eventsByType);
```

### 问题 2：内存泄漏

**可能原因**：
- 监听器未正确清理
- 长期运行的应用未调用 clearAll

**解决方法**：
```typescript
// 定期检查监听器数量
setInterval(() => {
  const stats = eventManager.getStats();
  if (stats.totalListeners > 100) {
    console.warn('监听器数量过多:', stats.totalListeners);
  }
}, 60000);

// 应用关闭时清理
process.on('exit', () => {
  eventManager.clearAll();
});
```

## 相关文档

- [事件类型定义](./event-types.ts)
- [EventManager API 参考](./event-manager.ts)
- [单元测试](../../../test/unit/events/event-manager.test.ts)

---

**版本**: 3.0.0  
**作者**: 架构专家  
**最后更新**: 2026-04-17
