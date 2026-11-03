import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, ClipboardList, Hourglass, MapPinPlus, Pencil, UserX } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups, useStaffOptions } from '@/lib/hooks';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, StatCard, Textarea } from '@/components/ui';

interface LocationTechnician {
  id: number;
  name: string;
  phone: string | null;
  on_duty: boolean;
  linked: boolean;
  active_jobs: number;
  completed: number;
}

interface LocationRow {
  id: number | null;
  name: string | null;
  code: string | null;
  city: string | null;
  pincodes: string | null;
  is_active: boolean;
  linked_technicians: number;
  on_duty: number;
  active: number;
  open: number;
  in_progress: number;
  pending: number;
  part_pending: number;
  cancel_requested: number;
  unassigned: number;
  overdue: number;
  aged: number;
  logged: number;
  completed: number;
  cancelled: number;
  completion_rate: number | null;
  avg_days_to_complete: number | null;
  billed?: number;
  technicians: LocationTechnician[];
}

interface Analysis {
  aged_days: number;
  totals: { active: number; unassigned: number; overdue: number; aged: number; logged: number; completed: number; without_technician: number };
  locations: LocationRow[];
  trend: { bucket: 'day' | 'month'; points: { date: string; logged: number; completed: number }[] };
}

type Period = 'this_month' | 'last_month' | 'last_30' | 'custom';

// Categorical order, checked with the dataviz validator (CVD ΔE 9.1). Some steps are below 3:1 on white, so the table below is the labelled view of the same numbers.
const STAGES = [
  { key: 'open', label: 'Open', color: '#2a78d6' },
  { key: 'in_progress', label: 'In progress', color: '#eb6834' },
  { key: 'pending', label: 'Pending', color: '#1baf7a' },
  { key: 'part_pending', label: 'Part pending', color: '#eda100' },
  { key: 'cancel_requested', label: 'Cancellation requested', color: '#e87ba4' },
] as const;

// Same validated pair as the dashboard's trend.
const SERIES_LOGGED = '#2563EB';
const SERIES_COMPLETED = '#059669';

const ACTIVE_STATUSES = 'open,in_progress,pending,part_pending,cancel_requested';
const MAX_CHART_ROWS = 8;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periodDates(period: Exclude<Period, 'custom'>): { from: string; to: string } {
  const now = new Date();
  if (period === 'last_month') return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (period === 'this_month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to: iso(now) };
}

const locationName = (l: LocationRow) => l.name ?? 'No location set';

/** A count that opens the matching jobs; nothing to open when it's zero. */
function JobCount({ value, to, alert }: { value: number; to: string; alert?: boolean }) {
  if (!value) return <span className="text-slate-400">0</span>;
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()} className={cn('font-semibold tabular-nums hover:underline', alert ? 'text-red-700' : 'text-slate-900')}>
      {value}
    </Link>
  );
}

