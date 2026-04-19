/**
 * MemoryManager 集成测试
 * 
 * 测试完整的记忆生命周期：
 * 1. 任务完成 → 情境记忆
 * 2. 情境记忆 → 语义记忆（提升）
 * 3. 多个记忆 → 知识卡片（提炼）
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryManager } from '../../../src/core/memory/memory-manager';

// 使用真实文件系统进行集成测试
describe('MemoryManager Integration', () => {
  let manager: MemoryManager;
  const testStorageDir = '/tmp/openclaw-memory-integration-test';

  beforeAll(() => {
    // 清理测试目录
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
    fs.mkdirSync(testStorageDir, { recursive: true });
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    manager = new MemoryManager({
      sessionKey: 'integration-test',
      storageDir: testStorageDir,
      enablePersistence: true,
    });
    
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('完整记忆生命周期', () => {
    it('应该支持从任务完成到情境记忆的完整流程', async () => {
      // 1. 模拟任务完成
      const taskResult = {
        taskId: 'task_integration_1',
        flowId: 'flow_integration_1',
        goal: '实现用户登录功能',
        status: 'succeeded' as const,
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        result: '用户登录功能已实现，包含JWT认证和会话管理',
        metadata: {
          duration: 5000,
          complexity: 'medium',
        },
      };

      // 2. 创建情境记忆
      const memory = await manager.createMemoryFromTask(taskResult);
      
      expect(memory.memoryId).toBeDefined();
      expect(memory.source).toBe('task_completion');
      expect(memory.relatedTaskIds).toContain('task_integration_1');
      
      // 3. 验证可以检索
      const retrieved = await manager.getEpisodicMemory(memory.memoryId);
      expect(retrieved).toBeDefined();
    });

    it('应该支持从错误恢复中学习', async () => {
      // 1. 模拟失败任务
      const failedTask = {
        taskId: 'task_integration_2',
        flowId: 'flow_integration_2',
        goal: '部署生产环境',
        status: 'failed' as const,
        startTime: Date.now() - 30000,
        endTime: Date.now(),
        error: 'Database connection timeout after 30 seconds',
      };

      // 2. 创建记忆
      const memory = await manager.createMemoryFromTask(failedTask);
      
      expect(memory.source).toBe('error_recovery');
      expect(memory.priority).toBe('high');
      
      // 3. 验证内容包含错误信息
      const content = memory.content as any;
      expect(content.goal).toBe('部署生产环境');
    });

    it('应该支持记忆提升到语义记忆', async () => {
      // 1. 创建多个相似的情境记忆
      for (let i = 1; i <= 3; i++) {
        await manager.createEpisodicMemory({
          source: 'user_preference',
          title: `用户偏好 ${i}`,
          summary: '用户喜欢使用暗色主题',
          content: { preference: 'dark_theme' },
          tags: ['preference', 'theme'],
          relatedTaskIds: [`task_${i}`],
        });
      }

      // 2. 提升第一个记忆
      const memories = await manager.queryEpisodicMemories({
        source: 'user_preference',
        limit: 1,
      });

      expect(memories.length).toBeGreaterThan(0);

      const semanticMemory = await manager.promoteToSemantic(memories[0].memoryId);
      
      expect(semanticMemory.type).toBe('preference');
      expect(semanticMemory.title).toContain('用户偏好');
      
      // 3. 验证可以搜索到语义记忆
      const searchResults = await manager.searchSemanticMemories(['theme']);
      expect(searchResults.length).toBeGreaterThan(0);
    });

    it('应该支持知识提炼', async () => {
      // 1. 创建多个相关记忆
      for (let i = 1; i <= 5; i++) {
        await manager.createEpisodicMemory({
          source: 'task_completion',
          priority: 'high',
          title: `部署服务 ${i}`,
          summary: `成功部署服务到生产环境，使用Docker容器化部署`,
          content: { 
            service: `service_${i}`,
            method: 'docker',
          },
          tags: ['deployment', 'docker', 'production'],
        });
      }

      // 2. 执行知识提炼
      const result = await manager.refine();
      
      // 3. 验证提炼结果
      expect(result.clusters.length).toBeGreaterThanOrEqual(0);
      expect(result.extractedKnowledge).toBeDefined();
    });
  });

  describe('持久化测试', () => {
    it('应该支持记忆持久化和恢复', async () => {
      // 1. 创建记忆
      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '持久化测试',
        summary: '测试记忆持久化功能',
        content: { test: true },
        tags: ['persistence'],
      });

      const memoryId = memory.memoryId;

      // 2. 刷新到磁盘
      await manager.flush();

      // 3. 销毁并重新创建管理器
      await manager.destroy();

      const newManager = new MemoryManager({
        sessionKey: 'integration-test',
        storageDir: testStorageDir,
        enablePersistence: true,
      });
      
      await newManager.initialize();

      // 4. 验证记忆已恢复
      const restored = await newManager.getEpisodicMemory(memoryId);
      expect(restored).toBeDefined();
      expect(restored?.title).toBe('持久化测试');

      await newManager.destroy();
    });
  });

  describe('统计和监控', () => {
    it('应该正确统计记忆数据', async () => {
      // 1. 创建各类记忆
      await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '任务记忆',
        summary: '测试统计',
        content: {},
        tags: ['test'],
      });

      await manager.createSemanticMemory({
        type: 'fact',
        title: '语义记忆',
        content: '测试内容',
        keywords: ['test'],
      });

      await manager.createKnowledge({
        category: 'best_practice',
        title: '知识卡片',
        description: '测试描述',
        content: '测试内容',
      });

      // 2. 获取统计
      const stats = await manager.getStats();
      
      expect(stats.episodic.total).toBeGreaterThan(0);
      expect(stats.semantic).toBeGreaterThan(0);
      expect(stats.knowledge.total).toBeGreaterThan(0);
    });

    it('应该追踪访问统计', async () => {
      // 1. 创建记忆
      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '访问测试',
        summary: '测试访问追踪',
        content: {},
        tags: [],
      });

      // 2. 多次访问
      for (let i = 0; i < 5; i++) {
        await manager.getEpisodicMemory(memory.memoryId);
      }

      // 3. 获取访问统计
      const accessStats = manager.getAccessStatistics();
      
      expect(accessStats.totalAccesses).toBeGreaterThan(0);
      expect(accessStats.hotMemories.length).toBeGreaterThan(0);
    });
  });

  describe('事件系统', () => {
    it('应该正确触发所有事件', async () => {
      const events: string[] = [];

      manager.on('memory:created', () => events.push('created'));
      manager.on('memory:accessed', () => events.push('accessed'));
      manager.on('memory:promoted', () => events.push('promoted'));
      manager.on('knowledge:created', () => events.push('knowledge_created'));

      // 1. 创建记忆
      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '事件测试',
        summary: '测试事件系统',
        content: {},
        tags: [],
      });

      // 2. 访问记忆
      await manager.getEpisodicMemory(memory.memoryId);

      // 3. 提升记忆
      await manager.promoteToSemantic(memory.memoryId);

      // 4. 创建知识
      await manager.createKnowledge({
        category: 'best_practice',
        title: '知识',
        description: '描述',
        content: '内容',
      });

      // 5. 验证事件触发
      expect(events).toContain('created');
      expect(events).toContain('accessed');
      expect(events).toContain('promoted');
      expect(events).toContain('knowledge_created');
    });
  });

  describe('性能测试', () => {
    it('应该在50ms内保存记忆', async () => {
      const start = Date.now();

      await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '性能测试',
        summary: '测试保存性能',
        content: { large: 'x'.repeat(1000) },
        tags: ['performance'],
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });

    it('应该在100ms内检索记忆', async () => {
      // 创建记忆
      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: '检索性能测试',
        summary: '测试检索性能',
        content: {},
        tags: ['performance'],
      });

      const start = Date.now();

      await manager.getEpisodicMemory(memory.memoryId);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('应该支持批量操作', async () => {
      const start = Date.now();

      // 批量创建100条记忆
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(manager.createEpisodicMemory({
          source: 'task_completion',
          title: `批量记忆 ${i}`,
          summary: `批量测试 ${i}`,
          content: { index: i },
          tags: ['batch', `tag${i % 10}`],
        }));
      }

      await Promise.all(promises);

      const duration = Date.now() - start;
      console.log(`批量创建100条记忆耗时: ${duration}ms`);

      // 验证创建成功
      const count = await manager.queryEpisodicMemories({ tags: ['batch'] });
      expect(count.length).toBe(100);
    });
  });
});
