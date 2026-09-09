import { SK_MONTHS, daysInMonth, isoDate, type IsoDate } from '../domain/dates.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';

export interface YearContext {
  year: number;
  cellFor: (day: IsoDate) => DayCell;
  onPick: (day: IsoDate) => void;
  /** Receives the empty legend container so the caller can fill it. */
  onLegend?: (root: HTMLElement) => void;
}

export function renderYearView(root: HTMLElement, ctx: YearContext): void {
  const grid = el('div', { class: 'year' });

  // Header row: an empty corner, then day-of-month numbers 1–31.
  grid.append(el('div', { class: 'year__corner' }));
  for (let d = 1; d <= 31; d += 1) {
    grid.append(el('div', {
      class: 'year__daynum',
      textContent: d === 1 || d % 5 === 0 ? String(d) : '',
    }));
  }

  for (let m = 1; m <= 12; m += 1) {
    grid.append(el('div', {
      class: 'year__month',
      textContent: SK_MONTHS[m - 1]!.slice(0, 3),
      title: SK_MONTHS[m - 1]!,
    }));
    const len = daysInMonth(ctx.year, m);
    for (let d = 1; d <= 31; d += 1) {
      if (d > len) {
        grid.append(el('div', { class: 'year__cell year__cell--void' }));
        continue;
      }
      const day = isoDate(ctx.year, m, d);
      const cell = ctx.cellFor(day);
      const node = el('button', {
        class: `year__cell year__cell--${cell.kind}`,
        type: 'button',
        title: cell.tooltip,
        'aria-label': cell.tooltip,
        onclick: () => ctx.onPick(day),
      });
      if (cell.color) node.style.setProperty('--cell', cell.color);
      grid.append(node);
    }
  }

  const legendRoot = el('div', { class: 'legend' });
  ctx.onLegend?.(legendRoot);
  // The 31-column grid has a floor width; it scrolls inside this wrapper so the
  // page body never scrolls horizontally on a narrow window.
  const scroller = el('div', { class: 'year__scroll' }, [grid]);
  root.replaceChildren(el('div', { class: 'card' }, [scroller, legendRoot]));
}
