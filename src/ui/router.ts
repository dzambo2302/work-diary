import { addDays, daysInMonth, isoDate, parseIso, type IsoDate } from '../domain/dates.js';

export type ViewName = 'day' | 'month' | 'year';
export interface ViewState { view: ViewName; date: IsoDate }

const YEAR_RE = /^#\/year\/(\d{4})$/;
const MONTH_RE = /^#\/month\/(\d{4})-(\d{2})$/;
const DAY_RE = /^#\/day\/(\d{4}-\d{2}-\d{2})$/;

function safe(fn: () => ViewState, fallback: ViewState): ViewState {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function parseHash(hash: string, today: IsoDate): ViewState {
  const t = parseIso(today);
  const fallback: ViewState = { view: 'month', date: isoDate(t.year, t.month, 1) };

  const year = YEAR_RE.exec(hash);
  if (year) return safe(() => ({ view: 'year', date: isoDate(Number(year[1]), 1, 1) }), fallback);

  const month = MONTH_RE.exec(hash);
  if (month) {
    return safe(() => {
      const m = Number(month[2]);
      if (m < 1 || m > 12) throw new Error('bad month');
      return { view: 'month', date: isoDate(Number(month[1]), m, 1) };
    }, fallback);
  }

  const day = DAY_RE.exec(hash);
  if (day) {
    return safe(() => {
      const d = day[1]!;
      const p = parseIso(d);
      // Reject dates that match the shape but do not exist, e.g. 2026-02-30.
      if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > daysInMonth(p.year, p.month)) {
        throw new Error('bad date');
      }
      return { view: 'day', date: d };
    }, fallback);
  }

  return fallback;
}

export function formatHash(s: ViewState): string {
  const { year, month } = parseIso(s.date);
  if (s.view === 'year') return `#/year/${year}`;
  if (s.view === 'month') return `#/month/${isoDate(year, month, 1).slice(0, 7)}`;
  return `#/day/${s.date}`;
}

export class Router {
  #state: ViewState;
  #today: IsoDate;
  #listeners: ((s: ViewState) => void)[] = [];

  constructor(today: IsoDate) {
    this.#today = today;
    this.#state = parseHash(location.hash, today);
    window.addEventListener('hashchange', () => {
      this.#state = parseHash(location.hash, this.#today);
      this.#emit();
    });
  }

  get current(): ViewState {
    return this.#state;
  }

  go(next: Partial<ViewState>): void {
    const merged: ViewState = { ...this.#state, ...next };
    const hash = formatHash(merged);
    if (hash === location.hash) {
      this.#state = merged;
      this.#emit();
      return;
    }
    location.hash = hash; // triggers hashchange -> emit
  }

  /** Moves one day / month / year, depending on the current view. */
  step(delta: number): void {
    const { year, month } = parseIso(this.#state.date);
    if (this.#state.view === 'day') {
      this.go({ date: addDays(this.#state.date, delta) });
      return;
    }
    if (this.#state.view === 'month') {
      const total = year * 12 + (month - 1) + delta;
      this.go({ date: isoDate(Math.floor(total / 12), (total % 12) + 1, 1) });
      return;
    }
    this.go({ date: isoDate(year + delta, 1, 1) });
  }

  subscribe(fn: (s: ViewState) => void): void {
    this.#listeners.push(fn);
  }

  #emit(): void {
    for (const fn of this.#listeners) fn(this.#state);
  }
}
