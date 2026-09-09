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

/** Shapes the SQL GROUP BY rows into a stable, seed-ordered summary. */
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
