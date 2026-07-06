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
    const win = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getValue: () => string; getLanguageId?: () => string }> } } };
    if (win.monaco?.editor?.getModels) {
      const models = win.monaco.editor.getModels();
      let bestCode = '';
      for (const model of models) {
        if (model && typeof model.getValue === 'function') {
          const val = model.getValue();
          const lang = model.getLanguageId ? model.getLanguageId() : '';
          if (val && val.trim().length > bestCode.trim().length && lang !== 'plaintext' && lang !== 'json') {
            bestCode = val;
          }
        }
      }
      if (bestCode.trim().length > 10) {
        return bestCode;
      }
    }
  } catch {
    // Ignore Monaco extraction failure
  }

  // Modern LeetCode Monaco editor DOM view lines
  const viewLineContainers = document.querySelectorAll('.view-lines');
  let bestDomCode = '';
  for (let i = 0; i < viewLineContainers.length; i++) {
    const container = viewLineContainers[i];
    if (container) {
      const lines = container.querySelectorAll('.view-line');
      const text = Array.from(lines).map((l) => l.textContent || '').join('\n');
      if (text.trim().length > bestDomCode.trim().length) {
        bestDomCode = text;
      }
    }
  }
  if (bestDomCode.trim().length > 10) {
    return bestDomCode;
  }

  const codeBlocks = document.querySelectorAll('.monaco-editor, code');
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    if (block) {
      const text = block.textContent;
      if (text && text.length > 20 && !text.startsWith('Input:')) return text;
    }
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
  const descContainer = document.querySelector('div[data-track-load="description_content"], .content__u3I1, [class*="_1l1ma"], [class*="elfjS"], [class*="description-content"], [class*="problem-description"], [data-cy="question-content"], [class*="content__"]');
  if (descContainer) {
    bodyHtml = descContainer.innerHTML;
  } else {
    const allContainers = document.querySelectorAll('div, article, section');
    for (let i = 0; i < allContainers.length; i++) {
      const el = allContainers[i];
      if (el && el.innerHTML.includes('Example 1') && el.innerHTML.includes('Constraints') && el.children.length > 1 && el.textContent && el.textContent.length < 15000) {
        bodyHtml = el.innerHTML;
        break;
      }
    }
  }

  if (!bodyHtml) {
    const metaDesc = document.querySelector('meta[name="description"]');
    bodyHtml = metaDesc ? metaDesc.getAttribute('content') || '' : '';
  }

  let text = bodyHtml
    .replace(/<sup[^>]*>(.*?)<\/sup>/igs, '^$1')
    .replace(/<sub[^>]*>(.*?)<\/sub>/igs, '_$1')
    .replace(/<code>(.*?)<\/code>/igs, '`$1`')
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/igs, '**$1**')
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/igs, '*$1*')
    .replace(/<li[^>]*>(.*?)<\/li>/igs, '\n* $1\n')
    .replace(/<br\s*\/?>/ig, '\n')
    .replace(/<\/(?:p|div|pre|ul|ol|h[1-6])>/ig, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  text = text
    .replace(/Can you solve this real interview question\?[^-\n]*-\s*/ig, '')
    .replace(/Can you solve this real interview question\?\s*/ig, '');

  text = text
    .replace(/(?:\*\*|###|#|\b)?Example\s+(\d+)\s*:?(?:\*\*)?/ig, '\n\n### Example $1:\n\n')
    .replace(/(?:\*\*|###|#|\b)?Constraints\s*:?(?:\*\*)?/ig, '\n\n### Constraints:\n\n')
    .replace(/(?:\*\*|###|#|\b)?Follow[-\s]*up\s*:?(?:\*\*)?/ig, '\n\n### Follow-up:\n\n')
    .replace(/(?:\*\*|strong|b|\b)?Input\s*:?(?:\*\*)?\s*/ig, '\n\nINPUT_TOKEN:')
    .replace(/(?:\*\*|strong|b|\b)?Output\s*:?(?:\*\*)?\s*/ig, '\n\nOUTPUT_TOKEN:')
    .replace(/(?:\*\*|strong|b|\b)?Explanation\s*:?(?:\*\*)?\s*/ig, '\n\nEXPLANATION_TOKEN:');

  const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => Boolean(l) && l !== '**' && l !== '****' && l !== '`' && l !== '``' && l !== '*');

  let inExample = false;
  let inConstraints = false;
  const formattedLines: string[] = [];
  let exampleBlockLines: string[] = [];

  const flushExampleBlock = () => {
    if (exampleBlockLines.length > 0) {
      formattedLines.push(exampleBlockLines.join('\n> \n'));
      exampleBlockLines = [];
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] || '';

    if (line.startsWith('### Example')) {
      flushExampleBlock();
      inExample = true;
      inConstraints = false;
      formattedLines.push(`\n${line}`);
      continue;
    }
    if (line.startsWith('### Constraints:')) {
      flushExampleBlock();
      inExample = false;
      inConstraints = true;
      formattedLines.push(`\n${line}`);
      continue;
    }
    if (line.startsWith('### Follow-up:')) {
      flushExampleBlock();
      inExample = false;
      inConstraints = false;
      formattedLines.push(`\n${line}`);
      continue;
    }

    if (line.startsWith('INPUT_TOKEN:')) {
      inExample = true;
      const val = line.replace('INPUT_TOKEN:', '').replace(/[`*]/g, '').trim();
      exampleBlockLines.push(`> **Input:** \`${val}\``);
      continue;
    }
    if (line.startsWith('OUTPUT_TOKEN:')) {
      inExample = true;
      const val = line.replace('OUTPUT_TOKEN:', '').replace(/[`*]/g, '').trim();
      exampleBlockLines.push(`> **Output:** \`${val}\``);
      continue;
    }
    if (line.startsWith('EXPLANATION_TOKEN:')) {
      inExample = true;
      const val = line.replace('EXPLANATION_TOKEN:', '').replace(/[`*]/g, '').trim();
      exampleBlockLines.push(`> **Explanation:** \`${val}\``);
      continue;
    }

    if (inExample) {
      const cleanLine = line.replace(/^[>*-\s]+/, '').replace(/[`*]/g, '').trim();
      if (cleanLine) {
        exampleBlockLines.push(`> \`${cleanLine}\``);
      }
      continue;
    }

    if (inConstraints) {
      const cleanLi = line.replace(/^[>*-\s•]+/, '').replace(/[`*]/g, '').trim();
      if (cleanLi) {
        formattedLines.push(`* \`${cleanLi}\``);
      }
      continue;
    }

    formattedLines.push(line);
  }

  flushExampleBlock();

  let bodyMarkdown = formattedLines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!bodyMarkdown) {
    bodyMarkdown = 'Problem description not available.';
  }

  const numPrefix = probNum ? `${Number(probNum)}. ` : '';
  const diffPill = difficulty ? `\`${difficulty}\`\n\n` : '';
  return `# ${numPrefix}${title}\n\n${diffPill}${bodyMarkdown}\n`;
}

/**
 * Detects programming language strictly validated against known languages.
 */
function detectLanguage(partialLang?: string, codeToCheck?: string): string {
  const checkStr = (str?: string): string | null => {
    if (!str) return null;
    const s = str.toLowerCase().trim();
    if (s === 'cpp' || s === 'c++') return 'C++';
    if (s === 'java' && !s.includes('script')) return 'Java';
    if (s.includes('python') || s === 'py' || s === 'python3') return 'Python';
    if (s === 'c') return 'C';
    if (s === 'csharp' || s === 'cs' || s === 'c#') return 'C#';
    if (s.includes('javascript') || s === 'js') return 'JavaScript';
    if (s.includes('typescript') || s === 'ts') return 'TypeScript';
    if (s.includes('php')) return 'PHP';
    if (s.includes('swift')) return 'Swift';
    if (s.includes('kotlin') || s === 'kt') return 'Kotlin';
    if (s.includes('dart')) return 'Dart';
    if (s.includes('golang') || s === 'go') return 'Go';
    if (s.includes('ruby') || s === 'rb') return 'Ruby';
    if (s.includes('scala')) return 'Scala';
    if (s.includes('rust') || s === 'rs') return 'Rust';
    if (s.includes('racket')) return 'Racket';
    if (s.includes('erlang')) return 'Erlang';
    if (s.includes('elixir')) return 'Elixir';
    return null;
  };

  const fromPartial = checkStr(partialLang);
  if (fromPartial) return fromPartial;

  try {
    const win = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getLanguageId: () => string; getValue?: () => string }> } } };
    if (win.monaco?.editor?.getModels) {
      const models = win.monaco.editor.getModels();
      for (const model of models) {
        if (model && (!model.getValue || model.getValue().trim().length > 10)) {
          const fromMonaco = checkStr(model.getLanguageId());
          if (fromMonaco) return fromMonaco;
        }
      }
    }
  } catch {
    // Ignore Monaco extraction failure
  }

  const langSelectors = document.querySelectorAll('button, div[role="button"], span, [id*="radix-"], [id*="headlessui-"], .select-button, [data-cy="lang-select"]');
  for (let i = 0; i < langSelectors.length; i++) {
    const el = langSelectors[i];
    if (el && el.textContent) {
      const txt = el.textContent.trim();
      const fromDom = checkStr(txt);
      if (fromDom) return fromDom;
    }
  }

  const code = codeToCheck || '';
  if (code.includes('def ') && code.includes('self')) return 'Python';
  if (code.includes('public class ') || code.includes('public static void main')) return 'Java';
  if (code.includes('#include') || code.includes('std::') || code.includes('vector<') || (code.includes('Solution {') && code.includes('public:'))) return 'C++';
  if (code.includes('function ') || (code.includes('const ') && code.includes('=>') && !code.includes(':'))) return 'JavaScript';
  if (code.includes(': number') || code.includes(': string') || code.includes(': boolean')) return 'TypeScript';
  if (code.includes('fn ') && code.includes('->')) return 'Rust';
  if (code.includes('func ') && code.includes('string')) return 'Go';

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
    if (match && match[1] && match[2]) {
      probNum = match[1];
      title = match[2].trim();
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

  if (!probNum) {
    const allSpans = document.querySelectorAll('span, div, a, h1, h2, h3');
    for (let i = 0; i < allSpans.length; i++) {
      const el = allSpans[i];
      if (el && el.children.length === 0 && el.textContent) {
        const txt = el.textContent.trim();
        const m = /^(\d+)\.\s*(.+)$/.exec(txt);
        if (m && m[1] && m[2] && (m[2].toLowerCase() === title.toLowerCase() || slug.replace(/-/g, ' ').toLowerCase().includes(m[2].toLowerCase()))) {
          probNum = m[1];
          title = m[2].trim();
          break;
        }
        if (/^\d+\.$/.test(txt)) {
          probNum = txt.replace('.', '').trim();
          break;
        }
      }
    }
  }

  let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
  const diffBadge = document.querySelector('[class*="text-difficulty"], [data-difficulty], .text-olive, .text-yellow, .text-pink, [class*="difficulty"]');
  if (diffBadge && diffBadge.textContent) {
    difficulty = normalizeDifficulty(diffBadge.textContent);
  } else {
    const allBadges = document.querySelectorAll('div, span, p, button, a');
    for (let i = 0; i < allBadges.length; i++) {
      const el = allBadges[i];
      if (el && el.children.length === 0 && el.textContent) {
        const txt = el.textContent.trim();
        if (txt === 'Easy' || txt === 'Medium' || txt === 'Hard') {
          difficulty = txt;
          break;
        }
      }
    }
  }

  const classicMap: Record<string, { num: string; title: string; diff: 'Easy' | 'Medium' | 'Hard' }> = {
    'two-sum': { num: '1', title: 'Two Sum', diff: 'Easy' },
    'add-two-numbers': { num: '2', title: 'Add Two Numbers', diff: 'Medium' },
    'longest-substring-without-repeating-characters': { num: '3', title: 'Longest Substring Without Repeating Characters', diff: 'Medium' },
    'median-of-two-sorted-arrays': { num: '4', title: 'Median of Two Sorted Arrays', diff: 'Hard' },
    'longest-palindromic-substring': { num: '5', title: 'Longest Palindromic Substring', diff: 'Medium' },
    'zigzag-conversion': { num: '6', title: 'Zigzag Conversion', diff: 'Medium' },
    'reverse-integer': { num: '7', title: 'Reverse Integer', diff: 'Medium' },
    'string-to-integer-atoi': { num: '8', title: 'String to Integer (atoi)', diff: 'Medium' },
    'palindrome-number': { num: '9', title: 'Palindrome Number', diff: 'Easy' },
  };

  if (classicMap[slug]) {
    probNum = classicMap[slug].num;
    title = classicMap[slug].title;
    difficulty = classicMap[slug].diff;
  } else if (title.toLowerCase() === 'palindrome number') {
    probNum = '9';
    title = 'Palindrome Number';
    difficulty = 'Easy';
  }

  const rawCode = (partialCode && partialCode.trim().length > 10) ? partialCode : extractEditorCode();
  const language = detectLanguage(partialLang, rawCode);
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

  // eslint-disable-next-line no-console
  console.log('Syncing accepted LeetCode submission to GitHub:', meta.problemTitle);
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
          // eslint-disable-next-line no-console
          console.log(`LeetCommit sync confirmed (${msg.payload.status}):`, msg.payload.title);
          ToastManager.showSuccess(msg.payload.title || 'Solution');
        } else if (msg.payload.status === 'ERROR') {
          console.error('LeetCommit sync failed:', msg.payload.error);
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
