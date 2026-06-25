import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubService, GitHubApiError } from '../../src/github';
import { UserSettings } from '../../src/types';

const mockSettings: UserSettings = {
  githubToken: 'pat_test_token',
  repoOwner: 'testuser',
  repoName: 'testrepo',
  rootFolder: 'LeetCode',
  autoSyncEnabled: true,
};

describe('GitHubService REST API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies credentials successfully when repository endpoint returns 200 OK', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const isValid = await GitHubService.verifyCredentials(mockSettings);
    expect(isValid).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/testuser/testrepo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pat_test_token',
        }) as unknown,
      })
    );
  });

  it('returns false for verification when token is unauthorized (401)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const isValid = await GitHubService.verifyCredentials(mockSettings);
    expect(isValid).toBe(false);
  });

  it('resolves file SHA when file exists (200 OK)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sha: 'sha_abc123' }),
    } as Response);

    const sha = await GitHubService.getFileSha(mockSettings, 'LeetCode/Easy/test.py');
    expect(sha).toBe('sha_abc123');
  });

  it('returns null when file does not exist (404 Not Found)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const sha = await GitHubService.getFileSha(mockSettings, 'LeetCode/Easy/nonexistent.py');
    expect(sha).toBeNull();
  });

  it('throws GitHubApiError when API returns 409 Conflict or 422 Unprocessable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () => Promise.resolve({ message: 'Invalid branch' }),
    } as Response);

    await expect(GitHubService.getFileSha(mockSettings, 'bad/path.py')).rejects.toThrow(GitHubApiError);
  });

  it('creates or updates file via PUT payload', async () => {
    const mockResponse = {
      content: {
        name: 'solution.py',
        path: 'LeetCode/Easy/solution.py',
        sha: 'new_sha_999',
        size: 100,
        url: 'https://api.github.com/...',
        html_url: 'https://github.com/...',
        git_url: '',
        download_url: '',
        type: 'file',
      },
      commit: {
        sha: 'commit_sha_888',
        message: 'Sync solution',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await GitHubService.createOrUpdateFile(
      mockSettings,
      'LeetCode/Easy/solution.py',
      'cHJpbnQoImhlbGxvIik=',
      'Sync solution',
      'old_sha_111'
    );

    expect(result.content.sha).toBe('new_sha_999');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/testuser/testrepo/contents/LeetCode/Easy/solution.py',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          message: 'Sync solution',
          content: 'cHJpbnQoImhlbGxvIik=',
          sha: 'old_sha_111',
        }),
      })
    );
  });
});
