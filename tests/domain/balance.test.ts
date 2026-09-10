import { describe, expect, it } from 'vitest';
import {
  STANDARD_HOURS, balanceEntries, parseStandardHours, rangeBalance,
  type BalanceEntry,
} from '../../src/domain/balance.js';
import { DAY_TYPES } from '../../src/domain/day-types.js';
import { restDaySet, workdaysInRange } from '../../src/domain/workdays.js';
import type { DayEntry, DayTypeRow } from '../../src/db/repository.js';

const types: DayTypeRow[] = DAY_TYPES.map((t) => ({
  code: t.code, labelSk: t.labelSk, icon: t.icon, color: t.color,
  colorDark: t.colorDark, countsAsWork: t.countsAsWork, sortOrder: t.sortOrder,
}));

/** September 2026: 22 working days, no rest day — a clean 176-hour month. */
const SEP = { from: '2026-09-01', to: '2026-09-30' } as const;
const sepWorkdays = workdaysInRange(SEP.from, SEP.to, restDaySet(2026));

const work = (day: string, hours: number): BalanceEntry =>
  ({ day, hours, countsAsWork: true });
const off = (day: string, hours = 8): BalanceEntry =>
  ({ day, hours, countsAsWork: false });

/** Every working day filled with the standard eight hours. */
const fullMonth = (): BalanceEntry[] => sepWorkdays.map((d) => work(d, 8));

function september(entries: readonly BalanceEntry[], today = '2026-10-01') {
  return rangeBalance({
    from: SEP.from, to: SEP.to, workdays: sepWorkdays, entries,
    standardHours: 8, today,
  });
}

describe('rangeBalance — the norm', () => {
  it('is the working days of the range times the contracted day', () => {
    const { full } = september([]);
    expect(full.normDays).toBe(22);
    expect(full.normHours).toBe(176);
  });

  it('shrinks by the rest days of a month that has them', () => {
    const workdays = workdaysInRange('2026-01-01', '2026-01-31', restDaySet(2026));
    const { full } = rangeBalance({
      from: '2026-01-01', to: '2026-01-31', workdays, entries: [],
      standardHours: 8, today: '2026-10-01',
    });
    expect(full.normDays).toBe(20);
    expect(full.normHours).toBe(160);
  });

  it('follows a shorter contracted day', () => {
    const b = rangeBalance({
      from: SEP.from, to: SEP.to, workdays: sepWorkdays, entries: [],
      standardHours: 7.5, today: '2026-10-01',
    });
    expect(b.full.normHours).toBe(165);
  });
});

describe('rangeBalance — what counts as done', () => {
  it('is level when every working day carries the standard shift', () => {
    const { full } = september(fullMonth());
    expect(full.workedHours).toBe(176);
    expect(full.creditedHours).toBe(176);
    expect(full.overtime).toBe(0);
  });

  it('counts hours beyond the shift as overtime', () => {
    const entries = fullMonth();
    entries[0] = work(sepWorkdays[0]!, 10);
    entries[1] = work(sepWorkdays[1]!, 9.5);
    expect(september(entries).full.overtime).toBe(3.5);
  });

  it('counts a short day as a shortfall', () => {
    const entries = fullMonth();
    entries[0] = work(sepWorkdays[0]!, 4);
    expect(september(entries).full.overtime).toBe(-4);
  });

  it('credits an absence with the contracted day, not with its own hours', () => {
    const entries = fullMonth();
    entries[0] = off(sepWorkdays[0]!, 2); // a two-hour doctor's visit
    const { full } = september(entries);
    expect(full.workedHours).toBe(168);
    expect(full.absenceDays).toBe(1);
    expect(full.absenceHours).toBe(8);
    expect(full.creditedHours).toBe(176);
    expect(full.overtime).toBe(0);
  });

  it('credits nothing for an absence on a day that was never expected', () => {
    const { full } = september([...fullMonth(), off('2026-09-12')]); // a Saturday
    expect(full.absenceDays).toBe(0);
    expect(full.absenceHours).toBe(0);
    expect(full.overtime).toBe(0);
  });

  it('makes weekend work pure overtime', () => {
    const { full } = september([...fullMonth(), work('2026-09-12', 6)]);
    expect(full.workedHours).toBe(182);
    expect(full.overtime).toBe(6);
  });

  it('treats a working day with no entry as unworked', () => {
    const { full } = september(fullMonth().slice(1));
    expect(full.normHours).toBe(176);
    expect(full.creditedHours).toBe(168);
    expect(full.overtime).toBe(-8);
  });

  it('owes the whole month when nothing is recorded', () => {
    const { full } = september([]);
    expect(full.creditedHours).toBe(0);
    expect(full.overtime).toBe(-176);
  });

  it('ignores entries outside the range', () => {
    const { full } = september([...fullMonth(), work('2026-08-31', 8), work('2026-10-01', 8)]);
    expect(full.workedHours).toBe(176);
    expect(full.overtime).toBe(0);
  });

  it('keeps quarter-hour shifts free of floating point dust', () => {
    const { full } = september(sepWorkdays.map((d) => work(d, 7.83)));
    expect(full.workedHours).toBe(172.26);
    expect(full.overtime).toBe(-3.74);
  });
});

