import { isoDate, parseIso, todayIso, type IsoDate } from './domain/dates.js';
import { DbClient } from './db/rpc.js';
import type { DayTypeRow } from './db/repository.js';
import { buildDayIndex, type DayCell } from './ui/day-model.js';
import { el } from './ui/dom.js';
import { Router } from './ui/router.js';
import { S } from './ui/strings.js';
import { renderToolbar } from './ui/toolbar.js';
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
let cellFor: (day: IsoDate) => DayCell = () => {
  throw new Error('not loaded');
};

function activeTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  currentTypes = types;
  cellFor = buildDayIndex(range.entries, range.holidays, types, activeTheme());

  panelRoot.hidden = openPanel === null;

  const openDay = (day: IsoDate) => router.go({ view: 'day', date: day });

  if (router.current.view === 'year') {
    renderYearView(viewRoot, { year, cellFor, onPick: openDay });
  } else if (router.current.view === 'month') {
    const { month } = parseIso(router.current.date);
    renderMonthView(viewRoot, { year, month, cellFor, onPick: openDay });
  } else {
    viewRoot.replaceChildren(
      el('div', { class: 'card', textContent: `${router.current.view} — ${router.current.date}` }),
    );
  }
  void currentTypes;
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
