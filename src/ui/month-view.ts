import { addDays, dayOfWeek, daysInMonth, isoDate, parseIso, type IsoDate }
  from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';
import { SK_WEEKDAYS_SHORT, formatHours } from './strings.js';

export interface MonthContext {
  year: number;
  month: number;
  cellFor: (day: IsoDate) => DayCell;
  onPick: (day: IsoDate) => void;
}

export function renderMonthView(root: HTMLElement, ctx: MonthContext): void {
  const grid = el('div', { class: 'month' });

  for (const abbr of SK_WEEKDAYS_SHORT) {
    grid.append(el('div', { class: 'month__weekday', textContent: abbr }));
  }

  const first = isoDate(ctx.year, ctx.month, 1);
  const lead = dayOfWeek(first) - 1; // Monday = 0
  const total = daysInMonth(ctx.year, ctx.month);
  const trail = (7 - ((lead + total) % 7)) % 7;

  for (let i = lead; i > 0; i -= 1) grid.append(adjacent(addDays(first, -i), ctx));
  for (let d = 1; d <= total; d += 1) grid.append(dayCell(isoDate(ctx.year, ctx.month, d), ctx));
  const last = isoDate(ctx.year, ctx.month, total);
  for (let i = 1; i <= trail; i += 1) grid.append(adjacent(addDays(last, i), ctx));

  root.replaceChildren(el('div', { class: 'card' }, [grid]));
}

function adjacent(day: IsoDate, ctx: MonthContext): HTMLElement {
  const node = dayCell(day, ctx);
  node.classList.add('month__cell--adjacent');
  return node;
}

function dayCell(day: IsoDate, ctx: MonthContext): HTMLElement {
  const cell = ctx.cellFor(day);
  const { day: dom } = parseIso(day);

  const dayNumber = el('span', { class: 'month__dom', textContent: String(dom) });
  const head = el('div', { class: 'month__head' }, [
    dayNumber,
    cell.hours !== null
      ? el('span', { class: 'month__hours', textContent: `${formatHours(cell.hours)} h` })
      : el('span'),
  ]);

  const body = el('div', { class: 'month__body' });
  if (cell.kind === 'entry' && cell.typeCode) {
    body.append(
      el('span', { class: 'month__icon', html: iconSvg(cell.typeCode) }),
      el('span', { class: 'month__label', textContent: cell.label }),
    );
  } else {
    body.append(el('span', { class: 'month__label muted', textContent: cell.label }));
  }

  const foot = el('div', { class: 'month__foot' });
  if (cell.holidayName) {
    // A dot plus the name; the dot survives truncation on narrow columns.
    foot.append(
      el('span', { class: 'month__dot', 'aria-hidden': 'true' }),
      el('span', { class: 'month__holiday', textContent: cell.holidayName }),
    );
  } else if (cell.note) {
    // Notes are user data: textContent only, never innerHTML.
    foot.append(el('span', { class: 'month__note', textContent: cell.note }));
  }

  const node = el('button', {
    class: `month__cell month__cell--${cell.kind}${cell.isToday ? ' is-today' : ''}`,
    type: 'button',
    'aria-label': cell.tooltip,
    title: cell.tooltip,
    onclick: () => ctx.onPick(day),
  }, [head, body, foot]);

  if (cell.color) node.style.setProperty('--cell', cell.color);
  return node;
}
