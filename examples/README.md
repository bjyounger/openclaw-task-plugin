# OpenClawBridge 使用示例

本目录包含了 OpenClawBridge 的完整使用示例，涵盖了从基础到高级的所有用法。

---

## 📂 示例文件

### 1. [basic-usage.ts](./basic-usage.ts) - 基础使用

适合初学者，展示了 OpenClawBridge 的基本功能：

- ✅ 从工具上下文创建 Bridge
- ✅ 创建简单任务
- ✅ 查询任务列表
- ✅ 获取任务详情
- ✅ 取消任务
- ✅ 查找最新任务
- ✅ 版本兼容性检查

**快速开始**:

```typescript
import { basicExamples } from './basic-usage';

// 运行所有基本示例
await basicExamples.runBasicExamples(ctx);

// 或单独运行某个示例
await basicExamples.example2_createTask(ctx);
```

---

### 2. [taskflow-examples.ts](./taskflow-examples.ts) - 任务流使用

展示了任务流（TaskFlow）的创建和管理：

- ✅ 创建简单任务流
- ✅ 创建 ETL 流水线
- ✅ 获取任务流详情
- ✅ 列出所有任务流
- ✅ 监控任务流执行
- ✅ 取消任务流
- ✅ 创建复杂任务流

**快速开始**:

```typescript
import { taskFlowExamples } from './taskflow-examples';

// 运行所有任务流示例
await taskFlowExamples.runTaskFlowExamples(ctx);

// 或单独运行某个示例
await taskFlowExamples.example2_createETLFlow(ctx);
```

---

### 3. [advanced-examples.ts](./advanced-examples.ts) - 高级用法

适合生产环境，展示了最佳实践和错误处理：

- ✅ 完整的错误处理流程
- ✅ 带重试的任务创建
- ✅ 批量操作错误处理
- ✅ 高效的任务轮询
- ✅ 缓存优化查询
- ✅ 安全的任务管理器
- ✅ 生产环境处理器

**快速开始**:

```typescript
import { advancedExamples } from './advanced-examples';

// 运行所有高级示例
await advancedExamples.runAdvancedExamples(ctx);

// 使用生产环境处理器
const processor = new advancedExamples.ProductionTaskProcessor(ctx);
await processor.createAndWait({
  title: '生产任务',
  runtime: 'subagent',
});
```

---

## 🚀 快速开始

### 环境要求

| 要求 | 版本 |
|------|------|
| OpenClaw | >= 2026.4.9 |
| Node.js | >= 22.14.0 |
| TypeScript | >= 5.4.0 |

### 安装依赖

```bash
# 在项目根目录
npm install
# 或
pnpm install
```

### 运行示例

```typescript
import { ToolContext } from '@openclaw/task-plugin';
import { basicExamples } from './examples/basic-usage';

// 在你的工具处理器中
export async function myToolHandler(params: any, ctx: ToolContext) {
  // 运行所有基本示例
  await basicExamples.runBasicExamples(ctx);
  
  return { success: true };
}
```

---

## 📋 示例清单

### 基础示例 (basic-usage.ts)

| 函数 | 说明 | 难度 |
|------|------|------|
| `example1_basicCreation` | 创建Bridge实例 | ⭐ |
| `example2_createTask` | 创建简单任务 | ⭐ |
| `example3_listTasks` | 查询任务列表 | ⭐ |
| `example4_getTaskDetail` | 获取任务详情 | ⭐ |
| `example5_cancelTask` | 取消任务 | ⭐ |
| `example6_findLatestTask` | 查找最新任务 | ⭐ |
| `example7_versionCheck` | 版本兼容性检查 | ⭐ |
| `runBasicExamples` | 运行所有基本示例 | ⭐ |

### 任务流示例 (taskflow-examples.ts)

| 函数 | 说明 | 难度 |
|------|------|------|
| `example1_createSimpleFlow` | 创建简单任务流 | ⭐⭐ |
| `example2_createETLFlow` | 创建ETL流水线 | ⭐⭐ |
| `example3_getFlowDetail` | 获取任务流详情 | ⭐⭐ |
| `example4_listTaskFlows` | 列出所有任务流 | ⭐⭐ |
| `example5_monitorFlow` | 监控任务流执行 | ⭐⭐⭐ |
| `example6_cancelFlow` | 取消任务流 | ⭐⭐ |
| `example7_createComplexFlow` | 创建复杂任务流 | ⭐⭐⭐ |
| `runTaskFlowExamples` | 运行所有任务流示例 | ⭐⭐ |

### 高级示例 (advanced-examples.ts)

