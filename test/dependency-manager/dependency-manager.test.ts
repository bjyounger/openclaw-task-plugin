/**
 * DependencyManager 单元测试
 *
 * 测试 DependencyManager 的注册/注销/状态查询/就绪检测/循环检测/超时管理
 */

import {
  DependencyManager,
  DependencyResolver,
  TimeoutRegistry,
} from '../../src/core/dependency-manager/dependency-manager';
import {
  TaskDependency,
  DependencyState,
  DependencyItemDetail,
  DependencyItemStatus,
  DependencyEvents,
  CycleDetectedError,
  DependencyResolveResult,
} from '../../src/core/dependency-manager/types';
import { InMemoryDependencyStore } from '../../src/core/dependency-manager/dependency-store';
import { EventEmitter } from '../../src/core/managers/event-emitter';

// ==================== DependencyResolver 测试 ====================

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('resolve - all condition', () => {
    it('should be ready when all dependencies are satisfied', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      state.dependencyDetails.get('dep-1')!.status = 'satisfied';
      state.dependencyDetails.get('dep-2')!.status = 'satisfied';
      state.dependencyStatus.set('dep-1', 'satisfied');
      state.dependencyStatus.set('dep-2', 'satisfied');

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'all',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(true);
      expect(result.reason).toBe('All dependencies satisfied');
    });

    it('should be blocked when some dependencies are pending', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      state.dependencyDetails.get('dep-1')!.status = 'satisfied';
      state.dependencyStatus.set('dep-1', 'satisfied');

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'all',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(false);
      expect(result.blockedBy).toEqual(['dep-2']);
    });

    it('should be blocked when some dependencies failed', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      state.dependencyDetails.get('dep-1')!.status = 'satisfied';
      state.dependencyStatus.set('dep-1', 'satisfied');
      state.dependencyDetails.get('dep-2')!.status = 'failed';
      state.dependencyStatus.set('dep-2', 'failed');

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'all',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(false);
      expect(result.blockedBy).toEqual(['dep-2']);
      expect(result.reason).toBe('Some dependencies failed');
    });
  });

  describe('resolve - any condition', () => {
    it('should be ready when at least one dependency is satisfied', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      state.dependencyDetails.get('dep-1')!.status = 'satisfied';
      state.dependencyStatus.set('dep-1', 'satisfied');
      state.dependencyDetails.get('dep-2')!.status = 'pending';
      state.dependencyStatus.set('dep-2', 'pending');

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'any',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(true);
      expect(result.reason).toBe('At least one dependency satisfied');
    });

    it('should be blocked when all dependencies failed', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      state.dependencyDetails.get('dep-1')!.status = 'failed';
      state.dependencyStatus.set('dep-1', 'failed');
      state.dependencyDetails.get('dep-2')!.status = 'timeout';
      state.dependencyStatus.set('dep-2', 'timeout');

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'any',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(false);
      expect(result.blockedBy).toEqual(['dep-1', 'dep-2']);
      expect(result.reason).toBe('All dependencies failed');
    });

    it('should be waiting when no dependency is satisfied yet', () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);

      const dep = createTestDependency('task-1', ['dep-1', 'dep-2'], {
        condition: 'any',
      });

      const result = resolver.resolve(state, dep);
      expect(result.ready).toBe(false);
      expect(result.reason).toBe('Waiting for dependencies');
    });
  });

  describe('buildGraph', () => {
    it('should build a dependency graph', () => {
      const deps = [
        createTestDependency('task-1', ['dep-1']),
        createTestDependency('task-2', ['dep-2']),
      ];
      const states = new Map<string, DependencyState>();

      const graph = resolver.buildGraph(deps, states);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(4);
      expect(graph.edges).toHaveLength(2);
    });
  });
});

// ==================== TimeoutRegistry 测试 ====================

