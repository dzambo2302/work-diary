import { describe, expect, it } from 'vitest';
import { slovakHolidays } from '../../src/domain/holidays-sk.js';

const byDay = (year: number) =>
  new Map(slovakHolidays(year).map((h) => [h.day, h]));

describe('slovakHolidays', () => {
  it('returns 16 entries sorted ascending', () => {
    const list = slovakHolidays(2026);
    expect(list).toHaveLength(16);
    expect([...list].sort((a, b) => a.day.localeCompare(b.day))).toEqual(list);
  });

  it('places the movable feasts from Easter', () => {
    const h = byDay(2026);
    expect(h.get('2026-04-03')?.name).toBe('Veľký piatok');
    expect(h.get('2026-04-06')?.name).toBe('Veľkonočný pondelok');
    expect(h.get('2026-04-03')?.isRestDay).toBe(true);
    expect(h.get('2026-04-06')?.isRestDay).toBe(true);
  });

  it('keeps the unconditional rest days', () => {
    const h = byDay(2026);
    for (const d of ['2026-01-01', '2026-01-06', '2026-05-01', '2026-07-05',
                     '2026-08-29', '2026-12-24', '2026-12-25', '2026-12-26']) {
      expect(h.get(d)?.isRestDay, d).toBe(true);
    }
  });

  it('treats Constitution Day as a working day from 2024', () => {
    expect(byDay(2023).get('2023-09-01')?.isRestDay).toBe(true);
    expect(byDay(2024).get('2024-09-01')?.isRestDay).toBe(false);
    expect(byDay(2026).get('2026-09-01')?.isRestDay).toBe(false);
  });

  it('treats 8 May and 15 September as working days from 2026, flagged for review', () => {
    expect(byDay(2025).get('2025-05-08')?.isRestDay).toBe(true);
    expect(byDay(2025).get('2025-05-08')?.needsVerification).toBe(false);
    expect(byDay(2026).get('2026-05-08')?.isRestDay).toBe(false);
    expect(byDay(2026).get('2026-05-08')?.needsVerification).toBe(true);
    expect(byDay(2026).get('2026-09-15')?.isRestDay).toBe(false);
    expect(byDay(2026).get('2026-09-15')?.needsVerification).toBe(true);
  });

  it('keeps All Saints as a rest day but flags 2026 for review', () => {
    expect(byDay(2026).get('2026-11-01')?.isRestDay).toBe(true);
    expect(byDay(2026).get('2026-11-01')?.needsVerification).toBe(true);
    expect(byDay(2025).get('2025-11-01')?.needsVerification).toBe(false);
  });

  it('lists state holidays that are working days', () => {
    const h = byDay(2026);
    expect(h.get('2026-10-28')?.isRestDay).toBe(false);
    expect(h.get('2026-11-17')?.isRestDay).toBe(false);
  });

  it('shifts movable feasts correctly in another year', () => {
    const h = byDay(2024);
    expect(h.get('2024-03-29')?.name).toBe('Veľký piatok');
    expect(h.get('2024-04-01')?.name).toBe('Veľkonočný pondelok');
  });
});
