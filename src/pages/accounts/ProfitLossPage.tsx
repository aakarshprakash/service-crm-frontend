import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Printer } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, PageHeader, QueryState } from '@/components/ui';
import { PeriodFilter, usePeriod } from '@/components/period';

interface Line { label: string; current: number; previous: number }
interface Statement {
  period: { from: string; to: string };
  previous_period: { from: string; to: string };
  income: Line[];
  expenses: Line[];
  total_income: { current: number; previous: number };
  total_expense: { current: number; previous: number };
  net: { current: number; previous: number };
  margin: { current: number | null; previous: number | null };
}

/** Profit & loss statement for a period, side by side with the period just before it. */
export default function ProfitLossPage() {
  const state = usePeriod();
  const { period } = state;
  const q = useQuery({ queryKey: ['books', 'pl', period], queryFn: () => api.get<Envelope<Statement>>('/books/profit-loss', period).then((r) => r.data) });
  const s = q.data;

  return (
    <>
      <PageHeader
        title="Profit & loss"
        description="Income received against expenses paid (cash basis), compared with the previous period of the same length."
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Link to="/reports?report=profit-loss">
              <Button variant="secondary" icon={<FileBarChart className="h-4 w-4" />}>
                Daily report
              </Button>
            </Link>
          </>
        }
      />
      <Card padded={false} className="mb-6 print:hidden">
        <PeriodFilter state={state} />
      </Card>
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {s && (
          <Card padded={false} className="mx-auto max-w-3xl">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Particulars</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    {date(s.period.from)} – {date(s.period.to)}
                  </th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">
                    Previous
                    <span className="block font-normal normal-case">
                      {date(s.previous_period.from)} – {date(s.previous_period.to)}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <Heading>Income</Heading>
                {s.income.map((l) => (
                  <LineRow key={l.label} line={l} />
                ))}
                <TotalRow label="Total income" cur={s.total_income.current} prev={s.total_income.previous} />
                <Heading>Expenses</Heading>
                {s.expenses.length ? s.expenses.map((l) => <LineRow key={l.label} line={l} />) : <tr><td className="px-5 py-2 text-slate-500" colSpan={3}>No expenses</td></tr>}
                <TotalRow label="Total expenses" cur={s.total_expense.current} prev={s.total_expense.previous} />
              </tbody>
              <tfoot>
                <tr className={cn('border-t-2', s.net.current >= 0 ? 'border-emerald-600 bg-emerald-50/60' : 'border-red-600 bg-red-50/60')}>
                  <td className="px-5 py-3 text-base font-semibold">{s.net.current >= 0 ? 'Net profit' : 'Net loss'}</td>
                  <td className={cn('px-5 py-3 text-right text-base font-semibold tabular-nums', s.net.current < 0 && 'text-red-700')}>{money(s.net.current)}</td>
                  <td className="hidden px-5 py-3 text-right font-medium tabular-nums text-slate-600 sm:table-cell">{money(s.net.previous)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-2 text-slate-500">Profit margin</td>
                  <td className="px-5 py-2 text-right tabular-nums">{s.margin.current === null ? '—' : `${s.margin.current}%`}</td>
                  <td className="hidden px-5 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{s.margin.previous === null ? '—' : `${s.margin.previous}%`}</td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Cash basis: income counts when payment is received; unpaid invoices are under Receivables. Salaries appear once a payroll is marked paid.
            </p>
          </Card>
        )}
      </QueryState>
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={3} className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {children}
      </td>
    </tr>
  );
}

function LineRow({ line }: { line: Line }) {
  const diff = line.previous ? Math.round(((line.current - line.previous) / Math.abs(line.previous)) * 100) : null;
  return (
    <tr>
      <td className="px-5 py-1.5 pl-8 text-slate-700">{line.label}</td>
      <td className="px-5 py-1.5 text-right tabular-nums">{money(line.current)}</td>
      <td className="hidden px-5 py-1.5 text-right tabular-nums text-slate-500 sm:table-cell">
        {money(line.previous)}
        {diff !== null && diff !== 0 && <span className="ml-1 text-[11px]">({diff > 0 ? '+' : ''}{diff}%)</span>}
      </td>
    </tr>
  );
}

function TotalRow({ label, cur, prev }: { label: string; cur: number; prev: number }) {
  return (
    <tr className="border-t border-slate-200">
      <td className="px-5 py-2 font-semibold">{label}</td>
      <td className="px-5 py-2 text-right font-semibold tabular-nums">{money(cur)}</td>
      <td className="hidden px-5 py-2 text-right tabular-nums text-slate-600 sm:table-cell">{money(prev)}</td>
    </tr>
  );
}
