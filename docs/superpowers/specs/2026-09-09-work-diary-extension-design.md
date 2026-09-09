# Work Diary Browser Extension — Design

Date: 2026-09-09
Status: Approved for planning

## 1. Purpose

A personal work diary as a Chrome/Edge MV3 extension. Every working day —
excluding weekends and Slovak rest-day holidays — is pre-filled with a default
day type and 8 hours. The user adjusts the exceptions: vacation, sick day,
doctor appointment, work travel, and the split between office work and home
office. Data lives in a real SQLite database compiled to WebAssembly, so
aggregation, typed columns, and file-level backup all come for free.

Non-goals: multi-user support, server sync, calendar/HR system integration,
time tracking finer than whole-day hours, mobile.

## 2. Decisions

| Question | Decision |
|---|---|
| Platform | Chrome/Edge, Manifest V3 |
| UI surface | Full extension page in a tab (`diary.html`) |
| Stack | TypeScript + Vite, no UI framework |
| Views | Day / Month / Year, switchable |
| Day model | Exactly one type per day, editable hours |
| Prefill | Auto-fill on first open of a year |
| Outputs | `.sqlite` backup/restore, per-period totals, CSV export |
| Storage | `@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS, dedicated Web Worker |

## 3. Architecture

Three isolated units, communicating over narrow interfaces:

```
diary.html (extension page, main thread)
  ui/          renders views, owns no persistence logic
    |  typed RPC (postMessage, request/response with ids)
  db.worker.ts (dedicated Web Worker)
    |  sqlite-wasm + opfs-sahpool VFS
  OPFS: /work-diary/diary.sqlite

service-worker.ts (MV3 background)
    action.onClicked -> chrome.tabs.create(diary.html)   [nothing else]

domain/  pure functions, no DOM and no DB: dates, Easter, holidays,
         workday enumeration, stats shaping, CSV formatting
```

`domain/` is the testable core. `db/` owns SQL and the worker boundary. `ui/`
owns rendering and never issues SQL directly — it calls typed repository
methods exposed by the RPC client.

### 3.1 Why a worker

`FileSystemFileHandle.createSyncAccessHandle()`, which `opfs-sahpool` requires,
is unavailable on the main thread and inside MV3 service workers. A dedicated
Web Worker spawned from the extension page is the only place it runs. This also
keeps SQLite work off the UI thread.

### 3.2 Why `opfs-sahpool` rather than `opfs`

The default `opfs` VFS needs `SharedArrayBuffer`, which needs COOP/COEP response
headers. An extension page cannot set response headers. `opfs-sahpool`
(SQLite 3.43.0+) needs neither, at the cost of concurrent access from multiple
tabs — irrelevant for a single-user diary.

### 3.3 Fallback (approach B)

If OPFS proves unusable inside `chrome-extension://`, fall back to running
SQLite with the in-memory VFS on the main thread and persisting the serialized
database to `chrome.storage.local` after each mutation. Same schema, same SQL,
same UI; only `db/` changes. This is a documented escape hatch, not the plan.

## 4. Data model

```sql
CREATE TABLE schema_version (version INTEGER NOT NULL);

CREATE TABLE day_type (
  code           TEXT PRIMARY KEY,   -- 'office' | 'home' | 'vacation'
                                     -- 'sick' | 'doctor' | 'travel'
  label_sk       TEXT NOT NULL,
  icon           TEXT NOT NULL,      -- Lucide icon key
  color          TEXT NOT NULL,      -- hex, light theme
  color_dark     TEXT NOT NULL,      -- hex, dark theme
  counts_as_work INTEGER NOT NULL,   -- 0/1, drives "hours worked" totals
  sort_order     INTEGER NOT NULL
);

CREATE TABLE day_entry (
  day        TEXT PRIMARY KEY,       -- 'YYYY-MM-DD'
  type_code  TEXT NOT NULL REFERENCES day_type(code),
  hours      REAL NOT NULL DEFAULT 8,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_day_entry_type ON day_entry(type_code);

CREATE TABLE holiday (
  day         TEXT PRIMARY KEY,      -- 'YYYY-MM-DD', concrete per year
  name        TEXT NOT NULL,
  is_rest_day INTEGER NOT NULL,      -- 1 = non-working
  source      TEXT NOT NULL          -- 'seed' | 'user'
);

CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- default_type='office', default_hours='8', theme='system',
-- seeded_years='2024,2025,2026', last_backup_at='YYYY-MM-DD'
```

