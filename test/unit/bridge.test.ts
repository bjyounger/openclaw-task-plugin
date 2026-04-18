/**
 * OpenClawBridge 单元测试
 * 
 * 测试覆盖范围：
 * 1. 会话绑定测试
 * 2. 任务操作测试
 * 3. TaskFlow操作测试
 * 4. 工具方法测试
 * 5. 错误处理测试
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import { OpenClawBridge, OpenClawBridgeConfig } from '../../src/core/bridge';
import {
  OpenClawPluginApi,
  ToolContext,
  BoundTaskFlowRuntime,
  BoundTaskRunsRuntime,
  TaskCreateParams,
  TaskCreateResult,
  TaskRunView,
  TaskRunDetail,
  TaskRunCancelResult,
  TaskFlowDefinition,
  TaskFlowView,
  TaskFlowDetail,
  TaskFlowCancelResult,
  TaskOperationError,
} from '../../src/core/types';

// ==================== Mock Helpers ====================

/**
 * 创建Mock API
 */
function createMockApi(): jest.Mocked<OpenClawPluginApi> {
  const mockBoundTaskFlow: jest.Mocked<BoundTaskFlowRuntime> = {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  };

  const mockBoundTaskRuns: jest.Mocked<BoundTaskRunsRuntime> = {
    get: jest.fn(),
    list: jest.fn(),
    findLatest: jest.fn(),
    cancel: jest.fn(),
  };

  const mockApi: jest.Mocked<OpenClawPluginApi> = {
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
      events: {},
      subagent: {},
      cron: {},
    },
    registerHook: jest.fn(),
    registerHttpRoute: jest.fn(),
    registerTool: jest.fn(),
  };

  return mockApi;
}

/**
 * 创建Mock工具上下文
 */
function createMockToolContext(api: OpenClawPluginApi): ToolContext {
  return {
    sessionKey: 'test-session-123',
    deliveryContext: {
      channel: 'feishu',
      accountId: 'account-123',
      userId: 'user-456',
    },
    api,
  };
}

/**
 * 创建Mock任务视图
 */
function createMockTaskView(overrides?: Partial<TaskRunView>): TaskRunView {
  return {
    taskId: 'task-123',
    status: 'pending',
    runtime: 'subagent',
    title: 'Test Task',
    createdAt: '2026-04-16T10:00:00Z',
    ...overrides,
  };
}

/**
 * 创建Mock任务详情
 */
function createMockTaskDetail(overrides?: Partial<TaskRunDetail>): TaskRunDetail {
  return {
    taskId: 'task-123',
    status: 'pending',
    runtime: 'subagent',
    title: 'Test Task',
    createdAt: '2026-04-16T10:00:00Z',
    scope: 'session',
    ...overrides,
  };
}

/**
 * 创建Mock TaskFlow视图
 */
function createMockTaskFlowView(overrides?: Partial<TaskFlowView>): TaskFlowView {
  return {
    flowId: 'flow-123',
    name: 'Test Flow',
    status: 'pending',
    createdAt: '2026-04-16T10:00:00Z',
    ...overrides,
  };
}

/**
 * 创建Mock TaskFlow详情
 */
function createMockTaskFlowDetail(overrides?: Partial<TaskFlowDetail>): TaskFlowDetail {
  return {
    flowId: 'flow-123',
    name: 'Test Flow',
    status: 'pending',
    createdAt: '2026-04-16T10:00:00Z',
    tasks: [],
    ...overrides,
  };
}

// ==================== Test Suite ====================

