import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncQueue, computeCodeHash } from '../../src/background/syncQueue';
import { StorageService } from '../../src/storage';
import { GitHubService } from '../../src/github';
import { SubmissionMetadata } from '../../src/types';

const sampleMeta: SubmissionMetadata = {
  problemTitle: 'Two Sum',
  problemNumber: '0001',
  difficulty: 'Easy',
  language: 'python',
  extension: 'py',
  sourceCode: 'def twoSum():\n    return [0, 1]',
  timestamp: 1600000000,
};

describe('Code Hash Deduplication Utility', () => {
  it('computes identical hash for source code differing only by whitespace or indentation', () => {
    const codeA = 'class Solution:\n    def foo(): pass';
    const codeB = 'class Solution: def foo():pass ';
    expect(computeCodeHash(codeA)).toBe(computeCodeHash(codeB));
  });

  it('computes distinct hash for different code logic', () => {
    expect(computeCodeHash('return 1')).not.toBe(computeCodeHash('return 2'));
  });
});

describe('SyncQueue Orchestrator Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    SyncQueue.clearQueue();
  });

  it('skips sync when user settings are unconfigured or autoSyncEnabled is false', async () => {
    vi.spyOn(StorageService, 'getSettings').mockResolvedValue({
      githubToken: 'pat',
      repoOwner: 'owner',
      repoName: 'repo',
      rootFolder: 'LeetCode',
      autoSyncEnabled: false,
    });

    const uploadSpy = vi.spyOn(GitHubService, 'createOrUpdateFile');
    const result = await SyncQueue.syncSubmission(sampleMeta);

    expect(result).toBe(false);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('skips upload when identical codeHash exists in problem cache', async () => {
    const codeHash = computeCodeHash(sampleMeta.sourceCode);

    vi.spyOn(StorageService, 'getSettings').mockResolvedValue({
      githubToken: 'pat',
      repoOwner: 'owner',
      repoName: 'repo',
      rootFolder: 'LeetCode',
      autoSyncEnabled: true,
    });

    vi.spyOn(StorageService, 'getCache').mockResolvedValue({
      '0001': {
        problemNumber: '0001',
        titleSlug: 'two-sum',
        difficulty: 'Easy',
        fileSha: 'old_sha',
        codeHash,
        lastUpdated: 1500000000,
      },
    });

    const uploadSpy = vi.spyOn(GitHubService, 'createOrUpdateFile');
    const result = await SyncQueue.syncSubmission(sampleMeta);

    expect(result).toBe(false);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('executes upload and updates cache and stats for new solutions', async () => {
    vi.spyOn(StorageService, 'getSettings').mockResolvedValue({
      githubToken: 'pat_token',
      repoOwner: 'owner',
      repoName: 'repo',
      rootFolder: 'LeetCode',
      autoSyncEnabled: true,
    });

    const mockCacheObj: Record<string, any> = {
      '0002': { difficulty: 'Medium' },
      '0003': { difficulty: 'Hard' },
    };
    vi.spyOn(StorageService, 'getCache').mockImplementation(async () => mockCacheObj);
    const cacheSpy = vi.spyOn(StorageService, 'updateCacheProblem').mockImplementation(async (prob) => {
      mockCacheObj[prob.problemNumber] = prob;
    });
    const statsGetSpy = vi.spyOn(StorageService, 'getStats').mockResolvedValue({
      totalSolved: 2,
      easyCount: 0,
      mediumCount: 1,
      hardCount: 1,
      lastSyncedProblem: null,
    });
    const statsSaveSpy = vi.spyOn(StorageService, 'saveStats').mockResolvedValue();

    vi.spyOn(GitHubService, 'createOrUpdateFile').mockResolvedValue({
      content: {
        name: '0001 - Two Sum.py',
        path: 'LeetCode/Easy/0001 - Two Sum.py',
        sha: 'new_sha_777',
        size: 50,
        url: '',
        html_url: '',
        git_url: '',
        download_url: '',
        type: 'file',
      },
      commit: { sha: 'c', message: 'm' },
    });

    const result = await SyncQueue.syncSubmission(sampleMeta);

    expect(result).toBe(true);
    expect(cacheSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        problemNumber: '0001',
        fileSha: 'new_sha_777',
      }) as unknown
    );
    expect(statsGetSpy).toHaveBeenCalled();
    expect(statsSaveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        totalSolved: 3,
        easyCount: 1,
        mediumCount: 1,
        hardCount: 1,
      }) as unknown
    );
  });
});
