# WorkflowEngine 工作流引擎

基于 DAG 的工作流编排和执行引擎，借鉴 n8n 架构设计。

## 模块概述

WorkflowEngine 提供完整的工作流编排和执行能力，支持：

- **DAG 执行**：拓扑排序 + BFS 层级并行执行
- **条件分支**：IF-ELSE 条件路由，支持 JavaScript / JSONata / Simple 三种表达式
- **错误处理**：三种策略（abort / skip / fallback），借鉴 n8n 设计
- **重试机制**：三种退避策略（fixed / linear / exponential）
- **集成服务**：与 MemoryManager / EventManager 无缝集成
- **状态持久化**：支持序列化/反序列化，实现暂停恢复

## 安装说明

```bash
# 项目内使用
npm install @openclaw/task-plugin

# 或直接引用模块
import { WorkflowExecutor } from './src/core/workflow';
```

## 快速开始

```typescript
import {
  WorkflowExecutor,
  NodeRegistry,
  TopologicalSorter,
  ExecutionContext,
} from './src/core/workflow';

// 1. 创建组件
const registry = new NodeRegistry();
const sorter = new TopologicalSorter();
const executor = new WorkflowExecutor(registry, sorter);

// 2. 注册自定义节点
registry.register('my-task', (node) => async (input, context) => {
  return {
    nodeId: node.id,
    executionId: context.executionId,
    data: { result: 'done' },
    status: 'success',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
});

// 3. 定义并执行工作流
const workflow = {
  id: 'wf-001',
  name: '我的工作流',
  version: '1.0.0',
  nodes: [
    { id: 'n1', type: 'my-task', name: '步骤1', config: {} },
  ],
  connections: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const context = new ExecutionContext({
  executionId: 'exec-001',
  workflowId: workflow.id,
});

const result = await executor.execute(workflow, context);
```

## 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| **类型定义** | `types.ts` | 完整的数据模型和接口定义 |
| **拓扑排序** | `topological-sorter.ts` | Kahn 算法实现，支持环检测和层级计算 |
| **节点注册** | `node-registry.ts` | 节点类型注册和管理，内置 4 种节点 |
| **执行上下文** | `execution-context.ts` | 执行状态和数据流管理 |
| **工作流执行器** | `workflow-executor.ts` | BFS 层级并行执行引擎 |
| **条件执行** | `conditional-executor.ts` | 条件表达式评估和分支执行 |
| **错误处理** | `error-handler.ts` | 三种错误处理策略 |
| **重试管理** | `retry-manager.ts` | 三种退避策略的重试机制 |
| **集成服务** | `workflow-integration.ts` | MemoryManager / EventManager 集成 |

## 内置节点类型

| 类型 | 名称 | 说明 |
|------|------|------|
| `task` | Task | 执行单个任务 |
| `condition` | Condition | 根据条件选择分支 |
| `parallel` | Parallel | 并行执行多个任务 |
| `subflow` | Subflow | 执行嵌套工作流 |

## API 文档

详细 API 参考请查看：[docs/workflow-engine-usage.md](../../docs/workflow-engine-usage.md)

## 示例代码

| 示例 | 文件 | 说明 |
|------|------|------|
| 顺序执行 | [simple-workflow.ts](../../examples/workflow/simple-workflow.ts) | 基本的工作流定义和执行 |
| 并行执行 | [parallel-workflow.ts](../../examples/workflow/parallel-workflow.ts) | 多节点并行执行和汇聚 |
| 条件分支 | [conditional-workflow.ts](../../examples/workflow/conditional-workflow.ts) | IF-ELSE 条件路由 |
| 错误处理 | [error-handling.ts](../../examples/workflow/error-handling.ts) | 三种错误处理策略 |
| 重试机制 | [retry-mechanism.ts](../../examples/workflow/retry-mechanism.ts) | 三种退避策略 |
| 记忆集成 | [memory-integration.ts](../../examples/workflow/memory-integration.ts) | MemoryManager / EventManager 集成 |

## 设计文档

详细设计方案：[docs/design/workflow-engine-design.md](../../docs/design/workflow-engine-design.md)

---

**作者**: 杨珂  
**GitHub**: https://github.com/bjyounger  
**版本**: 1.0.0  
**更新时间**: 2026-04-19
