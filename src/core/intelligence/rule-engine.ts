/**
 * RuleEngine - 规则引擎
 *
 * P0 阶段核心组件，基于 if-then 规则表进行决策
 *
 * @version 1.0.0
 * @author 孬蛋
 */

import {
  DecisionRule,
  RuleCondition,
  DecisionType,
  DecisionContext,
} from './types';

/**
 * 内置规则表（P0）
 */
export const BUILTIN_RULES: DecisionRule[] = [
  // R1: 资源不足 → 延后执行
  {
    ruleId: 'R001',
    name: 'resource_exhaustion_defer',
    description: '资源使用率超过阈值时延后执行',
    priority: 100,
    conditions: [
      { field: 'resourceUsage', operator: 'gte', value: 80 },
    ],
    conditionOperator: 'and',
    decisionType: 'defer',
    reasonTemplate: '资源使用率过高（{{resourceUsage}}%），建议延后执行',
    enabled: true,
    tags: ['resource', 'defer'],
  },

  // R2: 依赖就绪且资源充足 → 并行执行
  {
    ruleId: 'R002',
    name: 'ready_parallelize',
    description: '无依赖阻塞且资源充足时并行执行',
    priority: 90,
    conditions: [
      { field: 'dependencyStatus', operator: 'eq', value: 'ready' },
      { field: 'resourceUsage', operator: 'lt', value: 70 },
    ],
    conditionOperator: 'and',
    decisionType: 'parallelize',
    reasonTemplate: '依赖已就绪且资源充足，建议并行执行',
    enabled: true,
    tags: ['dependency', 'parallel'],
  },

  // R3: 紧急任务 → 立即执行
  {
    ruleId: 'R003',
    name: 'urgent_execute_now',
    description: '紧急任务立即执行',
    priority: 95,
    conditions: [
      { field: 'isUrgent', operator: 'eq', value: true },
      { field: 'dependencyStatus', operator: 'neq', value: 'blocked' },
    ],
    conditionOperator: 'and',
    decisionType: 'execute_now',
    reasonTemplate: '紧急任务，立即执行',
    enabled: true,
    tags: ['priority', 'urgent'],
  },

  // R4: 历史失败率高 → 跳过并回退
  {
    ruleId: 'R004',
    name: 'high_failure_skip',
    description: '历史失败率超过阈值时跳过',
    priority: 85,
    conditions: [
      { field: 'historicalSuccessRate', operator: 'lt', value: 0.5 },
    ],
    conditionOperator: 'and',
    decisionType: 'skip',
    reasonTemplate: '历史成功率过低（{{historicalSuccessRate}}%），建议跳过',
    enabled: true,
    tags: ['reliability', 'skip'],
  },

  // R5: 依赖阻塞 → 等待
  {
    ruleId: 'R005',
    name: 'dependency_blocked_defer',
    description: '依赖阻塞时延后执行',
    priority: 80,
    conditions: [
      { field: 'dependencyStatus', operator: 'eq', value: 'blocked' },
    ],
    conditionOperator: 'and',
    decisionType: 'defer',
    reasonTemplate: '存在阻塞依赖，等待依赖就绪',
    enabled: true,
    tags: ['dependency', 'defer'],
  },

  // R6: 默认规则 → 立即执行
  {
    ruleId: 'R099',
    name: 'default_execute',
    description: '默认执行策略',
    priority: 1,
    conditions: [],
    conditionOperator: 'and',
    decisionType: 'execute_now',
    reasonTemplate: '默认执行策略',
    enabled: true,
    tags: ['default'],
  },
];

/**
 * 规则评估结果
 */
export interface RuleEvaluationResult {
  /** 决策类型 */
  decision: DecisionType;
  /** 理由 */
  reason: string;
  /** 触发的规则 ID 列表 */
  triggeredRules: string[];
  /** 置信度 */
  confidence: number;
}

/**
 * 规则引擎
 *
 * P0 阶段核心组件，基于 if-then 规则表进行决策
 */
export class RuleEngine {
  private rules: DecisionRule[] = [];

  /**
   * 创建规则引擎
   *
   * @param initialRules 初始规则列表，默认使用内置规则
   */
  constructor(initialRules?: DecisionRule[]) {
    this.rules = initialRules ? [...initialRules] : [...BUILTIN_RULES];
    this.sortRules();
  }

  /**
   * 评估规则
   *
   * 按优先级遍历规则，返回第一个匹配的规则
   *
   * @param context 决策上下文
   * @returns 评估结果
   */
  evaluate(context: DecisionContext): RuleEvaluationResult {
    const triggeredRules: string[] = [];
    let matchedRule: DecisionRule | null = null;

    // 按优先级遍历规则
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (this.matchConditions(rule.conditions, rule.conditionOperator, context)) {
        triggeredRules.push(rule.ruleId);
        // 只取第一个匹配的高优先级规则
        if (!matchedRule) matchedRule = rule;
      }
    }

    // 如果没有匹配的规则，使用默认规则
    if (!matchedRule) {
      matchedRule = this.rules.find(r => r.ruleId === 'R099')!;
    }

    const reason = this.generateReason(matchedRule, context);
    const confidence = this.calculateConfidence(matchedRule, context);

