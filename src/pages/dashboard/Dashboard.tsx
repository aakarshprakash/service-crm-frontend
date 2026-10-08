import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { AlertTriangle, CalendarClock, CircleDot, ClipboardCheck, Clock, Hourglass, IndianRupee, Plus, UserX, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Envelope } from '@/lib/api';
import { money, moneyShort, qty } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, QueryState, Select, StatCard } from '@/components/ui';
import { Stars } from '@/components/domain';
import { Hint } from '@/components/tutorial';

interface DashboardData {
  jobs: {
    by_status: Record<string, number>;
    unassigned: number;
    scheduled_today: number;
    overdue: number;
    created_this_month: number;
    trend: { date: string; created: number; completed: number }[];
  };
  revenue: { collected_this_month: number; by_method: Record<string, number>; outstanding: number; credit_outstanding: number; invoiced_this_month: number };
  technicians: {
    total: number;
    on_duty: number;
    performance: { id: number; name: string; completed: number; visits: number; avg_duration_minutes: number | null; revenue: number; rating: number | null }[];
  };
  inventory: { low_stock_count: number; low_stock: { id: number; code: string; name: string; unit_of_measure: string; reorder_level: number; quantity_available: number; branch_name: string }[] };
  cash: { pending_verification: number; discrepancies_this_month: number };
  rating: number;
}

