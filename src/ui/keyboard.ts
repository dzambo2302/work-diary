import type { Router } from './router.js';

export function installKeyboard(
  router: Router,
  opts: { onTypeIndex(index: number): void },
): void {
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'ArrowLeft') { router.step(-1); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { router.step(1); e.preventDefault(); return; }
    if (e.key === 'Escape') {
      const up = router.current.view === 'day' ? 'month' : 'year';
      router.go({ view: up });
      e.preventDefault();
      return;
    }
    if (router.current.view === 'day' && /^[1-6]$/.test(e.key)) {
      opts.onTypeIndex(Number(e.key) - 1);
      e.preventDefault();
    }
  });
}
