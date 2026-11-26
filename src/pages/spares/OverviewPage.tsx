import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle, ArrowRightLeft, Boxes, CheckCircle2, ChevronRight, Download, FileSpreadsheet, Hourglass, PackageCheck, Pencil,
  Plus, ReceiptText, ScanSearch, ShieldCheck, Truck, Upload,
} from 'lucide-react';
import { api, download, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { date, money, moneyShort, relative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, Select, toast } from '@/components/ui';
import { SpareEditor } from './SpareDialogs';
import { UploadDialog, type UploadKind } from './UploadDialog';
import { periodRange, PERIODS } from './sparesFilters';
import { CoverageBadge, MODULE, StatusBadge, useSparesSummary, type BrandSpare, type SparesSummary, type Status } from './sparesParts';
import { StepBar } from './sparesSteps';

/** Chart colours, validated as a set (blue, orange, aqua) with grey kept for "not sorted" and always labelled. */
const CHART = { warranty: '#2a78d6', ow: '#eb6834', done: '#1baf7a', none: '#94a3b8' };

interface Activity { at: string; user: string | null; title: string; parts: number; kind: 'dispatch' | 'inspection' | 'billing' | 'upload' | 'edit' }

/** SAPRE at a glance: how many parts, where they are, what needs doing next, and what changed lately. */
export default function OverviewPage() {
  const { can } = useAuth();
  const manage = can('spares.manage');
  const [period, setPeriod] = useState('');
  const [upload, setUpload] = useState<UploadKind | null>(null);
  const [adding, setAdding] = useState(false);
  const summary = useSparesSummary(periodRange(period));
  const s = summary.data;
  const recent = useQuery({ queryKey: ['spares', 'recent'], queryFn: () => api.get<Envelope<Activity[]>>('/spares/recent').then((r) => r.data) });
  const latest = useQuery({ queryKey: ['spares', 'latest'], queryFn: () => api.get<Paginated<BrandSpare>>('/spares', { per_page: '6' }) });
  const empty = s && s.total.count === 0 && !period;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex" aria-hidden><PackageCheck className="h-6 w-6" /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-[26px]">{MODULE}</h1>
            <p className="mt-1 text-sm text-slate-500">Every spare part Lloyd bills you, from the bill to its return or payment.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Billing date" className="w-44">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          {manage && <Button icon={<Upload className="h-4 w-4" />} onClick={() => setUpload('bill')}>Upload Excel</Button>}
        </div>
      </div>

      {empty ? (
        <Card>
          <EmptyState
            icon={<FileSpreadsheet className="h-6 w-6" />}
            title="No spare parts yet"
            message="Start by uploading the Excel Lloyd sends with each bill, or your current tracking sheet. Every part line comes in once, sorted into warranty and OW."
            action={manage ? <Button onClick={() => setUpload('bill')}>Upload Excel</Button> : undefined}
          />
        </Card>
      ) : (
        <>
        <div className="mb-5">
          <StepBar s={s} />
          <Mismatch s={s} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <Kpis s={s} />
            <div className="grid gap-4 lg:grid-cols-2">
              <WhereChart s={s} />
              <ClassChart s={s} />
            </div>
            <LatestRecords rows={latest.data?.data} loading={latest.isLoading} />
          </div>
          <div className="space-y-4">
            {manage && <QuickActions onUpload={setUpload} onAdd={() => setAdding(true)} />}
            <RecentActivity items={recent.data} loading={recent.isLoading} />
          </div>
        </div>
        </>
      )}

      <UploadDialog kind={upload} onClose={() => setUpload(null)} />
      <SpareEditor open={adding} spare={null} couriers={s?.couriers ?? []} onClose={() => setAdding(false)} />
    </>
  );
}

