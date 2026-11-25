import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { moneyShort } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Stage = 'unsorted' | 'inspect' | 'ready' | 'sent' | 'closed';
export type Coverage = 'warranty' | 'out_of_warranty' | 'stock';

/** One part line the brand billed, and where it is now. Money in paise. */
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
  ticket_no: string | null;
  job?: { id: number; crm_call_id: string; status: string; customer?: { id: number; name: string; phone: string } } | null;
  customer_name: string | null;
  coverage: Coverage | null;
  return_type: 'defective' | 'fresh';
  inspection_no: string | null;
  rma_no: string | null;
  lr_number: string | null;
  lr_date: string | null;
  courier: string | null;
  ow_billed: boolean;
  ow_billed_on: string | null;
  ow_bill_no: string | null;
  company_pending: boolean;
  company_checked_on: string | null;
  stage: Stage;
  remarks: string | null;
}

export interface SparesSummary {
  stages: Record<Stage, { count: number; value: number }>;
  mismatch: { count: number; value: number };
  company_pending: number;
  company_checked_on: string | null;
  last_billing_date: string | null;
  couriers: string[];
}

type Tone = 'slate' | 'amber' | 'blue' | 'violet' | 'green';

/** The return route, in order. `next` is what a person does to move a part on. */
export const STAGES: { value: Stage; label: string; next: string; tone: Tone }[] = [
  { value: 'unsorted', label: 'Not sorted', next: 'Say warranty or OW', tone: 'slate' },
  { value: 'inspect', label: 'To inspect', next: 'Add the inspection no.', tone: 'amber' },
  { value: 'ready', label: 'Ready to send', next: 'Hand to the courier', tone: 'blue' },
  { value: 'sent', label: 'Sent', next: 'On its way to Lloyd', tone: 'violet' },
  { value: 'closed', label: 'Closed', next: 'Nothing to return', tone: 'green' },
];

export const stageMeta = (s: Stage) => STAGES.find((x) => x.value === s) ?? STAGES[0]!;

export const COVERAGE_LABEL: Record<Coverage, string> = { warranty: 'Warranty', out_of_warranty: 'Out of warranty', stock: 'For stock' };

export function StageBadge({ spare }: { spare: Pick<BrandSpare, 'stage' | 'ow_billed' | 'coverage'> }) {
  const m = stageMeta(spare.stage);
  // A closed line says why it needs nothing returned.
  const label = spare.stage !== 'closed' ? m.label
    : spare.ow_billed ? 'Billed as OW'
    : spare.coverage === 'stock' ? 'For stock'
    : 'Out of warranty';
  return <Badge tone={m.tone} dot>{label}</Badge>;
}

const DOT: Record<Tone, string> = {
  slate: 'bg-slate-400', amber: 'bg-amber-500', blue: 'bg-brand-600', violet: 'bg-violet-500', green: 'bg-emerald-500',
};

/**
 * The return route as five stops on a line, like a courier's route: how many parts wait at each
 * and the money they hold. Choosing a stop shows its parts; choosing it again shows all.
 */
export function Pipeline({ summary, value, onChange }: { summary?: SparesSummary; value: string; onChange: (stage: string) => void }) {
  return (
    <nav aria-label="Where the parts are" className="scroll-light -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="relative grid min-w-[40rem] grid-cols-5">
        {/* The route the stops sit on. */}
        <span aria-hidden className="absolute left-[10%] right-[10%] top-[1.375rem] h-0.5 bg-slate-200" />
        {STAGES.map((s) => {
          const active = value === s.value;
          const n = summary?.stages[s.value];
          const waiting = s.value !== 'closed' && s.value !== 'sent' && (n?.count ?? 0) > 0;
          return (
            <li key={s.value} className="relative">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? '' : s.value)}
                className={cn(
                  'group flex w-full flex-col items-center rounded-xl px-2 pb-3 pt-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  active ? 'bg-white shadow-card ring-1 ring-slate-200' : 'hover:bg-white/70',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ring-2 transition-transform',
                    active ? 'scale-110 ring-slate-300' : 'ring-transparent',
                    DOT[s.tone],
                  )}
                />
                <span className={cn('mt-2 text-sm font-medium', active ? 'text-slate-900' : 'text-slate-600')}>{s.label}</span>
                <span className={cn('mt-0.5 text-2xl font-semibold tabular-nums', waiting ? 'text-slate-900' : 'text-slate-500')}>
                  {n ? n.count.toLocaleString('en-IN') : '–'}
                </span>
                <span className="text-xs tabular-nums text-slate-500">{n ? moneyShort(n.value) : ' '}</span>
                <span className="mt-1 hidden text-[11px] text-slate-400 lg:block">{s.next}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
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

/** The return's paperwork in one line: inspection, challan, courier. */
export function returnText(s: BrandSpare): string | null {
  const parts: string[] = [];
  if (s.return_type === 'fresh') parts.push('Fresh return');
  if (s.inspection_no) parts.push(`Insp. ${s.inspection_no}`);
  if (s.rma_no) parts.push(`RMA ${s.rma_no}`);
  if (s.lr_number) parts.push(`LR ${s.lr_number}`);
  if (s.ow_bill_no) parts.push(`OW bill ${s.ow_bill_no}`);
  return parts.length ? parts.join(', ') : null;
}
