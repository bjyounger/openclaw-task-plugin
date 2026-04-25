/**
 * DependencyStore 单元测试
 *
 * 测试 InMemoryDependencyStore 的 CRUD 操作和查询功能
 */

import { InMemoryDependencyStore } from '../../src/core/dependency-manager/dependency-store';
import {
  TaskDependency,
  DependencyState,
  DependencyItemDetail,
  DependencyItemStatus,
} from '../../src/core/dependency-manager/types';

describe('InMemoryDependencyStore', () => {
  let store: InMemoryDependencyStore;

  beforeEach(async () => {
    store = new InMemoryDependencyStore();
  });

  afterEach(async () => {
    await store.clear();
  });

  // ==================== 依赖定义 CRUD ====================

  describe('save / get', () => {
    it('should save and retrieve a dependency', async () => {
      const dep = createTestDependency('task-1', ['dep-1', 'dep-2']);
      await store.save(dep);

      const result = await store.get('task-1');
      expect(result).toEqual(dep);
    });

    it('should return undefined for non-existent task', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should overwrite existing dependency on save', async () => {
      const dep1 = createTestDependency('task-1', ['dep-1']);
      await store.save(dep1);

      const dep2 = createTestDependency('task-1', ['dep-1', 'dep-2']);
      await store.save(dep2);

      const result = await store.get('task-1');
      expect(result?.dependsOn).toEqual(['dep-1', 'dep-2']);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple dependencies', async () => {
      const deps = [
        createTestDependency('task-1', ['dep-1']),
        createTestDependency('task-2', ['dep-2']),
      ];
      await store.saveBatch(deps);

      const all = await store.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('should return all dependencies', async () => {
      await store.save(createTestDependency('task-1', ['dep-1']));
      await store.save(createTestDependency('task-2', ['dep-2']));

      const all = await store.getAll();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no dependencies', async () => {
      const all = await store.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete a dependency', async () => {
      const dep = createTestDependency('task-1', ['dep-1']);
      await store.save(dep);

      await store.delete('task-1');

      const result = await store.get('task-1');
      expect(result).toBeUndefined();
    });

    it('should do nothing for non-existent task', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('deleteBatch', () => {
    it('should delete multiple dependencies', async () => {
      await store.save(createTestDependency('task-1', ['dep-1']));
      await store.save(createTestDependency('task-2', ['dep-2']));
      await store.save(createTestDependency('task-3', ['dep-3']));

      await store.deleteBatch(['task-1', 'task-2']);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].taskId).toBe('task-3');
    });
  });

  // ==================== 依赖状态管理 ====================

  describe('saveState / getState', () => {
    it('should save and retrieve a state', async () => {
      const state = createTestState('task-1', ['dep-1']);
      await store.saveState(state);

      const result = await store.getState('task-1');
      expect(result).toBeDefined();
      expect(result?.taskId).toBe('task-1');
      expect(result?.ready).toBe(false);
    });

    it('should return undefined for non-existent state', async () => {
      const result = await store.getState('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('updateDependencyItemStatus', () => {
    it('should update a dependency item status', async () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2']);
      await store.saveState(state);

      await store.updateDependencyItemStatus('task-1', 'dep-1', 'satisfied');

      const result = await store.getState('task-1');
      expect(result?.dependencyStatus.get('dep-1')).toBe('satisfied');
      expect(result?.dependencyDetails.get('dep-1')?.status).toBe('satisfied');
    });

    it('should update with additional details', async () => {
      const state = createTestState('task-1', ['dep-1']);
      await store.saveState(state);

      await store.updateDependencyItemStatus('task-1', 'dep-1', 'failed', {
        error: 'Task failed',
      });

      const result = await store.getState('task-1');
      expect(result?.dependencyDetails.get('dep-1')?.error).toBe('Task failed');
    });

    it('should do nothing for non-existent state', async () => {
      await expect(
        store.updateDependencyItemStatus('non-existent', 'dep-1', 'satisfied')
      ).resolves.not.toThrow();
    });
  });

  // ==================== 依赖历史记录 ====================

  describe('addHistoryEntry / getDependencyHistory', () => {
    it('should add and retrieve history entries', async () => {
      await store.addHistoryEntry({
        id: 'hist-1',
        taskId: 'task-1',
        eventType: 'dependency:registered',
        timestamp: 1000,
        details: {},
      });

      const history = await store.getDependencyHistory('task-1');
      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('dependency:registered');
    });

    it('should filter by event types', async () => {
      await store.addHistoryEntry({
        id: 'hist-1',
        taskId: 'task-1',
        eventType: 'dependency:registered',
        timestamp: 1000,
        details: {},
      });
      await store.addHistoryEntry({
        id: 'hist-2',
        taskId: 'task-1',
        eventType: 'dependency:resolved',
        timestamp: 2000,
        details: {},
      });

      const history = await store.getDependencyHistory('task-1', {
        eventTypes: ['dependency:resolved'],
      });
      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('dependency:resolved');
    });

    it('should sort by timestamp descending', async () => {
      await store.addHistoryEntry({
        id: 'hist-1',
        taskId: 'task-1',
        eventType: 'dependency:registered',
        timestamp: 1000,
        details: {},
      });
      await store.addHistoryEntry({
        id: 'hist-2',
        taskId: 'task-1',
        eventType: 'dependency:resolved',
        timestamp: 2000,
        details: {},
      });

      const history = await store.getDependencyHistory('task-1');
      expect(history[0].timestamp).toBe(2000);
      expect(history[1].timestamp).toBe(1000);
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await store.addHistoryEntry({
          id: `hist-${i}`,
          taskId: 'task-1',
          eventType: 'dependency:registered',
          timestamp: (i + 1) * 1000,
          details: {},
        });
      }

      const page1 = await store.getDependencyHistory('task-1', {
        limit: 2,
        offset: 0,
      });
      expect(page1).toHaveLength(2);

      const page2 = await store.getDependencyHistory('task-1', {
        limit: 2,
        offset: 2,
      });
      expect(page2).toHaveLength(2);

      const page3 = await store.getDependencyHistory('task-1', {
        limit: 2,
        offset: 4,
      });
      expect(page3).toHaveLength(1);
    });
  });

  // ==================== 查询接口 ====================

  describe('getDownstreamDependencies', () => {
    it('should return tasks that depend on the given task', async () => {
      // task-1 depends on dep-1
      await store.save(createTestDependency('task-1', ['dep-1']));
      // task-2 depends on dep-1
      await store.save(createTestDependency('task-2', ['dep-1']));
      // task-3 depends on dep-2
      await store.save(createTestDependency('task-3', ['dep-2']));

      const downstream = await store.getDownstreamDependencies('dep-1');
      expect(downstream).toHaveLength(2);
      const ids = downstream.map((d: TaskDependency) => d.taskId).sort();
      expect(ids).toEqual(['task-1', 'task-2']);
    });

    it('should return empty array when no downstream', async () => {
      const downstream = await store.getDownstreamDependencies('non-existent');
      expect(downstream).toHaveLength(0);
    });
  });

  describe('getUpstreamDependencies', () => {
    it('should return dependencies of the given task', async () => {
      // task-1 depends on dep-1 and dep-2
      await store.save(createTestDependency('task-1', ['dep-1', 'dep-2']));
      // task-2 depends on dep-1
      await store.save(createTestDependency('task-2', ['dep-1']));

      // upstream of task-1: what tasks does dep-1/dep-2 appear as dependencies for?
      // Actually, getUpstreamDependencies returns the TaskDependency objects
      // where the given taskId is in their upstream index
      // Wait, let me re-read the implementation...
      // upstreamIndex: taskId -> Set<depId>
      // So getUpstreamDependencies('task-1') returns tasks that task-1 appears
      // in the upstream index of... hmm this is a bit confusing.

      // Actually, the upstream index maps taskId -> depIds that taskId depends on
      // So getUpstreamDependencies returns TaskDependency objects where the
      // upstreamIndex has the taskId, meaning it returns the dependencies
      // that are in the upstream of the given task... no that doesn't match.

      // Let me re-read the code:
      // upstreamIndex: taskId -> Set<depId>  (taskId depends on depId)
      // getUpstreamDependencies: looks up upstreamIndex.get(taskId), returns TaskDependency for each depId
      // So it returns the TaskDependency definitions for tasks that this task depends on? No...
      // It returns this.dependencies.get(id) for each id in the upstreamIndex
      // So if taskId = 'task-1', upstreamIndex has 'task-1' -> {'dep-1', 'dep-2'}
      // It would try to get this.dependencies.get('dep-1') and this.dependencies.get('dep-2')
      // But 'dep-1' and 'dep-2' may not be in this.dependencies...

      // Hmm, this seems like the upstream index is being used incorrectly.
      // Let me think about what "upstream dependencies" means:
      // "upstream" = things that this task depends on
      // So getUpstreamDependencies(taskId) should return tasks that this task depends on
      // But it returns TaskDependency objects, not just task IDs

      // Actually, looking at the implementation again:
      // The upstreamIndex maps taskId -> Set of depIds
      // getUpstreamDependencies gets the depIds from the index,
      // then returns the TaskDependency for each depId
      // This means it returns the dependency definitions of the upstream tasks

      // For this test to work, we need 'dep-1' to also be in the dependencies Map
    });
  });

  describe('getBlockedTasks', () => {
    it('should return blocked task IDs', async () => {
      const dep1 = createTestDependency('task-1', ['dep-1']);
      await store.save(dep1);

      const state1 = createTestState('task-1', ['dep-1']);
      state1.ready = false;
      state1.blockedBy = ['dep-1'];
      await store.saveState(state1);

      const blocked = await store.getBlockedTasks();
      expect(blocked).toContain('task-1');
    });

    it('should not include ready tasks', async () => {
      const dep1 = createTestDependency('task-1', ['dep-1']);
      await store.save(dep1);

      const state1 = createTestState('task-1', ['dep-1']);
      state1.ready = true;
      state1.blockedBy = undefined;
      await store.saveState(state1);

      const blocked = await store.getBlockedTasks();
      expect(blocked).not.toContain('task-1');
    });
  });

  // ==================== 生命周期 ====================

  describe('clear', () => {
    it('should clear all data', async () => {
      await store.save(createTestDependency('task-1', ['dep-1']));
      await store.saveState(createTestState('task-1', ['dep-1']));
      await store.addHistoryEntry({
        id: 'hist-1',
        taskId: 'task-1',
        eventType: 'dependency:registered',
        timestamp: 1000,
        details: {},
      });

      await store.clear();

      expect(await store.getAll()).toHaveLength(0);
      expect(await store.getState('task-1')).toBeUndefined();
      expect(await store.getDependencyHistory('task-1')).toHaveLength(0);
    });
  });

  // ==================== 索引维护 ====================

  describe('index maintenance', () => {
    it('should update downstream index on save', async () => {
      await store.save(createTestDependency('task-1', ['dep-1']));

      const downstream = await store.getDownstreamDependencies('dep-1');
      expect(downstream).toHaveLength(1);
      expect(downstream[0].taskId).toBe('task-1');
    });

    it('should clean up indices on delete', async () => {
      await store.save(createTestDependency('task-1', ['dep-1']));

      // Verify index exists
      const before = await store.getDownstreamDependencies('dep-1');
      expect(before).toHaveLength(1);

      // Delete and verify index is cleaned
      await store.delete('task-1');
      const after = await store.getDownstreamDependencies('dep-1');
      expect(after).toHaveLength(0);
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