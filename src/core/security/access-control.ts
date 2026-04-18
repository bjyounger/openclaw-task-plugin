/**
 * OpenClaw Task Plugin v3.0 - Access Control
 * 
 * 访问控制模块，提供基于角色的访问控制（RBAC）
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import { EventEmitter } from '../managers/event-emitter';
import { AuditLogger } from './audit-logger';
import {
  AccessLogEntry,
  AccessDecision,
  AccessRule,
  AccessControlConfig,
  Role,
  Permission,
} from './types';

/**
 * 默认角色权限映射
 */
const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'task:create', 'task:read', 'task:update', 'task:delete', 'task:cancel',
    'flow:create', 'flow:read', 'flow:update', 'flow:delete', 'flow:cancel',
    'memory:read', 'memory:write',
    'config:read', 'config:write',
    'audit:read', 'audit:export',
    'key:manage',
  ],
  operator: [
    'task:create', 'task:read', 'task:update', 'task:cancel',
    'flow:create', 'flow:read', 'flow:update', 'flow:cancel',
    'memory:read', 'memory:write',
    'config:read',
    'audit:read',
  ],
  viewer: [
    'task:read',
    'flow:read',
    'memory:read',
    'config:read',
    'audit:read',
  ],
  guest: [
    'task:read',
    'flow:read',
  ],
};

/**
 * 访问控制模块
 * 
 * 功能：
 * - 基于角色的访问控制（RBAC）
 * - 自定义访问规则
 * - 访问日志记录
 * - 权限检查
 */
export class AccessControl {
  private config: Required<AccessControlConfig>;
  
  /** 访问规则列表 */
  private rules: AccessRule[] = [];
  
  /** 用户角色映射 */
  private userRoles: Map<string, Role> = new Map();
  
  /** 角色权限映射 */
  private rolePermissions: Map<Role, Permission[]> = new Map();
  
  /** 审计日志器 */
  private auditLogger?: AuditLogger;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter<{
    'access:allowed': { entry: AccessLogEntry };
    'access:denied': { entry: AccessLogEntry };
  }>;
  
  /** 访问日志 */
  private accessLogs: AccessLogEntry[] = [];
  
  /** 统计信息 */
  private stats = {
    allowedCount: 0,
    deniedCount: 0,
  };

  constructor(config: AccessControlConfig, auditLogger?: AuditLogger) {
    this.config = {
      defaultPolicy: config.defaultPolicy || 'deny',
      rules: config.rules || [],
      rolePermissions: config.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
      userRoles: config.userRoles || {},
    };

    this.auditLogger = auditLogger;
    this.eventEmitter = new EventEmitter();

    // 初始化角色权限映射
    this.initRolePermissions();

    // 初始化用户角色映射
    this.initUserRoles();

    // 初始化访问规则
    this.initRules();
  }

