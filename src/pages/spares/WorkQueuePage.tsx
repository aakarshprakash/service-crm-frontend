import { useState } from 'react';
import { Download, Info, Upload } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { download } from '@/lib/api';
import { useListQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, FilterBar, PageHeader, SearchInput, Select, toast } from '@/components/ui';
import type { BulkAction } from './SpareDialogs';
import { SpareTable } from './SpareTable';
import { UploadDialog, type UploadKind } from './UploadDialog';
import { PERIODS, toServerFilter } from './sparesFilters';
import { Breadcrumb, OW_STAGE, STATUS, useSparesSummary, type SparesSummary, type BrandSpare, type Status } from './sparesParts';
import { STEP, StepBar, type StepKey } from './sparesSteps';

interface Tab {
  /** One status, or several separated by commas. */
  status: string;
  /** Split inspected parts by whether the RMA / challan is in (step 2 without, step 3 with). */
  rma?: 'missing' | 'added';
  label: string;
  /** What to do here, in one sentence. */
  explain: string;
  actions: BulkAction[];
  swatch?: string;
}

const QUEUES: Record<StepKey, { description: string; path?: 'ow'; tabs: Tab[] }> = {
  billing: {
    description: "Lloyd's bill comes in here. Every part is marked warranty, OW or for stock, and moves to its next step.",
    tabs: [
      { status: 'unsorted', label: 'Not marked yet', explain: 'These bill lines do not say warranty or OW. Tick them and choose "Mark warranty or OW". Warranty parts go to step 2, OW parts to step 4.', actions: ['coverage', 'delete'] },
    ],
  },
  inspection: {
    description: "Warranty parts only. Add Lloyd's inspection number, then the RMA or challan the part goes back on.",
    tabs: [
      { status: 'pending_inspection', label: 'Waiting for inspection', explain: "Tick the parts one inspection covers and add its number. Unused parts can go back as fresh without one. If Lloyd charged a part as OW, mark it so; it moves to step 4.", actions: ['inspect', 'fresh', 'rma', 'ow_billed', 'coverage'] },
      { status: 'pending_dispatch', rma: 'missing', label: 'Waiting for RMA / challan', explain: 'Inspected. Add the RMA or challan number; the parts then move to step 3, Dispatch & Return.', actions: ['rma', 'send', 'inspect'] },
    ],
  },
  dispatch: {
    description: 'Warranty parts only. Hand them to the courier, then record when Lloyd receives them.',
    tabs: [
      { status: 'pending_dispatch', rma: 'added', label: 'Ready for courier', explain: 'RMA or challan is in. Tick the parts in one parcel and choose "Send to Lloyd by courier" to add the LR once for all of them.', actions: ['send', 'rma'] },
      { status: 'pending_return', label: 'With courier / at Lloyd', explain: "Mark them received when Lloyd confirms, or upload Lloyd's pending list: parts that drop off it are marked received.", actions: ['received', 'ow_billed', 'company_cleared'] },
      { status: 'return_completed,replacement_completed', label: 'Returned', explain: 'Lloyd has these parts. Nothing left to do. Open a part to record a replacement issued after inspection.', actions: [] },
    ],
  },
  ow: {
    description: 'Out-of-warranty parts, and warranty parts Lloyd charged to you. The colours are the ones your Excel uses.',
    path: 'ow',
    tabs: [
      { status: 'ow_billing_pending', label: STATUS.ow_billing_pending.label, swatch: OW_STAGE.marked.swatch, explain: "Orange in the Excel. Lloyd has not billed them yet. When Lloyd's OW bill comes, tick its parts and choose \"Lloyd billed it as OW\".", actions: ['ow_billed', 'ow_paid', 'coverage'] },
      { status: 'payment_pending', label: STATUS.payment_pending.label, swatch: OW_STAGE.billed.swatch, explain: 'Light blue in the Excel. Lloyd has billed them. Record the payment when it is made.', actions: ['ow_paid'] },
      { status: 'completed', label: 'Paid', swatch: OW_STAGE.paid.swatch, explain: 'Grey in the Excel. Paid; nothing left to do.', actions: [] },
    ],
  },
};

