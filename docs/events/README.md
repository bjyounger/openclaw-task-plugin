# 事件系统模块

## 概述

事件管理系统是 OpenClaw Task Plugin v3.0 的核心组件，提供类型安全的事件监听和分发功能，支持任务生命周期的完整事件管理。

## 模块组成

### 核心文件

```
src/core/events/
├── event-types.ts      # 事件类型定义
├── event-manager.ts    # EventManager 实现
└── index.ts           # 模块导出
```

### 测试文件

```
test/unit/events/
└── event-manager.test.ts   # 单元测试（覆盖率 > 90%）
```

### 文档

```
docs/events/
└── EVENT_MANAGER_USAGE.md   # 完整使用文档
```

## 快速开始

```typescript
import { EventManager } from './core/events';

// 创建事件管理器
const eventManager = new EventManager();

// 监听事件
eventManager.on('task:created', (event) => {
  console.log('任务创建:', event.goal);
});

// 发射事件
eventManager.emitTaskCreated('flow-123', '完成用户注册功能');

// 清理资源
eventManager.clearAll();
```

## 事件类型

### 任务生命周期事件
- `task:created` - 任务创建
- `task:started` - 任务启动
- `task:completed` - 任务完成
- `task:failed` - 任务失败
- `task:cancelled` - 任务取消

### 子任务事件
- `subtask:created` - 子任务创建
- `subtask:completed` - 子任务完成

### 健康检查事件
- `health:check` - 健康检查
- `health:issue` - 健康问题

### 错误事件
- `error:operation` - 操作错误
- `error:timeout` - 超时错误

## 核心功能

### 1. 事件监听（on）
```typescript
const unsubscribe = eventManager.on('task:completed', (event) => {
  console.log('任务完成:', event.duration);
});
unsubscribe(); // 取消监听
```

### 2. 事件发射（emit）
```typescript
eventManager.emit('task:failed', {
  flowId: 'flow-123',
  goal: '数据库迁移',
  error: '连接超时',
  timestamp: Date.now(),
});
```

### 3. 一次性监听（once）
```typescript
eventManager.once('task:completed', (event) => {
  console.log('第一个完成的任务');
});
```

### 4. 批量监听（onMultiple）
```typescript
const unsubscribe = eventManager.onMultiple({
  'task:created': handleCreated,
  'task:completed': handleCompleted,
  'task:failed': handleFailed,
});
unsubscribe(); // 取消所有
```

## 测试覆盖率

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   92.92 |       72 |   97.05 |   92.85 |
 event-manager.ts  |   91.13 |    66.66 |      96 |   91.02 |
 event-emitter.ts  |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|
```

✅ **测试覆盖率超过 80%，符合要求**

## 设计特点

### 类型安全
- 完整的 TypeScript 类型定义
- 编译期类型检查
- IDE 智能提示

### 松耦合设计
- 基于 EventEmitter 的观察者模式
- 监听器与发射器解耦
- 支持多个监听器

### 错误处理机制
- 监听器错误捕获
- 不影响其他监听器执行
- 错误日志记录

### 性能优化
- 高效的事件分发
- 支持大量监听器
- 内存管理优化

## 使用示例

查看 [完整使用文档](./EVENT_MANAGER_USAGE.md) 了解详细示例：

- 任务生命周期管理
- 健康监控系统
- 错误追踪系统

## API 参考

### EventManager 类

| 方法 | 描述 | 返回值 |
|------|------|--------|
| `on(eventType, listener)` | 注册监听器 | 取消订阅函数 |
| `emit(eventType, payload)` | 发射事件 | void |
| `off(eventType, listener)` | 取消监听 | void |
| `once(eventType, listener)` | 一次性监听 | 取消订阅函数 |
| `onMultiple(listeners)` | 批量注册监听器 | 取消订阅函数 |
| `getStats()` | 获取事件统计 | EventStats |
| `clearAll()` | 清除所有监听器 | void |

## 交付清单

- [x] 事件类型定义文件（event-types.ts）
- [x] EventManager 类完整实现（event-manager.ts）
- [x] 完整单元测试（覆盖率 > 80%）
- [x] 详细使用文档
- [x] 模块索引文件

## 集成说明

事件系统已准备好集成到 SessionTaskManager 中：

```typescript
import { EventManager } from './core/events';

class SessionTaskManager {
  private eventManager: EventManager;
  
  constructor() {
    this.eventManager = new EventManager();
  }
  
  async createTask(goal: string) {
    // 创建任务逻辑...
    
    // 发射事件
    this.eventManager.emitTaskCreated(flowId, goal);
  }
}
```

---

**版本**: 3.0.0  
**作者**: 架构专家  
**完成时间**: 2026-04-17  
**测试状态**: ✅ 全部通过（35/35）
