import { SubmissionMetadata } from '../types';

/**
 * Maps LeetCode language identifier strings to file extensions.
 */
export function getFileExtension(language: string): string {
  const norm = language.toLowerCase().trim();
  switch (norm) {
    case 'cpp':
    case 'c++':
      return 'cpp';
    case 'java':
      return 'java';
    case 'python':
    case 'python3':
      return 'py';
    case 'javascript':
    case 'js':
      return 'js';
    case 'typescript':
    case 'ts':
      return 'ts';
    case 'golang':
    case 'go':
      return 'go';
    case 'rust':
    case 'rs':
      return 'rs';
    case 'csharp':
    case 'cs':
      return 'cs';
    case 'kotlin':
    case 'kt':
      return 'kt';
    case 'swift':
      return 'swift';
    case 'ruby':
      return 'rb';
    case 'scala':
      return 'scala';
    case 'php':
      return 'php';
    case 'c':
      return 'c';
    default:
      return 'txt';
  }
}

/**
 * Normalizes LeetCode difficulty strings to standard capital casing.
 */
export function normalizeDifficulty(difficulty: string): 'Easy' | 'Medium' | 'Hard' {
  const norm = difficulty.toLowerCase().trim();
  if (norm.includes('easy')) return 'Easy';
  if (norm.includes('hard')) return 'Hard';
  return 'Medium';
}

/**
 * Constructs a clean problem folder path for GitHub repository upload.
 * Example: "Easy/0001 - Two Sum" or "LeetCode/Easy/0001 - Two Sum"
 */
export function buildProblemFolderPath(rootFolder: string, meta: SubmissionMetadata): string {
  const paddedNum = meta.problemNumber ? meta.problemNumber.padStart(4, '0') : '0000';
  // eslint-disable-next-line no-control-regex
  const cleanTitle = meta.problemTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Solution';
  const folderName = `${paddedNum} - ${cleanTitle}`;
  const diffFolder = normalizeDifficulty(meta.difficulty);

  const cleanRoot = rootFolder.replace(/^\/+|\/+$/g, '').trim();
  if (cleanRoot && cleanRoot.toLowerCase() !== 'leetcode') {
    return `${cleanRoot}/${diffFolder}/${folderName}`;
  }
  return `${diffFolder}/${folderName}`;
}

/**
 * Constructs the code target filepath inside the problem folder.
 */
export function buildGitHubPath(rootFolder: string, meta: SubmissionMetadata): string {
  const folder = buildProblemFolderPath(rootFolder, meta);
  const ext = getFileExtension(meta.language);
  return `${folder}/Solution.${ext}`;
}

/**
 * Extracts problem title slug from LeetCode URL path.
 * Example: "https://leetcode.com/problems/two-sum/submissions/" -> "two-sum"
 */
export function extractTitleSlug(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const probIdx = parts.indexOf('problems');
  if (probIdx !== -1 && probIdx + 1 < parts.length) {
    return parts[probIdx + 1] ?? 'unknown-problem';
  }
  return parts[0] ?? 'unknown-problem';
}
