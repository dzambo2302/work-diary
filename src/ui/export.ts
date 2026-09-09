import { isoDate, type IsoDate } from '../domain/dates.js';
import { el } from './dom.js';
import { S } from './strings.js';

export interface ExportContext {
  year: number;
  lastBackupAt: string;
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
  const from = el('input', {
    class: 'field__input', type: 'date', id: 'csv-from', value: isoDate(ctx.year, 1, 1),
  });
  const to = el('input', {
    class: 'field__input', type: 'date', id: 'csv-to', value: isoDate(ctx.year, 12, 31),
  });

  const file = el('input', { type: 'file', accept: '.sqlite,.db', hidden: true });
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    if (picked) ctx.onRestore(picked);
    file.value = '';
  });

  const stale = staleBackup(ctx.lastBackupAt);
  const notice = el('p', {
    class: stale ? 'notice notice--warn' : 'subtle',
    textContent: !ctx.lastBackupAt
      ? S.backupNever
      : stale
        ? S.backupStale
        : S.backupLast.replace('{date}', ctx.lastBackupAt),
  });

  root.replaceChildren(
    el('section', { class: 'panel export' }, [
      el('h2', { class: 'panel__title', textContent: S.exportMenu }),
      notice,
      el('div', { class: 'export__row' }, [
        el('button', {
          class: 'btn', type: 'button', textContent: S.exportBackup, onclick: ctx.onBackup,
        }),
        el('button', {
          class: 'btn', type: 'button', textContent: S.importBackup,
          onclick: () => file.click(),
        }),
        file,
      ]),
      el('div', { class: 'export__row' }, [
        el('label', { class: 'field', htmlFor: 'csv-from' }, [
          el('span', { class: 'field__label', textContent: S.rangeFrom }), from,
        ]),
        el('label', { class: 'field', htmlFor: 'csv-to' }, [
          el('span', { class: 'field__label', textContent: S.rangeTo }), to,
        ]),
        el('button', {
          class: 'btn', type: 'button', textContent: S.exportCsv,
          onclick: () => ctx.onCsv(from.value, to.value),
        }),
      ]),
    ]),
  );
}