function Kpis({ s }: { s?: SparesSummary }) {
  const cards: { label: string; count?: number; value?: number; hint: string; to: string; icon: ReactNode; tone: string }[] = [
    { label: 'All parts', count: s?.total.count, value: s?.total.value, hint: 'billed by Lloyd', to: '/spares/register', icon: <Boxes className="h-5 w-5" />, tone: 'bg-brand-50 text-brand-700' },
    { label: 'Warranty', count: s?.by_class.warranty.count, value: s?.by_class.warranty.value, hint: 'go back to Lloyd', to: '/spares/register?path=warranty', icon: <ShieldCheck className="h-5 w-5" />, tone: 'bg-[#0070C0]/10 text-[#0070C0]' },
    { label: 'Out of warranty', count: s ? s.by_class.out_of_warranty.count + s.by_class.charged.count : undefined, value: s ? s.by_class.out_of_warranty.value + s.by_class.charged.value : undefined, hint: 'billed by Lloyd as OW', to: '/spares/register?path=ow', icon: <ReceiptText className="h-5 w-5" />, tone: 'bg-orange-50 text-orange-700' },
    { label: 'Pending', count: s?.pending.count, value: s?.pending.value, hint: 'need a step', to: '/spares/register?group=pending', icon: <Hourglass className="h-5 w-5" />, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Completed', count: s?.completed.count, value: s?.completed.value, hint: 'nothing left to do', to: '/spares/register?group=done', icon: <CheckCircle2 className="h-5 w-5" />, tone: 'bg-emerald-50 text-emerald-700' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Link key={c.label} to={c.to} className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <div className="flex items-center gap-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg lg:hidden 2xl:flex', c.tone)} aria-hidden>{c.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{c.count === undefined ? '–' : c.count.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-slate-500">{c.value === undefined ? ' ' : `${moneyShort(c.value)}, ${c.hint}`}</p>
        </Link>
      ))}
    </div>
  );
}

