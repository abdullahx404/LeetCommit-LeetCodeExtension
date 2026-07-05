import { UserSettings } from '../types';

/**
 * Custom Error class representing GitHub REST API v3 HTTP failures.
 */
export class GitHubApiError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
    public readonly endpoint: string
  ) {
    super(`GitHub API Error (${statusCode}) at ${endpoint}: ${message}`);
    this.name = 'GitHubApiError';
  }
}

export interface GitHubFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
  };
  commit: {
    sha: string;
    message: string;
  };
}

/**
 * Service managing direct REST API v3 interactions against api.github.com.
 */
export class GitHubService {
  private static readonly BASE_URL = 'https://api.github.com';
  private static readonly API_VERSION = '2022-11-28';
  private static readonly MAX_RETRIES = 3;

  /**
   * Helper executing fetch with automatic rate limit backoff and authorization headers.
   */
  private static async request(
    endpoint: string,
    token: string,
    options: RequestInit = {},
    retries = 0
  ): Promise<Response> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': this.API_VERSION,
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(url, { ...options, headers });

    // Handle rate limit or temporary server errors with exponential backoff
    if ((response.status === 403 || response.status >= 500) && retries < this.MAX_RETRIES) {
      const resetHeader = response.headers.get('x-ratelimit-reset');
      let waitMs = Math.pow(2, retries) * 1000;

      if (response.status === 403 && resetHeader) {
        const resetEpoch = parseInt(resetHeader, 10) * 1000;
        const now = Date.now();
        if (resetEpoch > now && resetEpoch - now < 10000) {
          waitMs = resetEpoch - now + 500;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.request(endpoint, token, options, retries + 1);
    }

    return response;
  }

  private static clean(settings: UserSettings): { owner: string; name: string; token: string } {
    return {
      owner: (settings.repoOwner || '').replace(/['"\s]/g, ''),
      name: (settings.repoName || '').replace(/['"\s]/g, '').replace(/\.git$/i, ''),
      token: (settings.githubToken || '').replace(/['"\s]/g, ''),
    };
  }

  /**
   * Verifies if the provided configuration settings and Personal Access Token are valid and have write access.
   */
  public static async verifyCredentials(settings: UserSettings): Promise<boolean> {
    const { owner, name, token } = this.clean(settings);

    if (!token || !owner || !name) {
      return false;
    }

    try {
      const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
      const response = await this.request(endpoint, token);
      if (!response.ok) return false;

      let data: { permissions?: { push?: boolean; admin?: boolean; maintain?: boolean } } | null = null;
      if (typeof response.json === 'function') {
        try {
          data = (await response.json()) as { permissions?: { push?: boolean; admin?: boolean; maintain?: boolean } };
        } catch {
          // Ignore json parse error if response body is empty
        }
      }
      if (data && data.permissions && !data.permissions.push && !data.permissions.admin && !data.permissions.maintain) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves the SHA of an existing file in the target repository.
   * Returns null if the file does not exist (404).
   * Throws GitHubApiError on authentication or permissions failure.
   */
  public static async getFileSha(settings: UserSettings, filePath: string): Promise<string | null> {
    const { owner, name, token } = this.clean(settings);
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
    const response = await this.request(endpoint, token);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = (await response.json()) as { message?: string };
        if (errJson.message) errText = errJson.message;
      } catch {
        // Fallback to statusText
      }
      throw new GitHubApiError(response.status, errText, endpoint);
    }

    const data = (await response.json()) as { sha?: string };
    return data.sha ?? null;
  }

  /**
   * Creates or updates a file in the target GitHub repository.
   */
  public static async createOrUpdateFile(
    settings: UserSettings,
    filePath: string,
    contentBase64: string,
    commitMessage: string,
    existingSha?: string | null
  ): Promise<GitHubFileResponse> {
    const { owner, name, token } = this.clean(settings);
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;

    // If existingSha wasn't explicitly supplied, check if file already exists
    let shaToUse = existingSha;
    if (shaToUse === undefined) {
      shaToUse = await this.getFileSha(settings, filePath);
    }

    const payload: Record<string, string> = {
      message: commitMessage,
      content: contentBase64,
    };

    if (shaToUse) {
      payload.sha = shaToUse;
    }

    const response = await this.request(endpoint, token, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = (await response.json()) as { message?: string };
        if (errJson.message) errText = errJson.message;
      } catch {
        // Fallback to statusText
      }
      throw new GitHubApiError(response.status, errText, endpoint);
    }

    return (await response.json()) as GitHubFileResponse;
  }

  /**
   * Ensures the target repository exists on GitHub, automatically creating it if it does not.
   */
  public static async ensureRepositoryExists(settings: UserSettings): Promise<boolean> {
    const { owner, name, token } = this.clean(settings);
    const getEndpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    try {
      const res = await this.request(getEndpoint, token, { method: 'GET' });
      if (res.ok) {
        return true;
      }
      if (res.status !== 404) {
        return false;
      }
    } catch {
      // Continue to try creating repo if 404
    }

    const createEndpoint = '/user/repos';
    const payload = {
      name: name,
      description: 'LeetCode accepted solutions automatically synchronized by LeetCommit.',
      private: settings.isPrivate !== undefined ? settings.isPrivate : false,
      auto_init: true,
    };

    const createRes = await this.request(createEndpoint, token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      let errText = createRes.statusText;
      try {
        const errJson = (await createRes.json()) as { message?: string };
        if (errJson.message) errText = errJson.message;
      } catch {
        // Fallback
      }
      throw new GitHubApiError(createRes.status, `Failed to create repository ${name}: ${errText}`, createEndpoint);
    }

    return true;
  }
}
