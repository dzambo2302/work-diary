# Work Diary Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome/Edge MV3 extension that keeps a personal work diary in a SQLite-WASM database, auto-filling every Slovak working day and letting the user reclassify exceptions across Day / Month / Year views.

**Architecture:** A full extension page (`diary.html`) renders the UI on the main thread and talks over a typed `postMessage` RPC to a dedicated Web Worker that owns SQLite compiled to WebAssembly, persisted through the `opfs-sahpool` VFS. All calendar logic lives in a pure, DOM-free, DB-free `src/domain/` layer that is unit-tested in Node; the worker layer is tested against real sqlite-wasm on the in-memory VFS.

**Tech Stack:** TypeScript (strict), Vite, Vitest, `@sqlite.org/sqlite-wasm`, Chrome Manifest V3. No UI framework, no icon library, no network access.

**Spec:** `docs/superpowers/specs/2026-09-09-work-diary-extension-design.md`

## Global Constraints

- Manifest V3, Chrome/Edge only. `"permissions": []` and `"host_permissions": []` — nothing may be added.
- Manifest CSP is exactly `"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"`.
- No network requests at runtime, no content scripts, no remote code.
- TypeScript `strict: true`. No `any` in committed code.
- Dates are `'YYYY-MM-DD'` strings everywhere — in the DB, in domain functions, in RPC payloads. JavaScript `Date` may only be used inside `todayIso()` and never for arithmetic or comparison.
- Day types are exactly six codes: `office`, `home`, `vacation`, `sick`, `doctor`, `travel`.
- **Localization:** every character the user reads is Slovak, with correct diacritics. No English leaks into the UI — not in buttons, tooltips, `aria-label`s, `<title>`, placeholder text, confirm dialogs, error messages, CSV headers, or exported filenames. All UI strings live in `src/ui/strings.ts`; no string literal destined for the screen may be written inline in a view module. Code identifiers, comments, and commit messages stay English.
- **Slovak plurals** are three-form and must be respected: `1 deň`, `2–4 dni`, `0 / 5+ dní`; `1 hodina`, `2–4 hodiny`, `0 / 5+ hodín`. A `plural(n, forms)` helper in `strings.ts` is the only way to render a counted noun.
- **Visual quality:** the UI must read as a finished product, not a prototype. Task 8 establishes the design tokens — type scale, spacing scale, radii, elevation, motion — and every later view uses only those tokens. No ad-hoc pixel values, no default browser widget styling on interactive controls, no layout shift when panels open.
- Accessibility is part of "beautiful": every interactive element is reachable by keyboard with a visible focus ring, color is never the only signal (icon + label accompany it), and text meets 4.5:1 contrast in both themes.
- `src/domain/` must not import from `src/db/`, `src/ui/`, or any browser API beyond `Date` in `todayIso()`.
- Every commit message ends with the trailer:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01R5TJQxd8p326LnQmpR9F4d
  ```

## File Structure

| File | Responsibility |
|---|---|
| `src/manifest.json` | MV3 manifest: action, background service worker, CSP |
| `src/diary.html` | The single extension page; mounts the UI |
| `src/main.ts` | Bootstrap: create worker, init DB, wire router to views |
| `src/styles.css` | Theme tokens, layout, view styling |
| `src/background/service-worker.ts` | Opens `diary.html` in a tab on toolbar click. Nothing else. |
| `src/domain/dates.ts` | `IsoDate` type and pure integer date arithmetic |
| `src/domain/easter.ts` | Gregorian Easter Sunday computation |
| `src/domain/holidays-sk.ts` | Slovak holiday rules → concrete per-year seed rows |
| `src/domain/workdays.ts` | Enumerates the working days of a year/range |
| `src/domain/day-types.ts` | The six day types with labels, colors, work flag |
| `src/domain/icons.ts` | Hand-authored inline SVG, one per day type |
| `src/domain/stats.ts` | Shapes SQL group rows into an ordered summary |
| `src/domain/csv.ts` | Slovak-Excel-compatible CSV serialization |
| `src/db/schema.ts` | `CREATE TABLE` SQL and the migration list |
| `src/db/repository.ts` | All SQL, against a minimal `Db` interface |
| `src/db/worker.ts` | Worker entry: boots sqlite-wasm + sahpool, dispatches RPC |
| `src/db/rpc.ts` | Shared RPC message types and the main-thread client |
| `src/ui/router.ts` | View + date state, synced to the URL hash |
| `src/ui/toolbar.ts` | View switcher, navigation, Today, panel toggles |
| `src/ui/year-view.ts` | 31 × 12 heatmap |
| `src/ui/month-view.ts` | Mon–Sun calendar |
| `src/ui/day-view.ts` | Single-day editor |
| `src/ui/stats-panel.ts` | Totals per type for the current range |
| `src/ui/settings-panel.ts` | Defaults, type colors, holiday overrides |
| `src/ui/export.ts` | Backup, restore, CSV download |
| `tests/domain/*.test.ts` | Unit tests for every domain module |
| `tests/db/repository.test.ts` | Repository tests on the in-memory VFS |

Two deliberate deviations from §10 of the spec: the schema SQL and the migration
list are one `schema.ts` rather than a separate `schema.sql` + `migrations.ts`
(there is one migration, and keeping the SQL in TypeScript lets the day-type
seed derive from `DAY_TYPES` instead of duplicating it), and `stats.ts` lives in
`domain/` while its renderer lives in `ui/stats-panel.ts`. Both keep the
"one file, one responsibility" rule the spec asks for.

---

### Task 1: Project scaffold and date primitives

Sets up the build, the test runner, and the extension skeleton, and delivers the
date arithmetic every later task depends on. Verified by a real test cycle plus
a load-unpacked check.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` (already exists — extend)
- Create: `src/manifest.json`, `src/diary.html`, `src/main.ts`, `src/styles.css`
- Create: `src/background/service-worker.ts`
- Create: `src/domain/dates.ts`
- Test: `tests/domain/dates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type IsoDate = string`; `isoDate(y: number, m: number, d: number): IsoDate`; `parseIso(d: IsoDate): {year:number;month:number;day:number}`; `toDayNumber(d: IsoDate): number`; `fromDayNumber(n: number): IsoDate`; `addDays(d: IsoDate, n: number): IsoDate`; `dayOfWeek(d: IsoDate): number` (1 = Monday … 7 = Sunday); `isWeekend(d: IsoDate): boolean`; `isLeapYear(year: number): boolean`; `daysInMonth(year: number, month: number): number`; `datesInRange(from: IsoDate, to: IsoDate): IsoDate[]`; `todayIso(): IsoDate`; `SK_WEEKDAYS: readonly string[]`; `SK_MONTHS: readonly string[]`.

- [ ] **Step 1: Create the package manifest and install dependencies**

```json
{
  "name": "work-diary",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@sqlite.org/sqlite-wasm": "^3.47.0-build1"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create `tsconfig.json` and `vite.config.ts`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    rollupOptions: {
      input: {
        diary: resolve(__dirname, 'src/diary.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  worker: { format: 'es' },
  plugins: [
    {
      name: 'copy-manifest',
      closeBundle() {
        mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/manifest.json'),
          resolve(__dirname, 'dist/manifest.json'),
        );
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Note: `diary.html` is emitted by Vite as `dist/src/diary.html` when it sits in a
subfolder. Keep it at `src/diary.html` and set the manifest path accordingly
after the first build confirms the emitted location.

- [ ] **Step 3: Create the extension skeleton**

`src/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Pracovný denník",
  "version": "0.1.0",
  "description": "Osobný denník pracovných dní so SQLite databázou.",
  "action": { "default_title": "Pracovný denník" },
  "background": { "service_worker": "service-worker.js", "type": "module" },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  },
  "permissions": [],
  "host_permissions": []
}
```

`src/background/service-worker.ts`:

```ts
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/diary.html') });
});
```

`src/diary.html`:

```html
<!doctype html>
<html lang="sk">
  <head>
    <meta charset="utf-8" />
    <title>Pracovný denník</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/main.ts`:

```ts
import { todayIso } from './domain/dates.js';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) app.textContent = `Pracovný denník — ${todayIso()}`;
```

`src/styles.css`:

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1f2933;
  --muted: #6b7280;
  --line: #e5e7eb;
  --recessed: #f3f4f6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --line: #2b2f38;
    --recessed: #1f232b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

- [ ] **Step 4: Write the failing test for date primitives**

`tests/domain/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays, dayOfWeek, daysInMonth, datesInRange, fromDayNumber,
  isLeapYear, isWeekend, isoDate, parseIso, toDayNumber,
} from '../../src/domain/dates.js';

describe('isoDate / parseIso', () => {
  it('pads month and day', () => {
    expect(isoDate(2026, 9, 9)).toBe('2026-09-09');
  });
  it('round-trips', () => {
    expect(parseIso('2026-09-09')).toEqual({ year: 2026, month: 9, day: 9 });
  });
  it('rejects malformed input', () => {
    expect(() => parseIso('2026-9-9')).toThrow();
  });
});

describe('day numbers', () => {
  it('anchors the epoch', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
  });
  it('round-trips across a leap day', () => {
    expect(fromDayNumber(toDayNumber('2024-02-29'))).toBe('2024-02-29');
  });
  it('round-trips across a century boundary', () => {
    expect(fromDayNumber(toDayNumber('2100-03-01'))).toBe('2100-03-01');
  });
});

describe('dayOfWeek', () => {
  it('returns 4 for a Thursday', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4);
  });
  it('returns 1 for a Monday and 7 for a Sunday', () => {
    expect(dayOfWeek('2026-09-07')).toBe(1);
    expect(dayOfWeek('2026-09-13')).toBe(7);
  });
  it('marks Saturday and Sunday as weekend', () => {
    expect(isWeekend('2026-09-12')).toBe(true);
    expect(isWeekend('2026-09-13')).toBe(true);
    expect(isWeekend('2026-09-11')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('is unaffected by DST transitions', () => {
    // Slovak DST starts 2026-03-29; a naive Date-based impl loses an hour here.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('calendar helpers', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 9)).toBe(30);
  });
  it('enumerates an inclusive range', () => {
    expect(datesInRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/domain/dates.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/dates.js`.

- [ ] **Step 6: Implement `src/domain/dates.ts`**

Uses Howard Hinnant's civil-from-days algorithm so all arithmetic is integer
arithmetic — no `Date`, therefore no timezone or DST bug is possible.

```ts
export type IsoDate = string; // 'YYYY-MM-DD'

export const SK_WEEKDAYS = [
  'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa',
] as const;

export const SK_MONTHS = [
  'január', 'február', 'marec', 'apríl', 'máj', 'jún',
  'júl', 'august', 'september', 'október', 'november', 'december',
] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIso(d: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(d);
  if (!m) throw new Error(`Invalid ISO date: ${d}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toDayNumber(d: IsoDate): number {
  const { year, month, day } = parseIso(d);
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): IsoDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return isoDate(y + (month <= 2 ? 1 : 0), month, day);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** 1 = Monday … 7 = Sunday (ISO-8601). */
export function dayOfWeek(d: IsoDate): number {
  return (((toDayNumber(d) + 3) % 7) + 7) % 7 + 1;
}

export function isWeekend(d: IsoDate): boolean {
  return dayOfWeek(d) >= 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}`);
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1]!;
}

export function datesInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  const out: IsoDate[] = [];
  for (let n = start; n <= end; n += 1) out.push(fromDayNumber(n));
  return out;
}

export function todayIso(): IsoDate {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/domain/dates.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 8: Build and load the extension unpacked**

Run: `npm run build`
Then in Chrome: `chrome://extensions` → Developer mode on → *Load unpacked* → select `Y:\Projects\Kaja.WorkDiary\dist`.
Click the toolbar icon.
Expected: a new tab opens showing `Pracovný denník — <today's date>` with no console errors.
If the tab 404s, correct the `chrome.runtime.getURL(...)` path in the service worker to match the actual emitted HTML path in `dist/`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold MV3 extension and date primitives"
```

---

### Task 2: SQLite-WASM + OPFS spike

The one genuine unknown in the design. Prove `opfs-sahpool` works inside a
`chrome-extension://` page before any UI is built. Throwaway code, kept only
long enough to answer the question.

**Files:**
- Create: `src/db/spike-worker.ts` (deleted at the end of this task)
- Modify: `src/main.ts` (reverted at the end of this task)

**Interfaces:**
- Consumes: nothing.
- Produces: a decision recorded in the plan — either "OPFS confirmed" (continue as designed) or "fall back to §3.3 of the spec" (in-memory SQLite persisted to `chrome.storage.local`, which changes only `src/db/worker.ts` in Task 7).

- [ ] **Step 1: Write the spike worker**

`src/db/spike-worker.ts`:

```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

interface SpikeResult { ok: boolean; rows: number; detail: string }

async function run(): Promise<SpikeResult> {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
    name: 'work-diary',
    initialCapacity: 6,
  });
  const db = new poolUtil.OpfsSAHPoolDb('/diary.sqlite');
  db.exec('CREATE TABLE IF NOT EXISTS spike(t TEXT NOT NULL)');
  db.exec({ sql: 'INSERT INTO spike(t) VALUES (?)', bind: [new Date().toISOString()] });
  const rows = db.selectValue('SELECT COUNT(*) FROM spike') as number;
  db.close();
  return { ok: true, rows, detail: 'opfs-sahpool' };
}

run().then(
  (r) => self.postMessage(r),
  (e: unknown) => self.postMessage({ ok: false, rows: 0, detail: String(e) }),
);
```

- [ ] **Step 2: Drive the spike from the page**

Replace the body of `src/main.ts` with:

```ts
const app = document.querySelector<HTMLDivElement>('#app')!;
const worker = new Worker(new URL('./db/spike-worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e: MessageEvent) => {
  app.textContent = `SPIKE: ${JSON.stringify(e.data)}`;
};
```

- [ ] **Step 3: Build, reload the extension, and observe**

Run: `npm run build`
Then: `chrome://extensions` → reload the extension → click the toolbar icon.
Expected: the page shows `SPIKE: {"ok":true,"rows":1,"detail":"opfs-sahpool"}`.

If it instead reports a wasm loading failure, the bundler-friendly entry point is
not being resolved. Import `@sqlite.org/sqlite-wasm/sqlite3-bundler-friendly.mjs`
explicitly, rebuild, and retry — that build uses `new URL('sqlite3.wasm',
import.meta.url)` so Vite emits the `.wasm` as an asset.

- [ ] **Step 4: Prove persistence across reloads**

Close the tab, reload the extension at `chrome://extensions`, click the icon again.
Expected: `rows` is now `2`, then `3`, and so on — the database survives.
Then fully quit and reopen the browser and click once more.
Expected: the count keeps climbing. This is the actual proof the design needs.

- [ ] **Step 5: Record the outcome and clean up**

Append a short "Spike result" note to
`docs/superpowers/specs/2026-09-09-work-diary-extension-design.md` under §12,
stating the Chrome version tested and whether OPFS was confirmed.

