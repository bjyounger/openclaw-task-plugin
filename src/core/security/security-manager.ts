/**
 * OpenClaw Task Plugin v3.0 - Security Manager
 * 
 * 安全管理器，整合审计日志、数据加密、访问控制
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from '../managers/event-emitter';
import { OpenClawBridge } from '../bridge';
import { AuditLogger } from './audit-logger';
import { DataEncryptor } from './data-encryptor';
import { AccessControl } from './access-control';
import {
  SecurityManagerConfig,
  AuditLogEntry,
  AuditLogFilter,
  AuditLogStats,
  AccessDecision,
  AccessRule,
  Role,
  Permission,
  SecurityEvent,
  SecurityStatus,
  EncryptionResult,
  KeyRotationResult,
  KeyInfo,
  DataEncryptorConfig as EncryptorConfig,
  AccessControlConfig as AccessConfig,
} from './types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<SecurityManagerConfig> = {
  enabled: true,
};

/**
 * 安全管理器
 * 
 * 核心职责：
 * 1. 整合审计日志、数据加密、访问控制三大模块
 * 2. 提供统一的安全管理接口
 * 3. 与 OpenClawBridge 协作
 * 4. 处理安全事件
 */
export class SecurityManager {
  private config: Required<SecurityManagerConfig>;
  
  /** OpenClaw Bridge */
  private bridge: OpenClawBridge;
  
  /** 审计日志器 */
  private auditLogger: AuditLogger;
  
  /** 数据加密器 */
  private encryptor: DataEncryptor;
  
  /** 访问控制模块 */
  private accessControl: AccessControl;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter<{
    'security:event': { event: SecurityEvent };
    'security:initialized': { timestamp: number };
    'security:destroyed': { timestamp: number };
  }>;
  
  /** 安全事件记录 */
  private securityEvents: SecurityEvent[] = [];
  
  /** 是否已初始化 */
  private initialized: boolean = false;

  constructor(config: SecurityManagerConfig, bridge: OpenClawBridge) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<SecurityManagerConfig>;

    this.bridge = bridge;
    this.eventEmitter = new EventEmitter();

    // 创建审计日志器
    this.auditLogger = new AuditLogger({
      ...config.audit,
      enabled: config.audit.enabled && (config.enabled ?? true),
    });

    // 创建数据加密器
    this.encryptor = new DataEncryptor(config.encryption);

