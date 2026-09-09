import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from './helpers.js';
import {
  ensureYearSeeded, initialize, listEntries, listHolidays, seededYears,
  setHolidayRestDay, setSetting, upsertEntry, type Db,
} from '../../src/db/repository.js';

let db: Db;
beforeEach(async () => {
  db = await memoryDb();
  initialize(db);
});

describe('ensureYearSeeded', () => {
  it('seeds holidays and working days on first call', () => {
    const r = ensureYearSeeded(db, 2026);
    expect(r.seeded).toBe(true);
    expect(r.inserted).toBeGreaterThan(240);
    expect(listHolidays(db, '2026-01-01', '2026-12-31')).toHaveLength(16);
    expect(seededYears(db)).toEqual([2026]);
  });

  it('uses the default type and hours', () => {
    setSetting(db, 'default_type', 'home');
    setSetting(db, 'default_hours', '7.5');
    ensureYearSeeded(db, 2026);
    const [first] = listEntries(db, '2026-01-02', '2026-01-02');
    expect(first).toEqual({ day: '2026-01-02', typeCode: 'home', hours: 7.5, note: null });
  });

  it('skips weekends and rest-day holidays but keeps working holidays', () => {
    ensureYearSeeded(db, 2026);
    const has = (d: string) => listEntries(db, d, d).length === 1;
    expect(has('2026-09-12')).toBe(false); // Saturday
    expect(has('2026-01-01')).toBe(false); // rest day
    expect(has('2026-04-03')).toBe(false); // Good Friday
    expect(has('2026-09-01')).toBe(true);  // holiday, still a working day
    expect(has('2026-05-08')).toBe(true);  // working from 2026
  });

  it('is idempotent and never overwrites a user edit', () => {
    ensureYearSeeded(db, 2026);
    upsertEntry(db, { day: '2026-09-09', typeCode: 'vacation', hours: 4, note: 'pol dňa' });
    const second = ensureYearSeeded(db, 2026);
    expect(second.seeded).toBe(false);
    expect(second.inserted).toBe(0);
    expect(listEntries(db, '2026-09-09', '2026-09-09')[0]).toEqual({
      day: '2026-09-09', typeCode: 'vacation', hours: 4, note: 'pol dňa',
    });
  });

  it('never overwrites a user-corrected holiday row', () => {
    ensureYearSeeded(db, 2026);
    setHolidayRestDay(db, '2026-11-01', false);
    db.exec("UPDATE setting SET value = '' WHERE key = 'seeded_years'");
    ensureYearSeeded(db, 2026);
    const row = listHolidays(db, '2026-11-01', '2026-11-01')[0];
    expect(row).toMatchObject({ isRestDay: false, source: 'user' });
  });

  it('tracks several years independently', () => {
    ensureYearSeeded(db, 2025);
    ensureYearSeeded(db, 2026);
    expect(seededYears(db)).toEqual([2025, 2026]);
    expect(listEntries(db, '2025-01-01', '2026-12-31').length).toBeGreaterThan(480);
  });
});