/** Where the parts are: open warranty returns, open OW billing, completed, not sorted. */
function WhereChart({ s }: { s?: SparesSummary }) {
  const n = (keys: Status[]) => keys.reduce((a, k) => a + (s?.by_status[k].count ?? 0), 0);
  const groups = [
    { name: 'Warranty returns open', value: n(['pending_inspection', 'pending_dispatch', 'pending_return']), color: CHART.warranty, detail: `${n(['pending_inspection'])} to inspect, ${n(['pending_dispatch'])} to send, ${n(['pending_return'])} with Lloyd` },
    { name: 'OW billing open', value: n(['ow_billing_pending', 'payment_pending']), color: CHART.ow, detail: `${n(['ow_billing_pending'])} not billed yet, ${n(['payment_pending'])} to pay` },
    { name: 'Completed', value: n(['return_completed', 'replacement_completed', 'completed']), color: CHART.done, detail: 'nothing left to do' },
    { name: 'Not sorted', value: n(['unsorted']), color: CHART.none, detail: 'warranty or OW not known' },
  ];
  const total = groups.reduce((a, g) => a + g.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <Card title="Where the parts are">
      <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={groups} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {groups.map((g) => <Cell key={g.name} fill={g.color} />)}
              </Pie>
              <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString('en-IN')} parts (${pct(v)}%)`, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-slate-900">{s ? total.toLocaleString('en-IN') : '–'}</span>
            <span className="text-xs text-slate-500">parts</span>
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-2.5 text-sm">
          {groups.map((g) => (
            <li key={g.name} className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">{g.name}</span>
                  <span className="tabular-nums text-slate-900">{g.value.toLocaleString('en-IN')} <span className="text-slate-500">({pct(g.value)}%)</span></span>
                </div>
                <p className="text-xs text-slate-500">{g.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** How the parts are classified, the way the Excel colours them. */
function ClassChart({ s }: { s?: SparesSummary }) {
  const rows = [
    { label: 'Warranty', key: 'warranty', color: CHART.warranty, to: '/spares/register?path=warranty' },
    { label: 'Out of warranty', key: 'out_of_warranty', color: CHART.ow, to: '/spares/register?coverage=out_of_warranty' },
    { label: 'Warranty, billed as OW', key: 'charged', color: CHART.ow, to: '/spares/ow-billing' },
    { label: 'For stock', key: 'stock', color: CHART.done, to: '/spares/register?coverage=stock' },
    { label: 'Not sorted', key: 'none', color: CHART.none, to: '/spares/register?status=unsorted' },
  ] as const;
  const max = Math.max(1, ...rows.map((r) => s?.by_class[r.key].count ?? 0));
  return (
    <Card title="Warranty and OW">
      <ul className="space-y-3">
        {rows.map((r) => {
          const v = s?.by_class[r.key];
          return (
            <li key={r.key}>
              <Link to={r.to} className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={v ? `${r.label}: ${v.count} parts, ${money(v.value)}` : r.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-slate-700 group-hover:text-slate-900">{r.label}</span>
                  <span className="tabular-nums text-slate-900">{v ? v.count.toLocaleString('en-IN') : '–'} <span className="text-xs text-slate-500">{v ? moneyShort(v.value) : ''}</span></span>
                </div>
                <div className="mt-1 h-2.5 rounded bg-slate-100">
                  <div className="h-2.5 rounded" style={{ width: `${((v?.count ?? 0) / max) * 100}%`, background: r.color }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function QuickActions({ onUpload, onAdd }: { onUpload: (k: UploadKind) => void; onAdd: () => void }) {
  const items: { label: string; help: string; icon: ReactNode; onClick: () => void }[] = [
    { label: 'Upload Excel', help: 'A Lloyd bill, or the filled template', icon: <Upload className="h-4 w-4" />, onClick: () => onUpload('bill') },
    { label: "Upload Lloyd's pending list", help: 'Marks what Lloyd has received', icon: <ArrowRightLeft className="h-4 w-4" />, onClick: () => onUpload('pending') },
    { label: 'Add a part by hand', help: 'For a bill that was not uploaded', icon: <Plus className="h-4 w-4" />, onClick: onAdd },
    { label: 'Download blank template', help: 'The SAPRE Excel to fill in', icon: <Download className="h-4 w-4" />, onClick: () => download('/spares/template', 'sapre-template.xlsx').catch((e) => toast.error(e.message)) },
  ];
  return (
    <Card title="Quick actions" padded={false}>
      <ul className="divide-y divide-slate-100">
        {items.map((it) => (
          <li key={it.label}>
            <button type="button" onClick={it.onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden>{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{it.label}</span>
                <span className="block text-xs text-slate-500">{it.help}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Sent parts Lloyd's pending list still shows: the one thing to chase with Lloyd. */
function Mismatch({ s }: { s?: SparesSummary }) {
  if (!s?.mismatch.count) return null;
  return (
    <Link to="/spares/dispatch?status=pending_return&attention=mismatch" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <span className="flex-1"><span className="font-semibold">{s.mismatch.count} parts you sent</span> are still on Lloyd's pending list ({moneyShort(s.mismatch.value)}). Follow up with Lloyd.</span>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
    </Link>
  );
}

function RecentActivity({ items, loading }: { items?: Activity[]; loading: boolean }) {
  const icon = (k: Activity['kind']) => ({
    dispatch: <Truck className="h-4 w-4" />, inspection: <ScanSearch className="h-4 w-4" />, billing: <ReceiptText className="h-4 w-4" />,
    upload: <Upload className="h-4 w-4" />, edit: <Pencil className="h-4 w-4" />,
  })[k];
  return (
    <Card title="Recent activity">
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
      ) : !items?.length ? (
        <p className="text-sm text-slate-500">Nothing yet. Uploads and changes to parts show here.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-hidden>{icon(a.kind)}</span>
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{a.title}{a.parts > 1 && a.kind !== 'upload' ? `, ${a.parts} parts` : ''}</p>
                <p className="text-xs text-slate-500">{relative(a.at)}{a.user && ` by ${a.user}`}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LatestRecords({ rows, loading }: { rows?: BrandSpare[]; loading: boolean }) {
  const navigate = useNavigate();
  return (
    <Card title="Latest parts" actions={<Link to="/spares/register" className="text-sm font-medium text-brand-700 hover:underline">See all parts</Link>} padded={false}>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />)}</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows?.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => navigate(`/spares/${r.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_9rem_6rem_10rem]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{r.description ?? r.material_code}</span>
                  <span className="block truncate text-xs text-slate-500">{r.material_code}, bill {r.billing_doc}, {date(r.billing_date)}</span>
                </span>
                <span className="hidden sm:block"><CoverageBadge spare={r} /></span>
                <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{money(r.value)}</span>
                <span className="col-span-2 sm:col-span-1 sm:text-right"><StatusBadge status={r.status} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
