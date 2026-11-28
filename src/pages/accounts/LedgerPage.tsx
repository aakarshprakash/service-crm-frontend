import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Check, ChevronRight, Info, Printer, Scale, Settings2, Trash2, Users } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, ConfirmDialog, EmptyState, PageHeader, QueryState, SearchInput, Select, Tabs } from '@/components/ui';
import { PeriodFilter, usePeriod } from '@/components/period';
import { DayBook } from './dayBook';
import { OpeningDialog, TransferDialog } from './bookDialogs';

type Group = 'assets' | 'liabilities' | 'equity' | 'income' | 'expenses';
interface Account { code: string; name: string; group: Group; kind: string; note: string | null; opening: number; debit: number; credit: number; closing: number }
interface TrialBalance {
  from: string;
  to: string;
  opening_date: string | null;
  accounts: Account[];
  totals: { opening_dr: number; opening_cr: number; debit: number; credit: number; closing_dr: number; closing_cr: number };
  profit: { income: number; expenses: number };
}
type VoucherType = 'opening' | 'sales' | 'receipt' | 'income' | 'payment' | 'contra' | 'journal';
interface Entry {
  date: string;
  type: VoucherType;
  number: string | null;
  particulars: string;
  narration: string;
  link: { invoice_id?: number; income_id?: number; expense_id?: number; transfer_id?: number; cash_close_id?: number; office_close_date?: string; opening?: boolean };
  debit: number;
  credit: number;
  balance: number;
}
interface AccountLedger { account: Omit<Account, 'opening' | 'debit' | 'credit' | 'closing'>; from: string; to: string; opening: number; entries: Entry[]; total_debit: number; total_credit: number; closing: number }
interface CustomerRow { id: number; name: string; phone: string | null; opening: number; debit: number; credit: number; closing: number }

type Tab = 'accounts' | 'trial' | 'day-book';

const GROUPS: { key: Group; label: string }[] = [
  { key: 'assets', label: 'Cash, bank & customers' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'liabilities', label: 'Taxes' },
  { key: 'equity', label: 'Capital' },
];

/** What each kind of entry is called, the way accounting packages name their vouchers. */
const VOUCHER: Record<VoucherType, string> = {
  opening: 'Opening',
  sales: 'Sales',
  receipt: 'Receipt',
  income: 'Receipt',
  payment: 'Payment',
  contra: 'Contra',
  journal: 'Journal',
};

/** A balance with its side: debit balances are Dr, credit balances Cr. */
function DrCr({ v, className }: { v: number; className?: string }) {
  if (!v) return <span className={cn('tabular-nums text-slate-400', className)}>0.00</span>;
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {money(Math.abs(v))} <span className="text-xs font-medium text-slate-500">{v > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  );
}

const amt = (v: number) => (v ? money(v) : '');

/**
 * The ledger: every money record posted to its account by double entry, like an accounting package keeps it.
 * Pick an account on the left to see its entries with a running balance; the trial balance proves the books add up.
 */
export default function LedgerPage() {
  const state = usePeriod();
  const { params, set, period } = state;
  const tab = (params.get('tab') as Tab) || 'accounts';
  const account = params.get('account') || 'cash';
  const { can } = useAuth();
  const manage = can('expenses.manage');
  const [dialog, setDialog] = useState<'transfer' | 'opening' | null>(params.get('opening') === '1' ? 'opening' : null);
  const tb = useQuery({
    queryKey: ['books', 'accounts', period.from, period.to],
    queryFn: () => api.get<Envelope<TrialBalance>>('/books/accounts', { from: period.from, to: period.to }).then((r) => r.data),
    enabled: tab !== 'day-book',
  });

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Every rupee posted to its account by double entry: cash, bank, customers, sales, GST, and each income and expense head."
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {manage && (
              <>
                <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setDialog('opening')}>
                  Opening balances
                </Button>
                <Button variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setDialog('transfer')}>
                  Cash ↔ bank
                </Button>
              </>
            )}
          </>
        }
      />
      <Tabs
        className="mb-4 print:hidden"
        value={tab}
        onChange={(v) => set({ tab: v === 'accounts' ? undefined : v })}
        tabs={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'trial', label: 'Trial balance' },
          { value: 'day-book', label: 'Day book' },
        ]}
      />
      <Card padded={false} className="mb-5 print:hidden">
        <PeriodFilter state={state} branches={tab === 'day-book'} />
      </Card>
      {tab !== 'day-book' && tb.data && !tb.data.opening_date && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 print:hidden">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          Opening balances aren’t set, so Cash and Bank start from zero.
          {manage && (
            <button type="button" onClick={() => setDialog('opening')} className="font-medium underline">
              Set them now
            </button>
          )}
        </p>
      )}

      {tab === 'day-book' ? (
        <DayBook period={period} />
      ) : (
        <QueryState loading={tb.isLoading} error={tb.error} onRetry={tb.refetch}>
          {tb.data && (tab === 'trial' ? <TrialBalanceView tb={tb.data} onOpen={(code) => set({ tab: undefined, account: code })} /> : <AccountsView tb={tb.data} account={account} onPick={(code) => set({ account: code === 'cash' ? undefined : code })} period={period} manage={manage} />)}
        </QueryState>
      )}

      {dialog === 'transfer' && <TransferDialog onClose={() => setDialog(null)} />}
      {dialog === 'opening' && (
        <OpeningDialog
          onClose={() => {
            setDialog(null);
            set({ opening: undefined });
          }}
        />
      )}
    </>
  );
}

