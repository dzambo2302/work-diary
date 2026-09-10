# Pracovný denník

[![CI](https://github.com/dzambo2302/work-diary/actions/workflows/ci.yml/badge.svg)](https://github.com/dzambo2302/work-diary/actions/workflows/ci.yml)
[![Release](https://github.com/dzambo2302/work-diary/actions/workflows/release.yml/badge.svg)](https://github.com/dzambo2302/work-diary/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/dzambo2302/work-diary)](https://github.com/dzambo2302/work-diary/releases/latest)

A personal work diary as a Chrome/Edge extension. Every Slovak working day is
pre-filled with a default type and a default 6:00–14:30 shift; you only touch
the exceptions —
vacation, sick days, doctor appointments, work travel, and the split between
office work and home office.

Data lives in a real SQLite database compiled to WebAssembly and stored in the
browser's Origin Private File System, so aggregation, typed columns and
file-level backup all come for free. The UI is Slovak throughout.

**Download:** grab `setup.ps1` and the latest `.zip` from
[Releases](https://github.com/dzambo2302/work-diary/releases/latest) into the
same folder and run `.\setup.ps1` — see [Install](#install).

## Build

```bash
npm install
npm run build     # tsc --noEmit && vite build -> dist/
npm test          # 126 unit tests
```

## Package

```bash
npm run package     # build + zip -> artifacts/work-diary-<version>.zip
```

The archive has `manifest.json` at its root, so it is ready for the Chrome Web
Store or for *Load unpacked* after extracting. `scripts/setup.ps1` is copied
next to it, and both are attached to every GitHub Release.

## Install

Chrome and Edge take an extension only from their web stores or as an unpacked
folder — a `.crx` dragged onto the extensions page has been refused since Chrome
33 — so installing means pointing the browser at a folder that stays put.

### With the setup script

```powershell
.\setup.ps1                 # install, then open chrome://extensions
.\setup.ps1 -Browser both   # ...or open both browsers
.\setup.ps1 -Uninstall      # remove it again
```

It finds the extension next to itself, in a sibling `work-diary-*.zip`, or in
`dist/`; copies it to `%LOCALAPPDATA%\WorkDiary\extension`; puts that path on
the clipboard; and opens the extensions page. Then, once: **Developer mode** on,
**Load unpacked**, paste the path.

No admin rights and nothing in the registry. `-Destination` puts it elsewhere.

### By hand

1. Extract the release `.zip` (or run `npm run build`, which writes `dist/`)
2. Open `chrome://extensions` — on Edge, `edge://extensions`
3. Turn on **Developer mode** (Edge: bottom-left toggle)
4. **Load unpacked** → select the folder holding `manifest.json` directly
5. Click the toolbar icon to open the diary in a tab

Either way the folder has to stay where it is: the browser reads it from that
path at every start, and deleting it uninstalls the extension. Because this is
not a Web Store install, Chrome asks about *developer mode extensions* on every
start.

The extension requests **no permissions**, has no host access, no content
scripts, and makes no network requests.

## Views

| View | What it shows |
|---|---|
| **Rok** | The whole year as a heatmap, 31 day columns × 12 month rows, coloured by day type |
| **Mesiac** | A Mon–Sun calendar with icon, type, hours and note in each cell |
| **Deň** | A single-day editor — type, start and end time, note |

A day is recorded as a shift. The hours follow from the two times: the span
minus an unpaid break once the shift passes six hours, so the default 6:00–14:30
counts as 8 h. A shift whose end is before its start runs past midnight.

The break defaults to 30 minutes and is set in **Nastavenia → Prestávka (min)**.
Changing it recomputes the hours of every day already recorded, so the stored
total never disagrees with the two times beside it. The six-hour threshold that
triggers the break is the Labour Code's, and is not configurable.

Keyboard: `←` / `→` move by day, month or year depending on the view; `1`–`6`
set the day type in Deň view; `Esc` steps up a level.

The sun/moon button in the toolbar toggles light and dark. **Nastavenia →
Vzhľad** additionally offers *Podľa systému*, which follows the OS setting. The
choice is stored in the database, so it survives reloads.

## Fond pracovného času and nadčas

**Štatistika** opens over whatever period is on screen — a month or a whole year
— and leads with the balance:

| Row | What it is |
|---|---|
| **Fond pracovného času** | Working days in the period × the contracted day. Mon–Fri, minus the rest days in the holiday table, so your own corrections there govern it |
| **Odpracované** | Hours actually worked: kancelária, home office and pracovná cesta, at their real shift length |
| **Náhrady** | Dovolenka, PN and lekár, each credited a whole contracted day whatever the shift says — a two-hour visit to the doctor still covers the day |
| **Nadčas** / **Chýba do fondu** | What is credited, minus the fond |

The contracted day is **Nastavenia → Denný úväzok (h)**, 8 by default. It is
deliberately separate from the default shift: if your shift is 8,5 h and your
úväzok is 8, every day is half an hour of overtime, which is the point.

Work on a Saturday or on a rest day adds to what is credited while adding
nothing to the fond, so it lands in nadčas whole. A working day with no entry
credits nothing and shows as a shortfall.

Because the diary pre-fills every working day of the year with the default
shift, the figure for a month still running is a forecast. A second block gives
the same figures **k dnešku** — up to and including today — which is the number
that has actually happened.

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

## CI

- **CI** (`.github/workflows/ci.yml`) runs on every pull request and on pushes
  to any branch except `main`: unit tests, typecheck, build, and it uploads the
  packaged extension as a downloadable artifact.
- **Release** (`.github/workflows/release.yml`) runs on every push to `main`.
  Tests gate it; if they pass it publishes a GitHub Release with the `.zip`
  attached, versioned `<major>.<minor>.<run-number>` so every build is uniquely
  installable.

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
