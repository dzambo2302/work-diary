import { parseIso, todayIso } from './domain/dates.js';
import { DbClient } from './db/rpc.js';
import { el } from './ui/dom.js';
import { Router } from './ui/router.js';
import { S } from './ui/strings.js';
import { renderToolbar } from './ui/toolbar.js';

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

  panelRoot.hidden = openPanel === null;

  viewRoot.replaceChildren(
    el('div', { class: 'card', textContent: `${router.current.view} — ${router.current.date}` }),
  );
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
