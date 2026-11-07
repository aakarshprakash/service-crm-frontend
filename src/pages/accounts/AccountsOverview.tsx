import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, HandCoins, Store, Users, Wallet } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { date, money, moneyShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DayBookRow, Invoice } from '@/lib/types';
import { Button, Card, Modal, PageHeader, QueryState, SearchInput } from '@/components/ui';
import { RecordPayment } from '@/pages/invoices/InvoiceDetail';
import { MethodLabel } from '@/components/domain';

interface Overview {
  month: { income: number; gst: number; expense: number; net: number; income_by_source: { job: number; walk_in: number; other?: number }; expense_by_category: Record<string, number> };
  last_month: { income: number; gst: number; expense: number; net: number };
  balances: { cash: number; bank: number; with_technicians: number };
  receivables: { total: number; customers: number; buckets: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number } };
  pending_cash_closes: number;
  trend: { month: string; income: number; expense: number; net: number }[];
  recent: DayBookRow[];
  opening: { date: string | null; cash: number; bank: number };
}

const INCOME = '#059669';
const EXPENSE = '#DC2626';

function change(cur: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return pct === 0 ? 'Same as last month' : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than last month`;
}

/** Accounts home: where the money is, what's owed, and how this month compares. */
export default function AccountsOverview() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['books', 'overview'], queryFn: () => api.get<Envelope<Overview>>('/books/overview').then((r) => r.data) });
  const d = q.data;
  const [paying, setPaying] = useState(false);

  return (
    <>
      <PageHeader title="Accounts" description="Where your money is, what came in and went out this month, and who still owes you." />
      {/* Quick actions: the four things people come here to record, on one row under the title. */}
      <div className="-mt-2 mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="toolbar" aria-label="Quick actions">
        {can('billing.walkin') && (
          <Button icon={<Store className="h-4 w-4" />} onClick={() => navigate('/invoices/walk-in/new')}>
            New invoice
          </Button>
        )}
        {can('payments.record') && (
          <Button variant="secondary" icon={<HandCoins className="h-4 w-4" />} onClick={() => setPaying(true)}>
            Record payment
          </Button>
        )}
        {can('expenses.manage') && (
          <Button variant="secondary" icon={<ArrowDownLeft className="h-4 w-4" />} onClick={() => navigate('/accounts/income?new=1')}>
            Add income
          </Button>
        )}
        {can('expenses.manage') && (
          <Button variant="secondary" icon={<ArrowUpRight className="h-4 w-4" />} onClick={() => navigate('/accounts/expenses?new=1')}>
            Add expense
          </Button>
        )}
      </div>
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

            <MoneyMap balances={d.balances} owed={d.receivables} pending={d.pending_cash_closes} />

            {/* The day's jobs, in the order they come up: what someone opening Accounts usually came to do. */}
            <section aria-labelledby="todo">
              <h2 id="todo" className="mb-2 text-sm font-semibold text-slate-700">What do you want to do?</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {can('accounts.view') && <Task icon={<CalendarDays className="h-5 w-5" />} title="See today's register" text="Everything received and paid today, by person." to="/accounts/register" />}
                {can('cash.verify') && (
                  <Task
                    icon={<Wallet className="h-5 w-5" />}
                    title="Check cash from technicians"
                    text={d.pending_cash_closes ? `${d.pending_cash_closes} handover${d.pending_cash_closes > 1 ? 's' : ''} waiting for you to check.` : 'Count what each technician hands over.'}
                    to="/accounts/cash-close"
                    alert={d.pending_cash_closes > 0}
                  />
                )}
                {can('accounts.view') && (
                  <Task
                    icon={<Users className="h-5 w-5" />}
                    title="Collect from customers"
                    text={d.receivables.total ? `${money(d.receivables.total)} due from ${d.receivables.customers} customer${d.receivables.customers === 1 ? '' : 's'}.` : 'Nobody owes you anything right now.'}
                    to="/accounts/receivables"
                  />
                )}
              </div>
            </section>

            <MonthSum month={d.month} last={d.last_month} />

            <div className="grid gap-6 xl:grid-cols-3">
              <Card title="Money in and out, last 6 months" className="xl:col-span-2">
                <div className="h-64" role="img" aria-label="Bar chart of monthly income and expenses">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={3}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => moneyShort(Number(v))} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => monthLabel(String(v))} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                      <Bar dataKey="income" name="Came in" fill={INCOME} radius={[3, 3, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="expense" name="Went out" fill={EXPENSE} radius={[3, 3, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="How long customers have owed">
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
                  See who owes
                </Link>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card title="Recent transactions" padded={false} className="xl:col-span-2" actions={<Link to="/accounts/books" className="text-sm font-medium text-brand-700 hover:underline">See all</Link>}>
                {!d.recent.length ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">No money in or out in the last 30 days.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recent.slice(0, 6).map((r, i) => (
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
                          <p className="text-xs text-slate-400">{date(r.at.slice(0, 10))}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Where this month's money came from">
                <dl className="space-y-2 text-sm">
                  <Row k="Service jobs" v={money(d.month.income_by_source.job)} />
                  <Row k="Walk-in sales" v={money(d.month.income_by_source.walk_in)} />
                  <Row k="Other income (no bill)" v={money(d.month.income_by_source.other ?? 0)} />
                </dl>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">And where it went</h3>
                {Object.keys(d.month.expense_by_category).length ? (
                  <dl className="space-y-2 text-sm">
                    {Object.entries(d.month.expense_by_category).slice(0, 5).map(([k, v]) => (
                      <Row key={k} k={k} v={money(v)} />
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-slate-500">Nothing spent yet this month.</p>
                )}
                <Link to="/reports" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                  <HandCoins className="h-4 w-4" /> More reports
                </Link>
              </Card>
            </div>
          </div>
        )}
      </QueryState>
      {paying && <PaymentPicker onClose={() => setPaying(false)} />}
    </>
  );
}

/** Record payment: pick the unpaid bill the customer is paying, then the usual payment form. */
function PaymentPicker({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Invoice | null>(null);
  const bills = useQuery({
    queryKey: ['invoices', 'unpaid-picker', search],
    queryFn: () => api.get<Paginated<Invoice>>('/invoices', { payment_status: 'unpaid,partial', search, per_page: 8 }),
    enabled: !picked,
  });

  if (picked) {
    return (
      <RecordPayment
        invoice={picked}
        open
        onClose={() => {
          qc.invalidateQueries({ queryKey: ['books'] });
          onClose();
        }}
      />
    );
  }
  return (
    <Modal open onClose={onClose} title="Record a payment" description="Pick the bill the customer is paying. For money with no bill, use Add income.">
      <SearchInput value={search} onChange={setSearch} placeholder="Customer name, phone or bill number" delay={250} />
      <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {bills.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Loading unpaid bills…</p>
        ) : !bills.data?.data.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{search ? `No unpaid bill matches “${search}”.` : 'No unpaid bills. Everyone has paid.'}</p>
        ) : (
          bills.data.data.map((inv) => (
            <button key={inv.id} type="button" onClick={() => setPicked(inv)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50/50 focus-visible:bg-brand-50 focus-visible:outline-none">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{inv.customer?.name ?? 'Customer'}</span>
                <span className="block text-xs text-slate-500">
                  {inv.invoice_number}, {date(inv.generated_at)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular-nums text-red-700">{money(inv.balance_amount)}</span>
                <span className="block text-xs text-slate-500">still to pay</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

/** Each place money sits keeps one colour everywhere on this page. */
const PLACES = {
  cash: { label: 'Office cash', color: '#047857', to: '/accounts/cash-bank?book=cash', note: 'Notes and coins at the office' },
  bank: { label: 'Bank & UPI', color: '#2563EB', to: '/accounts/cash-bank?book=bank', note: 'Bank account and UPI' },
  tech: { label: 'With technicians', color: '#B45309', to: '/accounts/cash-close?tab=in_hand', note: 'Collected on jobs, not handed over yet' },
} as const;

/**
 * The page's answer to "where is our money?": one bar split by where the money physically sits, with what
 * customers still owe hatched on the end, because it isn't in hand yet.
 */
function MoneyMap({ balances, owed, pending }: { balances: Overview['balances']; owed: Overview['receivables']; pending: number }) {
  const parts = [
    { key: 'cash' as const, value: balances.cash },
    { key: 'bank' as const, value: balances.bank },
    { key: 'tech' as const, value: balances.with_technicians },
  ];
  const yours = parts.reduce((a, p) => a + p.value, 0);
  const scale = parts.reduce((a, p) => a + Math.max(0, p.value), 0) + Math.max(0, owed.total);
  // A small amount still gets a visible sliver, so no place disappears from the bar.
  const width = (v: number) => (v <= 0 || !scale ? 0 : Math.max(2.5, (v / scale) * 100));

  return (
    <section aria-labelledby="money-today" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <h2 id="money-today" className="text-sm font-medium text-slate-600">
            Your money today
          </h2>
          <p className={cn('mt-1 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl', yours < 0 ? 'text-red-700' : 'text-navy-900')}>{money(yours)}</p>
        </div>
        {owed.total > 0 && (
          <Link to="/accounts/receivables" className="pb-1 text-sm text-slate-600 hover:text-slate-900">
            and <span className="font-semibold tabular-nums text-red-700">{money(owed.total)}</span> still to collect from {owed.customers} customer{owed.customers === 1 ? '' : 's'}
          </Link>
        )}
      </div>

      <div className="mt-5 flex h-4 w-full gap-[3px] overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Office cash ${money(balances.cash)}, bank and UPI ${money(balances.bank)}, with technicians ${money(balances.with_technicians)}, customers owe ${money(owed.total)}`}>
        {parts.map((p) => width(p.value) > 0 && <span key={p.key} className="h-full first:rounded-l-full" style={{ width: `${width(p.value)}%`, background: PLACES[p.key].color }} />)}
        {width(owed.total) > 0 && (
          <span
            className="h-full rounded-r-full border border-dashed border-red-300"
            style={{ width: `${width(owed.total)}%`, backgroundImage: 'repeating-linear-gradient(135deg, #fecaca 0 4px, transparent 4px 8px)' }}
          />
        )}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {parts.map((p) => (
          <Link key={p.key} to={PLACES[p.key].to} className="group -m-2 rounded-lg p-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <dt className="flex items-center gap-2 text-sm text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLACES[p.key].color }} aria-hidden />
              {PLACES[p.key].label}
            </dt>
            <dd className={cn('mt-1 text-lg font-semibold tabular-nums', p.value < 0 ? 'text-red-700' : 'text-slate-900')}>{money(p.value)}</dd>
            <dd className={cn('text-xs', p.key === 'tech' && pending ? 'font-medium text-amber-800' : 'text-slate-500')}>
              {p.key === 'tech' && pending ? `${pending} handover${pending > 1 ? 's' : ''} to check` : PLACES[p.key].note}
            </dd>
          </Link>
        ))}
        <Link to="/accounts/receivables" className="-m-2 rounded-lg p-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 xl:border-l xl:border-dashed xl:border-slate-200 xl:pl-6">
          <dt className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-red-400" aria-hidden />
            Customers owe you
          </dt>
          <dd className={cn('mt-1 text-lg font-semibold tabular-nums', owed.total ? 'text-red-700' : 'text-slate-900')}>{money(owed.total)}</dd>
          <dd className="text-xs text-slate-500">Not in hand yet</dd>
        </Link>
      </dl>
    </section>
  );
}

