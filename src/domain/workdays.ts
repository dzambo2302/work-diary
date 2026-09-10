import { datesInRange, isWeekend, isoDate, type IsoDate } from './dates.js';
import { slovakHolidays } from './holidays-sk.js';

/** The days of `year` that are legally non-working holidays. */
export function restDaySet(year: number): Set<IsoDate> {
  return new Set(
    slovakHolidays(year).filter((h) => h.isRestDay).map((h) => h.day),
  );
}

/** Every Mon–Fri from `from` to `to` inclusive that is not in `restDays`. */
export function workdaysInRange(
  from: IsoDate,
  to: IsoDate,
  restDays: ReadonlySet<IsoDate>,
): IsoDate[] {
  return datesInRange(from, to).filter((d) => !isWeekend(d) && !restDays.has(d));
}

/** Every Mon–Fri of `year` that is not in `restDays`. */
export function workdaysInYear(year: number, restDays: ReadonlySet<IsoDate>): IsoDate[] {
  return workdaysInRange(isoDate(year, 1, 1), isoDate(year, 12, 31), restDays);
}
