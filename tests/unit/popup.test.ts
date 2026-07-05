import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastManager } from '../../src/content/toast';

const createMockStyle = () => {
  const s: Record<string, string> = {};
  Object.defineProperty(s, 'cssText', {
    set(str: string) {
      str.split(';').forEach((decl) => {
        const parts = decl.split(':');
        if (parts.length >= 2) {
          const k = parts[0] ? parts[0].trim() : '';
          const v = parts.slice(1).join(':').trim();
          if (k) s[k] = v;
        }
      });
    },
  });
  return s;
};

class MockHtmlElement {
  public id = '';
  public className = '';
  public textContent = '';
  public innerHTML = '';
  public style: Record<string, string>;
  private children: MockHtmlElement[] = [];

  public constructor() {
    this.style = createMockStyle();
  }

  public contains(el: MockHtmlElement): boolean {
    return this.children.includes(el);
  }

  public appendChild(child: MockHtmlElement): MockHtmlElement {
    this.children.push(child);
    return child;
  }

  public remove(): void {}

  public getInnerContent(): string {
    return this.textContent + ' ' + this.innerHTML + ' ' + this.children.map((c) => c.getInnerContent()).join(' ');
  }
}

describe('ToastManager In-Page UI Component', () => {
  let mockBody: MockHtmlElement;

  beforeEach(() => {
    mockBody = new MockHtmlElement();
    const mockDoc = {
      body: mockBody,
      head: new MockHtmlElement(),
      getElementById: () => null,
      createElement: () => new MockHtmlElement(),
    };

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());
  });

  it('initializes floating toast container and displays uploading pill notice', () => {
    (ToastManager as unknown as { container: null }).container = null;

    ToastManager.showUploading('Two Sum');

    const container = (ToastManager as unknown as { container: MockHtmlElement }).container;
    expect(container).toBeDefined();
    expect(container.id).toBe('leetcommit-toast-container');
    expect(container.style.position).toBe('fixed');
    expect(container.getInnerContent()).toContain('Syncing');
  });

  it('renders success committed toast confirmation', () => {
    (ToastManager as unknown as { container: null }).container = null;
    ToastManager.showSuccess('Trapping Rain Water');

    const container = (ToastManager as unknown as { container: MockHtmlElement }).container;
    expect(container.getInnerContent()).toContain('Committed');
  });

  it('renders error notice toast accurately', () => {
    (ToastManager as unknown as { container: null }).container = null;
    ToastManager.showError('Rate limit exceeded');

    const container = (ToastManager as unknown as { container: MockHtmlElement }).container;
    expect(container.getInnerContent()).toContain('Failed');
  });
});
