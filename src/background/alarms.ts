import { StorageService } from '../storage';
import { SyncQueue } from './syncQueue';
import { SubmissionMetadata } from '../types';

/**
 * Service managing Chrome Alarms for offline retry scheduling.
 */
export class AlarmService {
  public static readonly RETRY_ALARM_NAME = 'LEETCOMMIT_RETRY_SYNC';

  /**
   * Schedules a background wakeup alarm to retry offline synchronization.
   */
  public static scheduleRetry(delayMinutes = 1): void {
    if (chrome.alarms && chrome.alarms.create) {
      void chrome.alarms.create(this.RETRY_ALARM_NAME, {
        delayInMinutes: delayMinutes,
      });
      console.warn(`Scheduled offline retry wakeup alarm in ${delayMinutes}m.`);
    }
  }

  /**
   * Registers alarm listener for offline queue processing.
   */
  public static setupAlarmListener(): void {
    if (!chrome.alarms || !chrome.alarms.onAlarm) return;

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.RETRY_ALARM_NAME) {
        void this.processOfflineQueue();
      }
    });
  }

  /**
   * Drains the stored offline submission queue.
   */
  public static async processOfflineQueue(): Promise<void> {
    try {
      const queue = (await StorageService.getOfflineQueue()) as SubmissionMetadata[];
      if (queue.length === 0) return;

      console.warn(`Processing ${queue.length} offline retry items...`);
      const nextItem = queue.shift();
      await StorageService.saveOfflineQueue(queue);

      if (nextItem) {
        SyncQueue.enqueue(nextItem);
      }
    } catch (err) {
      console.error('Failed to process offline queue:', err);
    }
  }
}
