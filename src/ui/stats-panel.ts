import type { DayTypeRow } from '../db/repository.js';
import type { Balance, RangeBalance } from '../domain/balance.js';
import type { IsoDate } from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import type { Summary } from '../domain/stats.js';
import { el } from './dom.js';
import { S, days, formatShortDate, hours, hoursShort, signedHours } from './strings.js';

export interface StatsContext {
  summary: Summary;
  /** Absent in the day view, where a period balance says nothing. */
  balance: RangeBalance | null;
  today: IsoDate;
  /** The period the figures cover: "september 2026" or "2026". */
  periodLabel: string;
}

function row(label: string, value: string, modifier = '', title?: string): HTMLElement {
  return el('div', { class: `balance__row${modifier}`, title }, [
    el('span', { class: 'balance__label', textContent: label }),
    el('span', { class: 'balance__value', textContent: value }),
  ]);
}

/** Positive is overtime, negative is hours still owed; zero reads as neither. */
function deltaRow(overtime: number, modifier = ''): HTMLElement {
  const node = row(
    overtime < 0 ? S.balanceShortfall : S.balanceOvertime,
    signedHours(overtime),
    ` balance__row--delta${modifier}`,
  );
  if (overtime > 0) node.classList.add('balance__row--over');
  if (overtime < 0) node.classList.add('balance__row--under');
  return node;
}

function renderBalance(balance: RangeBalance, today: IsoDate): HTMLElement {
  const { full, toDate } = balance;
  const norm = (b: Balance): string => `${days(b.normDays)} · ${hoursShort(b.normHours)}`;

  const children = [
    row(S.balanceNorm, norm(full), '', S.balanceHint),
    row(S.balanceWorked, hoursShort(full.workedHours)),
  ];
  if (full.absenceDays > 0) {
    children.push(
      row(S.balanceAbsence, `${days(full.absenceDays)} · ${hoursShort(full.absenceHours)}`),
    );
    children.push(row(S.balanceCredited, hoursShort(full.creditedHours), ' balance__row--sum'));
  }
  children.push(deltaRow(full.overtime));

  if (toDate) {
    children.push(
      el('p', {
        class: 'balance__heading',
        textContent: S.balanceToDate.replace('{date}', formatShortDate(today)),
      }),
      row(S.balanceNorm, norm(toDate)),
      row(S.balanceCredited, hoursShort(toDate.creditedHours)),
      deltaRow(toDate.overtime),
      el('p', { class: 'subtle', textContent: S.balanceForecast }),
    );
  }

  return el('div', { class: 'balance' }, children);
}

function renderTotals(summary: Summary): HTMLElement[] {
  if (summary.totals.length === 0) {
    return [el('p', { class: 'muted', textContent: S.statsEmpty })];
  }

  const max = Math.max(...summary.totals.map((t) => t.days));

  const rows = summary.totals.map((t) => {
    const fill = el('div', { class: 'stat__fill' });
    fill.style.width = `${Math.round((t.days / max) * 100)}%`;

    const node = el('div', { class: 'stat' }, [
      el('span', { class: 'stat__icon', html: iconSvg(t.code) }),
      el('span', { class: 'stat__label', textContent: t.labelSk }),
      el('div', { class: 'stat__bar' }, [fill]),
      el('span', { class: 'stat__days', textContent: days(t.days) }),
      el('span', { class: 'stat__hours muted', textContent: hours(t.hours) }),
    ]);
    node.style.setProperty('--cell', t.color);
    return node;
  });

  return [
    el('div', { class: 'stats' }, rows),
    el('div', { class: 'stats__footer' }, [
      el('span', {
        class: 'muted',
        textContent: `${S.statsTotal}: ${days(summary.totalDays)} · ${hours(summary.totalHours)}`,
      }),
      el('strong', { textContent: `${S.statsWorkedHours}: ${hours(summary.workedHours)}` }),
    ]),
  ];
}

export function renderStatsPanel(root: HTMLElement, ctx: StatsContext): void {
  // The balance renders even for an empty period — a month with nothing in it
  // still owes its whole fond, which is exactly when the figure is worth having.
  root.replaceChildren(
    el('section', { class: 'panel' }, [
      el('div', { class: 'panel__head' }, [
        el('h2', { class: 'panel__title', textContent: S.statsTitle }),
        el('span', { class: 'panel__period muted', textContent: ctx.periodLabel }),
      ]),
      ...(ctx.balance ? [renderBalance(ctx.balance, ctx.today)] : []),
      ...renderTotals(ctx.summary),
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
