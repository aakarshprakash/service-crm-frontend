import { Badge } from '@/components/ui';
import { date, daysFromToday, money } from '@/lib/format';
import type { Estimate } from '@/lib/types';

/** What the office sees: an open estimate past its last valid day reads as expired, whatever its stored status. */
export function estimateState(e: Pick<Estimate, 'status' | 'is_expired'>): 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' {
  return e.is_expired ? 'expired' : e.status;
}

const STATE = {
  draft: { label: 'Draft', tone: 'slate' },
  sent: { label: 'Sent', tone: 'sky' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  expired: { label: 'Expired', tone: 'amber' },
} as const;

export function EstimateStatusBadge({ estimate }: { estimate: Pick<Estimate, 'status' | 'is_expired'> }) {
  const s = STATE[estimateState(estimate)];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** The GST slabs an estimate can use (the server accepts the same list). */
export const GST_RATES = [0, 5, 12, 18, 28] as const;

/** Units offered while typing; anything else can still be typed. */
export const UNITS = ['Nos', 'Set', 'Pair', 'Mtr', 'Ft', 'Kg', 'Ltr', 'Job', 'Lot'];

/** How the estimate treats GST, in the words used on the screen and the PDF. */
export function gstLabel(e: Pick<Estimate, 'is_gst' | 'prices_include_gst'>): string {
  if (!e.is_gst) return 'No GST';
  return e.prices_include_gst ? 'GST inclusive' : 'GST exclusive';
}

/** The one rate every line uses, or null when the lines differ. */
export function sharedRate(rates: number[]): number | null {
  return rates.length && rates.every((r) => r === rates[0]) ? rates[0]! : null;
}

/** "12 days left", "Last day today", "Expired 3 days ago"; null once decided or with no last day. */
export function validityText(e: Pick<Estimate, 'status' | 'valid_until'>): { text: string; urgent: boolean } | null {
  if (!e.valid_until || (e.status !== 'draft' && e.status !== 'sent')) return null;
  const days = daysFromToday(e.valid_until);
  if (days === null) return null;
  if (days < 0) return { text: `Expired ${-days} day${days === -1 ? '' : 's'} ago`, urgent: true };
  if (days === 0) return { text: 'Last day today', urgent: true };
  return { text: `${days} day${days === 1 ? '' : 's'} left`, urgent: days <= 3 };
}

/** Split an amount over weights in proportion, exactly (largest remainder), as the server does. */
function allocate(weights: number[], amount: number): number[] {
  const total = weights.reduce((a, w) => a + w, 0);
  if (!amount || total <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((amount * w) / total));
  const order = weights.map((w, i) => ({ i, r: (amount * w) % total })).sort((a, b) => b.r - a.r);
  let left = amount - shares.reduce((a, s) => a + s, 0);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i]! += 1;
    left -= 1;
  }
  return shares;
}

/** Half away from zero, on whole paise. */
const roundDiv = (n: number, d: number) => Math.sign(n) * Math.floor((Math.abs(n) * 2 + d) / (2 * d));

export interface Totals {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

/**
 * The totals the server will save, worked out while typing (all in paise). Each line has its own GST rate.
 * Before GST: the line after its share of the discount is taxable and GST is added on top.
 * Including GST: the tax is inside the price.
 */
export function estimateTotals(lines: { gross: number; rate: number }[], discount: number, gst: { on: boolean; inclusive: boolean }): Totals {
  const parts = lineTaxes(lines, discount, gst);
  const taxable = parts.reduce((a, p) => a + p.taxable, 0);
  const tax = parts.reduce((a, p) => a + p.tax, 0);
  const gross = lines.reduce((a, l) => a + l.gross, 0);
  return { gross, discount, taxable, tax, total: taxable + tax };
}

/** Each line's taxable value and GST (paise), after its share of the discount, as the server works them out. */
export function lineTaxes(lines: { gross: number; rate: number }[], discount: number, gst: { on: boolean; inclusive: boolean }): { taxable: number; tax: number }[] {
  const shares = allocate(lines.map((l) => Math.max(0, l.gross)), discount);
  return lines.map((l, i) => {
    const bp = Math.round((gst.on ? l.rate : 0) * 100);
    const net = l.gross - shares[i]!;
    if (!bp) return { taxable: net, tax: 0 };
    if (gst.inclusive) {
      const taxable = roundDiv(net * 10000, 10000 + bp);
      return { taxable, tax: net - taxable };
    }
    return { taxable: net, tax: roundDiv(net * bp, 10000) };
  });
}

/** India numbers get the country code; anything else is passed through as typed. */
function waNumber(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** A WhatsApp chat with the customer, with the estimate's summary and the link to its PDF already typed. */
export function whatsAppLink(e: Estimate, company: string | undefined): string {
  const lines = [
    `Hello ${e.customer?.name ?? ''},`.replace(' ,', ','),
    `Here is your estimate ${e.estimate_number}${e.subject ? ` for ${e.subject}` : ''}${company ? ` from ${company}` : ''}.`,
    `Total: ${money(e.total_amount)}${e.is_gst && !e.prices_include_gst ? ' including GST' : ''}${e.valid_until ? ` (valid until ${date(e.valid_until)})` : ''}`,
    e.share_url ? `View or download: ${e.share_url}` : null,
    'Please reply to approve it or if you have any questions.',
  ].filter(Boolean);
  return `https://wa.me/${waNumber(e.customer?.phone)}?text=${encodeURIComponent(lines.join('\n'))}`;
}
