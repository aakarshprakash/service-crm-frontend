import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureFormatting, daysFromToday, label, qty, toMajor, toMinor } from './format';
import { safeNext } from './utils';

describe('money conversion (API uses integer paise)', () => {
  it('converts typed rupees to paise without float drift', () => {
    expect(toMinor('1250.5')).toBe(125050);
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('19.99')).toBe(1999);
    expect(toMinor('1,000')).toBe(100000);
    expect(toMinor('')).toBe(0);
    expect(toMinor('abc')).toBe(0);
  });

  it('formats paise back for inputs', () => {
    expect(toMajor(125050)).toBe('1250.50');
    expect(toMajor(100000)).toBe('1000');
    expect(toMajor(0)).toBe('');
  });
});

describe('display helpers', () => {
  it('trims trailing zeros on quantities', () => {
    expect(qty(1.5)).toBe('1.5');
    expect(qty('2.000')).toBe('2');
    expect(qty(0.125)).toBe('0.125');
  });

  it('humanises snake_case', () => {
    expect(label('bank_transfer')).toBe('Bank Transfer');
    expect(label(null)).toBe('–');
  });
});

describe('safeNext (open-redirect protection)', () => {
  it('allows in-app paths', () => {
    expect(safeNext('/jobs/12?tab=1', '/home')).toBe('/jobs/12?tab=1');
  });

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', 'jobs', null])('rejects %s', (value) => {
    expect(safeNext(value, '/home')).toBe('/home');
  });
});

describe('daysFromToday (calendar days in the company time zone)', () => {
  afterEach(() => {
    vi.useRealTimers();
    configureFormatting({});
  });

  it('counts calendar days, not 24-hour blocks', () => {
    configureFormatting({ timezone: 'Asia/Kolkata' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T17:00:00Z')); // 9 Nov, 10:30 pm IST
    expect(daysFromToday('2026-11-09T04:00:00Z')).toBe(0); // earlier the same day
    expect(daysFromToday('2026-11-09T19:00:00Z')).toBe(1); // 10 Nov, 12:30 am IST
    expect(daysFromToday('2026-11-12T09:30:00Z')).toBe(3);
    expect(daysFromToday('2026-11-07T09:30:00Z')).toBe(-2);
  });

  it('returns null without a date', () => {
    expect(daysFromToday(null)).toBeNull();
  });
});
