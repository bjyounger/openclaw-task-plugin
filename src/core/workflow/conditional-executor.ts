/**
 * WorkflowEngine - 条件执行器
 *
 * 支持分支、循环和条件表达式评估。
 * 借鉴 n8n 的条件执行逻辑，支持三种表达式类型。
 *
 * @version 1.0.0
 * @author 杨珂 (bjyounger)
 */

import type {
  WorkflowNode,
  WorkflowConnection,
  ConditionExpression,
  NodeOutput,
  NodeError,
} from './types';
import type { NodeExecutionInput, INodeContext } from './node-registry';
import type { IExecutionContext } from './execution-context';

// ==================== Types ====================

/**
 * 简单条件表达式（用于 simple 类型）
 */
interface SimpleCondition {
  /** 字段名 */
  field: string;

  /** 操作符 */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';

  /** 比较值 */
  value: any;
}

/**
 * 循环配置
 */
interface LoopConfig {
  /** 最大迭代次数 */
  maxIterations?: number;

  /** 循环条件 */
  condition?: ConditionExpression;

  /** 循环变量名 */
  itemVariable?: string;

  /** 索引变量名 */
  indexVariable?: string;
}

/**
 * 分支配置
 */
interface BranchConfig {
  /** 分支条件 */
  conditions: Array<{
    expression: ConditionExpression;
    output: string;
  }>;

  /** 默认输出 */
  defaultOutput?: string;
}

// ==================== ConditionalExecutor ====================

/**
 * 条件执行器
 *
 * 支持三种条件表达式：
 * 1. JavaScript 表达式（需沙箱）
 * 2. JSONata 表达式
 * 3. Simple 条件（{field, operator, value}）
 *
 * @example
 * ```typescript
 * const executor = new ConditionalExecutor();
 *
 * // 评估条件
 * const result = executor.evaluateCondition({
 *   type: 'simple',
 *   expression: JSON.stringify({ field: 'status', operator: 'eq', value: 'success' })
 * }, { data: { status: 'success' } });
 *
 * // 执行分支
 * const output = await executor.executeBranch(conditionNode, connections, input, context);
 *
 * // 执行循环
 * const output = await executor.executeLoop(loopNode, connections, input, context);
 * ```
 */
export class ConditionalExecutor {
  /** 最大循环迭代次数（安全限制） */
  private readonly MAX_ITERATIONS = 1000;