/** This month as one plain sum: what came in, minus what went out, is what's left. */
function MonthSum({ month, last }: { month: Overview['month']; last: Overview['last_month'] }) {
  const profit = month.net >= 0;
  return (
    <section aria-labelledby="this-month" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="this-month" className="text-sm font-medium text-slate-600">
          This month
        </h2>
        <Link to="/accounts/profit-loss" className="text-sm font-medium text-brand-700 hover:underline">
          See profit &amp; loss
        </Link>
      </div>
      {/* Same rows in every part (label, amount, note), so the signs line up with the amounts. */}
      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1.15fr)]">
        <SumPart label="Came in" value={month.income} tone="text-emerald-700" hint={change(month.income, last.income)} to="/accounts/books" />
        <Sign>−</Sign>
        <SumPart label="Went out" value={month.expense} tone="text-red-700" hint={change(month.expense, last.expense)} to="/accounts/expenses" />
        <Sign>=</Sign>
        <SumPart
          label={profit ? 'Profit' : 'Loss'}
          value={month.net}
          tone={profit ? 'text-navy-900' : 'text-red-700'}
          hint={
            <>
              {month.gst > 0 && <>After keeping aside <span className="whitespace-nowrap">{money(month.gst)}</span> GST. </>}
              Last month <span className="whitespace-nowrap">{money(last.net)}</span>.
            </>
          }
          to="/accounts/profit-loss"
        />
      </div>
    </section>
  );
}

