# WorkflowEngine 使用指南

**版本**: 1.0.0  
**作者**: 杨珂 (bjyounger)  
**更新时间**: 2026-04-19  

---

## 目录

1. [快速开始](#1-快速开始)
2. [API 参考](#2-api-参考)
3. [节点类型](#3-节点类型)
4. [错误处理](#4-错误处理)
5. [重试机制](#5-重试机制)
6. [最佳实践](#6-最佳实践)
7. [常见问题](#7-常见问题)

---

## 1. 快速开始

### 1.1 安装

```bash
npm install @openclaw/task-plugin
```

### 1.2 最简示例

```typescript
import {
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
} from '@openclaw/task-plugin';

// 1. 创建节点注册表
const registry = new NodeRegistry();

// 2. 注册自定义节点
registry.register('log', (node) => async (input, context) => {
  console.log(`[${node.name}]`, input.data);
  return {
    nodeId: node.id,
    executionId: context.executionId,
    data: { logged: true },
    status: 'success',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
});

// 3. 创建执行器
const sorter = new TopologicalSorter();
const executor = new WorkflowExecutor(registry, sorter);

// 4. 定义工作流
const workflow = {
  id: 'simple-workflow',
  name: '简单工作流',
  version: '1.0.0',
  nodes: [
    { id: 'n1', type: 'log', name: '步骤1', config: {} },
    { id: 'n2', type: 'log', name: '步骤2', config: {} },
  ],
  connections: [
    { source: 'n1', target: 'n2' },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// 5. 创建执行上下文
const context = new ExecutionContext({
  executionId: 'exec-001',
  workflowId: workflow.id,
  input: { message: 'Hello, World!' },
});

// 6. 执行工作流
const result = await executor.execute(workflow, context);
console.log('执行结果:', result.status);
```

### 1.3 使用集成服务（推荐）

```typescript
import {
  WorkflowIntegration,
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
} from '@openclaw/task-plugin';

// 创建集成服务
const registry = new NodeRegistry();
const sorter = new TopologicalSorter();
const executor = new WorkflowExecutor(registry, sorter);

const integration = new WorkflowIntegration(
  executor,
  memoryManager,  // 可选：记忆管理器
  eventManager,   // 可选：事件管理器
  {
    enableMemory: true,
    enableEvents: true,
  }
);

// 执行工作流（自动记录记忆、触发事件）
const result = await integration.createAndExecute(definition, context);
```

---

## 2. API 参考

### 2.1 WorkflowExecutor

工作流执行器，负责按拓扑顺序执行工作流节点。

#### 构造函数

```typescript
constructor(
  nodeRegistry: NodeRegistry,
  topologicalSorter: TopologicalSorter
)
```

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `execute` | `definition: WorkflowDefinition, context: IExecutionContext` | `Promise<WorkflowResult>` | 执行工作流 |
| `pause` | `executionId: string` | `void` | 暂停执行 |
| `resume` | `executionId: string` | `Promise<WorkflowResult>` | 恢复执行 |
| `cancel` | `executionId: string` | `void` | 取消执行 |

#### WorkflowResult

```typescript
interface WorkflowResult {
  status: 'completed' | 'failed';
  results: Map<string, NodeOutput>;
  errors: Record<string, Error>;
}
```

### 2.2 NodeRegistry

节点注册中心，管理所有节点类型的注册和获取。

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `register` | `type: string, factory: NodeFactory` | `void` | 注册节点类型 |
| `get` | `type: string` | `NodeFactory \| undefined` | 获取节点工厂 |
| `list` | - | `NodeTypeInfo[]` | 列出所有节点类型 |
| `has` | `type: string` | `boolean` | 检查节点类型是否存在 |
| `unregister` | `type: string` | `boolean` | 注销节点类型 |

#### NodeFactory

```typescript
type NodeFactory = (node: WorkflowNode) => NodeHandler;

type NodeHandler = (
  input: NodeExecutionInput,
  context: INodeContext
) => Promise<NodeOutput>;
```

### 2.3 ExecutionContext

执行上下文，管理执行状态和数据流。

#### 构造函数

```typescript
constructor(config: ExecutionContextConfig)
```

#### ExecutionContextConfig

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `executionId` | `string` | 是 | - | 执行 ID |
| `workflowId` | `string` | 是 | - | 工作流 ID |
| `input` | `Record<string, any>` | 否 | `{}` | 工作流输入 |
| `variables` | `Record<string, any>` | 否 | `{}` | 全局变量 |
| `timeout` | `number` | 否 | `14400000` | 超时时间（毫秒），默认 4 小时 |
| `eventListener` | `EventListener` | 否 | - | 事件监听器 |
| `logger` | `(level, message, data?) => void` | 否 | `console.log` | 日志函数 |

#### 主要方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getState` | - | `WorkflowExecutionState` | 获取执行状态 |
| `updateState` | `status: WorkflowStatus` | `void` | 更新执行状态 |
| `emit` | `event: string, data: any` | `void` | 发送事件 |
| `getInput` | - | `Record<string, any>` | 获取工作流输入 |
| `getNodeOutput` | `nodeId: string` | `NodeOutput \| undefined` | 获取节点输出 |
| `setNodeOutput` | `nodeId: string, output: NodeOutput` | `void` | 设置节点输出 |
| `createNodeContext` | `nodeId, input, config?` | `INodeContext` | 创建节点上下文 |
| `isCancelled` | - | `boolean` | 检查是否已取消 |
| `cancel` | `reason?: string` | `void` | 取消执行 |
| `isTimeout` | - | `boolean` | 检查是否超时 |
| `serialize` | - | `WorkflowState` | 序列化状态 |
| `deserialize` | `state: WorkflowState` | `void` | 从状态恢复 |

### 2.4 TopologicalSorter

拓扑排序器，计算节点执行顺序。

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `sort` | `nodes: WorkflowNode[], connections: WorkflowConnection[]` | `string[]` | 拓扑排序 |
| `getExecutionLevels` | `nodes, connections` | `string[][]` | 获取执行层级 |
| `detectCycle` | `nodes, connections` | `string[] \| null` | 检测环 |

### 2.5 ErrorHandler

错误处理器，实现三种错误处理策略。

#### 构造函数

```typescript
constructor(defaultStrategy?: 'abort' | 'skip' | 'fallback' | 'retry')
```

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `handle` | `error: Error, node: WorkflowNode, context: IExecutionContext` | `ErrorAction` | 处理错误 |
| `getErrorLog` | - | `ErrorLogEntry[]` | 获取错误日志 |
| `clearErrorLog` | - | `void` | 清空错误日志 |

### 2.6 RetryManager

重试管理器，支持三种退避策略。

#### 构造函数

```typescript
constructor(defaultConfig?: Partial<RetryConfig>)
```

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `executeWithRetry` | `node, handler, input, context` | `Promise<NodeOutput>` | 带重试执行 |
| `getRetryRecords` | `nodeId: string` | `RetryRecord[]` | 获取重试记录 |
| `getAllRetryRecords` | - | `Map<string, RetryRecord[]>` | 获取所有重试记录 |
| `clearRetryRecords` | - | `void` | 清空重试记录 |

### 2.7 WorkflowIntegration

工作流集成服务，整合执行器和记忆/事件管理。

#### 构造函数

```typescript
constructor(
  executor: WorkflowExecutor,
  memoryManager?: IMemoryManager,
  eventManager?: IEventManager,
  config?: WorkflowIntegrationConfig
)
```

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `createAndExecute` | `definition, context` | `Promise<WorkflowExecutionResult>` | 创建并执行工作流 |

---

## 3. 节点类型

### 3.1 内置节点类型

| 类型 | 名称 | 说明 | 分类 |
|------|------|------|------|
| `task` | Task | 执行单个任务 | action |
| `condition` | Condition | 根据条件选择分支 | logic |
| `parallel` | Parallel | 并行执行多个任务 | logic |
| `subflow` | Subflow | 执行嵌套工作流 | logic |

### 3.2 节点定义

```typescript
interface WorkflowNode {
  id: string;              // 节点唯一标识
  type: string;            // 节点类型
  name: string;            // 显示名称
  config: Record<string, any>;  // 节点配置
  position?: { x: number; y: number };  // UI 位置
  condition?: ConditionExpression;  // 条件表达式
  onError?: ErrorHandlerConfig;  // 错误处理配置
  timeout?: number;        // 超时时间（毫秒）
  retry?: RetryPolicy;     // 重试策略
}
```

### 3.3 注册自定义节点

```typescript
// 注册简单节点
registry.register('log', (node) => async (input, context) => {
  console.log(input.data);
  return {
    nodeId: node.id,
    executionId: context.executionId,
    data: { logged: true },
    status: 'success',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
});

// 注册带配置的节点
registry.register('http', (node) => {
  const { url, method } = node.config;
  
  return async (input, context) => {
    const response = await fetch(url, {
      method,
      body: JSON.stringify(input.data),
    });
    
    return {
      nodeId: node.id,
      executionId: context.executionId,
      data: await response.json(),
      status: 'success',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
    };
  };
});
```

---

## 4. 错误处理

### 4.1 三种错误策略

借鉴 n8n 的错误处理设计，支持三种策略：

| 策略 | 说明 | 使用场景 |
|------|------|----------|
| `abort` | 停止整个工作流 | 关键任务，失败需要立即停止 |
| `skip` | 继续执行，将错误传递给下游 | 可容忍失败，需要记录错误 |
| `fallback` | 继续执行，使用上次成功输出 | 有历史数据可回退的场景 |
| `retry` | 重试后再决定 | 临时性故障 |

### 4.2 配置方式

```typescript
// 节点级配置
const node = {
  id: 'n1',
  type: 'task',
  name: '任务节点',
  config: {},
  onError: {
    strategy: 'retry',
    maxRetries: 3,
    notify: true,
  },
};

// 工作流级默认策略
const workflow: WorkflowDefinition = {
  // ...
  settings: {
    failureStrategy: 'continue',
  },
};
```

### 4.3 错误处理示例

```typescript
const handler = new ErrorHandler('skip');

try {
  await executor.execute(workflow, context);
} catch (error) {
  const action = handler.handle(error, failedNode, context);
  
  switch (action.action) {
    case 'abort':
      console.log('工作流已停止');
      break;
    case 'skip':
      console.log('跳过节点，继续执行', action.output);
      break;
    case 'fallback':
      console.log('使用回退值', action.output);
      break;
  }
}

// 查看错误日志
const logs = handler.getErrorLog();
logs.forEach(log => {
  console.log(`[${log.timestamp}] ${log.nodeName}: ${log.error.message}`);
});
```

---

## 5. 重试机制

### 5.1 三种退避策略

| 策略 | 计算公式 | 说明 |
|------|----------|------|
| `fixed` | `initialDelay` | 固定延迟 |
| `linear` | `initialDelay * attempt` | 线性递增 |
| `exponential` | `initialDelay * multiplier^(attempt-1)` | 指数退避 |

### 5.2 配置方式

```typescript
// 节点级重试配置
const node: WorkflowNode = {
  id: 'n1',
  type: 'task',
  name: '任务节点',
  config: {},
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
};

// 或使用 onError 配置
const node2: WorkflowNode = {
  id: 'n2',
  type: 'task',
  name: '任务节点',
  config: {},
  onError: {
    strategy: 'retry',
    maxRetries: 3,
  },
};
```

### 5.3 重试时机计算

```
指数退避示例（initialDelay=1000, multiplier=2）：

尝试 1: 失败 → 等待 1000ms (1s)
尝试 2: 失败 → 等待 2000ms (2s)
尝试 3: 失败 → 返回错误
```

### 5.4 重试记录

```typescript
const manager = new RetryManager();

// 执行后查看重试记录
const records = manager.getRetryRecords('node-1');
records.forEach(record => {
  console.log(`[${record.timestamp}] 尝试 ${record.attempt}: ${record.error.message}`);
  console.log(`等待 ${record.delay}ms 后重试`);
});
```

---

## 6. 最佳实践

### 6.1 工作流设计

1. **控制节点数量**：单个工作流节点数建议不超过 100 个
2. **合理并行**：同层级节点数量建议不超过 10 个
3. **设置超时**：为耗时节点设置合理的超时时间
4. **错误处理**：关键节点使用 `abort`，非关键节点使用 `skip`

### 6.2 性能优化

```typescript
// ✅ 推荐：合理设置超时
const node: WorkflowNode = {
  id: 'n1',
  type: 'http',
  name: 'API 调用',
  config: { url: 'https://api.example.com' },
  timeout: 30000,  // 30 秒超时
};

// ✅ 推荐：启用重试
const node: WorkflowNode = {
  id: 'n2',
  type: 'http',
  name: 'API 调用',
  config: { url: 'https://api.example.com' },
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 1000,
  },
};

// ❌ 不推荐：无限等待
const badNode: WorkflowNode = {
  id: 'n3',
  type: 'http',
  name: 'API 调用',
  config: { url: 'https://api.example.com' },
  // 没有超时和重试配置
};
```

### 6.3 状态持久化

```typescript
// 执行前保存状态
const savedState = context.serialize();
await saveToDatabase(savedState);

// 执行后恢复
const restoredState = await loadFromDatabase(executionId);
context.deserialize(restoredState);
```

### 6.4 事件驱动

```typescript
// 监听工作流事件
eventManager.on('workflow:started', (data) => {
  console.log(`工作流启动: ${data.workflowName}`);
});

eventManager.on('node:completed', (data) => {
  console.log(`节点完成: ${data.nodeId}`);
});

eventManager.on('workflow:failed', (data) => {
  console.log(`工作流失败: ${data.error.message}`);
});
```

---

## 7. 常见问题

### Q1: 如何处理循环依赖？

**A**: WorkflowEngine 会在执行前检测环，如果存在环会抛出 `CycleDetectedError`。

```typescript
try {
  const result = await executor.execute(workflow, context);
} catch (error) {
  if (error instanceof CycleDetectedError) {
    console.log('检测到循环依赖:', error.cyclePath);
  }
}
```

### Q2: 如何实现条件分支？

**A**: 使用条件节点和多输出连接。

```typescript
const workflow: WorkflowDefinition = {
  nodes: [
    { id: 'check', type: 'condition', name: '检查条件', config: {}, condition: {
      type: 'javascript',
      expression: 'input.data.score > 60',
    }},
    { id: 'pass', type: 'task', name: '通过处理', config: {} },
    { id: 'fail', type: 'task', name: '失败处理', config: {} },
  ],
  connections: [
    { source: 'check', target: 'pass', condition: { type: 'on_success' } },
    { source: 'check', target: 'fail', condition: { type: 'on_failure' } },
  ],
};
```

### Q3: 如何暂停和恢复执行？

**A**: 使用 `pause` 和 `resume` 方法。

```typescript
// 暂停执行
executor.pause(executionId);

// 恢复执行
const result = await executor.resume(executionId);
```

### Q4: 如何取消执行？

**A**: 使用 `cancel` 方法。

```typescript
executor.cancel(executionId);

// 检查是否已取消
if (context.isCancelled()) {
  console.log('执行已被取消:', context.getCancelReason());
}
```

### Q5: 如何获取执行日志？

**A**: 使用自定义 logger 配置。

```typescript
const logs: any[] = [];

const context = new ExecutionContext({
  executionId: 'exec-001',
  workflowId: 'wf-001',
  logger: (level, message, data) => {
    logs.push({ level, message, data, timestamp: new Date() });
  },
});
```

### Q6: 如何防止工作流卡住？

**A**: 设置合理的超时时间。

```typescript
// 工作流级超时
const workflow: WorkflowDefinition = {
  // ...
  settings: {
    timeout: 3600000,  // 1 小时
  },
};

// 节点级超时
const node: WorkflowNode = {
  id: 'n1',
  type: 'task',
  name: '任务',
  config: {},
  timeout: 60000,  // 1 分钟
};
```

### Q7: 如何测试工作流？

**A**: 使用 mock 节点和断言。

```typescript
const registry = new NodeRegistry();

// 注册 mock 节点
registry.register('mock', (node) => async (input, context) => {
  return {
    nodeId: node.id,
    executionId: context.executionId,
    data: node.config.mockData || {},
    status: 'success',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
});

// 执行测试
const result = await executor.execute(workflow, context);
assert.strictEqual(result.status, 'completed');
```

---

**作者**: 杨珂  
**GitHub**: https://github.com/bjyounger  
**转载要求**: 注明出处
