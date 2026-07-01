import { describe, it, expect } from 'vitest';
import { ReadmeGenerator } from '../../src/background/readmeGenerator';
import { SyncStats, CachedProblem } from '../../src/types';

const mockStats: SyncStats = {
  totalSolved: 3,
  easyCount: 1,
  mediumCount: 1,
  hardCount: 1,
  lastSyncedProblem: null,
};

const mockCache: Record<string, CachedProblem> = {
  '0002': {
    problemNumber: '0002',
    titleSlug: 'add-two-numbers',
    difficulty: 'Medium',
    fileSha: 's2',
    codeHash: 'h2',
    lastUpdated: 1600000000000,
  },
  '0001': {
    problemNumber: '0001',
    titleSlug: 'two-sum',
    difficulty: 'Easy',
    fileSha: 's1',
    codeHash: 'h1',
    lastUpdated: 1600000000000,
  },
  '0004': {
    problemNumber: '0004',
    titleSlug: 'median-of-two-sorted-arrays',
    difficulty: 'Hard',
    fileSha: 's4',
    codeHash: 'h4',
    lastUpdated: 1600000000000,
  },
};

describe('ReadmeGenerator Markdown Builder', () => {
  it('generates markdown dashboard table sorted ascending numerically by problem number', () => {
    const md = ReadmeGenerator.generate(mockStats, mockCache);

    expect(md).toContain('# LeetCode Solutions & Synchronization Index');
    expect(md).toContain('| **3** | 1 | 1 | 1 |');

    const indexOf1 = md.indexOf('| 0001 |');
    const indexOf2 = md.indexOf('| 0002 |');
    const indexOf4 = md.indexOf('| 0004 |');

    expect(indexOf1).toBeLessThan(indexOf2);
    expect(indexOf2).toBeLessThan(indexOf4);
    expect(md).toContain('[Two Sum](https://leetcode.com/problems/two-sum/)');
  });

  it('outputs fallback row when cache dictionary is empty', () => {
    const emptyStats: SyncStats = {
      totalSolved: 0,
      easyCount: 0,
      mediumCount: 0,
      hardCount: 0,
      lastSyncedProblem: null,
    };

    const md = ReadmeGenerator.generate(emptyStats, {});
    expect(md).toContain('| - | No solutions synced yet | - | - |');
  });
});
