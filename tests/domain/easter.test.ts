import { describe, expect, it } from 'vitest';
import { easterSunday } from '../../src/domain/easter.js';
import { addDays } from '../../src/domain/dates.js';

describe('easterSunday', () => {
  it.each([
    [2020, '2020-04-12'],
    [2021, '2021-04-04'],
    [2022, '2022-04-17'],
    [2023, '2023-04-09'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
  ])('computes %i', (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });

  it('places Good Friday two days before and Easter Monday one day after', () => {
    expect(addDays(easterSunday(2026), -2)).toBe('2026-04-03');
    expect(addDays(easterSunday(2026), 1)).toBe('2026-04-06');
  });
});
