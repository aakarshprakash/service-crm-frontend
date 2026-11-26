import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Info, Upload } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, FilterBar, PageHeader, SearchInput, Select } from '@/components/ui';
import type { BulkAction } from './SpareDialogs';
import { SpareTable } from './SpareTable';
import { UploadDialog, type UploadKind } from './UploadDialog';
import { PERIODS, toServerFilter } from './sparesFilters';
import { Breadcrumb, OW_STAGE, STATUS, useSparesSummary, type BrandSpare, type SparesSummary, type Status } from './sparesParts';

export type Queue = 'inspection' | 'dispatch' | 'billing';

interface Tab {
  /** One status, or several separated by commas. */
  status: string;
  label: string;
  /** What to do here, in one sentence. */
  explain: string;
  actions: BulkAction[];
  swatch?: string;
}

const QUEUES: Record<Queue, { title: string; description: string; path?: 'ow'; tabs: Tab[] }> = {
  inspection: {
    title: 'Inspection & RMA',
    description: "Sort new parts, add Lloyd's inspection number, and the RMA or challan they go back on.",
    tabs: [
      { status: 'unsorted', label: STATUS.unsorted.label, explain: 'Tick the parts and say whether they are warranty or out of warranty. Warranty parts move to Pending inspection; OW parts move to OW Billing.', actions: ['coverage', 'delete'] },
      { status: 'pending_inspection', label: STATUS.pending_inspection.label, explain: "Faulty warranty parts waiting for Lloyd's inspection number. Tick the parts one inspection covers and add its number. Unused parts can go back as fresh without one.", actions: ['inspect', 'fresh', 'rma', 'ow_billed', 'coverage'] },
      { status: 'pending_dispatch', label: 'Inspected', explain: 'Inspected and ready to go back. Add the RMA or challan here; hand them to the courier from Dispatch & Return.', actions: ['rma', 'send', 'inspect'] },
    ],
  },
  dispatch: {
    title: 'Dispatch & Return',
    description: 'Hand warranty parts to the courier, and record when Lloyd receives them.',
    tabs: [
      { status: 'pending_dispatch', label: STATUS.pending_dispatch.label, explain: 'Inspected parts waiting for the courier. Tick the parts in one parcel and choose "Send to Lloyd by courier" to add the LR once for all of them.', actions: ['send', 'rma'] },
      { status: 'pending_return', label: STATUS.pending_return.label, explain: "With the courier or at Lloyd. Mark them received when Lloyd confirms, or upload Lloyd's pending list: parts that drop off it are marked received.", actions: ['received', 'ow_billed', 'company_cleared'] },
      { status: 'return_completed,replacement_completed', label: 'Returned', explain: 'Lloyd has these parts. Open a part to record a replacement issued after inspection.', actions: [] },
    ],
  },
  billing: {
    title: 'OW Billing',
    description: 'Out-of-warranty parts, and warranty parts Lloyd charged to you: billing and payment, in the Excel colours.',
    path: 'ow',
    tabs: [
      { status: 'ow_billing_pending', label: STATUS.ow_billing_pending.label, swatch: OW_STAGE.marked.swatch, explain: "Marked OW (orange). Lloyd has not billed them yet. When Lloyd's OW bill comes, tick its parts and choose \"Lloyd billed it as OW\".", actions: ['ow_billed', 'ow_paid', 'coverage'] },
      { status: 'payment_pending', label: STATUS.payment_pending.label, swatch: OW_STAGE.billed.swatch, explain: 'Billed by Lloyd (light blue). Record the payment when it is made.', actions: ['ow_paid'] },
      { status: 'completed', label: 'Paid', swatch: OW_STAGE.paid.swatch, explain: 'Paid (grey). Nothing left to do.', actions: [] },
    ],
  },
};

/** The flow, end to end, so every queue shows where it sits. */
const FLOW: { label: string; queue: Queue }[] = [
  { label: 'Sort warranty / OW', queue: 'inspection' },
  { label: 'Inspection', queue: 'inspection' },
  { label: 'RMA / challan', queue: 'inspection' },
  { label: 'Courier to Lloyd', queue: 'dispatch' },
  { label: 'Lloyd receives', queue: 'dispatch' },
];
const OW_FLOW = ['Marked OW', 'Billed by Lloyd', 'Paid'];

