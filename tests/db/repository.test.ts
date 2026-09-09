import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from './helpers.js';
import {
  allSettings, csvRows, deleteEntry, getSetting, initialize, listDayTypes,
  listEntries, listHolidays, setHolidayRestDay, setSetting, summaryRows,
  upsertEntry, type Db,
} from '../../src/db/repository.js';

let db: Db;
beforeEach(async () => {
  db = await memoryDb();
  initialize(db);
});

describe('initialize', () => {
  it('is idempotent', () => {
    expect(() => initialize(db)).not.toThrow();
    expect(listDayTypes(db)).toHaveLength(6);
  });

  it('seeds the six day types in sort order', () => {
    expect(listDayTypes(db).map((t) => t.code)).toEqual([
      'office', 'home', 'vacation', 'sick', 'doctor', 'travel',
    ]);
    expect(listDayTypes(db)[0]!.countsAsWork).toBe(true);
    expect(listDayTypes(db)[2]!.countsAsWork).toBe(false);
  });

  it('seeds default settings', () => {
    expect(getSetting(db, 'default_type')).toBe('office');
    expect(getSetting(db, 'default_hours')).toBe('8');
  });
});

describe('settings', () => {
  it('overwrites an existing key', () => {
    setSetting(db, 'default_hours', '7.5');
    expect(getSetting(db, 'default_hours')).toBe('7.5');
  });
  it('returns undefined for an unknown key', () => {
    expect(getSetting(db, 'nope')).toBeUndefined();
  });
});

describe('entries', () => {
  it('inserts and reads back a full entry', () => {
    upsertEntry(db, { day: '2026-09-09', typeCode: 'home', hours: 7.5, note: 'sprint' });
    expect(listEntries(db, '2026-09-01', '2026-09-30')).toEqual([
      { day: '2026-09-09', typeCode: 'home', hours: 7.5, note: 'sprint' },
    ]);
  });

  it('updates on conflict rather than duplicating', () => {
    upsertEntry(db, { day: '2026-09-09', typeCode: 'office', hours: 8, note: null });
    upsertEntry(db, { day: '2026-09-09', typeCode: 'vacation', hours: 8, note: null });
    const rows = listEntries(db, '2026-09-09', '2026-09-09');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.typeCode).toBe('vacation');
  });

  it('filters by range inclusively and returns ascending', () => {
    upsertEntry(db, { day: '2026-09-01', typeCode: 'office', hours: 8, note: null });
    upsertEntry(db, { day: '2026-09-30', typeCode: 'office', hours: 8, note: null });
    upsertEntry(db, { day: '2026-10-01', typeCode: 'office', hours: 8, note: null });
    expect(listEntries(db, '2026-09-01', '2026-09-30').map((r) => r.day))
      .toEqual(['2026-09-01', '2026-09-30']);
  });

  it('deletes an entry', () => {
    upsertEntry(db, { day: '2026-09-09', typeCode: 'office', hours: 8, note: null });
    deleteEntry(db, '2026-09-09');
    expect(listEntries(db, '2026-09-09', '2026-09-09')).toEqual([]);
  });

  it('rejects an unknown type code via the foreign key', () => {
    expect(() =>
      upsertEntry(db, { day: '2026-09-09', typeCode: 'nope' as never, hours: 8, note: null }),
    ).toThrow();
  });
});

describe('holidays', () => {
  it('flips a rest day and marks the row as user-owned', () => {
    db.exec(
      `INSERT INTO holiday(day, name, is_rest_day, needs_verification, source)
       VALUES ('2026-11-01', 'Sviatok Všetkých svätých', 1, 1, 'seed')`,
    );
    setHolidayRestDay(db, '2026-11-01', false);
    const [row] = listHolidays(db, '2026-01-01', '2026-12-31');
    expect(row).toMatchObject({
      day: '2026-11-01', isRestDay: false, source: 'user', needsVerification: false,
    });
  });
});

describe('aggregates', () => {
  beforeEach(() => {
    upsertEntry(db, { day: '2026-09-01', typeCode: 'office', hours: 8, note: null });
    upsertEntry(db, { day: '2026-09-02', typeCode: 'office', hours: 6, note: 'skrátený' });
    upsertEntry(db, { day: '2026-09-03', typeCode: 'vacation', hours: 8, note: null });
    upsertEntry(db, { day: '2026-10-01', typeCode: 'sick', hours: 8, note: null });
  });

  it('groups by type within the range only', () => {
    const rows = summaryRows(db, '2026-09-01', '2026-09-30')
      .sort((a, b) => a.typeCode.localeCompare(b.typeCode));
    expect(rows).toEqual([
      { typeCode: 'office', days: 2, hours: 14 },
      { typeCode: 'vacation', days: 1, hours: 8 },
    ]);
  });

  it('joins the Slovak label for CSV rows', () => {
    const rows = csvRows(db, '2026-09-02', '2026-09-02');
    expect(rows).toEqual([
      { day: '2026-09-02', typeLabel: 'Práca v kancelárii', hours: 6, note: 'skrátený' },
    ]);
  });

  it('returns every setting as a record', () => {
    expect(allSettings(db)).toMatchObject({ default_type: 'office', default_hours: '8' });
  });
});