    return {
      decision: matchedRule.decisionType,
      reason,
      triggeredRules,
      confidence,
    };
  }

  /**
   * 匹配所有条件
   *
   * @param conditions 条件列表
   * @param operator 组合操作符
   * @param context 决策上下文
   * @returns 是否匹配
   */
  private matchConditions(
    conditions: RuleCondition[],
    operator: 'and' | 'or',
    context: DecisionContext
  ): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(cond => this.matchCondition(cond, context));

    return operator === 'and'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  /**
   * 匹配单个条件
   *
   * @param condition 规则条件
   * @param context 决策上下文
   * @returns 是否匹配
   */
  private matchCondition(condition: RuleCondition, context: DecisionContext): boolean {
    const fieldValue = this.getFieldValue(condition.field, context);

    if (fieldValue === undefined) return false;

    switch (condition.operator) {
      case 'gt':
        return typeof fieldValue === 'number' &&
               typeof condition.value === 'number' &&
               fieldValue > condition.value;

      case 'gte':
        return typeof fieldValue === 'number' &&
               typeof condition.value === 'number' &&
               fieldValue >= condition.value;

      case 'lt':
        return typeof fieldValue === 'number' &&
               typeof condition.value === 'number' &&
               fieldValue < condition.value;

      case 'lte':
        return typeof fieldValue === 'number' &&
               typeof condition.value === 'number' &&
               fieldValue <= condition.value;

      case 'eq':
        return fieldValue === condition.value;

      case 'neq':
        return fieldValue !== condition.value;

      case 'in':
        return Array.isArray(condition.value) &&
               condition.value.includes(String(fieldValue));

      case 'contains':
        return typeof fieldValue === 'string' &&
               typeof condition.value === 'string' &&
               fieldValue.includes(condition.value);

      default:
        return false;
    }
  }

  /**
   * 获取字段值
   *
   * @param field 字段名
   * @param context 决策上下文
   * @returns 字段值
   */
  private getFieldValue(
    field: RuleCondition['field'],
    context: DecisionContext
  ): unknown {
    // 特殊字段映射
    if (field === 'historicalFailureRate') {
      return 1 - context.historicalSuccessRate;
    }

    if (field === 'dependencyCount') {
      return context.dependencyStatus === 'blocked' ? 1 : 0;
    }

    if (field === 'estimatedWaitTime') {
      return context.estimatedDuration;
    }

    // 直接从上下文获取
    return context[field as keyof DecisionContext];
  }

  /**
   * 生成决策理由
   *
   * @param rule 匹配的规则
   * @param context 决策上下文
   * @returns 理由字符串
   */
  private generateReason(rule: DecisionRule, context: DecisionContext): string {
    return rule.reasonTemplate.replace(
      /\{\{(\w+)\}\}/g,
      (_, key: string) => {
        const value = context[key as keyof DecisionContext];
        if (typeof value === 'number') {
          return (value * 100).toFixed(1);
        }
        return String(value ?? '');
      }
    );
  }

  /**
   * 计算置信度
   *
   * @param rule 匹配的规则
   * @param context 决策上下文
   * @returns 置信度 (0-100)
   */
  private calculateConfidence(rule: DecisionRule, context: DecisionContext): number {
    // 无条件的默认规则，置信度固定
    if (rule.conditions.length === 0) return 50;

    const matchScores: number[] = [];

    for (const cond of rule.conditions) {
      const fieldValue = this.getFieldValue(cond.field, context);

      if (fieldValue === undefined) {
        matchScores.push(0);
        continue;
      }

      // 布尔类型匹配
      if (typeof cond.value === 'boolean') {
        matchScores.push(fieldValue === cond.value ? 95 : 0);
        continue;
      }

      // 字符串类型匹配
      if (typeof cond.value === 'string') {
        matchScores.push(fieldValue === cond.value ? 90 : 0);
        continue;
      }

      // 数值类型匹配 - 计算匹配程度
      if (typeof fieldValue === 'number' && typeof cond.value === 'number') {
        const threshold = cond.value;
        const actual = fieldValue;

        // 根据操作符计算匹配程度
        if (cond.operator === 'gt' || cond.operator === 'gte') {
          // 超过阈值越多，置信度越高
          const excess = actual - threshold;
          const score = Math.min(100, 50 + excess * 10);
          matchScores.push(Math.max(0, score));
        } else if (cond.operator === 'lt' || cond.operator === 'lte') {
          // 低于阈值越多，置信度越高
          const margin = threshold - actual;
          const score = Math.min(100, 50 + margin * 10);
          matchScores.push(Math.max(0, score));
        } else {
          matchScores.push(70);
        }
      }
    }

    // 计算平均匹配分数
    const avgScore = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;

    // 优先级加成（高优先级规则略加分）
    const priorityBonus = Math.min(10, rule.priority / 10);

    return Math.min(100, Math.round(avgScore + priorityBonus));
  }

  /**
   * 对规则按优先级排序
   */
  private sortRules(): void {
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 添加规则
   *
   * @param rule 新规则
   */
  addRule(rule: DecisionRule): void {
    // 检查是否已存在
    const existingIndex = this.rules.findIndex(r => r.ruleId === rule.ruleId);
    if (existingIndex >= 0) {
      // 替换已存在的规则
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
    this.sortRules();
  }

  /**
   * 移除规则
   *
   * @param ruleId 规则 ID
   * @returns 是否移除成功
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.ruleId === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取所有规则
   *
   * @returns 规则列表副本
   */
  getRules(): DecisionRule[] {
    return [...this.rules];
  }

  /**
   * 启用规则
   *
   * @param ruleId 规则 ID
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.ruleId === ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  /**
   * 禁用规则
   *
   * @param ruleId 规则 ID
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.ruleId === ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  /**
   * 重置为内置规则
   */
  reset(): void {
    this.rules = [...BUILTIN_RULES];
    this.sortRules();
  }
}
