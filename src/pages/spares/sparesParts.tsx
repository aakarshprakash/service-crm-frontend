import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { date } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Status =
  | 'unsorted' | 'pending_inspection' | 'pending_dispatch' | 'pending_return' | 'return_completed' | 'replacement_completed'
  | 'ow_billing_pending' | 'payment_pending' | 'completed';
export type Coverage = 'warranty' | 'out_of_warranty' | 'stock';
export type OwStage = 'marked' | 'billed' | 'paid';

/** The module's name, in one place. */
export const MODULE = 'SAPRE – Spare Parts';

/** One part line Lloyd billed, and where it is now. Money in paise, dates as yyyy-mm-dd. */
export interface BrandSpare {
  id: number;
  billing_doc: string;
  billing_date: string | null;
  material_code: string;
  description: string | null;
  quantity: number;
  value: number;
  delivery_no: string | null;
  po_number: string | null;
  received_on: string | null;
  ticket_no: string | null;
  customer_name: string | null;
  job?: { id: number; crm_call_id: string; status: string; customer?: { id: number; name: string; phone: string } | null } | null;
  customer_by_crm?: { id: number; name: string; phone: string } | null;
  coverage: Coverage | null;
  return_type: 'defective' | 'fresh';
  inspection_no: string | null;
  inspection_on: string | null;
  rma_no: string | null;
  rma_on: string | null;
  lr_number: string | null;
  lr_date: string | null;
  courier: string | null;
  return_received_on: string | null;
  replacement_doc: string | null;
  replacement_material: string | null;
  replacement_on: string | null;
  ow_billed: boolean;
  ow_stage: OwStage | null;
  ow_billed_on: string | null;
  ow_bill_no: string | null;
  ow_paid_on: string | null;
  ow_payment_ref: string | null;
  company_pending: boolean;
  company_checked_on: string | null;
  status: Status;
  remarks: string | null;
  created_at?: string;
  creator?: { id: number; name: string } | null;
}

type Pair = { count: number; value: number };

export interface SparesSummary {
  total: Pair;
  pending: Pair;
  completed: Pair;
  by_status: Record<Status, Pair>;
  by_class: Record<'warranty' | 'out_of_warranty' | 'charged' | 'stock' | 'none', Pair>;
  mismatch: Pair;
  /** Inspected parts without an RMA / challan yet (step 2); the other pending_dispatch parts are in step 3. */
  rma_missing: Pair;
  company_checked_on: string | null;
  last_billing_date: string | null;
  couriers: string[];
}

