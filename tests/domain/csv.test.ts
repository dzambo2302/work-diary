import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/domain/csv.js';

const visit = {
  day: '2026-09-09', typeLabel: 'Lekár',
  startTime: '08:00', endTime: '10:00', hours: 2,
};

describe('toCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads the diacritics', () => {
    expect(toCsv([]).startsWith('﻿')).toBe(true);
  });

  it('writes a Slovak header separated by semicolons and CRLF', () => {
    expect(toCsv([]).slice(1)).toBe('Dátum;Deň;Typ;Od;Do;Hodiny;Poznámka\r\n');
  });

  it('writes the weekday name, the shift and a decimal comma', () => {
    const csv = toCsv([
      {
        day: '2026-09-09', typeLabel: 'Home office',
        startTime: '06:00', endTime: '14:00', hours: 7.5, note: null,
      },
    ]);
    expect(csv).toContain('2026-09-09;streda;Home office;06:00;14:00;7,5;\r\n');
  });

  it('quotes a note containing a semicolon, a quote, or a newline', () => {
    const csv = toCsv([
      { ...visit, day: '2026-09-09', note: 'MUDr. Kováč; kontrola' },
      { ...visit, day: '2026-09-10', note: 'povedal "ok"' },
      { ...visit, day: '2026-09-11', note: 'prvý\nriadok' },
    ]);
    expect(csv).toContain('"MUDr. Kováč; kontrola"');
    expect(csv).toContain('"povedal ""ok"""');
    expect(csv).toContain('"prvý\nriadok"');
  });

  it('renders an empty note as an empty field', () => {
    const csv = toCsv([{
      day: '2026-09-09', typeLabel: 'Dovolenka',
      startTime: '06:00', endTime: '14:30', hours: 8, note: null,
    }]);
    expect(csv.trimEnd().endsWith(';8;')).toBe(true);
  });
});
