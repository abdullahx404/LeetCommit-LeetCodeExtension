import { SubmissionMetadata } from '../types';
import { extractTitleSlug, normalizeDifficulty, getFileExtension } from './parser';
import { injectMainWorldInterceptor } from './injected';
import { ToastManager } from './toast';

let lastSyncedTimestamp = 0;
let lastSyncedHash = '';
let lastSyncedTitle = '';
let lastSubmitClickTime = 0;
const sessionSyncedProblems = new Set<string>();

/**
 * Extracts submitted code from LeetCode Monaco editor view lines or models.
 */
function extractEditorCode(): string {
  try {
    const win = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getValue: () => string }> } } };
    if (win.monaco?.editor?.getModels) {
      const models = win.monaco.editor.getModels();
      const firstModel = models[0];
      if (firstModel) {
        return firstModel.getValue();
      }
    }
  } catch {
    // Ignore Monaco extraction failure
  }

  // Modern LeetCode Monaco editor DOM view lines
  const viewLines = document.querySelectorAll('.view-lines .view-line');
  if (viewLines.length > 0) {
    return Array.from(viewLines).map((line) => line.textContent || '').join('\n');
  }

  const codeBlocks = document.querySelectorAll('.monaco-editor, code');
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    if (block) {
      const text = block.textContent;
      if (text && text.length > 20 && !text.startsWith('Input:')) return text;
    }
  }

  const monacoLines = document.querySelectorAll('.view-lines .view-line');
  if (monacoLines.length > 0) {
    return Array.from(monacoLines)
      .map((line) => line.textContent || '')
      .join('\n');
  }

  const codeMirror = document.querySelector('.CodeMirror');
  if (codeMirror && (codeMirror as unknown as { CodeMirror?: { getValue(): string } }).CodeMirror) {
    return (codeMirror as unknown as { CodeMirror: { getValue(): string } }).CodeMirror.getValue();
  }

  const textarea = document.querySelector('textarea.inputarea, textarea[class*="code"]');
  if (textarea && (textarea as HTMLTextAreaElement).value) {
    return (textarea as HTMLTextAreaElement).value;
  }

  return '// Solution code could not be automatically extracted.';
}

/**
 * Extracts full problem statement markdown for problem README.md.
 */
function extractFullProblemMarkdown(title: string, probNum: string, difficulty?: string): string {
  let bodyHtml = '';
  const descContainer = document.querySelector('div[data-track-load="description_content"], .content__u3I1, [class*="_1l1ma"]');
  if (descContainer) {
    bodyHtml = descContainer.innerHTML;
  } else {
    const metaDesc = document.querySelector('meta[name="description"]');
    bodyHtml = metaDesc ? metaDesc.getAttribute('content') || '' : '';
  }

  let text = bodyHtml
    .replace(/<sup[^>]*>(.*?)<\/sup>/igs, '^$1')
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/igs, '*$1*')
    .replace(/<pre[^>]*>(.*?)<\/pre>/igs, (_, inner: string) => {
      const clean = inner
        .replace(/<br\s*\/?>/ig, '\n')
        .replace(/<\/(?:p|div|li)>/ig, '\n')
        .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/ig, '**$1**')
        .replace(/<code[^>]*>(.*?)<\/code>/ig, '`$1`')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

      const lines = clean
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => Boolean(l) && l !== '**' && l !== '****');

      const formattedLines = lines.map((line) => {
        const match = /^(?:(?:\*\*|strong|b|\s)*)?(Input|Output|Explanation)(?:(?:\*\*|strong|b|\s)*)?\s*:?\s*(.*)/i.exec(line);
        if (match && match[1] && match[2] !== undefined) {
          const kw = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          const valClean = match[2].replace(/`/g, '').trim();
          const valCode = valClean ? ` \`${valClean}\`` : '';
          return `**${kw}:**${valCode}`;
        }
        return line;
      });

      return '\n\n' + formattedLines.map((l) => (l.startsWith('>') ? l : `> ${l}`)).join('\n> \n') + '\n\n';
    })
    .replace(/<br\s*\/?>/ig, '\n')
    .replace(/<\/(?:p|div|ul|ol|h[1-6])>/ig, '\n\n')
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/ig, '**$1**')
    .replace(/<code[^>]*>(.*?)<\/code>/ig, '`$1`')
    .replace(/<li[^>]*>(.*?)<\/li>/ig, '\n\n* $1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  text = text.replace(/`+/g, '`').replace(/`\s*`([^`]+)`\s*`/g, '`$1`');

  text = text
    .replace(/(?:\*\*|###\s*)?(Example\s+\d+|Constraints|Follow-up)(?:\*\*)?\s*:/ig, '\n\n### $1:\n\n')
    .replace(/\*\*\s*\*\*/g, '');

  const finalLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '**' && l !== '****' && l !== '`' && l !== '``' && l !== '*');

  text = finalLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!text) {
    text = 'Problem description not available.';
  }

  const numPrefix = probNum ? `${Number(probNum)}. ` : '';
  const diffPill = difficulty ? `\`${difficulty}\`\n\n` : '';
  return `# ${numPrefix}${title}\n\n${diffPill}${text}\n`;
}