describe('OpenClawBridge', () => {
  let mockApi: jest.Mocked<OpenClawPluginApi>;
  let mockContext: ToolContext;
  let bridge: OpenClawBridge;

  beforeEach(() => {
    // 重置所有Mock
    jest.clearAllMocks();
    
    // 创建Mock
    mockApi = createMockApi();
    mockContext = createMockToolContext(mockApi);
    
    // 创建Bridge实例
    bridge = OpenClawBridge.fromToolContext(mockContext);
  });

  // ==================== 1. 会话绑定测试 ====================

  describe('会话绑定', () => {
    describe('fromToolContext()', () => {
      it('应该正确从ToolContext创建Bridge实例', () => {
        const bridgeInstance = OpenClawBridge.fromToolContext(mockContext);
        
        expect(bridgeInstance).toBeInstanceOf(OpenClawBridge);
        expect(bridgeInstance.getSessionInfo()).toEqual({
          sessionKey: 'test-session-123',
          deliveryContext: {
            channel: 'feishu',
            accountId: 'account-123',
            userId: 'user-456',
          },
        });
      });

      it('应该正确调用API的fromToolContext方法', async () => {
        // 触发绑定
        await bridge.listTasks();
        
        // listTasks使用tasks.runs.fromToolContext而非taskFlow.fromToolContext
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionKey: 'test-session-123',
          })
        );
      });

      it('应该正确处理没有deliveryContext的情况', () => {
        const contextWithoutDelivery: ToolContext = {
          sessionKey: 'session-456',
          api: mockApi,
        };
        
        const bridgeInstance = OpenClawBridge.fromToolContext(contextWithoutDelivery);
        
        expect(bridgeInstance.getSessionInfo()).toEqual({
          sessionKey: 'session-456',
          deliveryContext: undefined,
        });
      });
    });

    describe('bindSession()', () => {
      it('应该正确绑定新会话', () => {
        bridge.bindSession('new-session-789', {
          channel: 'telegram',
          accountId: 'new-account',
        });
        
        const info = bridge.getSessionInfo();
        
        expect(info.sessionKey).toBe('new-session-789');
        expect(info.deliveryContext?.channel).toBe('telegram');
        expect(info.deliveryContext?.accountId).toBe('new-account');
      });

      it('绑定新会话后应该清除旧的绑定实例', async () => {
        // 第一次调用，触发绑定
        await bridge.listTasks();
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledTimes(1);
        
        // 绑定新会话
        bridge.bindSession('new-session');
        
        // 再次调用，应该重新绑定
        await bridge.listTasks();
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledTimes(2);
      });

      it('应该支持多次切换会话', async () => {
        // 第一次调用
        await bridge.listTasks();
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledTimes(1);
        
        // 切换会话1
        bridge.bindSession('session-1');
        await bridge.listTasks();
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledTimes(2);
        
        // 切换会话2
        bridge.bindSession('session-2');
        await bridge.listTasks();
        expect(mockApi.runtime.tasks.runs.fromToolContext).toHaveBeenCalledTimes(3);
      });
    });
  });

  // ==================== 2. 任务操作测试 ====================

  describe('任务操作', () => {
    describe('createTask()', () => {
      const taskParams: TaskCreateParams = {
        title: 'Test Task',
        runtime: 'subagent',
        scope: 'session',
        timeout: 300000,
      };

      it('应该成功创建任务', async () => {
        const mockFlowView = createMockTaskFlowView({ flowId: 'flow-new' });
        const mockTask = createMockTaskView({ taskId: 'task-new' });
        const mockFlowDetail = createMockTaskFlowDetail({
          flowId: 'flow-new',
          tasks: [mockTask],
        });

        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlowView);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(mockFlowDetail);

        const result = await bridge.createTask(taskParams);

        expect(result.taskId).toBe('task-new');
        expect(result.flowId).toBe('flow-new');
        expect(result.status).toBe('pending');
      });

      it('创建任务时应该传递正确的参数', async () => {
        const mockFlowView = createMockTaskFlowView();
        const mockTask = createMockTaskView();
        const mockFlowDetail = createMockTaskFlowDetail({ tasks: [mockTask] });

        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlowView);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(mockFlowDetail);

        await bridge.createTask(taskParams);

        expect(boundTaskFlow.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Task',
            tasks: [taskParams],
          })
        );
      });

      it('创建任务失败时应该抛出TaskOperationError', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.createTask(taskParams)).rejects.toThrow(TaskOperationError);
        await expect(bridge.createTask(taskParams)).rejects.toMatchObject({
          code: 'TASK_CREATION_ERROR',
        });
      });

      it('创建任务但没有返回任务详情时应该抛出错误', async () => {
        const mockFlowView = createMockTaskFlowView();
        const mockFlowDetail = createMockTaskFlowDetail({ tasks: [] });

        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlowView);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(mockFlowDetail);

        await expect(bridge.createTask(taskParams)).rejects.toThrow(TaskOperationError);
        await expect(bridge.createTask(taskParams)).rejects.toMatchObject({
          code: 'TASK_CREATION_ERROR',
        });
      });

      it('创建任务时返回undefined应该抛出错误', async () => {
        const mockFlowView = createMockTaskFlowView();
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlowView);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(undefined);

        await expect(bridge.createTask(taskParams)).rejects.toThrow(TaskOperationError);
      });
    });

    describe('getTask()', () => {
      it('应该成功获取任务详情', async () => {
        const mockTask = createMockTaskDetail({ taskId: 'task-123' });
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.get as jest.Mock).mockResolvedValue(mockTask);

        const result = await bridge.getTask('task-123');

        expect(result).toEqual(mockTask);
        expect(boundTaskRuns.get).toHaveBeenCalledWith('task-123');
      });

      it('任务不存在时应该返回undefined', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.get as jest.Mock).mockResolvedValue(undefined);

        const result = await bridge.getTask('non-existent');

        expect(result).toBeUndefined();
      });

      it('获取任务失败时应该抛出TaskOperationError', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.get as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.getTask('task-123')).rejects.toThrow(TaskOperationError);
        await expect(bridge.getTask('task-123')).rejects.toMatchObject({
          code: 'TASK_GET_ERROR',
        });
      });
    });

    describe('listTasks()', () => {
      it('应该成功列出任务列表', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1' }),
          createMockTaskView({ taskId: 'task-2' }),
          createMockTaskView({ taskId: 'task-3' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.listTasks();

        expect(result).toHaveLength(3);
        expect(result).toEqual(mockTasks);
      });

      it('没有任务时应该返回空数组', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue([]);

        const result = await bridge.listTasks();

        expect(result).toEqual([]);
      });

      it('列出任务失败时应该抛出TaskOperationError', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.listTasks()).rejects.toThrow(TaskOperationError);
        await expect(bridge.listTasks()).rejects.toMatchObject({
          code: 'TASK_LIST_ERROR',
        });
      });

      it('list方法不应该接受任何参数', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue([]);

        await bridge.listTasks();

        expect(boundTaskRuns.list).toHaveBeenCalledWith();
      });
    });

    describe('queryTasks()', () => {
      it('应该支持按状态过滤', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1', status: 'pending' }),
          createMockTaskView({ taskId: 'task-2', status: 'running' }),
          createMockTaskView({ taskId: 'task-3', status: 'succeeded' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks({ status: 'pending' });

        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('pending');
      });

      it('应该支持按多个状态过滤', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1', status: 'pending' }),
          createMockTaskView({ taskId: 'task-2', status: 'running' }),
          createMockTaskView({ taskId: 'task-3', status: 'succeeded' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks({ status: ['pending', 'running'] });

        expect(result).toHaveLength(2);
      });

      it('应该支持按runtime过滤', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1', runtime: 'subagent' }),
          createMockTaskView({ taskId: 'task-2', runtime: 'acp' }),
          createMockTaskView({ taskId: 'task-3', runtime: 'agent' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks({ runtime: 'subagent' });

        expect(result).toHaveLength(1);
        expect(result[0].runtime).toBe('subagent');
      });

      it('应该支持limit限制', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1' }),
          createMockTaskView({ taskId: 'task-2' }),
          createMockTaskView({ taskId: 'task-3' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks({ limit: 2 });

        expect(result).toHaveLength(2);
      });

      it('没有过滤条件时应该返回所有任务', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1' }),
          createMockTaskView({ taskId: 'task-2' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks();

        expect(result).toHaveLength(2);
      });

      it('应该支持组合过滤条件', async () => {
        const mockTasks = [
          createMockTaskView({ taskId: 'task-1', status: 'pending', runtime: 'subagent' }),
          createMockTaskView({ taskId: 'task-2', status: 'running', runtime: 'subagent' }),
          createMockTaskView({ taskId: 'task-3', status: 'pending', runtime: 'acp' }),
        ];
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockResolvedValue(mockTasks);

        const result = await bridge.queryTasks({
          status: 'pending',
          runtime: 'subagent',
        });

        expect(result).toHaveLength(1);
        expect(result[0].taskId).toBe('task-1');
      });
    });

    describe('cancelTask()', () => {
      it('应该成功取消任务', async () => {
        const mockResult: TaskRunCancelResult = {
          taskId: 'task-123',
          cancelled: true,
          reason: 'User requested',
        };
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.cancel as jest.Mock).mockResolvedValue(mockResult);

        const result = await bridge.cancelTask('task-123', 'User requested');

        expect(result.cancelled).toBe(true);
        expect(result.taskId).toBe('task-123');
      });

      it('取消任务时应该传递正确的参数', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.cancel as jest.Mock).mockResolvedValue({
          taskId: 'task-123',
          cancelled: true,
        });

        await bridge.cancelTask('task-123', 'Test reason');

        expect(boundTaskRuns.cancel).toHaveBeenCalledWith('task-123', 'Test reason');
      });

      it('取消任务失败时应该抛出TaskOperationError', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.cancel as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.cancelTask('task-123')).rejects.toThrow(TaskOperationError);
        await expect(bridge.cancelTask('task-123')).rejects.toMatchObject({
          code: 'TASK_CANCEL_ERROR',
        });
      });
    });

    describe('findLatestTask()', () => {
      it('应该成功找到最新任务', async () => {
        const mockTask = createMockTaskDetail({ taskId: 'task-latest' });
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.findLatest as jest.Mock).mockResolvedValue(mockTask);

        const result = await bridge.findLatestTask();

        expect(result?.taskId).toBe('task-latest');
      });

      it('没有任务时应该返回undefined', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.findLatest as jest.Mock).mockResolvedValue(undefined);

        const result = await bridge.findLatestTask();

        expect(result).toBeUndefined();
      });

      it('查找失败时应该抛出TaskOperationError', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.findLatest as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.findLatestTask()).rejects.toThrow(TaskOperationError);
        await expect(bridge.findLatestTask()).rejects.toMatchObject({
          code: 'TASK_FIND_LATEST_ERROR',
        });
      });
    });
  });

  // ==================== 3. TaskFlow操作测试 ====================

  describe('TaskFlow操作', () => {
    describe('createTaskFlow()', () => {
      const flowDef: TaskFlowDefinition = {
        name: 'Test Flow',
        description: 'Test flow description',
        tasks: [
          { title: 'Task 1', runtime: 'subagent' },
          { title: 'Task 2', runtime: 'acp' },
        ],
      };

      it('应该成功创建任务流', async () => {
        const mockFlow = createMockTaskFlowView({ flowId: 'flow-new' });
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlow);

        const result = await bridge.createTaskFlow(flowDef);

        expect(result.flowId).toBe('flow-new');
        expect(result.name).toBe('Test Flow');
      });

      it('创建任务流时应该传递正确的参数', async () => {
        const mockFlow = createMockTaskFlowView();
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockResolvedValue(mockFlow);

        await bridge.createTaskFlow(flowDef);

        expect(boundTaskFlow.create).toHaveBeenCalledWith(flowDef);
      });

      it('创建任务流失败时应该抛出TaskOperationError', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.create as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.createTaskFlow(flowDef)).rejects.toThrow(TaskOperationError);
        await expect(bridge.createTaskFlow(flowDef)).rejects.toMatchObject({
          code: 'TASKFLOW_CREATION_ERROR',
        });
      });
    });

    describe('getTaskFlow()', () => {
      it('应该成功获取任务流详情', async () => {
        const mockFlow = createMockTaskFlowDetail({ flowId: 'flow-123' });
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(mockFlow);

        const result = await bridge.getTaskFlow('flow-123');

        expect(result?.flowId).toBe('flow-123');
        expect(boundTaskFlow.get).toHaveBeenCalledWith('flow-123');
      });

      it('任务流不存在时应该返回undefined', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.get as jest.Mock).mockResolvedValue(undefined);

        const result = await bridge.getTaskFlow('non-existent');

        expect(result).toBeUndefined();
      });

      it('获取任务流失败时应该抛出TaskOperationError', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.get as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.getTaskFlow('flow-123')).rejects.toThrow(TaskOperationError);
        await expect(bridge.getTaskFlow('flow-123')).rejects.toMatchObject({
          code: 'TASKFLOW_GET_ERROR',
        });
      });
    });

    describe('listTaskFlows()', () => {
      it('应该成功列出任务流列表', async () => {
        const mockFlows = [
          createMockTaskFlowView({ flowId: 'flow-1' }),
          createMockTaskFlowView({ flowId: 'flow-2' }),
        ];
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.list as jest.Mock).mockResolvedValue(mockFlows);

        const result = await bridge.listTaskFlows();

        expect(result).toHaveLength(2);
        expect(result).toEqual(mockFlows);
      });

      it('没有任务流时应该返回空数组', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.list as jest.Mock).mockResolvedValue([]);

        const result = await bridge.listTaskFlows();

        expect(result).toEqual([]);
      });

      it('列出任务流失败时应该抛出TaskOperationError', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.list as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.listTaskFlows()).rejects.toThrow(TaskOperationError);
        await expect(bridge.listTaskFlows()).rejects.toMatchObject({
          code: 'TASKFLOW_LIST_ERROR',
        });
      });
    });

    describe('cancelTaskFlow()', () => {
      it('应该成功取消任务流', async () => {
        const mockResult: TaskFlowCancelResult = {
          flowId: 'flow-123',
          cancelled: true,
          reason: 'User requested',
        };
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.cancel as jest.Mock).mockResolvedValue(mockResult);

        const result = await bridge.cancelTaskFlow('flow-123', 'User requested');

        expect(result.cancelled).toBe(true);
        expect(result.flowId).toBe('flow-123');
      });

      it('取消任务流时应该传递正确的参数', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.cancel as jest.Mock).mockResolvedValue({
          flowId: 'flow-123',
          cancelled: true,
        });

        await bridge.cancelTaskFlow('flow-123', 'Test reason');

        expect(boundTaskFlow.cancel).toHaveBeenCalledWith('flow-123', 'Test reason');
      });

      it('取消任务流失败时应该抛出TaskOperationError', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        (boundTaskFlow.cancel as jest.Mock).mockRejectedValue(new Error('API Error'));

        await expect(bridge.cancelTaskFlow('flow-123')).rejects.toThrow(TaskOperationError);
        await expect(bridge.cancelTaskFlow('flow-123')).rejects.toMatchObject({
          code: 'TASKFLOW_CANCEL_ERROR',
        });
      });
    });
  });

  // ==================== 4. 工具方法测试 ====================

  describe('工具方法', () => {
    describe('checkApiAvailability()', () => {
      it('应该正确检查API可用性', () => {
        const result = bridge.checkApiAvailability();

        expect(result.taskFlow).toBe(true);
        expect(result.tasks).toBe(true);
        // 空对象{}也是truthy，所以events/subagent会返回true
        // 这取决于checkApiAvailability的实现（检查特定方法而非对象存在）
        expect(typeof result.events).toBe('boolean');
        expect(typeof result.subagent).toBe('boolean');
      });

      it('当taskFlow API不可用时应该返回false', () => {
        const incompleteApi = createMockApi();
        delete (incompleteApi.runtime.taskFlow as any).fromToolContext;
        
        const newBridge = OpenClawBridge.fromToolContext({
          sessionKey: 'test',
          api: incompleteApi,
        });
        
        const result = newBridge.checkApiAvailability();
        
        expect(result.taskFlow).toBe(false);
      });

      it('当tasks.runs API不可用时应该返回false', () => {
        const incompleteApi = createMockApi();
        delete (incompleteApi.runtime.tasks.runs as any).fromToolContext;
        
        const newBridge = OpenClawBridge.fromToolContext({
          sessionKey: 'test',
          api: incompleteApi,
        });
        
        const result = newBridge.checkApiAvailability();
        
        expect(result.tasks).toBe(false);
      });
    });

    describe('getSessionInfo()', () => {
      it('应该正确返回会话信息', () => {
        const info = bridge.getSessionInfo();

        expect(info.sessionKey).toBe('test-session-123');
        expect(info.deliveryContext?.channel).toBe('feishu');
        expect(info.deliveryContext?.accountId).toBe('account-123');
        expect(info.deliveryContext?.userId).toBe('user-456');
      });

      it('绑定新会话后应该返回新的会话信息', () => {
        bridge.bindSession('new-session', {
          channel: 'telegram',
        });

        const info = bridge.getSessionInfo();

        expect(info.sessionKey).toBe('new-session');
        expect(info.deliveryContext?.channel).toBe('telegram');
      });

      it('没有deliveryContext时应该返回undefined', () => {
        const simpleBridge = OpenClawBridge.fromToolContext({
          sessionKey: 'simple-session',
          api: mockApi,
        });

        const info = simpleBridge.getSessionInfo();

        expect(info.sessionKey).toBe('simple-session');
        expect(info.deliveryContext).toBeUndefined();
      });
    });
  });

  // ==================== 5. 错误处理测试 ====================

  describe('错误处理', () => {
    describe('TaskOperationError', () => {
      it('错误应该包含正确的code和message', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.get as jest.Mock).mockRejectedValue(new Error('Network error'));

        try {
          await bridge.getTask('task-123');
          fail('Should throw error');
        } catch (error) {
          expect(error).toBeInstanceOf(TaskOperationError);
          const taskError = error as TaskOperationError;
          expect(taskError.code).toBe('TASK_GET_ERROR');
          expect(taskError.message).toContain('Network error');
        }
      });

      it('错误应该包含上下文信息', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.get as jest.Mock).mockRejectedValue(new Error('API Error'));

        try {
          await bridge.getTask('task-456');
          fail('Should throw error');
        } catch (error) {
          const taskError = error as TaskOperationError;
          expect(taskError.context).toEqual({ taskId: 'task-456' });
        }
      });

      it('错误应该包含原始错误信息', async () => {
        const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
        const originalError = new Error('Original error');
        (boundTaskFlow.create as jest.Mock).mockRejectedValue(originalError);

        try {
          await bridge.createTaskFlow({ name: 'Test', tasks: [] });
          fail('Should throw error');
        } catch (error) {
          const taskError = error as TaskOperationError;
          expect(taskError.message).toContain('Original error');
        }
      });

      it('非Error对象应该被正确处理', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        (boundTaskRuns.list as jest.Mock).mockRejectedValue('String error');

        try {
          await bridge.listTasks();
          fail('Should throw error');
        } catch (error) {
          const taskError = error as TaskOperationError;
          expect(taskError.message).toContain('String error');
        }
      });
    });

    describe('错误恢复', () => {
      it('API临时故障后应该能正常工作', async () => {
        const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
        
        // 第一次调用失败
        (boundTaskRuns.list as jest.Mock)
          .mockRejectedValueOnce(new Error('Temporary error'))
          .mockResolvedValueOnce([createMockTaskView()]);

        // 第一次应该失败
        await expect(bridge.listTasks()).rejects.toThrow(TaskOperationError);

        // 第二次应该成功
        const result = await bridge.listTasks();
        expect(result).toHaveLength(1);
      });
    });
  });

  // ==================== 边界条件测试 ====================

  describe('边界条件', () => {
    it('空任务列表应该正常处理', async () => {
      const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
      (boundTaskRuns.list as jest.Mock).mockResolvedValue([]);

      const result = await bridge.listTasks();
      expect(result).toEqual([]);
    });

    it('空TaskFlow列表应该正常处理', async () => {
      const boundTaskFlow = mockApi.runtime.taskFlow.fromToolContext({} as any);
      (boundTaskFlow.list as jest.Mock).mockResolvedValue([]);

      const result = await bridge.listTaskFlows();
      expect(result).toEqual([]);
    });

    it('undefined参数应该被正确处理', async () => {
      const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
      (boundTaskRuns.get as jest.Mock).mockResolvedValue(undefined);

      const result = await bridge.getTask('non-existent');
      expect(result).toBeUndefined();
    });

    it('空字符串sessionId应该被接受', () => {
      expect(() => {
        OpenClawBridge.fromToolContext({
          sessionKey: '',
          api: mockApi,
        });
      }).not.toThrow();
    });

    it('特殊字符taskId应该被正确处理', async () => {
      const boundTaskRuns = mockApi.runtime.tasks.runs.fromToolContext({} as any);
      (boundTaskRuns.get as jest.Mock).mockResolvedValue(createMockTaskDetail());

      await bridge.getTask('task-with-special-chars-!@#$%');
      expect(boundTaskRuns.get).toHaveBeenCalledWith('task-with-special-chars-!@#$%');
    });
  });
});