/** One step of the work: the parts waiting at it, and the button that moves them on. */
export default function WorkQueuePage({ queue }: { queue: Queue }) {
  const q = QUEUES[queue];
  const { can } = useAuth();
  const manage = can('spares.manage');
  const list = useListQuery<BrandSpare>('spares', '/spares', { status: q.tabs[0]!.status, ...(q.path ? { path: q.path } : {}) }, toServerFilter);
  const f = list.filters;
  const server = toServerFilter(f);
  const summary = useSparesSummary(q.path ? { path: q.path } : {});
  const s = summary.data;
  const tab = q.tabs.find((t) => t.status === f.status) ?? q.tabs[0]!;
  const [upload, setUpload] = useState<UploadKind | null>(null);
  const count = (t: Tab) => (s ? t.status.split(',').reduce((a, st) => a + (s.by_status[st as Status]?.count ?? 0), 0) : undefined);

  return (
    <>
      <Breadcrumb items={[{ label: q.title }]} />
      <PageHeader
        title={q.title}
        description={q.description}
        actions={manage && queue === 'dispatch' ? <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setUpload('pending')}>Upload Lloyd's pending list</Button> : undefined}
      />

      <FlowStrip queue={queue} />

      <Card padded={false}>
        <div role="group" aria-label="Steps on this page" className="scroll-light flex gap-1 overflow-x-auto border-b border-slate-200 px-2 sm:px-3">
          {q.tabs.map((t) => {
            const active = t === tab;
            const n = count(t);
            return (
              <button
                key={t.status}
                type="button"
                aria-pressed={active}
                onClick={() => list.setFilters({ status: t.status, attention: '' })}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                  active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900',
                )}
              >
                {t.swatch && <span className={cn('h-2.5 w-2.5 rounded-sm ring-1 ring-black/10', t.swatch)} aria-hidden />}
                {t.label}
                <span className={cn('min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums', active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600')}>
                  {n === undefined ? '–' : n.toLocaleString('en-IN')}
                </span>
              </button>
            );
          })}
        </div>

        <p className="flex gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>{tab.explain}</span>
        </p>

        {queue === 'dispatch' && tab.status === 'pending_return' && <MismatchToggle s={s} on={f.attention === 'mismatch'} onChange={(on) => list.setFilter('attention', on ? 'mismatch' : '')} />}

        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search bill, material, CRM ID, customer, inspection, LR" className="sm:w-96" />
          <Select value={f.period ?? ''} onChange={(e) => list.setFilter('period', e.target.value)} aria-label="Billing date" className="sm:w-44">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </FilterBar>

        <SpareTable
          rows={list.data?.data}
          loading={list.isFetching}
          meta={list.data?.meta}
          onPage={(p) => list.setFilter('page', String(p))}
          listFilter={server}
          actions={tab.actions}
          couriers={s?.couriers ?? []}
          manage={manage && tab.actions.length > 0}
          empty={<EmptyState title="Nothing waiting here" message={f.search || f.period ? 'Try another search or date.' : 'Every part has moved past this step.'} />}
        />
      </Card>

      <UploadDialog kind={upload} onClose={() => setUpload(null)} />
    </>
  );
}

/** The whole flow in one line, this page's steps highlighted, the other pages one click away. */
function FlowStrip({ queue }: { queue: Queue }) {
  const step = (label: ReactNode, here: boolean, to: string, key: string) => (
    <li key={key} className="flex items-center gap-2">
      <Link to={to} aria-current={here ? 'step' : undefined}
        className={cn('whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium', here ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-slate-900')}>
        {label}
      </Link>
    </li>
  );
  const arrow = (key: string) => <li key={key} aria-hidden><ArrowRight className="h-3.5 w-3.5 text-slate-300" /></li>;
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs font-medium text-slate-500">Warranty</span>
        <ol className="scroll-light flex items-center gap-2 overflow-x-auto pb-1">
          {FLOW.flatMap((x, i) => [i > 0 ? arrow(`a${i}`) : null, step(x.label, x.queue === queue, `/spares/${x.queue}`, x.label)].filter(Boolean))}
        </ol>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs font-medium text-slate-500">OW</span>
        <ol className="scroll-light flex items-center gap-2 overflow-x-auto pb-1">
          {OW_FLOW.flatMap((x, i) => [i > 0 ? arrow(`o${i}`) : null, step(x, queue === 'billing', '/spares/billing', x)].filter(Boolean))}
        </ol>
      </div>
    </div>
  );
}

function MismatchToggle({ s, on, onChange }: { s?: SparesSummary; on: boolean; onChange: (on: boolean) => void }) {
  if (!s || (!s.mismatch.count && !on)) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
      Show only the {s.mismatch.count} sent parts Lloyd's latest pending list still shows. Follow up with Lloyd on these.
    </label>
  );
}
