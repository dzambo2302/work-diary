import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from './helpers.js';
import {
  allSettings, csvRows, deleteEntry, ensureYearSeeded, getSetting, initialize,
  listDayTypes, listEntries, listHolidays, setBreakMinutes, setHolidayRestDay,
  setSetting, summaryRows, upsertEntry, type Db,
} from '../../src/db/repository.js';
import { MIGRATIONS, dayTypeSeedSql } from '../../src/db/schema.js';

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
    expect(getSetting(db, 'default_start')).toBe('06:00');
    expect(getSetting(db, 'default_end')).toBe('14:30');
  });
});

/**
 * A database as schema version 1 wrote it, when a day was an hours number and
 * nothing else. Restoring such a backup has to keep every total intact.
 */
async function v1Db(): Promise<Db> {
  const old = await memoryDb();
  old.exec('PRAGMA foreign_keys = ON');
  old.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
  old.exec(MIGRATIONS[0]!.sql);
  old.exec('INSERT INTO schema_version(version) VALUES (1)');
  const seed = dayTypeSeedSql();
  for (const bind of seed.binds) old.exec(seed.sql, bind);
  return old;
}

describe('migration from the hours-only schema', () => {
  it('gives every entry a start and end time that preserves its hours', async () => {
    const old = await v1Db();
    old.exec(
      "INSERT INTO day_entry(day, type_code, hours, note) VALUES" +
      " ('2026-09-09', 'office', 8, NULL)," +
      " ('2026-09-10', 'doctor', 4, 'kontrola')," +
      " ('2026-09-11', 'home', 7.5, NULL)",
    );

    initialize(old);

    expect(listEntries(old, '2026-09-09', '2026-09-11')).toEqual([
      {
        day: '2026-09-09', typeCode: 'office',
        startTime: '06:00', endTime: '14:30', hours: 8, note: null,
      },
      {
        day: '2026-09-10', typeCode: 'doctor',
        startTime: '06:00', endTime: '10:00', hours: 4, note: 'kontrola',
      },
      {
        day: '2026-09-11', typeCode: 'home',
        startTime: '06:00', endTime: '14:00', hours: 7.5, note: null,
      },
    ]);
  });

  it('turns a configured default_hours into default start and end times', async () => {
    const old = await v1Db();
    old.exec("INSERT INTO setting(key, value) VALUES ('default_hours', '7.5')");

    initialize(old);

    expect(getSetting(old, 'default_start')).toBe('06:00');
    expect(getSetting(old, 'default_end')).toBe('14:00');
    expect(getSetting(old, 'default_hours')).toBeUndefined();
  });
});

describe('settings', () => {
  it('overwrites an existing key', () => {
    setSetting(db, 'default_start', '07:15');
    expect(getSetting(db, 'default_start')).toBe('07:15');
  });
  it('returns undefined for an unknown key', () => {
    expect(getSetting(db, 'nope')).toBeUndefined();
  });
});

describe('entries', () => {
  it('inserts and reads back a full entry', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'home', startTime: '06:00', endTime: '14:00', note: 'sprint',
    });
    expect(listEntries(db, '2026-09-01', '2026-09-30')).toEqual([
      {
        day: '2026-09-09', typeCode: 'home',
        startTime: '06:00', endTime: '14:00', hours: 7.5, note: 'sprint',
      },
    ]);
  });

  it('computes the hours from the times rather than trusting the caller', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null,
    });
    expect(listEntries(db, '2026-09-09', '2026-09-09')[0]!.hours).toBe(8);
  });

  it('stores a shift that runs past midnight', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '22:00', endTime: '06:30', note: null,
    });
    expect(listEntries(db, '2026-09-09', '2026-09-09')[0]!.hours).toBe(8);
  });

  it('updates on conflict rather than duplicating', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null,
    });
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'vacation', startTime: '06:00', endTime: '14:30', note: null,
    });
    const rows = listEntries(db, '2026-09-09', '2026-09-09');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.typeCode).toBe('vacation');
  });

  it('filters by range inclusively and returns ascending', () => {
    for (const day of ['2026-09-01', '2026-09-30', '2026-10-01']) {
      upsertEntry(db, { day, typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null });
    }
    expect(listEntries(db, '2026-09-01', '2026-09-30').map((r) => r.day))
      .toEqual(['2026-09-01', '2026-09-30']);
  });

  it('deletes an entry', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null,
    });
    deleteEntry(db, '2026-09-09');
    expect(listEntries(db, '2026-09-09', '2026-09-09')).toEqual([]);
  });

  it('rejects an unknown type code via the foreign key', () => {
    expect(() =>
      upsertEntry(db, {
        day: '2026-09-09', typeCode: 'nope' as never,
        startTime: '06:00', endTime: '14:30', note: null,
      }),
    ).toThrow();
  });
});

