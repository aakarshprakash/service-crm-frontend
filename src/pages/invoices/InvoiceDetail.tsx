import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, HandCoins, QrCode, ReceiptText, Send } from 'lucide-react';
import { UpiQrDialog } from '@/components/upi';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { date, dateTime, money, qty, toMajor, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/lib/types';
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, QueryState, Select, Textarea, toast } from '@/components/ui';
import { MethodLabel, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import { HardDeleteButton, useHardDelete } from '@/components/HardDelete';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const hardDelete = useHardDelete();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Envelope<Invoice>>(`/invoices/${id}`).then((r) => r.data) });
  const [paying, setPaying] = useState(false);
  const [showUpi, setShowUpi] = useState(false);
  const [changingType, setChangingType] = useState(false);
  const { data: lookups } = useLookups();
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
                {inv.invoice_number} <StatusBadge status={inv.payment_status} /> <Badge tone={inv.is_gst ? 'blue' : 'slate'}>{!inv.is_gst ? 'Non-GST bill' : inv.prices_include_gst === false ? 'GST exclusive' : 'GST inclusive'}</Badge> {inv.is_credit && inv.balance_amount > 0 && <Badge tone="violet">Credit</Badge>}
              </span>
            }
            description={
              inv.source === 'walk_in'
                ? `Walk-in bill · ${date(inv.generated_at)}${inv.creator ? ` · billed by ${inv.creator.name}` : ''}${inv.branch ? ` · ${inv.branch.name}` : ''}`
                : `Generated ${date(inv.generated_at)} · Job ${inv.job?.crm_call_id}`
            }
            actions={
              <>
                {inv.source === 'walk_in' && <HardDeleteButton type="invoice" id={inv.id} label="Delete bill" onDeleted={() => navigate('/invoices', { replace: true })} />}
                {can('invoices.change_bill_type') && (inv.is_gst || lookups?.billing.gst_registered) && (
                  <Hint text="Make this a GST bill (with GST included in the prices, or added on top), or a non-GST bill. You see the new total before anything changes.">
                    <Button variant="secondary" icon={<ReceiptText className="h-4 w-4" />} onClick={() => setChangingType(true)}>
                      {inv.is_gst ? 'Change GST' : 'Make GST bill'}
                    </Button>
                  </Hint>
                )}
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
                    {inv.is_gst && <Tot k="Taxable value" v={inv.taxable_amount ?? 0} />}
                    {inv.is_gst && ((inv.igst_amount ?? 0) > 0
                      ? <Tot k="IGST" v={inv.igst_amount ?? 0} />
                      : (
                        <>
                          <Tot k="CGST" v={inv.cgst_amount ?? 0} />
                          <Tot k="SGST" v={inv.sgst_amount ?? 0} />
                        </>
                      ))}
                    <Tot k={inv.is_gst ? 'Total (incl. GST)' : 'Total'} v={inv.total_amount} bold />
                    <Tot k="Paid" v={inv.paid_amount} />
                    <Tot k="Balance due" v={inv.balance_amount} bold red={inv.balance_amount > 0} />
                  </tfoot>
                </table>
              </Card>

              {inv.is_gst && !!inv.gst_breakup?.summary.length && (
                <Card title="GST breakup" actions={inv.place_of_supply && <span className="text-xs text-slate-500">Place of supply: {inv.place_of_supply}</span>} padded={false}>
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-2 text-left font-semibold">HSN / SAC</th>
                        <th className="px-5 py-2 text-right font-semibold">GST %</th>
                        <th className="px-5 py-2 text-right font-semibold">Taxable</th>
                        {(inv.igst_amount ?? 0) > 0 ? <th className="px-5 py-2 text-right font-semibold">IGST</th> : (<><th className="px-5 py-2 text-right font-semibold">CGST</th><th className="px-5 py-2 text-right font-semibold">SGST</th></>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {inv.gst_breakup.summary.map((s, i) => (
                        <tr key={i}>
                          <td className="px-5 py-2">{s.hsn ?? '—'}</td>
                          <td className="px-5 py-2 text-right">{s.gst_rate}%</td>
                          <td className="px-5 py-2 text-right">{money(s.taxable)}</td>
                          {(inv.igst_amount ?? 0) > 0 ? <td className="px-5 py-2 text-right">{money(s.igst)}</td> : (<><td className="px-5 py-2 text-right">{money(s.cgst)}</td><td className="px-5 py-2 text-right">{money(s.sgst)}</td></>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {inv.customer_gstin && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">Customer GSTIN: <span className="font-medium text-slate-700">{inv.customer_gstin}</span></p>}
                </Card>
              )}

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
                    ...(hardDelete ? [{ key: 'del', header: '', className: 'text-right', render: (p: { id: number }) => <HardDeleteButton compact type="payment" id={p.id} label="Delete receipt permanently" /> }] : []),
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
          {changingType && <ChangeBillType invoice={inv} onClose={() => setChangingType(false)} />}
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

type BillKind = 'non_gst' | 'gst_inclusive' | 'gst_exclusive';
interface BillOption { is_gst: boolean; prices_include_gst: boolean; total: number; taxable: number; tax: number; paid: number; due: number; current: boolean }

const KINDS: { key: BillKind; title: string; text: string }[] = [
  { key: 'gst_inclusive', title: 'GST included in the prices', text: 'The prices already contain the GST. The total stays the same; the bill shows the tax inside it.' },
  { key: 'gst_exclusive', title: 'GST added on top', text: 'GST is added on top of the prices, so the total goes up and the customer owes the GST too.' },
  { key: 'non_gst', title: 'Non-GST bill', text: 'A plain bill with no GST shown.' },
];

/**
 * Choose what kind of bill this is: GST with the tax included in the prices, GST added on top, or non-GST.
 * Each choice shows the total and what is still due before anything is saved.
 */
function ChangeBillType({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['invoice', String(invoice.id), 'bill-types'],
    queryFn: () => api.get<Envelope<Partial<Record<BillKind, BillOption>>>>(`/invoices/${invoice.id}/bill-type`).then((r) => r.data),
  });
  const current = (Object.entries(q.data ?? {}) as [BillKind, BillOption][]).find(([, o]) => o.current)?.[0];
  const [picked, setPicked] = useState<BillKind | null>(null);
  const choice = picked ?? (current === 'non_gst' ? 'gst_inclusive' : current) ?? null;
  const option = choice ? q.data?.[choice] : undefined;
  const now = current ? q.data?.[current] : undefined;
  const m = useApiMutation((body: object) => api.post<{ message?: string }>(`/invoices/${invoice.id}/bill-type`, body), {
    invalidate: [['invoice', String(invoice.id)], ['invoices'], ['books']],
    onSuccess: onClose,
  });
  const moves = option && now ? option.total - now.total : 0;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="GST on this bill"
      description={`${invoice.invoice_number} · now ${!invoice.is_gst ? 'a non-GST bill' : invoice.prices_include_gst === false ? 'GST added on top' : 'GST included in the prices'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!option || option.current} onClick={() => option && m.mutate({ is_gst: option.is_gst, prices_include_gst: option.is_gst ? option.prices_include_gst : null })}>
            {option?.current ? 'No change' : choice === 'non_gst' ? 'Make non-GST' : invoice.is_gst ? 'Apply' : 'Make GST bill'}
          </Button>
        </>
      }
    >
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        <div className="space-y-2" role="radiogroup" aria-label="Kind of bill">
          {KINDS.filter((k) => q.data?.[k.key]).map((k) => {
            const o = q.data![k.key]!;
            const on = choice === k.key;
            return (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(k.key)}
                className={cn(
                  'flex w-full items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  on ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {k.title}
                    {o.current && <Badge tone="slate">Now</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{k.text}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-bold tabular-nums text-navy-900">{money(o.total)}</span>
                  <span className="block text-xs tabular-nums text-slate-500">{o.tax ? `incl. ${money(o.tax)} GST` : 'no GST'}</span>
                </span>
              </button>
            );
          })}
        </div>
        {option && !option.current && (
          <p className={cn('mt-4 rounded-lg p-3 text-sm', moves > 0 ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700')}>
            {moves > 0 ? (
              <>The total goes up by <strong>{money(moves)}</strong> to {money(option.total)}. </>
            ) : moves < 0 ? (
              <>The total goes down by <strong>{money(-moves)}</strong> to {money(option.total)}. </>
            ) : (
              <>The total stays <strong>{money(option.total)}</strong>. </>
            )}
            {option.paid > 0 ? <>Paid so far {money(option.paid)}; still due {money(option.due)}.</> : <>Still due {money(option.due)}.</>} If the customer already has a copy, give them the new one.
          </p>
        )}
      </QueryState>
    </Modal>
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
            label={form.method === 'cheque' ? 'Cheque number' : form.method === 'upi' ? 'UPI transaction ref. (optional)' : 'Bank reference / UTR'}
            required={form.method !== 'upi'}
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
