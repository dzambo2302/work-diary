import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/domain/stats.js';
import { DAY_TYPES } from '../../src/domain/day-types.js';
import type { DayTypeRow } from '../../src/db/repository.js';

const types: DayTypeRow[] = DAY_TYPES.map((t) => ({
  code: t.code, labelSk: t.labelSk, icon: t.icon, color: t.color,
  colorDark: t.colorDark, countsAsWork: t.countsAsWork, sortOrder: t.sortOrder,
}));

describe('summarize', () => {
  it('orders by the type sort order, not by the SQL row order', () => {
    const s = summarize(
      [
        { typeCode: 'vacation', days: 5, hours: 40 },
        { typeCode: 'office', days: 10, hours: 78 },
      ],
      types, 'light',
    );
    expect(s.totals.map((t) => t.code)).toEqual(['office', 'vacation']);
  });

  it('omits types with no rows in the period', () => {
    const s = summarize([{ typeCode: 'office', days: 3, hours: 24 }], types, 'light');
    expect(s.totals).toHaveLength(1);
  });

  it('totals days and hours, and counts worked hours separately', () => {
    const s = summarize(
      [
        { typeCode: 'office', days: 10, hours: 80 },
        { typeCode: 'home', days: 5, hours: 40 },
        { typeCode: 'vacation', days: 4, hours: 32 },
        { typeCode: 'sick', days: 1, hours: 8 },
      ],
      types, 'light',
    );
    expect(s.totalDays).toBe(20);
    expect(s.totalHours).toBe(160);
    expect(s.workedHours).toBe(120); // office + home; travel absent
  });

  it('picks the theme colour', () => {
    const light = summarize([{ typeCode: 'office', days: 1, hours: 8 }], types, 'light');
    const dark = summarize([{ typeCode: 'office', days: 1, hours: 8 }], types, 'dark');
    expect(light.totals[0]!.color).toBe('#3B82F6');
    expect(dark.totals[0]!.color).toBe('#60A5FA');
  });

  it('handles an empty period', () => {
    expect(summarize([], types, 'light')).toEqual({
      totals: [], totalDays: 0, totalHours: 0, workedHours: 0,
    });
  });
});
