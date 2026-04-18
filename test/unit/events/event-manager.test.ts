/**
 * EventManager 单元测试
 * 
 * 测试事件管理器的所有功能
 * 
 * @version 3.0.0
 */

import { EventManager } from '../../../src/core/events/event-manager';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  HealthCheckEvent,
} from '../../../src/core/events/event-types';

describe('EventManager', () => {
  let eventManager: EventManager;

  beforeEach(() => {
    // 创建新的EventManager实例，禁用调试模式
    eventManager = new EventManager(false);
  });

  afterEach(() => {
    // 清理所有监听器
    eventManager.clearAll();
  });

  // ==================== 基础功能测试 ====================

  describe('on() - 事件监听', () => {
    it('应该成功注册事件监听器', () => {
      const listener = jest.fn();
      
      eventManager.on('task:created', listener);
      
      expect(eventManager.getListenerCount('task:created')).toBe(1);
    });

    it('应该正确触发事件监听器', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', listener);
      eventManager.emit('task:created', payload);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('应该支持多个监听器', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', listener1);
      eventManager.on('task:created', listener2);
      eventManager.emit('task:created', payload);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('应该返回取消订阅函数', () => {
      const listener = jest.fn();

      const unsubscribe = eventManager.on('task:created', listener);
      
      expect(eventManager.getListenerCount('task:created')).toBe(1);
      
      unsubscribe();
      
      expect(eventManager.getListenerCount('task:created')).toBe(0);
    });
  });

  describe('emit() - 事件发射', () => {
    it('应该成功发射事件', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', listener);
      eventManager.emit('task:created', payload);

      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('应该更新事件统计', () => {
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.emit('task:created', payload);
      eventManager.emit('task:created', payload);
      eventManager.emit('task:completed', {
        flowId: 'flow-123',
        goal: '测试任务',
        duration: 1000,
        timestamp: Date.now(),
      });

      const stats = eventManager.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType.get('task:created')).toBe(2);
      expect(stats.eventsByType.get('task:completed')).toBe(1);
    });

    it('监听器抛出错误时不应影响其他监听器', () => {
      const errorListener = jest.fn(() => {
        throw new Error('监听器错误');
      });
      const normalListener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', errorListener);
      eventManager.on('task:created', normalListener);
      eventManager.emit('task:created', payload);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('off() - 取消监听', () => {
    it('应该成功取消事件监听', () => {
      const listener = jest.fn();

      eventManager.on('task:created', listener);
      eventManager.off('task:created', listener);

      expect(eventManager.getListenerCount('task:created')).toBe(0);
    });

    it('取消后不应再触发监听器', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', listener);
      eventManager.off('task:created', listener);
      eventManager.emit('task:created', payload);

      expect(listener).not.toHaveBeenCalled();
    });

    it('应该更新监听器统计', () => {
      const listener = jest.fn();

      eventManager.on('task:created', listener);
      eventManager.off('task:created', listener);

      const stats = eventManager.getStats();
      expect(stats.totalListeners).toBe(0);
      expect(stats.listenersByType.get('task:created')).toBe(0);
    });
  });

  describe('once() - 一次性监听', () => {
    it('应该只触发一次', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.once('task:created', listener);
      eventManager.emit('task:created', payload);
      eventManager.emit('task:created', payload);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('触发后应该移除监听器', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.once('task:created', listener);
      expect(eventManager.getListenerCount('task:created')).toBe(1);

      eventManager.emit('task:created', payload);
      expect(eventManager.getListenerCount('task:created')).toBe(0);
    });
  });

  // ==================== 高级功能测试 ====================

  describe('onMultiple() - 批量监听', () => {
    it('应该成功注册多个事件监听器', () => {
      const createdListener = jest.fn();
      const completedListener = jest.fn();

      eventManager.onMultiple({
        'task:created': createdListener,
        'task:completed': completedListener,
      });

      expect(eventManager.getListenerCount('task:created')).toBe(1);
      expect(eventManager.getListenerCount('task:completed')).toBe(1);
    });

    it('应该正确触发多个监听器', () => {
      const createdListener = jest.fn();
      const completedListener = jest.fn();

      eventManager.onMultiple({
        'task:created': createdListener,
        'task:completed': completedListener,
      });

      const createdPayload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.emit('task:created', createdPayload);
      expect(createdListener).toHaveBeenCalledWith(createdPayload);

      const completedPayload: TaskCompletedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        duration: 1000,
        timestamp: Date.now(),
      };

      eventManager.emit('task:completed', completedPayload);
      expect(completedListener).toHaveBeenCalledWith(completedPayload);
    });

    it('应该返回取消所有监听的函数', () => {
      const createdListener = jest.fn();
      const completedListener = jest.fn();

      const unsubscribe = eventManager.onMultiple({
        'task:created': createdListener,
        'task:completed': completedListener,
      });

      expect(eventManager.getListenerCount('task:created')).toBe(1);
      expect(eventManager.getListenerCount('task:completed')).toBe(1);

      unsubscribe();

      expect(eventManager.getListenerCount('task:created')).toBe(0);
      expect(eventManager.getListenerCount('task:completed')).toBe(0);
    });
  });

  describe('getStats() - 事件统计', () => {
    it('应该正确统计事件和监听器', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('task:created', listener1);
      eventManager.on('task:completed', listener2);

      eventManager.emit('task:created', {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      });
      eventManager.emit('task:created', {
        flowId: 'flow-456',
        goal: '另一个任务',
        timestamp: Date.now(),
      });

      const stats = eventManager.getStats();

      expect(stats.totalListeners).toBe(2);
      expect(stats.totalEvents).toBe(2);
      expect(stats.listenersByType.get('task:created')).toBe(1);
      expect(stats.listenersByType.get('task:completed')).toBe(1);
      expect(stats.eventsByType.get('task:created')).toBe(2);
    });
  });

  describe('clearAll() - 清除所有监听器', () => {
    it('应该清除所有监听器', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('task:created', listener1);
      eventManager.on('task:completed', listener2);

      eventManager.clearAll();

      expect(eventManager.getListenerCount('task:created')).toBe(0);
      expect(eventManager.getListenerCount('task:completed')).toBe(0);
    });

    it('清除后不应再触发监听器', () => {
      const listener = jest.fn();
      const payload: TaskCreatedEvent = {
        flowId: 'flow-123',
        goal: '测试任务',
        timestamp: Date.now(),
      };

      eventManager.on('task:created', listener);
      eventManager.clearAll();
      eventManager.emit('task:created', payload);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ==================== 便捷方法测试 ====================

  describe('便捷方法', () => {
    it('emitTaskCreated() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('task:created', listener);

      eventManager.emitTaskCreated('flow-123', '测试任务', { priority: 'high' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          goal: '测试任务',
          metadata: { priority: 'high' },
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitTaskStarted() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('task:started', listener);

      eventManager.emitTaskStarted('flow-123', '测试任务', 'acp');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          goal: '测试任务',
          runtime: 'acp',
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitTaskCompleted() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('task:completed', listener);

      eventManager.emitTaskCompleted('flow-123', '测试任务', 1000, { success: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          goal: '测试任务',
          duration: 1000,
          result: { success: true },
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitTaskFailed() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('task:failed', listener);

      const analysis = {
        factors: ['网络超时'],
        shouldRetry: true,
        retryDelay: 1000,
        prevention: ['增加超时时间'],
      };

      eventManager.emitTaskFailed('flow-123', '测试任务', '连接失败', analysis);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          goal: '测试任务',
          error: '连接失败',
          analysis,
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitTaskCancelled() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('task:cancelled', listener);

      eventManager.emitTaskCancelled('task-456', 'flow-123', '用户取消');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-456',
          flowId: 'flow-123',
          reason: '用户取消',
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitSubTaskCreated() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('subtask:created', listener);

      eventManager.emitSubTaskCreated('flow-123', 'task-456', '子任务描述');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          taskId: 'task-456',
          task: '子任务描述',
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitSubTaskCompleted() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('subtask:completed', listener);

      eventManager.emitSubTaskCompleted('flow-123', 'task-456', '子任务描述', 500, {
        success: true,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-123',
          taskId: 'task-456',
          task: '子任务描述',
          duration: 500,
          result: { success: true },
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitHealthCheck() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('health:check', listener);

      const result = {
        healthy: true,
        runningCount: 5,
        timeoutTasks: [],
        errorTasks: [],
        checkedAt: Date.now(),
        issues: [],
      };

      eventManager.emitHealthCheck(result);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          result,
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitHealthIssue() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('health:issue', listener);

      const issue = {
        type: 'timeout' as const,
        message: '任务超时',
        severity: 'high' as const,
      };

      eventManager.emitHealthIssue(issue, 'task-789');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          issue,
          taskId: 'task-789',
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitOperationError() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('error:operation', listener);

      eventManager.emitOperationError('createTask', '参数错误', {
        taskId: 'task-123',
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'createTask',
          error: '参数错误',
          context: { taskId: 'task-123' },
          timestamp: expect.any(Number),
        })
      );
    });

    it('emitTimeoutError() 应该正确发射事件', () => {
      const listener = jest.fn();
      eventManager.on('error:timeout', listener);

      eventManager.emitTimeoutError('task-123', 30000, 'flow-456');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          flowId: 'flow-456',
          timeout: 30000,
          timestamp: expect.any(Number),
        })
      );
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况', () => {
    it('取消不存在的监听器不应报错', () => {
      const listener = jest.fn();

      expect(() => {
        eventManager.off('task:created', listener);
      }).not.toThrow();
    });

    it('发射没有监听器的事件不应报错', () => {
      expect(() => {
        eventManager.emit('task:created', {
          flowId: 'flow-123',
          goal: '测试任务',
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });

    it('多次调用 unsubscribe 不应报错', () => {
      const listener = jest.fn();
      const unsubscribe = eventManager.on('task:created', listener);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      expect(eventManager.getListenerCount('task:created')).toBe(0);
    });

    it('once 返回的 unsubscribe 应该能取消监听', () => {
      const listener = jest.fn();
      const unsubscribe = eventManager.once('task:created', listener);

      expect(eventManager.getListenerCount('task:created')).toBe(1);

      unsubscribe();

      expect(eventManager.getListenerCount('task:created')).toBe(0);
    });
  });

  // ==================== 性能测试 ====================

  describe('性能测试', () => {
    it('应该支持大量监听器', () => {
      const listeners = [];
      for (let i = 0; i < 100; i++) {
        listeners.push(jest.fn());
      }

      listeners.forEach(listener => {
        eventManager.on('task:created', listener);
      });

      expect(eventManager.getListenerCount('task:created')).toBe(100);
    });

    it('应该支持大量事件发射', () => {
      const listener = jest.fn();
      eventManager.on('task:created', listener);

      for (let i = 0; i < 1000; i++) {
        eventManager.emit('task:created', {
          flowId: `flow-${i}`,
          goal: `任务${i}`,
          timestamp: Date.now(),
        });
      }

      expect(listener).toHaveBeenCalledTimes(1000);
      const stats = eventManager.getStats();
      expect(stats.totalEvents).toBe(1000);
    });
  });
});
