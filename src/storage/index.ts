import { UserSettings, CachedProblem, SyncStats } from '../types';

/**
 * StorageService encapsulates all asynchronous operations against chrome.storage.local.
 */
export class StorageService {
  private static readonly SETTINGS_KEY = 'settings';
  private static readonly CACHE_KEY = 'cache';
  private static readonly STATS_KEY = 'stats';

  /**
   * Retrieves user configuration settings.
   */
  public static async getSettings(): Promise<UserSettings | null> {
    const data = await chrome.storage.local.get(this.SETTINGS_KEY);
    const settings = (data[this.SETTINGS_KEY] as UserSettings) || null;
    if (settings) {
      if (!settings.repoName) settings.repoName = 'LeetCode';
      if (!settings.rootFolder) settings.rootFolder = 'LeetCode';
      if (settings.isPrivate === undefined) settings.isPrivate = false;
      if (settings.authType === 'oauth' && settings.oauthToken) {
        settings.githubToken = settings.oauthToken;
        if (settings.username) settings.repoOwner = settings.username;
      }
    }
    return settings;
  }

  /**
   * Persists user configuration settings.
   */
  public static async saveSettings(settings: UserSettings): Promise<void> {
    await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
  }

  /**
   * Retrieves the entire problem SHA and code hash cache dictionary.
   */
  public static async getCache(): Promise<Record<string, CachedProblem>> {
    const data = await chrome.storage.local.get(this.CACHE_KEY);
    return (data[this.CACHE_KEY] as Record<string, CachedProblem>) || {};
  }

  /**
   * Updates or inserts a problem item in the cache dictionary.
   */
  public static async updateCacheProblem(problem: CachedProblem): Promise<void> {
    const cache = await this.getCache();
    cache[problem.problemNumber] = problem;
    await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
  }

  /**
   * Removes a specific problem from the cache dictionary.
   */
  public static async removeCacheProblem(problemNumber: string): Promise<void> {
    const cache = await this.getCache();
    delete cache[problemNumber];
    await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
  }

  /**
   * Retrieves synchronization statistics.
   */
  public static async getStats(): Promise<SyncStats> {
    const data = await chrome.storage.local.get(this.STATS_KEY);
    return (
      (data[this.STATS_KEY] as SyncStats) || {
        totalSolved: 0,
        easyCount: 0,
        mediumCount: 0,
        hardCount: 0,
        lastSyncedProblem: null,
      }
    );
  }

  /**
   * Persists synchronization statistics.
   */
  public static async saveStats(stats: SyncStats): Promise<void> {
    await chrome.storage.local.set({ [this.STATS_KEY]: stats });
  }

  /**
   * Clears authentication and configuration settings without wiping solved problem cache or stats.
   */
  public static async clearAll(): Promise<void> {
    await chrome.storage.local.remove(this.SETTINGS_KEY);
  }

  private static readonly OFFLINE_KEY = 'offline_queue';

  /**
   * Retrieves offline retry submission queue.
   */
  public static async getOfflineQueue(): Promise<unknown[]> {
    const data = await chrome.storage.local.get(this.OFFLINE_KEY);
    return (data[this.OFFLINE_KEY] as unknown[]) || [];
  }

  /**
   * Persists offline retry submission queue.
   */
  public static async saveOfflineQueue(queue: unknown[]): Promise<void> {
    await chrome.storage.local.set({ [this.OFFLINE_KEY]: queue });
  }
}
