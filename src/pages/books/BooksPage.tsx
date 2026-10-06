import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileBarChart } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { date, money, moneyShort, monthStart, today } from '@/lib/format';
import type { BooksSummary, DayBookRow } from '@/lib/types';
import { Card, DataTable, EmptyState, FilterBar, Input, PageHeader, QueryState, Select, StatCard, Tabs } from '@/components/ui';
import { MethodLabel } from '@/components/domain';

const INCOME = '#2a78d6';
const EXPENSE = '#eb6834';

type Tab = 'summary' | 'day-book';

function lastMonth(): { from: string; to: string } {
  const [y, m] = monthStart().split('-').map(Number) as [number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const days = new Date(py, pm, 0).getDate();
  const mm = String(pm).padStart(2, '0');
  return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${days}` };
}

/** Mini accounts: money in (payments on job invoices and walk-in bills) against money out (expenses). */
export default function BooksPage() {
  const [params, setParams] = useSearchParams();
  const { data: lookups } = useLookups();
  const tab = (params.get('tab') as Tab) || 'day-book';
  const period = { from: params.get('from') || monthStart(), to: params.get('to') || today(), branch_id: params.get('branch_id') || undefined };

  const set = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };
  const preset = (v: string) => {
    if (v === 'today') set({ from: today(), to: today() });
    else if (v === 'month') set({ from: undefined, to: undefined });
    else if (v === 'last-month') set(lastMonth());
  };
  const currentPreset =
    period.from === today() && period.to === today() ? 'today' : period.from === monthStart() && period.to === today() ? 'month' : period.from === lastMonth().from && period.to === lastMonth().to ? 'last-month' : 'custom';

  return (
    <>
      <PageHeader
        title="Day book"
        description="Every rupee in and out, in order — plus a daily income vs expenses view."
        actions={
          <Link to="/reports?report=day-book" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            <FileBarChart className="h-4 w-4" /> Export reports
          </Link>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => set({ tab: v === 'day-book' ? undefined : v })}
        tabs={[
          { value: 'day-book', label: 'Day book' },
          { value: 'summary', label: 'Daily income vs expenses' },
        ]}
      />
      <Card padded={false} className="mb-6">
        <FilterBar>
          <Select value={currentPreset} onChange={(e) => preset(e.target.value)} className="sm:w-40" aria-label="Period">
            <option value="today">Today</option>
            <option value="month">This month</option>
            <option value="last-month">Last month</option>
            <option value="custom" disabled>
              Custom
            </option>
          </Select>
          <Input type="date" value={period.from} max={period.to} onChange={(e) => set({ from: e.target.value })} className="sm:w-40" aria-label="From" />
          <Input type="date" value={period.to} min={period.from} max={today()} onChange={(e) => set({ to: e.target.value })} className="sm:w-40" aria-label="To" />
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={period.branch_id ?? ''} onChange={(e) => set({ branch_id: e.target.value })} className="sm:w-44" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
      </Card>
      {tab === 'summary' ? <Summary period={period} /> : <DayBook period={period} />}
    </>
  );
}

type Period = { from: string; to: string; branch_id?: string };

function Summary({ period }: { period: Period }) {
  const q = useQuery({ queryKey: ['books', 'summary', period], queryFn: () => api.get<Envelope<BooksSummary>>('/books/summary', period).then((r) => r.data) });
  const s = q.data;
  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {s && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Income (collected)" value={money(s.income)} tone="blue" />
            <StatCard label="Expenses" value={money(s.expense)} tone="amber" />
            <StatCard label={s.net >= 0 ? 'Net profit' : 'Net loss'} value={money(s.net)} tone={s.net >= 0 ? 'green' : 'red'} />
            <StatCard label="Cash in − cash out" value={money(s.cash.net)} hint={`${money(s.cash.in)} in · ${money(s.cash.out)} out`} tone="slate" />
          </div>

          {s.series.length > 0 && (
            <Card title="Daily income and expenses">
              <div className="h-72" role="img" aria-label="Bar chart of income and expenses per day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.series} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tickFormatter={(v) => moneyShort(Number(v))} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => shortDate(String(v))} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                    <Bar dataKey="income" name="Income" fill={INCOME} radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="expense" name="Expenses" fill={EXPENSE} radius={[3, 3, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Income by source">
              <Breakdown
                rows={[
                  ['Service jobs', s.income_by_source.job],
                  ['Walk-in sales', s.income_by_source.walk_in],
                ]}
                total={s.income}
                color={INCOME}
              />
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">By method</p>
              <Breakdown rows={Object.entries(s.income_by_method).map(([m, v]) => [<MethodLabel key={m} method={m} />, v])} total={s.income} color={INCOME} />
            </Card>
            <Card title="Expenses by category" className="lg:col-span-2">
              {Object.keys(s.expense_by_category).length ? (
                <Breakdown rows={Object.entries(s.expense_by_category)} total={s.expense} color={EXPENSE} />
              ) : (
                <EmptyState title="No expenses in this period" message={<Link to="/accounts/expenses" className="text-brand-700 hover:underline">Record an expense</Link>} />
              )}
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}

function Breakdown({ rows, total, color }: { rows: [ReactNode, number][]; total: number; color: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Nothing in this period.</p>;
  return (
    <ul className="space-y-3">
      {rows.map(([name, value], i) => (
        <li key={i}>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">{name}</span>
            <span className="font-medium tabular-nums">{money(value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${total ? Math.max(1, (value / total) * 100) : 0}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DayBook({ period }: { period: Period }) {
  const q = useQuery({
    queryKey: ['books', 'day-book', period],
    queryFn: () => api.get<Envelope<DayBookRow[]> & { meta: { in: number; out: number } }>('/books/day-book', period),
  });
  const rows = q.data?.data.map((r, i) => ({ ...r, id: i }));
  const tIn = q.data?.meta.in ?? 0;
  const tOut = q.data?.meta.out ?? 0;
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Money in" value={money(tIn)} tone="blue" />
        <StatCard label="Money out" value={money(tOut)} tone="amber" />
        <StatCard label="Net" value={money(tIn - tOut)} tone={tIn - tOut >= 0 ? 'green' : 'red'} />
      </div>
      <Card padded={false}>
        <DataTable
          rows={rows}
          loading={q.isFetching}
          empty={<EmptyState title="No money in or out" message="Payments received and expenses recorded in this period appear here." />}
          columns={[
            { key: 'at', header: 'Date', render: (r) => <span className="whitespace-nowrap">{localStamp(r.at, r.kind === 'Expense')}</span> },
            {
              key: 'kind',
              header: 'Entry',
              render: (r) => (
                <div>
                  <p className="font-medium text-slate-900">{r.kind}</p>
                  <p className="text-xs text-slate-500">{[r.ref, r.details].filter(Boolean).join(' · ')}</p>
                </div>
              ),
            },
            { key: 'party', header: 'Customer / paid to', hideOnMobile: true, render: (r) => r.party ?? '—' },
            { key: 'method', header: 'Method', hideOnMobile: true, render: (r) => <MethodLabel method={r.method} /> },
            { key: 'in', header: 'In', render: (r) => (r.in ? <span className="text-emerald-700">{money(r.in)}</span> : ''), className: 'text-right tabular-nums', headerClassName: 'text-right' },
            { key: 'out', header: 'Out', render: (r) => (r.out ? <span className="text-red-700">{money(r.out)}</span> : ''), className: 'text-right tabular-nums', headerClassName: 'text-right' },
          ]}
        />
      </Card>
    </>
  );
}

/** Day-book stamps arrive already in the company's timezone ("2026-10-01 14:05"), so format without converting. */
function localStamp(at: string, dateOnly: boolean) {
  const [d, t] = at.split(' ');
  const day = date(d);
  if (dateOnly || !t) return day;
  const [h, m] = t.split(':').map(Number) as [number, number];
  return `${day}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function shortDate(v: string) {
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