const sameTab = (t: Tab, f: Record<string, string>) => t.status === f.status && (t.rma ?? '') === (f.rma ?? '');

/** How many parts a tab holds, from the summary. */
function tabCount(t: Tab, s?: SparesSummary): number | undefined {
  if (!s) return undefined;
  if (t.rma === 'missing') return s.rma_missing.count;
  const n = t.status.split(',').reduce((a, st) => a + (s.by_status[st as Status]?.count ?? 0), 0);
  return t.rma === 'added' ? n - s.rma_missing.count : n;
}

/** One step of the work: the parts waiting at it, and the button that moves them on. */
export default function WorkQueuePage({ queue }: { queue: StepKey }) {
  const q = QUEUES[queue];
  const step = STEP[queue];
  const { can } = useAuth();
  const manage = can('spares.manage');
  const first = q.tabs[0]!;
  const list = useListQuery<BrandSpare>('spares', '/spares', { status: first.status, ...(first.rma ? { rma: first.rma } : {}), ...(q.path ? { path: q.path } : {}) }, toServerFilter);
  const f = list.filters;
  const server = toServerFilter(f);
  const all = useSparesSummary();
  const scoped = useSparesSummary(q.path ? { path: q.path } : {});
  const s = scoped.data;
  const tab = q.tabs.find((t) => sameTab(t, f)) ?? first;
  const [upload, setUpload] = useState<UploadKind | null>(null);

  return (
    <>
      <Breadcrumb items={[{ label: `Step ${step.n}: ${step.title}` }]} />
      <PageHeader
        title={`${step.n}. ${step.title}`}
        description={q.description}
        actions={manage ? <StepActions queue={queue} onUpload={setUpload} /> : undefined}
      />

      <StepBar current={queue} s={all.data} className="mb-5" />

      <Card padded={false}>
        {q.tabs.length > 1 && (
          <div role="group" aria-label="Parts at this step" className="scroll-light flex gap-1 overflow-x-auto border-b border-slate-200 px-2 sm:px-3">
            {q.tabs.map((t) => {
              const active = t === tab;
              const n = tabCount(t, s);
              return (
                <button
                  key={t.status + (t.rma ?? '')}
                  type="button"
                  aria-pressed={active}
                  onClick={() => list.setFilters({ status: t.status, rma: t.rma ?? '', attention: '' })}
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
        )}

        <p className="flex gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            {q.tabs.length === 1 && <span className="font-semibold">{tab.label} ({tabCount(tab, s)?.toLocaleString('en-IN') ?? '–'}). </span>}
            {tab.explain}
          </span>
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
          primaryFor={tab.rma === 'missing' ? (st) => (st.length === 1 ? 'rma' : null) : undefined}
          couriers={s?.couriers ?? []}
          manage={manage && tab.actions.length > 0}
          empty={<EmptyState title="Nothing waiting here" message={f.search || f.period ? 'Try another search or date.' : 'Every part has moved past this step.'} />}
        />
      </Card>

      <UploadDialog kind={upload} onClose={() => setUpload(null)} />
    </>
  );
}

/** The uploads that belong to a step: the bill at step 1, Lloyd's pending list at step 3. */
function StepActions({ queue, onUpload }: { queue: StepKey; onUpload: (k: UploadKind) => void }) {
  if (queue === 'billing') {
    return (
      <>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => download('/spares/template', 'sapre-template.xlsx').catch((e) => toast.error(e.message))}>Blank template</Button>
        <Button icon={<Upload className="h-4 w-4" />} onClick={() => onUpload('bill')}>Upload Lloyd's bill</Button>
      </>
    );
  }
  if (queue === 'dispatch') return <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => onUpload('pending')}>Upload Lloyd's pending list</Button>;
  return null;
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
