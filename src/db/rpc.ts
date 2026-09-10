import type { IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type {
  CsvRow, DayEntry, DayEntryInput, DayTypeRow, HolidayRow, SummaryGroup,
} from './repository.js';

export interface RangeData { entries: DayEntry[]; holidays: HolidayRow[] }

/** The surface the worker exposes. Every method may be async over the wire. */
export interface DiaryApi {
  ensureYearSeeded(year: number): { seeded: boolean; inserted: number };
  loadRange(from: IsoDate, to: IsoDate): RangeData;
  upsertEntry(entry: DayEntryInput): void;
  deleteEntry(day: IsoDate): void;
  listDayTypes(): DayTypeRow[];
  updateDayType(code: DayTypeCode, patch: { labelSk?: string; color?: string; colorDark?: string }): void;
  listHolidays(from: IsoDate, to: IsoDate): HolidayRow[];
  setHolidayRestDay(day: IsoDate, isRestDay: boolean): void;
  getSettings(): Record<string, string>;
  setSetting(key: string, value: string): void;
  summaryRows(from: IsoDate, to: IsoDate): SummaryGroup[];
  csvRows(from: IsoDate, to: IsoDate): CsvRow[];
  exportDb(): Promise<Uint8Array>;
  importDb(bytes: Uint8Array): Promise<void>;
}

export type Method = keyof DiaryApi;

export interface RpcRequest { id: number; method: Method; args: unknown[] }
export type RpcResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

export class DbClient {
  #worker: Worker;
  #next = 1;
  #pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();

  constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.onmessage = (e: MessageEvent<RpcResponse>) => {
      const p = this.#pending.get(e.data.id);
      if (!p) return;
      this.#pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value as never);
      else p.reject(new Error(e.data.error));
    };
    this.#worker.onerror = (e) => {
      for (const [, p] of this.#pending) p.reject(new Error(e.message || 'worker error'));
      this.#pending.clear();
    };
  }

  call<M extends Method>(
    method: M,
    ...args: Parameters<DiaryApi[M]>
  ): Promise<Awaited<ReturnType<DiaryApi[M]>>> {
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: never) => void, reject });
      const req: RpcRequest = { id, method, args: args as unknown[] };
      this.#worker.postMessage(req);
    });
  }

  terminate(): void {
    this.#worker.terminate();
  }
}
