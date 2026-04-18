/**
 * SessionTaskManager 单元测试
 * 
 * @version 3.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionTaskManager } from '../../src/core/managers/session-task-manager';
import { OpenClawBridge } from '../../src/core/bridge';

// Mock OpenClawBridge
const mockBridge = {
  createTaskFlow: vi.fn(),
  createTask: vi.fn(),
  getTaskFlow: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  cancelTask: vi.fn(),
  queryTasks: vi.fn(),
  checkApiAvailability: vi.fn(() => ({
    taskFlow: true,
    tasks: true,
    events: true,
    subagent: true,
  })),
};

describe('SessionTaskManager', () => {
  let manager: SessionTaskManager;
  
  const config = {
    sessionKey: 'test-session-123',
    deliveryContext: {
      channel: 'feishu',
      accountId: 'test-account',
      userId: 'test-user',
    },
    bridge: mockBridge as unknown as OpenClawBridge,
    healthCheckIntervalMs: 1000,
    timeoutThresholdMs: 5000,
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionTaskManager(config);
  });
  
  afterEach(async () => {
    try {
      await manager.destroy();
    } catch (error) {}
  });
  
  describe('生命周期管理', () => {
    it('应该成功初始化', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
    });
    
    it('不应该重复初始化', async () => {
      await manager.initialize();
      await expect(manager.initialize()).rejects.toThrow('already initialized');
    });
    
    it('应该成功销毁', async () => {
      await manager.initialize();
      await expect(manager.destroy()).resolves.not.toThrow();
    });
    
    it('销毁后不应该能使用', async () => {
      await manager.initialize();
      await manager.destroy();
      await expect(manager.createMainTask('test')).rejects.toThrow('destroyed');
    });
  });
  
  describe('任务管理', () => {
    beforeEach(async () => {
      await manager.initialize();
    });
    
    describe('createMainTask', () => {
      it('应该成功创建主任务', async () => {
        const mockFlow = {
          flowId: 'flow-123',
          name: 'Test Task',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        mockBridge.createTaskFlow.mockResolvedValueOnce(mockFlow);
        
        const result = await manager.createMainTask('完成测试', {
          title: '测试任务',
          runtime: 'acp',
        });
        
        expect(result).toEqual(mockFlow);
        expect(mockBridge.createTaskFlow).toHaveBeenCalledTimes(1);
      });
      
      it('应该拒绝空目标', async () => {
        await expect(manager.createMainTask('')).rejects.toThrow('non-empty string');
      });
      
      it('应该触发task:created事件', async () => {
        const mockFlow = {
          flowId: 'flow-123',
          name: 'Test Task',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        mockBridge.createTaskFlow.mockResolvedValueOnce(mockFlow);
        
        const eventHandler = vi.fn();
        manager.on('task:created', eventHandler);
        
        await manager.createMainTask('完成测试');
        
        expect(eventHandler).toHaveBeenCalledTimes(1);
        expect(eventHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            flowId: 'flow-123',
            goal: '完成测试',
            timestamp: expect.any(Number),
          })
        );
      });
    });
    
    describe('createSubTask', () => {
      it('应该成功创建子任务', async () => {
        const mockFlow = {
          flowId: 'flow-123',
          name: 'Parent Task',
          status: 'running',
          createdAt: new Date().toISOString(),
          tasks: [],
        };
        
        const mockTask = {
          taskId: 'task-456',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        const mockTaskDetail = {
          taskId: 'task-456',
          status: 'pending',
          runtime: 'acp',
          title: 'Sub Task',
          scope: 'session',
          createdAt: new Date().toISOString(),
        };
        
        mockBridge.getTaskFlow.mockResolvedValueOnce(mockFlow);
        mockBridge.createTask.mockResolvedValueOnce(mockTask);
        mockBridge.getTask.mockResolvedValueOnce(mockTaskDetail);
        
        const result = await manager.createSubTask({
          flowId: 'flow-123',
          childSessionKey: 'child-123',
          task: '子任务',
        });
        
        expect(result).toEqual(mockTaskDetail);
        expect(mockBridge.createTask).toHaveBeenCalledTimes(1);
      });
      
      it('应该在父任务不存在时失败', async () => {
        mockBridge.getTaskFlow.mockResolvedValueOnce(undefined);
        
        await expect(manager.createSubTask({
          flowId: 'non-existent',
          childSessionKey: 'child-123',
          task: '子任务',
        })).rejects.toThrow('Parent flow not found');
      });
    });
    
    describe('getTask', () => {
      it('应该返回任务详情', async () => {
        const mockTaskDetail = {
          taskId: 'task-123',
          status: 'running',
          runtime: 'acp',
          title: 'Test Task',
          scope: 'session',
          createdAt: new Date().toISOString(),
        };
        
        mockBridge.getTask.mockResolvedValueOnce(mockTaskDetail);
        
        const result = await manager.getTask('task-123');
        
        expect(result).toEqual(mockTaskDetail);
        expect(mockBridge.getTask).toHaveBeenCalledWith('task-123');
      });
    });
    
    describe('listTasks', () => {
      it('应该返回任务列表', async () => {
        const mockTasks = [
          {
            taskId: 'task-1',
            status: 'running',
            runtime: 'acp',
            title: 'Task 1',
            createdAt: new Date().toISOString(),
          },
          {
            taskId: 'task-2',
            status: 'succeeded',
            runtime: 'acp',
            title: 'Task 2',
            createdAt: new Date().toISOString(),
          },
        ];
        
        mockBridge.listTasks.mockResolvedValueOnce(mockTasks);
        
        const result = await manager.listTasks();
        
        expect(result).toEqual(mockTasks);
        expect(mockBridge.listTasks).toHaveBeenCalledTimes(1);
      });
    });
    
    describe('queryTasks', () => {
      it('应该应用状态过滤', async () => {
        const mockTasks = [
          {
            taskId: 'task-1',
            status: 'running',
            runtime: 'acp',
            title: 'Task 1',
            createdAt: new Date().toISOString(),
          },
          {
            taskId: 'task-2',
            status: 'succeeded',
            runtime: 'acp',
            title: 'Task 2',
            createdAt: new Date().toISOString(),
          },
        ];
        
        mockBridge.listTasks.mockResolvedValueOnce(mockTasks);
        
        const result = await manager.queryTasks({ status: 'running' });
        
        expect(result).toHaveLength(1);
        expect(result[0].taskId).toBe('task-1');
      });
      
      it('应该应用数量限制', async () => {
        const mockTasks = Array.from({ length: 10 }, (_, i) => ({
          taskId: `task-${i}`,
          status: 'running',
          runtime: 'acp',
          title: `Task ${i}`,
          createdAt: new Date().toISOString(),
        }));
        
        mockBridge.listTasks.mockResolvedValueOnce(mockTasks);
        
        const result = await manager.queryTasks({ limit: 5 });
        
        expect(result).toHaveLength(5);
      });
    });
    
    describe('cancelTask', () => {
      it('应该成功取消任务', async () => {
        mockBridge.cancelTask.mockResolvedValueOnce({
          taskId: 'task-123',
          cancelled: true,
        });
        
        await expect(manager.cancelTask('task-123', '测试取消')).resolves.not.toThrow();
        
        expect(mockBridge.cancelTask).toHaveBeenCalledWith('task-123', '测试取消');
      });
      
      it('应该在取消失败时抛出错误', async () => {
        mockBridge.cancelTask.mockResolvedValueOnce({
          taskId: 'task-123',
          cancelled: false,
          reason: 'Task already completed',
        });
        
        await expect(manager.cancelTask('task-123')).rejects.toThrow('Failed to cancel');
      });
    });
    
    describe('completeTask', () => {
      it('应该成功完成任务', async () => {
        const mockFlow = {
          flowId: 'flow-123',
          name: 'Test Task',
          status: 'running',
          createdAt: new Date().toISOString(),
          tasks: [],
        };
        
        mockBridge.getTaskFlow.mockResolvedValueOnce(mockFlow);
        await manager.createMainTask('测试任务');
        mockBridge.getTaskFlow.mockResolvedValueOnce(mockFlow);
        
        const eventHandler = vi.fn();
        manager.on('task:completed', eventHandler);
        
        await manager.completeTask('flow-123', { result: 'success' });
        
        expect(eventHandler).toHaveBeenCalledTimes(1);
      });
      
      it('应该在任务不存在时失败', async () => {
        mockBridge.getTaskFlow.mockResolvedValueOnce(undefined);
        
        await expect(manager.completeTask('non-existent')).rejects.toThrow('not found');
      });
    });
    
    describe('failTask', () => {
      it('应该成功标记失败', async () => {
        const mockFlow = {
          flowId: 'flow-123',
          name: 'Test Task',
          status: 'running',
          createdAt: new Date().toISOString(),
          tasks: [],
        };
        
        mockBridge.getTaskFlow.mockResolvedValueOnce(mockFlow);
        await manager.createMainTask('测试任务');
        mockBridge.getTaskFlow.mockResolvedValueOnce(mockFlow);
        
        const eventHandler = vi.fn();
        manager.on('task:failed', eventHandler);
        
        await manager.failTask('flow-123', '测试失败');
        
        expect(eventHandler).toHaveBeenCalledTimes(1);
      });
    });
  });
  
  describe('事件系统', () => {
    beforeEach(async () => {
      await manager.initialize();
    });
    
    it('应该触发和监听事件', async () => {
      const handler = vi.fn();
      const unsubscribe = manager.on('manager:initialized', handler);
      
      manager.emit('manager:initialized', {
        sessionKey: 'test',
        timestamp: Date.now(),
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      manager.emit('manager:initialized', {
        sessionKey: 'test',
        timestamp: Date.now(),
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('健康检查', () => {
    beforeEach(async () => {
      await manager.initialize();
    });
    
    it('应该执行健康检查', async () => {
      mockBridge.listTasks.mockResolvedValueOnce([]);
      
      const result = await manager.performHealthCheck();
      
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('runningCount');
      expect(result).toHaveProperty('issues');
      expect(result.issues).toBeInstanceOf(Array);
    });
    
    it('应该检测超时任务', async () => {
      const oldTask = {
        taskId: 'task-1',
        status: 'running',
        runtime: 'acp',
        title: 'Old Task',
        createdAt: new Date(Date.now() - 6000).toISOString(),
        updatedAt: new Date(Date.now() - 6000).toISOString(),
      };
      
      mockBridge.listTasks.mockResolvedValueOnce([oldTask]);
      
      const result = await manager.performHealthCheck();
      
      expect(result.healthy).toBe(false);
      expect(result.timeoutTasks).toHaveLength(1);
      expect(result.issues.some(i => i.type === 'timeout')).toBe(true);
    });
    
    it('应该返回正确的统计信息', async () => {
      mockBridge.listTasks.mockResolvedValue([]);
      
      const stats = manager.getStats();
      
      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('runningTasks');
      expect(stats).toHaveProperty('completedTasks');
      expect(stats).toHaveProperty('failedTasks');
      expect(stats).toHaveProperty('averageDuration');
      expect(stats).toHaveProperty('successRate');
    });
  });
  
  describe('记忆管理', () => {
    beforeEach(async () => {
      await manager.initialize();
    });
    
    it('应该保存和获取记忆', async () => {
      const mockFlow = {
        flowId: 'flow-123',
        name: 'Test Task',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      
      mockBridge.createTaskFlow.mockResolvedValueOnce(mockFlow);
      
      await manager.createMainTask('测试任务');
      
      const memory = await manager.getMemory('flow-123');
      
      expect(memory).toBeDefined();
      expect(memory?.goal).toBe('测试任务');
      expect(memory?.status).toBe('pending');
    });
    
    it('应该搜索记忆', async () => {
      const mockFlow1 = {
        flowId: 'flow-1',
        name: 'Task 1',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      
      const mockFlow2 = {
        flowId: 'flow-2',
        name: 'Task 2',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      
      mockBridge.createTaskFlow
        .mockResolvedValueOnce(mockFlow1)
        .mockResolvedValueOnce(mockFlow2);
      
      await manager.createMainTask('测试任务一');
      await manager.createMainTask('开发任务二');
      
      const results = await manager.searchMemories('测试');
      
      expect(results).toHaveLength(1);
      expect(results[0].goal).toContain('测试');
    });
  });
  
  describe('错误处理', () => {
    it('未初始化时应该抛出错误', async () => {
      await expect(manager.createMainTask('test')).rejects.toThrow('not initialized');
    });
    
    it('API不可用时应该抛出错误', async () => {
      mockBridge.checkApiAvailability.mockReturnValueOnce({
        taskFlow: false,
        tasks: true,
        events: false,
        subagent: false,
      });
      
      await expect(manager.initialize()).rejects.toThrow('TaskFlow API not available');
    });
  });
});

describe('类型守卫', () => {
  it('isTaskStatus应该正确验证状态', async () => {
    const { isTaskStatus } = await import('../../src/core/managers/types');
    
    expect(isTaskStatus('running')).toBe(true);
    expect(isTaskStatus('succeeded')).toBe(true);
    expect(isTaskStatus('invalid')).toBe(false);
  });
  
  it('isTaskRuntime应该正确验证运行时', async () => {
    const { isTaskRuntime } = await import('../../src/core/managers/types');
    
    expect(isTaskRuntime('acp')).toBe(true);
    expect(isTaskRuntime('subagent')).toBe(true);
    expect(isTaskRuntime('invalid')).toBe(false);
  });
});
