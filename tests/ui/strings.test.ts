import { describe, expect, it } from 'vitest';
import {
  days, formatHours, formatLongDate, formatMonthTitle, formatShortDate, hours,
  hoursShort, plural, signedHours, S,
} from '../../src/ui/strings.js';

describe('plural', () => {
  it('uses the three Slovak forms', () => {
    expect(plural(1, 'deň', 'dni', 'dní')).toBe('deň');
    expect(plural(2, 'deň', 'dni', 'dní')).toBe('dni');
    expect(plural(4, 'deň', 'dni', 'dní')).toBe('dni');
    expect(plural(5, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(0, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(11, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(21, 'deň', 'dni', 'dní')).toBe('dní');
  });

  it('formats counted nouns', () => {
    expect(days(1)).toBe('1 deň');
    expect(days(3)).toBe('3 dni');
    expect(days(12)).toBe('12 dní');
    expect(hours(1)).toBe('1 hodina');
    expect(hours(2)).toBe('2 hodiny');
    expect(hours(8)).toBe('8 hodín');
  });
});

describe('formatting', () => {
  it('uses a Slovak decimal comma and trims whole numbers', () => {
    expect(formatHours(8)).toBe('8');
    expect(formatHours(7.5)).toBe('7,5');
    expect(formatHours(0.25)).toBe('0,25');
  });

  it('formats a long date in the genitive month form', () => {
    expect(formatLongDate('2026-09-09')).toBe('streda 9. septembra 2026');
    expect(formatLongDate('2026-01-01')).toBe('štvrtok 1. januára 2026');
    expect(formatLongDate('2026-05-08')).toBe('piatok 8. mája 2026');
  });

  it('formats a month title in the nominative', () => {
    expect(formatMonthTitle(2026, 9)).toBe('september 2026');
  });

  it('writes a compact hour figure without the counted noun', () => {
    expect(hoursShort(176)).toBe('176 h');
    expect(hoursShort(7.5)).toBe('7,5 h');
  });

  it('signs a balance, and leaves zero unsigned', () => {
    expect(signedHours(8)).toBe('+8 h');
    expect(signedHours(0.5)).toBe('+0,5 h');
    expect(signedHours(-4.25)).toBe('−4,25 h');
    expect(signedHours(0)).toBe('0 h');
  });

  it('shortens a date to the day and month', () => {
    expect(formatShortDate('2026-09-10')).toBe('10. 9.');
    expect(formatShortDate('2026-01-01')).toBe('1. 1.');
  });
});

describe('S', () => {
  it('contains no empty or placeholder text', () => {
    for (const [key, value] of Object.entries(S)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/TODO|TBD/i);
    }
  });
});
