/**
 * OpenClaw Task Plugin v3.0 - Data Encryptor
 * 
 * 数据加密模块，提供 AES-256-GCM 加密功能
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DataEncryptorConfig,
  EncryptionAlgorithm,
  EncryptionResult,
  KeyInfo,
  KeyRotationResult,
} from './types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<DataEncryptorConfig> = {
  algorithm: 'aes-256-gcm',
  envKeyName: 'OPENCLAW_TASK_PLUGIN_KEY',
  rotationIntervalMs: 0, // 默认不自动轮换
  sensitiveFields: ['userId', 'password', 'token', 'secret', 'apiKey', 'privateKey'],
};

/**
 * 数据加密器
 * 
 * 使用 AES-256-GCM 算法进行对称加密
 * 支持密钥轮换和完整性校验
 */
export class DataEncryptor {
  private config: Required<Omit<DataEncryptorConfig, 'masterKey' | 'keyFilePath'>> & {
    masterKey?: string;
    keyFilePath?: string;
  };
  
  /** 当前密钥 */
  private currentKey: Buffer | null = null;
  
  /** 密钥信息 */
  private keyInfo: KeyInfo | null = null;
  
  /** 轮换定时器 */
  private rotationTimer?: ReturnType<typeof setInterval>;
  
  /** 历史密钥（用于解密旧数据） */
  private keyHistory: Map<string, Buffer> = new Map();

  constructor(config: DataEncryptorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<Omit<DataEncryptorConfig, 'masterKey' | 'keyFilePath'>> & {
      masterKey?: string;
      keyFilePath?: string;
    };
  }

  /**
   * 初始化加密器
   * 
   * 优先级：环境变量 > 配置文件 > 主密钥参数 > 生成新密钥
   */
  async initialize(): Promise<void> {
    // 1. 尝试从环境变量获取密钥
    if (this.config.envKeyName && process.env[this.config.envKeyName]) {
      const keyBase64 = process.env[this.config.envKeyName]!;
      this.currentKey = Buffer.from(keyBase64, 'base64');
      this.keyInfo = this.createKeyInfo();
      return;
    }

    // 2. 尝试从配置文件加载
    if (this.config.keyFilePath) {
      try {
        const keyData = await this.loadKeyFromFile(this.config.keyFilePath);
        if (keyData) {
          this.currentKey = keyData;
          this.keyInfo = this.createKeyInfo();
          return;
        }
      } catch (error) {
        // 文件不存在或读取失败，继续尝试其他方式
      }
    }

    // 3. 使用配置中的主密钥
    if (this.config.masterKey) {
      this.currentKey = Buffer.from(this.config.masterKey, 'base64');
      this.keyInfo = this.createKeyInfo();
      return;
    }

    // 4. 生成新密钥
    this.currentKey = crypto.randomBytes(32);
    this.keyInfo = this.createKeyInfo();

    // 保存到文件
    if (this.config.keyFilePath) {
      await this.saveKeyToFile(this.config.keyFilePath);
    }
  }

  /**
   * 加密数据
   * 
   * @param data 要加密的数据
   * @returns 加密结果
   */
  async encrypt(data: string | Buffer | Record<string, unknown>): Promise<EncryptionResult> {
    this.ensureInitialized();

    // 序列化数据
    const plaintext = typeof data === 'string'
      ? Buffer.from(data, 'utf-8')
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(JSON.stringify(data), 'utf-8');

    // 生成初始化向量
    const iv = crypto.randomBytes(12); // GCM 推荐使用 12 字节 IV

    // 创建加密器
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.currentKey!,
      iv
    );

