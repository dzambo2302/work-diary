export type IsoDate = string; // 'YYYY-MM-DD'

export const SK_WEEKDAYS = [
  'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa',
] as const;

export const SK_MONTHS = [
  'január', 'február', 'marec', 'apríl', 'máj', 'jún',
  'júl', 'august', 'september', 'október', 'november', 'december',
] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIso(d: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(d);
  if (!m) throw new Error(`Invalid ISO date: ${d}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Days since 1970-01-01, via Howard Hinnant's days_from_civil. Pure integer
 * arithmetic, so no timezone or DST transition can shift a date.
 */
export function toDayNumber(d: IsoDate): number {
  const { year, month, day } = parseIso(d);
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): IsoDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return isoDate(y + (month <= 2 ? 1 : 0), month, day);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** 1 = Monday … 7 = Sunday (ISO-8601). */
export function dayOfWeek(d: IsoDate): number {
  return (((toDayNumber(d) + 3) % 7) + 7) % 7 + 1;
}

export function isWeekend(d: IsoDate): boolean {
  return dayOfWeek(d) >= 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}`);
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1]!;
}

export function datesInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  const out: IsoDate[] = [];
  for (let n = start; n <= end; n += 1) out.push(fromDayNumber(n));
  return out;
}

export function todayIso(): IsoDate {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
