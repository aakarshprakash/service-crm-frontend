import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Landmark, Settings2, Trash2 } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Named } from '@/lib/types';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, StatCard, Tabs, Textarea } from '@/components/ui';
import { MethodLabel } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import { PeriodFilter, usePeriod } from '@/components/period';

type Book = 'cash' | 'bank';
interface LedgerEntry { at: string; type: 'receipt' | 'expense' | 'transfer'; ref: string | null; particulars: string; method: string; link: { invoice_id?: number; expense_id?: number; transfer_id?: number }; in: number; out: number; balance: number }
interface Ledger { book: Book; from: string; to: string; opening: number; entries: LedgerEntry[]; total_in: number; total_out: number; closing: number; opening_settings: { date: string | null; cash: number; bank: number } }
interface Transfer { id: number; transfer_date: string; direction: 'cash_to_bank' | 'bank_to_cash'; amount: number; reference_no: string | null; notes: string | null; creator?: Named | null }

/** Cash book and bank book (with running balances) and contra entries between them. */
export default function CashBankPage() {
  const state = usePeriod();
  const { params, set } = state;
  const tab = (params.get('book') as Book | 'transfers') || 'cash';
  const { can } = useAuth();
  const manage = can('expenses.manage');
  const [transfer, setTransfer] = useState(false);
  const [opening, setOpening] = useState(params.get('opening') === '1');

  return (
    <>
      <PageHeader
        title="Cash & bank"
        description="Running balances of office cash and your bank / UPI account. Receipts and expenses post here automatically by payment method."
        actions={
          manage && (
            <>
              <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setOpening(true)}>
                Opening balances
              </Button>
              <Hint text="Records cash deposited into the bank (or withdrawn from it). It moves money between the two books without counting as income or expense.">
                <Button icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setTransfer(true)}>
                  Deposit / withdraw
                </Button>
              </Hint>
            </>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => set({ book: v === 'cash' ? undefined : v })}
        tabs={[
          { value: 'cash', label: 'Cash book' },
          { value: 'bank', label: 'Bank book' },
          { value: 'transfers', label: 'Deposits & withdrawals' },
        ]}
      />
      <Card padded={false} className="mb-6">
        <PeriodFilter state={state} branches={false} />
      </Card>
      {tab === 'transfers' ? <Transfers period={state.period} manage={manage} /> : <LedgerView book={tab} period={state.period} />}
      {transfer && <TransferDialog onClose={() => setTransfer(false)} />}
      {opening && <OpeningDialog onClose={() => { setOpening(false); set({ opening: undefined }); }} />}
    </>
  );
}

function LedgerView({ book, period }: { book: Book; period: { from: string; to: string } }) {
  const q = useQuery({ queryKey: ['books', 'ledger', book, period.from, period.to], queryFn: () => api.get<Envelope<Ledger>>('/books/ledger', { book, from: period.from, to: period.to }).then((r) => r.data) });
  const l = q.data;
  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {l && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Opening balance" value={money(l.opening)} tone="slate" />
            <StatCard label={book === 'cash' ? 'Cash received' : 'Received in bank'} value={money(l.total_in)} tone="green" />
            <StatCard label={book === 'cash' ? 'Cash paid out' : 'Paid from bank'} value={money(l.total_out)} tone="amber" />
            <StatCard label="Closing balance" value={money(l.closing)} tone={l.closing < 0 ? 'red' : 'blue'} icon={<Landmark className="h-5 w-5" />} />
          </div>
          {!l.opening_settings.date && <p className="mb-3 text-sm text-amber-700">Opening balances aren’t set, so balances start from zero.</p>}
          <Card padded={false}>
            <DataTable
              rows={l.entries.map((e, i) => ({ ...e, id: i }))}
              loading={q.isFetching}
              empty={<EmptyState title="No entries in this period" message={book === 'cash' ? 'Cash receipts, cash expenses and deposits appear here.' : 'UPI, cheque, bank transfer and online receipts, non-cash expenses and deposits appear here.'} />}
              columns={[
                { key: 'd', header: 'Date', render: (e) => <span className="whitespace-nowrap">{date(e.at.slice(0, 10))}</span> },
                {
                  key: 'p',
                  header: 'Particulars',
                  render: (e) => (
                    <div>
                      <p className="font-medium text-slate-900">
                        {e.link.invoice_id ? (
                          <Link to={`/invoices/${e.link.invoice_id}`} className="hover:underline">
                            {e.particulars}
                          </Link>
                        ) : (
                          e.particulars
                        )}
                      </p>
                      <p className="text-xs capitalize text-slate-500">
                        {e.type}
                        {e.ref && ` · ${e.ref}`}
                      </p>
                    </div>
                  ),
                },
                { key: 'm', header: 'Mode', hideOnMobile: true, render: (e) => (e.method === 'contra' ? 'Contra' : <MethodLabel method={e.method} />) },
                { key: 'in', header: 'Receipts', className: 'text-right tabular-nums text-emerald-700', headerClassName: 'text-right', render: (e) => (e.in ? money(e.in) : '') },
                { key: 'out', header: 'Payments', className: 'text-right tabular-nums text-red-700', headerClassName: 'text-right', render: (e) => (e.out ? money(e.out) : '') },
                { key: 'b', header: 'Balance', className: 'text-right tabular-nums font-medium', headerClassName: 'text-right', render: (e) => <span className={cn(e.balance < 0 && 'text-red-700')}>{money(e.balance)}</span> },
              ]}
            />
            <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-slate-100 px-5 py-3 text-sm">
              <span>
                Receipts <strong className="tabular-nums">{money(l.total_in)}</strong>
              </span>
              <span>
                Payments <strong className="tabular-nums">{money(l.total_out)}</strong>
              </span>
              <span>
                Closing <strong className="tabular-nums">{money(l.closing)}</strong>
              </span>
            </div>
          </Card>
        </>
      )}
    </QueryState>
  );
}

