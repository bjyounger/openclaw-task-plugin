# OpenClawBridge 单元测试文档

## 测试概述

OpenClawBridge 是 OpenClaw Task Plugin v3.0 的核心 API 桥接层，负责与 OpenClaw 原生系统交互。本文档记录单元测试的设计与实现。

## 测试框架

- **测试框架**: Jest 29.7.0
- **测试运行器**: ts-jest
- **测试文件**: `test/unit/bridge.test.ts`

## 测试覆盖率

| 指标 | 覆盖率 | 目标 | 状态 |
|------|--------|------|------|
| Statements | 92.94% | 80% | ✅ 达标 |
| Branches | 72.72% | 70% | ✅ 达标 |
| Functions | 90.9% | 80% | ✅ 达标 |
| Lines | 92.77% | 80% | ✅ 达标 |

### 覆盖率说明

- **bridge.ts**: 100% Statements & Functions，核心业务逻辑完全覆盖
- **types.ts**: 50% Statements，主要是类型定义文件，无业务逻辑

## 测试结构

### 1. 会话绑定测试 (6 个测试)

测试 `OpenClawBridge` 的会话绑定功能。

#### 测试用例

| 用例 | 描述 | 验证点 |
|------|------|--------|
| fromToolContext() 创建实例 | 正确从 ToolContext 创建 Bridge | 实例类型、会话信息 |
| fromToolContext() 调用 API | 正确调用 API 的绑定方法 | API 调用参数 |
| 处理空的 deliveryContext | 无 deliveryContext 时的行为 | 返回 undefined |
| bindSession() 绑定新会话 | 显式绑定新会话 | 会话信息更新 |
| 清除旧绑定实例 | 绑定新会话后清除缓存 | API 重新调用 |
| 多次切换会话 | 支持多次切换 | 每次都重新绑定 |

### 2. 任务操作测试 (22 个测试)

测试任务 CRUD 操作。

#### createTask() (5 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功创建任务 | 创建并返回结果 | taskId, flowId, status |
| 传递正确参数 | 参数正确传递给 API | API 调用参数 |
| 创建失败抛错 | API 错误时的处理 | TaskOperationError |
| 无任务详情抛错 | 返回空任务列表时 | 错误码 TASK_CREATION_ERROR |
| 返回 undefined 抛错 | API 返回 undefined | TaskOperationError |

#### getTask() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功获取详情 | 获取任务详情 | 返回完整 TaskRunDetail |
| 任务不存在 | 无任务时返回 | undefined |
| 获取失败抛错 | API 错误时的处理 | TaskOperationError |

#### listTasks() (4 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功列出任务 | 返回任务列表 | 数组长度、内容 |
| 空列表 | 无任务时返回 | 空数组 [] |
| 失败抛错 | API 错误时的处理 | TaskOperationError |
| 无参数调用 | list() 不接受参数 | API 调用参数为空 |

#### queryTasks() (6 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 按状态过滤 | 单状态过滤 | 结果符合条件 |
| 多状态过滤 | 数组状态过滤 | 结果符合条件 |
| 按 runtime 过滤 | runtime 类型过滤 | 结果符合条件 |
| limit 限制 | 结果数量限制 | 结果数量 |
| 无过滤条件 | 返回所有任务 | 全量结果 |
| 组合过滤 | 多条件组合 | 结果符合所有条件 |

#### cancelTask() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功取消 | 取消任务并返回结果 | cancelled: true |
| 传参正确 | 参数正确传递 | API 调用参数 |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

#### findLatestTask() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功找到 | 返回最新任务 | TaskRunDetail |
| 无任务 | 无任务时返回 | undefined |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

### 3. TaskFlow 操作测试 (12 个测试)

测试任务流 CRUD 操作。

#### createTaskFlow() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功创建 | 创建并返回结果 | flowId, name |
| 参数正确 | 参数正确传递 | API 调用参数 |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

#### getTaskFlow() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功获取 | 获取任务流详情 | TaskFlowDetail |
| 不存在 | 任务流不存在 | undefined |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

#### listTaskFlows() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功列出 | 返回任务流列表 | 数组长度、内容 |
| 空列表 | 无任务流时返回 | 空数组 [] |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

