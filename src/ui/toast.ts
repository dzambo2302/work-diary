import { el } from './dom.js';

let host: HTMLElement | null = null;
let hideTimer: number | undefined;

/**
 * A brief, non-blocking confirmation. The diary saves on every change, so the
 * feedback has to be quiet: one line, bottom-right, gone in a moment. Repeated
 * saves reuse the same node rather than stacking up.
 */
export function toast(message: string): void {
  if (!host) {
    host = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  host.textContent = message;
  host.classList.remove('toast--in');
  // Restart the animation even when the previous toast has not finished.
  void host.offsetWidth;
  host.classList.add('toast--in');

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    host?.classList.remove('toast--in');
  }, 1600);
}