  /**
   * 检查访问权限
   * 
   * @param userId 用户ID
   * @param operation 操作
   * @param resourceType 资源类型
   * @param resourceId 资源ID（可选）
   * @param context 上下文信息（可选）
   */
  async checkAccess(
    userId: string | undefined,
    operation: string,
    resourceType: string,
    resourceId?: string,
    context?: {
      sessionKey?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AccessDecision> {
    const now = Date.now();

    // 获取用户角色
    const role = this.getUserRole(userId);

    // 检查自定义规则
    const ruleResult = await this.checkRules(userId, operation, resourceType, resourceId);
    if (ruleResult.matched) {
      const entry = this.createAccessLog({
        userId,
        sessionKey: context?.sessionKey || 'unknown',
        operation,
        resourceType,
        resourceId,
        allowed: ruleResult.allowed,
        reason: ruleResult.reason,
        matchedRuleId: ruleResult.ruleId,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      await this.logAccess(entry);
      return {
        allowed: ruleResult.allowed,
        matchedRule: ruleResult.rule,
        reason: ruleResult.reason,
        decidedAt: now,
      };
    }

    // 检查角色权限
    const permission = this.getPermission(operation, resourceType);
    const hasPermission = this.checkRolePermission(role, permission);

    // 应用默认策略
    const allowed = hasPermission || this.config.defaultPolicy === 'allow';

    const entry = this.createAccessLog({
      userId,
      sessionKey: context?.sessionKey || 'unknown',
      operation,
      resourceType,
      resourceId,
      allowed,
      reason: allowed ? undefined : `No permission: ${permission}`,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    await this.logAccess(entry);

    return {
      allowed,
      reason: allowed ? undefined : `No permission: ${permission}`,
      decidedAt: now,
    };
  }

  /**
   * 添加访问规则
   */
  addRule(rule: Omit<AccessRule, 'id' | 'createdAt' | 'updatedAt'>): AccessRule {
    const newRule: AccessRule = {
      ...rule,
      id: this.generateRuleId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rules.push(newRule);
    this.sortRules();

    return newRule;
  }

  /**
   * 更新访问规则
   */
  updateRule(ruleId: string, updates: Partial<Omit<AccessRule, 'id' | 'createdAt'>>): AccessRule | undefined {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return undefined;

    const rule = this.rules[index];
    this.rules[index] = {
      ...rule,
      ...updates,
      updatedAt: Date.now(),
    };

    this.sortRules();
    return this.rules[index];
  }

  /**
   * 删除访问规则
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    this.rules.splice(index, 1);
    return true;
  }

  /**
   * 获取所有规则
   */
  getRules(): AccessRule[] {
    return [...this.rules];
  }

  /**
   * 设置用户角色
   */
  setUserRole(userId: string, role: Role): void {
    this.userRoles.set(userId, role);
  }

  /**
   * 获取用户角色
   */
  getUserRole(userId?: string): Role {
    if (!userId) return 'guest';
    return this.userRoles.get(userId) || 'guest';
  }

  /**
   * 移除用户角色
   */
  removeUserRole(userId: string): void {
    this.userRoles.delete(userId);
  }

  /**
   * 设置角色权限
   */
  setRolePermissions(role: Role, permissions: Permission[]): void {
    this.rolePermissions.set(role, permissions);
  }

  /**
   * 获取角色权限
   */
  getRolePermissions(role: Role): Permission[] {
    return [...(this.rolePermissions.get(role) || [])];
  }

  /**
   * 获取访问日志
   */
  getAccessLogs(filter?: {
    userId?: string;
    allowed?: boolean;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AccessLogEntry[] {
    let logs = [...this.accessLogs];

    if (filter?.userId) {
      logs = logs.filter(l => l.userId === filter.userId);
    }

    if (filter?.allowed !== undefined) {
      logs = logs.filter(l => l.allowed === filter.allowed);
    }

    if (filter?.startTime) {
      logs = logs.filter(l => l.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      logs = logs.filter(l => l.timestamp <= filter.endTime!);
    }

    if (filter?.limit && logs.length > filter.limit) {
      logs = logs.slice(-filter.limit);
    }

    return logs;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    allowedCount: number;
    deniedCount: number;
    totalRules: number;
    totalUsers: number;
  } {
    return {
      allowedCount: this.stats.allowedCount,
      deniedCount: this.stats.deniedCount,
      totalRules: this.rules.length,
      totalUsers: this.userRoles.size,
    };
  }

  /**
   * 注册事件监听器
   */
  on<K extends 'access:allowed' | 'access:denied'>(
    eventType: K,
    listener: (event: { entry: AccessLogEntry }) => void
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }

  /**
   * 销毁访问控制模块
   */
  destroy(): void {
    this.rules = [];
    this.userRoles.clear();
    this.rolePermissions.clear();
    this.accessLogs = [];
    this.eventEmitter.clearAll();
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化角色权限映射
   */
  private initRolePermissions(): void {
    const mappings = this.config.rolePermissions || DEFAULT_ROLE_PERMISSIONS;

    for (const [role, permissions] of Object.entries(mappings)) {
      if (permissions) {
        this.rolePermissions.set(role as Role, permissions);
      }
    }
  }

  /**
   * 初始化用户角色映射
   */
  private initUserRoles(): void {
    for (const [userId, role] of Object.entries(this.config.userRoles || {})) {
      this.userRoles.set(userId, role);
    }
  }

  /**
   * 初始化访问规则
   */
  private initRules(): void {
    for (const rule of this.config.rules || []) {
      this.rules.push({
        ...rule,
        id: rule.id || this.generateRuleId(),
        createdAt: rule.createdAt || Date.now(),
        updatedAt: rule.updatedAt || Date.now(),
      });
    }
    this.sortRules();
  }

  /**
   * 排序规则（按优先级降序）
   */
  private sortRules(): void {
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查自定义规则
   */
  private async checkRules(
    userId: string | undefined,
    operation: string,
    resourceType: string,
    resourceId?: string
  ): Promise<{
    matched: boolean;
    allowed: boolean;
    reason?: string;
    ruleId?: string;
    rule?: AccessRule;
  }> {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // 检查角色匹配
      const userRole = this.getUserRole(userId);
      if (rule.role !== userRole) continue;

      // 检查权限匹配
      const permission = this.getPermission(operation, resourceType);
      if (!rule.permissions.includes(permission)) continue;

      // 检查资源模式匹配
      if (rule.resourcePattern && resourceId) {
        if (!this.matchPattern(resourceId, rule.resourcePattern)) {
          continue;
        }
      }

      // 规则匹配
      const permissionGranted = rule.permissions.some(p => p === permission);
      return {
        matched: true,
        allowed: permissionGranted,
        reason: permissionGranted ? undefined : `Rule denied: ${rule.name}`,
        ruleId: rule.id,
        rule,
      };
    }

    return { matched: false, allowed: false };
  }

  /**
   * 检查角色权限
   */
  private checkRolePermission(role: Role, permission: Permission): boolean {
    const permissions = this.rolePermissions.get(role) || [];
    return permissions.includes(permission);
  }

  /**
   * 获取权限字符串
   */
  private getPermission(operation: string, resourceType: string): Permission {
    // 将操作和资源类型组合成权限字符串
    const resourceMap: Record<string, string> = {
      task: 'task',
      flow: 'flow',
      subtask: 'task',
      memory: 'memory',
      config: 'config',
      session: 'flow',
      audit_log: 'audit',
      key: 'key',
      access_rule: 'config',
    };

    const resource = resourceMap[resourceType] || resourceType;
    return `${resource}:${operation}` as Permission;
  }

  /**
   * 匹配模式（支持通配符）
   */
  private matchPattern(value: string, pattern: string): boolean {
    // 将通配符模式转换为正则表达式
    const regex = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    
    return new RegExp(`^${regex}$`).test(value);
  }

  /**
   * 创建访问日志条目
   */
  private createAccessLog(options: {
    userId?: string;
    sessionKey: string;
    operation: string;
    resourceType: string;
    resourceId?: string;
    allowed: boolean;
    reason?: string;
    matchedRuleId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): AccessLogEntry {
    return {
      id: this.generateLogId(),
      timestamp: Date.now(),
      userId: options.userId,
      sessionKey: options.sessionKey,
      operation: options.operation,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      allowed: options.allowed,
      reason: options.reason,
      matchedRuleId: options.matchedRuleId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    };
  }

  /**
   * 记录访问日志
   */
  private async logAccess(entry: AccessLogEntry): Promise<void> {
    // 保存到内存日志
    this.accessLogs.push(entry);

    // 限制日志大小
    if (this.accessLogs.length > 10000) {
      this.accessLogs.shift();
    }

    // 更新统计
    if (entry.allowed) {
      this.stats.allowedCount++;
    } else {
      this.stats.deniedCount++;
    }

    // 触发事件
    this.eventEmitter.emit(
      entry.allowed ? 'access:allowed' : 'access:denied',
      { entry }
    );

    // 记录到审计日志
    if (this.auditLogger) {
      await this.auditLogger.log(
        'access',
        'session',
        entry.allowed ? 'access_granted' : 'access_denied',
        {
          sessionKey: entry.sessionKey,
          userId: entry.userId,
          targetId: entry.resourceId,
          parameters: {
            operation: entry.operation,
            resourceType: entry.resourceType,
          },
          result: entry.allowed ? 'success' : 'failure',
          category: 'access',
          severity: entry.allowed ? 'info' : 'warn',
        }
      );
    }
  }

  /**
   * 生成规则ID
   */
  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成日志ID
   */
  private generateLogId(): string {
    return `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
