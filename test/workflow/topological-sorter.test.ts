/**
 * TopologicalSorter 单元测试
 */

import { TopologicalSorter, CycleDetectedError } from '../../src/core/workflow';
import { WorkflowNode, WorkflowConnection } from '../../src/core/workflow';

describe('TopologicalSorter', () => {
  let sorter: TopologicalSorter;

  beforeEach(() => {
    sorter = new TopologicalSorter();
  });

  describe('sort', () => {
    it('应该正确排序简单 DAG', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
      ];

      const result = sorter.sort(nodes, connections);
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('应该正确排序并行 DAG', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
        { id: 'D', type: 'test', name: 'Node D', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'B', target: 'D' },
        { source: 'C', target: 'D' },
      ];

      const result = sorter.sort(nodes, connections);
      expect(result[0]).toBe('A'); // A 必须最先
      expect(result[result.length - 1]).toBe('D'); // D 必须最后
      expect(result).toContain('B');
      expect(result).toContain('C');
    });

    it('应该检测到环并抛出 CycleDetectedError', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' }, // 形成环
      ];

      expect(() => sorter.sort(nodes, connections)).toThrow(CycleDetectedError);
    });

    it('应该正确处理孤立节点', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} }, // 孤立节点
      ];

      const connections: WorkflowConnection[] = [];

      const result = sorter.sort(nodes, connections);
      expect(result.length).toBe(2);
      expect(result).toContain('A');
      expect(result).toContain('B');
    });
  });

  describe('getExecutionLevels', () => {
    it('应该正确计算执行层级', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
        { id: 'D', type: 'test', name: 'Node D', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'B', target: 'D' },
        { source: 'C', target: 'D' },
      ];

      const levels = sorter.getExecutionLevels(nodes, connections);

      expect(levels.length).toBe(3);
      expect(levels[0]).toEqual(['A']); // 第一层：A
      expect(levels[1]).toEqual(['B', 'C']); // 第二层：B、C 可并行
      expect(levels[2]).toEqual(['D']); // 第三层：D
    });

    it('应该正确处理多个起始节点', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'C' },
        { source: 'B', target: 'C' },
      ];

      const levels = sorter.getExecutionLevels(nodes, connections);

      expect(levels.length).toBe(2);
      expect(levels[0]).toEqual(['A', 'B']); // A、B 可并行
      expect(levels[1]).toEqual(['C']); // C 依赖 A、B
    });

    it('应该检测环并抛出错误', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' }, // 环
      ];

      expect(() => sorter.getExecutionLevels(nodes, connections)).toThrow(CycleDetectedError);
    });
  });

  describe('detectCycle', () => {
    it('应该检测简单环', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ];

      const cycles = sorter.detectCycle(nodes, connections);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('A');
      expect(cycles[0]).toContain('B');
    });

    it('应该检测复杂环', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' },
      ];

      const cycles = sorter.detectCycle(nodes, connections);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('应该在 DAG 中返回空数组', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
      ];

      const cycles = sorter.detectCycle(nodes, connections);
      expect(cycles.length).toBe(0);
    });
  });

  describe('isDAG', () => {
    it('应该正确判断 DAG', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
      ];

      expect(sorter.isDAG(nodes, connections)).toBe(true);
    });

    it('应该正确判断非 DAG', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ];

      expect(sorter.isDAG(nodes, connections)).toBe(false);
    });
  });

  describe('getStartNodes', () => {
    it('应该正确获取起始节点', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'C' },
        { source: 'B', target: 'C' },
      ];

      const startNodes = sorter.getStartNodes(nodes, connections);
      expect(startNodes).toEqual(['A', 'B']);
    });
  });

  describe('getEndNodes', () => {
    it('应该正确获取终止节点', () => {
      const nodes: WorkflowNode[] = [
        { id: 'A', type: 'test', name: 'Node A', config: {} },
        { id: 'B', type: 'test', name: 'Node B', config: {} },
        { id: 'C', type: 'test', name: 'Node C', config: {} },
      ];

      const connections: WorkflowConnection[] = [
        { source: 'A', target: 'C' },
        { source: 'B', target: 'C' },
      ];

      const endNodes = sorter.getEndNodes(nodes, connections);
      expect(endNodes).toEqual(['C']);
    });
  });
});