/**
 * DependencyManager 性能基准测试
 *
 * 测试各项性能指标是否符合要求：
 * - 依赖注册 < 5ms
 * - 状态查询 < 2ms
 * - 循环检测 (100节点) < 10ms
 * - 就绪检查 < 1ms
 */

import {
  DependencyManager,
  DependencyResolver,
} from '../../src/core/dependency-manager/dependency-manager';
import {
  TaskDependency,
  DependencyState,
  DependencyItemDetail,
} from '../../src/core/dependency-manager/types';
import { InMemoryDependencyStore } from '../../src/core/dependency-manager/dependency-store';

// ==================== 性能测试工具 ====================

/**
 * 测量函数执行时间
 */
async function measureTime(
  fn: () => Promise<void> | void,
  iterations: number = 1
): Promise<{ avg: number; min: number; max: number; total: number }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1_000_000; // 纳秒转毫秒
    times.push(timeMs);
  }

  return {
    avg: times.reduce((sum, t) => sum + t, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    total: times.reduce((sum, t) => sum + t, 0),
  };
}

/**
 * 创建测试依赖定义
 */
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

/**
 * 创建测试依赖状态
 */
function createTestState(
  taskId: string,
  dependsOn: string[]
): DependencyState {
  const details = new Map<string, DependencyItemDetail>();
  const statusMap = new Map<string, 'pending' | 'satisfied' | 'failed' | 'timeout'>();

  for (const depId of dependsOn) {
    details.set(depId, {
      dependsOnTaskId: depId,
      status: 'pending',
    });
    statusMap.set(depId, 'pending');
  }

  return {
    taskId,
    dependencyDetails: details,
    dependencyStatus: statusMap,
    ready: false,
    blockedBy: dependsOn.length > 0 ? [...dependsOn] : undefined,
  };
}

// ==================== 性能基准测试 ====================