/** The − and = between the parts, on the amounts' row. Hidden on phones, where the parts stack. */
function Sign({ children }: { children: string }) {
  return (
    <span className="hidden pt-6 text-center text-2xl leading-8 text-slate-300 sm:block" aria-hidden>
      {children}
    </span>
  );
}

function SumPart({ label, value, tone, hint, to }: { label: string; value: number; tone: string; hint?: ReactNode; to: string }) {
  return (
    <Link to={to} className="-m-2 flex flex-col rounded-lg p-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <span className="text-sm leading-5 text-slate-600">{label}</span>
      <span className={cn('mt-1 text-2xl font-bold leading-8 tracking-tight tabular-nums', tone)}>{money(value)}</span>
      {hint && <span className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</span>}
    </Link>
  );
}

/** One thing to do, as a large button: an icon, what it does, and a line on when to use it. */
function Task({ icon, title, text, to, alert }: { icon: React.ReactNode; title: string; text: string; to: string; alert?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-white p-4 shadow-card transition hover:border-brand-400 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        alert ? 'border-amber-300' : 'border-slate-200',
      )}
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', alert ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700')}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className={cn('mt-0.5 block text-sm', alert ? 'font-medium text-amber-800' : 'text-slate-500')}>{text}</span>
      </span>
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
