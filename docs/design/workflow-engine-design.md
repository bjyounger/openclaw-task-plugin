# WorkflowEngine 详细设计方案

**版本**: 1.0.0  
**作者**: 专家团队（架构专家 + 执行专家 + 集成专家 + 测试专家）  
**日期**: 2026-04-19  
**状态**: Draft  

---

## 目录

1. [需求分析](#1-需求分析)
2. [架构设计](#2-架构设计)
3. [数据模型](#3-数据模型)
4. [执行引擎](#4-执行引擎)
5. [集成方案](#5-集成方案)
6. [测试策略](#6-测试策略)
7. [实施计划](#7-实施计划)

---

## 1. 需求分析

### 1.1 核心需求

| ID | 需求 | 优先级 | 说明 |
|----|------|--------|------|
| WF-01 | 工作流定义 DSL | P0 | 声明式定义工作流结构（节点、连接、条件） |
| WF-02 | 工作流执行器 | P0 | 按依赖关系正确执行工作流节点 |
| WF-03 | 条件执行器 | P0 | 支持分支、循环、超时控制 |
| WF-04 | 错误处理 | P0 | 借鉴 n8n 三种策略：继续错误输出/继续正常输出/停止 |
| WF-05 | 重试机制 | P1 | 借鉴 n8n retryOnFail + maxTries + exponential backoff |
| WF-06 | 事件驱动 | P1 | 与 EventManager 集成，支持工作流生命周期事件 |
| WF-07 | 记忆集成 | P1 | 工作流执行结果自动存入 MemoryManager |
| WF-08 | 安全集成 | P1 | 工作流操作需经过 SecurityManager 权限校验 |
| WF-09 | 持久化 | P2 | 工作流定义和执行状态可持久化 |
| WF-10 | 可观测性 | P2 | 工作流执行过程可追踪、可调试 |

### 1.2 n8n 对比分析

| 设计点 | n8n 方案 | 本项目方案 | 差异说明 |
|------|----------|------------|----------|
| **节点模型** | 统一 INode，支持禁用/重试/错误处理 | WorkflowNode，继承相同设计 | 保持一致，额外增加 `condition` 字段 |
| **连接模型** | 多维连接（源→类型→索引→目标） | 简化为 `WorkflowConnection[]`，支持条件路由 | n8n 的多维索引过于复杂，本场景不需要 |
| **图遍历** | BFS 算法 | 拓扑排序 + BFS 混合 | 拓扑排序确定执行顺序，BFS 处理并行节点 |
| **错误处理** | 3 种策略 | 完全借鉴 | 统一错误策略枚举 |
| **重试机制** | retryOnFail + maxTries | 完全借鉴 + 增加退避策略 | 增加 exponential backoff |
| **触发器** | Trigger/Poll 两种模式 | 不引入触发器 | 本项目由 SessionTaskManager 驱动执行 |
| **数据传递** | INodeExecutionData（json + binary） | 简化为 `NodeOutput`（data + error） | 不需要 binary 支持 |
| **静态数据** | getStaticData() | 不引入 | 由 MemoryManager 统一管理 |

### 1.3 设计约束

1. **API 约束**：必须通过 OpenClawBridge 操作 OpenClaw API
2. **会话约束**：工作流执行必须绑定到会话
3. **内存约束**：单工作流节点数上限 100，防止单会话内存爆炸
4. **执行约束**：同一工作流不可并发执行（防状态冲突）
5. **超时约束**：单节点执行超时上限 30 分钟，总工作流上限 4 小时

---

## 2. 架构设计

### 2.1 模块划分

```
WorkflowEngine
├── WorkflowDefinition     # 工作流定义（节点+连接+配置）
├── WorkflowExecutor       # 执行器（拓扑排序+BFS并行）
├── ConditionalExecutor    # 条件执行器（分支+循环）
├── NodeRegistry           # 节点注册表（类型+处理器）
├── RetryManager           # 重试管理器（退避策略）
├── ErrorHandler           # 错误处理器（3种策略）
├── WorkflowContext         # 执行上下文（状态+数据）
└── TopologicalSorter      # 拓扑排序器（Kahn算法）
```

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                  SessionTaskManager                         │
│  createWorkflow() → WorkflowEngine.execute()               │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowEngine                           │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ WorkflowDefinition │  │ WorkflowExecutor  │  │ NodeRegistry  │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ ConditionalExec  │  │ RetryManager     │  │ ErrorHandler  │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
│  ┌────────────────┐  ┌────────────────┐                      │
│  │ TopologicalSorter│  │ WorkflowContext │                      │
│  └────────────────┘  └────────────────┘                      │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│           Integration Layer                                 │
│  OpenClawBridge │ MemoryManager │ EventManager │ Security   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 核心接口

```typescript
// 工作流定义接口
interface IWorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  settings: WorkflowSettings;
  validate(): ValidationResult;
}

// 工作流执行器接口
interface IWorkflowExecutor {
  execute(definition: IWorkflowDefinition, context: WorkflowContext): Promise<WorkflowResult>;
  pause(executionId: string): Promise<void>;
  resume(executionId: string): Promise<void>;
  cancel(executionId: string): Promise<void>;
}

// 节点处理器接口
type NodeHandler = (input: NodeInput, context: WorkflowContext) => Promise<NodeOutput>;

// 节点注册表接口
interface INodeRegistry {
  register(type: string, handler: NodeHandler): void;
  get(type: string): NodeHandler | undefined;
}
```

---

## 3. 数据模型

### 3.1 工作流定义

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  settings: WorkflowSettings;
  metadata?: Record<string, unknown>;
}

interface WorkflowSettings {
  maxExecutionTime?: number;    // 最大执行时间(ms)，默认 4h
  nodeTimeout?: number;          // 单节点超时(ms)，默认 30min
  maxRetries?: number;           // 最大重试次数，默认 2
  retryDelay?: number;           // 重试延迟(ms)，默认 1000
  errorStrategy?: ErrorStrategy; // 默认错误策略
  enableMemory?: boolean;        // 是否记录到记忆
  enableAudit?: boolean;         // 是否记录审计日志
}
```

### 3.2 节点模型（借鉴 n8n INode）

```typescript
interface WorkflowNode {
  id: string;
  name: string;
  type: string;                    // 节点类型：task, condition, parallel, subflow
  typeVersion: number;
  disabled?: boolean;              // 借鉴 n8n：是否禁用
  retryOnFail?: boolean;           // 借鉴 n8n：失败重试
  maxTries?: number;               // 借鉴 n8n：最大重试次数
  retryDelay?: number;             // 重试延迟(ms)
  onError?: ErrorStrategy;         // 借鉴 n8n：错误策略
  timeout?: number;                // 超时(ms)
  config?: Record<string, unknown>; // 节点配置
  position?: [number, number];     // 借鉴 n8n：UI位置
}

type ErrorStrategy =
  | 'continueErrorOutput'    // 借鉴 n8n：继续，走错误输出
  | 'continueRegularOutput'  // 借鉴 n8n：继续，走正常输出
  | 'stopWorkflow';          // 借鉴 n8n：停止工作流
```

### 3.3 连接模型（简化 n8n IConnections）

```typescript
interface WorkflowConnection {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;      // 输出索引（支持多输出）
  targetNodeId: string;
  targetInputIndex: number;       // 输入索引（支持多输入）
  condition?: string;             // 条件表达式（条件路由）
  label?: string;                 // 连接标签
}
```

### 3.4 执行数据模型

```typescript
interface NodeInput {
  data: Record<string, unknown>[];  // 输入数据
  sourceNodeId?: string;             // 来源节点
}

interface NodeOutput {
  data: Record<string, unknown>[];  // 输出数据
  error?: Error;                     // 错误信息
}

interface WorkflowResult {
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'paused';
  outputs: Map<string, NodeOutput>;  // 各节点输出
  duration: number;                   // 总耗时
  error?: Error;
}

interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentNodeId?: string;
  completedNodes: string[];
  failedNodes: string[];
  startTime: number;
  endTime?: number;
  nodeOutputs: Map<string, NodeOutput>;
  retryCount: Map<string, number>;
}
```

---

## 4. 执行引擎

### 4.1 拓扑排序（Kahn算法）

```typescript
class TopologicalSorter {
  sort(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] {
    // 1. 构建邻接表和入度表
    // 2. 入度为0的节点入队
    // 3. 依次出队，减少后继节点入度
    // 4. 入度为0的后继入队
    // 5. 若排序结果 < 节点数 → 存在环
  }

  detectCycle(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] | null {
    // DFS 检测环
  }
}
```

### 4.2 BFS 并行执行

```typescript
class WorkflowExecutor {
  async execute(definition: IWorkflowDefinition, context: WorkflowContext): Promise<WorkflowResult> {
    // 1. 拓扑排序确定执行顺序
    // 2. 按层级分组（同层节点可并行）
    // 3. 逐层执行
    //    - 并行执行同层节点（Promise.allSettled）
    //    - 收集输出，传递给下层
    //    - 处理错误（根据 ErrorStrategy）
    // 4. 返回结果
  }
}
```

### 4.3 条件执行器

```typescript
class ConditionalExecutor {
  // 条件类型
  evaluateCondition(expression: string, input: NodeInput): boolean {
    // 支持3种表达式：
    // 1. JavaScript 表达式
    // 2. JSONata 表达式
    // 3. Simple 条件（{field: 'status', operator: 'eq', value: 'completed'}）
  }

  // 分支执行
  async executeBranch(
    conditionNode: WorkflowNode,
    connections: WorkflowConnection[],
    input: NodeInput,
    context: WorkflowContext
  ): Promise<NodeOutput> {
    // 1. 评估条件
    // 2. 选择匹配的输出连接
    // 3. 执行目标节点
  }

  // 循环执行
  async executeLoop(
    loopNode: WorkflowNode,
    connections: WorkflowConnection[],
    input: NodeInput,
    context: WorkflowContext
  ): Promise<NodeOutput> {
    // 1. 获取循环配置（maxIterations, condition）
    // 2. 每次迭代检查条件
    // 3. 执行循环体
    // 4. 汇总输出
  }
}
```

### 4.4 错误处理（借鉴 n8n）

```typescript
class ErrorHandler {
  handle(error: Error, node: WorkflowNode, context: WorkflowContext): ErrorAction {
    switch (node.onError) {
      case 'continueErrorOutput':
        // 借鉴 n8n：将错误包装到输出中，走错误输出连接
        return { action: 'continue', output: { data: [], error } };

      case 'continueRegularOutput':
        // 借鉴 n8n：忽略错误，继续正常输出
        return { action: 'continue', output: { data: context.getLastOutput(node.id).data } };

      case 'stopWorkflow':
        // 借鉴 n8n：停止整个工作流
        return { action: 'stop' };

      default:
        // 默认策略
        return { action: 'stop' };
    }
  }
}
```

### 4.5 重试机制（借鉴 n8n + exponential backoff）

```typescript
class RetryManager {
  async executeWithRetry(
    node: WorkflowNode,
    handler: NodeHandler,
    input: NodeInput,
    context: WorkflowContext
  ): Promise<NodeOutput> {
    if (!node.retryOnFail) {
      return handler(input, context);
    }

    const maxTries = node.maxTries ?? 2;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        return await handler(input, context);
      } catch (error) {
        lastError = error as Error;
        context.recordRetry(node.id, attempt);

        if (attempt < maxTries) {
          // 指数退避：1s, 2s, 4s, 8s...
          const delay = (node.retryDelay ?? 1000) * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }

    throw lastError!;
  }
}
```

---

## 5. 集成方案

### 5.1 与 SessionTaskManager 集成

```typescript
class SessionTaskManager {
  private workflowEngine: WorkflowEngine;

  async createWorkflow(definition: WorkflowDefinition): Promise<WorkflowResult> {
    // 1. 通过 SecurityManager 校验权限
    // 2. 创建工作流执行上下文
    // 3. 调用 WorkflowEngine.execute()
    // 4. 记录到 MemoryManager
    // 5. 触发事件
  }
}
```

### 5.2 与 MemoryManager 集成

```typescript
// 工作流完成后自动记录记忆
workflowEngine.on('workflow:completed', async (result) => {
  await memoryManager.recordMemory({
    flowId: result.executionId,
    goal: `工作流: ${definition.name}`,
    status: 'completed',
    result: result.outputs,
  });

  // 工作流执行前查询相关知识
  const knowledge = await memoryManager.findRelevantKnowledge(definition.name);
});
```

### 5.3 与 EventManager 集成

```typescript
// 工作流生命周期事件
workflowEngine.on('workflow:started', (event) => eventManager.emit('workflow:started', event));
workflowEngine.on('node:completed', (event) => eventManager.emit('node:completed', event));
workflowEngine.on('node:failed', (event) => eventManager.emit('node:failed', event));
workflowEngine.on('workflow:completed', (event) => eventManager.emit('workflow:completed', event));
```

### 5.4 与 SecurityManager 集成

```typescript
// 执行前权限校验
const decision = await securityManager.accessControl.check({
  userId: context.userId,
  operation: 'workflow:execute',
  resource: definition.id,
});

if (!decision.allowed) {
  throw new WorkflowPermissionError(decision.reason);
}

// 审计日志
await securityManager.auditLogger.log({
  operation: 'workflow:execute',
  targetId: definition.id,
  result: 'success',
});
```

---

## 6. 测试策略

### 6.1 单元测试

| 模块 | 用例数 | 覆盖内容 |
|------|--------|----------|
| TopologicalSorter | 8 | 排序、环检测、空图、单节点 |
| WorkflowExecutor | 10 | 顺序/并行/条件/暂停恢复 |
| ConditionalExecutor | 8 | JS/JSONata/Simple表达式、分支、循环 |
| RetryManager | 6 | 重试次数、退避延迟、最终失败 |
| ErrorHandler | 5 | 3种策略 + 默认策略 |
| NodeRegistry | 4 | 注册、获取、重复注册 |

### 6.2 集成测试

| 场景 | 说明 |
|------|------|
| 端到端工作流 | 定义→执行→结果→记忆记录 |
| 条件分支 | IF-ELSE 条件路由 |
| 并行+汇聚 | 多节点并行执行后汇聚 |
| 失败重试 | 节点失败→重试→成功 |
| 暂停恢复 | 执行中暂停→恢复→继续 |
| 安全审计 | 权限校验+审计日志 |

### 6.3 性能基准

| 指标 | 目标 |
|------|------|
| 10节点工作流 | < 100ms |
| 100节点工作流 | < 1s |
| 1000节点拓扑排序 | < 50ms |
| 条件评估 | < 5ms/次 |

---

## 7. 实施计划

### 7.1 任务分解

| 阶段 | 任务 | 工时 |
|------|------|------|
| Phase 1 | 数据模型 + TopologicalSorter + NodeRegistry | 6h |
| Phase 2 | WorkflowExecutor + BFS并行执行 | 8h |
| Phase 3 | ConditionalExecutor + ErrorHandler + RetryManager | 8h |
| Phase 4 | 集成（SessionTaskManager + MemoryManager + EventManager） | 6h |
| Phase 5 | 测试 + 文档 + 示例 | 6h |
| **总计** | | **34h** |

### 7.2 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| M1: 基础框架 | Day 1 | 数据模型 + 拓扑排序 + 节点注册 |
| M2: 执行引擎 | Day 2 | 工作流执行器 + BFS并行 |
| M3: 高级功能 | Day 3 | 条件执行 + 错误处理 + 重试 |
| M4: 集成完成 | Day 4 | 模块集成 + 事件驱动 |
| M5: 质量保证 | Day 5 | 测试 + 文档 + 示例 |

### 7.3 验收标准

- ✅ 基础工作流执行正常（顺序 + 并行）
- ✅ 条件执行器工作正确（分支 + 循环）
- ✅ 错误处理3种策略正常
- ✅ 重试机制工作正常
- ✅ 与已有模块集成正常
- ✅ 示例代码可运行
- ✅ 性能满足设计要求

---

## 附录 A：性能优化策略（评审补充）

### A.1 并发控制

```typescript
class ConcurrencyController {
  private semaphore: Semaphore;

  constructor(maxConcurrency: number) {
    this.semaphore = new Semaphore(maxConcurrency);
  }

  async runWithLimit<T>(task: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await task();
    } finally {
      this.semaphore.release();
    }
  }
}
```

### A.2 状态压缩

- 增量状态更新（只保存变化部分）
- 状态快照压缩（使用 gzip 或 protobuf）
- 过期状态自动清理

### A.3 缓存策略

- 工作流定义缓存（LRU 策略）
- 节点输出缓存（相同输入复用结果）
- 拓扑排序结果缓存

---

## 附录 B：安全测试场景（评审补充）

### B.1 恶意工作流防护

```typescript
describe('WorkflowEngine Security', () => {
  it('should prevent malicious infinite loops', async () => {
    // 测试恶意循环检测
    const maliciousWorkflow = {
      nodes: [
        { id: 'n1', type: 'loop', config: { maxIterations: 999999 } }
      ]
    };
    
    await expect(executor.execute(maliciousWorkflow, context))
      .rejects.toThrow('Max iterations exceeded');
  });

  it('should detect resource exhaustion attacks', async () => {
    // 测试资源耗尽保护
    const largeWorkflow = {
      nodes: Array(10001).fill({ id: 'n', type: 'task' })
    };
    
    await expect(() => executor.execute(largeWorkflow, context))
      .toThrow('Node count exceeds limit');
  });

  it('should enforce node execution permissions', async () => {
    // 测试节点权限控制
    await expect(executor.execute(workflow, unauthorizedContext))
      .rejects.toThrow('Permission denied');
  });
});
```

### B.2 数据安全

- 测试敏感数据脱敏
- 测试权限边界控制
- 测试审计日志完整性

---

**评审通过时间**: 2026-04-19 03:25 UTC
