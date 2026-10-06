import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Banknote, Building, HandCoins, Plus, Store, Users, Wallet } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { money, moneyShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DayBookRow } from '@/lib/types';
import { Button, Card, PageHeader, QueryState, StatCard } from '@/components/ui';
import { MethodLabel } from '@/components/domain';

interface Overview {
  month: { income: number; expense: number; net: number; income_by_source: { job: number; walk_in: number }; expense_by_category: Record<string, number> };
  last_month: { income: number; expense: number; net: number };
  balances: { cash: number; bank: number; with_technicians: number };
  receivables: { total: number; customers: number; buckets: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number } };
  pending_cash_closes: number;
  trend: { month: string; income: number; expense: number; net: number }[];
  recent: DayBookRow[];
  opening: { date: string | null; cash: number; bank: number };
}

const INCOME = '#2a78d6';
const EXPENSE = '#eb6834';

function change(cur: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month`;
}

/** Accounts home: where the money is, what's owed, and how this month compares. */
export default function AccountsOverview() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['books', 'overview'], queryFn: () => api.get<Envelope<Overview>>('/books/overview').then((r) => r.data) });
  const d = q.data;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Money in, money out and what customers owe — on a simple cash basis."
        actions={
          <>
            {can('expenses.manage') && (
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/accounts/expenses?new=1')}>
                Expense
              </Button>
            )}
            {can('billing.walkin') && (
              <Button icon={<Store className="h-4 w-4" />} onClick={() => navigate('/invoices/walk-in/new')}>
                Walk-in bill
              </Button>
            )}
          </>
        }
      />
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <div className="space-y-6">
            {!d.opening.date && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>Set your opening cash and bank balances so the cash and bank books show real balances.</span>
                <Link to="/accounts/cash-bank?opening=1" className="font-medium underline">
                  Set opening balances
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Income this month" value={money(d.month.income)} hint={change(d.month.income, d.last_month.income)} tone="blue" icon={<ArrowDownLeft className="h-5 w-5" />} />
              <StatCard label="Expenses this month" value={money(d.month.expense)} hint={change(d.month.expense, d.last_month.expense)} tone="amber" icon={<ArrowUpRight className="h-5 w-5" />} onClick={() => navigate('/accounts/expenses')} />
              <StatCard label={d.month.net >= 0 ? 'Profit this month' : 'Loss this month'} value={money(d.month.net)} hint={`Last month ${money(d.last_month.net)}`} tone={d.month.net >= 0 ? 'green' : 'red'} onClick={() => navigate('/accounts/profit-loss')} />
              <StatCard label="Receivable from customers" value={money(d.receivables.total)} hint={`${d.receivables.customers} customer${d.receivables.customers === 1 ? '' : 's'}`} tone={d.receivables.total ? 'red' : 'slate'} icon={<Users className="h-5 w-5" />} onClick={() => navigate('/accounts/receivables')} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Balance icon={<Banknote className="h-5 w-5" />} label="Cash in hand (office)" value={d.balances.cash} to="/accounts/cash-bank?book=cash" />
              <Balance icon={<Building className="h-5 w-5" />} label="Bank & UPI" value={d.balances.bank} to="/accounts/cash-bank?book=bank" />
              <Balance
                icon={<Wallet className="h-5 w-5" />}
                label="Cash with technicians"
                value={d.balances.with_technicians}
                to="/accounts/cash-close?tab=in_hand"
                note={d.pending_cash_closes ? `${d.pending_cash_closes} cash close${d.pending_cash_closes > 1 ? 's' : ''} to verify` : undefined}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Income vs expenses · last 6 months" className="lg:col-span-2">
                <div className="h-64" role="img" aria-label="Bar chart of monthly income and expenses">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={3}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => moneyShort(Number(v))} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => monthLabel(String(v))} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                      <Bar dataKey="income" name="Income" fill={INCOME} radius={[3, 3, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="expense" name="Expenses" fill={EXPENSE} radius={[3, 3, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Receivables by age">
                <ul className="space-y-3">
                  {(
                    [
                      ['0–30 days', d.receivables.buckets.d0_30, 'bg-emerald-500'],
                      ['31–60 days', d.receivables.buckets.d31_60, 'bg-amber-400'],
                      ['61–90 days', d.receivables.buckets.d61_90, 'bg-orange-500'],
                      ['Over 90 days', d.receivables.buckets.d90_plus, 'bg-red-600'],
                    ] as const
                  ).map(([label, value, color]) => (
                    <li key={label}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700">{label}</span>
                        <span className="font-medium tabular-nums">{money(value)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', color)} style={{ width: `${d.receivables.total ? Math.max(value ? 2 : 0, (value / d.receivables.total) * 100) : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <Link to="/accounts/receivables" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
                  See who owes →
                </Link>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Recent transactions" padded={false} className="lg:col-span-2" actions={<Link to="/accounts/books" className="text-sm font-medium text-brand-700 hover:underline">Day book →</Link>}>
                {!d.recent.length ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">No money in or out in the last 30 days.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recent.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', r.in ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                          {r.in ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{r.party ?? r.kind}</p>
                          <p className="truncate text-xs text-slate-500">
                            {r.kind} · {r.details} · <MethodLabel method={r.method} />
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn('font-medium tabular-nums', r.in ? 'text-emerald-700' : 'text-red-700')}>{r.in ? `+${money(r.in)}` : `−${money(r.out)}`}</p>
                          <p className="text-xs text-slate-400">{r.at.slice(0, 10)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="This month">
                <dl className="space-y-2 text-sm">
                  <Row k="Service jobs" v={money(d.month.income_by_source.job)} />
                  <Row k="Walk-in sales" v={money(d.month.income_by_source.walk_in)} />
                  <div className="border-t border-slate-100 pt-2" />
                  {Object.entries(d.month.expense_by_category).slice(0, 5).map(([k, v]) => (
                    <Row key={k} k={k} v={`−${money(v)}`} />
                  ))}
                  {!Object.keys(d.month.expense_by_category).length && <p className="text-slate-500">No expenses yet.</p>}
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link to="/accounts/profit-loss" className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Profit & loss
                  </Link>
                  <Link to="/reports" className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <HandCoins className="h-4 w-4" /> Reports
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function Balance({ icon, label, value, to, note }: { icon: React.ReactNode; label: string; value: number; to: string; note?: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand-300">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('text-xl font-semibold tabular-nums', value < 0 ? 'text-red-700' : 'text-slate-900')}>{money(value)}</p>
        {note && <p className="text-xs font-medium text-amber-700">{note}</p>}
      </div>
    </Link>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="truncate text-slate-600">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

function monthLabel(v: string) {
  const [y, m] = v.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}
