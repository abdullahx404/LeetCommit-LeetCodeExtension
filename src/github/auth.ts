import { UserSettings } from '../types';
import { StorageService } from '../storage';
import { GitHubService } from './index';

export const GITHUB_OAUTH_CLIENT_ID = 'Ov23lihTp3ChKn3OGdiE';
export const GITHUB_OAUTH_CLIENT_SECRET = ''; // Paste your generated Client Secret from GitHub here

export interface GitHubProfile {
  login: string;
  avatar_url?: string;
  name?: string;
}

/**
 * GitHubAuthService handles OAuth 2.0 Web Auth flows, token verification, and session management.
 */
export class GitHubAuthService {
  /**
   * Verifies a GitHub access token by fetching the authenticated user's profile from GET /user.
   */
  public static async verifyToken(token: string): Promise<GitHubProfile> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('GitHub token cannot be empty.');
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'LeetCommit-Extension',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub authentication failed: ${response.statusText} (${response.status})`);
    }

    const data = (await response.json()) as GitHubProfile;
    if (!data.login) {
      throw new Error('Invalid user profile returned from GitHub API.');
    }

    return {
      login: data.login,
      avatar_url: data.avatar_url,
      name: data.name,
    };
  }

  /**
   * Completes authentication using any token (OAuth or PAT), verifying profile and saving default UserSettings.
   */
  public static async authorizeWithToken(token: string, authType: 'oauth' | 'pat' = 'pat'): Promise<UserSettings> {
    const cleanToken = token.trim();
    const profile = await this.verifyToken(cleanToken);

    const existing = await StorageService.getSettings();

    const newSettings: UserSettings = {
      githubToken: cleanToken,
      repoOwner: profile.login,
      repoName: existing?.repoName || 'LeetCode',
      rootFolder: existing?.rootFolder || 'LeetCode',
      autoSyncEnabled: existing?.autoSyncEnabled !== undefined ? existing.autoSyncEnabled : true,
      authType,
      oauthToken: authType === 'oauth' ? cleanToken : undefined,
      username: profile.login,
      isPrivate: existing?.isPrivate !== undefined ? existing.isPrivate : false,
    };

    await StorageService.saveSettings(newSettings);
    return newSettings;
  }

  /**
   * Initiates 1-Click GitHub OAuth 2.0 flow using chrome.identity.launchWebAuthFlow.
   */
  public static async authorize(): Promise<UserSettings> {
    if (!chrome?.identity?.launchWebAuthFlow) {
      throw new Error('chrome.identity API is not available in this environment.');
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl =
      'https://github.com/login/oauth/authorize?' +
      new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'repo,user',
      }).toString();

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (callbackUrl?: string) => {
          void (async () => {
            if (chrome.runtime.lastError || !callbackUrl) {
              const errMsg = chrome.runtime.lastError?.message || 'Authorization window was closed or failed.';
              return reject(new Error(errMsg));
            }

            try {
              const urlObj = new URL(callbackUrl);
              const code = urlObj.searchParams.get('code');
              const token = urlObj.searchParams.get('access_token') || urlObj.hash.match(/access_token=([^&]+)/)?.[1];

              if (token) {
                const settings = await this.authorizeWithToken(token, 'oauth');
                await GitHubService.ensureRepositoryExists(settings);
                return resolve(settings);
              }

              if (code) {
                const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  body: JSON.stringify({
                    client_id: GITHUB_OAUTH_CLIENT_ID,
                    client_secret: GITHUB_OAUTH_CLIENT_SECRET,
                    code: code,
                    redirect_uri: redirectUri,
                  }),
                });

                const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string; error_description?: string };
                if (tokenData.access_token) {
                  const settings = await this.authorizeWithToken(tokenData.access_token, 'oauth');
                  await GitHubService.ensureRepositoryExists(settings);
                  return resolve(settings);
                }

                const githubError = tokenData.error_description || tokenData.error || 'Unknown error';
                throw new Error(`Failed to exchange OAuth code: ${githubError}. Please generate a Client Secret in your GitHub OAuth App settings and paste it into GITHUB_OAUTH_CLIENT_SECRET in src/github/auth.ts.`);
              }

              throw new Error('No access token returned from GitHub authorization flow.');
            } catch (err) {
              reject(err);
            }
          })();
        }
      );
    });
  }

  /**
   * Logs out the user by clearing saved authentication settings.
   */
  public static async logout(): Promise<void> {
    await StorageService.clearAll();
  }
}
