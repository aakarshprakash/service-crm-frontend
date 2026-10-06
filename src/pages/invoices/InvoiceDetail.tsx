import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, HandCoins, QrCode, Send } from 'lucide-react';
import { UpiQrDialog } from '@/components/upi';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, qty, toMajor, toMinor } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, QueryState, Select, Textarea, toast } from '@/components/ui';
import { MethodLabel, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Envelope<Invoice>>(`/invoices/${id}`).then((r) => r.data) });
  const [paying, setPaying] = useState(false);
  const [showUpi, setShowUpi] = useState(false);
  const remind = useApiMutation(() => api.post<{ message: string }>(`/invoices/${id}/remind`));
  const inv = q.data;
  const back = user?.role === 'technician' ? `/tech/jobs/${inv?.job_id ?? ''}` : '/invoices';
  const canCollect = inv && inv.balance_amount > 0 && (can('payments.record') || user?.role === 'technician');

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {inv && (
        <>
          <PageHeader
            back={
              <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                {inv.invoice_number} <StatusBadge status={inv.payment_status} /> {inv.is_credit && inv.balance_amount > 0 && <Badge tone="violet">Credit</Badge>}
              </span>
            }
            description={
              inv.source === 'walk_in'
                ? `Walk-in bill · ${date(inv.generated_at)}${inv.creator ? ` · billed by ${inv.creator.name}` : ''}${inv.branch ? ` · ${inv.branch.name}` : ''}`
                : `Generated ${date(inv.generated_at)} · Job ${inv.job?.crm_call_id}`
            }
            actions={
              <>
                <Hint text="Downloads the invoice as a PDF, with your company details and logo, to print or share.">
                  <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => download(`/invoices/${inv.id}/pdf`, `${inv.invoice_number}.pdf`).catch((e) => toast.error(e.message))}>
                    PDF
                  </Button>
                </Hint>
                {inv.pay_link && inv.balance_amount > 0 && (
                  <>
                    <Hint text="Copies the online payment link so you can paste it into a message to the customer yourself.">
                      <Button
                        variant="secondary"
                        icon={<Copy className="h-4 w-4" />}
                        onClick={() => navigator.clipboard.writeText(inv.pay_link!).then(() => toast.success('Payment link copied'))}
                      >
                        Copy link
                      </Button>
                    </Hint>
                    <Hint text="Sends the customer an SMS / WhatsApp message (whichever is switched on in Settings) with the balance due and a link to pay online.">
                      <Button variant="secondary" icon={<Send className="h-4 w-4" />} loading={remind.isPending} onClick={() => remind.mutate(undefined)}>
                        Send reminder
                      </Button>
                    </Hint>
                  </>
                )}
                {inv.balance_amount > 0 && (
                  <Hint text="Shows a UPI QR code for the balance. The customer scans it with any UPI app; record the payment once it’s credited.">
                    <Button variant="secondary" icon={<QrCode className="h-4 w-4" />} onClick={() => setShowUpi(true)}>
                      UPI QR
                    </Button>
                  </Hint>
                )}
                {canCollect && (
                  <Hint text="Records money received for this invoice by cash, UPI, cheque or bank transfer. A receipt number is created and the balance goes down straight away.">
                    <Button icon={<HandCoins className="h-4 w-4" />} onClick={() => setPaying(true)}>
                      Record payment
                    </Button>
                  </Hint>
                )}
              </>
            }
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Charges" padded={false}>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-2 text-left font-semibold">Description</th>
                      <th className="px-5 py-2 text-right font-semibold">Qty</th>
                      <th className="px-5 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inv.job?.visits?.map((v) => (
                      <VisitRows key={v.id} v={v} />
                    ))}
                    {inv.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-5 py-2.5">
                          {it.description}
                          {it.type === 'part' && <span className="text-xs text-slate-500"> @ {money(it.unit_price)}</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {qty(it.quantity)} {it.item?.unit_of_measure}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{money(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 text-sm">
                    <Tot k="Total service charge" v={inv.total_service_charge} />
                    <Tot k="Total spare charge" v={inv.total_spare_charge} />
                    {inv.discount_amount > 0 && <Tot k="Discount" v={-inv.discount_amount} />}
                    <Tot k="Total" v={inv.total_amount} bold />
                    <Tot k="Paid" v={inv.paid_amount} />
                    <Tot k="Balance due" v={inv.balance_amount} bold red={inv.balance_amount > 0} />
                  </tfoot>
                </table>
              </Card>

              <Card title="Payments" padded={false}>
                <DataTable
                  rows={inv.payments}
                  empty={<p className="px-5 py-6 text-sm text-slate-500">No payments recorded yet.</p>}
                  columns={[
                    { key: 'date', header: 'Date', render: (p) => dateTime(p.paid_at) },
                    { key: 'method', header: 'Method', render: (p) => <MethodLabel method={p.method} /> },
                    { key: 'ref', header: 'Reference', hideOnMobile: true, render: (p) => p.reference_no ?? '—' },
                    { key: 'receipt', header: 'Receipt', render: (p) => p.receipt_number ?? '—' },
                    { key: 'by', header: 'Collected by', hideOnMobile: true, render: (p) => p.collector?.name ?? 'Office' },
                    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                    { key: 'amt', header: 'Amount', render: (p) => money(p.amount), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </Card>
            </div>
            <div className="space-y-6">
              <Card title="Bill to">
                <p className="font-medium">{inv.customer?.name}</p>
                <p className="text-sm text-slate-600">{inv.customer?.phone}</p>
                <p className="text-sm text-slate-600">{[inv.customer?.address, inv.customer?.city].filter(Boolean).join(', ')}</p>
                {user?.role !== 'technician' && inv.job_id && (
                  <Link to={`/jobs/${inv.job_id}`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
                    View job {inv.job?.crm_call_id} →
                  </Link>
                )}
              </Card>
              {inv.notes && (
                <Card title="Notes">
                  <p className="whitespace-pre-line text-sm text-slate-700">{inv.notes}</p>
                </Card>
              )}
            </div>
          </div>
          <RecordPayment invoice={inv} open={paying} onClose={() => setPaying(false)} technician={user?.role === 'technician'} />
          <UpiQrDialog open={showUpi} onClose={() => setShowUpi(false)} amount={inv.balance_amount} note={`Invoice ${inv.invoice_number}`} branchId={inv.branch?.id} />
        </>
      )}
    </QueryState>
  );
}

function VisitRows({ v }: { v: NonNullable<NonNullable<Invoice['job']>['visits']>[number] }) {
  const usageTotal = (v.inventory_usage ?? []).reduce((a, u) => a + u.total_price, 0);
  return (
    <>
      {v.labour_charge > 0 && (
        <tr>
          <td className="px-5 py-2.5">
            Service charge {v.action_taken && `– ${v.action_taken.name}`}
            <p className="text-xs text-slate-500">
              {date(v.start_time)} · {v.technician?.name}
            </p>
          </td>
          <td className="px-5 py-2.5 text-right">1</td>
          <td className="px-5 py-2.5 text-right tabular-nums">{money(v.labour_charge)}</td>
        </tr>
      )}
      {v.inventory_usage?.map((u) => (
        <tr key={u.id}>
          <td className="px-5 py-2.5">
            {u.item?.name} <span className="text-xs text-slate-500">({u.item?.code}) @ {money(u.unit_price)}</span>
          </td>
          <td className="px-5 py-2.5 text-right">
            {qty(u.quantity)} {u.item?.unit_of_measure}
          </td>
          <td className="px-5 py-2.5 text-right tabular-nums">{money(u.total_price)}</td>
        </tr>
      ))}
      {v.spare_charge !== usageTotal && (
        <tr>
          <td className="px-5 py-2.5">Spare charge adjustment</td>
          <td className="px-5 py-2.5 text-right">–</td>
          <td className="px-5 py-2.5 text-right tabular-nums">{money(v.spare_charge - usageTotal)}</td>
        </tr>
      )}
    </>
  );
}

function Tot({ k, v, bold, red }: { k: string; v: number; bold?: boolean; red?: boolean }) {
  return (
    <tr>
      <td className="px-5 py-1.5 text-right text-slate-500" colSpan={2}>
        {k}
      </td>
      <td className={`px-5 py-1.5 text-right tabular-nums ${bold ? 'font-semibold text-slate-900' : ''} ${red ? 'text-red-700' : ''}`}>{money(v)}</td>
    </tr>
  );
}

/** Offline collection: cash / UPI / cheque / bank transfer, with receipt number generated server-side. */
export function RecordPayment({ invoice, open, onClose, technician }: { invoice: Invoice; open: boolean; onClose: () => void; technician?: boolean }) {
  const [form, setForm] = useState({ amount: toMajor(invoice.balance_amount), method: 'cash', reference_no: '', remarks: '' });
  const needsRef = form.method !== 'cash';
  const m = useApiMutation(
    () =>
      api.post(technician ? `/invoices/${invoice.id}/collect` : `/invoices/${invoice.id}/pay`, {
        amount: toMinor(form.amount),
        method: form.method,
        reference_no: form.reference_no || null,
        remarks: form.remarks || null,
      }),
    { invalidate: [['invoice', String(invoice.id)], ['invoices'], ['job'], ['tech-job']], toastValidation: false, onSuccess: onClose },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Balance due ${money(invoice.balance_amount)}. A receipt number is generated automatically.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={fieldError(m.error, 'amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Method" required error={fieldError(m.error, 'method')}>
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </Field>
        {needsRef && (
          <Field
            label={form.method === 'cheque' ? 'Cheque number' : form.method === 'upi' ? 'UPI transaction ref.' : 'Bank reference / UTR'}
            required
            className="sm:col-span-2"
            error={fieldError(m.error, 'reference_no')}
          >
            <Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} maxLength={100} />
          </Field>
        )}
        {!technician && (
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} maxLength={500} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
