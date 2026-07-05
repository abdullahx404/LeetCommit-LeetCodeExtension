import { StorageService } from '../storage';
import { SyncStats } from '../types';

/**
 * Formats a Unix timestamp into relative time string.
 */
function formatTimeRelative(timestamp: number): string {
  if (!timestamp) return 'Never';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

async function renderDashboard(): Promise<void> {
  try {
    const stats: SyncStats = await StorageService.getStats();

    const totalEl = document.getElementById('total-solved');
    const easyEl = document.getElementById('easy-cnt');
    const medEl = document.getElementById('medium-cnt');
    const hardEl = document.getElementById('hard-cnt');

    if (totalEl) totalEl.textContent = String(stats.totalSolved);
    if (easyEl) easyEl.textContent = String(stats.easyCount);
    if (medEl) medEl.textContent = String(stats.mediumCount);
    if (hardEl) hardEl.textContent = String(stats.hardCount);

    if (stats.lastSyncedProblem) {
      const titleEl = document.getElementById('last-title');
      const langEl = document.getElementById('last-lang');
      const timeEl = document.getElementById('last-time');

      if (titleEl) titleEl.textContent = stats.lastSyncedProblem.title;
      if (langEl) langEl.textContent = stats.lastSyncedProblem.language || 'Code';
      if (timeEl) timeEl.textContent = formatTimeRelative(stats.lastSyncedProblem.timestamp);
    }

    const settings = await StorageService.getSettings();
    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
      if (settings && settings.githubToken) {
        statusEl.textContent = `Connected (${settings.username || settings.repoOwner})`;
        statusEl.style.color = '#3fb950';
      } else {
        statusEl.textContent = 'Not Connected';
        statusEl.style.color = '#f85149';
      }
    }
  } catch (err) {
    console.error('Failed to render popup stats:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void renderDashboard();

  const settingsBtn = document.getElementById('open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (chrome.runtime && chrome.runtime.openOptionsPage) {
        void chrome.runtime.openOptionsPage();
      }
    });
  }

  const guideBtn = document.getElementById('open-guide');
  const guideBox = document.getElementById('guide-box');
  if (guideBtn && guideBox) {
    guideBtn.addEventListener('click', () => {
      guideBox.style.display = guideBox.style.display === 'block' ? 'none' : 'block';
    });
  }
});
