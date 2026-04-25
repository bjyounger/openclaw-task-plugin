/**
 * WorkflowEngine - 节点注册中心
 *
 * 节点工厂模式实现，支持插件化扩展。
 * 提供节点类型的注册、获取、列表和注销功能。
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type { WorkflowNode, NodeOutput, NodeError } from './types';

// ==================== Types ====================

/**
 * 节点执行输入
 * 运行时传递给节点的输入数据
 */
export interface NodeExecutionInput {
  /** 输入数据 */
  data: Record<string, any>;

  /** 来源节点 ID */
  sourceNodeId?: string;
}

/**
 * 节点执行上下文
 * 提供节点执行时的上下文信息
 */
export interface INodeContext {
  /** 节点 ID */
  nodeId: string;

  /** 执行 ID */
  executionId: string;

  /** 工作流 ID */
  workflowId: string;

  /** 获取节点配置 */
  getConfig(): Record<string, any>;

  /** 获取输入数据 */
  getInput(): NodeExecutionInput;

  /** 获取前一个节点的输出 */
  getPreviousOutput(): NodeOutput | undefined;

  /** 记录日志 */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void;

  /** 发送事件 */
  emit(event: string, data: any): void;
}

/**
 * 节点处理器函数类型
 * @param input - 节点输入
 * @param context - 节点执行上下文
 * @returns 节点输出
 */
export type NodeHandler = (
  input: NodeExecutionInput,
  context: INodeContext
) => Promise<NodeOutput>;

/**
 * 节点类型信息
 */
export interface NodeTypeInfo {
  /** 节点类型标识 */
  type: string;

  /** 显示名称 */
  displayName: string;

  /** 描述 */
  description?: string;

  /** 分类 */
  category?: string;

  /** 版本 */
  version?: string;

  /** 输入定义 */
  inputs?: NodeInputDefinition[];

  /** 输出定义 */
  outputs?: NodeOutputDefinition[];

  /** 图标 */
  icon?: string;

  /** 是否内置 */
  builtIn?: boolean;
}

/**
 * 节点输入定义
 */
export interface NodeInputDefinition {
  /** 输入名称 */
  name: string;

  /** 显示名称 */
  displayName: string;

  /** 类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

  /** 是否必填 */
  required?: boolean;

  /** 默认值 */
  default?: any;

  /** 描述 */
  description?: string;
}

/**
 * 节点输出定义
 */
export interface NodeOutputDefinition {
  /** 输出名称 */
  name: string;

  /** 显示名称 */
  displayName: string;

  /** 类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

  /** 描述 */
  description?: string;
}

/**
 * 节点工厂函数
 * 用于创建节点实例
 */
export type NodeFactory = (node: WorkflowNode) => NodeHandler;

/**
 * 节点注册中心接口
 */
export interface INodeRegistry {
  /** 注册节点类型 */
  register(type: string, factory: NodeFactory): void;

  /** 获取节点处理器 */
  get(type: string): NodeFactory | undefined;

  /** 列出所有节点类型 */
  list(): NodeTypeInfo[];

  /** 检查节点类型是否存在 */
  has(type: string): boolean;

  /** 注销节点类型 */
  unregister(type: string): boolean;
}

// ==================== Built-in Node Types ====================

/**
 * 内置节点类型常量
 */
export const BUILT_IN_NODE_TYPES = {
  TASK: 'task',
  CONDITION: 'condition',
  PARALLEL: 'parallel',
  SUBFLOW: 'subflow',
} as const;

/**
 * 任务节点处理器
 * 执行单个任务
 */
const taskNodeFactory: NodeFactory = (node: WorkflowNode): NodeHandler => {
  return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
    const startTime = new Date().toISOString();

    try {
      context.log('info', `Executing task node: ${node.name}`, { nodeId: node.id });

      // TODO: 实际任务执行逻辑（由具体任务类型决定）
      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: input.data || {},
        status: 'success',
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };

      return output;
    } catch (error) {
      const nodeError: NodeError = {
        code: 'TASK_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryable: true,
      };

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: nodeError,
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };
    }
  };
};

/**
 * 条件节点处理器
 * 根据条件选择分支
 */
