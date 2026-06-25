import { describe, it, expect } from 'vitest';
import { getFileExtension, normalizeDifficulty, buildGitHubPath, extractTitleSlug } from '../../src/content/parser';
import { SubmissionMetadata } from '../../src/types';

describe('LeetCode Content Script Parsers', () => {
  it('maps programming language identifiers to correct file extensions', () => {
    expect(getFileExtension('C++')).toBe('cpp');
    expect(getFileExtension('python3')).toBe('py');
    expect(getFileExtension('TypeScript')).toBe('ts');
    expect(getFileExtension('golang')).toBe('go');
    expect(getFileExtension('Rust')).toBe('rs');
    expect(getFileExtension('unknown_lang')).toBe('txt');
  });

  it('normalizes difficulty strings accurately', () => {
    expect(normalizeDifficulty('Easy')).toBe('Easy');
    expect(normalizeDifficulty('MEDIUM')).toBe('Medium');
    expect(normalizeDifficulty('hard')).toBe('Hard');
  });

  it('extracts problem title slug from URL path', () => {
    expect(extractTitleSlug('/problems/two-sum/description/')).toBe('two-sum');
    expect(extractTitleSlug('/problems/add-two-numbers/submissions/12345')).toBe('add-two-numbers');
  });

  it('constructs clean GitHub target filepath', () => {
    const sampleMeta: SubmissionMetadata = {
      problemTitle: 'Two Sum : Fast *?',
      problemNumber: '1',
      difficulty: 'Easy',
      language: 'C++',
      extension: 'cpp',
      sourceCode: 'class Solution {};',
      timestamp: 1600000000,
    };

    const gitPath = buildGitHubPath('LeetCode', sampleMeta);
    expect(gitPath).toBe('Easy/0001 - Two Sum  Fast/Solution.cpp');
  });
});
