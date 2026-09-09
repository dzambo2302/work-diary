import { parseIso, todayIso, type IsoDate } from '../domain/dates.js';
import { uiIconSvg } from '../domain/icons.js';
import { el } from './dom.js';
import type { Router, ViewName } from './router.js';
import { S, formatLongDate, formatMonthTitle } from './strings.js';

const VIEWS: { name: ViewName; label: string }[] = [
  { name: 'day', label: S.viewDay },
  { name: 'month', label: S.viewMonth },
  { name: 'year', label: S.viewYear },
];

export interface ToolbarHandlers {
  onStats(): void;
  onSettings(): void;
  onExport(): void;
  onToggleTheme(): void;
  /** The theme currently on screen, so the toggle can offer the other one. */
  theme: 'light' | 'dark';
  isOpen(panel: 'stats' | 'settings' | 'export'): boolean;
}

export function titleFor(view: ViewName, date: IsoDate): string {
  const { year, month } = parseIso(date);
  if (view === 'year') return String(year);
  if (view === 'month') return formatMonthTitle(year, month);
  return formatLongDate(date);
}

export function renderToolbar(root: HTMLElement, router: Router, h: ToolbarHandlers): void {
  const { view, date } = router.current;

  const switcher = el('div', { class: 'segmented', role: 'group', 'aria-label': S.viewSwitcher },
    VIEWS.map((v) =>
      el('button', {
        class: 'btn', type: 'button', textContent: v.label,
        'aria-pressed': String(v.name === view),
        onclick: () => router.go({ view: v.name }),
      }),
    ),
  );

  const ICONS = { stats: 'stats', export: 'download', settings: 'settings' } as const;
  const panelButton = (label: string, key: 'stats' | 'settings' | 'export', onclick: () => void) =>
    el('button', {
      class: 'btn',
      type: 'button',
      'aria-pressed': String(h.isOpen(key)),
      onclick,
    }, [
      el('span', { class: 'btn__icon', html: uiIconSvg(ICONS[key]) }),
      el('span', { textContent: label }),
    ]);

  root.replaceChildren(
    switcher,
    el('button', {
      class: 'btn btn--ghost btn--icon', type: 'button', textContent: '‹',
      'aria-label': S.previous, onclick: () => router.step(-1),
    }),
    el('button', {
      class: 'btn btn--ghost btn--icon', type: 'button', textContent: '›',
      'aria-label': S.next, onclick: () => router.step(1),
    }),
    el('h1', { class: 'toolbar__title', textContent: titleFor(view, date) }),
    // Dnes keeps the current view and only moves the date.
    el('button', {
      class: 'btn', type: 'button', textContent: S.today,
      onclick: () => router.go({ date: todayIso() }),
    }),
    el('div', { class: 'toolbar__spacer' }),
    // Offers the theme you would switch *to*, which is what the icon shows.
    el('button', {
      class: 'btn btn--ghost btn--square',
      type: 'button',
      html: uiIconSvg(h.theme === 'dark' ? 'sun' : 'moon'),
      'aria-label': h.theme === 'dark' ? S.themeToLight : S.themeToDark,
      title: h.theme === 'dark' ? S.themeToLight : S.themeToDark,
      onclick: h.onToggleTheme,
    }),
    panelButton(S.stats, 'stats', h.onStats),
    panelButton(S.exportMenu, 'export', h.onExport),
    panelButton(S.settings, 'settings', h.onSettings),
  );
}
