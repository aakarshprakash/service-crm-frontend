import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Package, Pencil } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { date, dateTime, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, QueryState } from '@/components/ui';
import { ACTION, BulkDialog, SpareEditor, type BulkAction } from './SpareDialogs';
import { NEXT_STEP } from './SpareTable';
import { Breadcrumb, COVERAGE, CoverageBadge, Lifecycle, OW_STAGE, STATUS, StatusBadge, onOwPath, useSparesSummary, type BrandSpare } from './sparesParts';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'billing', label: 'Billing & Warranty' },
  { value: 'inspection', label: 'Inspection & RMA' },
  { value: 'dispatch', label: 'Dispatch & Return' },
  { value: 'activity', label: 'Activity log' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

interface ActivityItem { at: string | null; user: string | null; title: string; details: { field: string; from: unknown; to: unknown }[] }

/** One part: where it is in its flow, the next step, and every detail by stage. */
export default function SpareDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const manage = can('spares.manage');
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'overview') as TabValue;
  const q = useQuery({ queryKey: ['spares', 'one', id], queryFn: () => api.get<Envelope<BrandSpare>>(`/spares/${id}`).then((r) => r.data) });
  const couriers = useSparesSummary().data?.couriers ?? [];
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<BulkAction | null>(null);
  const s = q.data;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {s && (
        <>
          <Breadcrumb items={[{ label: 'Spare Parts Register', to: '/spares/register' }, { label: `Bill ${s.billing_doc}` }]} />
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 sm:flex" aria-hidden><Package className="h-6 w-6" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">{s.description ?? s.material_code}</h1>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Material {s.material_code}, bill {s.billing_doc} on {date(s.billing_date)}, {money(s.value)}
                  {customerName(s) && <>, for {customerName(s)}</>}
                </p>
              </div>
            </div>
            {manage && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit part</Button>}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card title="Steps"><Lifecycle spare={s} /></Card>
            <NextStep spare={s} manage={manage} onAction={setAction} />
          </div>

          <div role="tablist" aria-label="Part details" className="scroll-light mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.value} role="tab" type="button" aria-selected={tab === t.value}
                onClick={() => setParams(t.value === 'overview' ? {} : { tab: t.value }, { replace: true })}
                className={cn('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                  tab === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900')}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-4" role="tabpanel">
            {tab === 'overview' && <Overview s={s} />}
            {tab === 'billing' && <BillingTab s={s} />}
            {tab === 'inspection' && <InspectionTab s={s} />}
            {tab === 'dispatch' && <DispatchTab s={s} />}
            {tab === 'activity' && <ActivityTab id={s.id} />}
          </div>

          <SpareEditor open={editing} spare={s} couriers={couriers} onClose={() => setEditing(false)} />
          <BulkDialog action={action} target={{ ids: [s.id] }} count={1} couriers={couriers} onClose={() => setAction(null)} onDone={() => setAction(null)} />
        </>
      )}
    </QueryState>
  );
}

const customerName = (s: BrandSpare) => s.customer_name ?? s.job?.customer?.name ?? s.customer_by_crm?.name ?? null;

/** What to do next with this part, in words, with the one button that does it. */
function NextStep({ spare: s, manage, onAction }: { spare: BrandSpare; manage: boolean; onAction: (a: BulkAction) => void }) {
  const step = NEXT_STEP[s.status];
  const done = !step;
  return (
    <Card>
      <p className="text-xs font-medium text-slate-500">Next step</p>
      <div className="mt-1 flex items-start gap-2">
        {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />}
        <p className="text-base font-semibold text-slate-900">{STATUS[s.status].next}</p>
      </div>
      {s.company_pending && s.status === 'pending_return' && (
        <p className="mt-2 flex gap-1.5 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Lloyd's pending list still shows this part{s.company_checked_on ? ` (list of ${date(s.company_checked_on)})` : ''}.</p>
      )}
      {manage && step && <Button className="mt-4 w-full" onClick={() => onAction(step)}>{ACTION[step].label}</Button>}
      {manage && s.status === 'pending_inspection' && <Button variant="ghost" className="mt-1 w-full" onClick={() => onAction('fresh')}>{ACTION.fresh.label}</Button>}
    </Card>
  );
}

