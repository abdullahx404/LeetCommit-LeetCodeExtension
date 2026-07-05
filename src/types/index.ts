/**
 * Global domain interfaces and type definitions for LeetCommit.
 */

export interface UserSettings {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  rootFolder: string; // Default: 'LeetCode'
  autoSyncEnabled: boolean;
  authType?: 'oauth' | 'pat';
  oauthToken?: string;
  username?: string;
  isPrivate?: boolean;
}

export interface SubmissionMetadata {
  problemTitle: string;
  problemNumber: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  language: string;
  extension: string;
  sourceCode: string;
  timestamp: number;
  runtime?: string;
  memory?: string;
  readmeContent?: string;
}

export interface CachedProblem {
  problemNumber: string;
  title?: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  fileSha: string;
  readmeSha?: string;
  codeHash: string;
  lastUpdated: number;
  runtime?: string;
  memory?: string;
}

export interface SyncStats {
  totalSolved: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  lastSyncedProblem: {
    number: string;
    title: string;
    language: string;
    timestamp: number;
  } | null;
}

export type ExtensionMessage =
  | { type: 'SUBMISSION_ACCEPTED'; payload: SubmissionMetadata }
  | { type: 'GET_STATS' }
  | { type: 'SYNC_NOW' };