function Transfers({ period, manage }: { period: { from: string; to: string }; manage: boolean }) {
  const q = useQuery({ queryKey: ['books', 'transfers', period.from, period.to], queryFn: () => api.get<Paginated<Transfer>>('/books/transfers', { from: period.from, to: period.to, per_page: 50 }) });
  const [deleting, setDeleting] = useState<Transfer | null>(null);
  const del = useApiMutation((t: Transfer) => api.delete(`/books/transfers/${t.id}`), { invalidate: [['books']], onSuccess: () => setDeleting(null) });
  return (
    <Card padded={false}>
      <DataTable
        rows={q.data?.data}
        loading={q.isFetching}
        empty={<EmptyState title="No deposits or withdrawals" message="Use Deposit / withdraw when you bank cash or draw cash from the bank." />}
        columns={[
          { key: 'd', header: 'Date', render: (t) => date(t.transfer_date) },
          { key: 'dir', header: 'Entry', render: (t) => (t.direction === 'cash_to_bank' ? 'Cash deposited in bank' : 'Cash withdrawn from bank') },
          { key: 'ref', header: 'Reference / notes', hideOnMobile: true, render: (t) => [t.reference_no, t.notes].filter(Boolean).join(' · ') || '—' },
          { key: 'by', header: 'By', hideOnMobile: true, render: (t) => t.creator?.name ?? '—' },
          { key: 'a', header: 'Amount', className: 'text-right tabular-nums font-medium', headerClassName: 'text-right', render: (t) => money(t.amount) },
          ...(manage
            ? [
                {
                  key: 'x',
                  header: '',
                  className: 'w-10',
                  render: (t: Transfer) => (
                    <Button size="sm" variant="ghost" className="text-red-600" aria-label="Delete" onClick={() => setDeleting(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this entry?" message="Both the cash book and the bank book will be updated." confirmLabel="Delete" loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} />
    </Card>
  );
}

function TransferDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ transfer_date: today(), direction: 'cash_to_bank', amount: '', reference_no: '', notes: '' });
  const m = useApiMutation(
    () => api.post('/books/transfers', { ...form, amount: toMinor(form.amount), reference_no: form.reference_no || null, notes: form.notes || null }),
    { invalidate: [['books']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal open onClose={onClose} title="Deposit or withdraw cash" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry" className="sm:col-span-2">
          <Select value={form.direction} onChange={(ev) => setForm({ ...form, direction: ev.target.value })}>
            <option value="cash_to_bank">Cash deposited into bank</option>
            <option value="bank_to_cash">Cash withdrawn from bank</option>
          </Select>
        </Field>
        <Field label="Date" required error={e('transfer_date')}>
          <Input type="date" max={today()} value={form.transfer_date} onChange={(ev) => setForm({ ...form, transfer_date: ev.target.value })} />
        </Field>
        <Field label="Amount" required error={e('amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(ev) => setForm({ ...form, amount: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Deposit slip / reference" error={e('reference_no')} className="sm:col-span-2">
          <Input value={form.reference_no} maxLength={100} onChange={(ev) => setForm({ ...form, reference_no: ev.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function OpeningDialog({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['books', 'ledger', 'opening'], queryFn: () => api.get<Envelope<Ledger>>('/books/ledger', { book: 'cash', from: today(), to: today() }).then((r) => r.data.opening_settings) });
  return (
    <Modal open onClose={onClose} title="Opening balances" description="What you had in cash and in the bank on the day you start keeping books in Servon. Everything after that date is added automatically.">
      {q.data ? <OpeningForm initial={q.data} onClose={onClose} /> : <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}
    </Modal>
  );
}

function OpeningForm({ initial, onClose }: { initial: { date: string | null; cash: number; bank: number }; onClose: () => void }) {
  const [form, setForm] = useState({ date: initial.date ?? today().slice(0, 8) + '01', cash: toMajor(initial.cash) || '0', bank: toMajor(initial.bank) || '0' });
  const m = useApiMutation(() => api.put('/books/opening', { date: form.date, cash: toMinor(form.cash), bank: toMinor(form.bank) }), { invalidate: [['books']], toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <div className="space-y-4">
      <Field label="As on date" required error={e('date')}>
        <Input type="date" value={form.date} onChange={(ev) => setForm({ ...form, date: ev.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cash in hand" error={e('cash')}>
          <Input inputMode="decimal" value={form.cash} onChange={(ev) => setForm({ ...form, cash: ev.target.value.replace(/[^\d.-]/g, '') })} />
        </Field>
        <Field label="Bank balance" error={e('bank')}>
          <Input inputMode="decimal" value={form.bank} onChange={(ev) => setForm({ ...form, bank: ev.target.value.replace(/[^\d.-]/g, '') })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
          Save
        </Button>
      </div>
    </div>
  );
}