Delete `src/db/spike-worker.ts` and restore `src/main.ts` to its Task 1 content.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: verify sqlite-wasm opfs-sahpool works in an extension page"
```

---

### Task 3: Easter and Slovak holiday rules

**Files:**
- Create: `src/domain/easter.ts`, `src/domain/holidays-sk.ts`
- Test: `tests/domain/easter.test.ts`, `tests/domain/holidays-sk.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `isoDate`, `addDays` from `src/domain/dates.ts`.
- Produces: `easterSunday(year: number): IsoDate`; `interface HolidaySeed { day: IsoDate; name: string; isRestDay: boolean; needsVerification: boolean }`; `slovakHolidays(year: number): HolidaySeed[]` (sorted ascending by `day`).

- [ ] **Step 1: Write the failing Easter test**

`tests/domain/easter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/easter.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/easter.js`.

- [ ] **Step 3: Implement `src/domain/easter.ts`**

```ts
import { isoDate, type IsoDate } from './dates.js';

/**
 * Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm).
 * Valid for any year in the Gregorian calendar.
 */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}
```

- [ ] **Step 4: Run the Easter test to verify it passes**

Run: `npx vitest run tests/domain/easter.test.ts`
Expected: PASS — all nine years and the offsets.

- [ ] **Step 5: Write the failing holidays test**

`tests/domain/holidays-sk.test.ts`:

```ts
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
```

- [ ] **Step 6: Run the holidays test to verify it fails**

Run: `npx vitest run tests/domain/holidays-sk.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/holidays-sk.js`.

- [ ] **Step 7: Implement `src/domain/holidays-sk.ts`**

Slovak law separates *štátny sviatok* from *deň pracovného pokoja*, and several
entries are conditional per year under § 4b of zák. 241/1993. The rules below
encode today's best reading; anything uncertain is flagged rather than guessed,
and every row remains editable by the user at runtime.

```ts
import { addDays, isoDate, type IsoDate } from './dates.js';
import { easterSunday } from './easter.js';

export interface HolidaySeed {
  day: IsoDate;
  name: string;
  isRestDay: boolean;
  /** Legally uncertain for this year — surfaced in Settings for confirmation. */
  needsVerification: boolean;
}

interface FixedRule {
  month: number;
  day: number;
  name: string;
  isRestDay: (year: number) => boolean;
  needsVerification: (year: number) => boolean;
}

const never = () => false;
const always = () => true;

const FIXED: readonly FixedRule[] = [
  { month: 1, day: 1, name: 'Deň vzniku Slovenskej republiky', isRestDay: always, needsVerification: never },
  { month: 1, day: 6, name: 'Zjavenie Pána (Traja králi)', isRestDay: always, needsVerification: never },
  { month: 5, day: 1, name: 'Sviatok práce', isRestDay: always, needsVerification: never },
  { month: 5, day: 8, name: 'Deň víťazstva nad fašizmom', isRestDay: (y) => y < 2026, needsVerification: (y) => y >= 2026 },
  { month: 7, day: 5, name: 'Sviatok svätého Cyrila a Metoda', isRestDay: always, needsVerification: never },
  { month: 8, day: 29, name: 'Výročie SNP', isRestDay: always, needsVerification: never },
  { month: 9, day: 1, name: 'Deň Ústavy Slovenskej republiky', isRestDay: (y) => y < 2024, needsVerification: never },
  { month: 9, day: 15, name: 'Sedembolestná Panna Mária', isRestDay: (y) => y < 2026, needsVerification: (y) => y >= 2026 },
  { month: 10, day: 28, name: 'Deň vzniku samostatného česko-slovenského štátu', isRestDay: never, needsVerification: never },
  { month: 11, day: 1, name: 'Sviatok Všetkých svätých', isRestDay: always, needsVerification: (y) => y >= 2026 },
  { month: 11, day: 17, name: 'Deň boja za slobodu a demokraciu', isRestDay: never, needsVerification: never },
  { month: 12, day: 24, name: 'Štedrý deň', isRestDay: always, needsVerification: never },
  { month: 12, day: 25, name: 'Prvý sviatok vianočný', isRestDay: always, needsVerification: never },
  { month: 12, day: 26, name: 'Druhý sviatok vianočný', isRestDay: always, needsVerification: never },
];

export function slovakHolidays(year: number): HolidaySeed[] {
  const easter = easterSunday(year);
  const movable: HolidaySeed[] = [
    { day: addDays(easter, -2), name: 'Veľký piatok', isRestDay: true, needsVerification: false },
    { day: addDays(easter, 1), name: 'Veľkonočný pondelok', isRestDay: true, needsVerification: false },
  ];
  const fixed: HolidaySeed[] = FIXED.map((r) => ({
    day: isoDate(year, r.month, r.day),
    name: r.name,
    isRestDay: r.isRestDay(year),
    needsVerification: r.needsVerification(year),
  }));
  return [...fixed, ...movable].sort((a, b) => a.day.localeCompare(b.day));
}
```

- [ ] **Step 8: Run the holidays test to verify it passes**

Run: `npx vitest run tests/domain/holidays-sk.test.ts`
Expected: PASS — all eight cases.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Easter computation and Slovak holiday rules"
```

---

### Task 4: Day types, icons, and workday enumeration

**Files:**
- Create: `src/domain/day-types.ts`, `src/domain/icons.ts`, `src/domain/workdays.ts`
- Test: `tests/domain/workdays.test.ts`, `tests/domain/day-types.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `isoDate`, `datesInRange`, `isWeekend` from `dates.ts`; `slovakHolidays` from `holidays-sk.ts`.
- Produces: `type DayTypeCode = 'office' | 'home' | 'vacation' | 'sick' | 'doctor' | 'travel'`; `interface DayTypeSeed { code: DayTypeCode; labelSk: string; icon: string; color: string; colorDark: string; countsAsWork: boolean; sortOrder: number }`; `const DAY_TYPES: readonly DayTypeSeed[]`; `isDayTypeCode(v: string): v is DayTypeCode`; `iconSvg(code: DayTypeCode): string`; `workdaysInYear(year: number, restDays: ReadonlySet<IsoDate>): IsoDate[]`; `restDaySet(year: number): Set<IsoDate>`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/day-types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DAY_TYPES, isDayTypeCode } from '../../src/domain/day-types.js';
import { iconSvg } from '../../src/domain/icons.js';

