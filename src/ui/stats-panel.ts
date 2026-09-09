import type { DayTypeRow } from '../db/repository.js';
import { iconSvg } from '../domain/icons.js';
import type { Summary } from '../domain/stats.js';
import { el } from './dom.js';
import { S, days, hours } from './strings.js';

export function renderStatsPanel(root: HTMLElement, summary: Summary): void {
  if (summary.totals.length === 0) {
    root.replaceChildren(
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', textContent: S.statsTitle }),
        el('p', { class: 'muted', textContent: S.statsEmpty }),
      ]),
    );
    return;
  }

  const max = Math.max(...summary.totals.map((t) => t.days));

  const rows = summary.totals.map((t) => {
    const fill = el('div', { class: 'stat__fill' });
    fill.style.width = `${Math.round((t.days / max) * 100)}%`;

    const row = el('div', { class: 'stat' }, [
      el('span', { class: 'stat__icon', html: iconSvg(t.code) }),
      el('span', { class: 'stat__label', textContent: t.labelSk }),
      el('div', { class: 'stat__bar' }, [fill]),
      el('span', { class: 'stat__days', textContent: days(t.days) }),
      el('span', { class: 'stat__hours muted', textContent: hours(t.hours) }),
    ]);
    row.style.setProperty('--cell', t.color);
    return row;
  });

  root.replaceChildren(
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', textContent: S.statsTitle }),
      el('div', { class: 'stats' }, rows),
      el('div', { class: 'stats__footer' }, [
        el('span', {
          class: 'muted',
          textContent: `${S.statsTotal}: ${days(summary.totalDays)} · ${hours(summary.totalHours)}`,
        }),
        el('strong', { textContent: `${S.statsWorkedHours}: ${hours(summary.workedHours)}` }),
      ]),
    ]),
  );
}

export function renderLegend(
  root: HTMLElement,
  types: readonly DayTypeRow[],
  theme: 'light' | 'dark',
): void {
  root.replaceChildren(
    ...types.map((t) => {
      const item = el('span', { class: 'legend__item' }, [
        el('span', { class: 'legend__swatch' }),
        el('span', { class: 'muted', textContent: t.labelSk }),
      ]);
      item.style.setProperty('--cell', theme === 'dark' ? t.colorDark : t.color);
      return item;
    }),
  );
}
