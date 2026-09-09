import { describe, expect, it } from 'vitest';
import {
  addDays, dayOfWeek, daysInMonth, datesInRange, fromDayNumber,
  isLeapYear, isWeekend, isoDate, parseIso, toDayNumber,
} from '../../src/domain/dates.js';

describe('isoDate / parseIso', () => {
  it('pads month and day', () => {
    expect(isoDate(2026, 9, 9)).toBe('2026-09-09');
  });
  it('round-trips', () => {
    expect(parseIso('2026-09-09')).toEqual({ year: 2026, month: 9, day: 9 });
  });
  it('rejects malformed input', () => {
    expect(() => parseIso('2026-9-9')).toThrow();
  });
});

describe('day numbers', () => {
  it('anchors the epoch', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
  });
  it('round-trips across a leap day', () => {
    expect(fromDayNumber(toDayNumber('2024-02-29'))).toBe('2024-02-29');
  });
  it('round-trips across a century boundary', () => {
    expect(fromDayNumber(toDayNumber('2100-03-01'))).toBe('2100-03-01');
  });
});

describe('dayOfWeek', () => {
  it('returns 4 for a Thursday', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4);
  });
  it('returns 1 for a Monday and 7 for a Sunday', () => {
    expect(dayOfWeek('2026-09-07')).toBe(1);
    expect(dayOfWeek('2026-09-13')).toBe(7);
  });
  it('marks Saturday and Sunday as weekend', () => {
    expect(isWeekend('2026-09-12')).toBe(true);
    expect(isWeekend('2026-09-13')).toBe(true);
    expect(isWeekend('2026-09-11')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('is unaffected by DST transitions', () => {
    // Slovak DST starts 2026-03-29; a naive Date-based impl loses an hour here.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('calendar helpers', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 9)).toBe(30);
  });
  it('enumerates an inclusive range', () => {
    expect(datesInRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ]);
  });
});
