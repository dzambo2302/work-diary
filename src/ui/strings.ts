import { SK_MONTHS, SK_WEEKDAYS, dayOfWeek, parseIso, type IsoDate } from '../domain/dates.js';

/** Slovak needs the genitive month for a full date: "9. septembra 2026". */
const SK_MONTHS_GENITIVE = [
  'januára', 'februára', 'marca', 'apríla', 'mája', 'júna',
  'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra',
] as const;

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

  stats: 'Štatistika',
  settings: 'Nastavenia',
  exportMenu: 'Export',

  typeLabel: 'Typ dňa',
  hoursLabel: 'Počet hodín',
  noteLabel: 'Poznámka',
  notePlaceholder: 'Voliteľná poznámka k dňu…',
  clearDay: 'Vymazať záznam',
  weekend: 'Víkend',
  holiday: 'Sviatok',
  restDay: 'Deň pracovného pokoja',
  workingHoliday: 'Sviatok — pracovný deň',
  noEntry: 'Bez záznamu',

  statsTitle: 'Prehľad obdobia',
  statsDays: 'Dni',
  statsHours: 'Hodiny',
  statsWorkedHours: 'Odpracované hodiny',
  statsEmpty: 'Za toto obdobie nie sú žiadne záznamy.',

  settingsTitle: 'Nastavenia',
  settingsDefaultType: 'Predvolený typ pracovného dňa',
  settingsDefaultHours: 'Predvolený počet hodín',
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