/** Every status: its name, what to do next, and its badge colours. */
export const STATUS: Record<Status, { label: string; next: string; badge: string; dot: string }> = {
  unsorted: { label: 'Not sorted', next: 'Say if it is warranty or out of warranty', badge: 'bg-slate-100 text-slate-700 ring-slate-500/15', dot: 'bg-slate-400' },
  pending_inspection: { label: 'Pending inspection', next: 'Add the inspection number', badge: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' },
  pending_dispatch: { label: 'Pending dispatch', next: 'Hand it to the courier', badge: 'bg-brand-50 text-brand-700 ring-brand-600/15', dot: 'bg-brand-600' },
  pending_return: { label: 'Pending return', next: 'Waiting for Lloyd to confirm it arrived', badge: 'bg-violet-50 text-violet-700 ring-violet-600/15', dot: 'bg-violet-500' },
  return_completed: { label: 'Return completed', next: 'Lloyd received it', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  replacement_completed: { label: 'Replacement completed', next: 'Returned, and a replacement was issued', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  ow_billing_pending: { label: 'OW billing pending', next: 'Waiting for Lloyd to bill it', badge: 'bg-orange-50 text-orange-800 ring-orange-600/20', dot: 'bg-orange-500' },
  payment_pending: { label: 'Payment pending', next: 'Lloyd billed it; pay and record it', badge: 'bg-sky-50 text-sky-800 ring-sky-600/20', dot: 'bg-sky-500' },
  completed: { label: 'Process completed', next: 'Nothing left to do', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
};

export const PENDING: Status[] = ['unsorted', 'pending_inspection', 'pending_dispatch', 'pending_return', 'ow_billing_pending', 'payment_pending'];

export const COVERAGE: Record<Coverage, string> = { warranty: 'Warranty', out_of_warranty: 'Out of warranty (OW)', stock: 'For stock' };

/** The office's own Excel colours for the OW stages, kept so the screen matches the sheet. */
export const OW_STAGE: Record<OwStage, { label: string; colour: string; swatch: string }> = {
  marked: { label: 'Marked OW', colour: 'Orange', swatch: 'bg-[#FFC000]' },
  billed: { label: 'Billed by Lloyd', colour: 'Light blue', swatch: 'bg-[#9DC3E6]' },
  paid: { label: 'Paid', colour: 'Grey', swatch: 'bg-[#A6A6A6]' },
};

export const onOwPath = (s: Pick<BrandSpare, 'coverage' | 'ow_billed'>) => s.coverage === 'out_of_warranty' || s.ow_billed;

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const m = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', m.badge, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

/** Warranty, OW (with its Excel colour) or stock, the way the office reads the sheet. */
export function CoverageBadge({ spare }: { spare: Pick<BrandSpare, 'coverage' | 'ow_billed' | 'ow_stage'> }) {
  if (!spare.coverage) return <span className="text-xs text-slate-400">Not sorted</span>;
  if (spare.coverage === 'stock') return <Chip swatch="bg-emerald-400">Stock</Chip>;
  if (onOwPath(spare)) {
    const stage = OW_STAGE[spare.ow_stage ?? 'marked'];
    return <Chip swatch={stage.swatch}>{spare.ow_billed ? 'Warranty, billed as OW' : 'OW'}</Chip>;
  }
  return <Chip swatch="bg-[#0070C0]">Warranty</Chip>;
}

function Chip({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-700">
      <span className={cn('h-2.5 w-2.5 rounded-sm ring-1 ring-black/10', swatch)} aria-hidden />
      {children}
    </span>
  );
}

/** The steps a part goes through, done ones ticked with their date. */
export function lifecycle(s: BrandSpare): { label: string; date?: string | null; done: boolean }[] {
  const billed = { label: 'Billed by Lloyd', date: s.billing_date, done: true };
  if (!s.coverage) return [billed, { label: 'Sorted (warranty or OW)', done: false }, { label: 'Completed', done: false }];
  if (s.coverage === 'stock') return [billed, { label: 'Kept for stock', done: true }, { label: 'Completed', date: null, done: true }];
  if (onOwPath(s)) {
    const stage = s.ow_stage ?? (s.ow_billed ? 'billed' : 'marked');
    return [
      billed,
      { label: s.ow_billed ? 'Charged to us as OW' : 'Marked OW', done: true },
      { label: 'OW bill from Lloyd', date: s.ow_billed_on, done: stage !== 'marked' },
      { label: 'Paid', date: s.ow_paid_on, done: stage === 'paid' },
      { label: 'Completed', done: stage === 'paid' },
    ];
  }
  const returned = ['return_completed', 'replacement_completed'].includes(s.status);
  const sent = s.status === 'pending_return' || returned;
  return [
    billed,
    { label: s.return_type === 'fresh' ? 'Fresh return ready' : 'Inspected', date: s.inspection_on, done: s.status !== 'pending_inspection' },
    // Some parts went back without one; once sent, the step counts as passed.
    { label: 'RMA / challan', date: s.rma_on, done: !!s.rma_no || sent },
    { label: 'Sent to Lloyd', date: s.lr_date, done: sent },
    { label: 'Received by Lloyd', date: s.return_received_on, done: returned },
    { label: s.replacement_doc || s.replacement_on ? 'Replacement issued' : 'Completed', date: s.replacement_on, done: returned },
  ];
}

export function Lifecycle({ spare }: { spare: BrandSpare }) {
  const steps = lifecycle(spare);
  const current = steps.findIndex((x) => !x.done);
  return (
    <ol className="flex items-start" aria-label="Steps">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
          {i > 0 && <span aria-hidden className={cn('absolute right-1/2 top-3 h-0.5 w-full', step.done ? 'bg-emerald-500' : 'bg-slate-200')} />}
          <span
            className={cn(
              'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2',
              step.done ? 'border-emerald-500 bg-emerald-500 text-white' : i === current ? 'border-brand-600 bg-white' : 'border-slate-300 bg-white',
            )}
          >
            {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i === current && <span className="h-2 w-2 rounded-full bg-brand-600" />}
          </span>
          <span className={cn('mt-2 px-1 text-xs font-medium', step.done ? 'text-slate-900' : i === current ? 'text-brand-700' : 'text-slate-400')}>
            {step.label}
            <span className="sr-only">{step.done ? ', done' : i === current ? ', next' : ''}</span>
          </span>
          <span className="text-[11px] tabular-nums text-slate-500">{step.done && step.date ? date(step.date) : i === current ? 'Next' : ' '}</span>
        </li>
      ))}
    </ol>
  );
}

/** "SAPRE – Spare Parts › Register" above a page title. */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link to="/spares" className="hover:text-slate-800">{MODULE}</Link>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" aria-hidden />
          {it.to ? <Link to={it.to} className="hover:text-slate-800">{it.label}</Link> : <span className="text-slate-700">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** The counts every SAPRE screen shows. */
export function useSparesSummary(params: Record<string, string | undefined> = {}, enabled = true) {
  return useQuery({
    queryKey: ['spares', 'summary', params],
    queryFn: () => api.get<Envelope<SparesSummary>>('/spares/summary', params).then((r) => r.data),
    enabled,
  });
}

/** A row of mutually exclusive choices; the chosen one is filled. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The paperwork so far, in one line: inspection, challan, LR, OW bill. */
export function paperwork(s: BrandSpare): string | null {
  const parts: string[] = [];
  if (s.return_type === 'fresh') parts.push('Fresh return');
  if (s.inspection_no) parts.push(`Insp. ${s.inspection_no}`);
  if (s.rma_no) parts.push(`RMA ${s.rma_no}`);
  if (s.lr_number) parts.push(`LR ${s.lr_number}`);
  if (s.ow_bill_no) parts.push(`OW bill ${s.ow_bill_no}`);
  if (s.ow_payment_ref) parts.push(`Paid ${s.ow_payment_ref}`);
  return parts.length ? parts.join(', ') : null;
}