describe('rangeBalance — to date', () => {
  it('stops at today, inclusive', () => {
    const { toDate } = september(fullMonth(), '2026-09-10');
    expect(toDate).not.toBeNull();
    expect(toDate!.normDays).toBe(8); // 1.–10. 9., minus the 5th and 6th
    expect(toDate!.normHours).toBe(64);
    expect(toDate!.creditedHours).toBe(64);
    expect(toDate!.overtime).toBe(0);
  });

  it('reports only the overtime already earned', () => {
    const entries = fullMonth();
    entries[0] = work(sepWorkdays[0]!, 12);   // 1. 9., already past
    entries[21] = work(sepWorkdays[21]!, 12); // 30. 9., still to come
    const { full, toDate } = september(entries, '2026-09-10');
    expect(full.overtime).toBe(8);
    expect(toDate!.overtime).toBe(4);
  });

  it('is absent for a month that has already ended', () => {
    expect(september(fullMonth(), '2026-10-05').toDate).toBeNull();
  });

  it('is absent on the last day of the range, where it would repeat the total', () => {
    expect(september(fullMonth(), '2026-09-30').toDate).toBeNull();
  });

  it('is absent for a month that has not started', () => {
    expect(september(fullMonth(), '2026-08-20').toDate).toBeNull();
  });
});

describe('balanceEntries', () => {
  it('reads countsAsWork off the day type', () => {
    const entries = [
      { day: '2026-09-01', typeCode: 'office', hours: 8 },
      { day: '2026-09-02', typeCode: 'vacation', hours: 8 },
      { day: '2026-09-03', typeCode: 'travel', hours: 9 },
    ] as DayEntry[];
    expect(balanceEntries(entries, types)).toEqual([
      { day: '2026-09-01', hours: 8, countsAsWork: true },
      { day: '2026-09-02', hours: 8, countsAsWork: false },
      { day: '2026-09-03', hours: 9, countsAsWork: true },
    ]);
  });
});

describe('parseStandardHours', () => {
  it('accepts a plain or comma-written number of hours', () => {
    expect(parseStandardHours('8')).toBe(8);
    expect(parseStandardHours('7,5')).toBe(7.5);
    expect(parseStandardHours(6)).toBe(6);
  });

  it('falls back on anything it cannot use', () => {
    expect(parseStandardHours('')).toBe(STANDARD_HOURS);
    expect(parseStandardHours('plný úväzok')).toBe(STANDARD_HOURS);
    expect(parseStandardHours(0)).toBe(STANDARD_HOURS);
    expect(parseStandardHours(-8)).toBe(STANDARD_HOURS);
    expect(parseStandardHours(25)).toBe(STANDARD_HOURS);
    expect(parseStandardHours(undefined)).toBe(STANDARD_HOURS);
  });
});