/** The chart of accounts on the left (with closing balances), the chosen account's ledger on the right. */
function AccountsView({ tb, account, onPick, period, manage }: { tb: TrialBalance; account: string; onPick: (code: string) => void; period: { from: string; to: string }; manage: boolean }) {
  const isCustomer = account.startsWith('customer:');
  const selected = isCustomer ? 'debtors' : account;
  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* On a phone the chart of accounts is a drop-down, so the entries come first. */}
      <label className="block lg:hidden print:hidden">
        <span className="mb-1 block text-sm font-medium text-slate-700">Account</span>
        <Select value={selected} onChange={(e) => onPick(e.target.value)}>
          {GROUPS.map((g) => {
            const rows = tb.accounts.filter((a) => a.group === g.key && (a.closing || a.debit || a.credit || ['cash', 'bank', 'debtors'].includes(a.code)));
            return rows.length ? (
              <optgroup key={g.key} label={g.label}>
                {rows.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </Select>
      </label>
      <nav aria-label="Accounts" className="hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-card print:hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
        {GROUPS.map((g) => {
          const rows = tb.accounts.filter((a) => a.group === g.key && (a.closing || a.debit || a.credit || ['cash', 'bank', 'debtors'].includes(a.code)));
          if (!rows.length) return null;
          return (
            <div key={g.key} className="mb-1">
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
              <ul>
                {rows.map((a) => (
                  <li key={a.code}>
                    <button
                      type="button"
                      onClick={() => onPick(a.code)}
                      aria-current={selected === a.code ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm leading-snug transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        selected === a.code ? 'bg-navy-900 text-white' : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span className="min-w-0 break-words">{a.name}</span>
                      <DrCr v={a.closing} className={cn('shrink-0 text-xs', selected === a.code && 'text-white [&>span]:text-white/70')} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="min-w-0">
        {account === 'debtors' ? <CustomersView period={period} onPick={onPick} /> : <LedgerView code={account} period={period} manage={manage} onBack={isCustomer ? () => onPick('debtors') : undefined} />}
      </div>
    </div>
  );
}

/** One account's ledger: brought forward, each entry against the account on the other side, carried forward. */
function LedgerView({ code, period, manage, onBack }: { code: string; period: { from: string; to: string }; manage: boolean; onBack?: () => void }) {
  const q = useQuery({
    queryKey: ['books', 'account-ledger', code, period.from, period.to],
    queryFn: () => api.get<Envelope<AccountLedger>>('/books/accounts/ledger', { account: code, from: period.from, to: period.to }).then((r) => r.data),
  });
  const [deleting, setDeleting] = useState<number | null>(null);
  const del = useApiMutation((id: number) => api.delete(`/books/transfers/${id}`), { invalidate: [['books']], onSuccess: () => setDeleting(null) });
  const l = q.data;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {l && (
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card print:border-0 print:shadow-none">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-navy-900 px-5 pb-4 pt-5">
            <div className="min-w-0">
              {onBack && (
                <button type="button" onClick={onBack} className="mb-1 text-xs font-medium text-brand-700 hover:underline print:hidden">
                  ← All customers
                </button>
              )}
              <p className="text-sm text-slate-500">Ledger account</p>
              <h2 className="text-2xl font-bold tracking-tight text-navy-900">{l.account.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {date(l.from)} to {date(l.to)}
                {l.account.note ? ` · ${l.account.note}` : ''}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-slate-500">Closing balance</p>
              <DrCr v={l.closing} className="text-2xl font-bold text-navy-900" />
            </div>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="w-full min-w-[15rem] px-3 py-2.5">Particulars</th>
                  <th className="px-3 py-2.5">Voucher</th>
                  <th className="px-3 py-2.5 text-right">Debit</th>
                  <th className="px-3 py-2.5 text-right">Credit</th>
                  <th className="px-5 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/50">
                  <td className="px-5 py-2.5 text-slate-500">{date(l.from)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-700" colSpan={2}>
                    Balance brought forward
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.opening > 0 ? money(l.opening) : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.opening < 0 ? money(-l.opening) : ''}</td>
                  <td className="px-5 py-2.5 text-right">
                    <DrCr v={l.opening} />
                  </td>
                </tr>
                {l.entries.map((e, i) => (
                  <tr key={i} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{date(e.date)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">
                        <span className="text-slate-400">{e.debit ? 'To ' : 'By '}</span>
                        {e.particulars}
                      </p>
                      <p className="text-xs text-slate-500">
                        <EntryLink e={e} />
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                      {VOUCHER[e.type]}
                      {e.number && <span className="block text-slate-500">{e.number}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{amt(e.debit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{amt(e.credit)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <DrCr v={e.balance} />
                        {manage && e.link.transfer_id && (
                          <button type="button" onClick={() => setDeleting(e.link.transfer_id!)} aria-label="Delete this cash ↔ bank entry" className="text-slate-300 hover:text-red-600 print:hidden">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {!l.entries.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                      Nothing was posted to this account in the period.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy-900 bg-slate-50 font-semibold">
                  <td className="px-5 py-3" colSpan={3}>
                    Total for the period
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(l.total_debit)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(l.total_credit)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-xs font-normal text-slate-500">Carried forward </span>
                    <DrCr v={l.closing} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => setDeleting(null)}
            title="Delete this cash ↔ bank entry?"
            message="Both the Cash and the Bank account will change."
            confirmLabel="Delete"
            loading={del.isPending}
            onConfirm={() => deleting !== null && del.mutate(deleting)}
          />
        </article>
      )}
    </QueryState>
  );
}

/** The entry's description, linked to the record it came from where there is a page for it. */
function EntryLink({ e }: { e: Entry }) {
  const to = e.link.invoice_id
    ? `/invoices/${e.link.invoice_id}`
    : e.link.cash_close_id
      ? `/accounts/cash-close/${e.link.cash_close_id}`
      : e.link.office_close_date
        ? `/accounts/register?day=${e.link.office_close_date}`
        : e.link.expense_id
          ? `/accounts/expenses?from=${e.date}&to=${e.date}`
          : e.link.income_id
            ? `/accounts/income?from=${e.date}&to=${e.date}`
            : null;
  return to ? (
    <Link to={to} className="hover:text-brand-700 hover:underline">
      {e.narration}
    </Link>
  ) : (
    <>{e.narration}</>
  );
}

/** The Customers account, one line per customer; open one to see their own ledger. */
function CustomersView({ period, onPick }: { period: { from: string; to: string }; onPick: (code: string) => void }) {
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['books', 'customer-accounts', period.from, period.to, search],
    queryFn: () => api.get<Envelope<{ rows: CustomerRow[]; total: number }>>('/books/accounts/customers', { from: period.from, to: period.to, search: search || undefined }).then((r) => r.data),
  });
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-navy-900 px-5 pb-4 pt-5">
        <div>
          <p className="text-sm text-slate-500">Ledger account</p>
          <h2 className="text-2xl font-bold tracking-tight text-navy-900">Customers (receivable)</h2>
          <p className="mt-0.5 text-sm text-slate-500">Each customer’s bills and payments. Open a customer to see their ledger.</p>
        </div>
        {q.data && (
          <div className="sm:text-right">
            <p className="text-sm text-slate-500">Customers owe in total</p>
            <DrCr v={q.data.total} className="text-2xl font-bold text-navy-900" />
          </div>
        )}
      </header>
      <div className="border-b border-slate-100 px-5 py-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Customer name or phone" className="sm:w-72" />
      </div>
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data && !q.data.rows.length ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={search ? 'No customer matches' : 'No customer accounts in this period'} message="A customer gets an account once they are billed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">At the start</th>
                  <th className="px-3 py-2.5 text-right">Billed</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-5 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data?.rows.map((r) => (
                  <tr key={r.id} onClick={() => onPick(`customer:${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <button type="button" className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={() => onPick(`customer:${r.id}`)}>
                        {r.name}
                      </button>
                      {r.phone && <p className="text-xs tabular-nums text-slate-500">{r.phone}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <DrCr v={r.opening} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{amt(r.debit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{amt(r.credit)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        <DrCr v={r.closing} className={r.closing > 0 ? 'font-semibold text-red-700' : undefined} />
                        <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </article>
  );
}

/** Every account's opening, debits, credits and closing, by group, with the proof that both sides agree. */
function TrialBalanceView({ tb, onOpen }: { tb: TrialBalance; onOpen: (code: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = useMemo(() => tb.accounts.filter((a) => all || a.opening || a.debit || a.credit || a.closing), [tb, all]);
  const balanced = tb.totals.closing_dr === tb.totals.closing_cr && tb.totals.debit === tb.totals.credit;
  const profit = tb.profit.income - tb.profit.expenses;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Income in the period" value={tb.profit.income} note="Sales before GST, and other income" />
        <Figure label="Expenses in the period" value={tb.profit.expenses} note="Every expense head" />
        <Figure label={profit >= 0 ? 'Profit (income − expenses)' : 'Loss (expenses − income)'} value={Math.abs(profit)} tone={profit >= 0 ? 'text-emerald-700' : 'text-red-700'} note="Sales counted on the bill date" />
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-navy-900 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Trial balance</h2>
            <p className="text-sm text-slate-500">
              {date(tb.from)} to {date(tb.to)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
              {balanced ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Scale className="h-3.5 w-3.5" aria-hidden />}
              {balanced ? 'Debits equal credits' : 'Does not balance'}
            </span>
            <label className="flex items-center gap-2 text-sm text-slate-600 print:hidden">
              <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={all} onChange={(e) => setAll(e.target.checked)} />
              Show empty accounts
            </label>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-5 py-2.5 text-left">Account</th>
                <th className="px-3 py-2.5 text-right">Opening</th>
                <th className="px-3 py-2.5 text-right">Debit</th>
                <th className="px-3 py-2.5 text-right">Credit</th>
                <th className="px-3 py-2.5 text-right">Closing Dr</th>
                <th className="px-5 py-2.5 text-right">Closing Cr</th>
              </tr>
            </thead>
            {GROUPS.map((g) => {
              const rows = shown.filter((a) => a.group === g.key);
              if (!rows.length) return null;
              return (
                <tbody key={g.key} className="divide-y divide-slate-100">
                  <tr>
                    <th colSpan={6} className="bg-white px-5 pb-1 pt-4 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {g.label}
                    </th>
                  </tr>
                  {rows.map((a) => (
                    <tr key={a.code} className="hover:bg-slate-50">
                      <td className="px-5 py-2">
                        <button type="button" onClick={() => onOpen(a.code)} className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline">
                          {a.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DrCr v={a.opening} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{amt(a.debit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{amt(a.credit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.closing > 0 ? money(a.closing) : ''}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{a.closing < 0 ? money(-a.closing) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="border-t-2 border-navy-900 bg-slate-50 font-semibold">
                <td className="px-5 py-3">Total</td>
                <td className="px-3 py-3 text-right text-xs font-normal text-slate-500">
                  {money(tb.totals.opening_dr)} Dr / {money(tb.totals.opening_cr)} Cr
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tb.totals.debit)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tb.totals.credit)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tb.totals.closing_dr)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{money(tb.totals.closing_cr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
      <p className="text-xs text-slate-500">
        Sales are counted on the bill date, as in an accounting package. The <Link to="/accounts/profit-loss" className="text-brand-700 hover:underline">Profit &amp; loss</Link> page counts money when it is actually received.
      </p>
    </div>
  );
}

function Figure({ label, value, note, tone = 'text-navy-900' }: { label: string; value: number; note: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-card">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-bold tracking-tight tabular-nums', tone)}>{money(value)}</p>
      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
    </div>
  );
}

