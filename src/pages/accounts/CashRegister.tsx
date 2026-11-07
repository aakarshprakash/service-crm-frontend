import { Fragment } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, Input, QueryState, StatCard } from '@/components/ui';
import { MethodLabel } from '@/components/domain';

type Pair = { cash: number; bank: number };
/** A payment on an invoice, or income received without one (income_id set, no invoice). */
interface ReceiptLine { at: string | null; customer: string; phone: string | null; invoice_id: number | null; invoice_number: string | null; income_id: number | null; category: string | null; job: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface PaymentLine { expense_id: number; category: string; description: string | null; ref: string | null; method: string; book: 'cash' | 'bank'; amount: number }
interface Group<L> { party: string; kind?: 'staff' | 'office' | 'online'; lines: L[]; cash: number; bank: number }
interface Contra { transfer_id: number; particulars: string; ref: string | null; cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Totals { cash_in: number; bank_in: number; cash_out: number; bank_out: number }
interface Day { date: string; opening: Pair; receipts: Group<ReceiptLine>[]; payments: Group<PaymentLine>[]; transfers: Contra[]; totals: Totals; closing: Pair; empty: boolean }
interface Register { from: string; to: string; opening: Pair; days: Day[]; totals: Totals; closing: Pair }

const shift = (d: string, days: number) => {
  const t = new Date(`${d}T12:00:00`);
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
};

/** One amount in its column: blank when zero, the way a register is written. */
function Amt({ v, tone, strong }: { v: number; tone?: 'in' | 'out'; strong?: boolean }) {
  return <td className={cn('px-3 py-1.5 text-right tabular-nums', !v && 'text-slate-300', v && tone === 'in' && 'text-emerald-700', v && tone === 'out' && 'text-red-700', strong && 'font-semibold')}>{v ? money(v) : ''}</td>;
}

/**
 * Daily cash transaction register: one day of money in and out, laid out like the paper book.
 * "From" whoever brought the money in, each customer on a line with their phone; "To" whoever was paid.
 * Receipts (CR) on the left, payments (DR) on the right, each split into Cash and Bank / UPI.
 */
export function CashRegister({ day, onDay }: { day: string; onDay: (d: string) => void }) {
  const q = useQuery({ queryKey: ['books', 'register', day], queryFn: () => api.get<Envelope<Register>>('/books/register', { from: day, to: day }).then((r) => r.data) });
  const d = q.data?.days[0];
  const isToday = day >= today();

  return (
    <>
      <Card padded={false} className="mb-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous day" onClick={() => onDay(shift(day, -1))} />
          <Input type="date" value={day} max={today()} onChange={(e) => e.target.value && onDay(e.target.value)} className="w-44" aria-label="Day" />
          <Button variant="secondary" size="sm" icon={<ChevronRight className="h-4 w-4" />} aria-label="Next day" disabled={isToday} onClick={() => onDay(shift(day, 1))} />
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => onDay(today())}>
              Today
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Link to="/accounts/income?new=1" className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Record income
            </Link>
            <Link to="/accounts/expenses?new=1" className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Record a payment
            </Link>
            <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
      </Card>

      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
              <StatCard label="Received" value={money(d.totals.cash_in + d.totals.bank_in)} tone="green" />
              <StatCard label="Paid out" value={money(d.totals.cash_out + d.totals.bank_out)} tone="amber" />
              <StatCard label="Cash at close" value={money(d.closing.cash)} tone={d.closing.cash < 0 ? 'red' : 'blue'} />
              <StatCard label="Bank / UPI at close" value={money(d.closing.bank)} tone={d.closing.bank < 0 ? 'red' : 'blue'} />
            </div>

            <Card padded={false}>
              <div className="hidden px-4 pt-4 print:block">
                <h2 className="text-lg font-semibold">Daily cash register · {date(d.date)}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th rowSpan={2} className="px-3 py-2 text-left font-semibold">
                        {date(d.date)}
                      </th>
                      <th colSpan={2} className="border-l border-slate-200 px-3 pt-2 text-center font-semibold text-emerald-700">
                        Received (CR)
                      </th>
                      <th colSpan={2} className="border-l border-slate-200 px-3 pt-2 text-center font-semibold text-red-700">
                        Paid (DR)
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="border-l border-slate-200 px-3 pb-2 text-right font-medium">Cash</th>
                      <th className="px-3 pb-2 text-right font-medium">Bank / UPI</th>
                      <th className="border-l border-slate-200 px-3 pb-2 text-right font-medium">Cash</th>
                      <th className="px-3 pb-2 text-right font-medium">Bank / UPI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/60">
                      <td className="px-3 py-2 font-medium text-slate-700">Opening balance</td>
                      <Amt v={d.opening.cash} strong />
                      <Amt v={d.opening.bank} strong />
                      <td colSpan={2} />
                    </tr>

                    {d.receipts.map((g) => (
                      <Fragment key={`in-${g.party}`}>
                        <tr>
                          <td className="px-3 pb-0.5 pt-3 font-semibold text-slate-900">From {g.party}</td>
                          <td colSpan={4} />
                        </tr>
                        {g.lines.map((l) => (
                          <tr key={l.income_id ? `inc-${l.income_id}` : `${l.invoice_id}-${l.at}-${l.ref}`} className="hover:bg-slate-50">
                            <td className="py-1.5 pl-7 pr-3">
                              {l.invoice_id ? (
                                <Link to={`/invoices/${l.invoice_id}`} className="text-slate-800 hover:underline">
                                  {l.customer}
                                </Link>
                              ) : (
                                <Link to="/accounts/income" className="text-slate-800 hover:underline">
                                  {l.customer}
                                </Link>
                              )}
                              {l.phone && <span className="ml-2 tabular-nums text-slate-500">{l.phone}</span>}
                              <span className="ml-2 text-xs text-slate-400">
                                {[l.job, l.invoice_number, l.income_id ? l.category ?? 'Other income' : null].filter(Boolean).join(' · ')}
                                {l.book === 'bank' && (
                                  <>
                                    {' · '}
                                    <MethodLabel method={l.method} />
                                  </>
                                )}
                              </span>
                            </td>
                            <Amt v={l.book === 'cash' ? l.amount : 0} tone="in" />
                            <Amt v={l.book === 'bank' ? l.amount : 0} tone="in" />
                            <td colSpan={2} />
                          </tr>
                        ))}
                      </Fragment>
                    ))}

                    {d.payments.map((g) => (
                      <Fragment key={`out-${g.party}`}>
                        <tr>
                          <td className="px-3 pb-0.5 pt-3 font-semibold text-slate-900">To {g.party}</td>
                          <td colSpan={4} />
                        </tr>
                        {g.lines.map((l) => (
                          <tr key={l.expense_id} className="hover:bg-slate-50">
                            <td className="py-1.5 pl-7 pr-3 text-slate-800">
                              {l.category}
                              {l.description && <span className="ml-2 text-slate-500">{l.description}</span>}
                              {l.book === 'bank' && (
                                <span className="ml-2 text-xs text-slate-400">
                                  <MethodLabel method={l.method} />
                                </span>
                              )}
                            </td>
                            <td colSpan={2} />
                            <Amt v={l.book === 'cash' ? l.amount : 0} tone="out" />
                            <Amt v={l.book === 'bank' ? l.amount : 0} tone="out" />
                          </tr>
                        ))}
                      </Fragment>
                    ))}

                    {d.transfers.map((t) => (
                      <tr key={t.transfer_id}>
                        <td className="px-3 py-1.5 text-slate-800">
                          {t.particulars}
                          <span className="ml-2 text-xs text-slate-400">Contra{t.ref ? ` · ${t.ref}` : ''}</span>
                        </td>
                        <Amt v={t.cash_in} tone="in" />
                        <Amt v={t.bank_in} tone="in" />
                        <Amt v={t.cash_out} tone="out" />
                        <Amt v={t.bank_out} tone="out" />
                      </tr>
                    ))}

                    {d.empty && (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState title="Nothing received or paid on this day" message="Payments collected by technicians and the office, expenses and deposits appear here." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200">
                    <tr className="bg-slate-50/60">
                      <td className="px-3 py-2 font-semibold text-slate-900">Day total</td>
                      <Amt v={d.totals.cash_in} tone="in" strong />
                      <Amt v={d.totals.bank_in} tone="in" strong />
                      <Amt v={d.totals.cash_out} tone="out" strong />
                      <Amt v={d.totals.bank_out} tone="out" strong />
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-semibold text-slate-900">Closing balance</td>
                      <td className={cn('px-3 py-2 text-right font-bold tabular-nums', d.closing.cash < 0 && 'text-red-700')}>{money(d.closing.cash)}</td>
                      <td className={cn('px-3 py-2 text-right font-bold tabular-nums', d.closing.bank < 0 && 'text-red-700')}>{money(d.closing.bank)}</td>
                      <td colSpan={2} className="px-3 py-2 text-right text-xs text-slate-500">
                        Cash {money(d.opening.cash)} + {money(d.totals.cash_in)} − {money(d.totals.cash_out)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
            <p className="mt-3 text-xs text-slate-500 print:hidden">
              Cash a technician has collected is listed on the day they collected it, under their name. Money received without an invoice is added under Income. Expenses are grouped by who was paid: record staff travel, food and advances under Expenses with their name in “Paid to”.
            </p>
          </>
        )}
      </QueryState>
    </>
  );
}