// Brand series: Electric Blue and Teal Green (distinct in hue and lightness).
const SERIES_1 = '#2563EB';
const SERIES_2 = '#10B981';

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
  const s = d?.jobs.by_status ?? {};
  const go = (status: string) => navigate(`/jobs?status=${status}`);

  const methods = Object.entries(d?.revenue.by_method ?? {})
    .map(([k, v]) => ({ method: t(`method.${k}`, { defaultValue: k }), amount: v }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <>
      <PageHeader
        title={t(`dashboard.greeting.${greeting()}`, { name: user?.name.split(' ')[0] })}
        description={t('dashboard.subtitle')}
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
                  {t('dashboard.newJob')}
                </Button>
              </Hint>
            )}
          </>
        }
      />
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label={t('status.open')} value={s.open ?? 0} icon={<CircleDot className="h-5 w-5" />} tone="blue" onClick={() => go('open')} hint={t('dashboard.unassigned', { count: d.jobs.unassigned })} />
              <StatCard label={t('status.in_progress')} value={s.in_progress ?? 0} icon={<Clock className="h-5 w-5" />} tone="violet" onClick={() => go('in_progress')} hint={t('dashboard.onDuty', { on: d.technicians.on_duty, total: d.technicians.total })} />
              <StatCard label={t('status.pending')} value={s.pending ?? 0} icon={<Hourglass className="h-5 w-5" />} tone="amber" onClick={() => go('pending')} hint={t('dashboard.pendingHint')} />
              <StatCard label={t('status.completed')} value={s.completed ?? 0} icon={<ClipboardCheck className="h-5 w-5" />} tone="green" onClick={() => go('completed')} hint={t('dashboard.loggedThisMonth', { count: d.jobs.created_this_month })} />
            </div>

            {(d.jobs.overdue > 0 || d.jobs.unassigned > 0 || d.cash.pending_verification > 0 || d.inventory.low_stock_count > 0) && (
              <div className="flex flex-wrap gap-2">
                {d.jobs.overdue > 0 && <Alert to="/jobs?status=open,pending&sort=scheduled" icon={<CalendarClock className="h-4 w-4" />} text={t('dashboard.alert.overdue', { count: d.jobs.overdue })} />}
                {d.jobs.unassigned > 0 && <Alert to="/jobs?technician_id=unassigned&status=open,pending" icon={<UserX className="h-4 w-4" />} text={t('dashboard.alert.unassigned', { count: d.jobs.unassigned })} />}
                {d.cash.pending_verification > 0 && can('cash.verify') && <Alert to="/accounts/cash-close?status=submitted" icon={<Wallet className="h-4 w-4" />} text={t('dashboard.alert.cashClose', { count: d.cash.pending_verification })} />}
                {d.inventory.low_stock_count > 0 && <Alert to="/inventory?tab=stock&low_stock=1" icon={<AlertTriangle className="h-4 w-4" />} text={t('dashboard.alert.lowStock', { count: d.inventory.low_stock_count })} />}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <Card title={t('dashboard.trendTitle')} className="lg:col-span-2">
                <div className="h-64" role="img" aria-label={t('dashboard.trendTitle')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.jobs.trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip labelFormatter={(v) => shortDate(String(v))} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                      <Line type="monotone" name={t('dashboard.created')} dataKey="created" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                      <Line type="monotone" name={t('status.completed')} dataKey="completed" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card title={t('dashboard.collections')}>
                <p className="text-3xl font-bold tabular-nums text-navy-900">{money(d.revenue.collected_this_month)}</p>
                <p className="mt-1 text-xs text-slate-500">{t('dashboard.invoiced', { amount: money(d.revenue.invoiced_this_month) })}</p>
                {methods.length ? (
                  <div className="mt-4 h-40" role="img" aria-label={t('dashboard.collections')}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={methods} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="method" width={92} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                        <Bar dataKey="amount" name={t('dashboard.collected')} fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={18}>
                          <LabelList dataKey="amount" position="right" formatter={(v: number) => moneyShort(v)} style={{ fontSize: 11, fill: '#334155' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-slate-500">{t('dashboard.noCollections')}</p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <Link to="/invoices?payment_status=unpaid,partial" className="rounded-lg hover:bg-slate-50">
                    <p className="text-xs text-slate-500">{t('dashboard.outstanding')}</p>
                    <p className="font-semibold tabular-nums text-slate-900">{money(d.revenue.outstanding)}</p>
                  </Link>
                  <Link to="/invoices?credit=1&payment_status=unpaid,partial" className="rounded-lg hover:bg-slate-50">
                    <p className="text-xs text-slate-500">{t('dashboard.onCredit')}</p>
                    <p className="font-semibold tabular-nums text-slate-900">{money(d.revenue.credit_outstanding)}</p>
                  </Link>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card title={t('dashboard.performance')} className="lg:col-span-2" padded={false} actions={d.rating ? <span className="flex items-center gap-2 text-xs text-slate-500">{t('dashboard.avgRating')} <Stars rating={d.rating} /> {d.rating}</span> : undefined}>
                <DataTable
                  rows={d.technicians.performance}
                  empty={<EmptyState title={t('dashboard.noVisits')} message={t('dashboard.noVisitsHint')} />}
                  columns={[
                    { key: 'name', header: t('common.technician'), render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
                    { key: 'completed', header: t('status.completed'), render: (r) => r.completed, className: 'tabular-nums' },
                    { key: 'visits', header: t('dashboard.visits'), render: (r) => r.visits, className: 'tabular-nums', hideOnMobile: true },
                    { key: 'avg', header: t('dashboard.avgVisit'), render: (r) => (r.avg_duration_minutes ? t('common.minutes', { count: r.avg_duration_minutes }) : '–'), hideOnMobile: true },
                    { key: 'rating', header: t('dashboard.rating'), render: (r) => (r.rating ? <span className="flex items-center gap-1"><Stars rating={r.rating} /> <span className="text-xs text-slate-500">{r.rating}</span></span> : '–') },
                    { key: 'revenue', header: t('dashboard.billed'), render: (r) => money(r.revenue), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </Card>

              <Card title={t('dashboard.lowStock')} padded={false} actions={<Link to="/inventory?tab=stock&low_stock=1" className="text-xs font-medium text-brand-600 hover:underline">{t('common.viewAll')}</Link>}>
                {d.inventory.low_stock.length ? (
                  <ul className="divide-y divide-slate-100">
                    {d.inventory.low_stock.map((i) => (
                      <li key={`${i.id}-${i.branch_name}`} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{i.name}</p>
                          <p className="text-xs text-slate-500">
                            {i.code} · {i.branch_name}
                          </p>
                        </div>
                        <Badge tone={Number(i.quantity_available) <= 0 ? 'red' : 'amber'}>
                          {qty(i.quantity_available)} / {qty(i.reorder_level)} {i.unit_of_measure}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={<IndianRupee className="h-6 w-6" />} title={t('dashboard.stockHealthy')} message={t('dashboard.stockHealthyHint')} />
                )}
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function Alert({ to, icon, text }: { to: string; icon: React.ReactNode; text: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100">
      {icon}
      {text}
    </Link>
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
