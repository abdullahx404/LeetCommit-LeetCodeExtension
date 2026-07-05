import { StorageService } from '../storage';
import { GitHubAuthService } from '../github/auth';
import { UserSettings } from '../types';

const autoSyncInput = document.getElementById('auto-sync') as HTMLInputElement | null;
const statusBanner = document.getElementById('status-banner') as HTMLDivElement | null;

const connectOauthBtn = document.getElementById('connect-oauth-btn') as HTMLButtonElement | null;
const disconnectOauthBtn = document.getElementById('disconnect-oauth-btn') as HTMLButtonElement | null;
const oauthDisconnectedEl = document.getElementById('oauth-disconnected') as HTMLDivElement | null;
const oauthConnectedEl = document.getElementById('oauth-connected') as HTMLDivElement | null;
const connectedUserTextEl = document.getElementById('connected-user-text') as HTMLSpanElement | null;
const targetRepoDisplayEl = document.getElementById('target-repo-display');
const privacyInputEl = document.getElementById('repo-privacy') as HTMLInputElement | null;
const privacyStatusEl = document.getElementById('privacy-status') as HTMLSpanElement | null;

function showBanner(message: string, isSuccess: boolean): void {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `alert ${isSuccess ? 'alert-success' : 'alert-error'}`;
  statusBanner.style.display = 'block';
}

async function saveCurrentToggles(): Promise<void> {
  const existing = await StorageService.getSettings();
  if (!existing) return;

  const updated: UserSettings = {
    ...existing,
    autoSyncEnabled: autoSyncInput?.checked ?? true,
    isPrivate: privacyInputEl?.checked ?? false,
  };

  await StorageService.saveSettings(updated);
  showBanner('Settings updated successfully.', true);
}

if (privacyInputEl) {
  privacyInputEl.addEventListener('change', () => {
    if (privacyStatusEl) privacyStatusEl.textContent = privacyInputEl.checked ? 'Private' : 'Public';
    void saveCurrentToggles();
  });
}

if (autoSyncInput) {
  autoSyncInput.addEventListener('change', () => {
    void saveCurrentToggles();
  });
}

async function loadInitialSettings(): Promise<void> {
  const existing = await StorageService.getSettings();
  if (!existing) {
    if (oauthDisconnectedEl && oauthConnectedEl) {
      oauthDisconnectedEl.style.display = 'block';
      oauthConnectedEl.style.display = 'none';
    }
    return;
  }

  if (autoSyncInput) autoSyncInput.checked = existing.autoSyncEnabled;

  if (privacyInputEl) {
    privacyInputEl.checked = existing.isPrivate ?? false;
    if (privacyStatusEl) privacyStatusEl.textContent = privacyInputEl.checked ? 'Private' : 'Public';
  }

  if (oauthDisconnectedEl && oauthConnectedEl) {
    if (existing.githubToken) {
      oauthDisconnectedEl.style.display = 'none';
      oauthConnectedEl.style.display = 'block';
      if (connectedUserTextEl) connectedUserTextEl.textContent = `Connected as ${existing.username || existing.repoOwner || 'User'}`;
      if (targetRepoDisplayEl) targetRepoDisplayEl.textContent = existing.repoName || 'LeetCode';
    } else {
      oauthDisconnectedEl.style.display = 'block';
      oauthConnectedEl.style.display = 'none';
    }
  }
}

if (connectOauthBtn) {
  connectOauthBtn.addEventListener('click', () => {
    void (async () => {
      try {
        connectOauthBtn.disabled = true;
        connectOauthBtn.textContent = 'Connecting...';
        await GitHubAuthService.authorize();
        showBanner('Connected to GitHub successfully! Repository LeetCode is ready.', true);
        await loadInitialSettings();
      } catch (err) {
        showBanner(err instanceof Error ? err.message : 'OAuth authentication failed.', false);
      } finally {
        connectOauthBtn.disabled = false;
        connectOauthBtn.textContent = 'Connect to GitHub';
      }
    })();
  });
}

if (disconnectOauthBtn) {
  disconnectOauthBtn.addEventListener('click', () => {
    void (async () => {
      await GitHubAuthService.logout();
      showBanner('Account disconnected and settings cleared.', true);
      await loadInitialSettings();
    })();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void loadInitialSettings();
});

