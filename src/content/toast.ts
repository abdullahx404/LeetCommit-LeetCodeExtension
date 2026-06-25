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
    div.id = 'gitleet-toast-container';
    div.style.position = 'fixed';
    if (document.body) {
      document.body.appendChild(div);
    }
    this.container = div;
    return div;
  }

  private static renderPill(text: string, bgColor: string, svgContent: string): void {
    const parent = this.initContainer();
    if (!parent) return;

    if (this.activeToastEl) {
      this.activeToastEl.remove();
      this.activeToastEl = null;
    }

    const pill = document.createElement('div');
    pill.className = 'notification-pill';
    pill.style.cssText = `
      display: flex;
      align-items: center;
      height: 48px;
      background-color: ${bgColor};
      color: #ffffff;
      border-radius: 24px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      white-space: nowrap;
      animation: gitleet-popup-sequence 4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      pointer-events: auto;
    `;

    const iconBox = document.createElement('div');
    iconBox.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    `;
    iconBox.innerHTML = svgContent;

    const textBox = document.createElement('span');
    textBox.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      padding-right: 20px;
      opacity: 0;
      animation: gitleet-text-fade 4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    `;
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
    }, 4200);
  }

  public static showUploading(_problemTitle?: string): void {
    const blue = '#3b82f6';
    const svg = `<svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
    this.renderPill('Syncing...', blue, svg);
  }

  public static showSuccess(_problemTitle?: string): void {
    const green = '#10b981';
    const svg = `<svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    this.renderPill('Committed', green, svg);
  }

  public static showError(_message?: string): void {
    const red = '#ef4444';
    const svg = `<svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    this.renderPill('Failed', red, svg);
  }
}
