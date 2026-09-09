import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Db } from '../../src/db/repository.js';

/** Real sqlite-wasm on the in-memory VFS, adapted to the repository's Db port. */
export async function memoryDb(): Promise<Db> {
  const sqlite3 = await sqlite3InitModule();
  const raw = new sqlite3.oo1.DB(':memory:');

  const all = <T>(sql: string, bind?: readonly unknown[]): T[] =>
    raw.exec({
      sql,
      bind: bind ? ([...bind] as never) : undefined,
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as unknown as T[];

  const db: Db = {
    exec(sql, bind) {
      if (bind) raw.exec({ sql, bind: [...bind] as never });
      else raw.exec(sql);
    },
    all,
    get: <T>(sql: string, bind?: readonly unknown[]): T | undefined => all<T>(sql, bind)[0],
    transaction(fn) {
      raw.exec('BEGIN');
      try {
        fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db;
}
