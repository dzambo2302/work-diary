import { describe, expect, it } from 'vitest';
import { DAY_TYPES, isDayTypeCode } from '../../src/domain/day-types.js';
import { iconSvg } from '../../src/domain/icons.js';

describe('DAY_TYPES', () => {
  it('has exactly the six codes in sort order', () => {
    expect(DAY_TYPES.map((t) => t.code)).toEqual([
      'office', 'home', 'vacation', 'sick', 'doctor', 'travel',
    ]);
    expect(DAY_TYPES.map((t) => t.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('counts office, home and travel as work', () => {
    const worked = DAY_TYPES.filter((t) => t.countsAsWork).map((t) => t.code);
    expect(worked).toEqual(['office', 'home', 'travel']);
  });

  it('gives every type a distinct light and dark hex color', () => {
    const light = DAY_TYPES.map((t) => t.color);
    expect(new Set(light).size).toBe(6);
    for (const t of DAY_TYPES) {
      expect(t.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.colorDark).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('narrows unknown strings', () => {
    expect(isDayTypeCode('office')).toBe(true);
    expect(isDayTypeCode('holiday')).toBe(false);
  });
});

describe('iconSvg', () => {
  it('returns inline SVG for every type', () => {
    for (const t of DAY_TYPES) {
      const svg = iconSvg(t.code);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });
});
