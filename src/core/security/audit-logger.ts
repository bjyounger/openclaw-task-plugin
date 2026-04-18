/**
 * OpenClaw Task Plugin v3.0 - Audit Logger
 * 
 * 审计日志系统，记录所有操作事件
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from '../managers/event-emitter';
import { DataEncryptor } from './data-encryptor';
import {
  AuditLogEntry,
  AuditLogFilter,
  AuditLogStats,
  AuditOperation,
  AuditTargetType,
  AuditResult,
  AuditCategory,
  AuditSeverity,
  AuditLoggerConfig,
} from './types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<AuditLoggerConfig> = {
  bufferSize: 100,
  flushIntervalMs: 5000, // 5秒
  sensitiveFields: ['userId', 'sessionKey', 'parameters', 'metadata'],
  enableIndex: true,
  retentionDays: 90,
};

/**
 * 审计日志器
 * 
 * 功能：
 * - 记录所有操作事件（谁、什么时间、做了什么、结果如何）
 * - 结构化存储（JSON格式）
 * - 自动滚动（按日期分文件）
 * - 加密敏感字段
 * - 支持查询和统计
 */
export class AuditLogger {
  private config: Omit<Required<AuditLoggerConfig>, 'encryptor'> & { encryptor?: DataEncryptor };
  
  /** 日志缓冲区 */
  private buffer: AuditLogEntry[] = [];
  
  /** 刷盘定时器 */
  private flushTimer?: ReturnType<typeof setInterval>;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter<{
    'audit:logged': { entry: AuditLogEntry };
    'audit:flushed': { count: number };
    'audit:error': { error: string };
  }>;
  
  /** 当前日志文件路径 */
  private currentLogFile?: string;
  
  /** 索引缓存 */
  private indexCache: Map<string, AuditLogEntry[]> = new Map();
  
  /** 统计信息 */
  private stats: AuditLogStats;

  constructor(config: AuditLoggerConfig) {
    const { encryptor, ...restConfig } = config;
    this.config = {
      ...DEFAULT_CONFIG,
      ...restConfig,
      encryptor: encryptor as DataEncryptor | undefined,
    } as Omit<Required<AuditLoggerConfig>, 'encryptor'> & { encryptor?: DataEncryptor };

    this.eventEmitter = new EventEmitter();
    this.stats = this.initStats();
  }

