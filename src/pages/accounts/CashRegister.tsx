import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Building2, ChevronDown, ChevronLeft, ChevronRight, HandCoins, HelpCircle, Landmark, Lock, Printer, Users } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Input, QueryState } from '@/components/ui';
import { MethodLabel } from '@/components/domain';
import { IncomeDialog } from '@/pages/expenses/IncomePage';
import { ExpenseDialog } from '@/pages/expenses/ExpensesPage';
import { OfficeCloseBand, type OfficeClose } from './OfficeDayClose';
import { PaymentPicker } from './AccountsOverview';
import { TransferDialog } from './bookDialogs';

type Pair = { cash: number; bank: number };
/** A payment on an invoice, or income received without one (income_id set, no invoice). */
interface ReceiptLine { at: string | null; customer: string; phone: string | null; invoice_id: number | null; invoice_number: string | null; income_id: number | null; category: string | null; job: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface PaymentLine { expense_id: number; category: string; description: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface Group<L> { party: string; kind?: 'staff' | 'office' | 'online'; lines: L[]; cash: number; bank: number }
interface Contra { transfer_id: number | null; particulars: string; ref: string | null; cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Totals { cash_in: number; bank_in: number; cash_out: number; bank_out: number }
/** A short or extra office cash count, posted to the cash book on the day it was counted. */
interface Adjustment { particulars: string; cash_in: number; cash_out: number }
/** Cash a technician handed to the office that day. It stays cash, so it changes no total. */
interface Handover { technician_id: number; technician: string; amount: number }
/** Where the cash is at this moment: the office drawer and what each technician still holds. */
interface CashNow {
  date: string;
  office: number | null;
  office_counted: boolean;
  counted_on: string | null;
  needs_opening: boolean;
  technicians: { id: number; name: string; amount: number }[];
  with_technicians: number;
}
interface Day {
  date: string;
  opening: Pair;
  receipts: Group<ReceiptLine>[];
  payments: Group<PaymentLine>[];
  transfers: Contra[];
  adjustments: Adjustment[];
  handovers?: Handover[];
  totals: Totals;
  closing: Pair;
  empty: boolean;
  /** The office's own cash count for this day, if it was closed on this day. */
  office_close: OfficeClose | null;
  /** On or before the last office close: office entries can't be changed. */
  locked: boolean;
}
interface Register { from: string; to: string; opening: Pair; days: Day[]; totals: Totals; closing: Pair; closed_through: string | null; cash_now?: CashNow }

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
                  {future ? '' : !x ? '…' : x.empty ? (x.handovers?.length ? 'Cash handed in' : 'Nothing') : moved ? `+${money(moved).replace(/\.00$/, '')}` : 'Paid out only'}
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
        {d && <DayPage d={d} now={d.date === today() ? q.data?.cash_now : undefined} />}
      </QueryState>
    </>
  );
}

/** One line of the book. A line can sit in any of the four columns; a bank move fills one Received and one Paid. */
interface Row { key: string; dir: 'in' | 'out' | 'move'; main: ReactNode; sub: string; method: string | null; inCash: number; inBank: number; outCash: number; outBank: number }
/** Everything for one person or source, the way the paper book writes "From Anwar …" then "To Anwar …". */
interface Block { key: string; name: string; note?: string; rank: number; rows: Row[]; handed?: number }

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

