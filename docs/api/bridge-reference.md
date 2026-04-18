# OpenClawBridge API 参考文档

> **版本**: v3.0.0  
> **最后更新**: 2026-04-16  
> **OpenClaw最低版本**: 2026.4.9

---

## 📖 目录

- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [API参考](#api参考)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [故障排查](#故障排查)

---

## 🚀 快速开始

### 环境要求

| 要求 | 版本 | 说明 |
|------|------|------|
| **OpenClaw** | >= 2026.4.9 | 必须支持 `runtime.taskFlow` API |
| **Node.js** | >= 22.14.0 | 运行环境 |
| **TypeScript** | >= 5.4.0 | 开发语言 |

### 安装

```bash
# 在你的OpenClaw插件项目中
npm install @openclaw/task-plugin
# 或
pnpm add @openclaw/task-plugin
```

### 基本使用示例

```typescript
import { OpenClawBridge } from '@openclaw/task-plugin';

// 方式1: 从工具上下文创建（推荐）
export async function myToolHandler(params: any, ctx: ToolContext) {
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 创建任务
  const task = await bridge.createTask({
    title: '数据分析任务',
    runtime: 'subagent',
    scope: 'session',
  });
  
  return { taskId: task.taskId };
}

// 方式2: 手动配置创建
const bridge = new OpenClawBridge({
  api: pluginApi,
  sessionKey: 'session-123',
  deliveryContext: {
    channel: 'feishu',
    accountId: 'ou_xxx',
  },
});
```

### 版本兼容性检查

```typescript
import { checkOpenClawVersion } from '@openclaw/task-plugin';

const result = checkOpenClawVersion(pluginApi);
if (!result.compatible) {
  console.error('版本不兼容:', result.reason);
  // 处理不兼容情况
}
```

---

## 💡 核心概念

### 1. 会话绑定机制

OpenClawBridge 的核心设计是**会话绑定**。所有任务操作都必须在一个已绑定的会话上下文中进行。

#### 为什么需要会话绑定？

- **任务隔离**: 不同会话的任务相互隔离
- **权限控制**: 只能操作当前会话的任务
- **状态跟踪**: OpenClaw 需要知道任务属于哪个会话

#### 两种绑定方式

```typescript
// 方式1: 从工具上下文绑定（推荐）
const bridge = OpenClawBridge.fromToolContext(ctx);

// 方式2: 显式绑定会话
const bridge = new OpenClawBridge(config);
bridge.bindSession('session-123', {
  channel: 'feishu',
  accountId: 'ou_xxx',
});
```

### 2. API 路径正确性

OpenClawBridge 使用了 **OpenClaw 2026.4.9 的正确 API 路径**：

| ❌ 错误用法 | ✅ 正确用法 |
|-----------|-----------|
| `runtime.tasks.create()` | `runtime.taskFlow.fromToolContext(ctx).create()` |
| `runtime.tasks.list(filter)` | `runtime.taskFlow.fromToolContext(ctx).list()` |

**关键区别**：
1. 使用 `runtime.taskFlow` 而非 `runtime.tasks`
2. 使用 `fromToolContext(ctx)` 或 `bindSession()` 先绑定会话
3. `list()` 方法不接受 filter 参数

### 3. 客户端过滤策略

由于 OpenClaw API 的 `list()` 方法不支持服务端过滤，OpenClawBridge 提供了 **客户端过滤** 功能：

```typescript
// 获取所有任务（服务端API）
const allTasks = await bridge.listTasks();

// 带过滤条件的查询（客户端过滤）
const runningTasks = await bridge.queryTasks({
  status: 'running',
  limit: 10,
});
```

---

## 📚 API参考

### OpenClawBridge 类

主类，提供与 OpenClaw 任务系统交互的类型安全接口。

#### 构造函数

```typescript
constructor(config: OpenClawBridgeConfig)
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `config.api` | `OpenClawPluginApi` | ✅ | OpenClaw 插件 API |
| `config.sessionKey` | `string` | ✅ | 会话标识 |
| `config.deliveryContext` | `DeliveryContext` | ❌ | 交付上下文 |

**示例**:

```typescript
const bridge = new OpenClawBridge({
  api: ctx.api,
  sessionKey: 'session-123',
  deliveryContext: {
    channel: 'feishu',
    accountId: 'ou_xxx',
    userId: 'ou_yyy',
  },
});
```

---

#### 静态方法：fromToolContext()

```typescript
static fromToolContext(ctx: ToolContext): OpenClawBridge
```

从工具上下文创建 Bridge 实例。**这是推荐的创建方式**。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `ctx` | `ToolContext` | ✅ | 工具上下文，由 OpenClaw 提供 |

**返回值**: `OpenClawBridge` 实例

**示例**:

```typescript
export async function myToolHandler(params: any, ctx: ToolContext) {
  // ✅ 推荐方式：直接从工具上下文创建
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 现在可以使用 bridge 进行任务操作
  const tasks = await bridge.listTasks();
  
  return { count: tasks.length };
}
```

---

#### 方法：bindSession()

```typescript
bindSession(sessionKey: string, deliveryContext?: DeliveryContext): void
```

显式绑定或切换会话。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `sessionKey` | `string` | ✅ | 会话标识 |
| `deliveryContext` | `DeliveryContext` | ❌ | 交付上下文 |

**返回值**: `void`

**示例**:

```typescript
const bridge = new OpenClawBridge({ api, sessionKey: 'old-session' });

// 切换到新会话
bridge.bindSession('new-session-456', {
  channel: 'telegram',
  accountId: 'user-789',
});

// 现在操作的是新会话的任务
const tasks = await bridge.listTasks();
```

---

### 任务操作方法

#### createTask()

```typescript
async createTask(params: TaskCreateParams): Promise<TaskCreateResult>
```

创建新任务。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `params.title` | `string` | ✅ | 任务标题 |
| `params.runtime` | `TaskRuntime` | ✅ | 运行时类型：`'subagent'` \| `'acp'` \| `'agent'` |
| `params.scope` | `'session'` \| `'user'` | ❌ | 作用域，默认 `'session'` |
| `params.timeout` | `number` | ❌ | 超时时间（毫秒） |
| `params.parentFlowId` | `string` | ❌ | 父任务流ID |
| `params.metadata` | `Record<string, unknown>` | ❌ | 自定义元数据 |

**返回值**: `Promise<TaskCreateResult>`

```typescript
interface TaskCreateResult {
  taskId: string;        // 任务ID
  flowId?: string;       // 任务流ID
  status: TaskStatus;    // 任务状态
  createdAt: string;     // 创建时间
}
```

**示例**:

```typescript
// 创建子代理任务
const task = await bridge.createTask({
  title: '数据分析',
  runtime: 'subagent',
  scope: 'session',
  timeout: 300000, // 5分钟
  metadata: {
    priority: 'high',
    tags: ['data', 'analysis'],
  },
});

console.log('任务已创建:', task.taskId);
console.log('任务状态:', task.status);
```

---

#### getTask()

```typescript
async getTask(taskId: string): Promise<TaskRunDetail | undefined>
```

获取任务详情。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `taskId` | `string` | ✅ | 任务ID |

**返回值**: `Promise<TaskRunDetail | undefined>`

```typescript
interface TaskRunDetail {
  taskId: string;
  status: TaskStatus;
  runtime: TaskRuntime;
  title: string;
  scope: 'session' | 'user';
  createdAt: string;
  updatedAt?: string;
  parentFlowId?: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}
```

**示例**:

```typescript
const task = await bridge.getTask('task-123');

if (task) {
  console.log('任务标题:', task.title);
  console.log('任务状态:', task.status);
  
  if (task.status === 'succeeded') {
    console.log('执行结果:', task.result);
  } else if (task.status === 'failed') {
    console.log('错误信息:', task.error);
  }
} else {
  console.log('任务不存在');
}
```

---

#### listTasks()

```typescript
async listTasks(): Promise<TaskRunView[]>
```

列出当前会话的所有任务。

**⚠️ 注意**: 此方法不接受任何过滤参数，返回当前会话的所有任务。

**返回值**: `Promise<TaskRunView[]>`

```typescript
interface TaskRunView {
  taskId: string;
  status: TaskStatus;
  runtime: TaskRuntime;
  title: string;
  createdAt: string;
  updatedAt?: string;
}
```

**示例**:

```typescript
// 获取所有任务
const tasks = await bridge.listTasks();

console.log(`共 ${tasks.length} 个任务`);

// 统计各状态任务数量
const statusCount = tasks.reduce((acc, task) => {
  acc[task.status] = (acc[task.status] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log('状态分布:', statusCount);
```

---

#### queryTasks()

```typescript
async queryTasks(filter?: {
  status?: string | string[];
  runtime?: string | string[];
  limit?: number;
}): Promise<TaskRunView[]>
```

带过滤条件的任务查询（客户端过滤）。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `filter.status` | `string \| string[]` | ❌ | 状态过滤 |
| `filter.runtime` | `string \| string[]` | ❌ | 运行时过滤 |
| `filter.limit` | `number` | ❌ | 返回数量限制 |

**返回值**: `Promise<TaskRunView[]>`

**示例**:

```typescript
// 查询运行中的任务
const runningTasks = await bridge.queryTasks({
  status: 'running',
});

// 查询多个状态的任务
const activeTasks = await bridge.queryTasks({
  status: ['pending', 'queued', 'running'],
});

// 查询特定运行时的任务
const subagentTasks = await bridge.queryTasks({
  runtime: 'subagent',
  limit: 10,
});

// 组合过滤
const recentFailed = await bridge.queryTasks({
  status: 'failed',
  runtime: 'subagent',
  limit: 5,
});
```

---

#### cancelTask()

```typescript
async cancelTask(taskId: string, reason?: string): Promise<TaskRunCancelResult>
```

取消任务。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `taskId` | `string` | ✅ | 任务ID |
| `reason` | `string` | ❌ | 取消原因 |

**返回值**: `Promise<TaskRunCancelResult>`

```typescript
interface TaskRunCancelResult {
  taskId: string;
  cancelled: boolean;
  reason?: string;
}
```

**示例**:

```typescript
// 取消任务
const result = await bridge.cancelTask(
  'task-123',
  '用户请求取消'
);

if (result.cancelled) {
  console.log('任务已取消');
} else {
  console.log('取消失败');
}
```

---

#### findLatestTask()

```typescript
async findLatestTask(): Promise<TaskRunDetail | undefined>
```

查找最新的任务。

**返回值**: `Promise<TaskRunDetail | undefined>`

**示例**:

```typescript
const latestTask = await bridge.findLatestTask();

if (latestTask) {
  console.log('最新任务:', latestTask.title);
  console.log('创建时间:', latestTask.createdAt);
  console.log('状态:', latestTask.status);
}
```

---

### 任务流操作方法

#### createTaskFlow()

```typescript
async createTaskFlow(definition: TaskFlowDefinition): Promise<TaskFlowView>
```

创建任务流（多个任务的集合）。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `definition.name` | `string` | ✅ | 任务流名称 |
| `definition.description` | `string` | ❌ | 任务流描述 |
| `definition.tasks` | `TaskCreateParams[]` | ✅ | 任务列表 |
| `definition.metadata` | `Record<string, unknown>` | ❌ | 自定义元数据 |

**返回值**: `Promise<TaskFlowView>`

**示例**:

```typescript
// 创建任务流
const flow = await bridge.createTaskFlow({
  name: '数据处理流水线',
  description: '数据收集、清洗、分析的完整流程',
  tasks: [
    {
      title: '数据收集',
      runtime: 'subagent',
      metadata: { step: 1 },
    },
    {
      title: '数据清洗',
      runtime: 'subagent',
      metadata: { step: 2 },
    },
    {
      title: '数据分析',
      runtime: 'subagent',
      metadata: { step: 3 },
    },
  ],
  metadata: {
    project: 'data-pipeline',
    priority: 'high',
  },
});

console.log('任务流已创建:', flow.flowId);
```

---

#### getTaskFlow()

```typescript
async getTaskFlow(flowId: string): Promise<TaskFlowDetail | undefined>
```

获取任务流详情。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `flowId` | `string` | ✅ | 任务流ID |

**返回值**: `Promise<TaskFlowDetail | undefined>`

**示例**:

```typescript
const flow = await bridge.getTaskFlow('flow-123');

if (flow) {
  console.log('任务流名称:', flow.name);
  console.log('任务流状态:', flow.status);
  console.log('包含任务:', flow.tasks.length);
  
  // 查看每个任务的状态
  flow.tasks.forEach(task => {
    console.log(`  - ${task.title}: ${task.status}`);
  });
}
```

---

#### listTaskFlows()

```typescript
async listTaskFlows(): Promise<TaskFlowView[]>
```

列出当前会话的所有任务流。

**返回值**: `Promise<TaskFlowView[]>`

**示例**:

```typescript
const flows = await bridge.listTaskFlows();

console.log(`共 ${flows.length} 个任务流`);

flows.forEach(flow => {
  console.log(`${flow.name} (${flow.flowId}): ${flow.status}`);
});
```

---

#### cancelTaskFlow()

```typescript
async cancelTaskFlow(flowId: string, reason?: string): Promise<TaskFlowCancelResult>
```

取消任务流。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `flowId` | `string` | ✅ | 任务流ID |
| `reason` | `string` | ❌ | 取消原因 |

**返回值**: `Promise<TaskFlowCancelResult>`

**示例**:

```typescript
const result = await bridge.cancelTaskFlow(
  'flow-123',
  '业务需求变更'
);

if (result.cancelled) {
  console.log('任务流已取消');
}
```

---

### 工具方法

#### checkApiAvailability()

```typescript
checkApiAvailability(): {
  taskFlow: boolean;
  tasks: boolean;
  events: boolean;
  subagent: boolean;
}
```

检查 OpenClaw API 的可用性。

**返回值**:

```typescript
{
  taskFlow: boolean;   // taskFlow API 是否可用
  tasks: boolean;      // tasks API 是否可用
  events: boolean;     // events API 是否可用
  subagent: boolean;   // subagent API 是否可用
}
```

**示例**:

```typescript
const availability = bridge.checkApiAvailability();

if (!availability.taskFlow) {
  console.error('taskFlow API 不可用，请检查 OpenClaw 版本');
}

console.log('API可用性:', availability);
```

---

#### getSessionInfo()

```typescript
getSessionInfo(): {
  sessionKey: string;
  deliveryContext?: DeliveryContext;
}
```

获取当前会话信息。

**返回值**:

```typescript
{
  sessionKey: string;
  deliveryContext?: {
    channel?: string;
    accountId?: string;
    userId?: string;
  };
}
```

**示例**:

```typescript
const info = bridge.getSessionInfo();

console.log('当前会话:', info.sessionKey);
console.log('通道:', info.deliveryContext?.channel);
console.log('账号:', info.deliveryContext?.accountId);
```

---

## 🎯 使用示例

### 示例1: 创建并监控任务

```typescript
import { OpenClawBridge, TaskOperationError } from '@openclaw/task-plugin';

export async function createAndMonitorTask(ctx: ToolContext) {
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    // 创建任务
    const task = await bridge.createTask({
      title: '数据同步任务',
      runtime: 'subagent',
      timeout: 600000, // 10分钟
    });
    
    console.log('任务已创建:', task.taskId);
    
    // 轮询任务状态
    let completed = false;
    while (!completed) {
      const detail = await bridge.getTask(task.taskId);
      
      if (!detail) {
        throw new Error('任务不存在');
      }
      
      console.log(`任务状态: ${detail.status}`);
      
      if (['succeeded', 'failed', 'cancelled'].includes(detail.status)) {
        completed = true;
        
        if (detail.status === 'succeeded') {
          console.log('任务成功:', detail.result);
        } else {
          console.log('任务失败:', detail.error);
        }
      } else {
        // 等待5秒后重试
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    return task;
  } catch (error) {
    if (error instanceof TaskOperationError) {
      console.error('任务操作错误:', error.code, error.message);
      console.error('错误上下文:', error.context);
    } else {
      throw error;
    }
  }
}
```

### 示例2: 批量任务管理

```typescript
export async function batchTaskManagement(ctx: ToolContext) {
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 查询所有运行中的任务
  const runningTasks = await bridge.queryTasks({
    status: ['pending', 'queued', 'running'],
  });
  
  console.log(`发现 ${runningTasks.length} 个活跃任务`);
  
  // 批量取消超时任务
  const timeoutTasks = runningTasks.filter(task => {
    const created = new Date(task.createdAt).getTime();
    const now = Date.now();
    return (now - created) > 3600000; // 超过1小时
  });
  
  for (const task of timeoutTasks) {
    try {
      await bridge.cancelTask(task.taskId, '任务超时');
      console.log(`已取消任务: ${task.taskId}`);
    } catch (error) {
      console.error(`取消任务失败: ${task.taskId}`, error);
    }
  }
}
```

### 示例3: 创建任务流水线

```typescript
export async function createPipeline(ctx: ToolContext) {
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  // 创建数据处理流水线
  const flow = await bridge.createTaskFlow({
    name: 'ETL流水线',
    description: '数据提取、转换、加载',
    tasks: [
      {
        title: '数据提取',
        runtime: 'subagent',
        metadata: { stage: 'extract' },
      },
      {
        title: '数据转换',
        runtime: 'subagent',
        metadata: { stage: 'transform' },
      },
      {
        title: '数据加载',
        runtime: 'subagent',
        metadata: { stage: 'load' },
      },
    ],
  });
  
  console.log('流水线已创建:', flow.flowId);
  
  // 监控流水线执行
  const detail = await bridge.getTaskFlow(flow.flowId);
  console.log('流水线状态:', detail?.status);
  
  return flow;
}
```

### 示例4: 错误处理最佳实践

```typescript
import { OpenClawBridge, TaskOperationError, EnhancedTaskError } from '@openclaw/task-plugin';

export async function robustTaskOperation(ctx: ToolContext) {
  const bridge = OpenClawBridge.fromToolContext(ctx);
  
  try {
    // 检查API可用性
    const availability = bridge.checkApiAvailability();
    if (!availability.taskFlow || !availability.tasks) {
      throw new Error('OpenClaw API 不可用');
    }
    
    // 创建任务
    const task = await bridge.createTask({
      title: '重要任务',
      runtime: 'subagent',
    });
    
    return task;
    
  } catch (error) {
    if (error instanceof EnhancedTaskError) {
      // 增强错误：包含时间戳和堆栈
      console.error('增强错误:', {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp,
        stackTrace: error.stackTrace,
        userMessage: error.getUserMessage(),
      });
    } else if (error instanceof TaskOperationError) {
      // 基础错误：包含错误码和上下文
      console.error('操作错误:', {
        code: error.code,
        message: error.message,
        context: error.context,
      });
    } else {
      // 未知错误
      console.error('未知错误:', error);
    }
    
    throw error;
  }
}
```

---

## 🌟 最佳实践

### 1. 使用推荐的创建方式

**✅ 推荐**：从工具上下文创建

```typescript
const bridge = OpenClawBridge.fromToolContext(ctx);
```

**❌ 不推荐**：手动配置创建

```typescript
// 除非有特殊需求，否则不要这样创建
const bridge = new OpenClawBridge({
  api: ctx.api,
  sessionKey: ctx.sessionKey,
  deliveryContext: ctx.deliveryContext,
});
```

### 2. 总是检查版本兼容性

```typescript
import { checkOpenClawVersion } from '@openclaw/task-plugin';

export async function initPlugin(ctx: ToolContext) {
  // 插件初始化时检查版本
  const result = checkOpenClawVersion(ctx.api);
  
  if (!result.compatible) {
    console.error('OpenClaw版本不兼容:', result.reason);
    return { error: result.reason };
  }
  
  // 继续初始化...
}
```

### 3. 使用客户端过滤而非自己过滤

**✅ 推荐**：使用 `queryTasks()`

```typescript
const runningTasks = await bridge.queryTasks({
  status: 'running',
  limit: 10,
});
```

**❌ 不推荐**：自己过滤

```typescript
const allTasks = await bridge.listTasks();
const runningTasks = allTasks.filter(t => t.status === 'running').slice(0, 10);
```

### 4. 正确处理错误

```typescript
try {
  const task = await bridge.createTask(params);
  return task;
} catch (error) {
  if (error instanceof TaskOperationError) {
    // 记录错误详情
    console.error('任务操作失败:', {
      code: error.code,
      message: error.message,
      context: error.context,
    });
    
    // 返回用户友好的错误信息
    return {
      error: true,
      message: error.message,
      code: error.code,
    };
  }
  
  throw error;
}
```

### 5. 批量操作时注意性能

```typescript
// ❌ 不好的做法：串行取消
for (const taskId of taskIds) {
  await bridge.cancelTask(taskId);
}

// ✅ 好的做法：并行取消
await Promise.all(
  taskIds.map(taskId => 
    bridge.cancelTask(taskId).catch(err => {
      console.error(`取消任务失败: ${taskId}`, err);
    })
  )
);
```

### 6. 任务状态轮询时避免忙等待

```typescript
// ❌ 不好的做法：忙等待
while (true) {
  const task = await bridge.getTask(taskId);
  if (['succeeded', 'failed'].includes(task.status)) break;
}

// ✅ 好的做法：带延迟的轮询
const POLL_INTERVAL = 5000; // 5秒

async function waitForTask(bridge: OpenClawBridge, taskId: string) {
  while (true) {
    const task = await bridge.getTask(taskId);
    
    if (!task) {
      throw new Error('任务不存在');
    }
    
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      return task;
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}
```

### 7. 合理使用任务元数据

```typescript
// 添加有意义的元数据
const task = await bridge.createTask({
  title: '数据处理',
  runtime: 'subagent',
  metadata: {
    // 业务信息
    projectId: 'proj-123',
    userId: 'user-456',
    
    // 执行信息
    priority: 'high',
    retryCount: 0,
    maxRetries: 3,
    
    // 追踪信息
    traceId: generateTraceId(),
    parentTaskId: parentTask?.taskId,
    
    // 时间信息
    scheduledAt: new Date().toISOString(),
    deadline: deadline?.toISOString(),
  },
});
```

---

## ❓ 常见问题

### Q1: 为什么 `listTasks()` 不支持过滤参数？

**A**: 这是 OpenClaw API 的设计限制。OpenClaw 的 `list()` 方法不接受过滤参数，所有过滤都需要在客户端进行。

OpenClawBridge 提供了 `queryTasks()` 方法来简化客户端过滤：

```typescript
// 使用 queryTasks 进行过滤
const tasks = await bridge.queryTasks({
  status: 'running',
  runtime: 'subagent',
});
```

### Q2: `fromToolContext()` 和手动创建有什么区别？

**A**: 功能上没有区别，但 `fromToolContext()` 是推荐的创建方式：

1. **更简洁**：一行代码完成创建
2. **更安全**：自动提取所有必要的上下文信息
3. **更易用**：不需要记住所有配置字段

```typescript
// 推荐
const bridge = OpenClawBridge.fromToolContext(ctx);

// 等价于
const bridge = new OpenClawBridge({
  api: ctx.api,
  sessionKey: ctx.sessionKey,
  deliveryContext: ctx.deliveryContext,
  pluginConfig: ctx.pluginConfig,
});
```

### Q3: 如何切换会话？

**A**: 使用 `bindSession()` 方法：

```typescript
const bridge = OpenClawBridge.fromToolContext(ctx);

// 操作原会话的任务
const oldTasks = await bridge.listTasks();

// 切换到新会话
bridge.bindSession('new-session-456');

// 现在操作新会话的任务
const newTasks = await bridge.listTasks();
```

### Q4: 任务创建后如何获取执行结果？

**A**: 需要轮询任务状态，直到任务完成：

```typescript
async function getTaskResult(bridge: OpenClawBridge, taskId: string) {
  while (true) {
    const task = await bridge.getTask(taskId);
    
    if (!task) {
      throw new Error('任务不存在');
    }
    
    if (task.status === 'succeeded') {
      return task.result;
    }
    
    if (task.status === 'failed') {
      throw new Error(task.error || '任务执行失败');
    }
    
    if (task.status === 'cancelled') {
      throw new Error('任务已取消');
    }
    
    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

### Q5: 如何判断 OpenClaw 版本是否兼容？

**A**: 使用 `checkOpenClawVersion()` 函数：

```typescript
import { checkOpenClawVersion } from '@openclaw/task-plugin';

const result = checkOpenClawVersion(pluginApi);

if (!result.compatible) {
  console.error('版本不兼容:', result.reason);
}
```

### Q6: 为什么任务会话隔离很重要？

**A**: 会话隔离确保了：

1. **安全性**：不同用户的任务相互隔离
2. **可维护性**：任务生命周期与会话绑定
3. **可追溯性**：可以追踪任务属于哪个会话

如果错误地访问其他会话的任务，API 会返回错误或空列表。

### Q7: 如何处理任务超时？

**A**: 在创建任务时设置 `timeout` 参数：

```typescript
const task = await bridge.createTask({
  title: '长时间任务',
  runtime: 'subagent',
  timeout: 3600000, // 1小时（毫秒）
});
```

超时后，任务状态会变为 `'timed_out'`。

### Q8: 任务流和单个任务有什么区别？

**A**:

- **单个任务**：独立的执行单元
- **任务流**：多个相关任务的集合

任务流提供了：
- 批量创建多个任务
- 统一管理和取消
- 整体状态跟踪

```typescript
// 单个任务
const task = await bridge.createTask({ title: '任务1', runtime: 'subagent' });

// 任务流（多个任务）
const flow = await bridge.createTaskFlow({
  name: '流水线',
  tasks: [
    { title: '任务1', runtime: 'subagent' },
    { title: '任务2', runtime: 'subagent' },
  ],
});
```

---

## 🔧 故障排查

### 问题1: API 不可用

**症状**:
```
Error: runtime.taskFlow is undefined
```

**原因**: OpenClaw 版本过低，不支持 `taskFlow` API

**解决方案**:
```typescript
// 检查版本
const availability = bridge.checkApiAvailability();
console.log('API可用性:', availability);

// 或使用版本检查函数
const result = checkOpenClawVersion(pluginApi);
if (!result.compatible) {
  console.error('需要升级 OpenClaw:', result.reason);
}
```

### 问题2: 会话绑定失败

**症状**:
```
Error: sessionKey is required
```

**原因**: 未正确绑定会话

**解决方案**:
```typescript
// 确保从工具上下文创建
const bridge = OpenClawBridge.fromToolContext(ctx);

// 或手动绑定
bridge.bindSession('session-123');
```

### 问题3: 任务创建失败

**症状**:
```
TaskOperationError: TASK_CREATION_ERROR
```

**可能原因**:
1. API 不可用
2. 参数不正确
3. 权限不足

**排查步骤**:
```typescript
try {
  const task = await bridge.createTask(params);
} catch (error) {
  if (error instanceof TaskOperationError) {
    console.error('错误码:', error.code);
    console.error('错误信息:', error.message);
    console.error('错误上下文:', error.context);
    
    // 检查API可用性
    const availability = bridge.checkApiAvailability();
    console.log('API状态:', availability);
  }
}
```

### 问题4: 任务列表为空

**症状**: `listTasks()` 返回空数组，但应该有任务

**可能原因**:
1. 会话不正确
2. 任务在其他会话中

**排查步骤**:
```typescript
// 检查当前会话
const info = bridge.getSessionInfo();
console.log('当前会话:', info.sessionKey);
console.log('交付上下文:', info.deliveryContext);

// 如果会话不对，重新绑定
bridge.bindSession(correctSessionKey);
```

### 问题5: 任务无法取消

**症状**: `cancelTask()` 返回 `cancelled: false`

**可能原因**:
1. 任务已完成
2. 任务不存在
3. 权限不足

**排查步骤**:
```typescript
// 先检查任务状态
const task = await bridge.getTask(taskId);

if (!task) {
  console.error('任务不存在');
} else if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
  console.log('任务已完成，无法取消');
} else {
  // 尝试取消
  const result = await bridge.cancelTask(taskId, reason);
  console.log('取消结果:', result);
}
```

---

## 📌 已知限制

### 1. 服务端过滤不支持

OpenClaw API 的 `list()` 方法不支持服务端过滤，所有过滤都需要在客户端进行。

**影响**: 大量任务时可能有性能影响

**缓解措施**: 使用 `queryTasks()` 的 `limit` 参数限制返回数量

### 2. 任务状态轮询

OpenClaw 不支持任务状态订阅，需要客户端轮询。

**影响**: 增加了客户端复杂度

**缓解措施**: 使用合理的轮询间隔（建议 5-10 秒）

### 3. 会话绑定是强制的

所有操作都必须在已绑定的会话中进行。

**影响**: 无法跨会话查询任务

**设计原因**: 确保任务隔离和安全性

### 4. 任务流更新功能有限

当前版本不支持更新任务流中的任务列表。

**影响**: 创建后无法修改任务流结构

**缓解措施**: 取消旧任务流，创建新的

---

## 📚 类型定义参考

### TaskStatus

```typescript
type TaskStatus = 
  | 'pending'    // 待执行
  | 'queued'     // 已排队
  | 'running'    // 执行中
  | 'succeeded'  // 成功
  | 'failed'     // 失败
  | 'cancelled'  // 已取消
  | 'timed_out'  // 超时
  | 'lost';      // 丢失
```

### TaskRuntime

```typescript
type TaskRuntime = 
  | 'subagent'  // 子代理
  | 'acp'       // ACP运行时
  | 'agent';    // Agent运行时
```

### TaskFlowStatus

```typescript
type TaskFlowStatus = 
  | 'pending'   // 待执行
  | 'running'   // 执行中
  | 'completed' // 已完成
  | 'failed'    // 失败
  | 'cancelled';// 已取消
```

---

## 📞 获取帮助

- **GitHub Issues**: [项目仓库地址]
- **文档**: `/docs` 目录
- **示例代码**: `/examples` 目录

---

**文档版本**: v1.0.0  
**最后更新**: 2026-04-16  
**维护者**: 孬蛋

---