describe('TimeoutRegistry', () => {
  let registry: TimeoutRegistry;

  beforeEach(() => {
    registry = new TimeoutRegistry();
  });

  afterEach(() => {
    registry.clearAll();
  });

  it('should set and fire timeout', async () => {
    const callback = jest.fn();
    registry.set('task-1', 10, callback);

    // Wait for timeout to fire
    await sleep(50);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should clear timeout before it fires', async () => {
    const callback = jest.fn();
    registry.set('task-1', 50, callback);

    registry.clear('task-1');

    await sleep(100);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should replace existing timeout', async () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    registry.set('task-1', 50, callback1);
    registry.set('task-1', 10, callback2);

    await sleep(100);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledTimes(1);
  });

  it('should clear all timeouts', async () => {
    const callback = jest.fn();
    registry.set('task-1', 50, callback);
    registry.set('task-2', 50, callback);

    registry.clearAll();

    await sleep(100);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should report correct size', () => {
    registry.set('task-1', 1000, () => {});
    registry.set('task-2', 1000, () => {});

    expect(registry.size).toBe(2);

    registry.clear('task-1');
    expect(registry.size).toBe(1);
  });
});

// ==================== DependencyManager 测试 ====================

describe('DependencyManager', () => {
  let manager: DependencyManager;
  let store: InMemoryDependencyStore;
  let eventEmitter: EventEmitter<DependencyEvents>;

  beforeEach(() => {
    store = new InMemoryDependencyStore();
    eventEmitter = new EventEmitter<DependencyEvents>();
    manager = new DependencyManager(store, eventEmitter);
  });

  afterEach(async () => {
    await manager.destroy();
  });

  // ==================== 生命周期 ====================

  describe('initialize / destroy', () => {
    it('should initialize and destroy without error', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
      await expect(manager.destroy()).resolves.not.toThrow();
    });
  });

  // ==================== 依赖注册 ====================

  describe('register', () => {
    it('should register a dependency', async () => {
      const dep = createTestDependency('task-1', ['dep-1']);
      await manager.register(dep);

      const state = await manager.getDependencyState('task-1');
      expect(state).toBeDefined();
      expect(state?.ready).toBe(false);
      expect(state?.blockedBy).toEqual(['dep-1']);
    });

    it('should emit dependency:registered event', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:registered', handler);

      await manager.register(createTestDependency('task-1', ['dep-1']));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].taskId).toBe('task-1');
    });

    it('should be ready immediately if no dependencies', async () => {
      const dep = createTestDependency('task-1', []);
      await manager.register(dep);

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);
    });

    it('should detect circular dependency', async () => {
      // A depends on B, B depends on A
      await manager.register(createTestDependency('task-A', ['task-B']));

      await expect(
        manager.register(createTestDependency('task-B', ['task-A']))
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should detect longer circular dependency', async () => {
      // A -> B -> C -> A
      await manager.register(createTestDependency('task-A', ['task-B']));
      await manager.register(createTestDependency('task-B', ['task-C']));

      await expect(
        manager.register(createTestDependency('task-C', ['task-A']))
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should allow valid dependency chain', async () => {
      // A -> B -> C (no cycle)
      await manager.register(createTestDependency('task-C', []));
      await manager.register(createTestDependency('task-B', ['task-C']));
      await manager.register(createTestDependency('task-A', ['task-B']));

      const stateA = await manager.getDependencyState('task-A');
      expect(stateA).toBeDefined();
    });
  });

  // ==================== 依赖注销 ====================

  describe('unregister', () => {
    it('should unregister a dependency', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.unregister('task-1');

      const state = await manager.getDependencyState('task-1');
      expect(state).toBeUndefined();
    });

    it('should emit dependency:unregistered event', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:unregistered', handler);

      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.unregister('task-1');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].taskId).toBe('task-1');
    });
  });

  // ==================== 状态更新 ====================

  describe('updateDependencyStatus', () => {
    it('should update a dependency status to satisfied', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      const state = await manager.getDependencyState('task-1');
      expect(state?.dependencyStatus.get('dep-1')).toBe('satisfied');
    });

    it('should emit dependency:resolved event when satisfied', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:resolved', handler);

      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      // Wait for debounce
      await sleep(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should mark task as ready when all dependencies satisfied', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await manager.updateDependencyStatus('task-1', 'dep-2', 'satisfied');

      // Wait for debounce
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);
    });

    it('should emit dependency:ready event when all dependencies satisfied', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:ready', handler);

      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      // Wait for debounce
      await sleep(10);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].taskId).toBe('task-1');
    });

    it('should emit dependency:failed event when a dependency fails', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:failed', handler);

      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.updateDependencyStatus('task-1', 'dep-1', 'failed', 'Task failed');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].failedTaskId).toBe('dep-1');
    });
  });

  // ==================== 就绪检查 ====================

  describe('checkReadiness', () => {
    it('should return false for pending task', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));

      const ready = await manager.isReady('task-1');
      expect(ready).toBe(false);
    });

    it('should return true for ready task', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      await sleep(10);

      const ready = await manager.isReady('task-1');
      expect(ready).toBe(true);
    });

    it('should return blocked tasks', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.register(createTestDependency('task-2', ['dep-2']));

      const blocked = await manager.getBlockedTasks();
      expect(blocked).toHaveLength(2);
    });
  });

  // ==================== 依赖查询 ====================

  describe('getUpstreamDependencies / getDownstreamDependencies', () => {
    it('should return downstream dependencies', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.register(createTestDependency('task-2', ['dep-1']));

      const downstream = await manager.getDownstreamDependencies('dep-1');
      expect(downstream).toHaveLength(2);
      const ids = downstream.map((d: TaskDependency) => d.taskId).sort();
      expect(ids).toEqual(['task-1', 'task-2']);
    });

    it('should return empty array for non-existent upstream', async () => {
      const upstream = await manager.getUpstreamDependencies('non-existent');
      expect(upstream).toHaveLength(0);
    });
  });

  // ==================== 依赖图 ====================

  describe('getDependencyGraph', () => {
    it('should return a dependency graph', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      await manager.register(createTestDependency('task-2', ['dep-1', 'dep-2']));

      const graph = await manager.getDependencyGraph();
      expect(graph.nodes.length).toBeGreaterThanOrEqual(4);
      expect(graph.edges.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==================== 强制解析 ====================

  describe('forceResolve', () => {
    it('should force resolve all dependencies', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      await manager.forceResolve('task-1', {
        reason: 'Manual override',
        strategy: 'force_ready',
      });

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);
    });

    it('should force resolve specific dependencies', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1', 'dep-2']));

      // Satisfy dep-2 normally
      await manager.updateDependencyStatus('task-1', 'dep-2', 'satisfied');

      // Force resolve dep-1
      await manager.forceResolve('task-1', {
        reason: 'Skip dep-1',
        skipDependsOn: ['dep-1'],
      });

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);
      expect(state?.dependencyDetails.get('dep-1')?.skipReason).toBe('Skip dep-1');
    });

    it('should throw error for non-existent dependency', async () => {
      await expect(
        manager.forceResolve('non-existent', {
          reason: 'test',
          strategy: 'force_ready',
        })
      ).rejects.toThrow('Dependency not found');
    });
  });

  // ==================== 依赖历史 ====================

  describe('getDependencyHistory', () => {
    it('should return dependency history', async () => {
      await manager.register(createTestDependency('task-1', ['dep-1']));
      
      // Update status to trigger history entry
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');

      const history = await manager.getDependencyHistory('task-1');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].eventType).toBe('dependency:resolved');
    });
  });

  // ==================== 超时管理 ====================

  describe('timeout', () => {
    it('should fire timeout after specified duration', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:timeout', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], { timeout: 50 })
      );

      // Wait for timeout
      await sleep(100);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not fire timeout if dependency is resolved', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:timeout', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], { timeout: 100 })
      );

      // Resolve before timeout
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      // Wait past original timeout
      await sleep(150);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ==================== any 条件模式 ====================

  describe('any condition mode', () => {
    it('should be ready when at least one dependency is satisfied', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1', 'dep-2'], { condition: 'any' })
      );

      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);
    });
  });

  // ==================== 事件发射器 ====================

  describe('getEventEmitter', () => {
    it('should return the event emitter', () => {
      const emitter = manager.getEventEmitter();
      expect(emitter).toBeDefined();
    });
  });

  // ==================== 失败策略 ====================

  describe('failure strategy - block', () => {
    it('should block task when dependency fails with block strategy', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:blocked', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          onFailure: 'block',
          timeout: 50,
        })
      );

      // Wait for timeout to trigger block strategy
      await sleep(100);

      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0][0];
      expect(call.taskId).toBe('task-1');
      expect(call.reason).toContain('blocked');
    });

    it('should keep task blocked when dependency fails', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1'], { onFailure: 'block' })
      );

      await manager.updateDependencyStatus('task-1', 'dep-1', 'failed', 'Task failed');
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(false);
      expect(state?.blockedBy).toContain('dep-1');
    });
  });

  describe('failure strategy - skip', () => {
    it('should emit blocked event with skip reason when dependency fails', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:blocked', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          onFailure: 'skip',
          timeout: 50,
        })
      );

      await sleep(100);

      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0][0];
      expect(call.reason).toContain('skipped');
    });

    it('should not mark task as ready when skipped', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1'], { onFailure: 'skip' })
      );

      await manager.updateDependencyStatus('task-1', 'dep-1', 'failed', 'Task failed');
      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      // Skip strategy should still block the task, but with skip reason
      expect(state?.ready).toBe(false);
    });
  });

  describe('failure strategy - fallback', () => {
    it('should emit blocked event with fallback info when dependency fails', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:blocked', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          onFailure: 'fallback',
          fallbackTaskId: 'fallback-task-1',
          timeout: 50,
        })
      );

      await sleep(100);

      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0][0];
      expect(call.reason).toContain('fallback');
      expect(call.reason).toContain('fallback-task-1');
    });

    it('should handle fallback without fallbackTaskId', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:blocked', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], {
          onFailure: 'fallback',
          // No fallbackTaskId
          timeout: 50,
        })
      );

      await sleep(100);

      // Should still emit blocked event
      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0][0];
      expect(call.reason).toContain('no fallback task');
    });
  });

  // ==================== TimeoutRegistry 扩展 ====================

  describe('TimeoutRegistry extended', () => {
    it('should handle timeout for multiple tasks', async () => {
      const handler = jest.fn();
      eventEmitter.on('dependency:timeout', handler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], { timeout: 50 })
      );
      await manager.register(
        createTestDependency('task-2', ['dep-2'], { timeout: 50 })
      );

      await sleep(100);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should clear timeout when task becomes ready', async () => {
      const timeoutHandler = jest.fn();
      eventEmitter.on('dependency:timeout', timeoutHandler);

      await manager.register(
        createTestDependency('task-1', ['dep-1'], { timeout: 100 })
      );

      // Make the dependency satisfied before timeout
      await manager.updateDependencyStatus('task-1', 'dep-1', 'satisfied');
      await sleep(10);

      // Check that task is ready
      const state = await manager.getDependencyState('task-1');
      expect(state?.ready).toBe(true);

      // Wait past the original timeout
      await sleep(150);

      // Timeout should not fire
      expect(timeoutHandler).not.toHaveBeenCalled();
    });

    it('should update timeout timestamp in state', async () => {
      await manager.register(
        createTestDependency('task-1', ['dep-1'], { timeout: 5000 })
      );

      await sleep(10);

      const state = await manager.getDependencyState('task-1');
      expect(state?.timeoutAt).toBeDefined();
      expect(state?.timeoutAt).toBeGreaterThan(Date.now());
    });
  });
});

// ==================== Helper Functions ====================

function createTestDependency(
  taskId: string,
  dependsOn: string[],
  overrides?: Partial<TaskDependency>
): TaskDependency {
  return {
    taskId,
    dependsOn,
    type: 'hard',
    condition: 'all',
    timeout: 0,
    onFailure: 'block',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestState(
  taskId: string,
  dependsOn: string[]
): DependencyState {
  const details = new Map<string, DependencyItemDetail>();
  const statusMap = new Map<string, DependencyItemStatus>();

  for (const depTaskId of dependsOn) {
    details.set(depTaskId, {
      dependsOnTaskId: depTaskId,
      status: 'pending',
    });
    statusMap.set(depTaskId, 'pending');
  }

  return {
    taskId,
    dependencyDetails: details,
    dependencyStatus: statusMap,
    ready: false,
    blockedBy: dependsOn.length > 0 ? [...dependsOn] : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}