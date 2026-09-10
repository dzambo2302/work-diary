import { describe, expect, it } from 'vitest';
import { restDaySet, workdaysInRange, workdaysInYear } from '../../src/domain/workdays.js';

describe('restDaySet', () => {
  it('contains only the rest days of the year', () => {
    const rest = restDaySet(2026);
    expect(rest.has('2026-01-01')).toBe(true);
    expect(rest.has('2026-04-06')).toBe(true);
    expect(rest.has('2026-09-01')).toBe(false); // holiday, but a working day
    expect(rest.has('2026-05-08')).toBe(false); // working from 2026
  });
});

describe('workdaysInYear', () => {
  it('excludes weekends', () => {
    const days = workdaysInYear(2026, new Set());
    expect(days).not.toContain('2026-09-12');
    expect(days).not.toContain('2026-09-13');
    expect(days).toContain('2026-09-11');
  });

  it('excludes rest days that fall on a weekday', () => {
    const days = workdaysInYear(2026, restDaySet(2026));
    expect(days).not.toContain('2026-01-01'); // Thursday
    expect(days).not.toContain('2026-04-03'); // Good Friday
    expect(days).toContain('2026-09-01');     // holiday but working
  });

  it('spans the whole year inclusively', () => {
    const days = workdaysInYear(2026, new Set());
    expect(days[0]).toBe('2026-01-01');
    expect(days.at(-1)).toBe('2026-12-31');
  });

  it('counts the weekdays of the leap year 2024', () => {
    expect(workdaysInYear(2024, new Set())).toHaveLength(262);
  });
});

describe('workdaysInRange', () => {
  it('covers the range inclusively', () => {
    const days = workdaysInRange('2026-09-01', '2026-09-30', new Set());
    expect(days).toHaveLength(22);
    expect(days[0]).toBe('2026-09-01');
    expect(days.at(-1)).toBe('2026-09-30');
  });

  it('excludes weekends and rest days inside the range', () => {
    const days = workdaysInRange('2026-01-01', '2026-01-31', restDaySet(2026));
    expect(days).not.toContain('2026-01-01'); // Deň vzniku SR, a Thursday
    expect(days).not.toContain('2026-01-06'); // Traja králi, a Tuesday
    expect(days).not.toContain('2026-01-03'); // Saturday
    expect(days).toContain('2026-01-02');
    expect(days).toHaveLength(20);
  });

  it('honours a rest-day set the user has overridden', () => {
    const days = workdaysInRange('2026-09-01', '2026-09-30', new Set(['2026-09-15']));
    expect(days).not.toContain('2026-09-15');
    expect(days).toHaveLength(21);
  });

  it('is empty when the range runs backwards', () => {
    expect(workdaysInRange('2026-09-30', '2026-09-01', new Set())).toEqual([]);
  });
});
