/**
 * OpenClaw Task Plugin v3.0 - Security Module Index
 * 
 * 安全模块统一导出
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

// 核心模块
export { SecurityManager } from './security-manager';
export { AuditLogger } from './audit-logger';
export { DataEncryptor } from './data-encryptor';
export { AccessControl } from './access-control';

// 类型导出 - 全部从 types.ts 统一导出
export type {
  AuditLogEntry,
  AuditLogFilter,
  AuditLogStats,
  AuditOperation,
  AuditTargetType,
  AuditResult,
  AuditCategory,
  AuditSeverity,
  AuditLoggerConfig,
  AccessLogEntry,
  Role,
  Permission,
  AccessRule,
  AccessDecision,
  AccessControlConfig,
  EncryptionAlgorithm,
  EncryptionResult,
  KeyInfo,
  KeyRotationResult,
  DataEncryptorConfig,
  SecurityManagerConfig,
  SecurityEvent,
  SecurityStatus,
} from './types';
