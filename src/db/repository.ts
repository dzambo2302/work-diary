import { isoDate, type IsoDate } from '../domain/dates.js';
import { isDayTypeCode, type DayTypeCode } from '../domain/day-types.js';
import { slovakHolidays } from '../domain/holidays-sk.js';
import { restDaySet, workdaysInYear } from '../domain/workdays.js';
import { DEFAULT_SETTINGS, MIGRATIONS, dayTypeSeedSql } from './schema.js';

/**
 * The minimal database port the repository needs. Implemented over the
 * in-memory VFS in tests and over opfs-sahpool in the worker, so both run
 * exactly the same SQL.
 */
export interface Db {
  exec(sql: string, bind?: readonly unknown[]): void;
  all<T>(sql: string, bind?: readonly unknown[]): T[];
  get<T>(sql: string, bind?: readonly unknown[]): T | undefined;
  transaction(fn: () => void): void;
}

export interface DayEntry {
  day: IsoDate;
  typeCode: DayTypeCode;
  hours: number;
  note: string | null;
}

export interface HolidayRow {
  day: IsoDate;
  name: string;
  isRestDay: boolean;
  needsVerification: boolean;
  source: 'seed' | 'user';
}

export interface DayTypeRow {
  code: DayTypeCode;
  labelSk: string;
  icon: string;
  color: string;
  colorDark: string;
  countsAsWork: boolean;
  sortOrder: number;
}

export interface SummaryGroup { typeCode: DayTypeCode; days: number; hours: number }
export interface CsvRow { day: IsoDate; typeLabel: string; hours: number; note: string | null }

export function initialize(db: Db): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const current =
    db.get<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_version')
      ?.version ?? 0;

  db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      db.exec(m.sql);
      db.exec('INSERT INTO schema_version(version) VALUES (?)', [m.version]);
    }
    const seed = dayTypeSeedSql();
    for (const bind of seed.binds) db.exec(seed.sql, bind);
    for (const [key, value] of DEFAULT_SETTINGS) {
      db.exec('INSERT OR IGNORE INTO setting(key, value) VALUES (?, ?)', [key, value]);
    }
  });
}

