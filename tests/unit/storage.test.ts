import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeFilename, utf8ToBase64 } from '../../src/utils';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};

global.chrome = {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) delete mockStorage[k];
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        for (const prop of Object.keys(mockStorage)) delete mockStorage[prop];
        return Promise.resolve();
      }),
    },
  },
} as unknown as typeof chrome;

import { StorageService } from '../../src/storage';

describe('LeetCommit Utility Functions', () => {
  it('sanitizes problematic filenames correctly', () => {
    const rawTitle = 'Two Sum / Add Numbers : Quick <Test> *?';
    const clean = sanitizeFilename(rawTitle);
    expect(clean).toBe('Two Sum  Add Numbers  Quick Test');
  });

  it('encodes UTF-8 strings containing Unicode into valid Base64', () => {
    const rawCode = '// Comment with Unicode\nclass Solution {}';
    const encoded = utf8ToBase64(rawCode);
    expect(encoded).toBe(btoa(rawCode));
  });
});

describe('StorageService CRUD Operations', () => {
  beforeEach(async () => {
    await StorageService.clearAll();
    vi.clearAllMocks();
  });

  it('saves and retrieves user settings accurately', async () => {
    const testSettings = {
      githubToken: 'pat_test_123',
      repoOwner: 'owner_test',
      repoName: 'repo_test',
      rootFolder: 'LeetCode',
      autoSyncEnabled: true,
    };

    await StorageService.saveSettings(testSettings);
    const retrieved = await StorageService.getSettings();

    expect(retrieved).toEqual(testSettings);
  });

  it('handles empty settings gracefully', async () => {
    const retrieved = await StorageService.getSettings();
    expect(retrieved).toBeNull();
  });

  it('updates and deletes problem cache items', async () => {
    const mockProblem = {
      problemNumber: '0001',
      titleSlug: 'two-sum',
      difficulty: 'Easy' as const,
      fileSha: 'sha_123',
      codeHash: 'hash_123',
      lastUpdated: 1600000000,
    };

    await StorageService.updateCacheProblem(mockProblem);
    let cache = await StorageService.getCache();
    expect(cache['0001']).toEqual(mockProblem);

    await StorageService.removeCacheProblem('0001');
    cache = await StorageService.getCache();
    expect(cache['0001']).toBeUndefined();
  });
});