  // Cash handed to the office sits with the person who handed it over, even on a day they collected nothing.
  for (const h of d.handovers ?? []) {
    const b = block(h.technician, 0);
    b.handed = (b.handed ?? 0) + h.amount;
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

function DayPage({ d, now }: { d: Day; now?: CashNow }) {
  const { can } = useAuth();
  const blocks = useMemo(() => toBlocks(d), [d]);
  const [help, setHelp] = useState(false);
  const received = d.totals.cash_in + d.totals.bank_in;
  const paid = d.totals.cash_out + d.totals.bank_out;
  // Bank deposits and withdrawals sit in both a Received and a Paid column: say so, or the totals look inflated.
  const moved = d.transfers.reduce((a, t) => a + t.cash_in + t.bank_in, 0);
  // The forms open over the register, dated the day on screen; saving refreshes this page.
  const [adding, setAdding] = useState<'payment' | 'income' | 'expense' | 'transfer' | null>(null);
  const isToday = d.date === today();

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
          {/* Everything that goes into the register can be recorded from here, dated the day on screen. */}
          {can('payments.record') && isToday && (
            <Button variant="secondary" size="sm" icon={<HandCoins className="h-4 w-4 text-emerald-700" />} onClick={() => setAdding('payment')}>
              Bill payment
            </Button>
          )}
          {can('expenses.manage') && !d.locked && (
            <>
              <Button variant="secondary" size="sm" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-700" />} onClick={() => setAdding('income')}>
                Other money received
              </Button>
              <Button variant="secondary" size="sm" icon={<ArrowUpRight className="h-4 w-4 text-red-700" />} onClick={() => setAdding('expense')}>
                Expense paid
              </Button>
              <Button variant="secondary" size="sm" icon={<ArrowLeftRight className="h-4 w-4 text-slate-500" />} onClick={() => setAdding('transfer')}>
                Cash ↔ bank
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* The day in three numbers, before any detail. */}
      {!d.empty && (
        <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3">
          <DayFigure label="Received" amount={received} sign="+" tone={IN} cash={d.totals.cash_in} bank={d.totals.bank_in} />
          <DayFigure label="Paid" amount={paid} sign="−" tone={OUT} cash={d.totals.cash_out} bank={d.totals.bank_out} />
          <DayFigure label={received - paid >= 0 ? 'Left over from the day' : 'Paid more than received'} amount={Math.abs(received - paid)} sign={received - paid >= 0 ? '+' : '−'} tone={received - paid >= 0 ? 'text-navy-900' : OUT} cash={d.totals.cash_in - d.totals.cash_out} bank={d.totals.bank_in - d.totals.bank_out} signed />
        </div>
      )}
      {moved > 0 && !d.empty && (
        <p className="border-b border-slate-200 bg-amber-50/60 px-5 py-2 text-xs text-amber-900">
          {money(moved)} was moved between cash and the bank today. It shows under both Received and Paid, so it is counted in both totals above.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm">
        <span className="text-slate-600">At the start of the day</span>
        <span>
          Cash <strong className="tabular-nums text-slate-900">{money(d.opening.cash)}</strong>
        </span>
        <span>
          Bank / UPI <strong className="tabular-nums text-slate-900">{money(d.opening.bank)}</strong>
        </span>
        <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline print:hidden">
          <HelpCircle className="h-3.5 w-3.5" /> How to read this <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', help && 'rotate-180')} />
        </button>
      </div>
      {help && (
        <ul className="list-disc space-y-1 border-b border-slate-200 bg-white px-5 py-3 pl-9 text-sm text-slate-600 print:hidden">
          <li>Each heading is a person. Under a technician are the customers they collected from; under anyone else is what the office received from or paid to them.</li>
          <li><span className={IN}>Received</span> is money that came in, <span className={OUT}>Paid</span> is money that went out. Each has a Cash column and a Bank / UPI column.</li>
          <li>A technician’s cash counts as received on the day the customer paid, even if they hand it over later. “Handed to the office” lines show when it reached the office.</li>
          <li>The total for a person is on the last line of their block. The total for the whole day is at the bottom.</li>
        </ul>
      )}

      {d.empty && !d.handovers?.length ? (
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
              {!!b.handed && (
                <p className="flex items-center gap-2 py-1.5 pl-7 pr-5 text-xs text-slate-600">
                  <HandCoins className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  Handed {money(b.handed)} in cash to the office today
                </p>
              )}
              {b.rows.length > 1 && <BlockTotal name={b.name} rows={b.rows} />}
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
        <Closing label={now ? 'Cash so far today' : 'Cash at the end of the day'} hint="All the company’s cash: in the office and with technicians." opening={d.opening.cash} came={d.totals.cash_in} went={d.totals.cash_out} closing={d.closing.cash} />
        <Closing label={now ? 'Bank / UPI so far today' : 'Bank / UPI at the end of the day'} hint="Should match the bank statement." opening={d.opening.bank} came={d.totals.bank_in} went={d.totals.bank_out} closing={d.closing.bank} />
      </div>
      {now && <WhereTheCashIs now={now} />}
      <OfficeCloseBand date={d.date} close={d.office_close ?? null} locked={!!d.locked} isToday={d.date === today()} />
      {adding === 'income' && <IncomeDialog income={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
      {adding === 'expense' && <ExpenseDialog expense={null} defaultDate={d.date} onClose={() => setAdding(null)} />}
      {adding === 'transfer' && <TransferDialog defaultDate={d.date} onClose={() => setAdding(null)} />}
      {adding === 'payment' && <PaymentPicker onClose={() => setAdding(null)} />}
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

/** One of the three figures at the top of the day, with its cash and bank parts underneath. */
function DayFigure({ label, amount, sign, tone, cash, bank, signed }: { label: string; amount: number; sign: '+' | '−'; tone: string; cash: number; bank: number; signed?: boolean }) {
  const part = (v: number) => (signed && v < 0 ? `− ${money(-v)}` : money(v));
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-bold tracking-tight tabular-nums', tone)}>
        {amount ? `${sign} ` : ''}
        {money(amount)}
      </p>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        Cash {part(cash)} · Bank / UPI {part(bank)}
      </p>
    </div>
  );
}

/** The last line of a person's block: what they brought in and what was paid to them, column by column. */
function BlockTotal({ name, rows }: { name: string; rows: Row[] }) {
  const sum = (k: 'inCash' | 'inBank' | 'outCash' | 'outBank') => rows.reduce((a, r) => a + r[k], 0);
  const [inCash, inBank, outCash, outBank] = [sum('inCash'), sum('inBank'), sum('outCash'), sum('outBank')];
  return (
    <div className={cn('flex items-center justify-between gap-3 border-t border-dashed border-slate-200 text-sm', GRID)}>
      <span className="truncate py-2 pl-7 pr-3 text-slate-600">Total for {name}</span>
      <Amt v={inCash} tone={IN} strong className={cn(COL, 'py-2', RULE_IN)} />
      <Amt v={inBank} tone={IN} strong className={cn(COL, 'py-2')} />
      <Amt v={outCash} tone={OUT} strong className={cn(COL, 'py-2', RULE_OUT)} />
      <Amt v={outBank} tone={OUT} strong className={cn(COL, 'py-2')} />
      <span className="shrink-0 py-2 pr-5 text-right text-sm font-semibold tabular-nums md:hidden">
        {inCash + inBank > 0 && <span className={cn('block', IN)}>+ {money(inCash + inBank)}</span>}
        {outCash + outBank > 0 && <span className={cn('block', OUT)}>− {money(outCash + outBank)}</span>}
      </span>
    </div>
  );
}

/**
 * Today only: the cash split by where it physically is. The book's single cash figure mixes the office
 * drawer with what technicians still carry, which is what makes an evening count hard to match.
 */
function WhereTheCashIs({ now }: { now: CashNow }) {
  const [open, setOpen] = useState(false);
  const counted = now.counted_on ? new Date(`${now.counted_on}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  return (
    <section aria-label="Where the cash is right now" className="border-t border-slate-200 bg-slate-50 px-5 py-4 print:hidden">
      <h3 className="text-sm font-semibold text-navy-900">Where the cash is right now</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm text-slate-600"><Building2 className="h-4 w-4 text-slate-400" aria-hidden /> In the office</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-navy-900">{now.office === null ? 'Not counted yet' : money(now.office)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {now.office === null
              ? 'Count the office cash once with “Count cash and close” below. From then on this is worked out for you.'
              : now.office_counted
                ? 'Counted today.'
                : `What the drawer should hold, worked forward from the count on ${counted}.`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm text-slate-600"><Users className="h-4 w-4 text-slate-400" aria-hidden /> With technicians</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-navy-900">{money(now.with_technicians)}</p>
          {now.technicians.length ? (
            <>
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                Collected but not handed over, by {now.technicians.length} {now.technicians.length === 1 ? 'person' : 'people'} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm">
                  {now.technicians.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3">
                      <span className="truncate text-slate-700">{t.name}</span>
                      <span className={cn('tabular-nums', t.amount < 0 ? OUT : 'text-slate-900')}>{money(t.amount)}</span>
                    </li>
                  ))}
                  <li className="pt-1">
                    <Link to="/accounts/cash-close" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      <Landmark className="h-3.5 w-3.5" /> Take cash from technicians
                    </Link>
                  </li>
                </ul>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Everything collected has been handed over.</p>
          )}
        </div>
      </div>
    </section>
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
