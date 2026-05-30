import { describe, expect, it } from 'vitest';

import {
  formatBtc,
  formatFixed,
  formatInteger,
  formatPct,
  formatSat,
  formatSatAmount,
  localeTag,
} from './format-numbers.js';

describe('localeTag', () => {
  it('maps short locale codes to BCP-47 tags', () => {
    expect(localeTag('en')).toBe('en-US');
    expect(localeTag('nl')).toBe('nl-NL');
    expect(localeTag('es')).toBe('es-ES');
  });
  it('falls back to en-US for null / undefined / unknown', () => {
    expect(localeTag(null)).toBe('en-US');
    expect(localeTag(undefined)).toBe('en-US');
    expect(localeTag('xx')).toBe('en-US');
  });
});

describe('formatInteger', () => {
  it('en uses comma thousands', () => {
    expect(formatInteger(1_062_144, 'en')).toBe('1,062,144');
  });
  it('nl uses period thousands', () => {
    expect(formatInteger(1_062_144, 'nl')).toBe('1.062.144');
  });
  it('es uses period thousands', () => {
    expect(formatInteger(1_062_144, 'es')).toBe('1.062.144');
  });
  it('rounds any fractional input down to whole number digits', () => {
    expect(formatInteger(12_418.7, 'en')).toBe('12,419');
  });
});

describe('formatBtc', () => {
  it('en uses period decimal', () => {
    expect(formatBtc(1_062_144, 'en')).toBe('0.01062144');
  });
  it('nl uses comma decimal', () => {
    expect(formatBtc(1_062_144, 'nl')).toBe('0,01062144');
  });
  it('es uses comma decimal', () => {
    expect(formatBtc(1_062_144, 'es')).toBe('0,01062144');
  });
  it('renders 0 sat cleanly', () => {
    expect(formatBtc(0, 'en')).toBe('0.00000000');
  });
});

describe('formatSat', () => {
  it('appends the unit literally (not translated)', () => {
    expect(formatSat(1_062_144, 'en')).toBe('1,062,144 sat');
    expect(formatSat(1_062_144, 'nl')).toBe('1.062.144 sat');
    expect(formatSat(1_062_144, 'es')).toBe('1.062.144 sat');
  });
});

describe('formatSatAmount', () => {
  it('returns the BTC framing for amounts at or above 1 BTC', () => {
    expect(formatSatAmount(150_000_000, 'en')).toBe('1.50000000 BTC (150,000,000 sat)');
    expect(formatSatAmount(150_000_000, 'nl')).toBe('1,50000000 BTC (150.000.000 sat)');
  });
  it('returns just the sat form for sub-BTC amounts (matches deposit-watcher convention)', () => {
    expect(formatSatAmount(1_062_144, 'en')).toBe('1,062,144 sat');
    expect(formatSatAmount(1_062_144, 'nl')).toBe('1.062.144 sat');
    expect(formatSatAmount(12_418, 'en')).toBe('12,418 sat');
  });
  it('takes the BTC framing at exactly 1 BTC', () => {
    expect(formatSatAmount(100_000_000, 'en')).toBe('1.00000000 BTC (100,000,000 sat)');
  });
});

describe('formatFixed', () => {
  it('en uses period decimal', () => {
    expect(formatFixed(3.12, 2, 'en')).toBe('3.12');
  });
  it('nl uses comma decimal', () => {
    expect(formatFixed(3.12, 2, 'nl')).toBe('3,12');
  });
  it('pads to the requested fraction width', () => {
    expect(formatFixed(4, 1, 'en')).toBe('4.0');
    expect(formatFixed(4, 1, 'nl')).toBe('4,0');
  });
});

describe('formatPct', () => {
  it('suffixes a % that does not change across locales', () => {
    expect(formatPct(0.51, 2, 'en')).toBe('0.51%');
    expect(formatPct(0.51, 2, 'nl')).toBe('0,51%');
    expect(formatPct(0.51, 2, 'es')).toBe('0,51%');
  });
});