Dates are stored and compared as `'YYYY-MM-DD'` strings throughout. No
JavaScript `Date` arithmetic crosses a persistence or comparison boundary, so
no timezone or DST shift can move a day.

### 4.1 Seeded day types

| code | label_sk | icon | color (light) | counts_as_work |
|---|---|---|---|---|
| office | Práca v kancelárii | building-2 | `#3B82F6` | 1 |
| home | Home office | house | `#14B8A6` | 1 |
| vacation | Dovolenka | palmtree | `#F59E0B` | 0 |
| sick | Péenka / sick day | thermometer | `#EF4444` | 0 |
| doctor | Lekár | stethoscope | `#8B5CF6` | 0 |
| travel | Pracovná cesta | plane | `#EC4899` | 1 |

Weekends and rest-day holidays are not day types; they are rendered states
(neutral grey, recessed) derived from the calendar and the `holiday` table.
Colors are database rows, editable in Settings without a rebuild.

## 5. Slovak holidays

Slovak law distinguishes a *štátny sviatok* (state holiday) from a *deň
pracovného pokoja* (day of work rest). Only the latter is non-working, and the
two have diverged: 1 September stopped being a rest day in 2024, and several
entries are conditional per year under § 4b of zák. 241/1993. Public sources
for 2026 disagree on at least 1 November.

Therefore the app does **not** compute rest days from a fixed rule. It seeds
concrete `holiday` rows per year and lets the user correct any row's
`is_rest_day` flag in Settings. Only Easter is computed, via the Meeus/Jones/
Butcher algorithm; Good Friday is Easter − 2 days, Easter Monday is Easter + 1.

Seed table (defaults; `is_rest_day` is user-correctable):

| Date | Name | is_rest_day |
|---|---|---|
| 01-01 | Deň vzniku Slovenskej republiky | 1 |
| 01-06 | Zjavenie Pána (Traja králi) | 1 |
| Easter − 2 | Veľký piatok | 1 |
| Easter + 1 | Veľkonočný pondelok | 1 |
| 05-01 | Sviatok práce | 1 |
| 05-08 | Deň víťazstva nad fašizmom | 0 for 2026 — verify |
| 07-05 | Sviatok sv. Cyrila a Metoda | 1 |
| 08-29 | Výročie SNP | 1 |
| 09-01 | Deň Ústavy SR | 0 (since 2024) |
| 09-15 | Sedembolestná Panna Mária | 0 for 2026 — verify |
| 10-28 | Deň vzniku samostatného česko-slovenského štátu | 0 |
| 11-01 | Sviatok Všetkých svätých | 1 — sources disagree for 2026 |
| 11-17 | Deň boja za slobodu a demokraciu | 0 |
| 12-24 | Štedrý deň | 1 |
| 12-25 | Prvý sviatok vianočný | 1 |
| 12-26 | Druhý sviatok vianočný | 1 |

Rows marked *verify* are seeded with the stated default and surfaced in
Settings with a "check this" hint on first run of that year.

## 6. Auto-fill

On first open of a year not listed in `setting.seeded_years`:

1. Seed that year's `holiday` rows (source `'seed'`; never overwrite `'user'` rows).
2. `INSERT OR IGNORE INTO day_entry` one row for every Mon–Fri of the year that
   is not a rest-day holiday, using `default_type` and `default_hours`.
3. Append the year to `seeded_years`.

The operation is idempotent: existing entries are never modified, so re-running
it cannot destroy edits. Weekends and rest-day holidays get no row but remain
manually editable, so a Saturday actually worked can still be recorded.

## 7. Views

