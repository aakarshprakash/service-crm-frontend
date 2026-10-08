/**
 * Formatting helpers. Money from the API is always an integer in the smallest
 * currency unit (paise / cents); dates are UTC and shown in the tenant timezone.
 */

import i18n from 'i18next';

let currency = 'INR';
let timeZone: string | undefined;
/** Money keeps Indian English grouping (₹1,25,000.00) in every language; dates follow the UI language. */
const locale = 'en-IN';
const dateLocale = () => `${i18n.language || 'en'}-IN`;

export function configureFormatting(opts: { currency?: string; timezone?: string }) {
  if (opts.currency) currency = opts.currency;
  timeZone = opts.timezone || undefined;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(minor: number | null | undefined, cur = currency): string {
  if (minor === null || minor === undefined) return '–';
  let f = moneyFormatters.get(cur);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormatters.set(cur, f);
  }
  return f.format(minor / 100);
}

/** Compact money for charts / KPI tiles, e.g. ₹1.2L */
export function moneyShort(minor: number, cur = currency): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}

/** User-typed major units ("1,250.50") → minor units (125050). */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toMajor(minor: number | null | undefined): string {
  if (!minor) return '';
  return (minor / 100).toFixed(2).replace(/\.00$/, '');
}

export function date(value: string | null | undefined): string {
  if (!value) return '–';
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return '–';
  return new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: value.length === 10 ? undefined : timeZone }).format(d);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  return new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(d);
}

export function time(value: string | null | undefined): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value));
}

export function relative(value: string | null | undefined): string {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(dateLocale(), { numeric: 'auto', style: 'short' });
  if (diff < 60) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 7 * 86400) return rtf.format(-Math.floor(diff / 86400), 'day');
  return date(value);
}

/** Today's date (YYYY-MM-DD) in the tenant timezone. */
export function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}

export function monthStart(): string {
  return today().slice(0, 8) + '01';
}

/** datetime-local input value (tenant tz not supported by the input – uses browser local). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function duration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function qty(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return String(Number(Number(value).toFixed(3)));
}

export function label(value: string | null | undefined): string {
  if (!value) return '–';
  // Known codes (service types, warranty types…) are translated; anything else is title-cased.
  const key = `label.${value}`;
  if (i18n.exists(key)) return i18n.t(key);
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
