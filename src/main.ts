import { DbClient } from './db/rpc.js';
import { parseIso, todayIso } from './domain/dates.js';

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

void boot().catch((e: unknown) => {
  app.textContent = `Chyba: ${String(e)}`;
});
