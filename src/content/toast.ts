/**
 * Floating Pill Toast notification UI injected into LeetCode DOM.
 * Utilizes static toast.css stylesheet to prevent Manifest V3 CSP violations.
 */
export class ToastManager {
  private static container: HTMLElement | null = null;
  private static activeToastEl: HTMLElement | null = null;

  private static initContainer(): HTMLElement {
    if (this.container && document.body && document.body.contains(this.container)) {
      return this.container;
    }

    const div = document.createElement('div');
    div.id = 'leetcommit-toast-container';
    div.style.position = 'fixed';
    if (document.body) {
      document.body.appendChild(div);
    }
    this.container = div;
    return div;
  }

  private static renderPill(text: string, stateClass: string, svgContent: string, durationMs: number): void {
    const parent = this.initContainer();
    if (!parent) return;

    if (this.activeToastEl) {
      this.activeToastEl.remove();
      this.activeToastEl = null;
    }

    const pill = document.createElement('div');
    pill.className = `notification-pill ${stateClass}`;

    const iconBox = document.createElement('div');
    iconBox.className = 'icon-container';
    iconBox.innerHTML = svgContent;

    const textBox = document.createElement('span');
    textBox.className = 'notification-text';
    textBox.textContent = text;

    pill.appendChild(iconBox);
    pill.appendChild(textBox);
    parent.appendChild(pill);

    this.activeToastEl = pill;

    setTimeout(() => {
      if (this.activeToastEl === pill) {
        pill.remove();
        this.activeToastEl = null;
      }
    }, durationMs);
  }

  public static showUploading(_problemTitle?: string): void {
    const svg = `<svg class="status-icon spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
    this.renderPill('Syncing', 'state-sync', svg, 1300);
  }

  public static showSuccess(_problemTitle?: string): void {
    const svg = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    this.renderPill('Committed', 'state-committed', svg, 4200);
  }

  public static showError(_message?: string): void {
    const svg = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    this.renderPill('Failed', 'state-failed', svg, 4200);
  }
}
