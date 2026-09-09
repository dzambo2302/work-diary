import { isWeekend, type IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type { DayEntry, DayTypeRow, HolidayRow } from '../db/repository.js';
import { S, formatHours, formatLongDate } from './strings.js';

export type DayKind = 'entry' | 'weekend' | 'rest' | 'empty';

export interface DayCell {
  day: IsoDate;
  kind: DayKind;
  typeCode: DayTypeCode | null;
  label: string;
  hours: number | null;
  note: string | null;
  holidayName: string | null;
  color: string | null;
  tooltip: string;
}

/**
 * One function decides what a day *is*, so the year, month and day views can
 * never disagree about a date. Precedence: an entry always wins, then a
 * rest-day holiday, then a weekend, then empty.
 */
export function buildDayIndex(
  entries: readonly DayEntry[],
  holidays: readonly HolidayRow[],
  types: readonly DayTypeRow[],
  theme: 'light' | 'dark',
): (day: IsoDate) => DayCell {
  const entryByDay = new Map(entries.map((e) => [e.day, e]));
  const holidayByDay = new Map(holidays.map((h) => [h.day, h]));
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const colorOf = (t: DayTypeRow) => (theme === 'dark' ? t.colorDark : t.color);

  return (day: IsoDate): DayCell => {
    const holiday = holidayByDay.get(day) ?? null;
    const holidayName = holiday?.name ?? null;
    const entry = entryByDay.get(day);

    if (entry) {
      const type = typeByCode.get(entry.typeCode);
      const label = type?.labelSk ?? entry.typeCode;
      const parts = [formatLongDate(day), label, `${formatHours(entry.hours)} h`];
      if (entry.note) parts.push(entry.note);
      if (holidayName) parts.push(holidayName);
      return {
        day, kind: 'entry', typeCode: entry.typeCode, label,
        hours: entry.hours, note: entry.note, holidayName,
        color: type ? colorOf(type) : null,
        tooltip: parts.join(' · '),
      };
    }

    if (holiday?.isRestDay) {
      return {
        day, kind: 'rest', typeCode: null, label: S.restDay, hours: null,
        note: null, holidayName, color: null,
        tooltip: `${formatLongDate(day)} · ${holidayName ?? S.holiday}`,
      };
    }

    if (isWeekend(day)) {
      return {
        day, kind: 'weekend', typeCode: null, label: S.weekend, hours: null,
        note: null, holidayName, color: null,
        tooltip: `${formatLongDate(day)} · ${S.weekend}`,
      };
    }

    return {
      day, kind: 'empty', typeCode: null, label: S.noEntry, hours: null,
      note: null, holidayName, color: null,
      tooltip: holidayName
        ? `${formatLongDate(day)} · ${holidayName} (${S.workingHoliday})`
        : `${formatLongDate(day)} · ${S.noEntry}`,
    };
  };
}
