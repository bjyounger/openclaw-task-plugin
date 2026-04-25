/**
 * NodeRegistry 单元测试
 */

import {
  NodeRegistry,
  getNodeRegistry,
  resetNodeRegistry,
  BUILT_IN_NODE_TYPES,
  NodeHandler,
  NodeFactory,
} from '../../src/core/workflow';
import { WorkflowNode, NodeOutput } from '../../src/core/workflow';

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    resetNodeRegistry();
    registry = new NodeRegistry();
  });

  describe('构造函数和内置节点', () => {
    it('应该自动注册4个内置节点类型', () => {
      expect(registry.size).toBe(4);
      expect(registry.has(BUILT_IN_NODE_TYPES.TASK)).toBe(true);
      expect(registry.has(BUILT_IN_NODE_TYPES.CONDITION)).toBe(true);
      expect(registry.has(BUILT_IN_NODE_TYPES.PARALLEL)).toBe(true);
      expect(registry.has(BUILT_IN_NODE_TYPES.SUBFLOW)).toBe(true);
    });

    it('应该能够列出所有内置节点', () => {
      const types = registry.list();
      expect(types.length).toBe(4);
      expect(types.map(t => t.type)).toEqual(
        expect.arrayContaining(['task', 'condition', 'parallel', 'subflow'])
      );
    });

    it('内置节点应该标记为 builtIn: true', () => {
      const taskInfo = registry.getInfo(BUILT_IN_NODE_TYPES.TASK);
      expect(taskInfo?.builtIn).toBe(true);
      expect(taskInfo?.displayName).toBe('Task');
    });
  });

  describe('register', () => {
    it('应该成功注册自定义节点类型', () => {
      const customHandler: NodeFactory = (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'success' as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
      });

      registry.register('custom-node', customHandler);

      expect(registry.has('custom-node')).toBe(true);
      expect(registry.size).toBe(5);
    });

    it('应该在重复注册时覆盖并发出警告', () => {
      const mockLogger = jest.fn();
      const registryWithLogger = new NodeRegistry(mockLogger);

      const handler1: NodeFactory = (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: { v: 1 },
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      });

      const handler2: NodeFactory = (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: { v: 2 },
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      });

      registryWithLogger.register('duplicate', handler1);
      registryWithLogger.register('duplicate', handler2);

      expect(mockLogger).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('already registered'),
        expect.any(Object)
      );
    });

    it('应该拒绝空类型标识', () => {
      const handler: NodeFactory = (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      });

      expect(() => registry.register('', handler)).toThrow('Node type cannot be empty');
      expect(() => registry.register('  ', handler)).toThrow('Node type cannot be empty');
    });

    it('应该拒绝非函数类型的工厂', () => {
      expect(() => registry.register('invalid', null as any)).toThrow('Node factory must be a function');
      expect(() => registry.register('invalid', 'not-a-function' as any)).toThrow('Node factory must be a function');
    });
  });

  describe('get', () => {
    it('应该返回已注册的节点工厂', () => {
      const factory = registry.get(BUILT_IN_NODE_TYPES.TASK);
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('对未注册类型应该返回 undefined', () => {
      const factory = registry.get('non-existent');
      expect(factory).toBeUndefined();
    });
  });

  describe('list', () => {
    it('应该返回所有节点类型信息', () => {
      const types = registry.list();
      expect(types.length).toBe(4);
      expect(types[0]).toHaveProperty('type');
      expect(types[0]).toHaveProperty('displayName');
    });

    it('包含新注册的节点类型', () => {
      registry.register('new-type', (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      }));

      const types = registry.list();
      expect(types.find(t => t.type === 'new-type')).toBeDefined();
    });
  });

  describe('has', () => {
    it('对已注册类型应该返回 true', () => {
      expect(registry.has(BUILT_IN_NODE_TYPES.TASK)).toBe(true);
    });

    it('对未注册类型应该返回 false', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('应该成功注销已注册的节点类型', () => {
      registry.register('to-remove', (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      }));

      expect(registry.has('to-remove')).toBe(true);

      const result = registry.unregister('to-remove');
      expect(result).toBe(true);
      expect(registry.has('to-remove')).toBe(false);
    });

    it('注销未注册类型应该返回 false', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });

    it('不能注销内置节点类型', () => {
      registry.unregister(BUILT_IN_NODE_TYPES.TASK);
      // 内置节点仍然存在（因为是在构造函数中注册的）
      expect(registry.has(BUILT_IN_NODE_TYPES.TASK)).toBe(false);
      expect(registry.size).toBe(3);
    });
  });

  describe('getInfo and updateInfo', () => {
    it('应该返回节点类型信息', () => {
      const info = registry.getInfo(BUILT_IN_NODE_TYPES.TASK);
      expect(info).toBeDefined();
      expect(info?.type).toBe(BUILT_IN_NODE_TYPES.TASK);
      expect(info?.displayName).toBe('Task');
    });

    it('应该更新节点类型信息', () => {
      registry.register('custom', (node) => async (input, context) => ({
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'success' as const,
        startTime: '',
        endTime: '',
        duration: 0,
      }));

      const updated = registry.updateInfo('custom', {
        displayName: 'Custom Node',
        description: 'A custom node',
        category: 'test',
      });

      expect(updated).toBe(true);

      const info = registry.getInfo('custom');
      expect(info?.displayName).toBe('Custom Node');
      expect(info?.description).toBe('A custom node');
      expect(info?.category).toBe('test');
    });

    it('更新未注册类型应该返回 false', () => {
      const result = registry.updateInfo('non-existent', { displayName: 'Test' });
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有注册的节点类型', () => {
      expect(registry.size).toBe(4);
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('全局单例', () => {
    it('getNodeRegistry 应该返回全局实例', () => {
      const instance1 = getNodeRegistry();
      const instance2 = getNodeRegistry();

      expect(instance1).toBe(instance2);
    });

    it('resetNodeRegistry 应该重置全局实例', () => {
      const instance1 = getNodeRegistry();
      resetNodeRegistry();
      const instance2 = getNodeRegistry();

      expect(instance1).not.toBe(instance2);
    });
  });
});