const conditionNodeFactory: NodeFactory = (node: WorkflowNode): NodeHandler => {
  return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
    const startTime = new Date().toISOString();

    try {
      context.log('info', `Evaluating condition node: ${node.name}`, { nodeId: node.id });

      // TODO: 实际条件评估逻辑
      const condition = node.condition;
      let result = true;

      if (condition) {
        // 根据条件类型评估
        switch (condition.type) {
          case 'javascript':
            // 安全的 JavaScript 表达式评估
            // TODO: 实现沙箱环境
            result = true;
            break;
          case 'jsonata':
            // JSONata 表达式评估
            // TODO: 集成 jsonata 库
            result = true;
            break;
          case 'simple':
            // 简单条件评估
            // TODO: 实现简单条件解析
            result = true;
            break;
        }
      }

      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { conditionResult: result },
        status: 'success',
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };

      return output;
    } catch (error) {
      const nodeError: NodeError = {
        code: 'CONDITION_EVALUATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryable: false,
      };

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: nodeError,
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };
    }
  };
};

/**
 * 并行节点处理器
 * 并行执行多个任务
 */
const parallelNodeFactory: NodeFactory = (node: WorkflowNode): NodeHandler => {
  return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
    const startTime = new Date().toISOString();

    try {
      context.log('info', `Executing parallel node: ${node.name}`, { nodeId: node.id });

      // TODO: 实际并行执行逻辑
      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { parallelResults: [] },
        status: 'success',
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };

      return output;
    } catch (error) {
      const nodeError: NodeError = {
        code: 'PARALLEL_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryable: true,
      };

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: nodeError,
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };
    }
  };
};

/**
 * 子工作流节点处理器
 * 执行嵌套工作流
 */
const subflowNodeFactory: NodeFactory = (node: WorkflowNode): NodeHandler => {
  return async (input: NodeExecutionInput, context: INodeContext): Promise<NodeOutput> => {
    const startTime = new Date().toISOString();

    try {
      context.log('info', `Executing subflow node: ${node.name}`, { nodeId: node.id });

      // TODO: 实际子工作流执行逻辑
      const output: NodeOutput = {
        nodeId: node.id,
        executionId: context.executionId,
        data: { subflowResult: {} },
        status: 'success',
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };

      return output;
    } catch (error) {
      const nodeError: NodeError = {
        code: 'SUBFLOW_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryable: true,
      };

      return {
        nodeId: node.id,
        executionId: context.executionId,
        data: {},
        status: 'failure',
        error: nodeError,
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
      };
    }
  };
};

// ==================== NodeRegistry Implementation ====================

/**
 * 节点注册中心
 *
 * 管理所有节点类型的注册和获取。
 * 支持插件化扩展，内置基础节点类型。
 *
 * @example
 * ```typescript
 * const registry = new NodeRegistry();
 *
 * // 注册自定义节点
 * registry.register('my-node', (node) => async (input, context) => {
 *   return { nodeId: node.id, executionId: context.executionId, data: {}, status: 'success', startTime: '', endTime: '', duration: 0 };
 * });
 *
 * // 获取节点处理器
 * const factory = registry.get('my-node');
 * if (factory) {
 *   const handler = factory(node);
 *   const output = await handler(input, context);
 * }
 * ```
 */
export class NodeRegistry implements INodeRegistry {
  /** 节点类型映射表 */
  private readonly registry: Map<string, { factory: NodeFactory; info: NodeTypeInfo }>;

  /** 日志函数 */
  private readonly logger: (level: string, message: string, data?: any) => void;

  /**
   * 创建节点注册中心实例
   * @param logger - 日志函数（可选）
   */
  constructor(logger?: (level: string, message: string, data?: any) => void) {
    this.registry = new Map();
    this.logger = logger || ((level, message, data) => {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    });

    // 注册内置节点类型
    this.registerBuiltInNodes();
  }

