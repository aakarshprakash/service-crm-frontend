import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Lock, Printer } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Input, QueryState } from '@/components/ui';
import { MethodLabel } from '@/components/domain';
import { IncomeDialog } from '@/pages/expenses/IncomePage';
import { ExpenseDialog } from '@/pages/expenses/ExpensesPage';
import { OfficeCloseBand, type OfficeClose } from './OfficeDayClose';

type Pair = { cash: number; bank: number };
/** A payment on an invoice, or income received without one (income_id set, no invoice). */
interface ReceiptLine { at: string | null; customer: string; phone: string | null; invoice_id: number | null; invoice_number: string | null; income_id: number | null; category: string | null; job: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface PaymentLine { expense_id: number; category: string; description: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface Group<L> { party: string; kind?: 'staff' | 'office' | 'online'; lines: L[]; cash: number; bank: number }
interface Contra { transfer_id: number | null; particulars: string; ref: string | null; cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Totals { cash_in: number; bank_in: number; cash_out: number; bank_out: number }
/** A short or extra office cash count, posted to the cash book on the day it was counted. */
interface Adjustment { particulars: string; cash_in: number; cash_out: number }
interface Day {
  date: string;
  opening: Pair;
  receipts: Group<ReceiptLine>[];
  payments: Group<PaymentLine>[];
  transfers: Contra[];
  adjustments: Adjustment[];
  totals: Totals;
  closing: Pair;
  empty: boolean;
  /** The office's own cash count for this day, if it was closed on this day. */
  office_close: OfficeClose | null;
  /** On or before the last office close: office entries can't be changed. */
  locked: boolean;
}
interface Register { from: string; to: string; opening: Pair; days: Day[]; totals: Totals; closing: Pair; closed_through: string | null }

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
 * Daily cash register, kept like the paper book: one list down the page, a block per person with the customers
 * they collected from and what was paid to them, and four columns on the right, Received (cash, bank / UPI)
 * and Paid (cash, bank / UPI). The day ends with what's left in cash and in the bank.
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
                <span className={cn('flex items-center justify-between gap-1 text-xs', on ? 'text-white/70' : 'text-slate-500')}>
                  {asDate(date).toLocaleDateString('en-IN', { weekday: 'short' })}
                  {x?.locked && <Lock className="h-3 w-3" aria-label="Closed" />}
                </span>
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

/** One line of the book. A line can sit in any of the four columns; a bank move fills one Received and one Paid. */
interface Row { key: string; dir: 'in' | 'out' | 'move'; main: ReactNode; sub: string; method: string | null; inCash: number; inBank: number; outCash: number; outBank: number }
/** Everything for one person or source, the way the paper book writes "From Anwar …" then "To Anwar …". */
interface Block { key: string; name: string; note?: string; rank: number; rows: Row[] }

function toBlocks(d: Day): Block[] {
  const byName = new Map<string, Block>();
  const block = (name: string, rank: number, note?: string) => {
    const k = name.trim().toLowerCase();
    let b = byName.get(k);
    if (!b) byName.set(k, (b = { key: k, name, note, rank, rows: [] }));
    else b.rank = Math.min(b.rank, rank);
    return b;
  };

  for (const g of d.receipts) {
    const b =
      g.kind === 'office' ? block('Office counter', 2, 'Paid at the office') : g.kind === 'online' ? block('Paid online', 3, 'Customers who paid by payment link') : block(g.party, 0);
    for (const l of g.lines) {
      b.rows.push({
        key: l.income_id ? `inc-${l.income_id}` : `${l.invoice_id}-${l.at}-${l.ref}`,
        dir: 'in',
        main: (
          <Link to={l.invoice_id ? `/invoices/${l.invoice_id}` : '/accounts/income'} className="font-medium text-slate-900 hover:underline">
            {l.customer}
          </Link>
        ),
        sub: [l.phone, l.invoice_number ?? l.category, l.job].filter(Boolean).join(', '),
        method: l.book === 'bank' ? l.method : null,
        inCash: l.book === 'cash' ? l.amount : 0,
        inBank: l.book === 'bank' ? l.amount : 0,
        outCash: 0,
        outBank: 0,
      });
    }
  }

  for (const g of d.payments) {
    const b = block(g.party === 'Not named' ? 'Other payments' : g.party, 1);
    for (const l of g.lines) {
      b.rows.push({
        key: `exp-${l.expense_id}`,
        dir: 'out',
        main: <span className="font-medium text-slate-900">{l.category}</span>,
        sub: [l.description, l.ref].filter(Boolean).join(', '),
        method: l.book === 'bank' ? l.method : null,
        inCash: 0,
        inBank: 0,
        outCash: l.book === 'cash' ? l.amount : 0,
        outBank: l.book === 'bank' ? l.amount : 0,
      });
    }
  }

  const people = [...byName.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  if (d.transfers.length) {
    people.push({
      key: 'moves',
      name: 'Bank deposits and withdrawals',
      note: 'Money moved between cash and the bank: it leaves one column and enters the other.',
      rank: 4,
      rows: d.transfers.map((t, i) => ({
        key: `t-${i}`,
        dir: 'move' as const,
        main: <span className="font-medium text-slate-900">{t.particulars}</span>,
        sub: t.ref ?? '',
        method: null,
        inCash: t.cash_in,
        inBank: t.bank_in,
        outCash: t.cash_out,
        outBank: t.bank_out,
      })),
    });
  }
  if (d.adjustments?.length) {
    people.push({
      key: 'count',
      name: 'Office cash count',
      rank: 5,
      rows: d.adjustments.map((a, i) => ({
        key: `a-${i}`,
        dir: a.cash_in ? ('in' as const) : ('out' as const),
        main: <span className="font-medium text-slate-900">{a.particulars}</span>,
        sub: '',
        method: null,
        inCash: a.cash_in,
        inBank: 0,
        outCash: a.cash_out,
        outBank: 0,
      })),
    });
  }
  return people;
}

/** Particulars, then Received (cash, bank / UPI) and Paid (cash, bank / UPI), with ruled columns like the paper book. */
const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_7rem] md:gap-0';
const COL = 'hidden px-3 md:block';
const RULE_IN = 'md:border-l md:border-slate-200';
const RULE_OUT = 'md:border-l-[3px] md:border-double md:border-slate-300';

function DayPage({ d }: { d: Day }) {
  const { can } = useAuth();
  const blocks = useMemo(() => toBlocks(d), [d]);
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
          {d.locked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Day closed
            </span>
          )}
          {can('expenses.manage') && !d.locked && (
            <>
              <Button variant="secondary" size="sm" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-700" />} onClick={() => setAdding('income')}>
                Add money received
              </Button>
              <Button variant="secondary" size="sm" icon={<ArrowUpRight className="h-4 w-4 text-red-700" />} onClick={() => setAdding('expense')}>
                Add money paid
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm">
        <span className="text-slate-600">At the start of the day</span>
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
          <p className="mt-1 text-sm text-slate-500">Payments technicians collect, bills paid at the office, and money received or paid appear here as they are recorded.</p>
        </div>
      ) : (
        <div role="table" aria-label="Money received and paid">
          {/* Column heads, two rows like the ruled book: Received | Paid, then Cash | Bank / UPI under each. */}
          <div role="row" className={cn('hidden border-b border-slate-200 text-xs font-medium', GRID)}>
            <span className="px-5 pt-3" />
            <span role="columnheader" className={cn('col-span-2 px-3 pt-3 text-center text-sm font-semibold', IN, RULE_IN)}>
              Received
            </span>
            <span role="columnheader" className={cn('col-span-2 px-3 pt-3 text-center text-sm font-semibold', OUT, RULE_OUT)}>
              Paid
            </span>
            <span className="px-5 pb-2 pt-1 text-slate-500">Details</span>
            <span role="columnheader" className={cn('px-3 pb-2 pt-1 text-right text-slate-500', RULE_IN)}>Cash</span>
            <span role="columnheader" className="px-3 pb-2 pt-1 text-right text-slate-500">Bank / UPI</span>
            <span role="columnheader" className={cn('px-3 pb-2 pt-1 text-right text-slate-500', RULE_OUT)}>Cash</span>
            <span role="columnheader" className="px-3 pb-2 pt-1 text-right text-slate-500">Bank / UPI</span>
          </div>

          {blocks.map((b) => (
            <section key={b.key} aria-label={b.name} className="border-b border-slate-200">
              <div className={cn('flex items-baseline justify-between gap-3', GRID)}>
                <h3 className="px-5 pb-1 pt-4 text-[15px] font-semibold text-navy-900">
                  {b.name}
                  {b.note && <span className="block text-xs font-normal text-slate-500">{b.note}</span>}
                </h3>
                <span className={cn('h-full', COL, RULE_IN)} />
                <span className={cn('h-full', COL)} />
                <span className={cn('h-full', COL, RULE_OUT)} />
                <span className={cn('h-full', COL)} />
              </div>
              <ul>
                {b.rows.map((r) => (
                  <BookLine key={r.key} r={r} />
                ))}
              </ul>
            </section>
          ))}

          <div role="row" className={cn('flex items-center justify-between gap-3 border-t-2 border-navy-900 bg-slate-50 text-sm font-semibold', GRID)}>
            <span className="px-5 py-3 text-slate-900">Total for the day</span>
            <Amt v={d.totals.cash_in} tone={IN} strong className={cn(COL, 'py-3', RULE_IN)} />
            <Amt v={d.totals.bank_in} tone={IN} strong className={cn(COL, 'py-3')} />
            <Amt v={d.totals.cash_out} tone={OUT} strong className={cn(COL, 'py-3', RULE_OUT)} />
            <Amt v={d.totals.bank_out} tone={OUT} strong className={cn(COL, 'py-3')} />
            <span className="px-5 py-3 text-right tabular-nums md:hidden">
              <span className={cn('block', IN)}>+ {money(d.totals.cash_in + d.totals.bank_in)}</span>
              <span className={cn('block', OUT)}>− {money(d.totals.cash_out + d.totals.bank_out)}</span>
            </span>
          </div>
        </div>
      )}

