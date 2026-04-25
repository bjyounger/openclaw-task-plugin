/**
 * WorkflowEngine - 拓扑排序器
 *
 * 使用 Kahn 算法实现 DAG 拓扑排序，支持：
 * 1. 拓扑排序（返回执行顺序）
 * 2. 获取可并行执行的节点层级
 * 3. 环检测（DFS 算法）
 *
 * 时间复杂度：O(V + E)
 * 空间复杂度：O(V + E)
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import { WorkflowNode, WorkflowConnection } from './types';

/**
 * 环检测错误
 */
export class CycleDetectedError extends Error {
  constructor(public cycles: string[][]) {
    super(`Workflow contains ${cycles.length} cycle(s). DAG required.`);
    this.name = 'CycleDetectedError';
  }
}

/**
 * 拓扑排序器
 */
export class TopologicalSorter {
  /**
   * 拓扑排序（Kahn 算法）
   * 返回节点的执行顺序
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 拓扑排序后的节点 ID 数组
   * @throws CycleDetectedError 如果存在环
   */
  sort(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] {
    // 1. 构建邻接表和入度表
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // 初始化
    for (const node of nodes) {
      graph.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    // 构建图
    for (const conn of connections) {
      const neighbors = graph.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    }

    // 2. 找出所有入度为 0 的节点（起始节点）
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // 3. BFS 遍历
    const result: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      for (const neighbor of graph.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 4. 检测环
    if (result.length !== nodes.length) {
      const cycle = this.detectCycle(nodes, connections);
      throw new CycleDetectedError(cycle);
    }

    return result;
  }

  /**
   * 获取可并行执行的节点层级
   * 返回二维数组，每一层可以并行执行
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 层级数组，每层包含可并行执行的节点 ID
   * @throws CycleDetectedError 如果存在环
   */
  getExecutionLevels(
    nodes: WorkflowNode[],
    connections: WorkflowConnection[]
  ): string[][] {
    const levels: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(nodes.map(n => n.id));

    // 构建反向依赖图（每个节点的依赖节点）
    const dependencies = this.buildDependencyMap(connections);

    while (remaining.size > 0) {
      // 找出当前可执行的节点（所有依赖已完成）
      const readyNodes: string[] = [];

      for (const nodeId of remaining) {
        const deps = dependencies.get(nodeId) || [];
        if (deps.every(d => completed.has(d))) {
          readyNodes.push(nodeId);
        }
      }

      if (readyNodes.length === 0) {
        // 无法继续，存在环
        const cycle = this.detectCycle(nodes, connections);
        throw new CycleDetectedError(cycle);
      }

      levels.push(readyNodes);
      readyNodes.forEach(n => {
        completed.add(n);
        remaining.delete(n);
      });
    }

    return levels;
  }

  /**
   * DFS 检测环
   * 返回所有检测到的环路径
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 环路径数组
   */
  detectCycle(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[][] {
    const graph = this.buildGraph(nodes, connections);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      if (recursionStack.has(nodeId)) {
        // 找到环，提取环路径
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      for (const neighbor of graph.get(nodeId) || []) {
        dfs(neighbor, [...path]);
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return cycles;
  }

  /**
   * 构建邻接表
   */
  private buildGraph(
    nodes: WorkflowNode[],
    connections: WorkflowConnection[]
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    // 初始化所有节点
    for (const node of nodes) {
      graph.set(node.id, []);
    }

    // 添加边
    for (const conn of connections) {
      const neighbors = graph.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
    }

    return graph;
  }

  /**
   * 构建依赖映射（反向图）
   * 返回每个节点的所有依赖节点
   */
  private buildDependencyMap(
    connections: WorkflowConnection[]
  ): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    for (const conn of connections) {
      if (!dependencies.has(conn.target)) {
        dependencies.set(conn.target, []);
      }
      dependencies.get(conn.target)!.push(conn.source);
    }

    return dependencies;
  }

  /**
   * 获取节点的直接依赖
   *
   * @param nodeId 节点 ID
   * @param connections 连接列表
   * @returns 依赖节点 ID 数组
   */
  getDependencies(nodeId: string, connections: WorkflowConnection[]): string[] {
    const dependencies: string[] = [];
    for (const conn of connections) {
      if (conn.target === nodeId) {
        dependencies.push(conn.source);
      }
    }
    return dependencies;
  }

  /**
   * 获取节点的直接后继
   *
   * @param nodeId 节点 ID
   * @param connections 连接列表
   * @returns 后继节点 ID 数组
   */
  getSuccessors(nodeId: string, connections: WorkflowConnection[]): string[] {
    const successors: string[] = [];
    for (const conn of connections) {
      if (conn.source === nodeId) {
        successors.push(conn.target);
      }
    }
    return successors;
  }

  /**
   * 验证工作流是否为 DAG
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 是否为 DAG
   */
  isDAG(nodes: WorkflowNode[], connections: WorkflowConnection[]): boolean {
    try {
      this.sort(nodes, connections);
      return true;
    } catch (error) {
      if (error instanceof CycleDetectedError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 获取所有起始节点（入度为 0）
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 起始节点 ID 数组
   */
  getStartNodes(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] {
    const inDegree = new Map<string, number>();

    // 初始化
    for (const node of nodes) {
      inDegree.set(node.id, 0);
    }

    // 计算入度
    for (const conn of connections) {
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    }

    // 返回入度为 0 的节点
    const startNodes: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        startNodes.push(nodeId);
      }
    }

    return startNodes;
  }

  /**
   * 获取所有终止节点（出度为 0）
   *
   * @param nodes 节点列表
   * @param connections 连接列表
   * @returns 终止节点 ID 数组
   */
  getEndNodes(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] {
    const outDegree = new Map<string, number>();

    // 初始化
    for (const node of nodes) {
      outDegree.set(node.id, 0);
    }

    // 计算出度
    for (const conn of connections) {
      outDegree.set(conn.source, (outDegree.get(conn.source) || 0) + 1);
    }

    // 返回出度为 0 的节点
    const endNodes: string[] = [];
    for (const [nodeId, degree] of outDegree) {
      if (degree === 0) {
        endNodes.push(nodeId);
      }
    }

    return endNodes;
  }
}
