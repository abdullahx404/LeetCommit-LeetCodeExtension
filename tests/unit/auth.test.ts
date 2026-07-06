import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  identity: {
    getRedirectURL: vi.fn(() => 'https://gkpnlnaolclnallgnjjbkenfgngebcpl.chromiumapp.org/'),
    launchWebAuthFlow: vi.fn(),
  },
  runtime: {
    lastError: undefined,
  },
} as unknown as typeof chrome;

import { GitHubAuthService, GITHUB_OAUTH_CLIENT_ID } from '../../src/github/auth';
import { GitHubService } from '../../src/github';
import { StorageService } from '../../src/storage';
import { UserSettings } from '../../src/types';

describe('GitHubAuthService & Automatic Repository Creation Engine', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await StorageService.clearAll();
  });

  it('verifies a valid token and retrieves user profile from GitHub API', async () => {
    const mockProfile = { login: 'testuser', avatar_url: 'https://example.com/avatar.png', name: 'Test User' };
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProfile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const profile = await GitHubAuthService.verifyToken('valid_token_123');
    expect(profile.login).toBe('testuser');
    expect(fetchSpy).toHaveBeenCalledWith('https://api.github.com/user', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer valid_token_123',
      }),
    }));
  });

  it('throws an error when verifying an invalid token', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
      })
    );

    await expect(GitHubAuthService.verifyToken('invalid_token')).rejects.toThrow('GitHub authentication failed');
  });

  it('authorizes with token, saves user profile, and defaults repoName to LeetCode', async () => {
    vi.spyOn(GitHubAuthService, 'verifyToken').mockResolvedValueOnce({ login: 'abdullahx404' });

    const settings = await GitHubAuthService.authorizeWithToken('oauth_token_xyz', 'oauth');
    expect(settings.githubToken).toBe('oauth_token_xyz');
    expect(settings.repoOwner).toBe('abdullahx404');
    expect(settings.repoName).toBe('LeetCode');
    expect(settings.authType).toBe('oauth');
    expect(settings.isPrivate).toBe(false);

    const stored = await StorageService.getSettings();
    expect(stored?.repoOwner).toBe('abdullahx404');
    expect(stored?.repoName).toBe('LeetCode');
  });

  it('ensureRepositoryExists returns true if repository already exists (200 OK)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 123, name: 'LeetCode' }), { status: 200 })
    );

    const settings: UserSettings = {
      githubToken: 'token_123',
      repoOwner: 'abdullahx404',
      repoName: 'LeetCode',
      rootFolder: 'LeetCode',
      autoSyncEnabled: true,
    };

    const exists = await GitHubService.ensureRepositoryExists(settings);
    expect(exists).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/repos/abdullahx404/LeetCode',
      expect.any(Object)
    );
  });

  it('ensureRepositoryExists automatically creates repository via POST /user/repos when 404', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 456, name: 'LeetCode' }), { status: 201 }));

    const settings: UserSettings = {
      githubToken: 'token_123',
      repoOwner: 'abdullahx404',
      repoName: 'LeetCode',
      rootFolder: 'LeetCode',
      autoSyncEnabled: true,
      isPrivate: false,
    };

    const exists = await GitHubService.ensureRepositoryExists(settings);
    expect(exists).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const secondCallArgs = fetchSpy.mock.calls[1];
    expect(secondCallArgs?.[0]).toBe('https://api.github.com/user/repos');
    expect(secondCallArgs?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'LeetCode',
          description: 'LeetCode accepted solutions automatically synchronized by LeetCommit.',
          private: false,
          auto_init: true,
        }),
      })
    );
  });

  it('exchanges OAuth authorization code for access token when code is returned', async () => {
    vi.spyOn(chrome.identity, 'launchWebAuthFlow').mockImplementationOnce((_, callback) => {
      callback('https://gkpnlnaolclnallgnjjbkenfgngebcpl.chromiumapp.org/?code=auth_code_123');
    });

    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'exchanged_token_456' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'abdullahx404' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, name: 'LeetCode' }), { status: 200 }));

    const settings = await GitHubAuthService.authorize();
    expect(settings.githubToken).toBe('exchanged_token_456');
    expect(settings.repoOwner).toBe('abdullahx404');
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://github.com/login/oauth/access_token');
  });
});