Toolbar across all views: `Deň | Mesiac | Rok` switcher, `‹ ›` navigation,
*Dnes*, stats toggle, Settings, Export menu.

**Year** — heatmap of 31 day-columns × 12 month-rows (~870 × 340 px, no
scrolling). Color only, with a hover tooltip giving type, hours, and note;
icons are illegible at this cell size. Weekends form diagonal recessed stripes.
Clicking a cell opens Day view for that date.

**Month** — Mon–Sun calendar, up to 6 week rows. Each cell shows the type icon,
label, hours, and a truncated note. Weekends and rest-day holidays are recessed,
with the holiday name printed in the cell.

**Day** — single-day editor: date and weekday header, holiday name if any, type
picker as a row of icon buttons, hours input, note textarea, prev/next arrows.

Icons are inline Lucide SVG tinted with the type color — sharper than emoji,
consistent in weight, and correct in dark mode. Keyboard: arrow keys move the
date, `1`–`6` set the type, `Esc` steps up a view level.

Theme follows `prefers-color-scheme` with a manual override in Settings.

## 8. Stats, export, import

**Stats panel** — a single `GROUP BY type_code` over the current view's date
range: days and hours per type, plus total worked hours (types with
`counts_as_work = 1`).

**Backup** — `sqlite3_js_db_export()` produces the raw database bytes, offered
as `work-diary-YYYY-MM-DD.sqlite` via an object-URL download. A successful
export writes `setting.last_backup_at`; Settings shows that date and warns once
it is more than 30 days old, because OPFS lives inside the browser profile.

**Restore** — file picker, then overwrite the OPFS database, followed by a page
reload so the worker reopens the new file. Destructive, so it is behind a
confirm dialog naming the current row count.

**CSV** — date range → `day;weekday;type;hours;note`, semicolon-separated with a
UTF-8 BOM so Excel opens it correctly with Slovak locale settings.

## 9. Packaging

Vite, TypeScript strict, three entry points: `diary.html`, `db.worker.ts`,
`service-worker.ts`. `sqlite3.wasm` is copied as a static asset.

```json
{
  "manifest_version": 3,
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  },
  "permissions": [],
  "host_permissions": []
}
```

No permissions, no host access, no content scripts, no network requests. The
service worker exists only to open `diary.html` in a tab on toolbar click.
Distribution is load-unpacked from `dist/`.

## 10. Project structure

```
src/
  manifest.json
  diary.html
  ui/            toolbar, year-view, month-view, day-view, stats, settings
  db/            worker.ts, rpc.ts, schema.sql, migrations.ts, repository.ts
  domain/        dates.ts, easter.ts, holidays-sk.ts, day-types.ts,
                 workdays.ts, stats.ts, csv.ts
  background/    service-worker.ts
tests/
docs/superpowers/specs/
```

## 11. Testing

Test-driven, with `domain/` covered first because it is pure:

- Easter for a table of known years; Good Friday and Easter Monday offsets.
- Holiday seeding for 2024, 2025, 2026 against the table in §5.
- Workday enumeration: leap years, month boundaries, year boundaries.
- Auto-fill idempotency: running twice changes nothing; a user edit survives.
- Stats aggregation and CSV formatting, including the BOM and Slovak diacritics.
- Date helpers proven immune to timezone and DST shifts.

The `db/` layer is tested against real `sqlite-wasm` running in Node on the
in-memory VFS, exercising the same SQL as production. OPFS behavior itself is
covered by a manual smoke checklist (write, reload extension, read back,
restart browser, read back).

## 12. Risks

| Risk | Mitigation |
|---|---|
| OPFS + sahpool unusable in `chrome-extension://` | Implementation task #1 is a spike proving write → reload → read before any UI exists. Fallback is §3.3. |
| Holiday law changes again | Holidays are editable data, not code. |
| Clearing browser data wipes OPFS | Backup export shipped in v1; Settings shows the last backup date and nags after 30 days. |
| Sources disagree on 2026 rest days | Uncertain rows flagged in Settings for user confirmation. |
