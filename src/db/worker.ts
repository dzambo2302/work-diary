import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import * as repo from './repository.js';
import type { Db } from './repository.js';
import type { DiaryApi, RpcRequest, RpcResponse } from './rpc.js';

const DB_PATH = '/diary.sqlite';

type Oo1Db = { exec: (arg: unknown) => unknown; close: () => void };
type Pool = Awaited<ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>['installOpfsSAHPoolVfs']>>;

let db: Db;
let pool: Pool;
let handle: InstanceType<Pool['OpfsSAHPoolDb']>;

function wrap(oo1: Oo1Db): Db {
  const all = <T>(sql: string, bind?: readonly unknown[]): T[] =>
    oo1.exec({
      sql,
      bind: bind ? [...bind] : undefined,
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as T[];

  return {
    exec(sql, bind) {
      if (bind) oo1.exec({ sql, bind: [...bind] });
      else oo1.exec(sql);
    },
    all,
    get: <T>(sql: string, bind?: readonly unknown[]): T | undefined => all<T>(sql, bind)[0],
    transaction(fn) {
      oo1.exec('BEGIN');
      try {
        fn();
        oo1.exec('COMMIT');
      } catch (e) {
        oo1.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

async function open(): Promise<void> {
  const sqlite3 = await sqlite3InitModule();
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'work-diary', initialCapacity: 6 });
  handle = new pool.OpfsSAHPoolDb(DB_PATH);
  db = wrap(handle as unknown as Oo1Db);
  repo.initialize(db);
}

const api: DiaryApi = {
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
  setBreakMinutes: (minutes) => repo.setBreakMinutes(db, minutes),
  summaryRows: (from, to) => repo.summaryRows(db, from, to),
  csvRows: (from, to) => repo.csvRows(db, from, to),

  // exportFile and importDb are asynchronous on SAHPoolUtil.
  exportDb: () => pool.exportFile(DB_PATH),
  importDb: async (bytes) => {
    handle.close();
    await pool.importDb(DB_PATH, bytes);
    handle = new pool.OpfsSAHPoolDb(DB_PATH);
    db = wrap(handle as unknown as Oo1Db);
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
    response = { id, ok: true, value: await fn(...args) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
