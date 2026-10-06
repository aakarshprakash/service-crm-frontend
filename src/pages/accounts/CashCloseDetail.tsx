import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Landmark, ShieldCheck } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, toMajor, toMinor, today } from '@/lib/format';
import type { CashClose, CashSummary } from '@/lib/types';
import { Button, Card, DataTable, Field, Input, Modal, PageHeader, QueryState, Select, Textarea } from '@/components/ui';
import { MethodLabel, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

export default function CashCloseDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['cash-close', id], queryFn: () => api.get<Envelope<{ close: CashClose; payments: CashSummary['payments'] }>>(`/accounts/cash-close/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<'verify' | 'deposit' | null>(null);
  const c = q.data?.close;
  const techMismatch = c && c.amount_confirmed !== c.expected_in_hand;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {c && (
        <>
          <PageHeader
            back={
              <Link to="/accounts/cash-close" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Cash close
              </Link>
            }
            title={
              <span className="flex items-center gap-3">
                {c.technician?.name} · {date(c.close_date)} <StatusBadge status={c.status} />
              </span>
            }
            description={`Submitted ${dateTime(c.submitted_at)}${c.force_closed ? ' by admin on behalf of the technician' : ''}${c.branch ? ` · ${c.branch.name}` : ''}`}
            actions={
              <>
                {c.status === 'submitted' && (
                  <Hint text="Confirms the cash and cheques you physically received from the technician. If your count differs from what was expected, you must add a remark explaining the difference.">
                    <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setDialog('verify')}>
                      Verify
                    </Button>
                  </Hint>
                )}
                {c.status !== 'closed' && c.closing_balance > 0 && (
                  <Hint text="Logs money deposited to the bank or handed to the office from this close. It can’t be more than the remaining balance, and it only works on the technician’s latest close.">
                    <Button variant="secondary" icon={<Landmark className="h-4 w-4" />} onClick={() => setDialog('deposit')}>
                      Record deposit
                    </Button>
                  </Hint>
                )}
              </>
            }
          />

          {techMismatch && (
            <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                Technician declared <strong>{money(c.amount_confirmed)}</strong> against an expected <strong>{money(c.expected_in_hand)}</strong> (difference {money(c.amount_confirmed - c.expected_in_hand)}).
                {c.technician_remarks && <p className="mt-1">Remark: “{c.technician_remarks}”</p>}
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Reconciliation">
              <dl className="space-y-2 text-sm">
                <Line k="Opening (carried forward)" v={c.opening_balance} />
                <Line k="Cash collected" v={c.total_cash_collected} />
                <Line k="Cheques collected" v={c.total_cheque_collected} />
                <Line k="Expected in hand" v={c.expected_in_hand} strong />
                <Line k="Declared by technician" v={c.amount_confirmed} />
                <Line k="Verified count" v={c.amount_verified} />
                <Line k="Discrepancy" v={c.discrepancy_amount} red={c.discrepancy_amount !== 0} />
                <Line k="Deposited" v={c.total_deposited} />
                <Line k="Carry forward" v={c.closing_balance} strong />
                <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">UPI / bank received (no hand-over): {money(c.total_digital_collected)}</div>
              </dl>
              {c.discrepancy_remarks && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Accountant: {c.discrepancy_remarks}</p>}
              {c.verifier && <p className="mt-2 text-xs text-slate-500">Verified by {c.verifier.name} · {dateTime(c.verified_at)}</p>}
            </Card>

            <div className="space-y-6 lg:col-span-2">
              <Card title={`Collections (${q.data!.payments.length})`} padded={false}>
                <DataTable
                  rows={q.data!.payments}
                  empty={<p className="px-5 py-6 text-sm text-slate-500">No collections in this close (carry-forward only).</p>}
                  columns={[
                    { key: 'time', header: 'Time', render: (p) => dateTime(p.paid_at) },
                    { key: 'receipt', header: 'Receipt', render: (p) => p.receipt_number },
                    { key: 'cust', header: 'Customer / call', hideOnMobile: true, render: (p) => `${p.customer ?? ''} · ${p.call_id ?? ''}` },
                    { key: 'method', header: 'Method', render: (p) => <MethodLabel method={p.method} /> },
                    { key: 'ref', header: 'Ref.', hideOnMobile: true, render: (p) => p.reference_no ?? '—' },
                    { key: 'amt', header: 'Amount', render: (p) => money(p.amount), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </Card>
              <Card title="Deposits" padded={false}>
                <DataTable
                  rows={c.deposits}
                  empty={<p className="px-5 py-6 text-sm text-slate-500">No deposits recorded yet.</p>}
                  columns={[
                    { key: 'date', header: 'Date', render: (d) => date(d.deposit_date) },
                    { key: 'to', header: 'To', render: (d) => (d.deposited_to === 'bank' ? 'Bank' : 'Office') },
                    { key: 'ref', header: 'Reference', render: (d) => d.reference_no ?? '—' },
                    { key: 'by', header: 'Recorded by', hideOnMobile: true, render: (d) => d.recorder?.name },
                    { key: 'amt', header: 'Amount', render: (d) => money(d.amount), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </Card>
            </div>
          </div>

          {dialog === 'verify' && <VerifyDialog close={c} onClose={() => setDialog(null)} />}
          {dialog === 'deposit' && <DepositDialog close={c} onClose={() => setDialog(null)} />}
        </>
      )}
    </QueryState>
  );
}

function Line({ k, v, strong, red }: { k: string; v: number | null; strong?: boolean; red?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-slate-900' : ''} ${red ? 'font-semibold text-red-700' : ''}`}>{v === null ? '—' : money(v)}</dd>
    </div>
  );
}

