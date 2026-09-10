import { describe, expect, it } from 'vitest';
import {
  DEFAULT_END, DEFAULT_START, computeHours, endTimeForHours,
  formatTime, isTimeOfDay, parseTime, spanMinutes,
} from '../../src/domain/times.js';

describe('parseTime', () => {
  it('reads a time as minutes since midnight', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('06:00')).toBe(360);
    expect(parseTime('14:30')).toBe(870);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('rejects a malformed time', () => {
    expect(() => parseTime('6:00')).toThrow();
    expect(() => parseTime('06:00:00')).toThrow();
    expect(() => parseTime('')).toThrow();
  });

  it('rejects an out-of-range time', () => {
    expect(() => parseTime('24:00')).toThrow();
    expect(() => parseTime('12:60')).toThrow();
  });
});

describe('formatTime', () => {
  it('pads both parts to two digits', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(870)).toBe('14:30');
  });

  it('wraps past midnight', () => {
    expect(formatTime(1470)).toBe('00:30');
  });
});

describe('isTimeOfDay', () => {
  it('accepts a well-formed time', () => {
    expect(isTimeOfDay('14:30')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isTimeOfDay('8')).toBe(false);
    expect(isTimeOfDay(undefined)).toBe(false);
    expect(isTimeOfDay('25:00')).toBe(false);
  });
});

describe('spanMinutes', () => {
  it('measures a shift within one day', () => {
    expect(spanMinutes('06:00', '14:30')).toBe(510);
  });

  it('wraps a shift that ends after midnight', () => {
    expect(spanMinutes('22:00', '06:00')).toBe(480);
  });

  it('treats an equal start and end as no time at all', () => {
    expect(spanMinutes('08:00', '08:00')).toBe(0);
  });
});

describe('computeHours', () => {
  it('deducts the break from the default shift', () => {
    expect(computeHours('06:00', '14:30')).toBe(8);
  });

  it('leaves a six-hour shift untouched', () => {
    expect(computeHours('08:00', '14:00')).toBe(6);
  });

  it('does not deduct a break from a short day', () => {
    expect(computeHours('08:00', '10:00')).toBe(2);
  });

  it('never lets the break push a shift below six hours', () => {
    expect(computeHours('08:00', '14:15')).toBe(6);
  });

  it('deducts the whole break once past the plateau', () => {
    expect(computeHours('08:00', '14:45')).toBe(6.25);
  });

  it('counts a shift that runs past midnight', () => {
    expect(computeHours('22:00', '06:30')).toBe(8);
  });

  it('is zero when the day has no span', () => {
    expect(computeHours('08:00', '08:00')).toBe(0);
  });

  it('rounds away floating-point dust', () => {
    expect(computeHours('09:00', '17:20')).toBe(7.83);
  });
});

describe('endTimeForHours', () => {
  it('finds the end that yields a full working day', () => {
    expect(endTimeForHours('06:00', 8)).toBe('14:30');
  });

  it('finds the end of a short day, where no break applies', () => {
    expect(endTimeForHours('06:00', 4)).toBe('10:00');
  });

  it('round-trips through computeHours', () => {
    for (const h of [0, 2, 6, 7.5, 8, 12]) {
      expect(computeHours('06:00', endTimeForHours('06:00', h))).toBe(h);
    }
  });
});

describe('the shipped defaults', () => {
  it('are a 6:00–14:30 shift worth eight hours', () => {
    expect(DEFAULT_START).toBe('06:00');
    expect(DEFAULT_END).toBe('14:30');
    expect(computeHours(DEFAULT_START, DEFAULT_END)).toBe(8);
  });
});
