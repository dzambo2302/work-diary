import type { IsoDate } from './dates.js';
import type { DayEntry, DayTypeRow } from '../db/repository.js';

/** A full-time Slovak working day, and the fallback for the `standard_hours` setting. */
export const STANDARD_HOURS = 8;
const MAX_STANDARD_HOURS = 24;

/** What the balance needs of a day: when it was, how long, and whether it was work. */
export interface BalanceEntry {
  day: IsoDate;
  hours: number;
  countsAsWork: boolean;
}

export interface Balance {
  /** Working days expected in the period, and the hours they add up to. */
  normDays: number;
  normHours: number;
  /** Hours actually worked, weekend and holiday shifts included. */
  workedHours: number;
  /** Days off that the norm still expects, credited at the contracted day. */
  absenceDays: number;
  absenceHours: number;
  creditedHours: number;
  /** Positive is overtime, negative is hours still owed. */
  overtime: number;
}

/** `toDate` is null when today lies outside the period and the split says nothing. */
export interface RangeBalance {
  full: Balance;
  toDate: Balance | null;
}

export interface BalanceInput {
  from: IsoDate;
  to: IsoDate;
  /** Expected working days; entries and days outside [from, to] are ignored. */
  workdays: readonly IsoDate[];
  entries: readonly BalanceEntry[];
  standardHours: number;
  today: IsoDate;
}

/** Hours are quarter-hour decimals, so sums need rounding to stay readable. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A stored `standard_hours` setting, as a number. Like the break, an unusable
 * value falls back instead of throwing — no setting may stop the diary opening.
 */
export function parseStandardHours(raw: unknown, fallback: number = STANDARD_HOURS): number {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (typeof raw !== 'number' && text === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(text);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_STANDARD_HOURS) return fallback;
  return round2(n);
}

/** Joins stored entries to their type, which is what knows whether it is work. */
export function balanceEntries(
  entries: readonly DayEntry[],
  types: readonly DayTypeRow[],
): BalanceEntry[] {
  const worksByCode = new Map(types.map((t) => [t.code, t.countsAsWork]));
  return entries.map((e) => ({
    day: e.day,
    hours: e.hours,
    countsAsWork: worksByCode.get(e.typeCode) ?? false,
  }));
}

function balanceOver(input: BalanceInput, from: IsoDate, to: IsoDate): Balance {
  // ISO dates are fixed-width, so string order is date order.
  const inRange = (d: IsoDate): boolean => d >= from && d <= to;
  const workdays = input.workdays.filter(inRange);
  const expected = new Set(workdays);

  let workedHours = 0;
  let absenceDays = 0;

  for (const e of input.entries) {
    if (!inRange(e.day)) continue;
    if (e.countsAsWork) {
      workedHours += e.hours;
      continue;
    }
    // Dovolenka, PN and a doctor's visit stand in for a day the norm expects.
    // On a Saturday the norm expects nothing, so there is nothing to stand in
    // for — crediting it would invent overtime out of a day off.
    if (expected.has(e.day)) absenceDays += 1;
  }

  const normHours = round2(workdays.length * input.standardHours);
  const absenceHours = round2(absenceDays * input.standardHours);
  const creditedHours = round2(workedHours + absenceHours);

  return {
    normDays: workdays.length,
    normHours,
    workedHours: round2(workedHours),
    absenceDays,
    absenceHours,
    creditedHours,
    overtime: round2(creditedHours - normHours),
  };
}

/**
 * The period's balance, plus the same figures up to today.
 *
 * The diary pre-fills every working day of the year with the default shift, so
 * the full-period number is a forecast the moment the period contains a future
 * day. The to-date figure is the one that has actually happened; it is null
 * when today falls outside the period, where it would either repeat the total
 * or say nothing at all.
 */
export function rangeBalance(input: BalanceInput): RangeBalance {
  return {
    full: balanceOver(input, input.from, input.to),
    toDate: input.today >= input.from && input.today < input.to
      ? balanceOver(input, input.from, input.today)
      : null,
  };
}
