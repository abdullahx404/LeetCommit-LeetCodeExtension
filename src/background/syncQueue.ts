import { SubmissionMetadata, CachedProblem, SyncStats } from '../types';
import { StorageService } from '../storage';
import { GitHubService } from '../github';
import { buildProblemFolderPath, extractTitleSlug } from '../content/parser';
import { utf8ToBase64 } from '../utils';
import { ReadmeGenerator } from './readmeGenerator';
import { AlarmService } from './alarms';

export interface QueueItem {
  meta: SubmissionMetadata;
  tabId?: number;
}

/**
 * Computes a fast deterministic 32-bit integer hash of a string, formatted as hex.
 * Used for smart code deduplication.
 */
export function computeCodeHash(code: string): string {
  const norm = code.replace(/\s+/g, '').trim();
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    const char = norm.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Orchestrator managing sequential asynchronous synchronization of accepted LeetCode solutions.
 */
export class SyncQueue {
  private static queue: QueueItem[] = [];
  private static isProcessing = false;

  private static notifyTab(tabId: number | undefined, payload: { status: 'SUCCESS' | 'SKIPPED' | 'ERROR'; title?: string; error?: string }): void {
    if (tabId !== undefined && chrome.tabs && chrome.tabs.sendMessage) {
      chrome.tabs.sendMessage(tabId, {
        type: 'GITLEET_SYNC_STATUS',
        payload,
      }).catch(() => {});
    }
  }

  /**
   * Pushes a new accepted submission item into the processing queue.
   */
  public static enqueue(meta: SubmissionMetadata, tabId?: number): void {
    this.queue.push({ meta, tabId });
    void this.processNext();
  }

  /**
   * Returns current pending queue size (useful for tests).
   */
  public static getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clears the pending queue.
   */
  public static clearQueue(): void {
    this.queue = [];
    this.isProcessing = false;
  }

  private static async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      await this.syncSubmission(item.meta, item.tabId);
    } catch (err) {
      console.error('Error synchronizing submission to GitHub:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown REST failure';
      
      try {
        const offlineQueue = (await StorageService.getOfflineQueue()) as SubmissionMetadata[];
        offlineQueue.push(item.meta);
        await StorageService.saveOfflineQueue(offlineQueue);
        AlarmService.scheduleRetry(1);
      } catch {
        // Silently ignore storage failure during offline fallback
      }

      this.notifyTab(item.tabId, { status: 'ERROR', error: `${errMsg}. Queued for offline retry.` });
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        void this.processNext();
      }
    }
  }

  /**
   * Core synchronization logic executing deduplication check and GitHub REST upload.
   */
  public static async syncSubmission(meta: SubmissionMetadata, tabId?: number): Promise<boolean> {
    const settings = await StorageService.getSettings();
    if (!settings || !settings.autoSyncEnabled || !settings.githubToken) {
      console.warn('Sync aborted: User settings unconfigured or auto-sync disabled.');
      this.notifyTab(tabId, { status: 'ERROR', error: 'GitLeet settings unconfigured or auto-sync disabled.' });
      return false;
    }

    const currentHash = computeCodeHash(meta.sourceCode);
    const cache = await StorageService.getCache();
    const existingCacheItem = cache[meta.problemNumber];

    if (existingCacheItem && existingCacheItem.codeHash === currentHash) {
      console.warn(`Problem ${meta.problemNumber} skipped: Identical solution hash already uploaded.`);
      this.notifyTab(tabId, { status: 'SKIPPED', title: meta.problemTitle });
      return false;
    }

    const folderPath = buildProblemFolderPath(settings.rootFolder, meta);
    const codePath = `${folderPath}/Solution.${meta.extension}`;
    const base64Code = utf8ToBase64(meta.sourceCode);
    
    // Exact user requested commit message format
    const timeStr = meta.runtime || '0 ms';
    const spaceStr = meta.memory || '0 MB';
    const commitMsg = `Time: ${timeStr}, Space: ${spaceStr}`;

    const shaToPass = existingCacheItem ? existingCacheItem.fileSha : undefined;

    const res = await GitHubService.createOrUpdateFile(
      settings,
      codePath,
      base64Code,
      commitMsg,
      shaToPass
    );

    const newSha = res.content ? res.content.sha : '';
    let readmeSha = existingCacheItem?.readmeSha;

    if (meta.readmeContent) {
      try {
        const docPath = `${folderPath}/README.md`;
        const base64Doc = utf8ToBase64(meta.readmeContent);
        const docRes = await GitHubService.createOrUpdateFile(
          settings,
          docPath,
          base64Doc,
          `Docs: Add problem statement for ${meta.problemTitle}`,
          readmeSha
        );
        if (docRes.content) {
          readmeSha = docRes.content.sha;
        }
      } catch (err) {
        console.error('Failed to upload problem README.md:', err);
      }
    }

    const titleSlug = extractTitleSlug(meta.problemTitle.toLowerCase().replace(/\s+/g, '-'));

    const updatedProblem: CachedProblem = {
      problemNumber: meta.problemNumber,
      titleSlug,
      difficulty: meta.difficulty,
      fileSha: newSha,
      readmeSha,
      codeHash: currentHash,
      lastUpdated: Date.now(),
      runtime: timeStr,
      memory: spaceStr,
    };

    await StorageService.updateCacheProblem(updatedProblem);
    await this.updateSyncStats(meta);

    try {
      const latestStats = await StorageService.getStats();
      const latestCache = await StorageService.getCache();
      const mdContent = ReadmeGenerator.generate(latestStats, latestCache);
      const base64Md = utf8ToBase64(mdContent);
      const cleanRoot = settings.rootFolder.replace(/^\/+|\/+$/g, '').trim();
      const readmeIndexPath = cleanRoot && cleanRoot.toLowerCase() !== 'leetcode' ? `${cleanRoot}/README.md` : 'README.md';

      await GitHubService.createOrUpdateFile(
        settings,
        readmeIndexPath,
        base64Md,
        'Update repository README index'
      );
    } catch (readmeErr) {
      console.error('Failed to update repository README index:', readmeErr);
    }

    console.warn(`Successfully synchronized ${meta.problemTitle} to GitHub.`);
    this.notifyTab(tabId, { status: 'SUCCESS', title: meta.problemTitle });
    return true;
  }

  private static async updateSyncStats(meta: SubmissionMetadata): Promise<void> {
    const stats: SyncStats = await StorageService.getStats();
    stats.totalSolved += 1;

    if (meta.difficulty === 'Easy') stats.easyCount += 1;
    else if (meta.difficulty === 'Hard') stats.hardCount += 1;
    else stats.mediumCount += 1;

    stats.lastSyncedProblem = {
      number: meta.problemNumber,
      title: meta.problemTitle,
      language: meta.language,
      timestamp: meta.timestamp,
    };

    await StorageService.saveStats(stats);
  }
}