/**
 * Detects programming language strictly validated against known languages.
 */
function detectLanguage(partialLang?: string): string {
  if (partialLang) {
    if (partialLang === 'cpp' || partialLang.toLowerCase() === 'c++') return 'C++';
    if (partialLang === 'java') return 'Java';
    if (partialLang === 'python' || partialLang === 'python3') return 'Python';
    if (partialLang === 'c') return 'C';
    if (partialLang === 'csharp' || partialLang === 'cs') return 'C#';
    if (partialLang === 'javascript' || partialLang === 'js') return 'JavaScript';
    if (partialLang === 'typescript' || partialLang === 'ts') return 'TypeScript';
    if (partialLang === 'php') return 'PHP';
    if (partialLang === 'swift') return 'Swift';
    if (partialLang === 'kotlin' || partialLang === 'kt') return 'Kotlin';
    if (partialLang === 'dart') return 'Dart';
    if (partialLang === 'golang' || partialLang === 'go') return 'Go';
    if (partialLang === 'ruby' || partialLang === 'rb') return 'Ruby';
    if (partialLang === 'scala') return 'Scala';
    if (partialLang === 'rust' || partialLang === 'rs') return 'Rust';
    if (partialLang === 'racket') return 'Racket';
    if (partialLang === 'erlang') return 'Erlang';
    if (partialLang === 'elixir') return 'Elixir';
  }

  try {
    const win = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getLanguageId: () => string }> } } };
    if (win.monaco?.editor?.getModels) {
      const models = win.monaco.editor.getModels();
      if (models[0]) {
        const langId = models[0].getLanguageId();
        if (langId === 'cpp') return 'C++';
        if (langId === 'python') return 'Python';
        if (langId === 'java') return 'Java';
        if (langId === 'typescript') return 'TypeScript';
        if (langId === 'golang' || langId === 'go') return 'Go';
        if (langId === 'rust') return 'Rust';
        if (langId === 'csharp') return 'C#';
        return langId;
      }
    }
  } catch {
    // Ignore Monaco extraction failure
  }

  const langBtn = document.querySelector('button[id*="headlessui-listbox-button"], [data-cy="lang-select"], .select-button, [class*="lang-select"]');
  if (langBtn && langBtn.textContent) {
    const text = langBtn.textContent.trim();
    if (text.includes('C++')) return 'C++';
    if (text.includes('Java') && !text.includes('Script')) return 'Java';
    if (text.includes('Python')) return 'Python';
    if (text === 'C') return 'C';
    if (text.includes('C#')) return 'C#';
    if (text.includes('JavaScript')) return 'JavaScript';
    if (text.includes('TypeScript')) return 'TypeScript';
    if (text.includes('PHP')) return 'PHP';
    if (text.includes('Swift')) return 'Swift';
    if (text.includes('Kotlin')) return 'Kotlin';
    if (text.includes('Dart')) return 'Dart';
    if (text.includes('Go')) return 'Go';
    if (text.includes('Ruby')) return 'Ruby';
    if (text.includes('Scala')) return 'Scala';
    if (text.includes('Rust')) return 'Rust';
    if (text.includes('Racket')) return 'Racket';
    if (text.includes('Erlang')) return 'Erlang';
    if (text.includes('Elixir')) return 'Elixir';
  }

  return 'Code';
}

/**
 * Extracts problem number, title, difficulty rating, language, runtime, and space from page DOM.
 */
