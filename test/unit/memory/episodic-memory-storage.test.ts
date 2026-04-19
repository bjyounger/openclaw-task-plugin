/**
 * EpisodicMemoryStorage 单元测试
 */

import * as fs from 'fs';
import * as path from 'path';
import { EpisodicMemoryStorage } from '../../../src/core/memory/episodic-memory-storage';

// Mock fs
jest.mock('fs');

describe('EpisodicMemoryStorage', () => {
  let storage: EpisodicMemoryStorage;
  const testStorageDir = '/tmp/test-memory/episodic';

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.readFileSync as jest.Mock).mockReturnValue('[]');
    
    storage = new EpisodicMemoryStorage({
      storageDir: testStorageDir,
      maxMemories: 100,
      ttl: 0,
      enablePersistence: false,
    });
  });

  afterEach(async () => {
    await storage.clear();
  });

  describe('create', () => {
    it('should create a new episodic memory', async () => {
      const memory = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'This is a test memory',
        content: { key: 'value' },
        tags: ['test'],
      });

      expect(memory.memoryId).toBeDefined();
      expect(memory.memoryId).toMatch(/^mem_/);
      expect(memory.source).toBe('task_completion');
      expect(memory.title).toBe('Test Memory');
      expect(memory.status).toBe('active');
    });

    it('should create memory with high priority', async () => {
      const memory = await storage.create({
        source: 'error_recovery',
        priority: 'high',
        title: 'Error Memory',
        summary: 'Error occurred',
        content: { error: 'test error' },
        tags: ['error'],
      });

      expect(memory.priority).toBe('high');
    });
  });

  describe('load', () => {
    it('should load an existing memory', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'This is a test',
        content: {},
        tags: [],
      });

      const loaded = await storage.load(created.memoryId);
      expect(loaded).toBeDefined();
      expect(loaded?.memoryId).toBe(created.memoryId);
      expect(loaded?.title).toBe('Test Memory');
    });

    it('should return undefined for non-existent memory', async () => {
      const loaded = await storage.load('non_existent');
      expect(loaded).toBeUndefined();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Create multiple memories
      for (let i = 1; i <= 5; i++) {
        await storage.create({
          source: i % 2 === 0 ? 'task_completion' : 'user_correction',
          priority: i <= 2 ? 'high' : 'medium',
          title: `Memory ${i}`,
          summary: `Summary ${i}`,
          content: { index: i },
          tags: [`tag${i}`, 'common'],
        });
      }
    });

    it('should query by source', async () => {
      const results = await storage.query({ source: 'task_completion' });
      expect(results.length).toBe(2);
    });

    it('should query by priority', async () => {
      const results = await storage.query({ priority: 'high' });
      expect(results.length).toBe(2);
    });

    it('should query by tags', async () => {
      const results = await storage.query({ tags: ['common'] });
      expect(results.length).toBe(5);
    });

    it('should limit results', async () => {
      const results = await storage.query({ limit: 3 });
      expect(results.length).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete an existing memory', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      const deleted = await storage.delete(created.memoryId);
      expect(deleted).toBe(true);

      const loaded = await storage.load(created.memoryId);
      expect(loaded).toBeUndefined();
    });

    it('should return false for non-existent memory', async () => {
      const deleted = await storage.delete('non_existent');
      expect(deleted).toBe(false);
    });
  });

  describe('archive', () => {
    it('should archive a memory', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      await storage.archive(created.memoryId);

      const loaded = await storage.load(created.memoryId);
      expect(loaded?.status).toBe('archived');
    });
  });

  describe('recordAccess', () => {
    it('should record access to a memory', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      storage.recordAccess(created.memoryId, 'test');

      const loaded = await storage.load(created.memoryId);
      expect(loaded?.accessCount).toBe(1);
      expect(loaded?.accessLog.length).toBe(1);
    });

    it('should update lastAccessedAt', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      const before = created.lastAccessedAt;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      storage.recordAccess(created.memoryId, 'test');

      const loaded = await storage.load(created.memoryId);
      expect(loaded?.lastAccessedAt).toBeGreaterThan(before);
    });
  });

  describe('updatePromotionScore', () => {
    it('should update promotion score', async () => {
      const created = await storage.create({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      storage.updatePromotionScore(created.memoryId, 5);

      const loaded = await storage.load(created.memoryId);
      expect(loaded?.promotionScore).toBe(5);
    });
  });

  describe('count', () => {
    it('should return the count of memories', async () => {
      await storage.create({
        source: 'task_completion',
        title: 'Memory 1',
        summary: 'Test',
        content: {},
        tags: [],
      });

      await storage.create({
        source: 'task_completion',
        title: 'Memory 2',
        summary: 'Test',
        content: {},
        tags: [],
      });

      const count = await storage.count();
      expect(count).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all memories', async () => {
      await storage.create({
        source: 'task_completion',
        title: 'Memory 1',
        summary: 'Test',
        content: {},
        tags: [],
      });

      await storage.clear();
      const count = await storage.count();
      expect(count).toBe(0);
    });
  });
});