/** Each location's jobs in hand, split by stage. */
function StageChart({ locations }: { locations: LocationRow[] }) {
  const busy = locations.filter((l) => l.active > 0);
  const rows = busy.slice(0, MAX_CHART_ROWS).map((l) => ({ ...l, name: locationName(l) }));
  return (
    <Card
      title="Jobs in hand by stage"
      className="h-full"
      actions={
        <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-slate-600" aria-label="Stages">
          {STAGES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</li>
          ))}
        </ul>
      }
    >
      {rows.length ? (
        <>
          <div role="img" aria-label={`Jobs in hand at ${rows.length} locations, by stage. The table below has the same numbers.`} style={{ height: Math.max(256, rows.length * 38 + 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={118} interval={0} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                {STAGES.map((s) => (
                  <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.label} stackId="stage" fill={s.color} stroke="#fff" strokeWidth={2} barSize={16} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {busy.length > rows.length && <p className="mt-2 text-xs text-slate-500">Showing the {rows.length} busiest of {busy.length} locations.</p>}
        </>
      ) : (
        <p className="flex h-64 items-center justify-center text-sm text-slate-500">No jobs in hand at any location.</p>
      )}
    </Card>
  );
}

/** Whether the work coming in is being finished, over the chosen period. */
function TrendChart({ trend, totals }: { trend: Analysis['trend']; totals: Analysis['totals'] }) {
  const tick = (v: string) =>
    trend.bucket === 'month'
      ? new Date(`${v}-01T00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      : new Date(`${v}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <Card
      title="Jobs logged and completed"
      className="h-full"
      actions={
        <span className="flex gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES_LOGGED }} />Logged <b className="tabular-nums text-slate-900">{totals.logged}</b></span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES_COMPLETED }} />Completed <b className="tabular-nums text-slate-900">{totals.completed}</b></span>
        </span>
      }
    >
      <div className="h-64" role="img" aria-label={`In this period ${totals.logged} jobs were logged and ${totals.completed} completed.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={tick} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip labelFormatter={(v) => tick(String(v))} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} cursor={{ stroke: '#94a3b8' }} />
            <Line isAnimationActive={false} type="monotone" name="Logged" dataKey="logged" stroke={SERIES_LOGGED} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line isAnimationActive={false} type="monotone" name="Completed" dataKey="completed" stroke={SERIES_COMPLETED} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Adds a service area, or edits one: its name, the PIN codes it covers and who works there. */
function ServiceAreaDialog({ area, onClose }: { area: LocationRow | null; onClose: () => void }) {
  const { data: techs } = useStaffOptions('technician');
  const [form, setForm] = useState({ name: area?.name ?? '', code: area?.code ?? '', city: area?.city ?? '', pincodes: area?.pincodes ?? '' });
  const [techIds, setTechIds] = useState<number[]>(() => area?.technicians.filter((t) => t.linked).map((t) => t.id) ?? []);
  const m = useApiMutation(
    (body: object) => (area ? api.patch(`/master/service-locations/${area.id}`, body) : api.post('/master/service-locations', body)),
    { success: area ? 'Service area saved.' : 'Service area added.', toastValidation: false, invalidate: [['location-analysis'], ['lookups'], ['master'], ['dashboard']], onSuccess: onClose },
  );
  const e = (k: string) => fieldError(m.error, k);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={area ? `Edit ${area.name}` : 'Add a service area'}
      description="Link the technicians who cover it, so new jobs there can be auto-assigned."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={m.isPending}
            disabled={!form.name.trim()}
            onClick={() => m.mutate({ name: form.name.trim(), code: form.code.trim() || null, city: form.city.trim() || null, pincodes: form.pincodes.trim() || null, is_active: area?.is_active ?? true, technician_ids: techIds })}
          >
            {area ? 'Save changes' : 'Add service area'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Area name" required error={e('name')}>
          <Input autoFocus value={form.name} onChange={(ev) => set('name', ev.target.value)} maxLength={150} placeholder="e.g. Payyanur" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" error={e('city')}>
            <Input value={form.city} onChange={(ev) => set('city', ev.target.value)} maxLength={100} />
          </Field>
          <Field label="Code" error={e('code')}>
            <Input value={form.code} onChange={(ev) => set('code', ev.target.value)} maxLength={20} />
          </Field>
        </div>
        <Field label="PIN codes covered" error={e('pincodes')} hint="Separate with commas or spaces. Used to suggest this area for a customer.">
          <Textarea rows={2} value={form.pincodes} onChange={(ev) => set('pincodes', ev.target.value)} />
        </Field>
        <Field label="Technicians who cover this area" error={e('technician_ids')}>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {!techs?.length && <p className="px-1 py-2 text-sm text-slate-500">No technicians yet.</p>}
            {techs?.map((t) => (
              <Checkbox key={t.id} label={t.name} checked={techIds.includes(t.id)} onChange={(v) => setTechIds((ids) => (v ? [...ids, t.id] : ids.filter((i) => i !== t.id)))} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function ServiceLocations() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: lookups } = useLookups();
  const canEdit = can('master.manage');
  const [period, setPeriod] = useState<Period>('last_30');
  const [custom, setCustom] = useState(() => periodDates('last_30'));
  const [branch, setBranch] = useState('');
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [showQuiet, setShowQuiet] = useState(false);
  // null: closed. An empty object: adding a new area.
  const [dialog, setDialog] = useState<{ area: LocationRow | null } | null>(null);
  const range = period === 'custom' ? custom : periodDates(period);

  const q = useQuery({
    queryKey: ['location-analysis', range, branch],
    queryFn: () => api.get<Envelope<Analysis>>('/jobs/location-analysis', { ...range, branch_id: branch }).then((r) => r.data),
    enabled: !!range.from && !!range.to && range.from <= range.to,
  });
  const d = q.data;
  const maxActive = useMemo(() => Math.max(1, ...(d?.locations ?? []).map((l) => l.active)), [d]);
  const showBilled = d?.locations.some((l) => l.billed !== undefined) ?? false;
  const isQuiet = (l: LocationRow) => !l.active && !l.logged && !l.completed;
  const quietCount = d?.locations.filter(isQuiet).length ?? 0;
  const rows = d?.locations.filter((l) => showQuiet || !isQuiet(l)) ?? [];

  // Links keep the branch, so a count and the list it opens agree.
  const jobsLink = (params: Record<string, string>) => `/jobs?${new URLSearchParams({ ...params, ...(branch ? { branch_id: branch } : {}) })}`;
  const locationParam = (l: LocationRow) => ({ service_location_id: l.id ? String(l.id) : 'none' });
  const rowKey = (l: LocationRow) => String(l.id ?? 'none');
  const toggle = (key: string) =>
    setOpenRows((open) => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addButton = canEdit && (
    <Button icon={<MapPinPlus className="h-4 w-4" />} onClick={() => setDialog({ area: null })}>
      Add service area
    </Button>
  );
  const controls = (
    <>
      <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="!w-40" aria-label="Period">
        <option value="last_30">Last 30 days</option>
        <option value="this_month">This month</option>
        <option value="last_month">Last month</option>
        <option value="custom">Choose dates</option>
      </Select>
      {period === 'custom' && (
        <>
          <Input type="date" aria-label="From" className="!w-40" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input type="date" aria-label="To" className="!w-40" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>
      )}
      {(lookups?.branches.length ?? 0) > 1 && (
        <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="!w-44" aria-label="Branch">
          <option value="">All branches</option>
          {lookups?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      )}
      {addButton}
    </>
  );

  return (
    <>
      <PageHeader title="Service locations" description="Where the work is, who it is allocated to, and how each area is doing." actions={controls} />

      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && !d.locations.length && (
          <Card>
            <EmptyState title="No service areas yet" message="Add the areas you serve and link technicians to them." action={addButton || undefined} />
          </Card>
        )}
        {d && d.locations.length > 0 && (
          <div className="space-y-6">
            <section aria-label="Right now">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Right now</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Jobs in hand" value={d.totals.active} hint="Not yet completed or cancelled" icon={<ClipboardList className="h-5 w-5" />} tone="blue" onClick={() => navigate(jobsLink({ status: ACTIVE_STATUSES }))} />
                <StatCard label="No technician" value={d.totals.unassigned} hint="Waiting to be assigned" icon={<UserX className="h-5 w-5" />} tone={d.totals.unassigned ? 'amber' : 'slate'} onClick={() => navigate(jobsLink({ quick: 'unassigned' }))} />
                <StatCard label="Overdue visits" value={d.totals.overdue} hint="Visit date has passed" icon={<CalendarClock className="h-5 w-5" />} tone={d.totals.overdue ? 'red' : 'slate'} onClick={() => navigate(jobsLink({ quick: 'overdue', sort: 'scheduled' }))} />
                <StatCard label={`Old jobs (${d.aged_days}+ days)`} value={d.totals.aged} hint="Still unfinished" icon={<Hourglass className="h-5 w-5" />} tone={d.totals.aged ? 'amber' : 'slate'} onClick={() => navigate(jobsLink({ quick: 'aged' }))} />
              </div>
            </section>

            {d.totals.without_technician > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  {d.totals.without_technician === 1 ? '1 area has' : `${d.totals.without_technician} areas have`} jobs in hand but no technician linked, so auto-assign can’t pick anyone there. Open the area below to link technicians.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="min-w-0"><StageChart locations={d.locations} /></div>
              <div className="min-w-0"><TrendChart trend={d.trend} totals={d.totals} /></div>
            </div>

            <Card title="Area by area" padded={false}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 text-xs text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th scope="col" rowSpan={2} className="px-4 py-2 text-left font-semibold uppercase tracking-wide">Area</th>
                      <th scope="colgroup" colSpan={4} className="border-l border-slate-200 px-4 py-2 text-center font-semibold uppercase tracking-wide">Right now</th>
                      <th scope="colgroup" colSpan={showBilled ? 5 : 4} className="border-l border-slate-200 px-4 py-2 text-center font-semibold uppercase tracking-wide">In this period</th>
                    </tr>
                    <tr className="whitespace-nowrap border-b border-slate-100">
                      <th scope="col" className="min-w-[10rem] border-l border-slate-200 px-4 py-2 text-left font-medium">Jobs in hand</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">No technician</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Overdue</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Old {d.aged_days}+ days</th>
                      <th scope="col" className="border-l border-slate-200 px-3 py-2 text-right font-medium">Logged</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Completed</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Done %</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Avg. days</th>
                      {showBilled && <th scope="col" className="px-3 py-2 text-right font-medium">Billed</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((l) => {
                      const key = rowKey(l);
                      const open = openRows.has(key);
                      const here = locationParam(l);
                      return (
                        <Fragment key={key}>
                          <tr onClick={() => toggle(key)} className="cursor-pointer hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <button type="button" aria-expanded={open} className="flex items-start gap-2 text-left">
                                {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                                <span>
                                  <span className={cn('block font-medium', l.id ? 'text-slate-900' : 'italic text-slate-600')}>{locationName(l)}</span>
                                  <span className="block whitespace-nowrap text-xs text-slate-500">
                                    {l.id ? `${l.linked_technicians} technician${l.linked_technicians === 1 ? '' : 's'} · ${l.on_duty} on duty` : 'Jobs without an area'}
                                  </span>
                                </span>
                              </button>
                            </td>
                            <td className="border-l border-slate-100 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5"><JobCount value={l.active} to={jobsLink({ ...here, status: ACTIVE_STATUSES })} /></span>
                                <div className="h-2 min-w-[5rem] flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${l.active ? Math.max(4, (l.active / maxActive) * 100) : 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right"><JobCount value={l.unassigned} to={jobsLink({ ...here, quick: 'unassigned' })} alert /></td>
                            <td className="px-3 py-3 text-right"><JobCount value={l.overdue} to={jobsLink({ ...here, quick: 'overdue', sort: 'scheduled' })} alert /></td>
                            <td className="px-3 py-3 text-right"><JobCount value={l.aged} to={jobsLink({ ...here, quick: 'aged' })} alert /></td>
                            <td className={cn('border-l border-slate-100 px-3 py-3 text-right tabular-nums', !l.logged && 'text-slate-400')}>{l.logged}</td>
                            <td className={cn('px-3 py-3 text-right tabular-nums', !l.completed && 'text-slate-400')}>{l.completed}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{l.completion_rate === null ? <span className="text-slate-400">—</span> : `${l.completion_rate}%`}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{l.avg_days_to_complete === null ? <span className="text-slate-400">—</span> : l.avg_days_to_complete}</td>
                            {showBilled && <td className={cn('whitespace-nowrap px-3 py-3 text-right tabular-nums', !l.billed && 'text-slate-400')}>{l.billed ? money(l.billed) : '—'}</td>}
                          </tr>
                          {open && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={showBilled ? 10 : 9} className="px-4 py-4">
                                <div className="grid gap-6 lg:grid-cols-3">
                                  <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Jobs in hand by stage</p>
                                    <dl className="space-y-1.5">
                                      {STAGES.map((s) => (
                                        <div key={s.key} className="flex justify-between gap-3">
                                          <dt className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</dt>
                                          <dd><JobCount value={l[s.key]} to={jobsLink({ ...here, status: s.key })} /></dd>
                                        </div>
                                      ))}
                                    </dl>
                                    {l.pincodes && <p className="mt-3 break-words text-xs text-slate-500">PIN codes: {l.pincodes}</p>}
                                  </div>
                                  <div className="lg:col-span-2">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technician allocation</p>
                                      {canEdit && l.id && (
                                        <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ area: l })}>
                                          Edit area & technicians
                                        </Button>
                                      )}
                                    </div>
                                    {l.technicians.length ? (
                                      <table className="min-w-full text-sm">
                                        <thead className="text-xs text-slate-500">
                                          <tr>
                                            <th scope="col" className="pb-1.5 text-left font-medium">Technician</th>
                                            <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Jobs in hand</th>
                                            <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Completed in period</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {l.technicians.map((t) => (
                                            <tr key={t.id}>
                                              <td className="py-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <Avatar name={t.name} className="h-7 w-7 text-[10px]" />
                                                  <span className="font-medium text-slate-900">{t.name}</span>
                                                  <Badge tone={t.on_duty ? 'green' : 'slate'}>{t.on_duty ? 'On duty' : 'Off duty'}</Badge>
                                                  {l.id && !t.linked && <Badge tone="amber">Not linked to this area</Badge>}
                                                </div>
                                              </td>
                                              <td className="py-1.5 pl-3 text-right">
                                                <JobCount value={t.active_jobs} to={jobsLink({ ...here, technician_id: String(t.id), status: ACTIVE_STATUSES })} />
                                              </td>
                                              <td className="py-1.5 pl-3 text-right tabular-nums">{t.completed}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="text-sm text-amber-800">{l.id ? 'No technician is linked to this area or working on its jobs.' : 'No technician is working on these jobs.'}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {quietCount > 0 && (
                <div className="border-t border-slate-100 px-4 py-2.5">
                  <button type="button" onClick={() => setShowQuiet((v) => !v)} className="text-xs font-medium text-brand-700 hover:underline">
                    {showQuiet ? 'Hide areas with no activity' : `Show ${quietCount} more area${quietCount === 1 ? '' : 's'} with no activity`}
                  </button>
                </div>
              )}
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                Click an area to see its technicians. Done % is how many jobs logged in the period are completed, leaving out cancelled ones. Avg. days is the time from logging to completion.
              </p>
            </Card>
          </div>
        )}
      </QueryState>

      {dialog && <ServiceAreaDialog area={dialog.area} onClose={() => setDialog(null)} />}
    </>
  );
}
