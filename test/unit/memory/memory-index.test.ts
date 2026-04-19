/**
 * MemoryIndex 单元测试
 */

import { MemoryIndex } from '../../../src/core/memory/memory-index';
import { MemorySource, MemoryStatus, MemoryPriority } from '../../../src/core/memory/types';

describe('MemoryIndex', () => {
  let index: MemoryIndex;

  beforeEach(() => {
    index = new MemoryIndex();
  });

  describe('index', () => {
    it('should add a new entry to the index', () => {
      const entry = {
        memoryId: 'mem_1',
        timestamp: Date.now(),
        tags: ['tag1', 'tag2'],
        source: 'task_completion' as MemorySource,
        priority: 'high' as MemoryPriority,
        status: 'active' as MemoryStatus,
        searchText: 'test memory',
        keywords: ['test'],
        lastAccessedAt: Date.now(),
        accessCount: 0,
        promotionScore: 0,
      };

      index.index(entry);
      expect(index.size).toBe(1);
    });

    it('should update an existing entry', () => {
      const entry = {
        memoryId: 'mem_1',
        timestamp: Date.now(),
        tags: ['tag1'],
        source: 'task_completion' as MemorySource,
        priority: 'high' as MemoryPriority,
        status: 'active' as MemoryStatus,
        searchText: 'test memory',
        keywords: ['test'],
        lastAccessedAt: Date.now(),
        accessCount: 0,
        promotionScore: 0,
      };

      index.index(entry);
      expect(index.size).toBe(1);

      const updatedEntry = {
        ...entry,
        tags: ['tag1', 'tag2'],
        accessCount: 5,
      };

      index.index(updatedEntry);
      expect(index.size).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove an entry from the index', () => {
      const entry = {
        memoryId: 'mem_1',
        timestamp: Date.now(),
        tags: ['tag1'],
        source: 'task_completion' as MemorySource,
        priority: 'high' as MemoryPriority,
        status: 'active' as MemoryStatus,
        searchText: 'test memory',
        keywords: ['test'],
        lastAccessedAt: Date.now(),
        accessCount: 0,
        promotionScore: 0,
      };

      index.index(entry);
      expect(index.size).toBe(1);

      const removed = index.remove('mem_1');
      expect(removed).toBe(true);
      expect(index.size).toBe(0);
    });

    it('should return false for non-existent entry', () => {
      const removed = index.remove('non_existent');
      expect(removed).toBe(false);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Add multiple entries
      for (let i = 1; i <= 10; i++) {
        index.index({
          memoryId: `mem_${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
          tags: [`tag${i}`, 'common'],
          source: i % 2 === 0 ? 'task_completion' as MemorySource : 'user_correction' as MemorySource,
          priority: i <= 3 ? 'high' as MemoryPriority : 'medium' as MemoryPriority,
          status: 'active' as MemoryStatus,
          searchText: `memory ${i}`,
          keywords: [`keyword${i}`],
          lastAccessedAt: Date.now(),
          accessCount: i,
          promotionScore: i,
        });
      }
    });

    it('should query by status', () => {
      const results = index.query({ status: 'active' });
      expect(results.length).toBe(10);
    });

    it('should query by source', () => {
      const results = index.query({ source: 'task_completion' });
      expect(results.length).toBe(5);
    });

    it('should query by priority', () => {
      const results = index.query({ priority: 'high' });
      expect(results.length).toBe(3);
    });

    it('should query by tags', () => {
      const results = index.query({ tags: ['common'] });
      expect(results.length).toBe(10);
    });

    it('should query by search text', () => {
      const results = index.query({ searchText: 'memory 5' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should limit results', () => {
      const results = index.query({ limit: 5 });
      expect(results.length).toBe(5);
    });

    it('should order by creation time descending', () => {
      const results = index.query({ orderBy: 'createdAt', orderDirection: 'desc' });
      expect(results[0]).toBe('mem_10');
    });

    it('should order by access count', () => {
      const results = index.query({ orderBy: 'accessCount', orderDirection: 'desc' });
      expect(results[0]).toBe('mem_10');
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      index.index({
        memoryId: 'mem_1',
        timestamp: Date.now(),
        tags: ['tag1'],
        source: 'task_completion' as MemorySource,
        priority: 'high' as MemoryPriority,
        status: 'active' as MemoryStatus,
        searchText: 'test',
        keywords: [],
        lastAccessedAt: Date.now(),
        accessCount: 0,
        promotionScore: 0,
      });

      const stats = index.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byStatus['active']).toBe(1);
      expect(stats.bySource['task_completion']).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      index.index({
        memoryId: 'mem_1',
        timestamp: Date.now(),
        tags: ['tag1'],
        source: 'task_completion' as MemorySource,
        priority: 'high' as MemoryPriority,
        status: 'active' as MemoryStatus,
        searchText: 'test',
        keywords: [],
        lastAccessedAt: Date.now(),
        accessCount: 0,
        promotionScore: 0,
      });

      index.clear();
      expect(index.size).toBe(0);
    });
  });
});
