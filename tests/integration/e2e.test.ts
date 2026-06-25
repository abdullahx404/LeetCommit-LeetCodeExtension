import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncQueue, computeCodeHash } from '../../src/background/syncQueue';
import { StorageService } from '../../src/storage';
import { GitHubService } from '../../src/github';
import { SubmissionMetadata, UserSettings } from '../../src/types';
import { utf8ToBase64 } from '../../src/utils';

const testSettings: UserSettings = {
  githubToken: 'ghp_secret_integration_token',
  repoOwner: 'leetcode_master',
  repoName: 'my_solutions',
  rootFolder: 'LeetCode',
  autoSyncEnabled: true,
};

const submissionRainWater: SubmissionMetadata = {
  problemTitle: 'Trapping Rain Water',
  problemNumber: '0042',
  difficulty: 'Hard',
  language: 'C++',
  extension: 'cpp',
  sourceCode: 'class Solution {\npublic:\n    int trap(vector<int>& height) { return 42; }\n};',
  timestamp: 1700000000000,
};

const submissionTwoSum: SubmissionMetadata = {
  problemTitle: 'Two Sum',
  problemNumber: '0001',
  difficulty: 'Easy',
  language: 'python3',
  extension: 'py',
  sourceCode: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]',
  timestamp: 1700000005000,
};

describe('End-to-End System Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    SyncQueue.clearQueue();
  });

  it('orchestrates complete lifecycle from submission capture to README dashboard refresh', async () => {
    // 1. Setup Storage state
    let memoryCache: Record<string, unknown> = {};
    let memoryStats = {
      totalSolved: 0,
      easyCount: 0,
      mediumCount: 0,
      hardCount: 0,
      lastSyncedProblem: null,
    };

    vi.spyOn(StorageService, 'getSettings').mockResolvedValue(testSettings);
    vi.spyOn(StorageService, 'getCache').mockImplementation(() => Promise.resolve(memoryCache as unknown as Record<string, never>));
    vi.spyOn(StorageService, 'updateCacheProblem').mockImplementation((prob) => {
      memoryCache[prob.problemNumber] = prob;
      return Promise.resolve();
    });
    vi.spyOn(StorageService, 'getStats').mockImplementation(() => Promise.resolve(memoryStats));
    vi.spyOn(StorageService, 'saveStats').mockImplementation((s) => {
      memoryStats = s;
      return Promise.resolve();
    });

    // 2. Setup GitHub API network intercepts
    const putPayloads: Array<{ path: string; content: string; message: string }> = [];
    vi.spyOn(GitHubService, 'createOrUpdateFile').mockImplementation((_settings, path, contentBase64, message) => {
      putPayloads.push({ path, content: contentBase64, message });
      return Promise.resolve({
        content: {
          name: path.split('/').pop() || '',
          path,
          sha: `sha_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          size: 100,
          url: '',
          html_url: '',
          git_url: '',
          download_url: '',
          type: 'file',
        },
        commit: { sha: 'commit_sha', message },
      });
    });

    // STEP A: Sync first Hard problem
    const successRain = await SyncQueue.syncSubmission(submissionRainWater);
    expect(successRain).toBe(true);

    // Verify PUT requests (Solution file + README index)
    expect(putPayloads.length).toBe(2);
    expect(putPayloads[0].path).toBe('LeetCode/Hard/0042 - Trapping Rain Water.cpp');
    expect(putPayloads[0].content).toBe(utf8ToBase64(submissionRainWater.sourceCode));
    expect(putPayloads[1].path).toBe('LeetCode/README.md');

    // Verify decoded README table
    const readmeDecoded1 = Buffer.from(putPayloads[1].content, 'base64').toString('utf8');
    expect(readmeDecoded1).toContain('| **1** | 0 | 0 | 1 |');
    expect(readmeDecoded1).toContain('| 0042 | [Trapping Rain Water](https://leetcode.com/problems/trapping-rain-water/) | Hard |');

    // Verify Storage State
    expect(memoryStats.totalSolved).toBe(1);
    expect(memoryStats.hardCount).toBe(1);
    expect(Object.keys(memoryCache)).toContain('0042');

    // STEP B: Deduplication Verification (Submit identical code again)
    putPayloads.length = 0; // Clear recorded network requests
    const duplicateRain = await SyncQueue.syncSubmission(submissionRainWater);
    expect(duplicateRain).toBe(false);
    expect(putPayloads.length).toBe(0); // Zero network calls triggered!

    // STEP C: Sync second Easy problem
    const successTwo = await SyncQueue.syncSubmission(submissionTwoSum);
    expect(successTwo).toBe(true);
    expect(putPayloads.length).toBe(2);
    expect(putPayloads[0].path).toBe('LeetCode/Easy/0001 - Two Sum.py');

    // Verify final combined README sorting (#0001 before #0042)
    const readmeDecoded2 = Buffer.from(putPayloads[1].content, 'base64').toString('utf8');
    expect(readmeDecoded2).toContain('| **2** | 1 | 0 | 1 |');
    
    const idx0001 = readmeDecoded2.indexOf('| 0001 |');
    const idx0042 = readmeDecoded2.indexOf('| 0042 |');
    expect(idx0001).toBeLessThan(idx0042);
  });
});