| 类/函数 | 说明 | 难度 |
|---------|------|------|
| `robustTaskCreation` | 健壮的任务创建（带重试） | ⭐⭐⭐ |
| `batchTaskCancellation` | 批量取消任务 | ⭐⭐⭐ |
| `TaskPoller` | 高效的任务轮询器 | ⭐⭐⭐ |
| `CachedTaskQuery` | 带缓存的任务查询 | ⭐⭐⭐ |
| `SecureTaskManager` | 安全的任务管理器 | ⭐⭐⭐⭐ |
| `ProductionTaskProcessor` | 生产环境处理器 | ⭐⭐⭐⭐ |
| `runAdvancedExamples` | 运行所有高级示例 | ⭐⭐⭐ |

---

## 🎯 使用场景

### 场景1: 简单任务创建

适合快速创建单个任务：

```typescript
import { OpenClawBridge } from '@openclaw/task-plugin';

const bridge = OpenClawBridge.fromToolContext(ctx);
const task = await bridge.createTask({
  title: '数据分析',
  runtime: 'subagent',
});
```

### 场景2: 任务流水线

适合需要执行多个相关任务的场景：

```typescript
const bridge = OpenClawBridge.fromToolContext(ctx);
const flow = await bridge.createTaskFlow({
  name: '数据处理流水线',
  tasks: [
    { title: '数据收集', runtime: 'subagent' },
    { title: '数据处理', runtime: 'subagent' },
    { title: '数据分析', runtime: 'subagent' },
  ],
});
```

### 场景3: 生产环境使用

适合需要完整错误处理和监控的生产场景：

```typescript
import { ProductionTaskProcessor } from './examples/advanced-examples';

const processor = new ProductionTaskProcessor(ctx);
const result = await processor.createAndWait({
  title: '重要任务',
  runtime: 'subagent',
  timeout: 600000,
  metadata: { priority: 'high' },
});

if (result.success) {
  console.log('任务成功:', result.result);
} else {
  console.error('任务失败:', result.error);
}
```

---

## 📝 示例代码说明

### 错误处理

所有示例都包含了完整的错误处理：

```typescript
try {
  const task = await bridge.createTask(params);
  return task;
} catch (error) {
  if (error instanceof TaskOperationError) {
    console.error('错误码:', error.code);
    console.error('错误信息:', error.message);
    console.error('错误上下文:', error.context);
  }
  throw error;
}
```

### 类型安全

所有示例都使用 TypeScript，确保类型安全：

```typescript
// 参数有类型检查
const task = await bridge.createTask({
  title: string,           // ✅ 必填
  runtime: TaskRuntime,    // ✅ 必填，有枚举约束
  scope?: 'session' | 'user',  // 可选
  timeout?: number,        // 可选
  metadata?: Record<string, unknown>,  // 可选
});

// 返回值有类型定义
const result: TaskCreateResult = await bridge.createTask(params);
```

### 最佳实践

所有示例都遵循最佳实践：

1. ✅ 使用 `fromToolContext()` 创建 Bridge
2. ✅ 检查 API 可用性
3. ✅ 正确处理错误
4. ✅ 使用客户端过滤（`queryTasks()`）
5. ✅ 合理设置超时时间
6. ✅ 添加有意义的元数据

---

## 🔗 相关文档

- [API参考文档](../docs/api/bridge-reference.md) - 完整的API文档
- [架构设计](../docs/architecture/design.md) - 架构设计文档
- [用户指南](../docs/guides/) - 用户使用指南

---

## 💡 提示

### 调试技巧

```typescript
// 检查API可用性
const availability = bridge.checkApiAvailability();
console.log('API状态:', availability);

// 获取会话信息
const sessionInfo = bridge.getSessionInfo();
console.log('当前会话:', sessionInfo);
```

### 性能优化

```typescript
// 使用缓存查询
const cachedQuery = new CachedTaskQuery(bridge, 60000);
const task = await cachedQuery.getTask(taskId);

// 批量操作
await Promise.all(taskIds.map(id => bridge.cancelTask(id)));
```

### 安全实践

```typescript
// 使用安全管理器
const secureManager = new SecureTaskManager(bridge, {
  maxTasksPerSession: 50,
});

// 会自动检查限制
const task = await secureManager.createTask(params);
```

---

## 📞 获取帮助

如果遇到问题，请参考：

1. [API参考文档](../docs/api/bridge-reference.md) - 查找详细的API说明
2. [常见问题](../docs/api/bridge-reference.md#常见问题) - 查看FAQ
3. [故障排查](../docs/api/bridge-reference.md#故障排查) - 排查常见问题

---

**示例版本**: v1.0.0  
**最后更新**: 2026-04-16  
**维护者**: 孬蛋

---