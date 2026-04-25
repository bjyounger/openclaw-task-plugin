/**
 * RuleEngine 测试
 *
 * 测试规则引擎的核心功能
 */

import { RuleEngine, BUILTIN_RULES } from '../../src/core/intelligence/rule-engine';
import { DecisionContext, DecisionRule } from '../../src/core/intelligence/types';

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  // R1: 规则按优先级排序
  it('should sort rules by priority', () => {
    const rules = ruleEngine.getRules();
    expect(rules.length).toBeGreaterThan(0);

    // 验证优先级降序
    for (let i = 0; i < rules.length - 1; i++) {
      expect(rules[i].priority).toBeGreaterThanOrEqual(rules[i + 1].priority);
    }
  });

  // R2: 匹配资源不足规则
  it('should match resource_exhaustion_defer when CPU > 80%', () => {
    const context: DecisionContext = {
      taskId: 'task-1',
      resourceUsage: 85,
      dependencyStatus: 'ready',
      historicalSuccessRate: 0.9,
      isUrgent: false,
      estimatedDuration: 1000,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('defer');
    expect(result.triggeredRules).toContain('R001');
    expect(result.confidence).toBeGreaterThan(50);
  });

  // R3: 匹配并行执行规则
  it('should match ready_parallelize when dependencies ready and resources sufficient', () => {
    const context: DecisionContext = {
      taskId: 'task-2',
      resourceUsage: 50,
      dependencyStatus: 'ready',
      historicalSuccessRate: 0.8,
      isUrgent: false,
      estimatedDuration: 1000,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('parallelize');
    expect(result.triggeredRules).toContain('R002');
  });

  // R4: 匹配紧急任务规则
  it('should match urgent_execute_now for urgent tasks', () => {
    const context: DecisionContext = {
      taskId: 'task-3',
      resourceUsage: 60,
      dependencyStatus: 'ready',
      historicalSuccessRate: 0.7,
      isUrgent: true,
      estimatedDuration: 500,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('execute_now');
    expect(result.triggeredRules).toContain('R003');
  });

  // R5: 匹配高失败率规则
  it('should match high_failure_skip when success rate < 50%', () => {
    const context: DecisionContext = {
      taskId: 'task-4',
      resourceUsage: 75, // 资源使用率高于70%，不会触发R002
      dependencyStatus: 'partial', // 不是ready，不会触发R002
      historicalSuccessRate: 0.3,
      isUrgent: false,
      estimatedDuration: 1000,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('skip');
    expect(result.triggeredRules).toContain('R004');
  });

  // R6: 匹配依赖阻塞规则
  it('should match dependency_blocked_defer when blocked', () => {
    const context: DecisionContext = {
      taskId: 'task-5',
      resourceUsage: 50,
      dependencyStatus: 'blocked',
      historicalSuccessRate: 0.8,
      isUrgent: false,
      estimatedDuration: 1000,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('defer');
    expect(result.triggeredRules).toContain('R005');
  });

  // R7: 默认规则兜底
  it('should fallback to default_execute when no rule matches', () => {
    const context: DecisionContext = {
      taskId: 'task-6',
      resourceUsage: 60,
      dependencyStatus: 'partial',
      historicalSuccessRate: 0.8,
      isUrgent: false,
      estimatedDuration: 1000,
    };

    const result = ruleEngine.evaluate(context);

    expect(result.decision).toBe('execute_now');
  });

  // R8: 添加自定义规则
  it('should support custom rules', () => {
    const customRule: DecisionRule = {
      ruleId: 'CUSTOM_001',
      name: 'custom_rule',
      description: 'Custom rule for testing',
      priority: 150, // 最高优先级
      conditions: [
        { field: 'taskId', operator: 'contains', value: 'special' },
      ],
      conditionOperator: 'and',
      decisionType: 'defer',
      reasonTemplate: 'Custom rule matched',
      enabled: true,
    };

    ruleEngine.addRule(customRule);

    const context: DecisionContext = {
      taskId: 'special-task',
      resourceUsage: 30,
      dependencyStatus: 'ready',
      historicalSuccessRate: 0.9,
      isUrgent: false,
      estimatedDuration: 100,
    };

    const result = ruleEngine.evaluate(context);
    expect(result.decision).toBe('defer');
    expect(result.triggeredRules).toContain('CUSTOM_001');
  });

  // R9: 移除规则
  it('should remove rule by ID', () => {
    const removed = ruleEngine.removeRule('R001');
    expect(removed).toBe(true);

    const rules = ruleEngine.getRules();
    expect(rules.find(r => r.ruleId === 'R001')).toBeUndefined();
  });

  // R10: 置信度计算
  it('should calculate confidence correctly', () => {
    // 高置信度场景
    const highConfContext: DecisionContext = {
      taskId: 'task-high',
      resourceUsage: 95, // 远超阈值
      dependencyStatus: 'blocked',
      historicalSuccessRate: 0.1,
      isUrgent: true,
      estimatedDuration: 10000,
    };

    const highResult = ruleEngine.evaluate(highConfContext);
    expect(highResult.confidence).toBeGreaterThan(70);

    // 低置信度场景（刚好超过阈值）
    const lowConfContext: DecisionContext = {
      taskId: 'task-low',
      resourceUsage: 81, // 刚超阈值
      dependencyStatus: 'ready',
      historicalSuccessRate: 0.9,
      isUrgent: false,
      estimatedDuration: 100,
    };

    const lowResult = ruleEngine.evaluate(lowConfContext);
    expect(lowResult.confidence).toBeLessThan(100);
  });
});