#### cancelTaskFlow() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 成功取消 | 取消任务流并返回结果 | cancelled: true |
| 参数正确 | 参数正确传递 | API 调用参数 |
| 失败抛错 | API 错误时的处理 | TaskOperationError |

### 4. 工具方法测试 (6 个测试)

测试辅助工具方法。

#### checkApiAvailability() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 正确检查 | 检查 API 可用性 | 返回布尔值 |
| taskFlow 不可用 | 缺失 taskFlow API | 返回 false |
| tasks.runs 不可用 | 缺失 tasks.runs API | 返回 false |

#### getSessionInfo() (3 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 返回会话信息 | 正确返回会话信息 | sessionKey, deliveryContext |
| 绑定后更新 | 绑定新会话后返回新信息 | 更新后的会话信息 |
| 无 deliveryContext | 无交付上下文时 | 返回 undefined |

### 5. 错误处理测试 (5 个测试)

测试错误处理机制。

#### TaskOperationError (4 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 错误属性 | 错误包含正确的属性 | code, message |
| 错误上下文 | 错误包含上下文信息 | context 对象 |
| 原始错误 | 包含原始错误信息 | 错误消息链 |
| 非 Error 对象 | 正确处理字符串错误 | 类型转换 |

#### 错误恢复 (1 个测试)

| 用例 | 描述 | 验证点 |
|------|------|--------|
| API 临时故障 | 故障后恢复正常 | 重试成功 |

### 6. 边界条件测试 (5 个测试)

测试边界情况和异常输入。

| 用例 | 描述 | 验证点 |
|------|------|--------|
| 空任务列表 | 处理空数组 | 返回 [] |
| 空 TaskFlow 列表 | 处理空数组 | 返回 [] |
| undefined 参数 | 处理 undefined | 返回 undefined |
| 空字符串 sessionId | 接受空字符串 | 不抛错 |
| 特殊字符 taskId | 处理特殊字符 | 正确传递 |

## Mock 策略

### Mock API 设计

```typescript
function createMockApi(): jest.Mocked<OpenClawPluginApi> {
  // 创建 Mock BoundTaskFlowRuntime
  const mockBoundTaskFlow = {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  };

  // 创建 Mock BoundTaskRunsRuntime
  const mockBoundTaskRuns = {
    get: jest.fn(),
    list: jest.fn(),
    findLatest: jest.fn(),
    cancel: jest.fn(),
  };

  // 组装 Mock API
  return {
    runtime: {
      taskFlow: {
        fromToolContext: jest.fn().mockReturnValue(mockBoundTaskFlow),
        bindSession: jest.fn().mockReturnValue(mockBoundTaskFlow),
      },
      tasks: {
        runs: {
          fromToolContext: jest.fn().mockReturnValue(mockBoundTaskRuns),
          bindSession: jest.fn().mockReturnValue(mockBoundTaskRuns),
        },
      },
      // ...
    },
    // ...
  };
}
```

### Mock 数据工厂

提供测试数据生成函数：

- `createMockTaskView()` - 生成任务视图 Mock
- `createMockTaskDetail()` - 生成任务详情 Mock
- `createMockTaskFlowView()` - 生成任务流视图 Mock
- `createMockTaskFlowDetail()` - 生成任务流详情 Mock

## 运行测试

### 运行所有测试

```bash
npm test
```

### 运行测试并生成覆盖率

```bash
npm run test:coverage
```

### 运行特定测试

```bash
npm test -- --testNamePattern="会话绑定"
```

## 测试结果

```
Test Suites: 1 passed, 1 total
Tests:       58 passed, 58 total
Snapshots:   0 total
Time:        4.235 s
```

## 已知限制

1. **分支覆盖率**: 72.72%，主要因为 types.ts 中的类型定义未被直接测试
2. **集成测试**: 当前仅单元测试，集成测试待后续补充
3. **E2E 测试**: 需要 OpenClaw 环境的端到端测试待实现

## 后续改进

1. ✅ 添加更多边界条件测试
2. ⏳ 添加集成测试（需要 OpenClaw 环境）
3. ⏳ 添加性能测试
4. ⏳ 添加并发测试

---

**创建时间**: 2026-04-16
**最后更新**: 2026-04-16
**作者**: 孬蛋 (子任务: 测试专家)
