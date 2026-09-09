import type { DayTypeCode } from './day-types.js';

/**
 * Hand-authored 24x24 stroke icons in the Lucide style. Written inline rather
 * than pulled from a package so the extension ships no third-party runtime
 * code and the CSP stays as tight as possible. `currentColor` lets each icon
 * take its day type's color from CSS.
 */
const PATHS: Record<DayTypeCode, string> = {
  office:
    '<rect x="3" y="3" width="10" height="18" rx="1"/>' +
    '<path d="M13 9h7a1 1 0 0 1 1 1v11h-8"/>' +
    '<path d="M6 7h2M6 11h2M6 15h2M16 13h2M16 17h2"/>',
  home:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>' +
    '<path d="M9.5 21v-6h5v6"/>',
  vacation:
    '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z"/>' +
    '<path d="M12 12v7a2.5 2.5 0 0 0 5 0"/>',
  sick:
    '<path d="M14 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0Z"/>',
  doctor:
    '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M6 3H4M14 3h2"/>' +
    '<path d="M10 12v3a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="10" r="2"/>',
  travel:
    '<path d="M2 13 22 6l-7 15-3-8-10-0Z"/>',
};

export function iconSvg(code: DayTypeCode): string {
  return (
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${PATHS[code]}</svg>`
  );
}

/** Icons that are not day types: toolbar affordances. */
const UI_PATHS = {
  sun:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2' +
    'M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
} as const;

export type UiIconName = keyof typeof UI_PATHS;

export function uiIconSvg(name: UiIconName): string {
  return (
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${UI_PATHS[name]}</svg>`
  );
}
