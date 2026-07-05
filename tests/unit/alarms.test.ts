import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlarmService } from '../../src/background/alarms';
import { StorageService } from '../../src/storage';
import { SyncQueue } from '../../src/background/syncQueue';
import { SubmissionMetadata } from '../../src/types';

const sampleMeta: SubmissionMetadata = {
  problemTitle: 'Offline Problem',
  problemNumber: '0999',
  difficulty: 'Medium',
  language: 'go',
  extension: 'go',
  sourceCode: 'package main',
  timestamp: 1800000000,
};

describe('AlarmService Offline Retry Handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('schedules retry wakeup alarm with delayInMinutes parameter', () => {
    const createSpy = vi.fn();
    vi.stubGlobal('chrome', {
      alarms: { create: createSpy },
    });

    AlarmService.scheduleRetry(5);
    expect(createSpy).toHaveBeenCalledWith('LEETCOMMIT_RETRY_SYNC', { delayInMinutes: 5 });
  });

  it('drains offline queue items and re-enqueues them into SyncQueue', async () => {
    vi.spyOn(StorageService, 'getOfflineQueue').mockResolvedValue([sampleMeta]);
    const saveSpy = vi.spyOn(StorageService, 'saveOfflineQueue').mockResolvedValue();
    const enqueueSpy = vi.spyOn(SyncQueue, 'enqueue').mockImplementation(() => {});

    await AlarmService.processOfflineQueue();

    expect(saveSpy).toHaveBeenCalledWith([]);
    expect(enqueueSpy).toHaveBeenCalledWith(sampleMeta);
  });
});
