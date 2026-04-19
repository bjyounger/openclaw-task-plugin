/**
 * MemoryManager 单元测试
 */

import * as fs from 'fs';
import { MemoryManager } from '../../../src/core/memory/memory-manager';
import { MemorySource } from '../../../src/core/memory/types';

// Mock fs
jest.mock('fs');

describe('MemoryManager', () => {
  let manager: MemoryManager;
  const testStorageDir = '/tmp/test-memory-manager';

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.readFileSync as jest.Mock).mockReturnValue('[]');
    
    manager = new MemoryManager({
      sessionKey: 'test-session',
      storageDir: testStorageDir,
      enablePersistence: false,
    });
    
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const newManager = new MemoryManager({
        sessionKey: 'test-session-2',
        storageDir: testStorageDir,
        enablePersistence: false,
      });
      
      await newManager.initialize();
      await newManager.destroy();
    });

    it('should throw if already initialized', async () => {
      await expect(manager.initialize()).rejects.toThrow('already initialized');
    });
  });

  describe('destroy', () => {
    it('should destroy successfully', async () => {
      const newManager = new MemoryManager({
        sessionKey: 'test-session-3',
        storageDir: testStorageDir,
        enablePersistence: false,
      });
      
      await newManager.initialize();
      await newManager.destroy();
    });
  });

  describe('createEpisodicMemory', () => {
    it('should create an episodic memory', async () => {
      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'This is a test memory',
        content: { key: 'value' },
        tags: ['test'],
      });

      expect(memory.memoryId).toBeDefined();
      expect(memory.source).toBe('task_completion');
      expect(memory.title).toBe('Test Memory');
    });

    it('should create memory with high priority', async () => {
      const memory = await manager.createEpisodicMemory({
        source: 'error_recovery',
        priority: 'high',
        title: 'Error Memory',
        summary: 'Error occurred',
        content: { error: 'test' },
        tags: ['error'],
      });

      expect(memory.priority).toBe('high');
    });
  });

  describe('createMemoryFromTask', () => {
    it('should create memory from task execution result', async () => {
      const result = {
        taskId: 'task_1',
        flowId: 'flow_1',
        goal: 'Complete a task',
        status: 'succeeded' as const,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        result: 'Task completed successfully',
      };

      const memory = await manager.createMemoryFromTask(result);

      expect(memory.memoryId).toBeDefined();
      expect(memory.source).toBe('task_completion');
      expect(memory.relatedTaskIds).toContain('task_1');
    });

    it('should create memory for failed task', async () => {
      const result = {
        taskId: 'task_2',
        flowId: 'flow_2',
        goal: 'Complete a task',
        status: 'failed' as const,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        error: 'Task failed due to timeout',
      };

      const memory = await manager.createMemoryFromTask(result);

      expect(memory.source).toBe('error_recovery');
      expect(memory.priority).toBe('high');
    });
  });

  describe('getEpisodicMemory', () => {
    it('should get an existing memory', async () => {
      const created = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: 'Test Memory',
        summary: 'Test',
        content: {},
        tags: [],
      });

      const loaded = await manager.getEpisodicMemory(created.memoryId);
      expect(loaded).toBeDefined();
      expect(loaded?.memoryId).toBe(created.memoryId);
    });

    it('should return undefined for non-existent memory', async () => {
      const loaded = await manager.getEpisodicMemory('non_existent');
      expect(loaded).toBeUndefined();
    });
  });

  describe('queryEpisodicMemories', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await manager.createEpisodicMemory({
          source: i % 2 === 0 ? 'task_completion' : 'user_correction',
          title: `Memory ${i}`,
          summary: `Summary ${i}`,
          content: { index: i },
          tags: [`tag${i}`],
        });
      }
    });

    it('should query by source', async () => {
      const results = await manager.queryEpisodicMemories({
        source: 'task_completion',
      });
      expect(results.length).toBe(2);
    });

    it('should limit results', async () => {
      const results = await manager.queryEpisodicMemories({
        limit: 3,
      });
      expect(results.length).toBe(3);
    });
  });

  describe('createSemanticMemory', () => {
    it('should create a semantic memory', async () => {
      const memory = await manager.createSemanticMemory({
        type: 'fact',
        title: 'Test Fact',
        content: 'This is a test fact',
        keywords: ['test', 'fact'],
      });

      expect(memory.memoryId).toBeDefined();
      expect(memory.type).toBe('fact');
      expect(memory.title).toBe('Test Fact');
    });
  });

  describe('searchSemanticMemories', () => {
    beforeEach(async () => {
      await manager.createSemanticMemory({
        type: 'fact',
        title: 'Fact 1',
        content: 'Content about testing',
        keywords: ['test'],
      });

      await manager.createSemanticMemory({
        type: 'fact',
        title: 'Fact 2',
        content: 'Content about development',
        keywords: ['dev'],
      });
    });

    it('should search by keywords', async () => {
      const results = await manager.searchSemanticMemories(['test']);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createKnowledge', () => {
    it('should create a knowledge card', async () => {
      const knowledge = await manager.createKnowledge({
        category: 'best_practice',
        title: 'Test Best Practice',
        description: 'A test best practice',
        content: '# Test\n\nThis is a test knowledge card.',
        tags: ['test', 'best-practice'],
        applicability: ['testing'],
      });

      expect(knowledge.knowledgeId).toBeDefined();
      expect(knowledge.category).toBe('best_practice');
      expect(knowledge.title).toBe('Test Best Practice');
    });
  });

  describe('queryKnowledge', () => {
    beforeEach(async () => {
      await manager.createKnowledge({
        category: 'best_practice',
        title: 'Best Practice 1',
        description: 'Description 1',
        content: 'Content 1',
        tags: ['test'],
      });

      await manager.createKnowledge({
        category: 'lesson_learned',
        title: 'Lesson 1',
        description: 'Description 2',
        content: 'Content 2',
        tags: ['test'],
      });
    });

    it('should query by category', async () => {
      const results = await manager.queryKnowledge({
        category: 'best_practice',
      });
      expect(results.length).toBe(1);
      expect(results[0].category).toBe('best_practice');
    });

    it('should query by tags', async () => {
      const results = await manager.queryKnowledge({
        tags: ['test'],
      });
      expect(results.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await manager.createEpisodicMemory({
        source: 'task_completion',
        title: 'Test',
        summary: 'Test',
        content: {},
        tags: [],
      });

      const stats = await manager.getStats();
      expect(stats.episodic.total).toBe(1);
      expect(stats.semantic).toBeGreaterThanOrEqual(0);
      expect(stats.knowledge.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('events', () => {
    it('should emit memory:created event', async () => {
      const listener = jest.fn();
      manager.on('memory:created', listener);

      await manager.createEpisodicMemory({
        source: 'task_completion',
        title: 'Test',
        summary: 'Test',
        content: {},
        tags: [],
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should emit memory:accessed event', async () => {
      const listener = jest.fn();
      manager.on('memory:accessed', listener);

      const memory = await manager.createEpisodicMemory({
        source: 'task_completion',
        title: 'Test',
        summary: 'Test',
        content: {},
        tags: [],
      });

      await manager.getEpisodicMemory(memory.memoryId);

      expect(listener).toHaveBeenCalled();
    });
  });
});
