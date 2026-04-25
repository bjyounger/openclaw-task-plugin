/**
 * RetryManager 单元测试
 */

import { RetryManager } from '../../src/core/workflow/retry-manager';
import type { WorkflowNode, NodeOutput } from '../../src/core/workflow/types';
import type { NodeExecutionInput, INodeContext } from '../../src/core/workflow/node-registry';

// Mock 节点上下文
const mockNodeContext: Partial<INodeContext> = {
  nodeId: 'node-1',
  executionId: 'test-execution-001',
  workflowId: 'test-workflow-001',
  getConfig: jest.fn(() => ({})),
  getInput: jest.fn(() => ({ data: {} })),
  getPreviousOutput: jest.fn(),
  log: jest.fn(),
  emit: jest.fn(),
};

// Helper: 创建成功输出
function createSuccessOutput(nodeId: string, data: Record<string, any> = {}): NodeOutput {
  return {
    nodeId,
    executionId: mockNodeContext.executionId!,
    data,
    status: 'success' as const,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
}

// Helper: 创建失败输出
function createFailureOutput(nodeId: string, message: string): NodeOutput {
  return {
    nodeId,
    executionId: mockNodeContext.executionId!,
    data: {},
    status: 'failure' as const,
    error: {
      code: 'TEST_ERROR',
      message,
      retryable: true,
    },
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
}

describe('RetryManager', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager();
    jest.clearAllMocks();
  });

  // ==================== 基本重试测试 ====================

  describe('executeWithRetry', () => {
    it('should execute without retry when retry is disabled', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
      };

      const handler = jest.fn(async () => createSuccessOutput('node-1', { result: 'success' }));

      const input: NodeExecutionInput = {
        data: {},
      };

      const output = await manager.executeWithRetry(
        node,
        handler,
        input,
        mockNodeContext as INodeContext
      );

      expect(output.status).toBe('success');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'fixed',
          initialDelay: 10, // 短延迟用于测试
        },
      };

      let attemptCount = 0;

      const handler = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return createSuccessOutput('node-1', { result: 'success' });
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const output = await manager.executeWithRetry(
        node,
        handler,
        input,
        mockNodeContext as INodeContext
      );

      expect(output.status).toBe('success');
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 2,
          backoff: 'fixed',
          initialDelay: 10,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Permanent failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const output = await manager.executeWithRetry(
        node,
        handler,
        input,
        mockNodeContext as INodeContext
      );

      expect(output.status).toBe('failure');
      expect(output.error?.code).toBe('NODE_EXECUTION_ERROR_AFTER_RETRIES');
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== 退避策略测试 ====================

  describe('backoff strategies', () => {
    it('should use fixed backoff', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 2,
          backoff: 'fixed',
          initialDelay: 50,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const startTime = Date.now();
      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);
      const duration = Date.now() - startTime;

      // 固定退避：2 次尝试，1 次重试，延迟约 50ms
      expect(handler).toHaveBeenCalledTimes(2);
      expect(duration).toBeGreaterThanOrEqual(40); // 允许一些偏差
    });

    it('should use linear backoff', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
          initialDelay: 20,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const startTime = Date.now();
      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);
      const duration = Date.now() - startTime;

      // 线性退避：3 次尝试，2 次重试
      // 延迟：attempt 1: 20*1=20, attempt 2: 20*2=40, total ≈ 60ms
      expect(handler).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThanOrEqual(50);
    });

    it('should use exponential backoff', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 10,
          multiplier: 2,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const startTime = Date.now();
      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);
      const duration = Date.now() - startTime;

      // 指数退避：3 次尝试，2 次重试
      // 延迟：attempt 1: 10*2^0=10, attempt 2: 10*2^1=20, total ≈ 30ms
      expect(handler).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThanOrEqual(25);
    });

    it('should respect maxDelay in exponential backoff', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 100,
          multiplier: 10,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const startTime = Date.now();
      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);
      const duration = Date.now() - startTime;

      // 即使指数计算出的延迟很大，也应该受 maxDelay 限制
      // 2 次重试，每次最大 100ms
      expect(duration).toBeLessThan(300);
    });
  });

  // ==================== 重试记录测试 ====================

  describe('retry records', () => {
    it('should record retry attempts', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'fixed',
          initialDelay: 10,
        },
      };

      let attemptCount = 0;

      const handler = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return createSuccessOutput('node-1');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);

      const records = manager.getRetryRecords('node-1');
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].nodeId).toBe('node-1');
      expect(records[0].error.message).toBe('Temporary failure');
    });

    it('should return empty array for node without retries', () => {
      const records = manager.getRetryRecords('unknown-node');
      expect(records).toEqual([]);
    });

    it('should get all retry records', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 2,
          backoff: 'fixed',
          initialDelay: 10,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);

      const allRecords = manager.getAllRetryRecords();
      expect(allRecords.has('node-1')).toBe(true);
    });

    it('should clear retry records', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 2,
          backoff: 'fixed',
          initialDelay: 10,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);

      expect(manager.getRetryRecords('node-1')).toHaveLength(1);

      manager.clearRetryRecords();

      expect(manager.getRetryRecords('node-1')).toHaveLength(0);
    });
  });

  // ==================== onError 配置测试 ====================

  describe('onError configuration', () => {
    it('should use onError.retry configuration', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'retry',
          maxRetries: 2,
        },
      };

      let attemptCount = 0;

      const handler = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return createSuccessOutput('node-1');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      const output = await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);

      expect(output.status).toBe('success');
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  // ==================== 成功输出测试 ====================

  describe('successful execution', () => {
    it('should return immediately on success', async () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        retry: {
          maxAttempts: 3,
          backoff: 'fixed',
          initialDelay: 1000,
        },
      };

      const handler = jest.fn(async () =>
        createSuccessOutput('node-1', { result: 'immediate-success' })
      );

      const input: NodeExecutionInput = {
        data: {},
      };

      const startTime = Date.now();
      const output = await manager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);
      const duration = Date.now() - startTime;

      expect(output.status).toBe('success');
      expect(output.data.result).toBe('immediate-success');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(duration).toBeLessThan(100); // 没有延迟
    });
  });

  // ==================== 自定义默认配置测试 ====================

  describe('custom default config', () => {
    it('should use custom default config', async () => {
      const customManager = new RetryManager({
        enabled: true,
        maxAttempts: 5,
        backoff: 'linear',
        initialDelay: 10,
      });

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        // 使用 retry 配置覆盖默认
        retry: {
          maxAttempts: 2,
          backoff: 'fixed',
          initialDelay: 10,
        },
      };

      const handler = jest.fn(async () => {
        throw new Error('Failure');
      });

      const input: NodeExecutionInput = {
        data: {},
      };

      await customManager.executeWithRetry(node, handler, input, mockNodeContext as INodeContext);

      // 应该优先使用节点的 retry 配置
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
