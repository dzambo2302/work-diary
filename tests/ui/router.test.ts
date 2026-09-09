import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '../../src/ui/router.js';

describe('parseHash', () => {
  it('reads each view', () => {
    expect(parseHash('#/year/2026', '2026-09-09')).toEqual({ view: 'year', date: '2026-01-01' });
    expect(parseHash('#/month/2026-09', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/day/2026-09-09', '2026-09-09')).toEqual({ view: 'day', date: '2026-09-09' });
  });

  it('falls back to the month view on today for junk', () => {
    expect(parseHash('', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/nope/xx', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/day/2026-13-40', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/day/2026-02-30', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
    expect(parseHash('#/month/2026-13', '2026-09-09')).toEqual({ view: 'month', date: '2026-09-01' });
  });
});

describe('formatHash', () => {
  it('round-trips every view', () => {
    for (const s of [
      { view: 'year', date: '2026-01-01' },
      { view: 'month', date: '2026-09-01' },
      { view: 'day', date: '2026-09-09' },
    ] as const) {
      expect(parseHash(formatHash(s), '2026-09-09')).toEqual(s);
    }
  });
});
