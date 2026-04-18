/**
 * OpenClaw Task Plugin v3.0 - Security Types
 * 
 * 审计日志与安全增强的类型定义
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

// ==================== 审计日志类型 ====================

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 唯一标识 */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 会话标识 */
  sessionKey: string;
  /** 用户ID（可选） */
  userId?: string;
  /** 操作类型 */
  operation: AuditOperation;
  /** 目标类型 */
  targetType: AuditTargetType;
  /** 目标ID */
  targetId?: string;
  /** 具体动作 */
  action: string;
  /** 操作参数（敏感字段加密存储） */
  parameters?: Record<string, unknown>;
  /** 操作结果 */
  result: AuditResult;
  /** 错误信息 */
  error?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** IP地址 */
  ipAddress?: string;
  /** 用户代理 */
  userAgent?: string;
  /** 日志分类 */
  category: AuditCategory;
  /** 严重级别 */
  severity: AuditSeverity;
}

/**
 * 审计操作类型
 */
export type AuditOperation =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'query'
  | 'login'
  | 'logout'
  | 'access'
  | 'config'
  | 'export'
  | 'import'
  | 'encrypt'
  | 'decrypt'
  | 'key_rotate';

/**
 * 审计目标类型
 */
export type AuditTargetType =
  | 'task'
  | 'flow'
  | 'subtask'
  | 'memory'
  | 'config'
  | 'session'
  | 'key'
  | 'audit_log'
  | 'access_rule';

/**
 * 审计结果
 */
export type AuditResult = 'success' | 'failure' | 'partial';

/**
 * 审计日志分类
 */
export type AuditCategory =
  | 'operation'    // 操作日志
  | 'security'     // 安全日志
  | 'performance'  // 性能日志
  | 'access';      // 访问日志

/**
 * 审计严重级别
 */
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * 审计日志查询过滤器
 */
