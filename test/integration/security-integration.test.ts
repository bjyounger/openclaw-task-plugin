/**
 * Security Module Integration Tests
 * 
 * 测试安全管理器、审计日志、数据加密、访问控制的集成功能
 * 
 * @version 3.0.0
 * @author 孬蛋
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock OpenClawBridge for testing
class MockOpenClawBridge {
  private sessionKey: string;
  
  constructor(sessionKey: string) {
    this.sessionKey = sessionKey;
  }
  
  checkApiAvailability() {
    return {
      taskFlow: true,
      tasks: true,
      events: true,
      subagent: true,
    };
  }
  
  getSessionInfo() {
    return {
      sessionKey: this.sessionKey,
    };
  }
}

// Import security modules
import {
  SecurityManager,
  AuditLogger,
  DataEncryptor,
  AccessControl,
  SecurityManagerConfig,
  AuditLogEntry,
  AccessDecision,
  Role,
  EncryptionResult,
} from '../../src/core/security';

// Test helper functions
let testDir: string;

function setupTestDir(): void {
  testDir = path.join(os.tmpdir(), `security-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'logs'), { recursive: true });
}

function cleanupTestDir(): void {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// ==================== DataEncryptor Tests ====================

async function testDataEncryptor(): Promise<void> {
  console.log('\n🔐 Testing DataEncryptor...');
  
  const encryptor = new DataEncryptor({
    keyFilePath: path.join(testDir, 'test-key.json'),
  });
  
  // Initialize
  await encryptor.initialize();
  console.log('✅ Encryptor initialized');
  
  // Test encryption/decryption
  const testData = 'Hello, Security World!';
  const encrypted = await encryptor.encrypt(testData);
  console.log('✅ Data encrypted');
  
  const decrypted = await encryptor.decryptToString(encrypted);
  if (decrypted !== testData) {
    throw new Error('Decrypted data does not match original');
  }
  console.log('✅ Data decrypted successfully');
  
  // Test JSON encryption
  const jsonTestData = { userId: 'user123', action: 'test', timestamp: Date.now() };
  const jsonEncrypted = await encryptor.encrypt(jsonTestData);
  const jsonDecrypted = await encryptor.decryptToJson(jsonEncrypted);
  if (jsonDecrypted.userId !== jsonTestData.userId) {
    throw new Error('JSON decryption failed');
  }
  console.log('✅ JSON encryption/decryption works');
  
  // Test sensitive fields encryption
  const objWithSensitiveFields = {
    userId: 'secret-user-id',
    email: 'user@example.com',
    publicData: 'public',
  };
  
  const encryptedObj = await encryptor.encryptSensitiveFields(objWithSensitiveFields, ['userId']);
  if (!encryptedObj._encryptedFields || !encryptedObj._encryptedFields.includes('userId')) {
    throw new Error('Sensitive field not marked as encrypted');
  }
  console.log('✅ Sensitive fields encryption works');
  
  // Test key rotation
  const keyInfoBefore = encryptor.getKeyInfo();
  const rotationResult = await encryptor.rotateKey();
  if (!rotationResult.success) {
    throw new Error('Key rotation failed');
  }
  const keyInfoAfter = encryptor.getKeyInfo();
  if (keyInfoBefore?.keyId === keyInfoAfter?.keyId) {
    throw new Error('Key was not rotated');
  }
  console.log('✅ Key rotation works');
  
  // Cleanup
  encryptor.destroy();
  console.log('✅ Encryptor destroyed');
}

// ==================== AuditLogger Tests ====================

async function testAuditLogger(): Promise<void> {
  console.log('\n📝 Testing AuditLogger...');
  
  // Create without encryptor first
  const auditLogger = new AuditLogger({
    logDir: path.join(testDir, 'logs'),
    enabled: true,
    bufferSize: 10,
    flushIntervalMs: 1000,
  });
  
  await auditLogger.initialize();
  console.log('✅ AuditLogger initialized');
  
  // Test logging
  const entry = await auditLogger.log(
    'create',
    'task',
    'create_task',
    {
      sessionKey: 'test-session',
      userId: 'test-user',
      targetId: 'task-123',
      parameters: { title: 'Test Task' },
      result: 'success',
    }
  );
  console.log(`✅ Audit log entry created: ${entry.id}`);
  
  // Test multiple entries
  for (let i = 0; i < 15; i++) {
    await auditLogger.log('read', 'task', `query_${i}`, {
      sessionKey: 'test-session',
      result: 'success',
    });
  }
  console.log('✅ Multiple log entries created');
  
  // Flush to ensure data is written
  await auditLogger.flush();
  
  // Test query
  const allEntries = await auditLogger.query();
  if (allEntries.length < 10) {
    throw new Error('Not enough log entries found');
  }
  console.log(`✅ Query returned ${allEntries.length} entries`);
  
  // Test filter
  const filteredEntries = await auditLogger.query({
    operation: 'create',
    limit: 5,
  });
  if (filteredEntries.length > 5) {
    throw new Error('Filter limit not applied');
  }
  console.log(`✅ Filtered query returned ${filteredEntries.length} entries`);
  
  // Test stats
  const stats = auditLogger.getStats();
  if (stats.totalEntries < 10) {
    throw new Error('Stats not updating correctly');
  }
  console.log(`✅ Stats: ${stats.totalEntries} total entries`);
  
  // Check auditLogger is enabled
  if (!auditLogger.isEnabled()) {
    throw new Error('AuditLogger should be enabled');
  }
  console.log('✅ AuditLogger is enabled');
  
  // Cleanup
  await auditLogger.destroy();
  console.log('✅ AuditLogger destroyed');
}

// ==================== AuditLogger with Encryption Tests ====================

async function testAuditLoggerWithEncryption(): Promise<void> {
  console.log('\n🔐📝 Testing AuditLogger with Encryption...');
  
  const encryptor = new DataEncryptor({
    keyFilePath: path.join(testDir, 'audit-key.json'),
  });
  await encryptor.initialize();
  
  const auditLogger = new AuditLogger({
    logDir: path.join(testDir, 'logs-encrypted'),
    enabled: true,
    encryptor: encryptor,
  });
  
  await auditLogger.initialize();
  console.log('✅ AuditLogger with encryption initialized');
  
  // Log with sensitive parameters
  await auditLogger.log('create', 'task', 'create_task_with_secrets', {
    sessionKey: 'secret-session',
    userId: 'secret-user',
    parameters: {
      sessionKey: 'inner-secret-session',  // this matches sensitive field
      publicData: 'not_secret',
    },
    result: 'success',
  });
  
  await auditLogger.flush();
  
  // Check that the log file contains encrypted data
  const logFiles = fs.readdirSync(path.join(testDir, 'logs-encrypted'));
  if (logFiles.length === 0) {
    throw new Error('No log files created');
  }
  
  const logContent = fs.readFileSync(
    path.join(testDir, 'logs-encrypted', logFiles[0]),
    'utf-8'
  );
  
  // The inner sessionKey should not appear in plaintext
  if (logContent.includes('inner-secret-session')) {
    throw new Error('Sensitive data not encrypted');
  }
  console.log('✅ Sensitive data is encrypted in log files');
  
  // Cleanup
  await auditLogger.destroy();
  encryptor.destroy();
  console.log('✅ Cleanup completed');
}

// ==================== AccessControl Tests ====================

async function testAccessControl(): Promise<void> {
  console.log('\n🔒 Testing AccessControl...');
  
  const accessControl = new AccessControl({
    defaultPolicy: 'deny',
    rolePermissions: {
      admin: ['task:create', 'task:read', 'task:delete'],
      viewer: ['task:read'],
    },
    userRoles: {
      'admin-user': 'admin',
      'viewer-user': 'viewer',
    },
  });
  console.log('✅ AccessControl initialized');
  
  // Test role checking
  const adminRole = accessControl.getUserRole('admin-user');
  if (adminRole !== 'admin') {
    throw new Error('Role not assigned correctly');
  }
  console.log('✅ Roles assigned correctly');
  
  // Test permission check - admin should have create permission
  const adminCreateDecision = await accessControl.checkAccess(
    'admin-user',
    'create',
    'task'
  );
  if (!adminCreateDecision.allowed) {
    throw new Error('Admin should have create permission');
  }
  console.log('✅ Admin has create permission');
  
  // Test permission check - viewer should not have create permission
  const viewerCreateDecision = await accessControl.checkAccess(
    'viewer-user',
    'create',
    'task'
  );
  if (viewerCreateDecision.allowed) {
    throw new Error('Viewer should not have create permission');
  }
  console.log('✅ Viewer does not have create permission');
  
  // Test permission check - viewer should have read permission
  const viewerReadDecision = await accessControl.checkAccess(
    'viewer-user',
    'read',
    'task'
  );
  if (!viewerReadDecision.allowed) {
    throw new Error('Viewer should have read permission');
  }
  console.log('✅ Viewer has read permission');
  
  // Test guest user (no role assigned)
  const guestDecision = await accessControl.checkAccess(
    'unknown-user',
    'read',
    'task'
  );
  if (guestDecision.allowed) {
    throw new Error('Unknown user should be denied');
  }
  console.log('✅ Unknown user is denied');
  
  // Test custom rule
  accessControl.addRule({
    name: 'Temporary Admin',
    role: 'guest',
    permissions: ['task:read'],
    enabled: true,
    priority: 10,
  });
  
  const guestWithRuleDecision = await accessControl.checkAccess(
    'test-user',
    'read',
    'task'
  );
  if (!guestWithRuleDecision.allowed) {
    throw new Error('Guest with rule should have read permission');
  }
  console.log('✅ Custom access rule works');
  
  // Test stats
  const stats = accessControl.getStats();
  console.log(`✅ Access stats: ${stats.allowedCount} allowed, ${stats.deniedCount} denied`);
  
  // Cleanup
  accessControl.destroy();
  console.log('✅ AccessControl destroyed');
}

// ==================== SecurityManager Integration Tests ====================

async function testSecurityManager(): Promise<void> {
  console.log('\n🛡️ Testing SecurityManager...');
  
  const mockBridge = new MockOpenClawBridge('test-session') as any;
  
  const securityConfig: SecurityManagerConfig = {
    enabled: true,
    audit: {
      logDir: path.join(testDir, 'logs'),
      enabled: true,
      bufferSize: 10,
    },
    encryption: {
      keyFilePath: path.join(testDir, 'security-key.json'),
    },
    accessControl: {
      defaultPolicy: 'deny',
      rolePermissions: {
        admin: [
          'task:create', 'task:read', 'task:update', 'task:delete',
          'audit:read',
        ],
      },
      userRoles: {
        'admin-user': 'admin',
      },
    },
  };
  
  const securityManager = new SecurityManager(securityConfig, mockBridge);
  console.log('✅ SecurityManager created');
  
  // Initialize
  await securityManager.initialize();
  console.log('✅ SecurityManager initialized');
  
  // Test audit logging through SecurityManager
  const auditEntry = await securityManager.logOperation(
    'create',
    'task',
    'test_create',
    {
      sessionKey: 'test-session',
      userId: 'test-user',
      targetId: 'task-456',
      result: 'success',
    }
  );
  console.log(`✅ Audit log created: ${auditEntry.id}`);
  
  // Test access control
  const accessDecision = await securityManager.checkAccess(
    'admin-user',
    'create',
    'task'
  );
  if (!accessDecision.allowed) {
    throw new Error('Admin user should have access');
  }
  console.log('✅ Access control works');
  
  // Test data encryption
  const testData = 'Sensitive data to encrypt';
  const encrypted = await securityManager.encryptData(testData);
  console.log('✅ Data encrypted through SecurityManager');
  
  const decrypted = await securityManager.decryptData(encrypted);
  if (decrypted !== testData) {
    throw new Error('Decrypted data does not match');
  }
  console.log('✅ Data decrypted successfully');
  
  // Test security status
  const status = await securityManager.getSecurityStatus();
  console.log(`✅ Security status: score ${status.securityScore}`);
  console.log(`  - Audit entries: ${status.auditLogger.totalEntries}`);
  console.log(`  - Access denied: ${status.accessControl.deniedCount}`);
  
  // Test security events
  await securityManager.logSecurityEvent('key_rotated', 'manual_test', {
    message: 'Manual test event',
  });
  const events = securityManager.getSecurityEvents();
  if (events.length === 0) {
    throw new Error('Security event not recorded');
  }
  console.log('✅ Security events work');
  
  // Cleanup
  await securityManager.destroy();
  console.log('✅ SecurityManager destroyed');
}

// ==================== Main Test Runner ====================

async function runTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Security Module Integration Tests        ║');
  console.log('║  Day 4: Audit Logging & Security           ║');
  console.log('╚════════════════════════════════════════════╝');
  
  setupTestDir();
  
  try {
    await testDataEncryptor();
    await testAuditLogger();
    await testAuditLoggerWithEncryption();
    await testAccessControl();
    await testSecurityManager();
    
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  ✅ All tests passed!                      ║');
    console.log('╚════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    cleanupTestDir();
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