      {/* The evening check: what's left in cash and in the bank, worked out as a sum. */}
      <div className="grid gap-px border-t-2 border-navy-900 bg-slate-200 sm:grid-cols-2">
        <Closing label="Cash at the end of the day" hint="Includes cash technicians haven’t handed over yet." opening={d.opening.cash} came={d.totals.cash_in} went={d.totals.cash_out} closing={d.closing.cash} />
        <Closing label="Bank / UPI at the end of the day" hint="Should match the bank statement." opening={d.opening.bank} came={d.totals.bank_in} went={d.totals.bank_out} closing={d.closing.bank} />
      </div>
      <OfficeCloseBand date={d.date} close={d.office_close ?? null} locked={!!d.locked} isToday={d.date === today()} />
      {adding === 'income' && <IncomeDialog income={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
      {adding === 'expense' && <ExpenseDialog expense={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
    </article>
  );
}

const ICON = {
  in: <ArrowDownLeft className={cn('h-3.5 w-3.5', IN)} aria-label="Received" />,
  out: <ArrowUpRight className={cn('h-3.5 w-3.5', OUT)} aria-label="Paid" />,
  move: <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" aria-label="Moved" />,
};

function BookLine({ r }: { r: Row }) {
  // On a phone the four columns fold into one amount: + received, − paid, or a move between cash and bank.
  const phone =
    r.dir === 'move'
      ? { text: money(Math.max(r.inCash, r.inBank)), tone: 'text-slate-700', note: r.outCash ? 'Cash → bank' : 'Bank → cash' }
      : r.dir === 'in'
        ? { text: `+ ${money(r.inCash + r.inBank)}`, tone: IN, note: r.inBank ? 'Bank / UPI' : 'Cash' }
        : { text: `− ${money(r.outCash + r.outBank)}`, tone: OUT, note: r.outBank ? 'Bank / UPI' : 'Cash' };

  return (
    <li className={cn('flex items-start justify-between gap-3 text-sm hover:bg-slate-50', GRID)}>
      <span className="flex min-w-0 items-start gap-2 py-2 pl-7 pr-3">
        <span className="mt-1 shrink-0">{ICON[r.dir]}</span>
        <span className="min-w-0">
          <span className="block break-words">{r.main}</span>
          {(r.sub || r.method) && (
            <span className="block truncate text-xs text-slate-500">
              {r.sub}
              {r.method && (
                <>
                  {r.sub ? ', ' : ''}
                  <MethodLabel method={r.method} />
                </>
              )}
            </span>
          )}
        </span>
      </span>
      <Amt v={r.inCash} tone={IN} className={cn(COL, 'py-2', RULE_IN)} />
      <Amt v={r.inBank} tone={IN} className={cn(COL, 'py-2')} />
      <Amt v={r.outCash} tone={OUT} className={cn(COL, 'py-2', RULE_OUT)} />
      <Amt v={r.outBank} tone={OUT} className={cn(COL, 'py-2')} />
      <span className="shrink-0 py-2 pr-5 text-right md:hidden">
        <span className={cn('block font-medium tabular-nums', phone.tone)}>{phone.text}</span>
        <span className="block text-[11px] text-slate-500">{phone.note}</span>
      </span>
    </li>
  );
}

function Closing({ label, hint, opening, came, went, closing }: { label: string; hint: string; opening: number; came: number; went: number; closing: number }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-bold tracking-tight tabular-nums', closing < 0 ? OUT : 'text-navy-900')}>{money(closing)}</p>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        {money(opening)} at the start <span className={IN}>+ {money(came)} received</span> <span className={OUT}>− {money(went)} paid</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500 print:hidden">{hint}</p>
    </div>
  );
}