/** Label and value rows; an empty value reads "Not yet" so a missing step is obvious. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3 py-2">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words text-slate-900">{v === null || v === undefined || v === '' ? <span className="text-slate-400">Not yet</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ s }: { s: BrandSpare }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Key details">
        <Rows rows={[
          ['Billing document', s.billing_doc],
          ['Billing date', date(s.billing_date)],
          ['Material', s.material_code],
          ['Description', s.description],
          ['Issued value', money(s.value)],
          ['Warranty', <CoverageBadge spare={s} key="c" />],
          ['Status', <StatusBadge status={s.status} key="s" />],
        ]} />
      </Card>
      <Card title="Customer and job">
        <Rows rows={[
          ['EX CRM ID', s.ticket_no],
          ['Customer', customerName(s)],
          ['Job', s.job
            ? <Link to={`/jobs/${s.job.id}`} className="font-medium text-brand-700 hover:underline">{s.job.crm_call_id}</Link>
            : s.customer_by_crm ? <Link to={`/customers/${s.customer_by_crm.id}`} className="font-medium text-brand-700 hover:underline">Customer with this CRM ID</Link>
            : <span className="text-slate-500">No job has this CRM ID as its External CRM call ID.</span>],
          ['PO number', s.po_number],
        ]} />
        {s.remarks && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{s.remarks}</p>}
      </Card>
    </div>
  );
}

function BillingTab({ s }: { s: BrandSpare }) {
  const ow = onOwPath(s);
  const stage = s.ow_stage ? OW_STAGE[s.ow_stage] : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Billing details">
        <Rows rows={[
          ['Billing document', s.billing_doc], ['Billing date', date(s.billing_date)], ['PO number', s.po_number], ['Material', s.material_code],
          ['Item description', s.description], ['Issued quantity', s.quantity], ['Issued value', money(s.value)],
          ['Delivery number', s.delivery_no], ['Received on', s.received_on && date(s.received_on)],
        ]} />
      </Card>
      <Card title={ow ? 'OW billing' : 'Warranty'}>
        {ow ? (
          <Rows rows={[
            ['Type', s.ow_billed ? 'Warranty part, charged to us as OW' : COVERAGE.out_of_warranty],
            ['Stage', stage && <span className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', stage.swatch)} aria-hidden />{stage.label} ({stage.colour.toLowerCase()})</span>],
            ['Billed by Lloyd on', s.ow_billed_on && date(s.ow_billed_on)], ["Lloyd's OW bill", s.ow_bill_no],
            ['Paid on', s.ow_paid_on && date(s.ow_paid_on)], ['Payment reference', s.ow_payment_ref],
          ]} />
        ) : (
          <Rows rows={[
            ['Type', s.coverage ? COVERAGE[s.coverage] : null],
            ['What happens', s.coverage === 'warranty' ? 'The faulty part goes back to Lloyd after inspection.' : s.coverage === 'stock' ? 'Kept for stock. Nothing to return.' : 'Say if it is warranty or out of warranty.'],
          ]} />
        )}
      </Card>
    </div>
  );
}

function InspectionTab({ s }: { s: BrandSpare }) {
  if (onOwPath(s) || s.coverage === 'stock') return <NotThisPath s={s} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Inspection">
        <Rows rows={[
          ['Part going back', s.return_type === 'fresh' ? 'Fresh, unused (no inspection needed)' : 'Faulty part'],
          ['Inspection number', s.inspection_no], ['Inspected on', s.inspection_on && date(s.inspection_on)],
        ]} />
      </Card>
      <Card title="RMA / challan">
        <Rows rows={[['RMA or challan number', s.rma_no], ['Challan date', s.rma_on && date(s.rma_on)]]} />
      </Card>
    </div>
  );
}

function DispatchTab({ s }: { s: BrandSpare }) {
  if (onOwPath(s) || s.coverage === 'stock') return <NotThisPath s={s} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Dispatch">
        <Rows rows={[['Courier', s.courier], ['LR number', s.lr_number], ['Handed over on', s.lr_date && date(s.lr_date)]]} />
      </Card>
      <Card title="Return">
        <Rows rows={[
          ['Lloyd received it on', s.return_received_on && date(s.return_received_on)],
          ["On Lloyd's pending list", s.company_pending ? <span className="font-medium text-amber-700">Yes{s.company_checked_on && `, list of ${date(s.company_checked_on)}`}</span> : 'No'],
          ['Replacement issued', s.replacement_doc || s.replacement_on ? `${s.replacement_doc ?? ''} ${s.replacement_material ?? ''}${s.replacement_on ? `, ${date(s.replacement_on)}` : ''}`.trim() : null],
        ]} />
      </Card>
    </div>
  );
}

function NotThisPath({ s }: { s: BrandSpare }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">
        {s.coverage === 'stock' ? 'This part was kept for stock, so it is not returned.' : 'This part is on the OW path: it is billed by Lloyd, not returned. See Billing & Warranty.'}
      </p>
    </Card>
  );
}

const FIELD_NAMES: Record<string, string> = {
  coverage: 'Warranty', inspection_no: 'Inspection number', inspection_on: 'Inspected on', rma_no: 'RMA / challan', rma_on: 'Challan date',
  lr_number: 'LR number', lr_date: 'Handed to courier', courier: 'Courier', return_received_on: 'Lloyd received on', return_type: 'Part going back',
  ow_stage: 'OW stage', ow_billed: 'Charged as OW', ow_billed_on: 'Billed by Lloyd on', ow_bill_no: 'OW bill', ow_paid_on: 'Paid on',
  ow_payment_ref: 'Payment reference', company_pending: "Lloyd's pending list", replacement_doc: 'Replacement document', replacement_on: 'Replacement date',
  replacement_material: 'Replacement material', ticket_no: 'EX CRM ID', customer_name: 'Customer', remarks: 'Remarks',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : v === true ? 'Yes' : v === false ? 'No' : String(v).slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? date(String(v)) : String(v));

function ActivityTab({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['spares', 'activity', id], queryFn: () => api.get<Envelope<ActivityItem[]>>(`/spares/${id}/activity`).then((r) => r.data) });
  return (
    <Card>
      <QueryState loading={q.isLoading} error={q.error}>
        <ol className="space-y-4">
          {q.data?.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-500">{a.at ? dateTime(a.at) : ''}{a.user && ` by ${a.user}`}</p>
                {a.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {a.details.filter((d) => FIELD_NAMES[d.field]).map((d) => (
                      <li key={d.field}>{FIELD_NAMES[d.field]}: {show(d.from)} → <span className="font-medium text-slate-800">{show(d.to)}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </QueryState>
    </Card>
  );
}
