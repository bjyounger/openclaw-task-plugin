/**
 * ExecutionContext 单元测试
 */

import { ExecutionContext, type ExecutionContextConfig } from '../../src/core/workflow/execution-context';
import type { NodeOutput, WorkflowState } from '../../src/core/workflow/types';

describe('ExecutionContext', () => {
  let context: ExecutionContext;
  let events: Array<{ event: string; data: any }>;
  let logs: Array<{ level: string; message: string; data?: any }>;

  const createConfig = (overrides?: Partial<ExecutionContextConfig>): ExecutionContextConfig => ({
    executionId: 'test-exec-001',
    workflowId: 'test-wf-001',
    input: { initialData: 'test' },
    variables: { var1: 'value1' },
    eventListener: (event, data) => events.push({ event, data }),
    logger: (level, message, data) => logs.push({ level, message, data }),
    ...overrides,
  });

  const createNodeOutput = (nodeId: string, overrides?: Partial<NodeOutput>): NodeOutput => ({
    nodeId,
    executionId: 'test-exec-001',
    data: { result: 'success' },
    status: 'success',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 10,
    ...overrides,
  });

  beforeEach(() => {
    events = [];
    logs = [];
    context = new ExecutionContext(createConfig());
  });

  describe('构造函数', () => {
    it('应该正确初始化执行上下文', () => {
      expect(context.executionId).toBe('test-exec-001');
      expect(context.workflowId).toBe('test-wf-001');
    });

    it('应该初始化状态为 pending', () => {
      const state = context.getState();
      expect(state.status).toBe('pending');
      expect(state.completedNodes).toEqual([]);
      expect(state.failedNodes).toEqual([]);
    });

    it('应该正确存储输入数据', () => {
      const input = context.getInput();
      expect(input).toEqual({ initialData: 'test' });
    });
  });

  describe('getState', () => {
    it('应该返回当前执行状态', () => {
      const state = context.getState();
      expect(state).toHaveProperty('executionId');
      expect(state).toHaveProperty('workflowId');
      expect(state).toHaveProperty('status');
    });

    it('状态应该是可序列化的', () => {
      const state = context.getState();
      expect(() => JSON.stringify(state)).not.toThrow();
    });
  });

  describe('emit', () => {
    it('应该发送事件到监听器', () => {
      context.emit('test:event', { data: 'test' });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        event: 'test:event',
        data: { data: 'test' },
      });
    });

    it('没有事件监听器时不应该报错', () => {
      const ctx = new ExecutionContext(createConfig({ eventListener: undefined }));
      expect(() => ctx.emit('test:event', {})).not.toThrow();
    });
  });

  describe('getNodeOutput / setNodeOutput', () => {
    it('应该正确存储和获取节点输出', () => {
      const output = createNodeOutput('node-1');
      context.setNodeOutput('node-1', output);
      expect(context.getNodeOutput('node-1')).toEqual(output);
    });

    it('未设置的节点应该返回 undefined', () => {
      expect(context.getNodeOutput('unknown-node')).toBeUndefined();
    });

    it('成功输出应该加入已完成节点列表', () => {
      const output = createNodeOutput('node-1', { status: 'success' });
      context.setNodeOutput('node-1', output);
      const state = context.getState();
      expect(state.completedNodes).toContain('node-1');
    });

    it('失败输出应该加入失败节点列表', () => {
      const output = createNodeOutput('node-2', { status: 'failure' });
      context.setNodeOutput('node-2', output);
      const state = context.getState();
      expect(state.failedNodes).toContain('node-2');
    });
  });

  describe('updateState', () => {
    it('应该更新执行状态', () => {
      context.updateState('running', 'node-1');
      const state = context.getState();
      expect(state.status).toBe('running');
      expect(state.currentNodeId).toBe('node-1');
    });

    it('完成状态应该设置完成时间', () => {
      context.updateState('completed');
      const state = context.getState();
      expect(state.completedAt).toBeDefined();
    });
  });

  describe('createNodeContext', () => {
    it('应该创建节点上下文', () => {
      const nodeContext = context.createNodeContext(
        'node-1',
        { data: [{ input: 'test' }] }
      );

      expect(nodeContext.nodeId).toBe('node-1');
      expect(nodeContext.executionId).toBe('test-exec-001');
      expect(nodeContext.workflowId).toBe('test-wf-001');
    });

    it('节点上下文应该能获取输入', () => {
      const nodeContext = context.createNodeContext(
        'node-1',
        { data: [{ input: 'test' }] }
      );

      const input = nodeContext.getInput();
      expect(input.data).toEqual([{ input: 'test' }]);
    });

    it('节点上下文应该能获取配置', () => {
      const nodeContext = context.createNodeContext(
        'node-1',
        { data: [] },
        { customConfig: 'value' }
      );

      const config = nodeContext.getConfig();
      expect(config.customConfig).toBe('value');
    });

    it('节点上下文应该能发送事件', () => {
      const nodeContext = context.createNodeContext('node-1', { data: [] });
      nodeContext.emit('node:custom', { info: 'test' });

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('node:custom');
    });

    it('节点上下文应该能记录日志', () => {
      const nodeContext = context.createNodeContext('node-1', { data: [] });
      nodeContext.log('info', 'Test log message');

      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Test log message');
    });
  });

  describe('isCancelled / cancel', () => {
    it('初始状态不应该被取消', () => {
      expect(context.isCancelled()).toBe(false);
    });

    it('取消后应该返回 true', () => {
      context.cancel('User requested');
      expect(context.isCancelled()).toBe(true);
    });

    it('取消应该触发事件', () => {
      context.cancel('User requested');
      expect(events.some(e => e.event === 'workflow:cancelled')).toBe(true);
    });

    it('应该能获取取消原因', () => {
      context.cancel('User requested');
      expect(context.getCancelReason()).toBe('User requested');
    });
  });

  describe('isTimeout', () => {
    it('未设置超时时应该返回 false', () => {
      expect(context.isTimeout()).toBe(false);
    });

    it('超时后应该返回 true', async () => {
      const ctx = new ExecutionContext(createConfig({ timeout: 50 }));
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(ctx.isTimeout()).toBe(true);
    });

    it('应该能获取剩余时间', () => {
      const remaining = context.getRemainingTime();
      expect(remaining).toBeGreaterThan(0);
    });
  });

  describe('serialize / deserialize', () => {
    it('应该正确序列化状态', () => {
      const state = context.serialize();
      expect(state.executionId).toBe('test-exec-001');
      expect(state.workflowId).toBe('test-wf-001');
      expect(state.serializedState).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });

    it('应该正确反序列化状态', () => {
      const serialized: WorkflowState = {
        executionId: 'test-exec-001',
        workflowId: 'test-wf-001',
        status: 'running',
        serializedState: {
          nodeStates: {
            'node-1': { status: 'success', output: { result: 'ok' } },
          },
          variables: { var1: 'value1' },
          checkpoint: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      context.deserialize(serialized);
      const currentState = context.getState();
      expect(currentState.status).toBe('running');
    });

    it('反序列化时 ID 不匹配应该报错', () => {
      const wrongState: WorkflowState = {
        executionId: 'wrong-id',
        workflowId: 'test-wf-001',
        status: 'running',
        serializedState: { nodeStates: {}, variables: {} },
        updatedAt: new Date().toISOString(),
      };

      expect(() => context.deserialize(wrongState)).toThrow('Execution ID mismatch');
    });
  });

  describe('变量管理', () => {
    it('应该能获取所有变量', () => {
      const vars = context.getVariables();
      expect(vars.var1).toBe('value1');
    });

    it('应该能获取单个变量', () => {
      expect(context.getVariable('var1')).toBe('value1');
    });

    it('应该能设置变量', () => {
      context.setVariable('var2', 'value2');
      expect(context.getVariable('var2')).toBe('value2');
    });

    it('应该能更新已有变量', () => {
      context.setVariable('var1', 'updated');
      expect(context.getVariable('var1')).toBe('updated');
    });

    it('设置变量应该触发事件', () => {
      context.setVariable('var2', 'value2');
      expect(events.some(e => e.event === 'variable:changed')).toBe(true);
    });
  });

  describe('元数据管理', () => {
    it('应该能设置和获取元数据', () => {
      context.setMetadata('key1', 'value1');
      expect(context.getMetadata('key1')).toBe('value1');
    });

    it('未设置的元数据应该返回 undefined', () => {
      expect(context.getMetadata('nonexistent')).toBeUndefined();
    });
  });

  describe('节点执行状态', () => {
    it('应该能更新节点执行状态', () => {
      context.updateNodeExecution('node-1', { status: 'running' });
      const execution = context.getNodeExecution('node-1');
      expect(execution).toBeDefined();
      expect(execution?.status).toBe('running');
    });

    it('未更新的节点应该返回 undefined', () => {
      expect(context.getNodeExecution('unknown-node')).toBeUndefined();
    });
  });
});
