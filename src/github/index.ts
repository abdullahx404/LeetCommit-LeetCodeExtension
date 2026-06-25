import { UserSettings } from '../types';

/**
 * GitHub REST API v3 Client Service.
 */
export class GitHubService {
  private static readonly BASE_URL = 'https://api.github.com';

  public static async verifyCredentials(settings: UserSettings): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/user`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${settings.githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
