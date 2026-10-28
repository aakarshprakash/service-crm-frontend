import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import {
  AlertTriangle, ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, ClipboardCheck, IndianRupee, PackageCheck, Plus, UserX, Users, Wallet,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Envelope } from '@/lib/api';
import { moneyWhole as money, moneyShort, qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, QueryState, Select } from '@/components/ui';
import { StatusBadge, Stars } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import type { Priority } from '@/lib/types';

interface TodayVisit {
  id: number;
  crm_call_id: string;
  status: string;
  priority: Priority;
  scheduled_at: string | null;
  customer: string | null;
  city: string | null;
  technician: string | null;
  service_type: string | null;
  brand: string | null;
}

interface DashboardData {
  today: { visits: TodayVisit[]; completed: number; logged: number };
  jobs: {
    by_status: Record<string, number>;
    unassigned: number;
    scheduled_today: number;
    overdue: number;
    created_this_month: number;
    trend: { date: string; created: number; completed: number }[];
  };
  /** Missing for roles without billing access (HR, stores). */
  revenue?: { collected_today: number; collected_this_month: number; by_method: Record<string, number>; outstanding: number; credit_outstanding: number; invoiced_this_month: number };
  technicians: {
    total: number;
    on_duty: number;
    performance: { id: number; name: string; completed: number; visits: number; avg_duration_minutes: number | null; revenue: number | null; rating: number | null }[];
  };
  inventory: { low_stock_count: number; low_stock: { id: number; code: string; name: string; unit_of_measure: string; reorder_level: number; quantity_available: number; branch_name: string }[] };
  cash: { pending_verification: number; discrepancies_this_month: number };
  rating: number;
}

