# Pracovný denník

A personal work diary as a Chrome/Edge extension. Every Slovak working day is
pre-filled with a default type and 8 hours; you only touch the exceptions —
vacation, sick days, doctor appointments, work travel, and the split between
office work and home office.

Data lives in a real SQLite database compiled to WebAssembly and stored in the
browser's Origin Private File System, so aggregation, typed columns and
file-level backup all come for free. The UI is Slovak throughout.

## Build

```bash
npm install
npm run build     # tsc --noEmit && vite build -> dist/
npm test          # 88 unit tests
```

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Click the toolbar icon to open the diary in a tab

The extension requests **no permissions**, has no host access, no content
scripts, and makes no network requests.

## Views

| View | What it shows |
|---|---|
| **Rok** | The whole year as a heatmap, 31 day columns × 12 month rows, coloured by day type |
| **Mesiac** | A Mon–Sun calendar with icon, type, hours and note in each cell |
| **Deň** | A single-day editor — type, hours, note |

Keyboard: `←` / `→` move by day, month or year depending on the view; `1`–`6`
set the day type in Deň view; `Esc` steps up a level.

The sun/moon button in the toolbar toggles light and dark. **Nastavenia →
Vzhľad** additionally offers *Podľa systému*, which follows the OS setting. The
choice is stored in the database, so it survives reloads.

## Where the data lives — and how to not lose it

The database is stored in OPFS **inside your browser profile**. Clearing browser
data for the extension, deleting the profile, or moving to another machine will
destroy it. There is no server and no sync.

So: use **Export → Záloha databázy (.sqlite)** regularly. The panel shows the
date of your last backup and warns once it is more than 30 days old. The file it
produces is an ordinary SQLite database — open it in any SQLite viewer.
**Obnoviť zo zálohy** restores one, replacing everything.

**Export do CSV** writes a date range as semicolon-separated UTF-8 with a BOM
and a decimal comma, so Slovak-locale Excel opens it correctly.

## Slovak holidays

Slovak law distinguishes a *štátny sviatok* from a *deň pracovného pokoja*, and
the two have come apart: 1 September stopped being a rest day in 2024, and
several days are conditional per year under § 4b of zák. 241/1993. Public
sources disagree about some 2026 dates.

The app therefore does **not** compute rest days from a fixed rule. It seeds a
concrete holiday table for each year you open — only Easter is calculated — and
any row can be corrected in **Nastavenia**. Days that are legally uncertain for
that year sort to the top of the list with an *Overte platnosť* badge. If the
law changes again, fix a row; you do not need a new build.

## Layout

```
src/domain/    pure logic: dates, Easter, holidays, workdays, stats, CSV
src/db/        schema, repository, the SQLite Web Worker and its typed RPC
src/ui/        strings, router, toolbar, the three views, panels
tests/         unit tests for domain and db (real sqlite-wasm, in-memory VFS)
docs/          design spec, implementation plan, manual QA checklist
```

`src/domain/` never imports from `db/` or `ui/`, and all Slovak UI copy lives in
`src/ui/strings.ts`.