describe('DependencyManager Performance Benchmarks', () => {
  let manager: DependencyManager;
  let store: InMemoryDependencyStore;

  beforeEach(() => {
    store = new InMemoryDependencyStore();
    manager = new DependencyManager(store);
  });

  afterEach(async () => {
    await manager.destroy();
  });

  // ==================== 指标 1: 依赖注册 < 5ms ====================

  describe('Benchmark 1: Dependency registration < 5ms', () => {
    it('should register a single dependency in < 5ms', async () => {
      const dep = createTestDependency('task-1', ['dep-1']);

      const result = await measureTime(async () => {
        await manager.register(dep);
      });

      console.log(`Registration time: avg=${result?.avg?.toFixed(3)}ms, min=${result.min.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(5);
    });

    it('should register dependency with 5 dependencies in < 5ms', async () => {
      const dep = createTestDependency('task-1', ['dep-1', 'dep-2', 'dep-3', 'dep-4', 'dep-5']);

      const result = await measureTime(async () => {
        await manager.register(dep);
      });

      console.log(`Registration (5 deps) time: avg=${result?.avg?.toFixed(3)}ms, min=${result.min.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(5);
    });

    it('should register dependency with 10 dependencies in < 5ms', async () => {
      const deps = Array.from({ length: 10 }, (_, i) => `dep-${i + 1}`);
      const dep = createTestDependency('task-1', deps);

      const result = await measureTime(async () => {
        await manager.register(dep);
      });

      console.log(`Registration (10 deps) time: avg=${result?.avg?.toFixed(3)}ms, min=${result.min.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(5);
    });

    it('should maintain performance with 100 registered dependencies', async () => {
      // 预注册 100 个依赖
      for (let i = 0; i < 100; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`dep-${i}`]));
      }

      // 测试新注册性能
      const dep = createTestDependency('new-task', ['new-dep']);
      const result = await measureTime(async () => {
        await manager.register(dep);
      });

      console.log(`Registration (with 100 existing) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(5);
    });
  });

  // ==================== 指标 2: 状态查询 < 2ms ====================

  describe('Benchmark 2: State query < 2ms', () => {
    beforeEach(async () => {
      // 注册一些依赖
      for (let i = 0; i < 50; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`dep-${i}`]));
      }
    });

    it('should get dependency state in < 2ms', async () => {
      const result = await measureTime(async () => {
        await manager.getDependencyState('task-0');
      });

      console.log(`State query time: avg=${result?.avg?.toFixed(3)}ms, min=${result.min.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(2);
    });

    it('should check if task is ready in < 2ms', async () => {
      const result = await measureTime(async () => {
        await manager.isReady('task-0');
      });

      console.log(`Ready check time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(2);
    });

    it('should get blocked tasks in < 2ms', async () => {
      const result = await measureTime(async () => {
        await manager.getBlockedTasks();
      });

      console.log(`Blocked tasks query time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(2);
    });

    it('should get dependency graph in < 2ms', async () => {
      const result = await measureTime(async () => {
        await manager.getDependencyGraph();
      });

      console.log(`Graph query time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(2);
    });
  });

  // ==================== 指标 3: 循环检测 (100节点) < 10ms ====================

  describe('Benchmark 3: Cycle detection (100 nodes) < 10ms', () => {
    it('should detect no cycle in 100-node linear chain in < 10ms', async () => {
      // 创建线性依赖链：task-0 -> task-1 -> task-2 -> ... -> task-99
      for (let i = 1; i < 100; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`task-${i - 1}`]));
      }

      // 添加新节点到链尾
      const result = await measureTime(async () => {
        await manager.register(createTestDependency('task-100', ['task-99']));
      });

      console.log(`Cycle detection (100 nodes, no cycle) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(10);
    });

    it('should detect cycle in 100-node circular chain in < 10ms', async () => {
      // 创建依赖链：task-1 -> task-2 -> ... -> task-99
      for (let i = 1; i < 100; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`task-${i - 1}`]));
      }

      // 尝试创建循环：task-0 -> task-99
      let cycleDetected = false;
      let measureResult = { avg: 0, min: 0, max: 0, total: 0 };

      measureResult = await measureTime(async () => {
        try {
          await manager.register(createTestDependency('task-0', ['task-99']));
        } catch (error) {
          if (error instanceof Error && error.name === 'CycleDetectedError') {
            cycleDetected = true;
          }
        }
      });

      console.log(`Cycle detection (100 nodes, with cycle) time: avg=${measureResult.avg.toFixed(3)}ms`);

      expect(cycleDetected).toBe(true);
      expect(measureResult.avg).toBeLessThan(10);
    });

    it('should detect cycle in diamond dependency graph (50 nodes) in < 10ms', async () => {
      // 创建菱形依赖图
      //       task-0
      //      /      \
      //   task-1   task-2
      //      \      /
      //       task-3
      //          |
      //        ...

      await manager.register(createTestDependency('task-0', []));
      await manager.register(createTestDependency('task-1', ['task-0']));
      await manager.register(createTestDependency('task-2', ['task-0']));
      await manager.register(createTestDependency('task-3', ['task-1', 'task-2']));

      // 扩展到 50 个节点
      for (let i = 4; i < 50; i++) {
        const deps = i % 2 === 0 ? [`task-${i - 2}`] : [`task-${i - 1}`, `task-${i - 3}`];
        await manager.register(createTestDependency(`task-${i}`, deps));
      }

      // 尝试创建循环
      let cycleDetected = false;
      const result = await measureTime(async () => {
        try {
          await manager.register(createTestDependency('task-0', ['task-49']));
        } catch (error) {
          if (error instanceof Error && error.name === 'CycleDetectedError') {
            cycleDetected = true;
          }
        }
      });

      console.log(`Cycle detection (50 nodes, diamond) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(cycleDetected).toBe(true);
      expect(result?.avg).toBeLessThan(10);
    });
  });

  // ==================== 指标 4: 就绪检查 < 1ms ====================

  describe('Benchmark 4: Ready check < 1ms', () => {
    let resolver: DependencyResolver;

    beforeEach(() => {
      resolver = new DependencyResolver();
    });

    it('should check readiness with 5 dependencies in < 1ms', async () => {
      const state = createTestState('task-1', ['dep-1', 'dep-2', 'dep-3', 'dep-4', 'dep-5']);
      const dep = createTestDependency('task-1', ['dep-1', 'dep-2', 'dep-3', 'dep-4', 'dep-5']);

      const result = await measureTime(() => {
        resolver.resolve(state, dep);
      });

      console.log(`Ready check (5 deps) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(1);
    });

    it('should check readiness with 10 dependencies in < 1ms', async () => {
      const deps = Array.from({ length: 10 }, (_, i) => `dep-${i + 1}`);
      const state = createTestState('task-1', deps);
      const dep = createTestDependency('task-1', deps);

      const result = await measureTime(() => {
        resolver.resolve(state, dep);
      });

      console.log(`Ready check (10 deps) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(1);
    });

    it('should check readiness with 50 dependencies in < 1ms', async () => {
      const deps = Array.from({ length: 50 }, (_, i) => `dep-${i + 1}`);
      const state = createTestState('task-1', deps);
      const dep = createTestDependency('task-1', deps);

      const result = await measureTime(() => {
        resolver.resolve(state, dep);
      });

      console.log(`Ready check (50 deps) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(1);
    });

    it('should check readiness with all satisfied dependencies in < 1ms', async () => {
      const deps = Array.from({ length: 20 }, (_, i) => `dep-${i + 1}`);
      const state = createTestState('task-1', deps);

      // 标记所有依赖为已满足
      for (const depId of deps) {
        state.dependencyDetails.get(depId)!.status = 'satisfied';
        state.dependencyStatus.set(depId, 'satisfied');
      }

      const dep = createTestDependency('task-1', deps);

      const result = await measureTime(() => {
        resolver.resolve(state, dep);
      });

      console.log(`Ready check (20 deps, all satisfied) time: avg=${result?.avg?.toFixed(3)}ms`);

      expect(result?.avg).toBeLessThan(1);
    });
  });

  // ==================== 综合性能测试 ====================

  describe('Comprehensive performance test', () => {
    it('should handle 1000 registrations efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`dep-${i}`]));
      }

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 1000;

      console.log(`1000 registrations total time: ${totalTime}ms, avg: ${avgTime.toFixed(3)}ms`);

      // 平均时间应小于 5ms
      expect(avgTime).toBeLessThan(5);
    });

    it('should handle concurrent state updates efficiently', async () => {
      // 注册 100 个依赖
      for (let i = 0; i < 100; i++) {
        await manager.register(createTestDependency(`task-${i}`, [`dep-${i}`]));
      }

      // 并发更新 100 个状态
      const startTime = Date.now();

      const updates = [];
      for (let i = 0; i < 100; i++) {
        updates.push(
          manager.updateDependencyStatus(`task-${i}`, `dep-${i}`, 'satisfied')
        );
      }
      await Promise.all(updates);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 100;

      console.log(`100 concurrent updates total time: ${totalTime}ms, avg: ${avgTime.toFixed(3)}ms`);

      // 平均时间应小于 2ms
      expect(avgTime).toBeLessThan(2);
    });
  });
});