// Validated pair (dataviz validator: CVD ΔE 24.9, both ≥ 3:1 on white): Electric Blue + deep Teal.
const SERIES_1 = '#2563EB';
const SERIES_2 = '#059669';

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { data: lookups } = useLookups();
  const [branch, setBranch] = useState('');
  const q = useQuery({
    queryKey: ['dashboard', branch],
    queryFn: () => api.get<Envelope<DashboardData>>('/dashboard', { branch_id: branch }).then((r) => r.data),
    refetchInterval: 120_000,
  });
  const d = q.data;
  const todayLabel = new Date().toLocaleDateString(`${i18n.language}-IN`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title={t(`dashboard.greeting.${greeting()}`, { name: user?.name.split(' ')[0] })}
        description={`${todayLabel} · ${t('dashboard.subtitle')}`}
        actions={
          <>
            {(lookups?.branches.length ?? 0) > 1 && (
              <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="!w-48" aria-label={t('common.branch')}>
                <option value="">{t('common.allBranches')}</option>
                {lookups?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
            {can('jobs.manage') && (
              <Hint text={t('dashboard.newJobHint')}>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/jobs/new')}>
                  {t('dashboard.newJobCard', 'New job card')}
                </Button>
              </Hint>
            )}
          </>
        }
      />
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <div className="space-y-6">
            <Attention d={d} />
            <TodayTiles d={d} />

            <div className="grid gap-6 lg:grid-cols-3">
              {can('jobs.view') && <TodayVisits d={d} />}
              <Pipeline d={d} className={can('jobs.view') ? '' : 'lg:col-span-3'} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Trend d={d} className={d.revenue ? 'lg:col-span-2' : 'lg:col-span-3'} />
              {d.revenue && <Money revenue={d.revenue} />}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Team d={d} />
              <LowStock d={d} />
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

/** What needs someone's action now – big, plain and clickable. */
function Attention({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const items = [
    { show: d.jobs.overdue > 0, to: '/jobs?status=open,pending&sort=scheduled', icon: <CalendarClock className="h-5 w-5" />, count: d.jobs.overdue, text: t('dashboard.att.overdue', 'Visits overdue'), action: t('dashboard.att.overdueAction', 'Reschedule or attend'), tone: 'red' },
    { show: d.jobs.unassigned > 0, to: '/jobs?technician_id=unassigned&status=open,pending', icon: <UserX className="h-5 w-5" />, count: d.jobs.unassigned, text: t('dashboard.att.unassigned', 'Jobs without a technician'), action: t('dashboard.att.unassignedAction', 'Assign a technician'), tone: 'amber' },
    { show: d.cash.pending_verification > 0 && can('cash.verify'), to: '/accounts/cash-close?status=submitted', icon: <Wallet className="h-5 w-5" />, count: d.cash.pending_verification, text: t('dashboard.att.cash', 'Cash handovers to check'), action: t('dashboard.att.cashAction', 'Verify cash close'), tone: 'amber' },
    { show: d.inventory.low_stock_count > 0, to: '/inventory?tab=stock&low_stock=1', icon: <AlertTriangle className="h-5 w-5" />, count: d.inventory.low_stock_count, text: t('dashboard.att.stock', 'Items running low'), action: t('dashboard.att.stockAction', 'Reorder stock'), tone: 'amber' },
  ].filter((i) => i.show);

  if (!items.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span className="font-medium">{t('dashboard.att.clear', 'All clear – nothing overdue, every job has a technician and stock is fine.')}</span>
      </div>
    );
  }
  return (
    <section aria-label={t('dashboard.att.title', 'Needs attention')}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('dashboard.att.title', 'Needs attention')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className={cn(
              'group flex items-center gap-4 rounded-xl border bg-white p-4 shadow-card transition hover:shadow-lift',
              i.tone === 'red' ? 'border-red-200 hover:border-red-300' : 'border-amber-200 hover:border-amber-300',
            )}
          >
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', i.tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>{i.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{i.count}</span>
                <span className="truncate text-sm font-medium text-slate-700">{i.text}</span>
              </p>
              <p className={cn('mt-0.5 flex items-center gap-1 text-xs font-medium', i.tone === 'red' ? 'text-red-700' : 'text-amber-700')}>
                {i.action} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Today at a glance – headline numbers, not charts. */
function TodayTiles({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onDutyPct = d.technicians.total ? Math.round((d.technicians.on_duty / d.technicians.total) * 100) : 0;
  return (
    <section aria-label={t('dashboard.today', 'Today')}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('dashboard.today', 'Today')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<CalendarCheck className="h-5 w-5" />} tone="bg-brand-50 text-brand-700" label={t('dashboard.tile.visits', 'Visits scheduled')} value={d.jobs.scheduled_today} note={t('dashboard.tile.logged', '{{count}} new job(s) logged today', { count: d.today.logged })} onClick={() => navigate('/jobs?sort=scheduled')} />
        <Tile icon={<ClipboardCheck className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" label={t('dashboard.tile.completed', 'Jobs completed')} value={d.today.completed} note={t('dashboard.tile.month', '{{count}} logged this month', { count: d.jobs.created_this_month })} onClick={() => navigate('/jobs?status=completed')} />
        <Tile
          icon={<Users className="h-5 w-5" />}
          tone="bg-violet-50 text-violet-700"
          label={t('dashboard.tile.onDuty', 'Technicians on duty')}
          value={
            <span>
              {d.technicians.on_duty}
              <span className="text-base font-medium text-slate-400"> / {d.technicians.total}</span>
            </span>
          }
          note={
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <span className="block h-full rounded-full bg-violet-500" style={{ width: `${onDutyPct}%` }} />
            </span>
          }
          onClick={() => navigate('/hr')}
        />
        {d.revenue ? (
          <Tile icon={<IndianRupee className="h-5 w-5" />} tone="bg-amber-50 text-amber-700" label={t('dashboard.tile.collected', 'Money collected')} value={money(d.revenue.collected_today)} note={t('dashboard.tile.monthMoney', '{{amount}} this month', { amount: money(d.revenue.collected_this_month) })} onClick={() => navigate('/accounts/receipts')} />
        ) : (
          <Tile icon={<ClipboardCheck className="h-5 w-5" />} tone="bg-amber-50 text-amber-700" label={t('dashboard.tile.pending', 'Waiting (parts / revisit)')} value={d.jobs.by_status.pending ?? 0} onClick={() => navigate('/jobs?status=pending')} />
        )}
      </div>
    </section>
  );
}

function Tile({ icon, tone, label, value, note, onClick }: { icon: ReactNode; tone: string; label: string; value: ReactNode; note?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-card transition hover:border-brand-200 hover:shadow-lift">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </button>
  );
}

/** Today's visits in time order. */
function TodayVisits({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(`${i18n.language}-IN`, { hour: 'numeric', minute: '2-digit' }) : '—');
  return (
    <Card
      title={t('dashboard.visitsTitle', 'Today’s visits')}
      className="lg:col-span-2"
      padded={false}
      actions={<Link to="/jobs?sort=scheduled" className="text-sm font-medium text-brand-700 hover:underline">{t('dashboard.allJobs', 'All jobs')} →</Link>}
    >
      {d.today.visits.length ? (
        <ul className="divide-y divide-slate-100">
          {d.today.visits.map((v) => (
            <li key={v.id}>
              <Link to={`/jobs/${v.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                <p className="w-16 shrink-0 text-sm font-semibold tabular-nums text-slate-900">{time(v.scheduled_at)}</p>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
                    <span className="truncate">
                      {v.customer ?? '—'}
                      {v.city && <span className="font-normal text-slate-500"> · {v.city}</span>}
                    </span>
                    {v.priority === 'high' && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-red-600">{t('dashboard.urgent', 'Urgent')}</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{[v.brand, v.service_type, v.crm_call_id].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="hidden w-36 shrink-0 sm:block">
                  {v.technician ? (
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      <Avatar name={v.technician} className="h-6 w-6 text-[10px]" />
                      <span className="truncate">{v.technician}</span>
                    </span>
                  ) : (
                    <Badge tone="amber">{t('dashboard.noTech', 'No technician')}</Badge>
                  )}
                </div>
                <div className="w-24 shrink-0 text-right">
                  <StatusBadge status={v.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title={t('dashboard.noVisitsToday', 'No visits scheduled for today')}
          message={t('dashboard.noVisitsTodayHint', 'Jobs with a visit date today appear here in time order.')}
          action={can('jobs.manage') ? <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/jobs/new')}>{t('dashboard.newJobCard', 'New job card')}</Button> : undefined}
        />
      )}
    </Card>
  );
}

/**
 * Jobs still to finish, by stage – one hue, length = count, numbers always shown. Completed jobs pile up
 * over time, so they're a figure below rather than a bar that would dwarf the work in hand.
 */
function Pipeline({ d, className }: { d: DashboardData; className?: string }) {
  const { t } = useTranslation();
  const s = d.jobs.by_status;
  const stages = [
    { key: 'open', label: t('dashboard.stage.open', 'Waiting to start') },
    { key: 'in_progress', label: t('dashboard.stage.progress', 'Technician working') },
    { key: 'pending', label: t('dashboard.stage.pending', 'Waiting for parts / revisit') },
  ];
  const active = stages.reduce((a, x) => a + (s[x.key] ?? 0), 0);
  const max = Math.max(1, ...stages.map((x) => s[x.key] ?? 0));
  return (
    <Card title={t('dashboard.pipeline', 'Jobs in hand')} className={className} actions={<span className="text-2xl font-bold tabular-nums text-slate-900">{active}</span>}>
      <ul className="space-y-4">
        {stages.map((st) => {
          const n = s[st.key] ?? 0;
          return (
            <li key={st.key}>
              <Link to={`/jobs?status=${st.key}`} className="group block">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-700 group-hover:text-brand-700">{st.label}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{n}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${n ? Math.max(3, (n / max) * 100) : 0}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
        <Link to="/jobs?status=completed" className="rounded-lg p-1 hover:bg-slate-50">
          <p className="text-xs text-slate-500">{t('dashboard.doneAll', 'Completed (all time)')}</p>
          <p className="font-semibold tabular-nums text-emerald-700">{s.completed ?? 0}</p>
        </Link>
        <Link to="/jobs?status=cancelled" className="rounded-lg p-1 hover:bg-slate-50">
          <p className="text-xs text-slate-500">{t('status.cancelled')}</p>
          <p className="font-semibold tabular-nums text-slate-900">{s.cancelled ?? 0}</p>
        </Link>
      </div>
    </Card>
  );
}

/** Jobs created vs completed – change over time, two series, legend + totals in the header. */
function Trend({ d, className }: { d: DashboardData; className?: string }) {
  const { t } = useTranslation();
  const created = d.jobs.trend.reduce((a, r) => a + r.created, 0);
  const completed = d.jobs.trend.reduce((a, r) => a + r.completed, 0);
  return (
    <Card
      title={t('dashboard.trendTitle')}
      className={className}
      actions={
        <span className="flex gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES_1 }} />{t('dashboard.created')} <b className="tabular-nums text-slate-900">{created}</b></span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES_2 }} />{t('status.completed')} <b className="tabular-nums text-slate-900">{completed}</b></span>
        </span>
      }
    >
      <div className="h-64" role="img" aria-label={`${t('dashboard.trendTitle')}: ${created} / ${completed}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={d.jobs.trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip labelFormatter={(v) => shortDate(String(v))} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
            <Line isAnimationActive={false} type="monotone" name={t('dashboard.created')} dataKey="created" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            <Line isAnimationActive={false} type="monotone" name={t('status.completed')} dataKey="completed" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Money this month: one headline number, then a single-series breakdown by method (no legend needed). */
function Money({ revenue }: { revenue: NonNullable<DashboardData['revenue']> }) {
  const { t } = useTranslation();
  const methods = Object.entries(revenue.by_method)
    .map(([k, v]) => ({ method: t(`method.${k}`, { defaultValue: k }), amount: v }))
    .sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...methods.map((m) => m.amount));
  return (
    <Card title={t('dashboard.collections')}>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{money(revenue.collected_this_month)}</p>
      <p className="mt-1 text-xs text-slate-500">{t('dashboard.invoiced', { amount: money(revenue.invoiced_this_month) })}</p>
      {methods.length ? (
        <ul className="mt-4 space-y-2.5">
          {methods.map((m) => (
            <li key={m.method}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">{m.method}</span>
                <span className="font-medium tabular-nums text-slate-900" title={money(m.amount)}>{moneyShort(m.amount)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, (m.amount / max) * 100)}%`, background: SERIES_1 }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-slate-500">{t('dashboard.noCollections')}</p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
        <Link to="/invoices?payment_status=unpaid,partial" className="rounded-lg p-1 hover:bg-slate-50">
          <p className="text-xs text-slate-500">{t('dashboard.outstanding')}</p>
          <p className={cn('font-semibold tabular-nums', revenue.outstanding > 0 ? 'text-red-700' : 'text-slate-900')}>{money(revenue.outstanding)}</p>
        </Link>
        <Link to="/invoices?credit=1&payment_status=unpaid,partial" className="rounded-lg p-1 hover:bg-slate-50">
          <p className="text-xs text-slate-500">{t('dashboard.onCredit')}</p>
          <p className="font-semibold tabular-nums text-slate-900">{money(revenue.credit_outstanding)}</p>
        </Link>
      </div>
    </Card>
  );
}

/** This month's technician results: name, completed (with a bar), rating, billed. */
function Team({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  const rows = d.technicians.performance;
  const max = Math.max(1, ...rows.map((r) => r.completed));
  return (
    <Card
      title={t('dashboard.performance')}
      className="lg:col-span-2"
      padded={false}
      actions={d.rating ? <span className="flex items-center gap-2 text-xs text-slate-500">{t('dashboard.avgRating')} <Stars rating={d.rating} /> {d.rating}</span> : undefined}
    >
      {rows.length ? (
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">{t('common.technician')}</th>
              <th className="px-5 py-2.5 text-left font-semibold">{t('status.completed')}</th>
              <th className="hidden px-5 py-2.5 text-left font-semibold sm:table-cell">{t('dashboard.avgVisit')}</th>
              <th className="px-5 py-2.5 text-left font-semibold">{t('dashboard.rating')}</th>
              {rows.some((r) => r.revenue != null) && <th className="px-5 py-2.5 text-right font-semibold">{t('dashboard.billed')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link to={`/team/${r.id}`} className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-brand-700">
                    <Avatar name={r.name} className="h-7 w-7 text-[11px]" />
                    {r.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-semibold tabular-nums">{r.completed}</span>
                    <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                      <span className="block h-full rounded-full" style={{ width: `${(r.completed / max) * 100}%`, background: SERIES_2 }} />
                    </span>
                    <span className="text-xs text-slate-400">/ {r.visits} {t('dashboard.visits').toLowerCase()}</span>
                  </div>
                </td>
                <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{r.avg_duration_minutes ? t('common.minutes', { count: r.avg_duration_minutes }) : '–'}</td>
                <td className="px-5 py-3">{r.rating ? <span className="flex items-center gap-1"><Stars rating={r.rating} /> <span className="text-xs text-slate-500">{r.rating}</span></span> : <span className="text-slate-400">–</span>}</td>
                {rows.some((x) => x.revenue != null) && <td className="px-5 py-3 text-right tabular-nums">{r.revenue == null ? '–' : money(r.revenue)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('dashboard.noVisits')} message={t('dashboard.noVisitsHint')} />
      )}
    </Card>
  );
}

function LowStock({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  return (
    <Card title={t('dashboard.lowStock')} padded={false} actions={<Link to="/inventory?tab=stock&low_stock=1" className="text-sm font-medium text-brand-700 hover:underline">{t('common.viewAll')} →</Link>}>
      {d.inventory.low_stock.length ? (
        <ul className="divide-y divide-slate-100">
          {d.inventory.low_stock.map((i) => (
            <li key={`${i.id}-${i.branch_name}`} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{i.name}</p>
                <p className="text-xs text-slate-500">{i.code} · {i.branch_name}</p>
              </div>
              <Badge tone={Number(i.quantity_available) <= 0 ? 'red' : 'amber'}>
                {Number(i.quantity_available) <= 0 ? t('dashboard.outOfStock', 'Out of stock') : `${qty(i.quantity_available)} ${t('dashboard.left', 'left')}`}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<PackageCheck className="h-6 w-6" />} title={t('dashboard.stockHealthy')} message={t('dashboard.stockHealthyHint')} />
      )}
    </Card>
  );
}

function shortDate(v: string) {
  const d = new Date(v + 'T00:00:00');
  return d.toLocaleDateString(`${i18n.language}-IN`, { day: 'numeric', month: 'short' });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
