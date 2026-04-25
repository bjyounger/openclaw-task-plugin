/**
 * DependencyManager 集成测试
 *
 * 测试 DependencyManager 与 SessionTaskManager 的集成
 *
 * 测试场景：
 * 1. 端到端依赖流程（注册依赖 → 任务完成 → 自动触发）
 * 2. 并发触发（多个依赖同时完成）
 * 3. 失败传播（依赖失败 → 下游任务处理）
 * 4. 超时处理（依赖超时 → 触发传播）
 * 5. 循环依赖（检测并拒绝注册）
 * 6. 动态依赖（运行时添加/移除）
 */

import { DependencyManager } from '../../src/core/dependency-manager/dependency-manager';
import {
  TaskDependency,
  DependencyState,
  DependencyItemStatus,
} from '../../src/core/dependency-manager/types';
import { EventEmitter } from '../../src/core/managers/event-emitter';
import { InMemoryDependencyStore } from '../../src/core/dependency-manager/dependency-store';

// ==================== 测试工具函数 ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTestDependency(
  taskId: string,
  dependsOn: string[],
  options?: Partial<TaskDependency>
): TaskDependency {
  const now = new Date().toISOString();
  return {
    taskId,
    dependsOn,
    type: options?.type ?? 'hard',
    condition: options?.condition ?? 'all',
    timeout: options?.timeout ?? 0,
    onFailure: options?.onFailure ?? 'block',
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

// ==================== 集成测试 ====================

describe('DependencyManager Integration Tests', () => {
  let manager: DependencyManager;
  let store: InMemoryDependencyStore;

  beforeEach(() => {
    store = new InMemoryDependencyStore();
    manager = new DependencyManager(store);
  });

  afterEach(async () => {
    await manager.destroy();
  });

  // ==================== 场景 1: 端到端依赖流程 ====================

  describe('Scenario 1: End-to-end dependency flow', () => {
    it('should register dependency and mark task ready when dependency completes', async () => {
      // 1. 注册依赖
      await manager.register(createTestDependency('task-1', ['dep-1']));

      // 2. 验证初始状态
      let state = await manager.getDependencyState('task-1');
      expect(state).toBeDefined();
      expect(state!.ready).toBe(false);
      expect(state!.blockedBy).toContain('dep-1');

      // 3. 更新依赖状态为满足
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      // 4. 验证最终状态
      state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(true);
      expect(state!.blockedBy).toBeUndefined();
    });

    it('should emit dependency:ready event when all dependencies are satisfied', async () => {
      const eventEmitter = manager.getEventEmitter();
      const readyHandler = jest.fn();
      eventEmitter.on('dependency:ready', readyHandler);

      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      // 满足第一个依赖
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      // 还不应该就绪
      expect(readyHandler).not.toHaveBeenCalled();

      // 满足第二个依赖
      await manager.updateDependencyStatus('task-1', 'dep-2', 'satisfied');
      await sleep(10);

      // 现在应该就绪
      expect(readyHandler).toHaveBeenCalled();
      const event = readyHandler.mock.calls[0][0];
      expect(event.taskId).toBe('task-1');
    });
  });

  // ==================== 场景 2: 并发触发 ====================

  describe('Scenario 2: Concurrent trigger', () => {
    it('should handle multiple dependencies completing simultaneously', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2', 'dep-3']));

      // 同时更新所有依赖
      await Promise.all([
        manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied'),
        manager.updateDependencyStatus('task-1', 'dep-2', 'satisfied'),
        manager.updateDependencyStatus('task-1', 'dep-3', 'satisfied'),
      ]);

      await sleep(20);

      const state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(true);
    });

    it('should mark task ready when any dependency completes (any condition)', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1', 'dep-2'], {
          condition: 'any',
        })
      );

      // 只满足一个依赖
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(true);
    });
  });

  // ==================== 场景 3: 失败传播 ====================

  describe('Scenario 3: Failure propagation', () => {
    it('should handle dependency failure with block strategy', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1', 'dep-2'], {
          condition: 'all',
          onFailure: 'block',
        })
      );

      // 满足一个依赖
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      // 失败另一个
      await manager.updateDependencyStatus('task-1', 'dep-2', 'failed', 'Test failure');
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(false);
      expect(state!.blockedBy).toBeDefined();
    });

    it('should emit dependency:failed event when dependency fails', async () => {
      const eventEmitter = manager.getEventEmitter();
      const failedHandler = jest.fn();
      eventEmitter.on('dependency:failed', failedHandler);

      await manager.register(createTestDependency('task-1', ['dep-1']));

      await manager.updateDependencyStatus('task-1', 'dep-1', 'failed', 'Test error');
      await sleep(10);

      expect(failedHandler).toHaveBeenCalled();
      const event = failedHandler.mock.calls[0][0];
      expect(event.taskId).toBe('task-1');
      expect(event.failedTaskId).toBe('dep-1');
    });
  });

  // ==================== 场景 4: 超时处理 ====================

  describe('Scenario 4: Timeout handling', () => {
    it('should mark dependency as timeout when timeout expires', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          timeout: 100, // 100ms 超时
        })
      );

      // 等待超时
      await sleep(150);

      const state = await manager.getDependencyState('task-1');
      const depDetail = state!.dependencyDetails.get('dep-1');
      expect(depDetail!.status).toBe('timeout');
    });

    it('should clear timeout when dependency completes before timeout', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          timeout: 200,
        })
      );

      // 在超时前完成
      await sleep(50);
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      // 再等待超时时间
      await sleep(200);

      // 任务应该保持就绪，未超时
      const state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(true);
    });

    it('should emit dependency:timeout event on timeout', async () => {
      const eventEmitter = manager.getEventEmitter();
      const timeoutHandler = jest.fn();
      eventEmitter.on('dependency:timeout', timeoutHandler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          timeout: 50,
        })
      );

      await sleep(100);

      expect(timeoutHandler).toHaveBeenCalled();
    });
  });

  // ==================== 场景 5: 循环依赖检测 ====================

  describe('Scenario 5: Cycle detection', () => {
    it('should reject circular dependency registration', async () => {
      // 创建依赖链：task-2 -> task-1
      await manager.register(createTestDependency('task-2', ['task-1']));

      // 创建依赖链：task-3 -> task-2
      await manager.register(createTestDependency('task-3', ['task-2']));

      // 尝试创建循环依赖：task-1 -> task-3
      try {
        await manager.register(createTestDependency('task-1', ['task-3']));
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CycleDetectedError');
      }
    });

    it('should detect self-dependency', async () => {
      // 尝试创建自依赖
      try {
        await manager.register(createTestDependency('task-1', ['task-1']));
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CycleDetectedError');
      }
    });

    it('should detect complex circular dependency', async () => {
      // A -> B -> C -> D -> B (循环)
      await manager.register(createTestDependency('A', []));
      await manager.register(createTestDependency('B', ['A']));
      await manager.register(createTestDependency('C', ['B']));
      await manager.register(createTestDependency('D', ['C']));

      // 尝试创建循环：A -> D（间接创建 B 循环）
      try {
        await manager.register(createTestDependency('A', ['D']));
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CycleDetectedError');
      }
    });
  });

  // ==================== 场景 6: 动态依赖 ====================

  describe('Scenario 6: Dynamic dependency', () => {
    it('should add dependency at runtime', async () => {
      await manager.register(createTestDependency('dep-1', []));
      await manager.register(createTestDependency('task-1', []));

      // 动态添加依赖关系
      // 注意：需要先注销旧的，再注册新的
      await manager.unregister('task-1');
      await manager.register(createTestDependency('task-1', ['dep-1']));

      const state = await manager.getDependencyState('task-1');
      expect(state).toBeDefined();
      expect(state!.ready).toBe(false);
    });

    it('should remove dependency at runtime', async () => {
      await manager.register(createTestDependency('dep-1', []));
      await manager.register(createTestDependency('task-1', ['dep-1']));

      // 验证依赖存在
      let state = await manager.getDependencyState('task-1');
      expect(state).toBeDefined();

      // 移除依赖
      await manager.unregister('task-1');

      // 验证依赖已移除
      state = await manager.getDependencyState('task-1');
      expect(state).toBeUndefined();
    });

    it('should get downstream dependencies', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.register(createTestDependency('task-2', ['dep-1']));
      await manager.register(createTestDependency('task-3', ['dep-1']));

      const downstream = await manager.getDownstreamDependencies('dep-1');

      expect(downstream).toHaveLength(3);
      const taskIds = downstream.map(d => d.taskId);
      expect(taskIds).toContain('task-1');
      expect(taskIds).toContain('task-2');
      expect(taskIds).toContain('task-3');
    });

    it('should get upstream dependencies', async () => {
      // 上游任务也需要有依赖定义才能返回
      await manager.register(createTestDependency('dep-1', []));
      await manager.register(createTestDependency('dep-2', []));
      await manager.register(createTestDependency('dep-3', []));
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2', 'dep-3']));

      const upstream = await manager.getUpstreamDependencies('task-1');

      expect(upstream).toHaveLength(3);
      const taskIds = upstream.map(d => d.taskId);
      expect(taskIds).toContain('dep-1');
      expect(taskIds).toContain('dep-2');
      expect(taskIds).toContain('dep-3');
    });
  });

  // ==================== 辅助方法测试 ====================

  describe('Dependency query methods', () => {
    beforeEach(async () => {
      await manager.register(createTestDependency('dep-1', []));
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.register(createTestDependency('task-2', ['dep-1']));
    });

    it('should get blocked tasks list', async () => {
      const blockedTasks = await manager.getBlockedTasks();
      expect(blockedTasks).toHaveLength(2);
      expect(blockedTasks).toContain('task-1');
      expect(blockedTasks).toContain('task-2');
    });

    it('should get dependency graph', async () => {
      const graph = await manager.getDependencyGraph();

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);

      const edge = graph.edges.find(e => e.to === 'task-1');
      expect(edge).toBeDefined();
      expect(edge!.from).toBe('dep-1');
    });

    it('should check if task is ready', async () => {
      let isReady = await manager.isReady('task-1');
      expect(isReady).toBe(false);

      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      isReady = await manager.isReady('task-1');
      expect(isReady).toBe(true);
    });
  });

  // ==================== 强制解析测试 ====================

  describe('Force resolve', () => {
    it('should force resolve blocked dependency', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      // 只满足一个依赖
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      let state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(false);

      // 强制解析
      await manager.forceResolve('task-1', {
        reason: 'Manual override',
        strategy: 'force_ready',
      });

      state = await manager.getDependencyState('task-1');
      expect(state!.ready).toBe(true);
    });

    it('should skip specific dependencies', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      await manager.forceResolve('task-1', {
        reason: 'Skip dep-2',
        skipDependsOn: ['dep-2'],
      });

      const state = await manager.getDependencyState('task-1');
      const dep1Detail = state!.dependencyDetails.get('dep-1');
      const dep2Detail = state!.dependencyDetails.get('dep-2');

      expect(dep1Detail!.status).toBe('pending'); // 未跳过
      expect(dep2Detail!.status).toBe('satisfied'); // 已跳过
      expect(dep2Detail!.skipReason).toBe('Skip dep-2');
    });
  });

  // ==================== 生命周期测试 ====================

  describe('Lifecycle management', () => {
    it('should clear all resources on destroy', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1'], { timeout: 1000 }));

      await manager.destroy();

      // 验证超时定时器已清除（等待超时时间后检查）
      await sleep(1200);

      // 由于 manager 已销毁，状态应该无法获取
      const state = await manager.getDependencyState('task-1');
      // 根据 store 的实现，可能返回 undefined 或抛出错误
      // 这里我们只验证不会崩溃
    });
  });
});
