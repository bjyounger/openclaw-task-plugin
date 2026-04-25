/**
 * ErrorHandler 单元测试
 */

import { ErrorHandler } from '../../src/core/workflow/error-handler';
import type { WorkflowNode, NodeOutput } from '../../src/core/workflow/types';
import type { IExecutionContext } from '../../src/core/workflow/execution-context';

// Mock 执行上下文
const mockContext: Partial<IExecutionContext> = {
  executionId: 'test-execution-001',
  workflowId: 'test-workflow-001',
  getNodeOutput: jest.fn(),
  setNodeOutput: jest.fn(),
};

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
    jest.clearAllMocks();
  });

  // ==================== Abort 策略测试 ====================

  describe('abort strategy', () => {
    it('should return abort action for abort strategy', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'abort',
        },
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('abort');
    });

    it('should use abort as default strategy', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('abort');
    });

    it('should log abort decision', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'abort',
        },
      };

      const error = new Error('Test error');
      handler.handle(error, node, mockContext as IExecutionContext);

      const log = handler.getErrorLog();
      expect(log).toHaveLength(1);
      expect(log[0].nodeId).toBe('node-1');
      expect(log[0].strategy).toBe('abort');
      expect(log[0].action).toBe('abort');
    });
  });

  // ==================== Skip 策略测试 ====================

  describe('skip strategy', () => {
    it('should return skip action with error output', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'skip',
        },
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('skip');
      if (action.action === 'skip') {
        expect(action.output.status).toBe('failure');
        expect(action.output.error?.code).toBe('NODE_ERROR_SKIPPED');
        expect(action.output.error?.message).toBe('Test error');
      }
    });

    it('should log skip decision', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'skip',
        },
      };

      const error = new Error('Test error');
      handler.handle(error, node, mockContext as IExecutionContext);

      const log = handler.getErrorLog();
      expect(log).toHaveLength(1);
      expect(log[0].strategy).toBe('skip');
      expect(log[0].action).toBe('skip');
    });
  });

  // ==================== Fallback 策略测试 ====================

  describe('fallback strategy', () => {
    it('should return fallback action with previous output', () => {
      const previousOutput: NodeOutput = {
        nodeId: 'node-1',
        executionId: 'test-execution-001',
        data: { result: 'previous-value' },
        status: 'success',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
        duration: 1000,
      };

      mockContext.getNodeOutput = jest.fn(() => previousOutput);

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'fallback',
        },
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('fallback');
      if (action.action === 'fallback') {
        expect(action.output.status).toBe('success');
        expect(action.output.data).toEqual({ result: 'previous-value' });
        expect(action.output.metadata?.fallback).toBe(true);
      }
    });

    it('should fallback to skip when no previous output', () => {
      mockContext.getNodeOutput = jest.fn(() => undefined);

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'fallback',
        },
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      // 没有上一次成功输出，应该退化为 skip
      expect(action.action).toBe('skip');
      if (action.action === 'skip') {
        expect(action.output.error?.code).toBe('NODE_ERROR_FALLBACK_NO_HISTORY');
      }
    });

    it('should fallback to skip when previous output is failure', () => {
      const previousOutput: NodeOutput = {
        nodeId: 'node-1',
        executionId: 'test-execution-001',
        data: {},
        status: 'failure',
        error: {
          code: 'PREVIOUS_ERROR',
          message: 'Previous failed',
          retryable: false,
        },
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
        duration: 1000,
      };

      mockContext.getNodeOutput = jest.fn(() => previousOutput);

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'fallback',
        },
      };

      const error = new Error('Test error');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('skip');
    });

    it('should log fallback decision', () => {
      const previousOutput: NodeOutput = {
        nodeId: 'node-1',
        executionId: 'test-execution-001',
        data: { result: 'value' },
        status: 'success',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
        duration: 1000,
      };

      mockContext.getNodeOutput = jest.fn(() => previousOutput);

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'fallback',
        },
      };

      const error = new Error('Test error');
      handler.handle(error, node, mockContext as IExecutionContext);

      const log = handler.getErrorLog();
      expect(log).toHaveLength(1);
      expect(log[0].strategy).toBe('fallback');
      expect(log[0].action).toBe('fallback');
    });
  });

  // ==================== Retry 策略测试 ====================

  describe('retry strategy', () => {
    it('should return abort when retry exhausted', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'retry',
          maxRetries: 3,
        },
      };

      const error = new Error('Test error after retries');
      const action = handler.handle(error, node, mockContext as IExecutionContext);

      // retry 策略在 RetryManager 中处理，耗尽后走 abort
      expect(action.action).toBe('abort');
    });
  });

  // ==================== 日志功能测试 ====================

  describe('error log', () => {
    it('should accumulate error logs across multiple calls', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'skip',
        },
      };

      handler.handle(new Error('Error 1'), node, mockContext as IExecutionContext);
      handler.handle(new Error('Error 2'), node, mockContext as IExecutionContext);
      handler.handle(new Error('Error 3'), node, mockContext as IExecutionContext);

      const log = handler.getErrorLog();
      expect(log).toHaveLength(3);
    });

    it('should clear error log', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
        onError: {
          strategy: 'skip',
        },
      };

      handler.handle(new Error('Error'), node, mockContext as IExecutionContext);

      expect(handler.getErrorLog()).toHaveLength(1);

      handler.clearErrorLog();

      expect(handler.getErrorLog()).toHaveLength(0);
    });

    it('should include node name in log', () => {
      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'My Test Node',
        config: {},
        onError: {
          strategy: 'abort',
        },
      };

      const error = new Error('Test error');
      handler.handle(error, node, mockContext as IExecutionContext);

      const log = handler.getErrorLog();
      expect(log[0].nodeName).toBe('My Test Node');
    });
  });

  // ==================== 自定义默认策略测试 ====================

  describe('custom default strategy', () => {
    it('should use custom default strategy', () => {
      const customHandler = new ErrorHandler('skip');

      const node: WorkflowNode = {
        id: 'node-1',
        type: 'task',
        name: 'Test Node',
        config: {},
      };

      const error = new Error('Test error');
      const action = customHandler.handle(error, node, mockContext as IExecutionContext);

      expect(action.action).toBe('skip');
    });
  });
});