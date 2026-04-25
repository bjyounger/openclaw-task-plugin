/**
 * ConditionalExecutor 单元测试
 */

import { ConditionalExecutor } from '../../src/core/workflow/conditional-executor';
import type {
  WorkflowNode,
  WorkflowConnection,
  ConditionExpression,
  NodeOutput,
} from '../../src/core/workflow/types';
import type { NodeExecutionInput } from '../../src/core/workflow/node-registry';
import type { IExecutionContext } from '../../src/core/workflow/execution-context';

// Mock 执行上下文
const mockContext: Partial<IExecutionContext> = {
  executionId: 'test-execution-001',
  workflowId: 'test-workflow-001',
  getNodeOutput: jest.fn(),
  setNodeOutput: jest.fn(),
  getInput: jest.fn(() => ({})),
};

// Helper: 创建成功输出
function createSuccessOutput(nodeId: string, data: Record<string, any> = {}): NodeOutput {
  return {
    nodeId,
    executionId: mockContext.executionId!,
    data,
    status: 'success' as const,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 0,
  };
}

describe('ConditionalExecutor', () => {
  let executor: ConditionalExecutor;

  beforeEach(() => {
    executor = new ConditionalExecutor();
  });

  // ==================== 条件评估测试 ====================

  describe('evaluateCondition', () => {
    it('should evaluate simple condition with eq operator', () => {
      const expression: ConditionExpression = {
        type: 'simple',
        expression: JSON.stringify({ field: 'status', operator: 'eq', value: 'success' }),
      };

      const input: NodeExecutionInput = {
        data: { status: 'success' },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should evaluate simple condition with ne operator', () => {
      const expression: ConditionExpression = {
        type: 'simple',
        expression: JSON.stringify({ field: 'count', operator: 'ne', value: 0 }),
      };

      const input: NodeExecutionInput = {
        data: { count: 5 },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should evaluate simple condition with gt operator', () => {
      const expression: ConditionExpression = {
        type: 'simple',
        expression: JSON.stringify({ field: 'age', operator: 'gt', value: 18 }),
      };

      const input: NodeExecutionInput = {
        data: { age: 25 },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should evaluate simple condition with contains operator', () => {
      const expression: ConditionExpression = {
        type: 'simple',
        expression: JSON.stringify({ field: 'message', operator: 'contains', value: 'hello' }),
      };

      const input: NodeExecutionInput = {
        data: { message: 'hello world' },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should evaluate JavaScript expression', () => {
      const expression: ConditionExpression = {
        type: 'javascript',
        expression: '$input.status === "success"',
      };

      const input: NodeExecutionInput = {
        data: { status: 'success' },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should evaluate nested field access', () => {
      const expression: ConditionExpression = {
        type: 'simple',
        expression: JSON.stringify({ field: 'user.age', operator: 'gte', value: 18 }),
      };

      const input: NodeExecutionInput = {
        data: { user: { age: 20 } },
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(true);
    });

    it('should return false for invalid condition type', () => {
      const expression: ConditionExpression = {
        type: 'invalid' as any,
        expression: 'test',
      };

      const input: NodeExecutionInput = {
        data: {},
      };

      const result = executor.evaluateCondition(expression, input);
      expect(result).toBe(false);
    });
  });

  // ==================== 分支执行测试 ====================

  describe('executeBranch', () => {
    it('should execute branch based on true condition', async () => {
      const conditionNode: WorkflowNode = {
        id: 'condition-1',
        type: 'condition',
        name: 'Test Condition',
        condition: {
          type: 'simple',
          expression: JSON.stringify({ field: 'value', operator: 'gt', value: 10 }),
        },
        config: {},
      };

      const connections: WorkflowConnection[] = [
        {
          id: 'conn-1',
          source: 'condition-1',
          target: 'node-true',
          condition: { type: 'on_success' },
        },
        {
          id: 'conn-2',
          source: 'condition-1',
          target: 'node-false',
          condition: { type: 'on_failure' },
        },
      ];

      const input: NodeExecutionInput = {
        data: { value: 15 },
      };

      const mockNodeExecutor = jest.fn(async (nodeId): Promise<NodeOutput> =>
        createSuccessOutput(nodeId, { executed: true })
      );

      const output = await executor.executeBranch(
        conditionNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      expect(output.status).toBe('success');
      expect(output.data.conditionResult).toBe(true);
      expect(output.data.branch).toBe('node-true');
      expect(mockNodeExecutor).toHaveBeenCalledWith('node-true', input, mockContext);
    });

    it('should execute branch based on false condition', async () => {
      const conditionNode: WorkflowNode = {
        id: 'condition-1',
        type: 'condition',
        name: 'Test Condition',
        condition: {
          type: 'simple',
          expression: JSON.stringify({ field: 'value', operator: 'gt', value: 10 }),
        },
        config: {},
      };

      const connections: WorkflowConnection[] = [
        {
          id: 'conn-1',
          source: 'condition-1',
          target: 'node-true',
          condition: { type: 'on_success' },
        },
        {
          id: 'conn-2',
          source: 'condition-1',
          target: 'node-false',
          condition: { type: 'on_failure' },
        },
      ];

      const input: NodeExecutionInput = {
        data: { value: 5 },
      };

      const mockNodeExecutor = jest.fn(async (nodeId): Promise<NodeOutput> =>
        createSuccessOutput(nodeId, { executed: true })
      );

      const output = await executor.executeBranch(
        conditionNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      expect(output.status).toBe('success');
      expect(output.data.conditionResult).toBe(false);
      expect(output.data.branch).toBe('node-false');
      expect(mockNodeExecutor).toHaveBeenCalledWith('node-false', input, mockContext);
    });

    it('should handle missing condition', async () => {
      const conditionNode: WorkflowNode = {
        id: 'condition-1',
        type: 'condition',
        name: 'Test Condition',
        config: {},
      };

      const connections: WorkflowConnection[] = [];

      const input: NodeExecutionInput = {
        data: {},
      };

      const output = await executor.executeBranch(
        conditionNode,
        connections,
        input,
        mockContext as IExecutionContext
      );

      expect(output.status).toBe('failure');
      expect(output.error?.code).toBe('BRANCH_EXECUTION_ERROR');
    });
  });

  // ==================== 循环执行测试 ====================

  describe('executeLoop', () => {
    it('should execute loop with array items', async () => {
      const loopNode: WorkflowNode = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        config: {
          itemVariable: 'item',
          indexVariable: 'index',
        },
      };

      const connections: WorkflowConnection[] = [
        {
          id: 'conn-1',
          source: 'loop-1',
          target: 'body-node',
          condition: { type: 'always' },
        },
      ];

      const input: NodeExecutionInput = {
        data: {
          items: [1, 2, 3],
        },
      };

      const mockNodeExecutor = jest.fn(async (nodeId, iterInput): Promise<NodeOutput> =>
        createSuccessOutput(nodeId, { result: iterInput.data.item * 2 })
      );

      const output = await executor.executeLoop(
        loopNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      expect(output.status).toBe('success');
      expect(output.data.iterationCount).toBe(3);
      expect(output.data.results).toHaveLength(3);
      expect(mockNodeExecutor).toHaveBeenCalledTimes(3);
    });

    it('should respect maxIterations limit', async () => {
      const loopNode: WorkflowNode = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        config: {
          maxIterations: 2,
        },
      };

      const connections: WorkflowConnection[] = [];

      const input: NodeExecutionInput = {
        data: {
          items: [1, 2, 3, 4, 5],
        },
      };

      const mockNodeExecutor = jest.fn(async (nodeId): Promise<NodeOutput> =>
        createSuccessOutput(nodeId)
      );

      const output = await executor.executeLoop(
        loopNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      expect(output.status).toBe('success');
      expect(output.data.iterationCount).toBe(2);
    });

    it('should check loop condition on each iteration', async () => {
      const loopNode: WorkflowNode = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        config: {
          maxIterations: 10,
          condition: {
            type: 'simple',
            expression: JSON.stringify({ field: 'iteration', operator: 'lt', value: 3 }),
          },
        },
      };

      const connections: WorkflowConnection[] = [];

      const input: NodeExecutionInput = {
        data: {
          items: [1, 2, 3, 4, 5],
        },
      };

      const mockNodeExecutor = jest.fn(async (nodeId, iterInput): Promise<NodeOutput> =>
        createSuccessOutput(nodeId, { iteration: iterInput.data.index })
      );

      const output = await executor.executeLoop(
        loopNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      // 应该在第 3 次迭代后停止
      expect(output.data.iterationCount).toBeLessThanOrEqual(3);
    });

    it('should handle empty items array', async () => {
      const loopNode: WorkflowNode = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        config: {},
      };

      const connections: WorkflowConnection[] = [];

      const input: NodeExecutionInput = {
        data: {
          items: [],
        },
      };

      const mockNodeExecutor = jest.fn(async (nodeId): Promise<NodeOutput> =>
        createSuccessOutput(nodeId)
      );

      const output = await executor.executeLoop(
        loopNode,
        connections,
        input,
        mockContext as IExecutionContext,
        mockNodeExecutor
      );

      expect(output.status).toBe('success');
      expect(output.data.iterationCount).toBe(0);
      expect(mockNodeExecutor).not.toHaveBeenCalled();
    });
  });
});