    // 加密
    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: this.config.algorithm!,
      timestamp: Date.now(),
    };
  }

  /**
   * 解密数据
   * 
   * @param encryptedData 加密数据
   * @returns 解密后的数据
   */
  async decrypt(encryptedData: EncryptionResult): Promise<Buffer> {
    this.ensureInitialized();

    const { encrypted, iv, authTag } = encryptedData;

    // 转换 Buffer
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');

    // 尝试使用当前密钥解密
    try {
      return this.decryptWithKey(this.currentKey!, encryptedBuffer, ivBuffer, authTagBuffer);
    } catch (error) {
      // 如果当前密钥解密失败，尝试历史密钥
      for (const [keyId, key] of this.keyHistory) {
        try {
          return this.decryptWithKey(key, encryptedBuffer, ivBuffer, authTagBuffer);
        } catch {
          // 继续尝试下一个密钥
        }
      }

      throw new Error('Decryption failed: no valid key found');
    }
  }

  /**
   * 解密为字符串
   */
  async decryptToString(encryptedData: EncryptionResult): Promise<string> {
    const buffer = await this.decrypt(encryptedData);
    return buffer.toString('utf-8');
  }

  /**
   * 解密为 JSON 对象
   */
  async decryptToJson<T = Record<string, unknown>>(encryptedData: EncryptionResult): Promise<T> {
    const json = await this.decryptToString(encryptedData);
    return JSON.parse(json) as T;
  }

  /**
   * 加密对象中的敏感字段
   * 
   * @param obj 要处理的对象
   * @param fields 要加密的字段列表（可选，默认使用配置中的 sensitiveFields）
   * @returns 加密后的对象
   */
  async encryptSensitiveFields<T extends Record<string, unknown>>(
    obj: T,
    fields?: string[]
  ): Promise<T & { _encryptedFields?: string[] }> {
    this.ensureInitialized();

    const fieldsToEncrypt = fields || this.config.sensitiveFields;
    const encryptedFields: string[] = [];
    const result = { ...obj } as T & { _encryptedFields?: string[] };

    for (const field of fieldsToEncrypt) {
      if (field in obj && obj[field] !== undefined && obj[field] !== null) {
        const value = obj[field];
        const encrypted = await this.encrypt(
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        );
        (result as Record<string, unknown>)[field] = JSON.stringify(encrypted);
        encryptedFields.push(field);
      }
    }

    if (encryptedFields.length > 0) {
      result._encryptedFields = encryptedFields;
    }

    return result;
  }

  /**
   * 解密对象中的敏感字段
   */
  async decryptSensitiveFields<T extends Record<string, unknown>>(
    obj: T & { _encryptedFields?: string[] }
  ): Promise<T> {
    this.ensureInitialized();

    const result = { ...obj } as T;
    const encryptedFields = obj._encryptedFields || [];

    for (const field of encryptedFields) {
      if (field in obj) {
        const encryptedValue = obj[field];
        if (typeof encryptedValue === 'string') {
          try {
            const encryptedData = JSON.parse(encryptedValue) as EncryptionResult;
            const decrypted = await this.decryptToString(encryptedData);
            (result as Record<string, unknown>)[field] = decrypted;
          } catch {
            // 解密失败，保留原值
          }
        }
      }
    }

    // 移除加密字段标记
    delete (result as Record<string, unknown>)['_encryptedFields'];

    return result;
  }

  /**
   * 轮换密钥
   */
  async rotateKey(): Promise<KeyRotationResult> {
    this.ensureInitialized();

    const oldKeyId = this.keyInfo!.keyId;
    const oldKey = this.currentKey!;

    try {
      // 生成新密钥
      const newKey = crypto.randomBytes(32);

      // 保存旧密钥到历史
      this.keyHistory.set(oldKeyId, oldKey);

      // 更新当前密钥
      this.currentKey = newKey;
      this.keyInfo = this.createKeyInfo();
      this.keyInfo.rotationCount++;
      this.keyInfo.lastRotatedAt = Date.now();

      // 保存到文件
      if (this.config.keyFilePath) {
        await this.saveKeyToFile(this.config.keyFilePath);
      }

      return {
        oldKeyId,
        newKeyId: this.keyInfo.keyId,
        rotatedAt: Date.now(),
        success: true,
      };
    } catch (error) {
      return {
        oldKeyId,
        newKeyId: oldKeyId,
        rotatedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取密钥信息
   */
  getKeyInfo(): KeyInfo | null {
    return this.keyInfo ? { ...this.keyInfo } : null;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.currentKey !== null && this.keyInfo !== null;
  }

  /**
   * 销毁加密器
   */
  destroy(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }

    // 清除密钥（安全清理）
    if (this.currentKey) {
      this.currentKey.fill(0);
      this.currentKey = null;
    }

    // 清除历史密钥
    for (const key of this.keyHistory.values()) {
      key.fill(0);
    }
    this.keyHistory.clear();

    this.keyInfo = null;
  }

  // ==================== 私有方法 ====================

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.currentKey || !this.keyInfo) {
      throw new Error('DataEncryptor not initialized. Call initialize() first.');
    }
  }

  /**
   * 使用指定密钥解密
   */
  private decryptWithKey(
    key: Buffer,
    encrypted: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted;
  }

  /**
   * 创建密钥信息
   */
  private createKeyInfo(): KeyInfo {
    return {
      keyId: crypto.randomBytes(8).toString('hex'),
      createdAt: Date.now(),
      active: true,
      rotationCount: 0,
    };
  }

  /**
   * 从文件加载密钥
   */
  private async loadKeyFromFile(filePath: string): Promise<Buffer | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = await fs.promises.readFile(filePath, 'utf-8');
    const keyData = JSON.parse(data);

    return Buffer.from(keyData.key, 'base64');
  }

  /**
   * 保存密钥到文件
   */
  private async saveKeyToFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const keyData = {
      keyId: this.keyInfo!.keyId,
      key: this.currentKey!.toString('base64'),
      createdAt: this.keyInfo!.createdAt,
      rotationCount: this.keyInfo!.rotationCount,
    };

    await fs.promises.writeFile(filePath, JSON.stringify(keyData, null, 2), {
      mode: 0o600, // 仅所有者可读写
    });
  }
}