    // 创建访问控制模块
    this.accessControl = new AccessControl(
      config.accessControl,
      config.audit.enabled ? this.auditLogger : undefined
    );
  }

  // ==================== 生命周期管理 ====================

  /**
   * 初始化安全管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('SecurityManager already initialized');
    }

    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }

    try {
      // 1. 初始化加密器
      await this.encryptor.initialize();

      // 2. 初始化审计日志器（传入加密器用于敏感数据加密）
      if (this.config.audit.enabled) {
        this.auditLogger = new AuditLogger({
          ...this.config.audit,
          encryptor: this.encryptor,
        });
        await this.auditLogger.initialize();
      }

      // 3. 记录初始化事件
      await this.logSecurityEvent('suspicious_activity', 'initialize', {
        message: 'SecurityManager initialized',
      });

      this.initialized = true;

      // 4. 触发事件
      this.eventEmitter.emit('security:initialized', {
        timestamp: Date.now(),
      });

    } catch (error) {
      throw new Error(`Failed to initialize SecurityManager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁安全管理器
   */
  async destroy(): Promise<void> {
    if (!this.initialized) return;

    // 记录销毁事件
    await this.logSecurityEvent('suspicious_activity', 'destroy', {
      message: 'SecurityManager destroyed',
    });

    // 销毁各模块
    await this.auditLogger.destroy();
    this.encryptor.destroy();
    this.accessControl.destroy();

    // 清空事件
    this.eventEmitter.clearAll();
    this.securityEvents = [];

    this.initialized = false;

    this.eventEmitter.emit('security:destroyed', {
      timestamp: Date.now(),
    });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ==================== 审计日志接口 ====================

  /**
   * 记录操作日志
   */
  async logOperation(
    operation: string,
    targetType: string,
    action: string,
    options?: {
      sessionKey?: string;
      userId?: string;
      targetId?: string;
      parameters?: Record<string, unknown>;
      result?: 'success' | 'failure' | 'partial';
      error?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditLogEntry> {
    this.ensureInitialized();

    return this.auditLogger.log(
      operation as any,
      targetType as any,
      action,
      options
    );
  }

  /**
   * 查询审计日志
   */
  async queryAuditLogs(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    this.ensureInitialized();
    return this.auditLogger.query(filter);
  }

  /**
   * 获取审计日志统计
   */
  getAuditStats(): AuditLogStats {
    this.ensureInitialized();
    return this.auditLogger.getStats();
  }

  /**
   * 刷新审计日志缓冲区
   */
  async flushAuditLogs(): Promise<void> {
    this.ensureInitialized();
    await this.auditLogger.flush();
  }

  // ==================== 数据加密接口 ====================

  /**
   * 加密数据
   */
  async encryptData(data: string | Record<string, unknown>): Promise<EncryptionResult> {
    this.ensureInitialized();
    return this.encryptor.encrypt(data);
  }

  /**
   * 解密数据
   */
  async decryptData(encryptedData: EncryptionResult): Promise<string> {
    this.ensureInitialized();
    return this.encryptor.decryptToString(encryptedData);
  }

  /**
   * 解密数据为 JSON
   */
  async decryptDataToJson<T = Record<string, unknown>>(encryptedData: EncryptionResult): Promise<T> {
    this.ensureInitialized();
    return this.encryptor.decryptToJson<T>(encryptedData);
  }

  /**
   * 加密对象中的敏感字段
   */
  async encryptSensitiveFields<T extends Record<string, unknown>>(
    obj: T,
    fields?: string[]
  ): Promise<T & { _encryptedFields?: string[] }> {
    this.ensureInitialized();
    return this.encryptor.encryptSensitiveFields(obj, fields);
  }

  /**
   * 解密对象中的敏感字段
   */
  async decryptSensitiveFields<T extends Record<string, unknown>>(
    obj: T & { _encryptedFields?: string[] }
  ): Promise<T> {
    this.ensureInitialized();
    return this.encryptor.decryptSensitiveFields(obj);
  }

  /**
   * 轮换加密密钥
   */
  async rotateEncryptionKey(): Promise<KeyRotationResult> {
    this.ensureInitialized();

    const result = await this.encryptor.rotateKey();

    // 记录安全事件
    await this.logSecurityEvent('key_rotated', 'rotate', {
      success: result.success,
      oldKeyId: result.oldKeyId,
      newKeyId: result.newKeyId,
      error: result.error,
    });

    if (!result.success) {
      await this.logSecurityEvent('encryption_failed', 'rotate_failed', {
        error: result.error,
      }, 'error');
    }

    return result;
  }

  /**
   * 获取密钥信息
   */
  getKeyInfo(): KeyInfo | null {
    this.ensureInitialized();
    return this.encryptor.getKeyInfo();
  }

  // ==================== 访问控制接口 ====================

  /**
   * 检查访问权限
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
    this.ensureInitialized();
    return this.accessControl.checkAccess(userId, operation, resourceType, resourceId, context);
  }

  /**
   * 添加访问规则
   */
  addAccessRule(rule: Omit<AccessRule, 'id' | 'createdAt' | 'updatedAt'>): AccessRule {
    this.ensureInitialized();
    return this.accessControl.addRule(rule);
  }

  /**
   * 更新访问规则
   */
  updateAccessRule(ruleId: string, updates: Partial<Omit<AccessRule, 'id' | 'createdAt'>>): AccessRule | undefined {
    this.ensureInitialized();
    return this.accessControl.updateRule(ruleId, updates);
  }

  /**
   * 删除访问规则
   */
  removeAccessRule(ruleId: string): boolean {
    this.ensureInitialized();
    return this.accessControl.removeRule(ruleId);
  }

  /**
   * 获取所有访问规则
   */
  getAccessRules(): AccessRule[] {
    this.ensureInitialized();
    return this.accessControl.getRules();
  }

  /**
   * 设置用户角色
   */
  setUserRole(userId: string, role: Role): void {
    this.ensureInitialized();
    this.accessControl.setUserRole(userId, role);
  }

  /**
   * 获取用户角色
   */
  getUserRole(userId?: string): Role {
    if (!this.initialized) return 'guest';
    return this.accessControl.getUserRole(userId);
  }

  /**
   * 获取角色权限
   */
  getRolePermissions(role: Role): Permission[] {
    this.ensureInitialized();
    return this.accessControl.getRolePermissions(role);
  }

  // ==================== 安全事件接口 ====================

  /**
   * 记录安全事件
   */
  async logSecurityEvent(
    type: SecurityEvent['type'],
    action: string,
    details: Record<string, unknown>,
    severity: 'info' | 'warn' | 'error' | 'critical' = 'info'
  ): Promise<void> {
    const event: SecurityEvent = {
      type: type as any,
      timestamp: Date.now(),
      details: {
        action,
        ...details,
      },
      severity: severity as any,
    };

    this.securityEvents.push(event);

    // 限制事件数量
    if (this.securityEvents.length > 10000) {
      this.securityEvents.shift();
    }

    // 触发事件
    this.eventEmitter.emit('security:event', { event });

    // 同时记录到审计日志
    if (this.auditLogger.isEnabled()) {
      await this.auditLogger.log(
        'config',
        'audit_log',
        `security_${type}_${action}`,
        {
          category: 'security',
          severity,
          parameters: details,
        }
      );
    }
  }

  /**
   * 获取安全事件
   */
  getSecurityEvents(filter?: {
    type?: SecurityEvent['type'];
    severity?: SecurityEvent['severity'];
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): SecurityEvent[] {
    let events = [...this.securityEvents];

    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }

    if (filter?.severity) {
      events = events.filter(e => e.severity === filter.severity);
    }

    if (filter?.startTime) {
      events = events.filter(e => e.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      events = events.filter(e => e.timestamp <= filter.endTime!);
    }

    if (filter?.limit && events.length > filter.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  // ==================== 状态报告 ====================

  /**
   * 获取安全状态报告
   */
  async getSecurityStatus(): Promise<SecurityStatus> {
    this.ensureInitialized();

    const auditStats = this.auditLogger.getStats();
    const accessStats = this.accessControl.getStats();
    const keyInfo = this.encryptor.getKeyInfo();

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;

    const securityEvents24h = this.securityEvents.filter(e => e.timestamp >= last24h).length;
    const securityEvents7d = this.securityEvents.filter(e => e.timestamp >= last7d).length;

    // 计算安全评分
    let securityScore = 100;

    // 扣分项
    if (!auditStats.timeRange.earliest) {
      securityScore -= 10; // 无审计日志
    }

    const recentFailures = auditStats.byResult.failure;
    if (recentFailures > 10) {
      securityScore -= Math.min(20, Math.floor(recentFailures / 10) * 5);
    }

    const recentDenied = accessStats.deniedCount;
    if (recentDenied > 5) {
      securityScore -= Math.min(15, Math.floor(recentDenied / 5) * 3);
    }

    if (securityEvents24h > 5) {
      securityScore -= Math.min(15, Math.floor(securityEvents24h / 5) * 5);
    }

    // 确保分数在 0-100 之间
    securityScore = Math.max(0, Math.min(100, securityScore));

    return {
      auditLogger: {
        enabled: this.auditLogger.isEnabled(),
        totalEntries: auditStats.totalEntries,
        lastEntryTime: auditStats.timeRange.latest,
      },
      encryption: {
        enabled: true,
        activeKeyId: keyInfo?.keyId || 'unknown',
        keyCreatedAt: keyInfo?.createdAt || 0,
        rotationCount: keyInfo?.rotationCount || 0,
      },
      accessControl: {
        enabled: true,
        totalRules: accessStats.totalRules,
        deniedCount: accessStats.deniedCount,
      },
      securityEvents: {
        last24h: securityEvents24h,
        last7d: securityEvents7d,
      },
      securityScore,
    };
  }

  // ==================== 事件监听 ====================

  /**
   * 注册事件监听器
   */
  on<K extends 'security:event' | 'security:initialized' | 'security:destroyed'>(
    eventType: K,
    listener: (event: any) => void
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }

  // ==================== 私有方法 ====================

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecurityManager not initialized. Call initialize() first.');
    }
  }
}

// 导出类型和模块
export * from './types';
export { AuditLogger } from './audit-logger';
export { DataEncryptor } from './data-encryptor';
export { AccessControl } from './access-control';