describe('holidays', () => {
  it('flips a rest day and marks the row as user-owned', () => {
    db.exec(
      "INSERT INTO holiday(day, name, is_rest_day, needs_verification, source)" +
      " VALUES ('2026-11-01', 'Sviatok Všetkých svätých', 1, 1, 'seed')",
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
    const full = { startTime: '06:00', endTime: '14:30' };
    upsertEntry(db, { day: '2026-09-01', typeCode: 'office', ...full, note: null });
    upsertEntry(db, {
      day: '2026-09-02', typeCode: 'office',
      startTime: '06:00', endTime: '12:00', note: 'skrátený',
    });
    upsertEntry(db, { day: '2026-09-03', typeCode: 'vacation', ...full, note: null });
    upsertEntry(db, { day: '2026-10-01', typeCode: 'sick', ...full, note: null });
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
      {
        day: '2026-09-02', typeLabel: 'Práca v kancelárii',
        startTime: '06:00', endTime: '12:00', hours: 6, note: 'skrátený',
      },
    ]);
  });

  it('returns every setting as a record', () => {
    expect(allSettings(db)).toMatchObject({
      default_type: 'office', default_start: '06:00', default_end: '14:30',
    });
  });
});

describe('the break setting', () => {
  it('is seeded alongside the contracted day', () => {
    expect(getSetting(db, 'break_minutes')).toBe('30');
    expect(getSetting(db, 'standard_hours')).toBe('8');
  });

  it('governs the hours a new entry is worth', () => {
    setBreakMinutes(db, 45);
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null,
    });
    expect(listEntries(db, '2026-09-09', '2026-09-09')[0]!.hours).toBe(7.75);
  });

  it('rewrites the hours of entries already recorded', () => {
    upsertEntry(db, {
      day: '2026-09-09', typeCode: 'office', startTime: '06:00', endTime: '14:30', note: null,
    });
    upsertEntry(db, {
      day: '2026-09-10', typeCode: 'home', startTime: '08:00', endTime: '13:00', note: null,
    });

    setBreakMinutes(db, 60);

    const entries = listEntries(db, '2026-09-09', '2026-09-10');
    expect(entries[0]!.hours).toBe(7.5);  // 8.5 span, an hour off
    expect(entries[1]!.hours).toBe(5);    // under six hours, untouched
    expect(entries[0]!.startTime).toBe('06:00');
    expect(entries[0]!.endTime).toBe('14:30');
  });

  it('normalises what it stores and falls back on nonsense', () => {
    setBreakMinutes(db, 45.4);
    expect(getSetting(db, 'break_minutes')).toBe('45');
    setBreakMinutes(db, 999);
    expect(getSetting(db, 'break_minutes')).toBe('30');
  });

  it('is used by the days a fresh year auto-fills', () => {
    setBreakMinutes(db, 45);
    ensureYearSeeded(db, 2026);
    expect(listEntries(db, '2026-09-09', '2026-09-09')[0]!.hours).toBe(7.75);
  });
});
