import { describe, expect, it } from 'vitest';
import { buildDayIndex } from '../../src/ui/day-model.js';
import { DAY_TYPES } from '../../src/domain/day-types.js';
import type { DayTypeRow } from '../../src/db/repository.js';

const types: DayTypeRow[] = DAY_TYPES.map((t) => ({
  code: t.code, labelSk: t.labelSk, icon: t.icon, color: t.color,
  colorDark: t.colorDark, countsAsWork: t.countsAsWork, sortOrder: t.sortOrder,
}));

const index = (theme: 'light' | 'dark' = 'light') =>
  buildDayIndex(
    [
      {
        day: '2026-09-09', typeCode: 'home',
        startTime: '06:00', endTime: '14:00', hours: 7.5, note: 'šprint',
      },
      {
        day: '2026-09-01', typeCode: 'office',
        startTime: '06:00', endTime: '14:30', hours: 8, note: null,
      },
    ],
    [
      { day: '2026-09-01', name: 'Deň Ústavy Slovenskej republiky', isRestDay: false, needsVerification: false, source: 'seed' },
      { day: '2026-09-15', name: 'Sedembolestná Panna Mária', isRestDay: true, needsVerification: true, source: 'seed' },
    ],
    types,
    theme,
  );

describe('buildDayIndex', () => {
  it('describes a day with an entry', () => {
    const c = index()('2026-09-09');
    expect(c).toMatchObject({
      kind: 'entry', typeCode: 'home', startTime: '06:00', endTime: '14:00', hours: 7.5,
      note: 'šprint', label: 'Home office', color: '#14B8A6',
    });
    expect(c.tooltip).toContain('Home office');
    expect(c.tooltip).toContain('šprint');
  });

  it('puts the shift and its total in the tooltip', () => {
    const c = index()('2026-09-09');
    expect(c.tooltip).toContain('06:00 – 14:00');
    expect(c.tooltip).toContain('7,5');
  });

  it('uses the dark palette when asked', () => {
    expect(index('dark')('2026-09-09').color).toBe('#2DD4BF');
  });

  it('marks weekends', () => {
    const c = index()('2026-09-12');
    expect(c.kind).toBe('weekend');
    expect(c.color).toBeNull();
    expect(c.label).toBe('Víkend');
  });

  it('leaves a day without an entry without a shift', () => {
    const c = index()('2026-09-12');
    expect(c.startTime).toBeNull();
    expect(c.endTime).toBeNull();
    expect(c.hours).toBeNull();
  });

  it('marks rest-day holidays and names them', () => {
    const c = index()('2026-09-15');
    expect(c.kind).toBe('rest');
    expect(c.holidayName).toBe('Sedembolestná Panna Mária');
    expect(c.tooltip).toContain('Sedembolestná Panna Mária');
  });

  it('lets an entry win over a working holiday', () => {
    const c = index()('2026-09-01');
    expect(c.kind).toBe('entry');
    expect(c.typeCode).toBe('office');
    expect(c.holidayName).toBe('Deň Ústavy Slovenskej republiky');
  });

  it('marks a plain weekday with no entry as empty', () => {
    const c = index()('2026-09-10');
    expect(c.kind).toBe('empty');
    expect(c.label).toBe('Bez záznamu');
  });
});
