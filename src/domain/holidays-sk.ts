import { addDays, isoDate, type IsoDate } from './dates.js';
import { easterSunday } from './easter.js';

export interface HolidaySeed {
  day: IsoDate;
  name: string;
  isRestDay: boolean;
  /** Legally uncertain for this year — surfaced in Settings for confirmation. */
  needsVerification: boolean;
}

interface FixedRule {
  month: number;
  day: number;
  name: string;
  isRestDay: (year: number) => boolean;
  needsVerification: (year: number) => boolean;
}

const never = () => false;
const always = () => true;

/**
 * Slovak law separates a "štátny sviatok" from a "deň pracovného pokoja", and
 * the two have diverged: only the latter is non-working, and several entries
 * are conditional per year under § 4b of zák. 241/1993. These rules encode the
 * current best reading; anything uncertain is flagged rather than guessed, and
 * every seeded row stays editable by the user at runtime.
 */
const FIXED: readonly FixedRule[] = [
  { month: 1, day: 1, name: 'Deň vzniku Slovenskej republiky', isRestDay: always, needsVerification: never },
  { month: 1, day: 6, name: 'Zjavenie Pána (Traja králi)', isRestDay: always, needsVerification: never },
  { month: 5, day: 1, name: 'Sviatok práce', isRestDay: always, needsVerification: never },
  { month: 5, day: 8, name: 'Deň víťazstva nad fašizmom', isRestDay: (y) => y < 2026, needsVerification: (y) => y >= 2026 },
  { month: 7, day: 5, name: 'Sviatok svätého Cyrila a Metoda', isRestDay: always, needsVerification: never },
  { month: 8, day: 29, name: 'Výročie SNP', isRestDay: always, needsVerification: never },
  { month: 9, day: 1, name: 'Deň Ústavy Slovenskej republiky', isRestDay: (y) => y < 2024, needsVerification: never },
  { month: 9, day: 15, name: 'Sedembolestná Panna Mária', isRestDay: (y) => y < 2026, needsVerification: (y) => y >= 2026 },
  { month: 10, day: 28, name: 'Deň vzniku samostatného česko-slovenského štátu', isRestDay: never, needsVerification: never },
  { month: 11, day: 1, name: 'Sviatok Všetkých svätých', isRestDay: always, needsVerification: (y) => y >= 2026 },
  { month: 11, day: 17, name: 'Deň boja za slobodu a demokraciu', isRestDay: never, needsVerification: never },
  { month: 12, day: 24, name: 'Štedrý deň', isRestDay: always, needsVerification: never },
  { month: 12, day: 25, name: 'Prvý sviatok vianočný', isRestDay: always, needsVerification: never },
  { month: 12, day: 26, name: 'Druhý sviatok vianočný', isRestDay: always, needsVerification: never },
];

export function slovakHolidays(year: number): HolidaySeed[] {
  const easter = easterSunday(year);
  const movable: HolidaySeed[] = [
    { day: addDays(easter, -2), name: 'Veľký piatok', isRestDay: true, needsVerification: false },
    { day: addDays(easter, 1), name: 'Veľkonočný pondelok', isRestDay: true, needsVerification: false },
  ];
  const fixed: HolidaySeed[] = FIXED.map((r) => ({
    day: isoDate(year, r.month, r.day),
    name: r.name,
    isRestDay: r.isRestDay(year),
    needsVerification: r.needsVerification(year),
  }));
  return [...fixed, ...movable].sort((a, b) => a.day.localeCompare(b.day));
}
