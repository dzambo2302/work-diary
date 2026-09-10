import { isWeekend, todayIso, type IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type { DayEntry, DayTypeRow, HolidayRow } from '../db/repository.js';
import type { TimeOfDay } from '../domain/times.js';
import { S, formatHours, formatLongDate, formatShift } from './strings.js';

export type DayKind = 'entry' | 'weekend' | 'rest' | 'empty';

export interface DayCell {
  day: IsoDate;
  kind: DayKind;
  isToday: boolean;
  typeCode: DayTypeCode | null;
  label: string;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
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
  const today = todayIso();

  return (day: IsoDate): DayCell => {
    const holiday = holidayByDay.get(day) ?? null;
    const holidayName = holiday?.name ?? null;
    const entry = entryByDay.get(day);

    if (entry) {
      const type = typeByCode.get(entry.typeCode);
      const label = type?.labelSk ?? entry.typeCode;
      const parts = [
        formatLongDate(day), label,
        formatShift(entry.startTime, entry.endTime), `${formatHours(entry.hours)} h`,
      ];
      if (entry.note) parts.push(entry.note);
      if (holidayName) parts.push(holidayName);
      return {
        day, kind: 'entry', isToday: day === today, typeCode: entry.typeCode, label,
        startTime: entry.startTime, endTime: entry.endTime,
        hours: entry.hours, note: entry.note, holidayName,
        color: type ? colorOf(type) : null,
        tooltip: parts.join(' · '),
      };
    }

    if (holiday?.isRestDay) {
      return {
        day, kind: 'rest', isToday: day === today, typeCode: null, label: S.restDay,
        startTime: null, endTime: null, hours: null,
        note: null, holidayName, color: null,
        tooltip: `${formatLongDate(day)} · ${holidayName ?? S.holiday}`,
      };
    }

    if (isWeekend(day)) {
      return {
        day, kind: 'weekend', isToday: day === today, typeCode: null, label: S.weekend,
        startTime: null, endTime: null, hours: null,
        note: null, holidayName, color: null,
        tooltip: `${formatLongDate(day)} · ${S.weekend}`,
      };
    }

    return {
      day, kind: 'empty', isToday: day === today, typeCode: null, label: S.noEntry,
      startTime: null, endTime: null, hours: null,
      note: null, holidayName, color: null,
      tooltip: holidayName
        ? `${formatLongDate(day)} · ${holidayName} (${S.workingHoliday})`
        : `${formatLongDate(day)} · ${S.noEntry}`,
    };
  };
}