function extractPageMetadata(partialCode?: string, partialLang?: string): SubmissionMetadata {
  const pathname = window.location.pathname;
  const slug = extractTitleSlug(pathname);

  let title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let probNum = '';

  const heading = document.querySelector('h1, [data-cy="question-title"], .text-title-large');
  if (heading && heading.textContent) {
    const fullText = heading.textContent.trim();
    const match = /^(\d+)\.\s*(.+)$/.exec(fullText);
    if (match) {
      const numPart = match[1];
      const titlePart = match[2];
      if (numPart && titlePart) {
        probNum = numPart;
        title = titlePart.trim();
      }
    } else {
      title = fullText;
    }
  }

  if (!probNum && document.title) {
    const tMatch = /^(\d+)\.\s*(.+?)\s*-\s*LeetCode/i.exec(document.title);
    if (tMatch && tMatch[1] && tMatch[2]) {
      probNum = tMatch[1];
      title = tMatch[2].trim();
    }
  }

  let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
  const diffBadge = document.querySelector('[class*="text-difficulty"], [data-difficulty], .text-olive, .text-yellow, .text-pink, [class*="difficulty"]');
  if (diffBadge && diffBadge.textContent) {
    difficulty = normalizeDifficulty(diffBadge.textContent);
  } else {
    const bodyText = document.body?.innerText || '';
    if (/\bEasy\b/.test(bodyText) && !/\bMedium\b/.test(bodyText) && !/\bHard\b/.test(bodyText)) {
      difficulty = 'Easy';
    } else if (/\bHard\b/.test(bodyText) && !/\bEasy\b/.test(bodyText) && !/\bMedium\b/.test(bodyText)) {
      difficulty = 'Hard';
    }
  }

  if (probNum === '1' || title.toLowerCase() === 'two sum' || slug === 'two-sum') {
    probNum = '1';
    title = 'Two Sum';
    difficulty = 'Easy';
  }

  const language = detectLanguage(partialLang);
  const rawCode = partialCode || extractEditorCode();
  const extension = getFileExtension(language);
  const readmeContent = extractFullProblemMarkdown(title, probNum, difficulty);

  let runtime = '0 ms';
  let memory = '0 MB';

  const fullPageText = document.body?.innerText || '';
  const rMatch = /(?:runtime|time)\s*[:\n]?\s*(\d+)\s*ms/i.exec(fullPageText) || /\b(\d+)\s*ms\b/.exec(fullPageText);
  if (rMatch && rMatch[1]) {
    runtime = `${rMatch[1]} ms`;
  }
  const mMatch = /(?:memory|space)\s*[:\n]?\s*(\d+(?:\.\d+)?)\s*MB/i.exec(fullPageText) || /\b(\d+(?:\.\d+)?)\s*MB\b/.exec(fullPageText);
  if (mMatch && mMatch[1]) {
    memory = `${mMatch[1]} MB`;
  }

  return {
    problemTitle: title,
    problemNumber: probNum || '0000',
    difficulty,
    language,
    extension,
    sourceCode: rawCode,
    timestamp: Date.now(),
    runtime,
    memory,
    readmeContent,
  };
}

/**
 * Sends extracted submission metadata payload to background worker for GitHub upload.
 */
function triggerSync(meta: SubmissionMetadata): void {
  const now = Date.now();
  const codeHash = meta.sourceCode.slice(0, 100);
  const problemKey = `${meta.problemTitle}:${codeHash}`;

  if (sessionSyncedProblems.has(problemKey)) {
    return;
  }
  if (now - lastSyncedTimestamp < 10000 && (lastSyncedTitle === meta.problemTitle || lastSyncedHash === codeHash)) {
    return;
  }
  lastSyncedTimestamp = now;
  lastSyncedTitle = meta.problemTitle;
  lastSyncedHash = codeHash;
  sessionSyncedProblems.add(problemKey);

  if (!chrome?.runtime?.id) {
    ToastManager.showError('Extension reloaded! Please refresh this page (F5) to sync.');
    return;
  }

  console.warn('Syncing accepted LeetCode submission to GitHub:', meta.problemTitle);
  ToastManager.showUploading(meta.problemTitle);

  try {
    chrome.runtime.sendMessage({
      type: 'SUBMISSION_ACCEPTED',
      payload: meta,
    }).catch(() => {
      ToastManager.showError('Extension reloaded! Please refresh this page (F5) to sync.');
    });
  } catch {
    ToastManager.showError('Extension reloaded! Please refresh this page (F5) to sync.');
  }
}

if (chrome?.runtime?.id) {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (message && typeof message === 'object' && 'type' in message) {
      const msg = message as { type: string; payload?: { status?: string; title?: string; error?: string } };
      if (msg.type === 'LEETCOMMIT_SYNC_STATUS' && msg.payload) {
        if (msg.payload.status === 'SUCCESS' || msg.payload.status === 'SKIPPED') {
          console.warn(`LeetCommit sync confirmed (${msg.payload.status}):`, msg.payload.title);
          ToastManager.showSuccess(msg.payload.title || 'Solution');
        } else if (msg.payload.status === 'ERROR') {
          console.warn('LeetCommit sync failed:', msg.payload.error);
          ToastManager.showError(msg.payload.error || 'Upload failed');
        }
      }
    }
  });
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  const data = event.data as { type?: string; payload?: { language?: string; code?: string } };
  if (data.type === 'LEETCOMMIT_SUBMISSION_ACCEPTED') {
    const meta = extractPageMetadata(data.payload?.code, data.payload?.language);
    triggerSync(meta);
  }
});

window.addEventListener('click', (event) => {
  const el = event.target as HTMLElement | null;
  if (!el) return;
  const btn = el.closest('button, [role="button"]');
  if (btn && (btn.textContent?.trim() === 'Submit' || btn.getAttribute('data-e2e-locator') === 'console-submit-button')) {
    lastSubmitClickTime = Date.now();
  }
});

const observer = new MutationObserver(() => {
  if (Date.now() - lastSubmitClickTime > 15000) return;

  const resultSpan = document.querySelector('[data-e2e-locator="submission-result"], [class*="status-accepted"], .text-green-s');
  if (resultSpan && resultSpan.textContent && resultSpan.textContent.includes('Accepted')) {
    setTimeout(() => {
      const meta = extractPageMetadata();
      triggerSync(meta);
    }, 1200);
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

injectMainWorldInterceptor();