export function getSetting(db: Db, key: string): string | undefined {
  return db.get<{ value: string }>('SELECT value FROM setting WHERE key = ?', [key])?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.exec(
    `INSERT INTO setting(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export function allSettings(db: Db): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of db.all<{ key: string; value: string }>('SELECT key, value FROM setting')) {
    out[r.key] = r.value;
  }
  return out;
}

interface RawDayType {
  code: DayTypeCode; label_sk: string; icon: string; color: string;
  color_dark: string; counts_as_work: number; sort_order: number;
}

export function listDayTypes(db: Db): DayTypeRow[] {
  return db
    .all<RawDayType>('SELECT * FROM day_type ORDER BY sort_order')
    .map((r) => ({
      code: r.code, labelSk: r.label_sk, icon: r.icon, color: r.color,
      colorDark: r.color_dark, countsAsWork: r.counts_as_work === 1, sortOrder: r.sort_order,
    }));
}

export function updateDayType(
  db: Db,
  code: DayTypeCode,
  patch: { labelSk?: string; color?: string; colorDark?: string },
): void {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.labelSk !== undefined) { sets.push('label_sk = ?'); binds.push(patch.labelSk); }
  if (patch.color !== undefined) { sets.push('color = ?'); binds.push(patch.color); }
  if (patch.colorDark !== undefined) { sets.push('color_dark = ?'); binds.push(patch.colorDark); }
  if (sets.length === 0) return;
  binds.push(code);
  db.exec(`UPDATE day_type SET ${sets.join(', ')} WHERE code = ?`, binds);
}

interface RawEntry { day: IsoDate; type_code: DayTypeCode; hours: number; note: string | null }

export function listEntries(db: Db, from: IsoDate, to: IsoDate): DayEntry[] {
  return db
    .all<RawEntry>(
      `SELECT day, type_code, hours, note FROM day_entry
       WHERE day BETWEEN ? AND ? ORDER BY day`,
      [from, to],
    )
    .map((r) => ({ day: r.day, typeCode: r.type_code, hours: r.hours, note: r.note }));
}

export function upsertEntry(db: Db, entry: DayEntry): void {
  db.exec(
    `INSERT INTO day_entry(day, type_code, hours, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       type_code  = excluded.type_code,
       hours      = excluded.hours,
       note       = excluded.note,
       updated_at = datetime('now')`,
    [entry.day, entry.typeCode, entry.hours, entry.note],
  );
}

export function deleteEntry(db: Db, day: IsoDate): void {
  db.exec('DELETE FROM day_entry WHERE day = ?', [day]);
}

interface RawHoliday {
  day: IsoDate; name: string; is_rest_day: number;
  needs_verification: number; source: 'seed' | 'user';
}

export function listHolidays(db: Db, from: IsoDate, to: IsoDate): HolidayRow[] {
  return db
    .all<RawHoliday>(
      'SELECT * FROM holiday WHERE day BETWEEN ? AND ? ORDER BY day',
      [from, to],
    )
    .map((r) => ({
      day: r.day, name: r.name, isRestDay: r.is_rest_day === 1,
      needsVerification: r.needs_verification === 1, source: r.source,
    }));
}

/** A user decision clears the verification flag and takes ownership of the row. */
export function setHolidayRestDay(db: Db, day: IsoDate, isRestDay: boolean): void {
  db.exec(
    `UPDATE holiday
     SET is_rest_day = ?, needs_verification = 0, source = 'user'
     WHERE day = ?`,
    [isRestDay ? 1 : 0, day],
  );
}

export function summaryRows(db: Db, from: IsoDate, to: IsoDate): SummaryGroup[] {
  return db.all<{ type_code: DayTypeCode; days: number; hours: number }>(
    `SELECT type_code, COUNT(*) AS days, SUM(hours) AS hours
     FROM day_entry WHERE day BETWEEN ? AND ? GROUP BY type_code`,
    [from, to],
  ).map((r) => ({ typeCode: r.type_code, days: r.days, hours: r.hours }));
}

export function csvRows(db: Db, from: IsoDate, to: IsoDate): CsvRow[] {
  return db.all<{ day: IsoDate; label_sk: string; hours: number; note: string | null }>(
    `SELECT e.day, t.label_sk, e.hours, e.note
     FROM day_entry e JOIN day_type t ON t.code = e.type_code
     WHERE e.day BETWEEN ? AND ? ORDER BY e.day`,
    [from, to],
  ).map((r) => ({ day: r.day, typeLabel: r.label_sk, hours: r.hours, note: r.note }));
}

export function seededYears(db: Db): number[] {
  const raw = getSetting(db, 'seeded_years') ?? '';
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

function markYearSeeded(db: Db, year: number): void {
  const years = new Set(seededYears(db));
  years.add(year);
  setSetting(db, 'seeded_years', [...years].sort((a, b) => a - b).join(','));
}

/**
 * Seeds `year`'s holiday rows and auto-fills its working days.
 *
 * Idempotent: existing day_entry rows and user-owned holiday rows are never
 * touched, so re-running this can never destroy an edit.
 */
export function ensureYearSeeded(db: Db, year: number): { seeded: boolean; inserted: number } {
  if (seededYears(db).includes(year)) return { seeded: false, inserted: 0 };

  const rawType = getSetting(db, 'default_type') ?? 'office';
  const typeCode: DayTypeCode = isDayTypeCode(rawType) ? rawType : 'office';
  const rawHours = Number(getSetting(db, 'default_hours') ?? '8');
  const hours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 8;

  let inserted = 0;
  db.transaction(() => {
    for (const h of slovakHolidays(year)) {
      db.exec(
        `INSERT INTO holiday(day, name, is_rest_day, needs_verification, source)
         VALUES (?, ?, ?, ?, 'seed')
         ON CONFLICT(day) DO UPDATE SET
           name = excluded.name,
           is_rest_day = CASE WHEN holiday.source = 'user'
                              THEN holiday.is_rest_day ELSE excluded.is_rest_day END,
           needs_verification = CASE WHEN holiday.source = 'user'
                                     THEN 0 ELSE excluded.needs_verification END`,
        [h.day, h.name, h.isRestDay ? 1 : 0, h.needsVerification ? 1 : 0],
      );
    }

    // Read the rest days back from the table so a user's earlier correction
    // governs the auto-fill, with the computed set unioned in as a floor.
    const rest = new Set(
      db.all<{ day: IsoDate }>(
        'SELECT day FROM holiday WHERE is_rest_day = 1 AND day BETWEEN ? AND ?',
        [isoDate(year, 1, 1), isoDate(year, 12, 31)],
      ).map((r) => r.day),
    );
    for (const d of restDaySet(year)) rest.add(d);

    for (const day of workdaysInYear(year, rest)) {
      db.exec(
        `INSERT OR IGNORE INTO day_entry(day, type_code, hours, note)
         VALUES (?, ?, ?, NULL)`,
        [day, typeCode, hours],
      );
      inserted += 1;
    }
    markYearSeeded(db, year);
  });

  return { seeded: true, inserted };
}