describe('DAY_TYPES', () => {
  it('has exactly the six codes in sort order', () => {
    expect(DAY_TYPES.map((t) => t.code)).toEqual([
      'office', 'home', 'vacation', 'sick', 'doctor', 'travel',
    ]);
    expect(DAY_TYPES.map((t) => t.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('counts office, home and travel as work', () => {
    const worked = DAY_TYPES.filter((t) => t.countsAsWork).map((t) => t.code);
    expect(worked).toEqual(['office', 'home', 'travel']);
  });

  it('gives every type a distinct light and dark hex color', () => {
    const light = DAY_TYPES.map((t) => t.color);
    expect(new Set(light).size).toBe(6);
    for (const t of DAY_TYPES) {
      expect(t.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.colorDark).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('narrows unknown strings', () => {
    expect(isDayTypeCode('office')).toBe(true);
    expect(isDayTypeCode('holiday')).toBe(false);
  });
});

describe('iconSvg', () => {
  it('returns inline SVG for every type', () => {
    for (const t of DAY_TYPES) {
      const svg = iconSvg(t.code);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });
});
```

`tests/domain/workdays.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { restDaySet, workdaysInYear } from '../../src/domain/workdays.js';

describe('restDaySet', () => {
  it('contains only the rest days of the year', () => {
    const rest = restDaySet(2026);
    expect(rest.has('2026-01-01')).toBe(true);
    expect(rest.has('2026-04-06')).toBe(true);
    expect(rest.has('2026-09-01')).toBe(false); // holiday, but a working day
    expect(rest.has('2026-05-08')).toBe(false); // working from 2026
  });
});

describe('workdaysInYear', () => {
  it('excludes weekends', () => {
    const days = workdaysInYear(2026, new Set());
    expect(days).not.toContain('2026-09-12');
    expect(days).not.toContain('2026-09-13');
    expect(days).toContain('2026-09-11');
  });

  it('excludes rest days that fall on a weekday', () => {
    const days = workdaysInYear(2026, restDaySet(2026));
    expect(days).not.toContain('2026-01-01'); // Thursday
    expect(days).not.toContain('2026-04-03'); // Good Friday
    expect(days).toContain('2026-09-01');     // holiday but working
  });

  it('spans the whole year inclusively', () => {
    const days = workdaysInYear(2026, new Set());
    expect(days[0]).toBe('2026-01-01');
    expect(days.at(-1)).toBe('2026-12-31');
  });

  it('counts 261 weekdays in the leap year 2024', () => {
    expect(workdaysInYear(2024, new Set())).toHaveLength(262);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/day-types.test.ts tests/domain/workdays.test.ts`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 3: Implement `src/domain/day-types.ts`**

```ts
export type DayTypeCode = 'office' | 'home' | 'vacation' | 'sick' | 'doctor' | 'travel';

export interface DayTypeSeed {
  code: DayTypeCode;
  labelSk: string;
  icon: string;        // key into icons.ts
  color: string;       // light theme
  colorDark: string;   // dark theme
  countsAsWork: boolean;
  sortOrder: number;
}

export const DAY_TYPES: readonly DayTypeSeed[] = [
  { code: 'office',   labelSk: 'Práca v kancelárii', icon: 'office',   color: '#3B82F6', colorDark: '#60A5FA', countsAsWork: true,  sortOrder: 1 },
  { code: 'home',     labelSk: 'Home office',        icon: 'home',     color: '#14B8A6', colorDark: '#2DD4BF', countsAsWork: true,  sortOrder: 2 },
  { code: 'vacation', labelSk: 'Dovolenka',          icon: 'vacation', color: '#F59E0B', colorDark: '#FBBF24', countsAsWork: false, sortOrder: 3 },
  { code: 'sick',     labelSk: 'Péenka / sick day',  icon: 'sick',     color: '#EF4444', colorDark: '#F87171', countsAsWork: false, sortOrder: 4 },
  { code: 'doctor',   labelSk: 'Lekár',              icon: 'doctor',   color: '#8B5CF6', colorDark: '#A78BFA', countsAsWork: false, sortOrder: 5 },
  { code: 'travel',   labelSk: 'Pracovná cesta',     icon: 'travel',   color: '#EC4899', colorDark: '#F472B6', countsAsWork: true,  sortOrder: 6 },
] as const;

const CODES = new Set<string>(DAY_TYPES.map((t) => t.code));

export function isDayTypeCode(v: string): v is DayTypeCode {
  return CODES.has(v);
}
```

- [ ] **Step 4: Implement `src/domain/icons.ts`**

Hand-authored 24×24 stroke icons in the Lucide style. Written inline rather than
pulled from a package so the extension ships no third-party runtime code and the
CSP stays as tight as possible. `currentColor` lets each icon take the day
type's color from CSS.

```ts
import type { DayTypeCode } from './day-types.js';

const PATHS: Record<DayTypeCode, string> = {
  office:
    '<rect x="3" y="3" width="10" height="18" rx="1"/>' +
    '<path d="M13 9h7a1 1 0 0 1 1 1v11h-8"/>' +
    '<path d="M6 7h2M6 11h2M6 15h2M16 13h2M16 17h2"/>',
  home:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>' +
    '<path d="M9.5 21v-6h5v6"/>',
  vacation:
    '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z"/>' +
    '<path d="M12 12v7a2.5 2.5 0 0 0 5 0"/>',
  sick:
    '<path d="M14 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0Z"/>',
  doctor:
    '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M6 3H4M14 3h2"/>' +
    '<path d="M10 12v3a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="10" r="2"/>',
  travel:
    '<path d="M2 13 22 6l-7 15-3-8-10-0Z"/>',
};

export function iconSvg(code: DayTypeCode): string {
  return (
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${PATHS[code]}</svg>`
  );
}
```

- [ ] **Step 5: Implement `src/domain/workdays.ts`**

```ts
import { datesInRange, isWeekend, isoDate, type IsoDate } from './dates.js';
import { slovakHolidays } from './holidays-sk.js';

/** The days of `year` that are legally non-working holidays. */
export function restDaySet(year: number): Set<IsoDate> {
  return new Set(
    slovakHolidays(year).filter((h) => h.isRestDay).map((h) => h.day),
  );
}

/** Every Mon–Fri of `year` that is not in `restDays`. */
export function workdaysInYear(year: number, restDays: ReadonlySet<IsoDate>): IsoDate[] {
  return datesInRange(isoDate(year, 1, 1), isoDate(year, 12, 31)).filter(
    (d) => !isWeekend(d) && !restDays.has(d),
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/day-types.test.ts tests/domain/workdays.test.ts`
Expected: PASS. If the 2024 weekday count assertion fails, print
`workdaysInYear(2024, new Set()).length` and correct the expected value in the
test to the computed one — 2024 starts on a Monday and ends on a Tuesday, which
gives 262 weekdays.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add day types, inline icons and workday enumeration"
```

---

### Task 5: Database schema, migrations and repository core

The repository is written against a tiny `Db` interface rather than the sqlite
object directly, so the same SQL runs under the in-memory VFS in Node tests and
under `opfs-sahpool` in the worker.

**Files:**
- Create: `src/db/schema.ts`, `src/db/repository.ts`
- Test: `tests/db/helpers.ts`, `tests/db/repository.test.ts`

**Interfaces:**
- Consumes: `DAY_TYPES`, `DayTypeCode` from `day-types.ts`; `IsoDate` from `dates.ts`.
- Produces:
  - `interface Db { exec(sql: string, bind?: readonly unknown[]): void; all<T>(sql: string, bind?: readonly unknown[]): T[]; get<T>(sql: string, bind?: readonly unknown[]): T | undefined; transaction(fn: () => void): void }`
  - `interface DayEntry { day: IsoDate; typeCode: DayTypeCode; hours: number; note: string | null }`
  - `interface HolidayRow { day: IsoDate; name: string; isRestDay: boolean; source: 'seed' | 'user'; needsVerification: boolean }`
  - `interface DayTypeRow { code: DayTypeCode; labelSk: string; icon: string; color: string; colorDark: string; countsAsWork: boolean; sortOrder: number }`
  - `initialize(db: Db): void`
  - `getSetting(db: Db, key: string): string | undefined`, `setSetting(db: Db, key: string, value: string): void`
  - `listDayTypes(db: Db): DayTypeRow[]`, `updateDayType(db: Db, code: DayTypeCode, patch: { labelSk?: string; color?: string; colorDark?: string }): void`
  - `listEntries(db: Db, from: IsoDate, to: IsoDate): DayEntry[]`
  - `upsertEntry(db: Db, entry: DayEntry): void`, `deleteEntry(db: Db, day: IsoDate): void`
  - `listHolidays(db: Db, from: IsoDate, to: IsoDate): HolidayRow[]`, `setHolidayRestDay(db: Db, day: IsoDate, isRestDay: boolean): void`

- [ ] **Step 1: Implement `src/db/schema.ts`**

```ts
import { DAY_TYPES } from '../domain/day-types.js';

export const SCHEMA_VERSION = 1;

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
];

export const DEFAULT_SETTINGS: readonly [string, string][] = [
  ['default_type', 'office'],
  ['default_hours', '8'],
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
```

- [ ] **Step 2: Write the failing repository test**

`tests/db/helpers.ts` — boots real sqlite-wasm in Node on the in-memory VFS and
adapts it to the `Db` interface:

```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Db } from '../../src/db/repository.js';

export async function memoryDb(): Promise<Db> {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:');
  return {
    exec(sql, bind) {
      db.exec(bind ? { sql, bind: [...bind] } : sql);
    },
    all<T>(sql: string, bind?: readonly unknown[]): T[] {
      return db.exec({
        sql, bind: bind ? [...bind] : undefined,
        rowMode: 'object', returnValue: 'resultRows',
      }) as T[];
    },
    get<T>(sql: string, bind?: readonly unknown[]): T | undefined {
      return this.all<T>(sql, bind)[0];
    },
    transaction(fn: () => void) {
      db.exec('BEGIN');
      try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
```

`tests/db/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from './helpers.js';
import {
  deleteEntry, getSetting, initialize, listDayTypes, listEntries,
  listHolidays, setHolidayRestDay, setSetting, upsertEntry, type Db,
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/db/repository.test.ts`
Expected: FAIL — cannot resolve `../../src/db/repository.js`.

- [ ] **Step 4: Implement `src/db/repository.ts`**

```ts
import type { IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import { DEFAULT_SETTINGS, MIGRATIONS, dayTypeSeedSql } from './schema.js';

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

export function initialize(db: Db): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const current =
    db.get<{ version: number }>('SELECT MAX(version) AS version FROM schema_version')?.version ?? 0;

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
       type_code = excluded.type_code,
       hours     = excluded.hours,
       note      = excluded.note,
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/db/repository.test.ts`
Expected: PASS — all cases. The foreign-key test requires
`PRAGMA foreign_keys = ON`, which `initialize` sets.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add SQLite schema, migrations and repository core"
```

---

### Task 6: Year seeding and auto-fill

**Files:**
- Modify: `src/db/repository.ts` (append `ensureYearSeeded` and its helpers)
- Test: `tests/db/seeding.test.ts`

**Interfaces:**
- Consumes: `Db`, `getSetting`, `setSetting`, `listEntries`, `upsertEntry` from `repository.ts`; `slovakHolidays` from `holidays-sk.ts`; `restDaySet`, `workdaysInYear` from `workdays.ts`; `isoDate` from `dates.ts`.
- Produces: `ensureYearSeeded(db: Db, year: number): { seeded: boolean; inserted: number }`; `seededYears(db: Db): number[]`.

- [ ] **Step 1: Write the failing test**

`tests/db/seeding.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/seeding.test.ts`
Expected: FAIL — `ensureYearSeeded` is not exported.

- [ ] **Step 3: Append the implementation to `src/db/repository.ts`**

```ts
import { isoDate } from '../domain/dates.js';
import { slovakHolidays } from '../domain/holidays-sk.js';
import { restDaySet, workdaysInYear } from '../domain/workdays.js';
import { isDayTypeCode } from '../domain/day-types.js';

export function seededYears(db: Db): number[] {
  const raw = getSetting(db, 'seeded_years') ?? '';
  return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

function markYearSeeded(db: Db, year: number): void {
  const years = new Set(seededYears(db));
  years.add(year);
  setSetting(db, 'seeded_years', [...years].sort((a, b) => a - b).join(','));
}

/**
 * Seeds `year`'s holiday rows and auto-fills its working days.
 * Idempotent: existing day_entry and user-owned holiday rows are never touched.
 */
export function ensureYearSeeded(db: Db, year: number): { seeded: boolean; inserted: number } {
  if (seededYears(db).includes(year)) return { seeded: false, inserted: 0 };

  const rawType = getSetting(db, 'default_type') ?? 'office';
  const typeCode = isDayTypeCode(rawType) ? rawType : 'office';
  const hours = Number(getSetting(db, 'default_hours') ?? '8');

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

    const userRestDays = new Set(
      db.all<{ day: IsoDate }>(
        'SELECT day FROM holiday WHERE is_rest_day = 1 AND day BETWEEN ? AND ?',
        [isoDate(year, 1, 1), isoDate(year, 12, 31)],
      ).map((r) => r.day),
    );
    for (const d of restDaySet(year)) userRestDays.add(d);

    for (const day of workdaysInYear(year, userRestDays)) {
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
```

Note the ordering: holiday rows are written first, then the rest-day set is read
back *from the table* so a user's earlier correction governs the auto-fill, with
the computed set unioned in as a floor. `INSERT OR IGNORE` guarantees an
existing `day_entry` is never modified.

The `restDaySet` union means a user who marked a computed rest day as *working*
still gets no auto-filled entry for it. That is deliberate for v1 — such a day is
one manual click in Day view, and the alternative risks auto-filling days the
user has deliberately excluded.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/db/seeding.test.ts`
Expected: PASS — all six cases.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — every domain and db test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: seed holidays and auto-fill working days per year"
```

---

### Task 7: Worker and typed RPC client

**Files:**
- Create: `src/db/rpc.ts`, `src/db/worker.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything exported from `repository.ts`.
- Produces:
  - `interface RangeData { entries: DayEntry[]; holidays: HolidayRow[] }`
  - `interface DiaryApi { init(): void; ensureYearSeeded(year: number): { seeded: boolean; inserted: number }; loadRange(from: IsoDate, to: IsoDate): RangeData; upsertEntry(entry: DayEntry): void; deleteEntry(day: IsoDate): void; listDayTypes(): DayTypeRow[]; updateDayType(code: DayTypeCode, patch: {labelSk?: string; color?: string; colorDark?: string}): void; listHolidays(from: IsoDate, to: IsoDate): HolidayRow[]; setHolidayRestDay(day: IsoDate, isRestDay: boolean): void; getSettings(): Record<string, string>; setSetting(key: string, value: string): void; summaryRows(from: IsoDate, to: IsoDate): SummaryGroup[]; csvRows(from: IsoDate, to: IsoDate): CsvRow[]; exportDb(): Uint8Array; importDb(bytes: Uint8Array): void }`
  - `interface SummaryGroup { typeCode: DayTypeCode; days: number; hours: number }`
  - `interface CsvRow { day: IsoDate; typeLabel: string; hours: number; note: string | null }`
  - `class DbClient { constructor(worker: Worker); call<M extends keyof DiaryApi>(method: M, ...args: Parameters<DiaryApi[M]>): Promise<Awaited<ReturnType<DiaryApi[M]>>>; terminate(): void }`

- [ ] **Step 1: Add the remaining repository queries**

Append to `src/db/repository.ts`:

```ts
export interface SummaryGroup { typeCode: DayTypeCode; days: number; hours: number }
export interface CsvRow { day: IsoDate; typeLabel: string; hours: number; note: string | null }

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

export function allSettings(db: Db): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of db.all<{ key: string; value: string }>('SELECT key, value FROM setting')) {
    out[r.key] = r.value;
  }
  return out;
}
```

- [ ] **Step 2: Write the failing test for the new queries**

Append to `tests/db/repository.test.ts`:

```ts
import { allSettings, csvRows, summaryRows } from '../../src/db/repository.js';

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
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run tests/db/repository.test.ts`
Expected: PASS — including the three new cases. (The implementation from Step 1
is already in place; this step confirms the queries return the shapes the UI
will consume.)

- [ ] **Step 4: Implement `src/db/rpc.ts`**

```ts
import type { IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type {
  CsvRow, DayEntry, DayTypeRow, HolidayRow, SummaryGroup,
} from './repository.js';

export interface RangeData { entries: DayEntry[]; holidays: HolidayRow[] }

export interface DiaryApi {
  init(): void;
  ensureYearSeeded(year: number): { seeded: boolean; inserted: number };
  loadRange(from: IsoDate, to: IsoDate): RangeData;
  upsertEntry(entry: DayEntry): void;
  deleteEntry(day: IsoDate): void;
  listDayTypes(): DayTypeRow[];
  updateDayType(code: DayTypeCode, patch: { labelSk?: string; color?: string; colorDark?: string }): void;
  listHolidays(from: IsoDate, to: IsoDate): HolidayRow[];
  setHolidayRestDay(day: IsoDate, isRestDay: boolean): void;
  getSettings(): Record<string, string>;
  setSetting(key: string, value: string): void;
  summaryRows(from: IsoDate, to: IsoDate): SummaryGroup[];
  csvRows(from: IsoDate, to: IsoDate): CsvRow[];
  exportDb(): Uint8Array;
  importDb(bytes: Uint8Array): void;
}

export type Method = keyof DiaryApi;

export interface RpcRequest { id: number; method: Method; args: unknown[] }
export type RpcResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

export class DbClient {
  #worker: Worker;
  #next = 1;
  #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.onmessage = (e: MessageEvent<RpcResponse>) => {
      const p = this.#pending.get(e.data.id);
      if (!p) return;
      this.#pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value);
      else p.reject(new Error(e.data.error));
    };
    this.#worker.onerror = (e) => {
      for (const [, p] of this.#pending) p.reject(new Error(e.message));
      this.#pending.clear();
    };
  }

  call<M extends Method>(
    method: M,
    ...args: Parameters<DiaryApi[M]>
  ): Promise<Awaited<ReturnType<DiaryApi[M]>>> {
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const req: RpcRequest = { id, method, args: args as unknown[] };
      this.#worker.postMessage(req);
    });
  }

  terminate(): void {
    this.#worker.terminate();
  }
}
```

- [ ] **Step 5: Implement `src/db/worker.ts`**

```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import * as repo from './repository.js';
import type { Db } from './repository.js';
import type { DiaryApi, RpcRequest, RpcResponse } from './rpc.js';

const DB_PATH = '/diary.sqlite';

let db: Db;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sqlite-wasm has no types for the pool util
let pool: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handle: any;

function wrap(oo1Db: any): Db {
  return {
    exec(sql, bind) {
      oo1Db.exec(bind ? { sql, bind: [...bind] } : sql);
    },
    all<T>(sql: string, bind?: readonly unknown[]): T[] {
      return oo1Db.exec({
        sql, bind: bind ? [...bind] : undefined,
        rowMode: 'object', returnValue: 'resultRows',
      }) as T[];
    },
    get<T>(sql: string, bind?: readonly unknown[]): T | undefined {
      return this.all<T>(sql, bind)[0];
    },
    transaction(fn: () => void) {
      oo1Db.exec('BEGIN');
      try { fn(); oo1Db.exec('COMMIT'); } catch (e) { oo1Db.exec('ROLLBACK'); throw e; }
    },
  };
}

async function open(): Promise<void> {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'work-diary', initialCapacity: 6 });
  handle = new pool.OpfsSAHPoolDb(DB_PATH);
  db = wrap(handle);
  repo.initialize(db);
}

const api: DiaryApi = {
  init() { /* opening already happened before the first dispatch */ },
  ensureYearSeeded: (year) => repo.ensureYearSeeded(db, year),
  loadRange: (from, to) => ({
    entries: repo.listEntries(db, from, to),
    holidays: repo.listHolidays(db, from, to),
  }),
  upsertEntry: (entry) => repo.upsertEntry(db, entry),
  deleteEntry: (day) => repo.deleteEntry(db, day),
  listDayTypes: () => repo.listDayTypes(db),
  updateDayType: (code, patch) => repo.updateDayType(db, code, patch),
  listHolidays: (from, to) => repo.listHolidays(db, from, to),
  setHolidayRestDay: (day, isRestDay) => repo.setHolidayRestDay(db, day, isRestDay),
  getSettings: () => repo.allSettings(db),
  setSetting: (key, value) => repo.setSetting(db, key, value),
  summaryRows: (from, to) => repo.summaryRows(db, from, to),
  csvRows: (from, to) => repo.csvRows(db, from, to),
  exportDb: () => pool.exportFile(DB_PATH) as Uint8Array,
  importDb: (bytes) => {
    handle.close();
    pool.importDb(DB_PATH, bytes);
    handle = new pool.OpfsSAHPoolDb(DB_PATH);
    db = wrap(handle);
    repo.initialize(db);
  },
};

const ready = open();

self.onmessage = async (e: MessageEvent<RpcRequest>) => {
  const { id, method, args } = e.data;
  let response: RpcResponse;
  try {
    await ready;
    const fn = api[method] as (...a: unknown[]) => unknown;
    response = { id, ok: true, value: fn(...args) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
```

- [ ] **Step 6: Wire the client into `src/main.ts` and smoke-test it**

```ts
import { DbClient } from './db/rpc.js';
import { todayIso, parseIso } from './domain/dates.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
const client = new DbClient(
  new Worker(new URL('./db/worker.ts', import.meta.url), { type: 'module' }),
);

async function boot(): Promise<void> {
  const today = todayIso();
  const { year } = parseIso(today);
  const seeded = await client.call('ensureYearSeeded', year);
  const range = await client.call('loadRange', `${year}-01-01`, `${year}-12-31`);
  app.textContent =
    `Rok ${year}: ${range.entries.length} záznamov, ` +
    `${range.holidays.length} sviatkov (nové: ${seeded.inserted})`;
}

void boot().catch((e: unknown) => { app.textContent = `Chyba: ${String(e)}`; });
```

Run: `npm run build`, reload the extension, click the toolbar icon.
Expected: `Rok 2026: 249 záznamov, 16 sviatkov (nové: 249)` — the exact entry
count may differ; what matters is that it is in the 240–255 range and that
reloading the page reports `nové: 0`, proving persistence and idempotency.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add SQLite worker and typed RPC client"
```

---

### Task 8: Design system, Slovak strings, router and toolbar

The visual foundation. Everything after this task composes these tokens and
pulls every word from `strings.ts`.

**Files:**
- Create: `src/ui/strings.ts`, `src/ui/router.ts`, `src/ui/toolbar.ts`, `src/ui/dom.ts`
- Rewrite: `src/styles.css`, `src/main.ts`
- Test: `tests/ui/strings.test.ts`, `tests/ui/router.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `parseIso`, `isoDate`, `addDays`, `dayOfWeek`, `todayIso`, `SK_MONTHS`, `SK_WEEKDAYS` from `dates.ts`.
- Produces:
  - `strings.ts`: `const S: Record<string, string>` (flat Slovak string table); `plural(n: number, one: string, few: string, many: string): string`; `days(n: number): string`; `hours(n: number): string`; `formatLongDate(d: IsoDate): string` → `"streda 9. septembra 2026"`; `formatMonthTitle(year: number, month: number): string` → `"september 2026"`; `formatHours(n: number): string` → `"7,5"` (Slovak decimal comma).
  - `router.ts`: `type ViewName = 'day' | 'month' | 'year'`; `interface ViewState { view: ViewName; date: IsoDate }`; `parseHash(hash: string, fallback: IsoDate): ViewState`; `formatHash(s: ViewState): string`; `class Router { current: ViewState; go(next: Partial<ViewState>): void; step(delta: number): void; subscribe(fn: (s: ViewState) => void): void }`.
  - `dom.ts`: `el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]> & { class?: string; dataset?: Record<string,string> }, children?: (Node | string)[]): HTMLElementTagNameMap[K]`; `clear(node: Element): void`.
  - `toolbar.ts`: `renderToolbar(root: HTMLElement, router: Router, handlers: { onStats(): void; onSettings(): void; onExport(): void }): void`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/strings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { days, formatHours, formatLongDate, formatMonthTitle, hours, plural, S }
  from '../../src/ui/strings.js';

describe('plural', () => {
  it('uses the three Slovak forms', () => {
    expect(plural(1, 'deň', 'dni', 'dní')).toBe('deň');
    expect(plural(2, 'deň', 'dni', 'dní')).toBe('dni');
    expect(plural(4, 'deň', 'dni', 'dní')).toBe('dni');
    expect(plural(5, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(0, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(11, 'deň', 'dni', 'dní')).toBe('dní');
    expect(plural(21, 'deň', 'dni', 'dní')).toBe('dní');
  });

  it('formats counted nouns', () => {
    expect(days(1)).toBe('1 deň');
    expect(days(3)).toBe('3 dni');
    expect(days(12)).toBe('12 dní');
    expect(hours(1)).toBe('1 hodina');
    expect(hours(2)).toBe('2 hodiny');
    expect(hours(8)).toBe('8 hodín');
  });
});

describe('formatting', () => {
  it('uses a Slovak decimal comma and trims whole numbers', () => {
    expect(formatHours(8)).toBe('8');
    expect(formatHours(7.5)).toBe('7,5');
    expect(formatHours(0.25)).toBe('0,25');
  });

  it('formats a long date in the genitive month form', () => {
    expect(formatLongDate('2026-09-09')).toBe('streda 9. septembra 2026');
    expect(formatLongDate('2026-01-01')).toBe('štvrtok 1. januára 2026');
    expect(formatLongDate('2026-05-08')).toBe('piatok 8. mája 2026');
  });

  it('formats a month title in the nominative', () => {
    expect(formatMonthTitle(2026, 9)).toBe('september 2026');
  });
});

describe('S', () => {
  it('contains no ASCII-only placeholder text', () => {
    for (const [key, value] of Object.entries(S)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/TODO|TBD/i);
    }
  });
});
```

`tests/ui/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '../../src/ui/router.js';

describe('parseHash', () => {
  it('reads each view', () => {
    expect(parseHash('#/year/2026', '2026-09-09')).toEqual({ view: 'year', date: '2026-01-01' });
    expect(parseHash('#/month/2026-09', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/day/2026-09-09', '2026-09-09')).toEqual({ view: 'day', date: '2026-09-09' });
  });

  it('falls back to the month view on today for junk', () => {
    expect(parseHash('', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/nope/xx', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/day/2026-13-40', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
  });
});

describe('formatHash', () => {
  it('round-trips every view', () => {
    for (const s of [
      { view: 'year', date: '2026-01-01' },
      { view: 'month', date: '2026-09-01' },
      { view: 'day', date: '2026-09-09' },
    ] as const) {
      expect(parseHash(formatHash(s), '2026-09-09')).toEqual(s);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/`
Expected: FAIL — `src/ui/strings.js` and `src/ui/router.js` do not exist.

- [ ] **Step 3: Implement `src/ui/strings.ts`**

Slovak needs the genitive month form for a full date (`9. septembra`) but the
nominative for a month title (`september 2026`), so both lists are kept.

```ts
import { SK_MONTHS, SK_WEEKDAYS, dayOfWeek, parseIso, type IsoDate } from '../domain/dates.js';

const SK_MONTHS_GENITIVE = [
  'januára', 'februára', 'marca', 'apríla', 'mája', 'júna',
  'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra',
] as const;

/** Slovak has three plural forms: 1 / 2–4 / everything else. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function days(n: number): string {
  return `${n} ${plural(n, 'deň', 'dni', 'dní')}`;
}

export function hours(n: number): string {
  return `${formatHours(n)} ${plural(n, 'hodina', 'hodiny', 'hodín')}`;
}

/** Slovak uses a decimal comma; whole numbers render without a fraction. */
export function formatHours(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(n)).replace('.', ',');
}

export function formatLongDate(d: IsoDate): string {
  const { year, month, day } = parseIso(d);
  const weekday = SK_WEEKDAYS[dayOfWeek(d) - 1]!;
  return `${weekday} ${day}. ${SK_MONTHS_GENITIVE[month - 1]!} ${year}`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${SK_MONTHS[month - 1]!} ${year}`;
}

export const S = {
  appTitle: 'Pracovný denník',

  viewDay: 'Deň',
  viewMonth: 'Mesiac',
  viewYear: 'Rok',
  today: 'Dnes',
  previous: 'Predchádzajúce obdobie',
  next: 'Nasledujúce obdobie',

  stats: 'Štatistika',
  settings: 'Nastavenia',
  exportMenu: 'Export',

  typeLabel: 'Typ dňa',
  hoursLabel: 'Počet hodín',
  noteLabel: 'Poznámka',
  notePlaceholder: 'Voliteľná poznámka k dňu…',
  clearDay: 'Vymazať záznam',
  weekend: 'Víkend',
  holiday: 'Sviatok',
  restDay: 'Deň pracovného pokoja',
  workingHoliday: 'Sviatok — pracovný deň',
  noEntry: 'Bez záznamu',

  statsTitle: 'Prehľad obdobia',
  statsDays: 'Dni',
  statsHours: 'Hodiny',
  statsWorkedHours: 'Odpracované hodiny',
  statsEmpty: 'Za toto obdobie nie sú žiadne záznamy.',

  settingsTitle: 'Nastavenia',
  settingsDefaultType: 'Predvolený typ pracovného dňa',
  settingsDefaultHours: 'Predvolený počet hodín',
  settingsTheme: 'Vzhľad',
  themeSystem: 'Podľa systému',
  themeLight: 'Svetlý',
  themeDark: 'Tmavý',
  settingsColors: 'Farby typov dní',
  settingsHolidays: 'Sviatky',
  settingsHolidaysHint:
    'Zákon rozlišuje štátny sviatok a deň pracovného pokoja a niektoré dni sa menia podľa roka. Skontrolujte označené riadky a v prípade potreby ich upravte.',
  holidayNeedsCheck: 'Overte platnosť',
  holidayIsRestDay: 'Deň pracovného pokoja',

  exportBackup: 'Záloha databázy (.sqlite)',
  exportCsv: 'Export do CSV',
  importBackup: 'Obnoviť zo zálohy…',
  importConfirm:
    'Obnovenie prepíše celý denník. Aktuálne máte {count} — naozaj chcete pokračovať?',
  importDone: 'Denník bol obnovený zo zálohy.',
  backupNever: 'Zatiaľ ste nevytvorili žiadnu zálohu.',
  backupLast: 'Posledná záloha: {date}',
  backupStale:
    'Posledná záloha je staršia ako 30 dní. Databáza je uložená v profile prehliadača — bez zálohy o ňu môžete prísť.',
  rangeFrom: 'Od',
  rangeTo: 'Do',
  csvHeaderDate: 'Dátum',
  csvHeaderWeekday: 'Deň',
  csvHeaderType: 'Typ',
  csvHeaderHours: 'Hodiny',
  csvHeaderNote: 'Poznámka',

  errorTitle: 'Nastala chyba',
  loading: 'Načítavam…',
} as const;
```

- [ ] **Step 4: Implement `src/ui/dom.ts`**

```ts
type Props = Record<string, unknown> & {
  class?: string;
  dataset?: Record<string, string>;
  html?: string;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value as Record<string, string>)) node.dataset[k] = v;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in node) {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  node.append(...children);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
```

`html` is used only for the trusted, hand-authored icon SVG from
`src/domain/icons.ts` — never for user data. Notes are always set via
`textContent`.

- [ ] **Step 5: Implement `src/ui/router.ts`**

```ts
import { addDays, daysInMonth, isoDate, parseIso, type IsoDate } from '../domain/dates.js';

export type ViewName = 'day' | 'month' | 'year';
export interface ViewState { view: ViewName; date: IsoDate }

const YEAR_RE = /^#\/year\/(\d{4})$/;
const MONTH_RE = /^#\/month\/(\d{4})-(\d{2})$/;
const DAY_RE = /^#\/day\/(\d{4}-\d{2}-\d{2})$/;

function safe(fn: () => ViewState, fallback: ViewState): ViewState {
  try { return fn(); } catch { return fallback; }
}

export function parseHash(hash: string, today: IsoDate): ViewState {
  const t = parseIso(today);
  const fallback: ViewState = { view: 'month', date: isoDate(t.year, t.month, 1) };

  const year = YEAR_RE.exec(hash);
  if (year) return safe(() => ({ view: 'year', date: isoDate(Number(year[1]), 1, 1) }), fallback);

  const month = MONTH_RE.exec(hash);
  if (month) {
    return safe(() => {
      const m = Number(month[2]);
      if (m < 1 || m > 12) throw new Error('bad month');
      return { view: 'month', date: isoDate(Number(month[1]), m, 1) };
    }, fallback);
  }

  const day = DAY_RE.exec(hash);
  if (day) {
    return safe(() => {
      const d = day[1]!;
      const p = parseIso(d);
      // Reject dates that match the shape but do not exist, e.g. 2026-02-30.
      if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > daysInMonth(p.year, p.month)) {
        throw new Error('bad date');
      }
      return { view: 'day', date: d };
    }, fallback);
  }

  return fallback;
}

export function formatHash(s: ViewState): string {
  const { year, month } = parseIso(s.date);
  if (s.view === 'year') return `#/year/${year}`;
  if (s.view === 'month') return `#/month/${isoDate(year, month, 1).slice(0, 7)}`;
  return `#/day/${s.date}`;
}

export class Router {
  #state: ViewState;
  #listeners: ((s: ViewState) => void)[] = [];

  constructor(today: IsoDate) {
    this.#state = parseHash(location.hash, today);
    window.addEventListener('hashchange', () => {
      this.#state = parseHash(location.hash, today);
      this.#emit();
    });
  }

  get current(): ViewState { return this.#state; }

  go(next: Partial<ViewState>): void {
    const merged: ViewState = { ...this.#state, ...next };
    const hash = formatHash(merged);
    if (hash === location.hash) { this.#state = merged; this.#emit(); return; }
    location.hash = hash; // triggers hashchange → emit
  }

  /** Moves one day / month / year, depending on the current view. */
  step(delta: number): void {
    const { year, month, day } = parseIso(this.#state.date);
    if (this.#state.view === 'day') { this.go({ date: addDays(this.#state.date, delta) }); return; }
    if (this.#state.view === 'month') {
      const total = (year * 12 + (month - 1)) + delta;
      this.go({ date: isoDate(Math.floor(total / 12), (total % 12) + 1, 1) });
      return;
    }
    void day;
    this.go({ date: isoDate(year + delta, 1, 1) });
  }

  subscribe(fn: (s: ViewState) => void): void { this.#listeners.push(fn); }

  #emit(): void { for (const fn of this.#listeners) fn(this.#state); }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/`
Expected: PASS. `router.test.ts` runs in the Node environment and touches
`location`/`window` only inside the `Router` class, which the tests do not
instantiate — only `parseHash`/`formatHash` are exercised.

- [ ] **Step 7: Write the design system in `src/styles.css`**

Replace the file entirely. These tokens are the only values later views may use.

```css
:root {
  color-scheme: light dark;

  /* Type scale */
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-xs: 11px;  --fs-sm: 12px;  --fs-md: 13px;
  --fs-lg: 15px;  --fs-xl: 20px;  --fs-2xl: 28px;
  --lh-tight: 1.25; --lh-normal: 1.5;

  /* Spacing scale (4px base) */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px;

  /* Radii and elevation */
  --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-full: 999px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08);
  --shadow-2: 0 4px 12px rgb(0 0 0 / 0.10), 0 2px 4px rgb(0 0 0 / 0.06);

  /* Motion */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --dur-fast: 90ms; --dur-base: 160ms;

  /* Surfaces — light */
  --bg: #fbfbfd;
  --surface: #ffffff;
  --surface-2: #f4f5f7;
  --fg: #14181f;
  --fg-muted: #5b6472;
  --fg-subtle: #8a93a3;
  --line: #e3e6ec;
  --line-strong: #cdd2dc;
  --accent: #2563eb;
  --accent-fg: #ffffff;
  --focus: #2563eb;
  --danger: #dc2626;
  --void: transparent;
}

:root[data-theme="dark"],
:root:not([data-theme="light"]) {
  /* overridden below only under the dark media query */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1115;
    --surface: #171a20;
    --surface-2: #1e222a;
    --fg: #e8eaef;
    --fg-muted: #a2abba;
    --fg-subtle: #6f7889;
    --line: #262b34;
    --line-strong: #363d49;
    --accent: #60a5fa;
    --accent-fg: #0f1115;
    --focus: #60a5fa;
    --danger: #f87171;
  }
}

:root[data-theme="dark"] {
  --bg: #0f1115;
  --surface: #171a20;
  --surface-2: #1e222a;
  --fg: #e8eaef;
  --fg-muted: #a2abba;
  --fg-subtle: #6f7889;
  --line: #262b34;
  --line-strong: #363d49;
  --accent: #60a5fa;
  --accent-fg: #0f1115;
  --focus: #60a5fa;
  --danger: #f87171;
}

* { box-sizing: border-box; }

html, body { height: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: var(--fs-md)/var(--lh-normal) var(--font);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum" 1; /* tabular numerals keep grids aligned */
}

#app {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--s-5) var(--s-5) var(--s-7);
  gap: var(--s-5);
}

/* Focus: one consistent ring everywhere. */
:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* Buttons */
.btn {
  appearance: none;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--fg);
  font: inherit;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  transition: background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}
.btn:hover { background: var(--surface-2); }
.btn[aria-pressed="true"] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.btn--ghost { border-color: transparent; background: transparent; }
.btn--danger { color: var(--danger); border-color: var(--danger); }

/* Segmented control for the view switcher */
.segmented {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-full);
  padding: 2px;
}
.segmented .btn {
  border: 0;
  background: transparent;
  border-radius: var(--r-full);
  padding: var(--s-1) var(--s-4);
}
.segmented .btn[aria-pressed="true"] {
  background: var(--surface);
  color: var(--fg);
  box-shadow: var(--shadow-1);
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-wrap: wrap;
}
.toolbar__title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: var(--lh-tight);
  margin: 0;
  min-width: 15ch;
}
.toolbar__spacer { flex: 1; }

/* Panels slide in without shifting the grid. */
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: var(--s-4);
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--s-4);
}

.muted { color: var(--fg-muted); }
.subtle { color: var(--fg-subtle); font-size: var(--fs-sm); }

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

- [ ] **Step 8: Implement `src/ui/toolbar.ts`**

```ts
import { parseIso, todayIso } from '../domain/dates.js';
import { el } from './dom.js';
import type { Router, ViewName } from './router.js';
import { S, formatLongDate, formatMonthTitle } from './strings.js';

const VIEWS: { name: ViewName; label: string }[] = [
  { name: 'day', label: S.viewDay },
  { name: 'month', label: S.viewMonth },
  { name: 'year', label: S.viewYear },
];

export function titleFor(view: ViewName, date: string): string {
  const { year, month } = parseIso(date);
  if (view === 'year') return String(year);
  if (view === 'month') return formatMonthTitle(year, month);
  return formatLongDate(date);
}

export function renderToolbar(
  root: HTMLElement,
  router: Router,
  handlers: { onStats(): void; onSettings(): void; onExport(): void },
): void {
  const { view, date } = router.current;

  const switcher = el('div', { class: 'segmented', role: 'group' },
    VIEWS.map((v) =>
      el('button', {
        class: 'btn', type: 'button', textContent: v.label,
        'aria-pressed': String(v.name === view),
        onclick: () => router.go({ view: v.name }),
      }),
    ),
  );

  root.replaceChildren(
    switcher,
    el('button', {
      class: 'btn btn--ghost', type: 'button', textContent: '‹',
      'aria-label': S.previous, onclick: () => router.step(-1),
    }),
    el('button', {
      class: 'btn btn--ghost', type: 'button', textContent: '›',
      'aria-label': S.next, onclick: () => router.step(1),
    }),
    el('h1', { class: 'toolbar__title', textContent: titleFor(view, date) }),
    el('button', { class: 'btn', type: 'button', textContent: S.today,
      onclick: () => router.go({ date: todayIso() }) }),
    el('div', { class: 'toolbar__spacer' }),
    el('button', { class: 'btn', type: 'button', textContent: S.stats, onclick: handlers.onStats }),
    el('button', { class: 'btn', type: 'button', textContent: S.exportMenu, onclick: handlers.onExport }),
    el('button', { class: 'btn', type: 'button', textContent: S.settings, onclick: handlers.onSettings }),
  );
}
```

*Dnes* keeps the current view and only moves the date, which is what a user
pressing it in the year view expects.

- [ ] **Step 9: Wire `src/main.ts` to the shell**

```ts
import { todayIso } from './domain/dates.js';
import { DbClient } from './db/rpc.js';
import { parseIso } from './domain/dates.js';
import { Router } from './ui/router.js';
import { renderToolbar } from './ui/toolbar.js';
import { el } from './ui/dom.js';
import { S } from './ui/strings.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
const toolbarRoot = el('header', { class: 'toolbar' });
const viewRoot = el('main', { class: 'view' });
app.replaceChildren(toolbarRoot, viewRoot);

const client = new DbClient(
  new Worker(new URL('./db/worker.ts', import.meta.url), { type: 'module' }),
);
const router = new Router(todayIso());

async function render(): Promise<void> {
  renderToolbar(toolbarRoot, router, {
    onStats: () => {}, onSettings: () => {}, onExport: () => {},
  });
  const { year } = parseIso(router.current.date);
  await client.call('ensureYearSeeded', year);
  viewRoot.replaceChildren(
    el('div', { class: 'card', textContent: `${router.current.view} — ${router.current.date}` }),
  );
}

router.subscribe(() => { void render(); });
void render().catch((e: unknown) => {
  viewRoot.replaceChildren(
    el('div', { class: 'card' }, [
      el('strong', { textContent: S.errorTitle }),
      el('p', { class: 'muted', textContent: String(e) }),
    ]),
  );
});

document.title = S.appTitle;
```

- [ ] **Step 10: Build and check the shell**

Run: `npm run build`, reload the extension, open the diary.
Expected: a centered page with the segmented Day/Month/Year switcher, `‹ ›`,
a Slovak title such as `september 2026`, and the right-hand buttons. Clicking a
segment updates the URL hash and the title. Tab through every control and
confirm a visible focus ring on each. Toggle the OS theme and confirm both
palettes read correctly.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add design tokens, Slovak strings, router and toolbar"
```

---

### Task 9: Day model and the Year heatmap

**Files:**
- Create: `src/ui/day-model.ts`, `src/ui/year-view.ts`
- Modify: `src/styles.css` (append the year-grid rules), `src/main.ts`
- Test: `tests/ui/day-model.test.ts`

**Interfaces:**
- Consumes: `DayEntry`, `HolidayRow`, `DayTypeRow` from `repository.ts`; `dayOfWeek`, `isWeekend`, `daysInMonth`, `isoDate` from `dates.ts`; `iconSvg` from `icons.ts`; `S`, `formatHours`, `formatLongDate` from `strings.ts`.
- Produces:
  - `type DayKind = 'entry' | 'weekend' | 'rest' | 'empty'`
  - `interface DayCell { day: IsoDate; kind: DayKind; typeCode: DayTypeCode | null; label: string; hours: number | null; note: string | null; holidayName: string | null; color: string | null; tooltip: string }`
  - `buildDayIndex(entries: readonly DayEntry[], holidays: readonly HolidayRow[], types: readonly DayTypeRow[], theme: 'light' | 'dark'): (day: IsoDate) => DayCell`
  - `renderYearView(root: HTMLElement, ctx: YearContext): void` where `interface YearContext { year: number; cellFor: (day: IsoDate) => DayCell; onPick: (day: IsoDate) => void; onLegend?: (root: HTMLElement) => void }`

- [ ] **Step 1: Write the failing test**

`tests/ui/day-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDayIndex } from '../../src/ui/day-model.js';
import { DAY_TYPES } from '../../src/domain/day-types.js';

const types = DAY_TYPES.map((t) => ({
  code: t.code, labelSk: t.labelSk, icon: t.icon, color: t.color,
  colorDark: t.colorDark, countsAsWork: t.countsAsWork, sortOrder: t.sortOrder,
}));

const index = (theme: 'light' | 'dark' = 'light') =>
  buildDayIndex(
    [
      { day: '2026-09-09', typeCode: 'home', hours: 7.5, note: 'šprint' },
      { day: '2026-09-01', typeCode: 'office', hours: 8, note: null },
    ],
    [
      { day: '2026-09-01', name: 'Deň Ústavy Slovenskej republiky', isRestDay: false, needsVerification: false, source: 'seed' },
      { day: '2026-09-15', name: 'Sedembolestná Panna Mária', isRestDay: true, needsVerification: true, source: 'seed' },
    ],
    types,
    theme,
  );

describe('buildDayIndex', () => {
  it('describes a day with an entry', () => {
    const c = index()('2026-09-09');
    expect(c).toMatchObject({
      kind: 'entry', typeCode: 'home', hours: 7.5,
      note: 'šprint', label: 'Home office', color: '#14B8A6',
    });
    expect(c.tooltip).toContain('Home office');
    expect(c.tooltip).toContain('7,5');
    expect(c.tooltip).toContain('šprint');
  });

  it('uses the dark palette when asked', () => {
    expect(index('dark')('2026-09-09').color).toBe('#2DD4BF');
  });

  it('marks weekends', () => {
    const c = index()('2026-09-12');
    expect(c.kind).toBe('weekend');
    expect(c.color).toBeNull();
    expect(c.label).toBe('Víkend');
  });

  it('marks rest-day holidays and names them', () => {
    const c = index()('2026-09-15');
    expect(c.kind).toBe('rest');
    expect(c.holidayName).toBe('Sedembolestná Panna Mária');
    expect(c.tooltip).toContain('Sedembolestná Panna Mária');
  });

  it('lets an entry win over a working holiday', () => {
    const c = index()('2026-09-01');
    expect(c.kind).toBe('entry');
    expect(c.typeCode).toBe('office');
    expect(c.holidayName).toBe('Deň Ústavy Slovenskej republiky');
  });

  it('marks a plain weekday with no entry as empty', () => {
    const c = index()('2026-09-10');
    expect(c.kind).toBe('empty');
    expect(c.label).toBe('Bez záznamu');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/day-model.test.ts`
Expected: FAIL — `src/ui/day-model.js` does not exist.

- [ ] **Step 3: Implement `src/ui/day-model.ts`**

One function decides what a day *is*, so the year, month and day views can never
disagree about a date. Precedence: an entry always wins, then a rest-day holiday,
then a weekend, then empty.

```ts
import { isWeekend, type IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type { DayEntry, DayTypeRow, HolidayRow } from '../db/repository.js';
import { S, formatHours, formatLongDate } from './strings.js';

export type DayKind = 'entry' | 'weekend' | 'rest' | 'empty';

export interface DayCell {
  day: IsoDate;
  kind: DayKind;
  typeCode: DayTypeCode | null;
  label: string;
  hours: number | null;
  note: string | null;
  holidayName: string | null;
  color: string | null;
  tooltip: string;
}

export function buildDayIndex(
  entries: readonly DayEntry[],
  holidays: readonly HolidayRow[],
  types: readonly DayTypeRow[],
  theme: 'light' | 'dark',
): (day: IsoDate) => DayCell {
  const entryByDay = new Map(entries.map((e) => [e.day, e]));
  const holidayByDay = new Map(holidays.map((h) => [h.day, h]));
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const colorOf = (t: DayTypeRow) => (theme === 'dark' ? t.colorDark : t.color);

  return (day: IsoDate): DayCell => {
    const holiday = holidayByDay.get(day) ?? null;
    const holidayName = holiday?.name ?? null;
    const entry = entryByDay.get(day);

    if (entry) {
      const type = typeByCode.get(entry.typeCode);
      const label = type?.labelSk ?? entry.typeCode;
      const parts = [formatLongDate(day), label, `${formatHours(entry.hours)} h`];
      if (entry.note) parts.push(entry.note);
      if (holidayName) parts.push(holidayName);
      return {
        day, kind: 'entry', typeCode: entry.typeCode, label,
        hours: entry.hours, note: entry.note, holidayName,
        color: type ? colorOf(type) : null,
        tooltip: parts.join(' · '),
      };
    }

    if (holiday?.isRestDay) {
      return {
        day, kind: 'rest', typeCode: null, label: S.restDay, hours: null,
        note: null, holidayName,
        color: null,
        tooltip: `${formatLongDate(day)} · ${holidayName ?? S.holiday}`,
      };
    }

    if (isWeekend(day)) {
      return {
        day, kind: 'weekend', typeCode: null, label: S.weekend, hours: null,
        note: null, holidayName, color: null,
        tooltip: `${formatLongDate(day)} · ${S.weekend}`,
      };
    }

    return {
      day, kind: 'empty', typeCode: null, label: S.noEntry, hours: null,
      note: null, holidayName, color: null,
      tooltip: holidayName
        ? `${formatLongDate(day)} · ${holidayName} (${S.workingHoliday})`
        : `${formatLongDate(day)} · ${S.noEntry}`,
    };
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/day-model.test.ts`
Expected: PASS — all six cases.

- [ ] **Step 5: Implement `src/ui/year-view.ts`**

```ts
import { SK_MONTHS, daysInMonth, isoDate } from '../domain/dates.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';

export interface YearContext {
  year: number;
  cellFor: (day: string) => DayCell;
  onPick: (day: string) => void;
  /** Called with the empty legend container so the caller can fill it (Task 12). */
  onLegend?: (root: HTMLElement) => void;
}

export function renderYearView(root: HTMLElement, ctx: YearContext): void {
  const grid = el('div', { class: 'year' });

  // Header row: an empty corner, then day-of-month numbers 1–31.
  grid.append(el('div', { class: 'year__corner' }));
  for (let d = 1; d <= 31; d += 1) {
    grid.append(el('div', {
      class: 'year__daynum', textContent: d % 5 === 0 || d === 1 ? String(d) : '',
    }));
  }

  for (let m = 1; m <= 12; m += 1) {
    grid.append(el('div', { class: 'year__month', textContent: SK_MONTHS[m - 1]!.slice(0, 3) }));
    const len = daysInMonth(ctx.year, m);
    for (let d = 1; d <= 31; d += 1) {
      if (d > len) { grid.append(el('div', { class: 'year__cell year__cell--void' })); continue; }
      const day = isoDate(ctx.year, m, d);
      const cell = ctx.cellFor(day);
      const node = el('button', {
        class: `year__cell year__cell--${cell.kind}`,
        type: 'button',
        title: cell.tooltip,
        'aria-label': cell.tooltip,
        onclick: () => ctx.onPick(day),
      });
      if (cell.color) node.style.setProperty('--cell', cell.color);
      grid.append(node);
    }
  }

  const legendRoot = el('div', { class: 'legend' });
  ctx.onLegend?.(legendRoot);
  root.replaceChildren(el('div', { class: 'card' }, [grid, legendRoot]));
}
```

The legend container is created here but filled by the caller, because the
renderer that knows the type colors and labels arrives in Task 12. Until then
`onLegend` is simply not passed and the container stays empty, reserving its
space so the layout does not shift later.

- [ ] **Step 6: Append the year-grid CSS to `src/styles.css`**

```css
.year {
  display: grid;
  grid-template-columns: 3.2rem repeat(31, 1fr);
  gap: 2px;
  align-items: center;
}
.year__corner { height: var(--s-4); }
.year__daynum {
  font-size: var(--fs-xs);
  color: var(--fg-subtle);
  text-align: center;
  line-height: 1;
}
.year__month {
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  text-transform: lowercase;
  padding-right: var(--s-2);
  text-align: right;
  white-space: nowrap;
}
.year__cell {
  appearance: none;
  border: 0;
  padding: 0;
  aspect-ratio: 1;
  min-height: 18px;
  border-radius: 3px;
  background: var(--surface-2);
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease),
              box-shadow var(--dur-fast) var(--ease);
}
.year__cell--entry { background: var(--cell); }
.year__cell--rest {
  background: repeating-linear-gradient(
    45deg, var(--line) 0 2px, transparent 2px 5px
  );
  border: 1px solid var(--line);
}
.year__cell--weekend { background: var(--surface-2); opacity: 0.55; }
.year__cell--empty {
  background: transparent;
  border: 1px dashed var(--line-strong);
}
.year__cell--void { background: none; cursor: default; pointer-events: none; }
.year__cell:not(.year__cell--void):hover {
  transform: scale(1.35);
  box-shadow: var(--shadow-2);
  z-index: 1;
}
.legend { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-4); }
.legend__item { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--fs-sm); }
.legend__swatch { width: 12px; height: 12px; border-radius: 3px; background: var(--cell); }
```

- [ ] **Step 7: Wire the year view into `src/main.ts`**

Replace the placeholder render with a real data load. Add near the top:

```ts
import { buildDayIndex } from './ui/day-model.js';
import { renderYearView } from './ui/year-view.js';
import { isoDate } from './domain/dates.js';

function activeTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
```

and replace the body of `render()` after `ensureYearSeeded` with:

```ts
  const { year } = parseIso(router.current.date);
  await client.call('ensureYearSeeded', year);
  const [range, types] = await Promise.all([
    client.call('loadRange', isoDate(year, 1, 1), isoDate(year, 12, 31)),
    client.call('listDayTypes'),
  ]);
  const cellFor = buildDayIndex(range.entries, range.holidays, types, activeTheme());

  if (router.current.view === 'year') {
    renderYearView(viewRoot, { year, cellFor, onPick: (day) => router.go({ view: 'day', date: day }) });
  } else {
    viewRoot.replaceChildren(
      el('div', { class: 'card', textContent: `${router.current.view} — ${router.current.date}` }),
    );
  }
```

- [ ] **Step 8: Build and inspect the year view**

Run: `npm run build`, reload the extension, switch to *Rok*.
Expected: a 12-row heatmap with month labels down the left and day numbers along
the top; auto-filled weekdays in the office blue, weekends recessed, rest-day
holidays hatched, February showing four blank cells at the end. Hover magnifies a
cell and shows a Slovak tooltip. Clicking a cell switches to Day view for that
date. No horizontal scrollbar at a 1180px window.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add the day model and the year heatmap view"
```

---

### Task 10: Month calendar view

**Files:**
- Create: `src/ui/month-view.ts`
- Modify: `src/styles.css` (append month-grid rules), `src/main.ts`

**Interfaces:**
- Consumes: `DayCell`, `buildDayIndex` from `day-model.ts`; `iconSvg` from `icons.ts`; `dayOfWeek`, `daysInMonth`, `isoDate`, `addDays`, `parseIso` from `dates.ts`; `S`, `formatHours` from `strings.ts`.
- Produces: `renderMonthView(root: HTMLElement, ctx: { year: number; month: number; cellFor: (day: IsoDate) => DayCell; onPick: (day: IsoDate) => void }): void`

- [ ] **Step 1: Implement `src/ui/month-view.ts`**

```ts
import { addDays, dayOfWeek, daysInMonth, isoDate, parseIso, type IsoDate }
  from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';
import { S, formatHours } from './strings.js';

const WEEKDAY_ABBR = ['po', 'ut', 'st', 'št', 'pi', 'so', 'ne'] as const;

export interface MonthContext {
  year: number;
  month: number;
  cellFor: (day: IsoDate) => DayCell;
  onPick: (day: IsoDate) => void;
}

export function renderMonthView(root: HTMLElement, ctx: MonthContext): void {
  const grid = el('div', { class: 'month' });

  for (const abbr of WEEKDAY_ABBR) {
    grid.append(el('div', { class: 'month__weekday', textContent: abbr }));
  }

  const first = isoDate(ctx.year, ctx.month, 1);
  const lead = dayOfWeek(first) - 1;             // Monday = 0
  const total = daysInMonth(ctx.year, ctx.month);
  const trail = (7 - ((lead + total) % 7)) % 7;

  for (let i = lead; i > 0; i -= 1) grid.append(adjacent(addDays(first, -i), ctx));
  for (let d = 1; d <= total; d += 1) grid.append(dayCell(isoDate(ctx.year, ctx.month, d), ctx));
  const last = isoDate(ctx.year, ctx.month, total);
  for (let i = 1; i <= trail; i += 1) grid.append(adjacent(addDays(last, i), ctx));

  root.replaceChildren(el('div', { class: 'card' }, [grid]));
}

function adjacent(day: IsoDate, ctx: MonthContext): HTMLElement {
  const node = dayCell(day, ctx);
  node.classList.add('month__cell--adjacent');
  return node;
}

function dayCell(day: IsoDate, ctx: MonthContext): HTMLElement {
  const cell = ctx.cellFor(day);
  const { day: dom } = parseIso(day);

  const head = el('div', { class: 'month__head' }, [
    el('span', { class: 'month__dom', textContent: String(dom) }),
    cell.hours !== null
      ? el('span', { class: 'month__hours', textContent: `${formatHours(cell.hours)} h` })
      : el('span'),
  ]);

  const body = el('div', { class: 'month__body' });
  if (cell.kind === 'entry' && cell.typeCode) {
    body.append(
      el('span', { class: 'month__icon', html: iconSvg(cell.typeCode) }),
      el('span', { class: 'month__label', textContent: cell.label }),
    );
  } else {
    body.append(el('span', { class: 'month__label muted', textContent: cell.label }));
  }

  const foot = el('div', { class: 'month__foot' });
  if (cell.holidayName) {
    foot.append(el('span', { class: 'month__holiday', textContent: cell.holidayName }));
  } else if (cell.note) {
    foot.append(el('span', { class: 'month__note', textContent: cell.note }));
  }

  const node = el('button', {
    class: `month__cell month__cell--${cell.kind}`,
    type: 'button',
    'aria-label': cell.tooltip,
    onclick: () => ctx.onPick(day),
  }, [head, body, foot]);

  if (cell.color) node.style.setProperty('--cell', cell.color);
  return node;
}

export const MONTH_EMPTY_LABEL = S.noEntry;
```

Notes appear via `textContent`, never `innerHTML`; only the trusted icon SVG uses
`html`.

- [ ] **Step 2: Append the month CSS to `src/styles.css`**

```css
.month {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--s-2);
}
.month__weekday {
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-subtle);
  text-align: center;
  padding-bottom: var(--s-1);
}
.month__cell {
  appearance: none;
  text-align: left;
  font: inherit;
  color: var(--fg);
  min-height: 92px;
  padding: var(--s-2);
  border: 1px solid var(--line);
  border-left: 3px solid var(--cell, var(--line));
  border-radius: var(--r-md);
  background: var(--surface);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--s-1);
  cursor: pointer;
  transition: box-shadow var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}
.month__cell:hover { box-shadow: var(--shadow-2); }
.month__cell--entry {
  /* 12% tint of the type color, computed from the same token */
  background: color-mix(in srgb, var(--cell) 12%, var(--surface));
}
.month__cell--weekend,
.month__cell--rest { background: var(--surface-2); border-left-color: var(--line); }
.month__cell--adjacent { opacity: 0.45; }
.month__head { display: flex; justify-content: space-between; align-items: baseline; }
.month__dom { font-size: var(--fs-lg); font-weight: 600; }
.month__hours { font-size: var(--fs-sm); color: var(--fg-muted); }
.month__body { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.month__icon { color: var(--cell, var(--fg-muted)); display: inline-flex; }
.month__label { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.month__foot { min-height: 1em; }
.month__holiday { font-size: var(--fs-xs); color: var(--fg-muted); font-style: italic; }
.month__note {
  font-size: var(--fs-xs); color: var(--fg-subtle);
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
```

- [ ] **Step 3: Wire the month view into `src/main.ts`**

Replace the `else` branch of the view switch:

```ts
  } else if (router.current.view === 'month') {
    const { month } = parseIso(router.current.date);
    renderMonthView(viewRoot, {
      year, month, cellFor,
      onPick: (day) => router.go({ view: 'day', date: day }),
    });
  } else {
```

Loading the whole year and rendering one month from it is deliberate: a year is
roughly 250 rows, the query is already paid for by the year view, and it keeps
month navigation instant.

- [ ] **Step 4: Build and inspect the month view**

Run: `npm run build`, reload the extension, switch to *Mesiac*.
Expected: seven columns headed `po ut st št pi so ne`; each working day tinted
with its type color, carrying its icon, Slovak label and hours; weekends and
rest days recessed with the holiday name in italics; leading and trailing days of
the adjacent months dimmed. `‹ ›` moves month by month, including across a year
boundary. Clicking a cell opens Day view.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the month calendar view"
```

---

### Task 11: Day editor view and keyboard shortcuts

**Files:**
- Create: `src/ui/day-view.ts`, `src/ui/keyboard.ts`
- Modify: `src/styles.css`, `src/main.ts`

**Interfaces:**
- Consumes: `DayCell` from `day-model.ts`; `DayTypeRow` from `repository.ts`; `iconSvg`; `S`, `formatHours`, `formatLongDate`.
- Produces: `renderDayView(root: HTMLElement, ctx: DayContext): void` where `interface DayContext { day: IsoDate; cell: DayCell; types: readonly DayTypeRow[]; theme: 'light'|'dark'; onSave(entry: DayEntry): void; onDelete(day: IsoDate): void }`; `installKeyboard(router: Router, opts: { onTypeIndex(i: number): void }): void`.

- [ ] **Step 1: Implement `src/ui/day-view.ts`**

```ts
import type { IsoDate } from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import type { DayEntry, DayTypeRow } from '../db/repository.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';
import { S, formatHours, formatLongDate } from './strings.js';

export interface DayContext {
  day: IsoDate;
  cell: DayCell;
  types: readonly DayTypeRow[];
  theme: 'light' | 'dark';
  onSave(entry: DayEntry): void;
  onDelete(day: IsoDate): void;
}

export function renderDayView(root: HTMLElement, ctx: DayContext): void {
  const { cell, types, theme } = ctx;
  let selected = cell.typeCode ?? null;

  const hoursInput = el('input', {
    class: 'field__input', type: 'number', min: '0', max: '24', step: '0.25',
    id: 'hours', value: cell.hours === null ? '8' : String(cell.hours),
  });

  const noteInput = el('textarea', {
    class: 'field__input field__input--area', id: 'note', rows: 4,
    placeholder: S.notePlaceholder,
  });
  noteInput.value = cell.note ?? '';

  const picker = el('div', { class: 'picker', role: 'radiogroup', 'aria-label': S.typeLabel });
  const buttons = types.map((t, i) => {
    const color = theme === 'dark' ? t.colorDark : t.color;
    const btn = el('button', {
      class: 'picker__item', type: 'button', role: 'radio',
      'aria-checked': String(selected === t.code),
      'aria-label': `${t.labelSk} (${i + 1})`,
      onclick: () => { selected = t.code; sync(); save(); },
    }, [
      el('span', { class: 'picker__icon', html: iconSvg(t.code) }),
      el('span', { class: 'picker__label', textContent: t.labelSk }),
      el('kbd', { class: 'picker__key', textContent: String(i + 1) }),
    ]);
    btn.style.setProperty('--cell', color);
    return btn;
  });
  picker.append(...buttons);

  function sync(): void {
    types.forEach((t, i) => {
      buttons[i]!.setAttribute('aria-checked', String(selected === t.code));
    });
  }

  function save(): void {
    if (!selected) return;
    const raw = Number(hoursInput.value.replace(',', '.'));
    const hours = Number.isFinite(raw) ? Math.min(24, Math.max(0, raw)) : 8;
    hoursInput.value = String(hours);
    ctx.onSave({
      day: ctx.day, typeCode: selected, hours,
      note: noteInput.value.trim() === '' ? null : noteInput.value.trim(),
    });
  }

  hoursInput.addEventListener('change', save);
  noteInput.addEventListener('change', save);

  const badges = el('div', { class: 'day__badges' });
  if (cell.holidayName) {
    badges.append(el('span', {
      class: 'badge', textContent: `${cell.holidayName} · ${cell.kind === 'rest' ? S.restDay : S.workingHoliday}`,
    }));
  }
  if (cell.kind === 'weekend') badges.append(el('span', { class: 'badge', textContent: S.weekend }));

  root.replaceChildren(
    el('div', { class: 'card day' }, [
      el('div', { class: 'day__header' }, [
        el('h2', { class: 'day__title', textContent: formatLongDate(ctx.day) }),
        badges,
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field__label', textContent: S.typeLabel }), picker,
      ]),
      el('div', { class: 'day__row' }, [
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.hoursLabel, htmlFor: 'hours' }),
          hoursInput,
        ]),
        el('label', { class: 'field field--grow' }, [
          el('span', { class: 'field__label', textContent: S.noteLabel, htmlFor: 'note' }),
          noteInput,
        ]),
      ]),
      el('div', { class: 'day__actions' }, [
        cell.kind === 'entry'
          ? el('button', {
              class: 'btn btn--danger', type: 'button', textContent: S.clearDay,
              onclick: () => ctx.onDelete(ctx.day),
            })
          : el('span', { class: 'subtle', textContent: `${S.noEntry} · ${formatHours(0)} h` }),
      ]),
    ]),
  );
}
```

Saving is immediate on change — there is no Save button, because a diary entry is
a single field edit and an explicit save step would only add a way to lose work.

- [ ] **Step 2: Implement `src/ui/keyboard.ts`**

```ts
import type { Router } from './router.js';

export function installKeyboard(
  router: Router,
  opts: { onTypeIndex(index: number): void },
): void {
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'ArrowLeft') { router.step(-1); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { router.step(1); e.preventDefault(); return; }
    if (e.key === 'Escape') {
      const up = router.current.view === 'day' ? 'month'
        : router.current.view === 'month' ? 'year' : 'year';
      router.go({ view: up });
      e.preventDefault();
      return;
    }
    if (router.current.view === 'day' && /^[1-6]$/.test(e.key)) {
      opts.onTypeIndex(Number(e.key) - 1);
      e.preventDefault();
    }
  });
}
```

- [ ] **Step 3: Append the day-view CSS to `src/styles.css`**

```css
.day { display: grid; gap: var(--s-5); max-width: 720px; }
.day__header { display: flex; align-items: baseline; gap: var(--s-3); flex-wrap: wrap; }
.day__title { font-size: var(--fs-2xl); font-weight: 600; letter-spacing: -0.02em; margin: 0; }
.day__badges { display: flex; gap: var(--s-2); }
.badge {
  font-size: var(--fs-xs);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--fg-muted);
  padding: 2px var(--s-2);
  border-radius: var(--r-full);
}
.day__row { display: flex; gap: var(--s-4); align-items: flex-start; }
.day__actions { display: flex; justify-content: flex-end; }

.field { display: grid; gap: var(--s-2); }
.field--grow { flex: 1; }
.field__label { font-size: var(--fs-sm); color: var(--fg-muted); }
.field__input {
  font: inherit;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  width: 8rem;
  transition: border-color var(--dur-fast) var(--ease);
}
.field__input--area { width: 100%; resize: vertical; }
.field__input:hover { border-color: var(--fg-subtle); }

.picker { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.picker__item {
  appearance: none;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--fg);
  transition: background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}
.picker__icon { color: var(--cell); display: inline-flex; }
.picker__item:hover { background: color-mix(in srgb, var(--cell) 10%, var(--surface)); }
.picker__item[aria-checked="true"] {
  border-color: var(--cell);
  background: color-mix(in srgb, var(--cell) 16%, var(--surface));
  box-shadow: inset 0 0 0 1px var(--cell);
}
.picker__key {
  font: var(--fs-xs)/1 var(--font);
  color: var(--fg-subtle);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px 5px;
}
```

- [ ] **Step 4: Wire the day view and keyboard into `src/main.ts`**

Add to the view switch:

```ts
  } else {
    renderDayView(viewRoot, {
      day: router.current.date,
      cell: cellFor(router.current.date),
      types,
      theme: activeTheme(),
      onSave: (entry) => { void client.call('upsertEntry', entry).then(render); },
      onDelete: (day) => { void client.call('deleteEntry', day).then(render); },
    });
  }
```

and once, after the router is created:

```ts
let currentTypes: DayTypeRow[] = [];
let defaultHours = 8;

installKeyboard(router, {
  onTypeIndex: (i) => {
    const type = currentTypes[i];
    if (!type || router.current.view !== 'day') return;
    const entry: DayEntry = {
      day: router.current.date,
      typeCode: type.code,
      hours: cellFor(router.current.date).hours ?? defaultHours,
      note: null,
    };
    void client.call('upsertEntry', entry).then(render);
  },
});
```

`currentTypes` and `defaultHours` are assigned at the end of every `render()`
(`currentTypes = types; defaultHours = Number(settings.default_hours ?? '8')`),
and `cellFor` is hoisted to module scope for the same reason — the keyboard
handler is installed once but must always read the latest data. Pressing a
number key on a day that already has hours keeps those hours and changes only
the type.

- [ ] **Step 5: Build and exercise the editor**

Run: `npm run build`, reload the extension, click any day in the month view.
Expected: the long Slovak date as a heading (`streda 9. septembra 2026`), six
type buttons showing icon + label + a `kbd` hint, the selected one outlined in
its own color; changing hours or the note persists immediately — navigate away
with `‹` and back with `›` and the value is still there. Pressing `1`–`6` sets
the type. `Esc` returns to the month. Arrow keys move a day at a time. On a
weekend or a rest day the badge appears and the day is still editable.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the day editor and keyboard shortcuts"
```

---

### Task 12: Statistics panel and year legend

**Files:**
- Create: `src/domain/stats.ts`, `src/ui/stats-panel.ts`
- Modify: `src/ui/year-view.ts` (fill the legend), `src/styles.css`, `src/main.ts`
- Test: `tests/domain/stats.test.ts`

**Interfaces:**
- Consumes: `SummaryGroup`, `DayTypeRow` from `repository.ts`; `days`, `hours`, `formatHours`, `S` from `strings.ts`.
- Produces:
  - `interface TypeTotal { code: DayTypeCode; labelSk: string; color: string; days: number; hours: number; countsAsWork: boolean }`
  - `interface Summary { totals: TypeTotal[]; totalDays: number; totalHours: number; workedHours: number }`
  - `summarize(groups: readonly SummaryGroup[], types: readonly DayTypeRow[], theme: 'light'|'dark'): Summary`
  - `renderStatsPanel(root: HTMLElement, summary: Summary): void`
  - `renderLegend(root: HTMLElement, types: readonly DayTypeRow[], theme: 'light'|'dark'): void`

- [ ] **Step 1: Write the failing test**

`tests/domain/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/domain/stats.js';
import { DAY_TYPES } from '../../src/domain/day-types.js';

const types = DAY_TYPES.map((t) => ({
  code: t.code, labelSk: t.labelSk, icon: t.icon, color: t.color,
  colorDark: t.colorDark, countsAsWork: t.countsAsWork, sortOrder: t.sortOrder,
}));

describe('summarize', () => {
  it('orders by the type sort order, not by the SQL row order', () => {
    const s = summarize(
      [
        { typeCode: 'vacation', days: 5, hours: 40 },
        { typeCode: 'office', days: 10, hours: 78 },
      ],
      types, 'light',
    );
    expect(s.totals.map((t) => t.code)).toEqual(['office', 'vacation']);
  });

  it('omits types with no rows in the period', () => {
    const s = summarize([{ typeCode: 'office', days: 3, hours: 24 }], types, 'light');
    expect(s.totals).toHaveLength(1);
  });

  it('totals days and hours, and counts worked hours separately', () => {
    const s = summarize(
      [
        { typeCode: 'office', days: 10, hours: 80 },
        { typeCode: 'home', days: 5, hours: 40 },
        { typeCode: 'vacation', days: 4, hours: 32 },
        { typeCode: 'sick', days: 1, hours: 8 },
      ],
      types, 'light',
    );
    expect(s.totalDays).toBe(20);
    expect(s.totalHours).toBe(160);
    expect(s.workedHours).toBe(120); // office + home; travel absent
  });

  it('picks the theme colour', () => {
    const light = summarize([{ typeCode: 'office', days: 1, hours: 8 }], types, 'light');
    const dark = summarize([{ typeCode: 'office', days: 1, hours: 8 }], types, 'dark');
    expect(light.totals[0]!.color).toBe('#3B82F6');
    expect(dark.totals[0]!.color).toBe('#60A5FA');
  });

  it('handles an empty period', () => {
    const s = summarize([], types, 'light');
    expect(s).toEqual({ totals: [], totalDays: 0, totalHours: 0, workedHours: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/stats.test.ts`
Expected: FAIL — `src/domain/stats.js` does not exist.

- [ ] **Step 3: Implement `src/domain/stats.ts`**

```ts
import type { DayTypeCode } from './day-types.js';
import type { DayTypeRow, SummaryGroup } from '../db/repository.js';

export interface TypeTotal {
  code: DayTypeCode;
  labelSk: string;
  color: string;
  days: number;
  hours: number;
  countsAsWork: boolean;
}

export interface Summary {
  totals: TypeTotal[];
  totalDays: number;
  totalHours: number;
  workedHours: number;
}

export function summarize(
  groups: readonly SummaryGroup[],
  types: readonly DayTypeRow[],
  theme: 'light' | 'dark',
): Summary {
  const byCode = new Map(groups.map((g) => [g.typeCode, g]));
  const totals: TypeTotal[] = [];

  for (const t of [...types].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const g = byCode.get(t.code);
    if (!g) continue;
    totals.push({
      code: t.code,
      labelSk: t.labelSk,
      color: theme === 'dark' ? t.colorDark : t.color,
      days: g.days,
      hours: g.hours,
      countsAsWork: t.countsAsWork,
    });
  }

  return {
    totals,
    totalDays: totals.reduce((n, t) => n + t.days, 0),
    totalHours: totals.reduce((n, t) => n + t.hours, 0),
    workedHours: totals.filter((t) => t.countsAsWork).reduce((n, t) => n + t.hours, 0),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/domain/stats.test.ts`
Expected: PASS — all five cases.

- [ ] **Step 5: Implement `src/ui/stats-panel.ts`**

```ts
import type { DayTypeRow } from '../db/repository.js';
import { iconSvg } from '../domain/icons.js';
import type { Summary } from '../domain/stats.js';
import { el } from './dom.js';
import { S, days, formatHours, hours } from './strings.js';

export function renderStatsPanel(root: HTMLElement, summary: Summary): void {
  if (summary.totals.length === 0) {
    root.replaceChildren(
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', textContent: S.statsTitle }),
        el('p', { class: 'muted', textContent: S.statsEmpty }),
      ]),
    );
    return;
  }

  const max = Math.max(...summary.totals.map((t) => t.days));

  const rows = summary.totals.map((t) => {
    const bar = el('div', { class: 'stat__bar' }, [
      el('div', { class: 'stat__fill' }),
    ]);
    const fill = bar.firstElementChild as HTMLElement;
    fill.style.width = `${Math.round((t.days / max) * 100)}%`;
    fill.style.setProperty('--cell', t.color);

    const row = el('div', { class: 'stat' }, [
      el('span', { class: 'stat__icon', html: iconSvg(t.code) }),
      el('span', { class: 'stat__label', textContent: t.labelSk }),
      bar,
      el('span', { class: 'stat__days', textContent: days(t.days) }),
      el('span', { class: 'stat__hours muted', textContent: hours(t.hours) }),
    ]);
    row.style.setProperty('--cell', t.color);
    return row;
  });

  root.replaceChildren(
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', textContent: S.statsTitle }),
      el('div', { class: 'stats' }, rows),
      el('div', { class: 'stats__footer' }, [
        el('span', { textContent: `${S.statsDays}: ${days(summary.totalDays)}` }),
        el('span', { textContent: `${S.statsHours}: ${hours(summary.totalHours)}` }),
        el('strong', {
          textContent: `${S.statsWorkedHours}: ${formatHours(summary.workedHours)}`,
        }),
      ]),
    ]),
  );
}

export function renderLegend(
  root: HTMLElement,
  types: readonly DayTypeRow[],
  theme: 'light' | 'dark',
): void {
  root.replaceChildren(
    ...types.map((t) => {
      const item = el('span', { class: 'legend__item' }, [
        el('span', { class: 'legend__swatch' }),
        el('span', { textContent: t.labelSk }),
      ]);
      item.style.setProperty('--cell', theme === 'dark' ? t.colorDark : t.color);
      return item;
    }),
  );
}
```

- [ ] **Step 6: Append the stats CSS**

```css
.panel-root:not([hidden]) { display: block; }
.panel__title { font-size: var(--fs-lg); font-weight: 600; margin: 0 0 var(--s-3); }
.stats { display: grid; gap: var(--s-2); }
.stat {
  display: grid;
  grid-template-columns: 20px 12rem 1fr 6rem 7rem;
  align-items: center;
  gap: var(--s-3);
}
.stat__icon { color: var(--cell); display: inline-flex; }
.stat__label { font-size: var(--fs-sm); }
.stat__bar { background: var(--surface-2); border-radius: var(--r-full); height: 8px; overflow: hidden; }
.stat__fill { background: var(--cell); height: 100%; border-radius: var(--r-full); }
.stat__days, .stat__hours { font-size: var(--fs-sm); text-align: right; }
.stats__footer {
  display: flex; gap: var(--s-5); justify-content: flex-end;
  margin-top: var(--s-4); padding-top: var(--s-3);
  border-top: 1px solid var(--line); font-size: var(--fs-sm);
}
@media (max-width: 720px) {
  .stat { grid-template-columns: 20px 1fr auto; }
  .stat__bar { display: none; }
}
```

- [ ] **Step 7: Wire the panel and legend into `src/main.ts`**

Create all three panel roots now, so Tasks 13 and 14 only fill them and the
layout never shifts as panels are added:

```ts
const statsRoot = el('aside', { class: 'panel-root', hidden: true });
const settingsRoot = el('aside', { class: 'panel-root', hidden: true });
const exportRoot = el('aside', { class: 'panel-root', hidden: true });
app.replaceChildren(toolbarRoot, statsRoot, settingsRoot, exportRoot, viewRoot);

let statsOpen = false;
let settingsOpen = false;
let exportOpen = false;
```

Opening one panel closes the other two — three stacked panels would push the
grid off screen. Each toolbar handler sets its own flag to `!flag` and the other
two to `false`, then calls `render()`.

In `render()`, after `cellFor` is built:

```ts
  const [from, to] = rangeFor(router.current);
  if (statsOpen) {
    const groups = await client.call('summaryRows', from, to);
    renderStatsPanel(statsRoot, summarize(groups, types, activeTheme()));
  }
  statsRoot.hidden = !statsOpen;
```

with a helper next to `render()`:

```ts
function rangeFor(state: ViewState): [IsoDate, IsoDate] {
  const { year, month } = parseIso(state.date);
  if (state.view === 'year') return [isoDate(year, 1, 1), isoDate(year, 12, 31)];
  if (state.view === 'month') {
    return [isoDate(year, month, 1), isoDate(year, month, daysInMonth(year, month))];
  }
  return [state.date, state.date];
}
```

and in the toolbar handlers:

```ts
  onStats: () => { statsOpen = !statsOpen; settingsOpen = false; exportOpen = false; void render(); },
  onSettings: () => { settingsOpen = !settingsOpen; statsOpen = false; exportOpen = false; void render(); },
  onExport: () => { exportOpen = !exportOpen; statsOpen = false; settingsOpen = false; void render(); },
```

In `renderYearView`, delete the `legend()` stub and instead build the container
`const legendRoot = el('div', { class: 'legend' })`, append it inside the card,
and have `main.ts` call `renderLegend(legendRoot, types, activeTheme())` — pass
`legendRoot` back by giving `YearContext` an `onLegend(root: HTMLElement): void`
callback that `main.ts` supplies.

- [ ] **Step 8: Build and check**

Run: `npm run build`, reload, click *Štatistika* in each of the three views.
Expected: the panel lists only the types present in the period, in seed order,
with a proportional bar, Slovak plurals (`1 deň`, `3 dni`, `12 dní`), and the
worked-hours total. Switching Rok → Mesiac → Deň re-scopes the numbers. The year
view shows the color legend under the heatmap.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add the statistics panel and year legend"
```

---

### Task 13: Settings panel

**Files:**
- Create: `src/ui/settings-panel.ts`
- Modify: `src/styles.css`, `src/main.ts`

**Interfaces:**
- Consumes: `DayTypeRow`, `HolidayRow` from `repository.ts`; `S`, `formatLongDate`; `DAY_TYPES`.
- Produces: `renderSettingsPanel(root: HTMLElement, ctx: SettingsContext): void` where `interface SettingsContext { settings: Record<string,string>; types: readonly DayTypeRow[]; holidays: readonly HolidayRow[]; year: number; theme: 'light'|'dark'; onSetting(key: string, value: string): void; onTypeColor(code: DayTypeCode, color: string, colorDark: string): void; onHoliday(day: IsoDate, isRestDay: boolean): void }`

- [ ] **Step 1: Implement `src/ui/settings-panel.ts`**

```ts
import type { IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type { DayTypeRow, HolidayRow } from '../db/repository.js';
import { iconSvg } from '../domain/icons.js';
import { el } from './dom.js';
import { S, formatLongDate } from './strings.js';

export interface SettingsContext {
  settings: Record<string, string>;
  types: readonly DayTypeRow[];
  holidays: readonly HolidayRow[];
  year: number;
  theme: 'light' | 'dark';
  onSetting(key: string, value: string): void;
  onTypeColor(code: DayTypeCode, color: string, colorDark: string): void;
  onHoliday(day: IsoDate, isRestDay: boolean): void;
}

export function renderSettingsPanel(root: HTMLElement, ctx: SettingsContext): void {
  const defaultType = el('select', { class: 'field__input', id: 'default-type' },
    ctx.types.map((t) =>
      el('option', { value: t.code, textContent: t.labelSk,
        selected: ctx.settings.default_type === t.code })),
  );
  defaultType.addEventListener('change', () => ctx.onSetting('default_type', defaultType.value));

  const defaultHours = el('input', {
    class: 'field__input', id: 'default-hours', type: 'number',
    min: '0', max: '24', step: '0.25', value: ctx.settings.default_hours ?? '8',
  });
  defaultHours.addEventListener('change', () =>
    ctx.onSetting('default_hours', String(Number(defaultHours.value.replace(',', '.')) || 8)));

  const theme = el('select', { class: 'field__input', id: 'theme' }, [
    el('option', { value: 'system', textContent: S.themeSystem }),
    el('option', { value: 'light', textContent: S.themeLight }),
    el('option', { value: 'dark', textContent: S.themeDark }),
  ]);
  theme.value = ctx.settings.theme ?? 'system';
  theme.addEventListener('change', () => ctx.onSetting('theme', theme.value));

  const colors = el('div', { class: 'colors' },
    ctx.types.map((t) => {
      const light = el('input', { type: 'color', class: 'colors__swatch', value: t.color,
        'aria-label': `${t.labelSk} — ${S.themeLight}` });
      const dark = el('input', { type: 'color', class: 'colors__swatch', value: t.colorDark,
        'aria-label': `${t.labelSk} — ${S.themeDark}` });
      const push = () => ctx.onTypeColor(t.code, light.value.toUpperCase(), dark.value.toUpperCase());
      light.addEventListener('change', push);
      dark.addEventListener('change', push);
      const row = el('div', { class: 'colors__row' }, [
        el('span', { class: 'colors__icon', html: iconSvg(t.code) }),
        el('span', { class: 'colors__label', textContent: t.labelSk }),
        light, dark,
      ]);
      row.style.setProperty('--cell', ctx.theme === 'dark' ? t.colorDark : t.color);
      return row;
    }),
  );

  const holidayRows = [...ctx.holidays]
    .sort((a, b) => Number(b.needsVerification) - Number(a.needsVerification)
      || a.day.localeCompare(b.day))
    .map((h) => {
      const toggle = el('input', { type: 'checkbox', id: `h-${h.day}` });
      toggle.checked = h.isRestDay;
      toggle.addEventListener('change', () => ctx.onHoliday(h.day, toggle.checked));
      return el('div', { class: `holiday${h.needsVerification ? ' holiday--check' : ''}` }, [
        el('span', { class: 'holiday__date', textContent: formatLongDate(h.day) }),
        el('span', { class: 'holiday__name', textContent: h.name }),
        h.needsVerification
          ? el('span', { class: 'badge badge--warn', textContent: S.holidayNeedsCheck })
          : el('span'),
        el('label', { class: 'holiday__toggle', htmlFor: `h-${h.day}` }, [
          toggle, el('span', { textContent: S.holidayIsRestDay }),
        ]),
      ]);
    });

  root.replaceChildren(
    el('section', { class: 'panel settings' }, [
      el('h2', { class: 'panel__title', textContent: S.settingsTitle }),
      el('div', { class: 'settings__row' }, [
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.settingsDefaultType, htmlFor: 'default-type' }),
          defaultType,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.settingsDefaultHours, htmlFor: 'default-hours' }),
          defaultHours,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.settingsTheme, htmlFor: 'theme' }),
          theme,
        ]),
      ]),
      el('h3', { class: 'settings__heading', textContent: S.settingsColors }),
      colors,
      el('h3', { class: 'settings__heading', textContent: `${S.settingsHolidays} ${ctx.year}` }),
      el('p', { class: 'subtle', textContent: S.settingsHolidaysHint }),
      el('div', { class: 'holidays' }, holidayRows),
    ]),
  );
}
```

Holidays needing verification sort to the top, so the legally uncertain days are
the first thing the user sees for a newly seeded year.

- [ ] **Step 2: Append the settings CSS**

```css
.settings { display: grid; gap: var(--s-4); }
.settings__row { display: flex; gap: var(--s-5); flex-wrap: wrap; }
.settings__heading { font-size: var(--fs-md); font-weight: 600; margin: var(--s-3) 0 0; }
.colors { display: grid; gap: var(--s-2); }
.colors__row {
  display: grid; grid-template-columns: 20px 1fr auto auto;
  align-items: center; gap: var(--s-3);
}
.colors__icon { color: var(--cell); display: inline-flex; }
.colors__label { font-size: var(--fs-sm); }
.colors__swatch {
  width: 34px; height: 24px; padding: 0; cursor: pointer;
  border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: none;
}
.holidays { display: grid; gap: 2px; max-height: 22rem; overflow-y: auto; }
.holiday {
  display: grid; grid-template-columns: 14rem 1fr auto auto;
  align-items: center; gap: var(--s-3);
  padding: var(--s-2); border-radius: var(--r-sm); font-size: var(--fs-sm);
}
.holiday:nth-child(odd) { background: var(--surface-2); }
.holiday--check { outline: 1px solid var(--accent); }
.holiday__date { color: var(--fg-muted); }
.holiday__toggle { display: inline-flex; align-items: center; gap: var(--s-2); cursor: pointer; }
.badge--warn { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 3: Wire the panel and the theme override into `src/main.ts`**

Add a `settingsRoot` sibling to `statsRoot`, a `settingsOpen` flag, and in
`render()`:

```ts
  const settings = await client.call('getSettings');
  defaultHours = Number(settings.default_hours ?? '8');
  document.documentElement.dataset.theme =
    settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : '';

  if (settingsOpen) {
    const holidays = await client.call('listHolidays', isoDate(year, 1, 1), isoDate(year, 12, 31));
    renderSettingsPanel(settingsRoot, {
      settings, types, holidays, year, theme: activeTheme(),
      onSetting: (k, v) => { void client.call('setSetting', k, v).then(render); },
      onTypeColor: (code, color, colorDark) => {
        void client.call('updateDayType', code, { color, colorDark }).then(render);
      },
      onHoliday: (day, isRestDay) => {
        void client.call('setHolidayRestDay', day, isRestDay).then(render);
      },
    });
  }
  settingsRoot.hidden = !settingsOpen;
```

When `theme` is `system` the dataset value is cleared, so the media query in
`styles.css` governs; `light`/`dark` set `data-theme` and win over it.

- [ ] **Step 4: Build and exercise settings**

Run: `npm run build`, reload, open *Nastavenia*.
Expected: three controls on one row; changing the default type or hours and then
seeding a fresh year uses the new values; the theme select switches the whole UI
immediately in both directions and survives a reload; changing a type color
repaints the year heatmap, month tints, picker and legend; the holiday list for
the current year shows all 16 entries with the uncertain ones pinned to the top
carrying the *Overte platnosť* badge; toggling one flips its rest-day status and
the badge disappears on the next render.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the settings panel with holiday overrides"
```

---

### Task 14: Backup, restore and CSV export

**Files:**
- Create: `src/domain/csv.ts`, `src/ui/export.ts`
- Modify: `src/styles.css`, `src/main.ts`
- Test: `tests/domain/csv.test.ts`

**Interfaces:**
- Consumes: `CsvRow` from `repository.ts`; `dayOfWeek`, `SK_WEEKDAYS`; `S`, `formatHours`, `days`.
- Produces: `toCsv(rows: readonly CsvRow[]): string`; `renderExportPanel(root: HTMLElement, ctx: ExportContext): void` where `interface ExportContext { year: number; lastBackupAt: string; entryCount: number; onBackup(): void; onCsv(from: IsoDate, to: IsoDate): void; onRestore(file: File): void }`.

- [ ] **Step 1: Write the failing test**

`tests/domain/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/domain/csv.js';

describe('toCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads the diacritics', () => {
    expect(toCsv([]).startsWith('﻿')).toBe(true);
  });

  it('writes a Slovak header separated by semicolons and CRLF', () => {
    expect(toCsv([]).slice(1)).toBe('Dátum;Deň;Typ;Hodiny;Poznámka\r\n');
  });

  it('writes the weekday name and a decimal comma', () => {
    const csv = toCsv([
      { day: '2026-09-09', typeLabel: 'Home office', hours: 7.5, note: null },
    ]);
    expect(csv).toContain('2026-09-09;streda;Home office;7,5;\r\n');
  });

  it('quotes a note containing a semicolon, a quote, or a newline', () => {
    const csv = toCsv([
      { day: '2026-09-09', typeLabel: 'Lekár', hours: 2, note: 'MUDr. Kováč; kontrola' },
      { day: '2026-09-10', typeLabel: 'Lekár', hours: 2, note: 'povedal "ok"' },
      { day: '2026-09-11', typeLabel: 'Lekár', hours: 2, note: 'prvý\nriadok' },
    ]);
    expect(csv).toContain('"MUDr. Kováč; kontrola"');
    expect(csv).toContain('"povedal ""ok"""');
    expect(csv).toContain('"prvý\nriadok"');
  });

  it('renders an empty note as an empty field', () => {
    const csv = toCsv([{ day: '2026-09-09', typeLabel: 'Dovolenka', hours: 8, note: null }]);
    expect(csv.trimEnd().endsWith(';8;')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/csv.test.ts`
Expected: FAIL — `src/domain/csv.js` does not exist.

- [ ] **Step 3: Implement `src/domain/csv.ts`**

Semicolon separator plus a decimal comma is what Slovak-locale Excel expects; the
BOM is what makes it open the file as UTF-8 rather than as the system codepage.

```ts
import { SK_WEEKDAYS, dayOfWeek } from './dates.js';
import type { CsvRow } from '../db/repository.js';

const SEP = ';';
const EOL = '\r\n';
const HEADER = ['Dátum', 'Deň', 'Typ', 'Hodiny', 'Poznámka'];

function field(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: readonly CsvRow[]): string {
  const lines = [HEADER.join(SEP)];
  for (const r of rows) {
    lines.push([
      r.day,
      SK_WEEKDAYS[dayOfWeek(r.day) - 1]!,
      field(r.typeLabel),
      String(r.hours).replace('.', ','),
      field(r.note ?? ''),
    ].join(SEP));
  }
  return `﻿${lines.join(EOL)}${EOL}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/domain/csv.test.ts`
Expected: PASS — all five cases.

- [ ] **Step 5: Implement `src/ui/export.ts`**

```ts
import { isoDate, type IsoDate } from '../domain/dates.js';
import { el } from './dom.js';
import { S } from './strings.js';

export interface ExportContext {
  year: number;
  lastBackupAt: string;
  entryCount: number;
  onBackup(): void;
  onCsv(from: IsoDate, to: IsoDate): void;
  onRestore(file: File): void;
}

/** Triggers a download from the extension page. */
export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function staleBackup(lastBackupAt: string): boolean {
  if (!lastBackupAt) return true;
  const then = Date.parse(`${lastBackupAt}T00:00:00Z`);
  if (Number.isNaN(then)) return true;
  return Date.now() - then > 30 * 24 * 3600 * 1000;
}

export function renderExportPanel(root: HTMLElement, ctx: ExportContext): void {
  const from = el('input', { class: 'field__input', type: 'date', id: 'csv-from',
    value: isoDate(ctx.year, 1, 1) });
  const to = el('input', { class: 'field__input', type: 'date', id: 'csv-to',
    value: isoDate(ctx.year, 12, 31) });

  const file = el('input', { type: 'file', accept: '.sqlite,.db', hidden: true });
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    if (picked) ctx.onRestore(picked);
    file.value = '';
  });

  const notice = el('p', {
    class: staleBackup(ctx.lastBackupAt) ? 'notice notice--warn' : 'subtle',
    textContent: !ctx.lastBackupAt
      ? S.backupNever
      : staleBackup(ctx.lastBackupAt)
        ? S.backupStale
        : S.backupLast.replace('{date}', ctx.lastBackupAt),
  });

  root.replaceChildren(
    el('section', { class: 'panel export' }, [
      el('h2', { class: 'panel__title', textContent: S.exportMenu }),
      notice,
      el('div', { class: 'export__row' }, [
        el('button', { class: 'btn', type: 'button', textContent: S.exportBackup,
          onclick: ctx.onBackup }),
        el('button', { class: 'btn', type: 'button', textContent: S.importBackup,
          onclick: () => file.click() }),
        file,
      ]),
      el('div', { class: 'export__row' }, [
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.rangeFrom, htmlFor: 'csv-from' }), from,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.rangeTo, htmlFor: 'csv-to' }), to,
        ]),
        el('button', { class: 'btn', type: 'button', textContent: S.exportCsv,
          onclick: () => ctx.onCsv(from.value, to.value) }),
      ]),
    ]),
  );
}
```

- [ ] **Step 6: Wire export into `src/main.ts`**

Add the imports this block needs: `download`, `renderExportPanel` from
`./ui/export.js`, `toCsv` from `./domain/csv.js`, `todayIso` from
`./domain/dates.js`, and `days as skDays` from `./ui/strings.js`.

```ts
  if (exportOpen) {
    const settings2 = await client.call('getSettings');
    renderExportPanel(exportRoot, {
      year,
      lastBackupAt: settings2.last_backup_at ?? '',
      entryCount: range.entries.length,
      onBackup: () => {
        void (async () => {
          const bytes = await client.call('exportDb');
          download(`pracovny-dennik-${todayIso()}.sqlite`,
            new Blob([bytes], { type: 'application/vnd.sqlite3' }));
          await client.call('setSetting', 'last_backup_at', todayIso());
          await render();
        })();
      },
      onCsv: (f, t) => {
        void (async () => {
          const rows = await client.call('csvRows', f, t);
          download(`pracovny-dennik-${f}_${t}.csv`,
            new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
        })();
      },
      onRestore: (fileHandle) => {
        void (async () => {
          const count = (await client.call('loadRange', isoDate(year, 1, 1), isoDate(year, 12, 31)))
            .entries.length;
          if (!confirm(S.importConfirm.replace('{count}', skDays(count)))) return;
          const bytes = new Uint8Array(await fileHandle.arrayBuffer());
          await client.call('importDb', bytes);
          alert(S.importDone);
          location.reload();
        })();
      },
    });
  }
  exportRoot.hidden = !exportOpen;
```

`importDb` closes and reopens the pooled file inside the worker, then the page
reloads so every view re-reads from the restored database.

- [ ] **Step 7: Append the export CSS**

```css
.export { display: grid; gap: var(--s-4); }
.export__row { display: flex; gap: var(--s-3); align-items: flex-end; flex-wrap: wrap; }
.notice {
  margin: 0; padding: var(--s-3);
  border-radius: var(--r-md); font-size: var(--fs-sm);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--surface));
}
.notice--warn {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--danger) 35%, var(--surface));
}
```

- [ ] **Step 8: Build and exercise the full round trip**

Run: `npm run build`, reload, open *Export*.
1. Click the backup button — a `.sqlite` file downloads and the notice becomes
   `Posledná záloha: <dnes>`.
2. Open the downloaded file with any SQLite viewer and confirm `day_entry` holds
   the expected rows.
3. Export a CSV for the year, open it in Excel — Slovak diacritics intact,
   columns split correctly, `7,5` in the hours column.
4. Change a few days, then restore the backup: the confirm dialog names the
   current entry count in Slovak, and after the reload the changes are gone.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add backup, restore and CSV export"
```

---

### Task 15: Localization sweep, accessibility pass and README

The finishing task. Nothing new is built; the product is inspected as a whole
against the two standards the user asked for — fully Slovak, and visually
professional.

**Files:**
- Create: `README.md`, `docs/manual-qa.md`
- Modify: whatever the sweep turns up

**Interfaces:**
- Consumes: everything.
- Produces: no new exports.

- [ ] **Step 1: Prove no English reaches the screen**

Run:

```bash
grep -rnE "textContent:\s*'[A-Za-z]|aria-label':\s*'[A-Za-z]|placeholder:\s*'[A-Za-z]" src/ui src/main.ts
```

Expected: every hit resolves to an `S.*` reference or a Slovak literal that
belongs in `strings.ts`. Move any stray literal into `S` and re-run until the
only matches are property names, not values.

Then read `src/ui/strings.ts` end to end and check each string for correct
diacritics and natural Slovak — `Pracovná cesta`, not `Pracovna cesta`.

- [ ] **Step 2: Add the missing localization surfaces**

Confirm each of these is Slovak, fixing any that is not:
`<html lang="sk">`, `<title>`, the manifest `name` and `description`, the
`chrome.action.default_title`, every `aria-label`, the two `confirm`/`alert`
strings, the CSV header, and the downloaded filenames
(`pracovny-dennik-…`).

- [ ] **Step 3: Keyboard and screen-reader pass**

With the mouse untouched, Tab through the whole app in each view. Confirm:
every control is reachable, the focus ring is visible on all of them in both
themes, the segmented control announces its pressed state, the type picker
behaves as a radio group, and the holiday checkboxes are labelled. Fix anything
that fails by adding the missing `aria-*` attribute or `htmlFor`/`id` pair.

- [ ] **Step 4: Visual pass**

Check at 1180px, 900px and 700px window widths, in light and dark:
no horizontal scrollbar; the year grid stays on one screen; nothing shifts when
a panel opens; tabular numerals keep the stats columns aligned; hover and focus
states are present on every clickable surface; the six type colors remain
distinguishable side by side in both themes. Adjust tokens — never one-off pixel
values — where something is off.

- [ ] **Step 5: Write `README.md`**

Cover: what the extension is, how to build (`npm install`, `npm run build`), how
to load it unpacked, where the data lives (OPFS inside the browser profile) and
the warning that clearing browser data destroys it, how to back up and restore,
and a note that the Slovak holiday table is seeded per year and editable in
Settings because the law changes. Keep it under a page.

- [ ] **Step 6: Write `docs/manual-qa.md`**

The repeatable smoke checklist that automated tests cannot cover: fresh install
seeds the current year; the database survives a browser restart; editing a day
persists; switching views keeps the date; backup, CSV and restore all work; the
theme override survives a reload.

- [ ] **Step 7: Run the full suite and a clean build**

Run: `npm test && npm run build`
Expected: every test passes and `tsc --noEmit` reports no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: add README and manual QA checklist; polish localization and a11y"
```

---