  /**
   * 初始化审计日志器
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // 创建日志目录
    if (!fs.existsSync(this.config.logDir)) {
      await fs.promises.mkdir(this.config.logDir, { recursive: true });
    }

    // 初始化当前日志文件
    this.currentLogFile = this.getLogFilePath(new Date());

    // 启动定时刷盘
    this.startFlushTimer();

    // 初始化加密器（如果有）
    if (this.config.encryptor && !this.config.encryptor.isInitialized()) {
      await this.config.encryptor.initialize();
    }
  }

  /**
   * 记录审计日志
   */
  async log(
    operation: AuditOperation,
    targetType: AuditTargetType,
    action: string,
    options?: {
      sessionKey?: string;
      userId?: string;
      targetId?: string;
      parameters?: Record<string, unknown>;
      result?: AuditResult;
      error?: string;
      metadata?: Record<string, unknown>;
      category?: AuditCategory;
      severity?: AuditSeverity;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditLogEntry> {
    if (!this.config.enabled) {
      // 返回空记录
      return this.createEntry(operation, targetType, action, options || {});
    }

    const entry = this.createEntry(operation, targetType, action, options || {});

    // 加密敏感字段
    if (this.config.encryptor && entry.parameters) {
      entry.parameters = await this.encryptSensitiveData(entry.parameters);
    }

    // 添加到缓冲区
    this.buffer.push(entry);

    // 更新统计
    this.updateStats(entry);

    // 更新索引
    if (this.config.enableIndex) {
      this.updateIndex(entry);
    }

    // 触发事件
    this.eventEmitter.emit('audit:logged', { entry });

    // 如果缓冲区满了，立即刷盘
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }

    return entry;
  }

  /**
   * 查询审计日志
   */
  async query(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    if (!this.config.enabled) {
      return [];
    }

    // 先刷盘确保所有数据持久化
    await this.flush();

    // 获取时间范围内的日志文件
    const logFiles = this.getLogFiles(filter?.startTime, filter?.endTime);

    // 加载并过滤日志
    const entries: AuditLogEntry[] = [];

    for (const file of logFiles) {
      const fileEntries = await this.loadLogFile(file);
      const filtered = this.applyFilter(fileEntries, filter);
      entries.push(...filtered);
    }

    // 应用 offset 和 limit
    if (filter?.offset) {
      entries.splice(0, filter.offset);
    }

    if (filter?.limit && entries.length > filter.limit) {
      entries.splice(filter.limit);
    }

    // 解密敏感字段
    if (this.config.encryptor) {
      for (const entry of entries) {
        if (entry.parameters) {
          try {
            entry.parameters = await this.decryptSensitiveData(entry.parameters);
          } catch {
            // 解密失败，保留原值
          }
        }
      }
    }

    return entries;
  }

  /**
   * 获取统计信息
   */
  getStats(): AuditLogStats {
    return { ...this.stats };
  }

  /**
   * 刷新统计信息（重新计算）
   */
  async refreshStats(): Promise<AuditLogStats> {
    const entries = await this.query();
    this.stats = this.calculateStats(entries);
    return this.stats;
  }

  /**
   * 强制刷盘
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      await this.writeToFile(entriesToFlush);
      this.eventEmitter.emit('audit:flushed', { count: entriesToFlush.length });
    } catch (error) {
      // 写入失败，将数据放回缓冲区
      this.buffer.unshift(...entriesToFlush);
      this.eventEmitter.emit('audit:logged', { 
        error: error instanceof Error ? error.message : String(error) 
      } as any);
      throw error;
    }
  }

  /**
   * 注册事件监听器
   */
  on<K extends 'audit:logged' | 'audit:flushed' | 'audit:error'>(
    eventType: K,
    listener: (event: { entry?: AuditLogEntry; count?: number; error?: string }) => void
  ): () => void {
    return this.eventEmitter.on(eventType, listener);
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 销毁审计日志器
   */
  async destroy(): Promise<void> {
    // 停止定时刷盘
    this.stopFlushTimer();

    // 刷新缓冲区
    await this.flush();

    // 清除索引缓存
    this.indexCache.clear();

    // 清空事件监听器
    this.eventEmitter.clearAll();
  }

  // ==================== 私有方法 ====================

  /**
   * 创建日志条目
   */
  private createEntry(
    operation: AuditOperation,
    targetType: AuditTargetType,
    action: string,
    options: {
      sessionKey?: string;
      userId?: string;
      targetId?: string;
      parameters?: Record<string, unknown>;
      result?: AuditResult;
      error?: string;
      metadata?: Record<string, unknown>;
      category?: AuditCategory;
      severity?: AuditSeverity;
      ipAddress?: string;
      userAgent?: string;
    }
  ): AuditLogEntry {
    return {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      sessionKey: options.sessionKey || 'unknown',
      userId: options.userId,
      operation,
      targetType,
      targetId: options.targetId,
      action,
      parameters: options.parameters,
      result: options.result || 'success',
      error: options.error,
      metadata: options.metadata,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      category: options.category || this.determineCategory(operation),
      severity: options.severity || this.determineSeverity(operation, options.result),
    };
  }

  /**
   * 确定日志分类
   */
  private determineCategory(operation: AuditOperation): AuditCategory {
    if (['login', 'logout', 'access'].includes(operation)) {
      return 'security';
    }
    if (['encrypt', 'decrypt', 'key_rotate'].includes(operation)) {
      return 'security';
    }
    if (['config'].includes(operation)) {
      return 'access';
    }
    return 'operation';
  }

  /**
   * 确定严重级别
   */
  private determineSeverity(operation: AuditOperation, result?: AuditResult): AuditSeverity {
    if (result === 'failure') {
      return 'error';
    }
    if (['login', 'logout', 'key_rotate', 'encrypt', 'decrypt'].includes(operation)) {
      return 'warn';
    }
    if (['delete', 'cancel'].includes(operation)) {
      return 'warn';
    }
    return 'info';
  }

  /**
   * 加密敏感数据
   */
  private async encryptSensitiveData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const encryptedData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.config.sensitiveFields.includes(key) && value !== undefined && value !== null) {
        try {
          const encrypted = await this.config.encryptor!.encrypt(
            typeof value === 'object' ? JSON.stringify(value) : String(value)
          );
          encryptedData[key] = { _encrypted: true, data: encrypted };
        } catch {
          encryptedData[key] = value; // 加密失败，保留原值
        }
      } else {
        encryptedData[key] = value;
      }
    }