export interface AuditLogFilter {
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 操作类型过滤 */
  operation?: AuditOperation | AuditOperation[];
  /** 目标类型过滤 */
  targetType?: AuditTargetType | AuditTargetType[];
  /** 结果过滤 */
  result?: AuditResult | AuditResult[];
  /** 分类过滤 */
  category?: AuditCategory | AuditCategory[];
  /** 严重级别过滤 */
  severity?: AuditSeverity | AuditSeverity[];
  /** 会话标识过滤 */
  sessionKey?: string;
  /** 用户ID过滤 */
  userId?: string;
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * 审计日志统计
 */
export interface AuditLogStats {
  /** 总记录数 */
  totalEntries: number;
  /** 按分类统计 */
  byCategory: Record<AuditCategory, number>;
  /** 按严重级别统计 */
  bySeverity: Record<AuditSeverity, number>;
  /** 按操作类型统计 */
  byOperation: Partial<Record<AuditOperation, number>>;
  /** 按结果统计 */
  byResult: Record<AuditResult, number>;
  /** 时间范围 */
  timeRange: {
    earliest: number | null;
    latest: number | null;
  };
}

// ==================== 访问控制类型 ====================

/**
 * 访问日志条目
 */
export interface AccessLogEntry {
  /** 唯一标识 */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 用户ID */
  userId?: string;
  /** 会话标识 */
  sessionKey: string;
  /** 请求的操作 */
  operation: string;
  /** 资源类型 */
  resourceType: string;
  /** 资源ID */
  resourceId?: string;
  /** 是否允许 */
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** IP地址 */
  ipAddress?: string;
  /** 用户代理 */
  userAgent?: string;
  /** 匹配的规则ID */
  matchedRuleId?: string;
}

/**
 * 角色
 */
export type Role = 'admin' | 'operator' | 'viewer' | 'guest';

/**
 * 权限
 */
export type Permission =
  | 'task:create'
  | 'task:read'
  | 'task:update'
  | 'task:delete'
  | 'task:cancel'
  | 'flow:create'
  | 'flow:read'
  | 'flow:update'
  | 'flow:delete'
  | 'flow:cancel'
  | 'memory:read'
  | 'memory:write'
  | 'config:read'
  | 'config:write'
  | 'audit:read'
  | 'audit:export'
  | 'key:manage';

/**
 * 访问控制规则
 */
export interface AccessRule {
  /** 规则ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 角色 */
  role: Role;
  /** 允许的权限 */
  permissions: Permission[];
  /** 资源模式（支持通配符） */
  resourcePattern?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级（数值越大优先级越高） */
  priority: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 访问控制决策
 */
export interface AccessDecision {
  /** 是否允许 */
  allowed: boolean;
  /** 匹配的规则 */
  matchedRule?: AccessRule;
  /** 拒绝原因 */
  reason?: string;
  /** 决策时间 */
  decidedAt: number;
}

/**
 * 访问控制配置
 */
export interface AccessControlConfig {
  /** 默认策略：allow 或 deny */
  defaultPolicy: 'allow' | 'deny';
  /** 自定义规则 */
  rules?: AccessRule[];
  /** 角色权限映射 */
  rolePermissions?: Partial<Record<Role, Permission[]>>;
  /** 用户角色映射 */
  userRoles?: Record<string, Role>;
}

// ==================== 数据加密类型 ====================

/**
 * 加密算法
 */
export type EncryptionAlgorithm = 'aes-256-gcm';

/**
 * 加密结果
 */
export interface EncryptionResult {
  /** 加密数据（Base64编码） */
  encrypted: string;
  /** 初始化向量（Base64编码） */
  iv: string;
  /** 认证标签（Base64编码） */
  authTag: string;
  /** 使用的算法 */
  algorithm: EncryptionAlgorithm;
  /** 加密时间 */
  timestamp: number;
}

/**
 * 密钥信息
 */
export interface KeyInfo {
  /** 密钥ID */
  keyId: string;
  /** 创建时间 */
  createdAt: number;
  /** 是否激活 */
  active: boolean;
  /** 轮换次数 */
  rotationCount: number;
  /** 上次轮换时间 */
  lastRotatedAt?: number;
  /** 过期时间 */
  expiresAt?: number;
}

/**
 * 密钥轮换结果
 */
export interface KeyRotationResult {
  /** 旧密钥ID */
  oldKeyId: string;
  /** 新密钥ID */
  newKeyId: string;
  /** 轮换时间 */
  rotatedAt: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 数据加密配置
 */
export interface DataEncryptorConfig {
  /** 主密钥（Base64编码，32字节 for AES-256） */
  masterKey?: string;
  /** 密钥文件路径 */
  keyFilePath?: string;
  /** 环境变量名 */
  envKeyName?: string;
  /** 密钥轮换间隔（毫秒，0表示不自动轮换） */
  rotationIntervalMs?: number;
  /** 加密算法 */
  algorithm?: EncryptionAlgorithm;
  /** 需要加密的敏感字段名 */
  sensitiveFields?: string[];
}

// ==================== SecurityManager 类型 ====================

/**
 * SecurityManager 配置
 */
export interface SecurityManagerConfig {
  /** 审计日志配置 */
  audit: {
    /** 日志存储目录 */
    logDir: string;
    /** 是否启用 */
    enabled: boolean;
    /** 缓冲区大小（条数） */
    bufferSize?: number;
    /** 刷盘间隔（毫秒） */
    flushIntervalMs?: number;
  };
  /** 加密配置 */
  encryption: DataEncryptorConfig;
  /** 访问控制配置 */
  accessControl: AccessControlConfig;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 审计日志配置
 */
export interface AuditLoggerConfig {
  /** 日志存储目录 */
  logDir: string;
  /** 是否启用 */
  enabled: boolean;
  /** 缓冲区大小（条数） */
  bufferSize?: number;
  /** 刷盘间隔（毫秒） */
  flushIntervalMs?: number;
  /** 数据加密器（可选，实际类型为 DataEncryptor） */
  encryptor?: unknown;
  /** 需要加密的敏感字段 */
  sensitiveFields?: string[];
  /** 是否启用索引 */
  enableIndex?: boolean;
  /** 日志保留天数 */
  retentionDays?: number;
}

// Note: DataEncryptorConfig and AccessControlConfig are already defined above

/**
 * 安全事件
 */
export interface SecurityEvent {
  /** 事件类型 */
  type: 'access_denied' | 'encryption_failed' | 'decryption_failed' | 'key_rotated' | 'suspicious_activity';
  /** 时间戳 */
  timestamp: number;
  /** 事件详情 */
  details: Record<string, unknown>;
  /** 严重级别 */
  severity: AuditSeverity;
}

/**
 * 安全状态报告
 */
export interface SecurityStatus {
  /** 审计日志状态 */
  auditLogger: {
    enabled: boolean;
    totalEntries: number;
    lastEntryTime: number | null;
  };
  /** 加密状态 */
  encryption: {
    enabled: boolean;
    activeKeyId: string;
    keyCreatedAt: number;
    rotationCount: number;
  };
  /** 访问控制状态 */
  accessControl: {
    enabled: boolean;
    totalRules: number;
    deniedCount: number;
  };
  /** 安全事件计数 */
  securityEvents: {
    last24h: number;
    last7d: number;
  };
  /** 整体安全评分 */
  securityScore: number;
}
