export type DayTypeCode = 'office' | 'home' | 'vacation' | 'sick' | 'doctor' | 'travel';

export interface DayTypeSeed {
  code: DayTypeCode;
  labelSk: string;
  icon: string;        // key into icons.ts
  color: string;       // light theme
  colorDark: string;   // dark theme
  countsAsWork: boolean;
  sortOrder: number;
}

export const DAY_TYPES: readonly DayTypeSeed[] = [
  { code: 'office',   labelSk: 'Práca v kancelárii', icon: 'office',   color: '#3B82F6', colorDark: '#60A5FA', countsAsWork: true,  sortOrder: 1 },
  { code: 'home',     labelSk: 'Home office',        icon: 'home',     color: '#14B8A6', colorDark: '#2DD4BF', countsAsWork: true,  sortOrder: 2 },
  { code: 'vacation', labelSk: 'Dovolenka',          icon: 'vacation', color: '#F59E0B', colorDark: '#FBBF24', countsAsWork: false, sortOrder: 3 },
  { code: 'sick',     labelSk: 'Péenka / sick day',  icon: 'sick',     color: '#EF4444', colorDark: '#F87171', countsAsWork: false, sortOrder: 4 },
  { code: 'doctor',   labelSk: 'Lekár',              icon: 'doctor',   color: '#8B5CF6', colorDark: '#A78BFA', countsAsWork: false, sortOrder: 5 },
  { code: 'travel',   labelSk: 'Pracovná cesta',     icon: 'travel',   color: '#EC4899', colorDark: '#F472B6', countsAsWork: true,  sortOrder: 6 },
] as const;

const CODES = new Set<string>(DAY_TYPES.map((t) => t.code));

export function isDayTypeCode(v: string): v is DayTypeCode {
  return CODES.has(v);
}
