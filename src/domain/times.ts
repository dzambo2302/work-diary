export type TimeOfDay = string; // 'HH:MM', 00:00–23:59

export const DEFAULT_START: TimeOfDay = '06:00';
export const DEFAULT_END: TimeOfDay = '14:30';

/**
 * The unpaid break the Labour Code requires once a shift runs past six hours.
 * Deducting it is what makes the default 6:00–14:30 shift eight hours rather
 * than eight and a half.
 */
export const BREAK_MINUTES = 30;
const BREAK_AFTER_MINUTES = 6 * 60;

const MINUTES_PER_DAY = 24 * 60;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function parseTime(t: TimeOfDay): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new Error(`Invalid time of day: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatTime(minutes: number): TimeOfDay {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Minutes worked between two clock times. An end before the start means the
 * shift crossed midnight; an end equal to the start means an empty day, not a
 * round-the-clock one.
 */
export function spanMinutes(start: TimeOfDay, end: TimeOfDay): number {
  const from = parseTime(start);
  const to = parseTime(end);
  return to >= from ? to - from : to + MINUTES_PER_DAY - from;
}

/**
 * Paid minutes in a span: the break comes off only once the shift passes six
 * hours, and never drags the result back under six — otherwise a 6:15 shift
 * would count for less than a 6:00 one.
 */
function paidMinutes(span: number): number {
  if (span <= BREAK_AFTER_MINUTES) return span;
  return Math.min(span, Math.max(span - BREAK_MINUTES, BREAK_AFTER_MINUTES));
}

/** The hours a day is worth, as stored on the entry and summed by the stats. */
export function computeHours(start: TimeOfDay, end: TimeOfDay): number {
  return Math.round((paidMinutes(spanMinutes(start, end)) / 60) * 100) / 100;
}

/**
 * The inverse of {@link computeHours}, used to carry an entry written under the
 * old hours-only field over to a start/end pair without changing its total.
 */
export function endTimeForHours(start: TimeOfDay, hours: number): TimeOfDay {
  const paid = Math.round(hours * 60);
  const span = paid <= BREAK_AFTER_MINUTES ? paid : paid + BREAK_MINUTES;
  return formatTime(parseTime(start) + Math.min(span, MINUTES_PER_DAY - 1));
}

/**
 * Chromium renders <input type="time"> in the browser's UI locale and offers no
 * way to override it, so an en-US browser shows "02:30 PM" however Slovak the
 * page is. These three keep a plain text field behaving as a 24-hour one.
 */

const MAX_DIGITS = 4;

const digitsOf = (raw: string): string => raw.replace(/\D/g, '').slice(0, MAX_DIGITS);

/** What the field shows mid-typing: digits, with the colon appearing at the third. */
export function maskTimeInput(raw: string): string {
  const d = digitsOf(raw);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/**
 * What the field settles on when the user leaves it. One or two digits are an
 * hour, three or four are h:mm. Anything out of range returns the fallback —
 * snapping back to the last good value beats silently storing a typo.
 */
export function normalizeTimeInput(raw: string, fallback: TimeOfDay): TimeOfDay {
  const d = digitsOf(raw.trim());
  if (d.length === 0) return fallback;

  const [hours, minutes] = d.length <= 2
    ? [Number(d), 0]
    : [Number(d.slice(0, d.length - 2)), Number(d.slice(-2))];

  if (hours > 23 || minutes > 59) return fallback;
  return formatTime(hours * 60 + minutes);
}

/** Arrow-key stepping, wrapping at midnight the way the native control did. */
export function stepTime(t: TimeOfDay, minutes: number): TimeOfDay {
  return formatTime(parseTime(t) + minutes);
}
