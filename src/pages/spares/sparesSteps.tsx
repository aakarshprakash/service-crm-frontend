import { Link } from 'react-router';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BrandSpare, SparesSummary, Status } from './sparesParts';

export type StepKey = 'billing' | 'inspection' | 'dispatch' | 'ow';

export interface Step {
  n: number;
  key: StepKey;
  to: string;
  title: string;
  /** What is done at this step, in a few words. */
  does: string;
  /** Which parts pass through it. */
  who: 'all' | 'warranty' | 'ow';
}

/**
 * The four steps of SAPRE, in the order the work happens. The sidebar, the bar on top of every
 * step page and the dashboard all read this list, so the names and numbers never drift apart.
 */
export const STEPS: Step[] = [
  { n: 1, key: 'billing', to: '/spares/billing', title: 'Billing & Warranty', does: "Upload Lloyd's bill, mark each part warranty or OW", who: 'all' },
  { n: 2, key: 'inspection', to: '/spares/inspection', title: 'Inspection & RMA', does: 'Add the inspection number and the RMA / challan', who: 'warranty' },
  { n: 3, key: 'dispatch', to: '/spares/dispatch', title: 'Dispatch & Return', does: 'Send by courier, then Lloyd confirms it arrived', who: 'warranty' },
  { n: 4, key: 'ow', to: '/spares/ow-billing', title: 'OW Billing', does: 'Lloyd bills the OW parts, then you record the payment', who: 'ow' },
];

export const STEP: Record<StepKey, Step> = Object.fromEntries(STEPS.map((s) => [s.key, s])) as Record<StepKey, Step>;

const WHO: Record<Step['who'], { label: string; swatch: string }> = {
  all: { label: 'Every new part', swatch: 'bg-slate-400' },
  warranty: { label: 'Warranty parts', swatch: 'bg-[#0070C0]' },
  ow: { label: 'OW parts', swatch: 'bg-[#FFC000]' },
};

/** Parts still waiting at a step. Inspected parts without an RMA / challan belong to step 2, the rest to step 3. */
export function stepCount(key: StepKey, s?: SparesSummary): number | undefined {
  if (!s) return undefined;
  const n = (...st: Status[]) => st.reduce((a, x) => a + (s.by_status[x]?.count ?? 0), 0);
  const noRma = s.rma_missing?.count ?? 0;
  switch (key) {
    case 'billing': return n('unsorted');
    case 'inspection': return n('pending_inspection') + noRma;
    case 'dispatch': return n('pending_dispatch') - noRma + n('pending_return');
    case 'ow': return n('ow_billing_pending', 'payment_pending');
  }
}

/** The step a part is waiting at, or null when it is done. */
export function stepOf(s: Pick<BrandSpare, 'status' | 'rma_no'>): Step | null {
  switch (s.status) {
    case 'unsorted': return STEP.billing;
    case 'pending_inspection': return STEP.inspection;
    case 'pending_dispatch': return s.rma_no ? STEP.dispatch : STEP.inspection;
    case 'pending_return': return STEP.dispatch;
    case 'ow_billing_pending':
    case 'payment_pending': return STEP.ow;
    default: return null;
  }
}

/**
 * The four steps side by side, each with what it is for and how many parts wait there. The current
 * step is filled; the others are links. Warranty parts go 1 → 2 → 3; OW parts go 1 → 4.
 */
export function StepBar({ current, s, className }: { current?: StepKey; s?: SparesSummary; className?: string }) {
  return (
    <nav aria-labelledby="sapre-steps" className={className}>
      <h2 id="sapre-steps" className="mb-2 text-xs font-medium text-slate-500 max-sm:sr-only">Steps, in order. The number on each is how many parts wait there.</h2>
      <ol className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {STEPS.map((step) => {
          const here = step.key === current;
          const n = stepCount(step.key, s);
          const who = WHO[step.who];
          return (
            <li key={step.key} className="relative min-w-0">
              <Link
                to={step.to}
                aria-current={here ? 'step' : undefined}
                className={cn(
                  'flex h-full items-start gap-2 rounded-xl border p-2.5 transition-colors sm:gap-3 sm:p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  here ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:border-brand-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:h-8 sm:w-8 sm:text-sm',
                    here ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700',
                  )}
                  aria-hidden
                >
                  {step.n}
                </span>
                <span className="flex min-w-0 flex-1 flex-col self-stretch">
                  <span className={cn('text-[13px] font-semibold leading-6 sm:text-sm sm:leading-8', here ? 'text-brand-800' : 'text-slate-900')}>
                    <span className="sr-only">Step {step.n}: </span>{step.title}
                  </span>
                  <span className="hidden text-xs leading-snug text-slate-600 sm:block">{step.does}</span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-1 sm:pt-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-500 max-sm:sr-only">
                      <span className={cn('h-2 w-2 shrink-0 rounded-sm', who.swatch)} aria-hidden />
                      <span className="truncate">{who.label}</span>
                    </span>
                    <WaitingPill n={n} />
                  </span>
                </span>
              </Link>
              {(step.n === 1 || step.n === 2) && (
                <ChevronRight aria-hidden className="absolute -right-[18px] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-0.5 text-slate-400 xl:block" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WaitingPill({ n }: { n?: number }) {
  if (n === undefined) return <span className="text-xs text-slate-400">–</span>;
  if (n === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Clear
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-900" title={`${n} parts waiting at this step`}>
      {n.toLocaleString('en-IN')}<span className="sr-only"> waiting</span>
    </span>
  );
}
