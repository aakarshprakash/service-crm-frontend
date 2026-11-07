import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Input, QueryState } from '@/components/ui';
import { MethodLabel } from '@/components/domain';
import { IncomeDialog } from '@/pages/expenses/IncomePage';
import { ExpenseDialog } from '@/pages/expenses/ExpensesPage';

type Pair = { cash: number; bank: number };
/** A payment on an invoice, or income received without one (income_id set, no invoice). */
interface ReceiptLine { at: string | null; customer: string; phone: string | null; invoice_id: number | null; invoice_number: string | null; income_id: number | null; category: string | null; job: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface PaymentLine { expense_id: number; category: string; description: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface Group<L> { party: string; kind?: 'staff' | 'office' | 'online'; lines: L[]; cash: number; bank: number }
interface Contra { transfer_id: number | null; particulars: string; ref: string | null; cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Totals { cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Day { date: string; opening: Pair; receipts: Group<ReceiptLine>[]; payments: Group<PaymentLine>[]; transfers: Contra[]; totals: Totals; closing: Pair; empty: boolean }
interface Register { from: string; to: string; opening: Pair; days: Day[]; totals: Totals; closing: Pair }

const IN = 'text-emerald-700';
const OUT = 'text-red-700';

/** Dates are local calendar days: work at noon so no timezone moves them. */
const asDate = (d: string) => new Date(`${d}T12:00:00`);
const iso = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const shift = (d: string, days: number) => {
  const t = asDate(d);
  t.setDate(t.getDate() + days);
  return iso(t);
};
/** Monday of the week the day falls in. */
const weekStart = (d: string) => shift(d, -((asDate(d).getDay() + 6) % 7));
const longDate = (d: string) => asDate(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** An amount in a ledger column: blank when there's nothing, the way the paper book is kept. */
function Amt({ v, tone, strong, className }: { v: number; tone?: string; strong?: boolean; className?: string }) {
  return <span className={cn('text-right tabular-nums', v ? tone : 'text-transparent', strong && 'font-semibold', className)}>{v ? money(v) : '0'}</span>;
}

/**
 * Daily cash register, kept like a cash book: what came in on the left, what went out on the right, each in a
 * Cash and a Bank / UPI column, money grouped by the person who brought it in or was paid. The day closes with
 * the sum that should match the cash drawer.
 */
export function CashRegister({ day, onDay }: { day: string; onDay: (d: string) => void }) {
  const monday = weekStart(day);
  const sunday = shift(monday, 6);
  // The whole week in one call: the strip shows which days have entries, the page shows the chosen one.
  const q = useQuery({ queryKey: ['books', 'register', monday], queryFn: () => api.get<Envelope<Register>>('/books/register', { from: monday, to: sunday > today() ? today() : sunday }).then((r) => r.data) });
  const days = useMemo(() => new Map((q.data?.days ?? []).map((x) => [x.date, x])), [q.data]);
  const d = days.get(day);
  const latest = day >= today();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous week" onClick={() => onDay(shift(day, -7))} />
        <div className="order-first flex min-w-0 basis-full gap-1 overflow-x-auto pb-1 sm:order-none sm:basis-0 sm:flex-1 sm:pb-0" role="tablist" aria-label="Days of the week">
          {Array.from({ length: 7 }, (_, i) => shift(monday, i)).map((date) => {
            const x = days.get(date);
            const future = date > today();
            const on = date === day;
            const moved = x ? x.totals.cash_in + x.totals.bank_in : 0;
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={future}
                onClick={() => onDay(date)}
                className={cn(
                  'min-w-[3.25rem] flex-1 rounded-lg border px-2 py-2 sm:min-w-[4.75rem] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  on ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-200 bg-white hover:border-brand-300',
                  future && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className={cn('block text-xs', on ? 'text-white/70' : 'text-slate-500')}>{asDate(date).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                <span className="block text-sm font-semibold">{asDate(date).getDate()}</span>
                <span className={cn('block truncate text-[11px] tabular-nums', on ? 'text-white/80' : x && !x.empty ? 'text-emerald-700' : 'text-slate-400')}>
                  {future ? '' : !x ? '…' : x.empty ? 'Nothing' : moved ? `+${money(moved).replace(/\.00$/, '')}` : 'Paid out only'}
                </span>
              </button>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" icon={<ChevronRight className="h-4 w-4" />} aria-label="Next week" disabled={sunday >= today()} onClick={() => onDay(shift(day, 7) > today() ? today() : shift(day, 7))} />
        <Input type="date" value={day} max={today()} onChange={(e) => e.target.value && onDay(e.target.value)} className="w-40" aria-label="Go to a date" />
        {!latest && (
          <Button variant="ghost" size="sm" onClick={() => onDay(today())}>
            Today
          </Button>
        )}
      </div>

      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && <DayPage d={d} />}
      </QueryState>
    </>
  );
}

function DayPage({ d }: { d: Day }) {
  const { can } = useAuth();
  const contraIn = d.transfers.filter((t) => t.cash_in || t.bank_in);
  const contraOut = d.transfers.filter((t) => t.cash_out || t.bank_out);
  // The forms open over the register, dated the day on screen; saving refreshes this page.
  const [adding, setAdding] = useState<'income' | 'expense' | null>(null);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-navy-900 px-5 pb-4 pt-5">
        <div>
          <p className="text-sm text-slate-500 print:text-black">Daily register</p>
          <h2 className="text-2xl font-bold tracking-tight text-navy-900">{longDate(d.date)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {can('expenses.manage') && (
            <>
              <Button variant="secondary" size="sm" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-700" />} onClick={() => setAdding('income')}>
                Add income
              </Button>
              <Button variant="secondary" size="sm" icon={<ArrowUpRight className="h-4 w-4 text-red-700" />} onClick={() => setAdding('expense')}>
                Add expense
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm">
        <span className="text-slate-600">Brought forward</span>
        <span>
          Cash <strong className="tabular-nums text-slate-900">{money(d.opening.cash)}</strong>
        </span>
        <span>
          Bank / UPI <strong className="tabular-nums text-slate-900">{money(d.opening.bank)}</strong>
        </span>
      </div>

      {d.empty ? (
        <div className="px-5 py-14 text-center">
          <p className="font-semibold text-slate-900">Nothing was received or paid on this day</p>
          <p className="mt-1 text-sm text-slate-500">Payments technicians collect, bills paid at the office, income and expenses appear here as they are recorded.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2">
          <Side title="Came in" tone={IN} total={{ cash: d.totals.cash_in, bank: d.totals.bank_in }} className="lg:border-r-[3px] lg:border-double lg:border-r-navy-900">
            {d.receipts.map((g) => (
              <PersonGroup key={`in-${g.party}`} label={`From ${g.party}`} cash={g.cash} bank={g.bank} tone={IN}>
                {g.lines.map((l) => (
                  <Line
                    key={l.income_id ? `inc-${l.income_id}` : `${l.invoice_id}-${l.at}-${l.ref}`}
                    main={
                      <Link to={l.invoice_id ? `/invoices/${l.invoice_id}` : '/accounts/income'} className="font-medium text-slate-900 hover:underline">
                        {l.customer}
                      </Link>
                    }
                    sub={[l.phone, l.invoice_number ?? l.category, l.job].filter(Boolean).join(', ')}
                    method={l.book === 'bank' ? l.method : null}
                    cash={l.book === 'cash' ? l.amount : 0}
                    bank={l.book === 'bank' ? l.amount : 0}
                    tone={IN}
                  />
                ))}
              </PersonGroup>
            ))}
            {contraIn.length > 0 && (
              <PersonGroup label="Moved between cash and bank" tone={IN}>
                {contraIn.map((t, i) => (
                  <Line key={`ci-${i}`} main={<span className="text-slate-900">{t.particulars}</span>} sub={t.ref ?? ''} cash={t.cash_in} bank={t.bank_in} tone={IN} />
                ))}
              </PersonGroup>
            )}
            {!d.receipts.length && !contraIn.length && <Nothing>No money came in.</Nothing>}
          </Side>

          <Side title="Went out" tone={OUT} total={{ cash: d.totals.cash_out, bank: d.totals.bank_out }} className="border-t border-slate-200 lg:border-t-0">
            {d.payments.map((g) => (
              <PersonGroup key={`out-${g.party}`} label={`To ${g.party}`} cash={g.cash} bank={g.bank} tone={OUT}>
                {g.lines.map((l) => (
                  <Line
                    key={l.expense_id}
                    main={<span className="font-medium text-slate-900">{l.category}</span>}
                    sub={[l.description, l.ref].filter(Boolean).join(', ')}
                    method={l.book === 'bank' ? l.method : null}
                    cash={l.book === 'cash' ? l.amount : 0}
                    bank={l.book === 'bank' ? l.amount : 0}
                    tone={OUT}
                  />
                ))}
              </PersonGroup>
            ))}
            {contraOut.length > 0 && (
              <PersonGroup label="Moved between cash and bank" tone={OUT}>
                {contraOut.map((t, i) => (
                  <Line key={`co-${i}`} main={<span className="text-slate-900">{t.particulars}</span>} sub={t.ref ?? ''} cash={t.cash_out} bank={t.bank_out} tone={OUT} />
                ))}
              </PersonGroup>
            )}
            {!d.payments.length && !contraOut.length && <Nothing>Nothing was paid out.</Nothing>}
          </Side>
        </div>
      )}

      {/* The evening check: what the cash drawer should hold now, worked out as a sum. */}
      <div className="grid gap-px border-t-2 border-navy-900 bg-slate-200 sm:grid-cols-2">
        <Closing label="Cash at close" hint="Count the office cash: it should match." opening={d.opening.cash} came={d.totals.cash_in} went={d.totals.cash_out} closing={d.closing.cash} />
        <Closing label="Bank / UPI at close" hint="Should match the bank statement for the day." opening={d.opening.bank} came={d.totals.bank_in} went={d.totals.bank_out} closing={d.closing.bank} />
      </div>
      {adding === 'income' && <IncomeDialog income={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
      {adding === 'expense' && <ExpenseDialog expense={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
    </article>
  );
}

/** One side of the book, with its own Cash and Bank / UPI columns and total. */
function Side({ title, tone, total, className, children }: { title: string; tone: string; total: Pair; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col', className)} aria-label={title}>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-end gap-x-3 border-b border-slate-200 px-5 pb-2 pt-4">
        <h3 className={cn('text-base font-semibold', tone)}>{title}</h3>
        <span className="text-right text-xs font-medium text-slate-500">Cash</span>
        <span className="text-right text-xs font-medium text-slate-500">Bank / UPI</span>
      </div>
      <div className="flex-1 pb-2">{children}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-x-3 border-t border-slate-300 bg-slate-50/70 px-5 py-2.5 text-sm">
        <span className="font-semibold text-slate-900">Total {title.toLowerCase()}</span>
        <Amt v={total.cash} tone={tone} strong />
        <Amt v={total.bank} tone={tone} strong />
      </div>
    </section>
  );
}

function PersonGroup({ label, cash, bank, tone, children }: { label: string; cash?: number; bank?: number; tone: string; children: ReactNode }) {
  return (
    <div className="border-b border-dashed border-slate-200 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-x-3 px-5 pb-1 pt-3 text-sm">
        <span className="truncate font-semibold text-navy-900">{label}</span>
        {cash !== undefined && <Amt v={cash} tone={tone} className="text-xs opacity-70" />}
        {bank !== undefined && <Amt v={bank} tone={tone} className="text-xs opacity-70" />}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Line({ main, sub, method, cash, bank, tone }: { main: ReactNode; sub: string; method?: string | null; cash: number; bank: number; tone: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-baseline gap-x-3 px-5 py-1.5 text-sm hover:bg-slate-50">
      <span className="min-w-0 pl-3">
        <span className="block break-words">{main}</span>
        {(sub || method) && (
          <span className="block truncate text-xs text-slate-500">
            {sub}
            {method && (
              <>
                {sub ? ', ' : ''}
                <MethodLabel method={method} />
              </>
            )}
          </span>
        )}
      </span>
      <Amt v={cash} tone={tone} />
      <Amt v={bank} tone={tone} />
    </li>
  );
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm text-slate-500">{children}</p>;
}

function Closing({ label, hint, opening, came, went, closing }: { label: string; hint: string; opening: number; came: number; went: number; closing: number }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-bold tracking-tight tabular-nums', closing < 0 ? OUT : 'text-navy-900')}>{money(closing)}</p>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        {money(opening)} brought forward <span className={IN}>+ {money(came)}</span> <span className={OUT}>− {money(went)}</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500 print:hidden">{hint}</p>
    </div>
  );
}
