import { SK_MONTHS, SK_WEEKDAYS, dayOfWeek, parseIso, type IsoDate } from '../domain/dates.js';
import type { TimeOfDay } from '../domain/times.js';

/** Slovak needs the genitive month for a full date: "9. septembra 2026". */
const SK_MONTHS_GENITIVE = [
  'januára', 'februára', 'marca', 'apríla', 'mája', 'júna',
  'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra',
] as const;

/** Column headers for the month calendar, Monday first. */
export const SK_WEEKDAYS_SHORT = ['po', 'ut', 'st', 'št', 'pi', 'so', 'ne'] as const;

/** Slovak has three plural forms: 1 / 2–4 / everything else. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function days(n: number): string {
  return `${n} ${plural(n, 'deň', 'dni', 'dní')}`;
}

export function hours(n: number): string {
  return `${formatHours(n)} ${plural(n, 'hodina', 'hodiny', 'hodín')}`;
}

/** Slovak uses a decimal comma; whole numbers render without a fraction. */
export function formatHours(n: number): string {
  return String(n).replace('.', ',');
}

/** A shift as the user reads it: "06:00 - 14:30". */
export function formatShift(start: TimeOfDay, end: TimeOfDay): string {
  return `${start} – ${end}`;
}

export function formatLongDate(d: IsoDate): string {
  const { year, month, day } = parseIso(d);
  const weekday = SK_WEEKDAYS[dayOfWeek(d) - 1]!;
  return `${weekday} ${day}. ${SK_MONTHS_GENITIVE[month - 1]!} ${year}`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${SK_MONTHS[month - 1]!} ${year}`;
}

/**
 * Every word the user reads. Nothing destined for the screen may be written
 * inline in a view module — it belongs here.
 */
export const S = {
  appTitle: 'Pracovný denník',

  viewDay: 'Deň',
  viewMonth: 'Mesiac',
  viewYear: 'Rok',
  today: 'Dnes',
  previous: 'Predchádzajúce obdobie',
  next: 'Nasledujúce obdobie',
  viewSwitcher: 'Prepínač zobrazenia',

  themeToLight: 'Prepnúť na svetlý vzhľad',
  themeToDark: 'Prepnúť na tmavý vzhľad',

  stats: 'Štatistika',
  settings: 'Nastavenia',
  exportMenu: 'Export',

  typeLabel: 'Typ dňa',
  startLabel: 'Od',
  endLabel: 'Do',
  hoursLabel: 'Počet hodín',
  breakDeducted: 'Po odpočítaní {minutes} min prestávky',
  noteLabel: 'Poznámka',
  notePlaceholder: 'Voliteľná poznámka k dňu…',
  clearDay: 'Vymazať záznam',
  weekend: 'Víkend',
  holiday: 'Sviatok',
  restDay: 'Deň pracovného pokoja',
  workingHoliday: 'Sviatok — pracovný deň',
  noEntry: 'Bez záznamu',
  todayBadge: 'Dnes',
  saved: 'Uložené',

  statsTitle: 'Prehľad obdobia',
  statsTotal: 'Spolu',
  statsWorkedHours: 'Odpracované',
  statsEmpty: 'Za toto obdobie nie sú žiadne záznamy.',

  settingsTitle: 'Nastavenia',
  settingsDefaultType: 'Predvolený typ pracovného dňa',
  settingsDefaultStart: 'Predvolený začiatok',
  settingsDefaultEnd: 'Predvolený koniec',
  settingsShiftHint:
    'Počet hodín sa počíta z časov. Zo zmeny dlhšej ako 6 hodín sa odpočíta 30-minútová prestávka.',
  settingsTheme: 'Vzhľad',
  themeSystem: 'Podľa systému',
  themeLight: 'Svetlý',
  themeDark: 'Tmavý',
  settingsColors: 'Farby typov dní',
  settingsHolidays: 'Sviatky',
  settingsHolidaysHint:
    'Zákon rozlišuje štátny sviatok a deň pracovného pokoja a niektoré dni sa menia podľa roka. Skontrolujte označené riadky a v prípade potreby ich upravte.',
  holidayNeedsCheck: 'Overte platnosť',
  holidayIsRestDay: 'Deň pracovného pokoja',

  exportBackup: 'Záloha databázy (.sqlite)',
  exportCsv: 'Export do CSV',
  importBackup: 'Obnoviť zo zálohy…',
  importConfirm:
    'Obnovenie prepíše celý denník. Aktuálne máte {count} — naozaj chcete pokračovať?',
  importDone: 'Denník bol obnovený zo zálohy.',
  backupNever: 'Zatiaľ ste nevytvorili žiadnu zálohu.',
  backupLast: 'Posledná záloha: {date}',
  backupStale:
    'Posledná záloha je staršia ako 30 dní. Databáza je uložená v profile prehliadača — bez zálohy o ňu môžete prísť.',
  rangeFrom: 'Od',
  rangeTo: 'Do',

  errorTitle: 'Nastala chyba',
  loading: 'Načítavam…',
} as const;
