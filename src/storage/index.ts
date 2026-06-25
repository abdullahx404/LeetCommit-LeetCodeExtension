import { UserSettings, CachedProblem, SyncStats } from '../types';

/**
 * Storage service managing chrome.storage.local interactions.
 */
export class StorageService {
  private static readonly SETTINGS_KEY = 'settings';
  private static readonly CACHE_KEY = 'cache';
  private static readonly STATS_KEY = 'stats';

  public static async getSettings(): Promise<UserSettings | null> {
    const data = await chrome.storage.local.get(this.SETTINGS_KEY);
    return (data[this.SETTINGS_KEY] as UserSettings) || null;
  }

  public static async saveSettings(settings: UserSettings): Promise<void> {
    await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
  }

  public static async getCache(): Promise<Record<string, CachedProblem>> {
    const data = await chrome.storage.local.get(this.CACHE_KEY);
    return (data[this.CACHE_KEY] as Record<string, CachedProblem>) || {};
  }

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
}
