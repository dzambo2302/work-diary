import { SK_WEEKDAYS, dayOfWeek } from './dates.js';
import type { CsvRow } from '../db/repository.js';

/**
 * Slovak-locale Excel expects a semicolon separator and a decimal comma, and
 * needs the BOM to open the file as UTF-8 rather than the system codepage.
 */
const SEP = ';';
const EOL = '\r\n';
const BOM = '﻿';
const HEADER = ['Dátum', 'Deň', 'Typ', 'Od', 'Do', 'Hodiny', 'Poznámka'];

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
      r.startTime,
      r.endTime,
      String(r.hours).replace('.', ','),
      field(r.note ?? ''),
    ].join(SEP));
  }
  return `${BOM}${lines.join(EOL)}${EOL}`;
}