  /**
   * 注册内置节点类型
   */
  private registerBuiltInNodes(): void {
    // 任务节点
    this.register(BUILT_IN_NODE_TYPES.TASK, taskNodeFactory);

    // 条件节点
    this.register(BUILT_IN_NODE_TYPES.CONDITION, conditionNodeFactory);

    // 并行节点
    this.register(BUILT_IN_NODE_TYPES.PARALLEL, parallelNodeFactory);

    // 子工作流节点
    this.register(BUILT_IN_NODE_TYPES.SUBFLOW, subflowNodeFactory);

    // 标记内置节点
    this.updateInfo(BUILT_IN_NODE_TYPES.TASK, {
      displayName: 'Task',
      description: '执行单个任务',
      category: 'action',
      builtIn: true,
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.CONDITION, {
      displayName: 'Condition',
      description: '根据条件选择分支',
      category: 'logic',
      builtIn: true,
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.PARALLEL, {
      displayName: 'Parallel',
      description: '并行执行多个任务',
      category: 'logic',
      builtIn: true,
    });
    this.updateInfo(BUILT_IN_NODE_TYPES.SUBFLOW, {
      displayName: 'Subflow',
      description: '执行嵌套工作流',
      category: 'logic',
      builtIn: true,
    });
  }

  /**
   * 注册节点类型
   *
   * @param type - 节点类型标识
   * @param factory - 节点工厂函数
   * @throws {Error} 如果类型标识为空或工厂不是函数
   */
  register(type: string, factory: NodeFactory): void {
    if (!type || type.trim() === '') {
      throw new Error('Node type cannot be empty');
    }

    if (typeof factory !== 'function') {
      throw new Error('Node factory must be a function');
    }

    // 检查是否已注册（重复注册覆盖 + 警告）
    if (this.registry.has(type)) {
      this.logger('warn', `Node type "${type}" is already registered, overwriting`, { type });
    }

    // 创建节点类型信息
    const info: NodeTypeInfo = {
      type,
      displayName: type,
      builtIn: false,
    };

    this.registry.set(type, { factory, info });
    this.logger('info', `Node type "${type}" registered successfully`, { type });
  }

  /**
   * 获取节点工厂
   *
   * @param type - 节点类型标识
   * @returns 节点工厂函数，如果不存在则返回 undefined
   */
  get(type: string): NodeFactory | undefined {
    const entry = this.registry.get(type);
    return entry?.factory;
  }

  /**
   * 列出所有已注册的节点类型
   *
   * @returns 节点类型信息数组
   */
  list(): NodeTypeInfo[] {
    return Array.from(this.registry.values()).map((entry) => entry.info);
  }

  /**
   * 检查节点类型是否已注册
   *
   * @param type - 节点类型标识
   * @returns 是否已注册
   */
  has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * 注销节点类型
   *
   * @param type - 节点类型标识
   * @returns 是否成功注销
   */
  unregister(type: string): boolean {
    if (!this.registry.has(type)) {
      return false;
    }

    const deleted = this.registry.delete(type);
    if (deleted) {
      this.logger('info', `Node type "${type}" unregistered successfully`, { type });
    }
    return deleted;
  }

  /**
   * 获取节点类型信息
   *
   * @param type - 节点类型标识
   * @returns 节点类型信息，如果不存在则返回 undefined
   */
  getInfo(type: string): NodeTypeInfo | undefined {
    const entry = this.registry.get(type);
    return entry?.info;
  }

  /**
   * 更新节点类型信息
   *
   * @param type - 节点类型标识
   * @param info - 部分节点类型信息
   * @returns 是否成功更新
   */
  updateInfo(type: string, info: Partial<NodeTypeInfo>): boolean {
    const entry = this.registry.get(type);
    if (!entry) {
      return false;
    }

    entry.info = { ...entry.info, ...info };
    this.logger('info', `Node type "${type}" info updated`, { type, info });
    return true;
  }

  /**
   * 清空所有注册的节点类型
   */
  clear(): void {
    this.registry.clear();
    this.logger('info', 'All node types cleared');
  }

  /**
   * 获取已注册节点类型数量
   */
  get size(): number {
    return this.registry.size;
  }
}

// ==================== Singleton Instance ====================

/**
 * 全局节点注册中心实例
 */
let globalRegistry: NodeRegistry | undefined;

/**
 * 获取全局节点注册中心实例
 *
 * @returns 节点注册中心实例
 */
export function getNodeRegistry(): NodeRegistry {
  if (!globalRegistry) {
    globalRegistry = new NodeRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局节点注册中心
 * 主要用于测试
 */
export function resetNodeRegistry(): void {
  globalRegistry = undefined;
}
