import { OpenClawBridge, OpenClawBridgeConfig } from './core/bridge';
import { SecurityManager, SecurityManagerConfig } from './core/security';

/**
 * OpenClaw Task Plugin v3.0
 * 
 * 主要导出文件
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

// 核心类型导出
export * from './core/types';

// OpenClaw Bridge 导出
export { OpenClawBridge, OpenClawBridgeConfig } from './core/bridge';

// SessionTaskManager 导出
export { SessionTaskManager } from './core/managers/session-task-manager';
export {
  SessionTaskManagerConfig,
  TaskCreateOptions,
  SubTaskCreateParams,
  TaskQueryFilter,
  HealthCheckResult,
  HealthIssue,
  TaskManagerStats,
  TaskManagerEvents,
  TaskMemory,
  SubTaskMemory,
  ErrorCode,
  SessionTaskManagerError,
  isTaskStatus,
  isTaskRuntime,
} from './core/managers/types';

// Security Manager 导出
export { SecurityManager } from './core/security/security-manager';
export type { SecurityManagerConfig } from './core/security/types';

// Security sub-modules
export { AuditLogger } from './core/security/audit-logger';
export { DataEncryptor } from './core/security/data-encryptor';
export { AccessControl } from './core/security/access-control';

// Security types
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
  DataEncryptorConfig,
  EncryptionResult,
  KeyInfo,
  KeyRotationResult,
  SecurityEvent,
  SecurityStatus,
} from './core/security/types';

// 版本信息
export const VERSION = '3.0.0';
export const OPENCLAW_MIN_VERSION = '2026.4.9';

/**
 * 检查OpenClaw版本兼容性
 */
export function checkOpenClawVersion(api: any): {
  compatible: boolean;
  reason?: string;
} {
  // 检查关键API是否存在
  if (!api?.runtime?.taskFlow?.fromToolContext) {
    return {
      compatible: false,
      reason: 'OpenClaw taskFlow API not available. Requires OpenClaw >= 2026.4.9',
    };
  }
  
  if (!api?.runtime?.tasks?.runs?.fromToolContext) {
    return {
      compatible: false,
      reason: 'OpenClaw tasks.runs API not available. Requires OpenClaw >= 2026.4.9',
    };
  }
  
  return {
    compatible: true,
  };
}

/**
 * 创建OpenClaw Bridge实例
 */
export function createBridge(config: {
  api: unknown;
  sessionKey: string;
  deliveryContext?: unknown;
}): OpenClawBridge {
  return new OpenClawBridge(config as OpenClawBridgeConfig);
}
