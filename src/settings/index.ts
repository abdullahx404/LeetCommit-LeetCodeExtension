import { StorageService } from '../storage';
import { GitHubService } from '../github';
import { UserSettings } from '../types';

const formEl = document.getElementById('settings-form') as HTMLFormElement | null;
const repoUrlInput = document.getElementById('repo-url') as HTMLInputElement | null;
const tokenInput = document.getElementById('github-token') as HTMLInputElement | null;
const ownerInput = document.getElementById('repo-owner') as HTMLInputElement | null;
const repoInput = document.getElementById('repo-name') as HTMLInputElement | null;
const folderInput = document.getElementById('root-folder') as HTMLInputElement | null;
const autoSyncInput = document.getElementById('auto-sync') as HTMLInputElement | null;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement | null;
const statusBanner = document.getElementById('status-banner') as HTMLDivElement | null;

function showBanner(message: string, isSuccess: boolean): void {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `alert ${isSuccess ? 'alert-success' : 'alert-error'}`;
  statusBanner.style.display = 'block';
}

function parseRepoSlug(rawUrl: string): { owner: string; name: string } {
  let clean = rawUrl.trim().split('?')[0]!.split('#')[0]!.trim();
  clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  const owner = parts[0] ? parts[0].trim() : '';
  const name = parts[1] ? parts[1].trim().replace(/\.git$/i, '') : '';
  return { owner, name };
}

function updateExtractedFields(): void {
  if (!repoUrlInput || !ownerInput || !repoInput) return;
  const parsed = parseRepoSlug(repoUrlInput.value);
  if (parsed.owner) ownerInput.value = parsed.owner;
  if (parsed.name) repoInput.value = parsed.name;
}

if (repoUrlInput) {
  repoUrlInput.addEventListener('input', updateExtractedFields);
  repoUrlInput.addEventListener('paste', () => {
    setTimeout(updateExtractedFields, 10);
  });
}

function collectSettings(): UserSettings {
  if (repoUrlInput && repoUrlInput.value.trim().includes('/')) {
    updateExtractedFields();
  }
  return {
    githubToken: tokenInput?.value.replace(/['"\s]/g, '') || '',
    repoOwner: ownerInput?.value.replace(/['"\s]/g, '') || '',
    repoName: repoInput?.value.replace(/['"\s]/g, '').replace(/\.git$/i, '') || '',
    rootFolder: folderInput?.value.trim() || 'LeetCode',
    autoSyncEnabled: autoSyncInput?.checked ?? true,
  };
}

async function loadInitialSettings(): Promise<void> {
  const existing = await StorageService.getSettings();
  if (!existing) return;

  if (tokenInput) tokenInput.value = existing.githubToken;
  if (ownerInput) ownerInput.value = existing.repoOwner;
  if (repoInput) repoInput.value = existing.repoName;
  if (folderInput) folderInput.value = existing.rootFolder;
  if (autoSyncInput) autoSyncInput.checked = existing.autoSyncEnabled;

  if (repoUrlInput && existing.repoOwner && existing.repoName) {
    repoUrlInput.value = `https://github.com/${existing.repoOwner}/${existing.repoName}`;
  }
}

async function handleTestClick(): Promise<void> {
  if (!testBtn) return;
  const settings = collectSettings();
  if (!settings.githubToken) {
    showBanner('Please enter a GitHub Personal Access Token to test.', false);
    return;
  }
  if (!settings.repoOwner || !settings.repoName) {
    showBanner('Please provide a valid GitHub Repository URL.', false);
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  const isValid = await GitHubService.verifyCredentials(settings);
  testBtn.disabled = false;
  testBtn.textContent = 'Test Connection';

  if (isValid) {
    showBanner(`Connection verified! Connected to ${settings.repoOwner}/${settings.repoName}.`, true);
  } else {
    showBanner(`Connection failed for ${settings.repoOwner}/${settings.repoName}. Check repository access and token scope.`, false);
  }
}

async function handleFormSubmit(): Promise<void> {
  const settings = collectSettings();
  if (!settings.repoOwner || !settings.repoName) {
    showBanner('Invalid repository link format. Ensure it follows https://github.com/owner/repo', false);
    return;
  }
  await StorageService.saveSettings(settings);
  showBanner('Settings saved successfully.', true);
}

if (testBtn) {
  testBtn.addEventListener('click', () => {
    void handleTestClick();
  });
}

if (formEl) {
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleFormSubmit();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void loadInitialSettings();
});
