import { today } from '@/lib/format';

/** Billing-date periods offered on every SAPRE screen. */
export const PERIODS = [
  { value: '', label: 'Any billing date' },
  { value: 'this_month', label: 'Billed this month' },
  { value: 'last_month', label: 'Billed last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
];

/** A period name → the from/to dates the server filters on. */
export function periodRange(period: string | undefined): { from?: string; to?: string } {
  if (!period) return {};
  const [y, m] = today().split('-').map(Number) as [number, number];
  const iso = (yy: number, mm: number, dd: number) => {
    const d = new Date(yy, mm - 1, dd);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  switch (period) {
    case 'this_month': return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'last_month': return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'last_3_months': return { from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) };
    case 'this_year': return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
    default: return {};
  }
}

/** URL filters (with a "period" name) → what the server takes; page is left out. */
export function toServerFilter(f: Record<string, string>): Record<string, string> {
  const { period, page: _page, ...rest } = f;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...rest, ...periodRange(period) })) if (v) out[k] = v;
  return out;
}
