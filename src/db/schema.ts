import { DAY_TYPES } from '../domain/day-types.js';
import { DEFAULT_END, DEFAULT_START } from '../domain/times.js';

export const SCHEMA_VERSION = 2;

export const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE day_type (
        code           TEXT PRIMARY KEY,
        label_sk       TEXT NOT NULL,
        icon           TEXT NOT NULL,
        color          TEXT NOT NULL,
        color_dark     TEXT NOT NULL,
        counts_as_work INTEGER NOT NULL,
        sort_order     INTEGER NOT NULL
      );
      CREATE TABLE day_entry (
        day        TEXT PRIMARY KEY,
        type_code  TEXT NOT NULL REFERENCES day_type(code),
        hours      REAL NOT NULL DEFAULT 8,
        note       TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX ix_day_entry_type ON day_entry(type_code);
      CREATE TABLE holiday (
        day                TEXT PRIMARY KEY,
        name               TEXT NOT NULL,
        is_rest_day        INTEGER NOT NULL,
        needs_verification INTEGER NOT NULL DEFAULT 0,
        source             TEXT NOT NULL
      );
      CREATE TABLE setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    // A day is a shift, not a bare number. `hours` stays as the derived total so
    // every aggregate keeps summing one column; rows written by version 1 are
    // given the times that reproduce their hours by backfillShiftTimes().
    version: 2,
    sql: `
      ALTER TABLE day_entry ADD COLUMN start_time TEXT NOT NULL DEFAULT '${DEFAULT_START}';
      ALTER TABLE day_entry ADD COLUMN end_time   TEXT NOT NULL DEFAULT '${DEFAULT_END}';
    `,
  },
];

export const DEFAULT_SETTINGS: readonly [string, string][] = [
  ['default_type', 'office'],
  ['default_start', DEFAULT_START],
  ['default_end', DEFAULT_END],
  ['theme', 'system'],
  ['seeded_years', ''],
  ['last_backup_at', ''],
];

export function dayTypeSeedSql(): { sql: string; binds: unknown[][] } {
  return {
    sql: `INSERT OR IGNORE INTO day_type
            (code, label_sk, icon, color, color_dark, counts_as_work, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    binds: DAY_TYPES.map((t) => [
      t.code, t.labelSk, t.icon, t.color, t.colorDark, t.countsAsWork ? 1 : 0, t.sortOrder,
    ]),
  };
}
