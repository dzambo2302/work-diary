import { daysInMonth, isoDate, parseIso, todayIso, type IsoDate } from './domain/dates.js';
import { toCsv } from './domain/csv.js';
import { summarize } from './domain/stats.js';
import { DbClient } from './db/rpc.js';
import type { DayEntry, DayTypeRow } from './db/repository.js';
import { buildDayIndex, type DayCell } from './ui/day-model.js';
import { el } from './ui/dom.js';
import { Router, type ViewState } from './ui/router.js';
import { S, days as skDays } from './ui/strings.js';
import { download, renderExportPanel } from './ui/export.js';
import { renderSettingsPanel } from './ui/settings-panel.js';
import { renderLegend, renderStatsPanel } from './ui/stats-panel.js';
import { renderToolbar } from './ui/toolbar.js';
import { renderDayView } from './ui/day-view.js';
import { installKeyboard } from './ui/keyboard.js';
import { renderMonthView } from './ui/month-view.js';
import { renderYearView } from './ui/year-view.js';

document.title = S.appTitle;

const app = document.querySelector<HTMLDivElement>('#app')!;
const toolbarRoot = el('header', { class: 'toolbar' });
const panelRoot = el('aside', { class: 'panel-root', hidden: true });
const viewRoot = el('main', { class: 'view' });
app.replaceChildren(toolbarRoot, panelRoot, viewRoot);

const client = new DbClient(
  new Worker(new URL('./db/worker.ts', import.meta.url), { type: 'module' }),
);
const router = new Router(todayIso());

/** Only one panel is open at a time; three stacked would push the grid off screen. */
type Panel = 'stats' | 'settings' | 'export' | null;
let openPanel: Panel = null;

// Kept current by render() so handlers installed once always see fresh data.
let currentTypes: DayTypeRow[] = [];
let defaultHours = 8;
let cellFor: (day: IsoDate) => DayCell = () => {
  throw new Error('not loaded');
};

installKeyboard(router, {
  onTypeIndex: (i) => {
    const type = currentTypes[i];
    if (!type || router.current.view !== 'day') return;
    // Keep whatever hours the day already has; only the type changes.
    const entry: DayEntry = {
      day: router.current.date,
      typeCode: type.code,
      hours: cellFor(router.current.date).hours ?? defaultHours,
      note: cellFor(router.current.date).note,
    };
    void client.call('upsertEntry', entry).then(render);
  },
});

function activeTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The date range the current view covers, for stats and exports. */
function rangeFor(state: ViewState): [IsoDate, IsoDate] {
  const { year, month } = parseIso(state.date);
  if (state.view === 'year') return [isoDate(year, 1, 1), isoDate(year, 12, 31)];
  if (state.view === 'month') {
    return [isoDate(year, month, 1), isoDate(year, month, daysInMonth(year, month))];
  }
  return [state.date, state.date];
}

function togglePanel(p: Exclude<Panel, null>): void {
  openPanel = openPanel === p ? null : p;
  void render();
}

async function render(): Promise<void> {
  renderToolbar(toolbarRoot, router, {
    onStats: () => togglePanel('stats'),
    onSettings: () => togglePanel('settings'),
    onExport: () => togglePanel('export'),
    isOpen: (p) => openPanel === p,
  });

  const { year } = parseIso(router.current.date);
  await client.call('ensureYearSeeded', year);

  const [range, types] = await Promise.all([
    client.call('loadRange', isoDate(year, 1, 1), isoDate(year, 12, 31)),
    client.call('listDayTypes'),
  ]);
  const settings = await client.call('getSettings');
  defaultHours = Number(settings.default_hours ?? '8') || 8;
  document.documentElement.dataset.theme =
    settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : '';

  currentTypes = types;
  cellFor = buildDayIndex(range.entries, range.holidays, types, activeTheme());

  if (openPanel === 'stats') {
    const [from, to] = rangeFor(router.current);
    const groups = await client.call('summaryRows', from, to);
    renderStatsPanel(panelRoot, summarize(groups, types, activeTheme()));
  }
  if (openPanel === 'settings') {
    const holidays = await client.call('listHolidays', isoDate(year, 1, 1), isoDate(year, 12, 31));
    renderSettingsPanel(panelRoot, {
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
  if (openPanel === 'export') {
    renderExportPanel(panelRoot, {
      year,
      lastBackupAt: settings.last_backup_at ?? '',
      onBackup: () => {
        void (async () => {
          const bytes = await client.call('exportDb');
          download(
            `pracovny-dennik-${todayIso()}.sqlite`,
            new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }),
          );
          await client.call('setSetting', 'last_backup_at', todayIso());
          await render();
        })();
      },
      onCsv: (f, t) => {
        void (async () => {
          const rows = await client.call('csvRows', f, t);
          download(
            `pracovny-dennik-${f}_${t}.csv`,
            new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
          );
        })();
      },
      onRestore: (picked) => {
        void (async () => {
          if (!confirm(S.importConfirm.replace('{count}', skDays(range.entries.length)))) return;
          const bytes = new Uint8Array(await picked.arrayBuffer());
          await client.call('importDb', bytes);
          alert(S.importDone);
          location.reload();
        })();
      },
    });
  }
  panelRoot.hidden = openPanel === null;

  const openDay = (day: IsoDate) => router.go({ view: 'day', date: day });

  if (router.current.view === 'year') {
    renderYearView(viewRoot, {
      year, cellFor, onPick: openDay,
      onLegend: (node) => renderLegend(node, currentTypes, activeTheme()),
    });
  } else if (router.current.view === 'month') {
    const { month } = parseIso(router.current.date);
    renderMonthView(viewRoot, { year, month, cellFor, onPick: openDay });
  } else {
    renderDayView(viewRoot, {
      day: router.current.date,
      cell: cellFor(router.current.date),
      types,
      theme: activeTheme(),
      defaultHours,
      onSave: (entry) => { void client.call('upsertEntry', entry).then(render); },
      onDelete: (day) => { void client.call('deleteEntry', day).then(render); },
    });
  }
}

router.subscribe(() => {
  void render();
});

void render().catch((e: unknown) => {
  viewRoot.replaceChildren(
    el('div', { class: 'card' }, [
      el('strong', { textContent: S.errorTitle }),
      el('p', { class: 'muted', textContent: String(e) }),
    ]),
  );
});