function VerifyDialog({ close, onClose }: { close: CashClose; onClose: () => void }) {
  const [amount, setAmount] = useState(toMajor(close.amount_confirmed) || '0');
  const [remarks, setRemarks] = useState('');
  const diff = toMinor(amount) - close.expected_in_hand;
  const m = useApiMutation(() => api.patch(`/accounts/cash-close/${close.id}/verify`, { amount_verified: toMinor(amount), discrepancy_remarks: remarks || null }), {
    invalidate: [['cash-close', String(close.id)], ['cash-closes'], ['cash-overview']],
    toastValidation: false,
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Verify cash close"
      description={`Expected in hand: ${money(close.expected_in_hand)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Mark verified
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount counted / received" required error={fieldError(m.error, 'amount_verified')}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
        </Field>
        {diff !== 0 && (
          <p className={`rounded-lg p-2 text-sm ${diff < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
            {diff < 0 ? 'Shortfall' : 'Excess'} of {money(Math.abs(diff))} will be recorded as a discrepancy.
          </p>
        )}
        <Field label="Remarks" required={diff !== 0} error={fieldError(m.error, 'discrepancy_remarks')}>
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

function DepositDialog({ close, onClose }: { close: CashClose; onClose: () => void }) {
  const [form, setForm] = useState({ amount: toMajor(close.closing_balance), deposited_to: 'bank', reference_no: '', deposit_date: today(), remarks: '' });
  const m = useApiMutation(() => api.post(`/accounts/cash-close/${close.id}/deposit`, { ...form, amount: toMinor(form.amount), reference_no: form.reference_no || null }), {
    invalidate: [['cash-close', String(close.id)], ['cash-closes'], ['cash-overview']],
    toastValidation: false,
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Record deposit"
      description={`Cash still with ${close.technician?.name}: ${money(close.closing_balance)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Save deposit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={fieldError(m.error, 'amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Deposited to" required>
          <Select value={form.deposited_to} onChange={(e) => setForm({ ...form, deposited_to: e.target.value })}>
            <option value="bank">Bank</option>
            <option value="office">Office cash</option>
          </Select>
        </Field>
        <Field label="Reference no." required={form.deposited_to === 'bank'} error={fieldError(m.error, 'reference_no')}>
          <Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
        </Field>
        <Field label="Date" required error={fieldError(m.error, 'deposit_date')}>
          <Input type="date" max={today()} value={form.deposit_date} onChange={(e) => setForm({ ...form, deposit_date: e.target.value })} />
        </Field>
        <Field label="Remarks" className="sm:col-span-2">
          <Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