    return encryptedData;
  }

  /**
   * 解密敏感数据
   */
  private async decryptSensitiveData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const decryptedData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null && '_encrypted' in value) {
        try {
          const encryptedData = (value as any).data;
          const decrypted = await this.config.encryptor!.decryptToString(encryptedData);
          decryptedData[key] = decrypted;
        } catch {
          decryptedData[key] = value; // 解密失败，保留原值
        }
      } else {
        decryptedData[key] = value;
      }
    }

    return decryptedData;
  }

  /**
   * 写入日志到文件
   */
  private async writeToFile(entries: AuditLogEntry[]): Promise<void> {
    if (!this.currentLogFile) {
      this.currentLogFile = this.getLogFilePath(new Date());
    }

    // 检查是否需要滚动（新的一天）
    const today = this.getLogFilePath(new Date());
    if (today !== this.currentLogFile) {
      this.currentLogFile = today;
    }

    // 追加写入
    const lines = entries.map(entry => JSON.stringify(entry));
    const content = lines.join('\n') + '\n';

    await fs.promises.appendFile(this.currentLogFile, content, 'utf-8');
  }

  /**
   * 加载日志文件
   */
  private async loadLogFile(filePath: string): Promise<AuditLogEntry[]> {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    return lines.map(line => {
      try {
        return JSON.parse(line) as AuditLogEntry;
      } catch {
        return null as any;
      }
    }).filter(entry => entry !== null);
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(date: Date): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.config.logDir, `audit-${dateStr}.json`);
  }

  /**
   * 获取时间范围内的日志文件
   */
  private getLogFiles(startTime?: number, endTime?: number): string[] {
    const files = fs.readdirSync(this.config.logDir)
      .filter(file => file.startsWith('audit-') && file.endsWith('.json'))
      .sort();

    if (!startTime && !endTime) {
      return files.map(file => path.join(this.config.logDir, file));
    }

    const result: string[] = [];
    const now = Date.now();

    for (const file of files) {
      const dateStr = file.replace('audit-', '').replace('.json', '');
      const fileDate = new Date(dateStr).getTime();
      const fileEnd = fileDate + 24 * 60 * 60 * 1000 - 1; // 当天结束

      // 检查时间范围
      if (startTime && fileEnd < startTime) continue;
      if (endTime && fileDate > endTime) continue;

      result.push(path.join(this.config.logDir, file));
    }

    return result;
  }

  /**
   * 应用过滤器
   */
  private applyFilter(entries: AuditLogEntry[], filter?: AuditLogFilter): AuditLogEntry[] {
    if (!filter) return entries;

    let filtered = entries;

    // 时间过滤
    if (filter.startTime) {
      filtered = filtered.filter(e => e.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      filtered = filtered.filter(e => e.timestamp <= filter.endTime!);
    }

    // 操作类型过滤
    if (filter.operation) {
      const ops = Array.isArray(filter.operation) ? filter.operation : [filter.operation];
      filtered = filtered.filter(e => ops.includes(e.operation));
    }

    // 目标类型过滤
    if (filter.targetType) {
      const types = Array.isArray(filter.targetType) ? filter.targetType : [filter.targetType];
      filtered = filtered.filter(e => types.includes(e.targetType));
    }

    // 结果过滤
    if (filter.result) {
      const results = Array.isArray(filter.result) ? filter.result : [filter.result];
      filtered = filtered.filter(e => results.includes(e.result));
    }

    // 分类过滤
    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      filtered = filtered.filter(e => categories.includes(e.category));
    }

    // 严重级别过滤
    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      filtered = filtered.filter(e => severities.includes(e.severity));
    }

    // 会话标识过滤
    if (filter.sessionKey) {
      filtered = filtered.filter(e => e.sessionKey === filter.sessionKey);
    }

    // 用户ID过滤
    if (filter.userId) {
      filtered = filtered.filter(e => e.userId === filter.userId);
    }

    return filtered;
  }

  /**
   * 初始化统计信息
   */
  private initStats(): AuditLogStats {
    return {
      totalEntries: 0,
      byCategory: {
        operation: 0,
        security: 0,
        performance: 0,
        access: 0,
      },
      bySeverity: {
        info: 0,
        warn: 0,
        error: 0,
        critical: 0,
      },
      byOperation: {},
      byResult: {
        success: 0,
        failure: 0,
        partial: 0,
      },
      timeRange: {
        earliest: null,
        latest: null,
      },
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(entry: AuditLogEntry): void {
    this.stats.totalEntries++;
    this.stats.byCategory[entry.category]++;
    this.stats.bySeverity[entry.severity]++;
    this.stats.byResult[entry.result]++;

    const opCount = this.stats.byOperation[entry.operation] || 0;
    this.stats.byOperation[entry.operation] = opCount + 1;

    // 更新时间范围
    if (this.stats.timeRange.earliest === null || entry.timestamp < this.stats.timeRange.earliest) {
      this.stats.timeRange.earliest = entry.timestamp;
    }
    if (this.stats.timeRange.latest === null || entry.timestamp > this.stats.timeRange.latest) {
      this.stats.timeRange.latest = entry.timestamp;
    }
  }

  /**
   * 从日志条目计算统计信息
   */
  private calculateStats(entries: AuditLogEntry[]): AuditLogStats {
    const stats = this.initStats();

    for (const entry of entries) {
      this.updateStatsToStats(stats, entry);
    }

    return stats;
  }

  /**
   * 更新统计信息到指定的 stats 对象
   */
  private updateStatsToStats(stats: AuditLogStats, entry: AuditLogEntry): void {
    stats.totalEntries++;
    stats.byCategory[entry.category]++;
    stats.bySeverity[entry.severity]++;
    stats.byResult[entry.result]++;

    const opCount = stats.byOperation[entry.operation] || 0;
    stats.byOperation[entry.operation] = opCount + 1;

    if (stats.timeRange.earliest === null || entry.timestamp < stats.timeRange.earliest) {
      stats.timeRange.earliest = entry.timestamp;
    }
    if (stats.timeRange.latest === null || entry.timestamp > stats.timeRange.latest) {
      stats.timeRange.latest = entry.timestamp;
    }
  }

  /**
   * 更新索引
   */
  private updateIndex(entry: AuditLogEntry): void {
    // 按会话索引
    const sessionEntries = this.indexCache.get(entry.sessionKey) || [];
    sessionEntries.push(entry);
    if (sessionEntries.length > 1000) {
      sessionEntries.shift(); // 限制缓存大小
    }
    this.indexCache.set(entry.sessionKey, sessionEntries);

    // 按用户索引
    if (entry.userId) {
      const userEntries = this.indexCache.get(`user:${entry.userId}`) || [];
      userEntries.push(entry);
      if (userEntries.length > 1000) {
        userEntries.shift();
      }
      this.indexCache.set(`user:${entry.userId}`, userEntries);
    }
  }

  /**
   * 启动刷盘定时器
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Audit log flush error:', error);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * 停止刷盘定时器
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * 清理过期日志
   */
  async cleanup(): Promise<void> {
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    const files = fs.readdirSync(this.config.logDir)
      .filter(file => file.startsWith('audit-') && file.endsWith('.json'));

    for (const file of files) {
      const dateStr = file.replace('audit-', '').replace('.json', '');
      const fileDate = new Date(dateStr).getTime();

      if (fileDate < cutoff) {
        await fs.promises.unlink(path.join(this.config.logDir, file));
      }
    }
  }
}