  /**
   * 评估条件表达式
   *
   * @param expression - 条件表达式
   * @param input - 节点输入数据
   * @returns 条件评估结果
   */
  evaluateCondition(expression: ConditionExpression, input: NodeExecutionInput): boolean {
    try {
      switch (expression.type) {
        case 'javascript':
          return this.evaluateJavaScript(expression.expression, input);

        case 'jsonata':
          return this.evaluateJSONata(expression.expression, input);

        case 'simple':
          return this.evaluateSimple(expression.expression, input);

        default:
          throw new Error(`Unsupported condition type: ${(expression as any).type}`);
      }
    } catch (error) {
      // 条件评估失败时，默认返回 false
      console.error('Condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * 执行分支节点
   *
   * 1. 评估条件
   * 2. 选择匹配的输出连接
   * 3. 执行目标节点
   *
   * @param conditionNode - 条件节点
   * @param connections - 连接列表
   * @param input - 节点输入
   * @param context - 执行上下文
   * @param nodeExecutor - 节点执行器函数
   * @returns 节点输出
   */
  async executeBranch(
    conditionNode: WorkflowNode,
    connections: WorkflowConnection[],
    input: NodeExecutionInput,
    context: IExecutionContext,
    nodeExecutor?: (
      nodeId: string,
      input: NodeExecutionInput,
      context: IExecutionContext
    ) => Promise<NodeOutput>
  ): Promise<NodeOutput> {
    const startTime = new Date();
    const executionId = context.executionId;

    try {
      // 1. 评估条件
      const condition = conditionNode.condition;
      if (!condition) {
        throw new Error('Condition node missing condition expression');
      }

      const conditionResult = this.evaluateCondition(condition, input);

      // 2. 选择匹配的输出连接
      const matchingConnection = this.findMatchingConnection(
        conditionNode.id,
        conditionResult,
        connections
      );

      if (!matchingConnection) {
        // 没有匹配的连接，返回空输出
        return this.createOutput(
          conditionNode.id,
          executionId,
          { conditionResult, branch: 'none' },
          'success',
          startTime
        );
      }

      // 3. 执行目标节点（如果有节点执行器）
      if (nodeExecutor) {
        const targetOutput = await nodeExecutor(
          matchingConnection.target,
          input,
          context
        );

        return this.createOutput(
          conditionNode.id,
          executionId,
          {
            conditionResult,
            branch: matchingConnection.target,
            targetOutput: targetOutput.data,
          },
          'success',
          startTime
        );
      }

      // 没有节点执行器，只返回分支决策
      return this.createOutput(
        conditionNode.id,
        executionId,
        {
          conditionResult,
          branch: matchingConnection.target,
        },
        'success',
        startTime
      );
    } catch (error) {
      const err = error as Error;
      return this.createErrorOutput(
        conditionNode.id,
        executionId,
        'BRANCH_EXECUTION_ERROR',
        err.message,
        startTime
      );
    }
  }

  /**
   * 执行循环节点
   *
   * 1. 获取循环配置
   * 2. 每次迭代检查条件
   * 3. 执行循环体
   * 4. 汇总输出
   *
   * @param loopNode - 循环节点
   * @param connections - 连接列表
   * @param input - 节点输入
   * @param context - 执行上下文
   * @param nodeExecutor - 节点执行器函数
   * @returns 节点输出（包含所有迭代结果）
   */
  async executeLoop(
    loopNode: WorkflowNode,
    connections: WorkflowConnection[],
    input: NodeExecutionInput,
    context: IExecutionContext,
    nodeExecutor?: (
      nodeId: string,
      input: NodeExecutionInput,
      context: IExecutionContext
    ) => Promise<NodeOutput>
  ): Promise<NodeOutput> {
    const startTime = new Date();
    const executionId = context.executionId;

    try {
      // 1. 获取循环配置
      const loopConfig = this.parseLoopConfig(loopNode.config);
      const maxIterations = Math.min(
        loopConfig.maxIterations || this.MAX_ITERATIONS,
        this.MAX_ITERATIONS
      );

      // 2. 准备迭代数据
      const items = this.getIterationItems(input, loopConfig);
      const results: any[] = [];
      let iterationCount = 0;

      // 3. 执行循环
      for (let i = 0; i < items.length && i < maxIterations; i++) {
        // 检查循环条件
        if (loopConfig.condition && i > 0) {
          const shouldContinue = this.evaluateCondition(
            loopConfig.condition,
            { data: { ...input.data, results, iteration: i } }
          );
          if (!shouldContinue) {
            break;
          }
        }

        // 构建迭代输入
        const iterationInput: NodeExecutionInput = {
          data: {
            ...input.data,
            [loopConfig.itemVariable || 'item']: items[i],
            [loopConfig.indexVariable || 'index']: i,
          },
          sourceNodeId: input.sourceNodeId,
        };

        // 执行循环体
        if (nodeExecutor) {
          // 找到循环体连接
          const loopConnection = connections.find(
            (conn) =>
              conn.source === loopNode.id &&
              conn.condition?.type === 'always'
          );

          if (loopConnection) {
            const iterationOutput = await nodeExecutor(
              loopConnection.target,
              iterationInput,
              context
            );
            results.push(iterationOutput.data);
          }
        } else {
          results.push(iterationInput.data);
        }

        iterationCount++;
      }

      // 4. 汇总输出
      return this.createOutput(
        loopNode.id,
        executionId,
        {
          results,
          iterationCount,
          maxIterations: maxIterations,
        },
        'success',
        startTime
      );
    } catch (error) {
      const err = error as Error;
      return this.createErrorOutput(
        loopNode.id,
        executionId,
        'LOOP_EXECUTION_ERROR',
        err.message,
        startTime
      );
    }
  }

  // ==================== Private Methods ====================

  /**
   * 评估 JavaScript 表达式
   *
   * 注意：当前实现不安全，仅用于演示。
   * 生产环境应使用 VM2 或 isolated-vm 创建沙箱。
   */
  private evaluateJavaScript(expression: string, input: NodeExecutionInput): boolean {
    try {
      // 创建安全的执行上下文
      const sandbox = {
        $input: input.data,
        $json: input.data,
        // 安全函数
        Object,
        Array,
        String,
        Number,
        Boolean,
        Math,
        Date,
      };

      // 使用 Function 构造器执行（不安全，仅演示）
      const fn = new Function(
        ...Object.keys(sandbox),
        `return ${expression}`
      );

      const result = fn(...Object.values(sandbox));
      return Boolean(result);
    } catch (error) {
      console.error('JavaScript evaluation failed:', error);
      return false;
    }
  }

  /**
   * 评估 JSONata 表达式
   *
   * 注意：需要安装 jsonata 库
   * npm install jsonata
   */
  private evaluateJSONata(expression: string, input: NodeExecutionInput): boolean {
    try {
      // 如果 jsonata 库可用，使用它
      // 否则使用简化的评估
      const jsonata = require('jsonata');
      const expr = jsonata(expression);
      const result = expr.evaluate(input.data);
      return Boolean(result);
    } catch (error) {
      // jsonata 库未安装或评估失败
      console.error('JSONata evaluation failed:', error);
      return false;
    }
  }

  /**
   * 评估简单条件表达式
   */
  private evaluateSimple(expression: string, input: NodeExecutionInput): boolean {
    try {
      const condition: SimpleCondition = JSON.parse(expression);
      const { field, operator, value } = condition;
      const fieldValue = this.getNestedValue(input.data, field);

      switch (operator) {
        case 'eq':
          return fieldValue === value;

        case 'ne':
          return fieldValue !== value;

        case 'gt':
          return fieldValue > value;

        case 'gte':
          return fieldValue >= value;

        case 'lt':
          return fieldValue < value;

        case 'lte':
          return fieldValue <= value;

        case 'contains':
          return String(fieldValue).includes(String(value));

        case 'startsWith':
          return String(fieldValue).startsWith(String(value));

        case 'endsWith':
          return String(fieldValue).endsWith(String(value));

        default:
          return false;
      }
    } catch (error) {
      console.error('Simple condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * 获取嵌套字段值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
  }

  /**
   * 查找匹配的连接
   */
  private findMatchingConnection(
    nodeId: string,
    conditionResult: boolean,
    connections: WorkflowConnection[]
  ): WorkflowConnection | undefined {
    return connections.find((conn) => {
      if (conn.source !== nodeId) {
        return false;
      }

      // 检查连接条件
      if (!conn.condition) {
        // 无条件的连接总是匹配
        return true;
      }

      switch (conn.condition.type) {
        case 'always':
          return true;

        case 'on_success':
          return conditionResult === true;

        case 'on_failure':
          return conditionResult === false;

        case 'custom':
          // 自定义条件需要进一步评估
          return true; // 简化处理

        default:
          return false;
      }
    });
  }

  /**
   * 解析循环配置
   */
  private parseLoopConfig(config: Record<string, any>): LoopConfig {
    return {
      maxIterations: config.maxIterations || this.MAX_ITERATIONS,
      condition: config.condition,
      itemVariable: config.itemVariable || 'item',
      indexVariable: config.indexVariable || 'index',
    };
  }

  /**
   * 获取迭代项列表
   */
  private getIterationItems(
    input: NodeExecutionInput,
    config: LoopConfig
  ): any[] {
    // 如果配置中指定了 items 字段，使用它
    if (input.data.items && Array.isArray(input.data.items)) {
      return input.data.items;
    }

    // 如果输入数据本身是数组，使用它
    if (Array.isArray(input.data)) {
      return input.data;
    }

    // 默认返回空数组
    return [];
  }

  /**
   * 创建输出结果
   */
  private createOutput(
    nodeId: string,
    executionId: string,
    data: Record<string, any>,
    status: 'success' | 'failure' | 'skipped',
    startTime: Date
  ): NodeOutput {
    return {
      nodeId,
      executionId,
      data,
      status,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - startTime.getTime(),
    };
  }

  /**
   * 创建错误输出
   */
  private createErrorOutput(
    nodeId: string,
    executionId: string,
    code: string,
    message: string,
    startTime: Date
  ): NodeOutput {
    const error: NodeError = {
      code,
      message,
      retryable: true,
    };

    return {
      nodeId,
      executionId,
      data: {},
      status: 'failure',
      error,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - startTime.getTime(),
    };
  }
}
