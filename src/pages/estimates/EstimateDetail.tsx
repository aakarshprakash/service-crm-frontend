import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Copy, CopyPlus, Download, MessageCircle, Pencil, RotateCcw, Send, Trash2, Wrench, XCircle } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Estimate } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, Field, Modal, PageHeader, QueryState, Textarea, toast } from '@/components/ui';
import { EstimateStatusBadge, estimateState, whatsAppLink } from './estimateParts';

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'border-t border-slate-100 pt-2 text-base font-semibold text-slate-900')}>
      <span className={cn('shrink-0', !strong && 'text-slate-500')}>{k}</span>
      <span className="min-w-0 break-words text-right tabular-nums text-slate-900">{v}</span>
    </div>
  );
}

/** One estimate: what it covers, where it stands, and the next step with the customer. */
export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['estimate', id], queryFn: () => api.get<Envelope<Estimate>>(`/estimates/${id}`).then((r) => r.data) });
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const e = q.data;
  const manage = can('estimates.manage');
  const invalidate = [['estimate', String(id)], ['estimates']];

  const status = useApiMutation((s: Estimate['status']) => api.post(`/estimates/${id}/status`, { status: s }), { invalidate });
  const copy = useApiMutation(() => api.post<Envelope<Estimate>>(`/estimates/${id}/duplicate`), { invalidate: [['estimates']], onSuccess: (r) => navigate(`/estimates/${r.data.id}/edit`) });
  const remove = useApiMutation(() => api.delete(`/estimates/${id}`), { invalidate: [['estimates']], onSuccess: () => navigate('/estimates', { replace: true }) });

  /** Sharing is how an estimate gets sent: a draft becomes "sent" the moment it is shared. */
  const share = (how: 'whatsapp' | 'link') => {
    if (!e) return;
    if (how === 'whatsapp') window.open(whatsAppLink(e, user?.tenant?.name), '_blank', 'noopener');
    else navigator.clipboard.writeText(e.share_url ?? '').then(() => toast.success('Link copied. Paste it in a message to the customer.'));
    if (e.status === 'draft' && manage) status.mutate('sent');
  };

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {e && (
        <>
          <PageHeader
            back={
              <Link to="/estimates" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Estimates
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                Estimate {e.estimate_number} <EstimateStatusBadge estimate={e} /> {e.is_gst && <Badge tone="blue">With GST</Badge>}
              </span>
            }
            description={`${date(e.estimate_date)}${e.creator ? ` · made by ${e.creator.name}` : ''}${e.valid_until ? ` · valid until ${date(e.valid_until)}` : ''}`}
            actions={
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => download(`/estimates/${e.id}/pdf`, `${e.estimate_number}.pdf`).catch((err) => toast.error(err.message))}>
                  PDF
                </Button>
                {manage && (
                  <Button variant="secondary" icon={<CopyPlus className="h-4 w-4" />} loading={copy.isPending} onClick={() => copy.mutate(undefined)}>
                    Copy
                  </Button>
                )}
                {manage && e.status !== 'approved' && (
                  <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
                    Delete
                  </Button>
                )}
              </>
            }
          />

          <NextStep estimate={e} manage={manage} busy={status.isPending} onShare={share} onSent={() => status.mutate('sent')} onDecide={setDeciding} onReopen={() => status.mutate('draft')} onEdit={() => navigate(`/estimates/${e.id}/edit`)} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <Card title={e.subject ?? 'Items'} padded={false}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-2.5">Item</th>
                        <th className="px-3 py-2.5 text-right">Qty</th>
                        <th className="px-3 py-2.5 text-right">Rate</th>
                        <th className="px-5 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {e.items?.map((l) => (
                        <tr key={l.id}>
                          <td className="px-5 py-3">
                            <p className="text-slate-900">{l.description}</p>
                            <p className="text-xs text-slate-500">{l.type === 'part' ? `Part${l.item ? ` · ${l.item.code}` : ' · to be bought'}` : 'Service'}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{qty(l.quantity)}{l.item ? ` ${l.item.unit_of_measure}` : ''}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(l.unit_price)}</td>
                          <td className="px-5 py-3 text-right font-medium tabular-nums">{money(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto max-w-xs space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
                  <Row k="Services" v={money(e.total_service_charge)} />
                  <Row k="Parts" v={money(e.total_spare_charge)} />
                  {e.discount_amount > 0 && <Row k="Discount" v={`− ${money(e.discount_amount)}`} />}
                  {e.is_gst && <Row k="Of which GST" v={money(e.cgst_amount + e.sgst_amount + e.igst_amount)} />}
                  <Row k="Estimated total" v={money(e.total_amount)} strong />
                </div>
              </Card>

              {(e.notes || e.terms) && (
                <Card title="Printed on the estimate">
                  <div className="space-y-4 text-sm">
                    {e.notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</p>
                        <p className="mt-1 whitespace-pre-line text-slate-700">{e.notes}</p>
                      </div>
                    )}
                    {e.terms && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
                        <p className="mt-1 whitespace-pre-line text-slate-600">{e.terms}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>

            <div className="min-w-0 space-y-6">
              <Card title="Customer">
                <Link to={`/customers/${e.customer_id}`} className="font-medium text-brand-700 hover:underline">{e.customer?.name}</Link>
                <p className="text-sm text-slate-600">{e.customer?.phone}</p>
                <p className="text-sm text-slate-600">{[e.customer?.address, e.customer?.city].filter(Boolean).join(', ')}</p>
                {e.customer_product && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">{unitLabel(e.customer_product) || 'Product'}{e.customer_product.serial_no ? ` · SN ${e.customer_product.serial_no}` : ''}</p>}
              </Card>

              <Card title="Job">
                {e.job ? (
                  <Link to={`/jobs/${e.job.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                    <Wrench className="h-4 w-4" /> Job {e.job.crm_call_id}
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">This estimate isn’t linked to a job.</p>
                    {can('jobs.manage') && (
                      <Button size="sm" variant="secondary" icon={<Wrench className="h-4 w-4" />} onClick={() => navigate(`/jobs/new?customer_id=${e.customer_id}`)}>
                        Create a job for this customer
                      </Button>
                    )}
                  </div>
                )}
              </Card>

              <Card title="History">
                <ol className="space-y-3 text-sm">
                  <li><p className="font-medium text-slate-900">Created</p><p className="text-slate-500">{dateTime(e.created_at)}{e.creator ? ` · ${e.creator.name}` : ''}</p></li>
                  {e.sent_at && <li><p className="font-medium text-slate-900">Sent to the customer</p><p className="text-slate-500">{dateTime(e.sent_at)}</p></li>}
                  {e.decided_at && (
                    <li>
                      <p className={cn('font-medium', e.status === 'approved' ? 'text-emerald-700' : 'text-red-700')}>{e.status === 'approved' ? 'Approved' : 'Rejected'}</p>
                      <p className="text-slate-500">{dateTime(e.decided_at)}{e.decider ? ` · recorded by ${e.decider.name}` : ''}</p>
                      {e.decision_note && <p className="mt-1 text-slate-700">“{e.decision_note}”</p>}
                    </li>
                  )}
                </ol>
              </Card>
            </div>
          </div>

          {deciding && <DecideDialog estimate={e} decision={deciding} onClose={() => setDeciding(null)} />}
          <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate(undefined)} title={`Delete estimate ${e.estimate_number}?`} message="It is removed for good. The link shared with the customer stops working." confirmLabel="Delete estimate" loading={remove.isPending} />
        </>
      )}
    </QueryState>
  );
}

/** The one thing to do next, said plainly, with its buttons. */
function NextStep({ estimate: e, manage, busy, onShare, onSent, onDecide, onReopen, onEdit }: {
  estimate: Estimate;
  manage: boolean;
  busy: boolean;
  onShare: (how: 'whatsapp' | 'link') => void;
  onSent: () => void;
  onDecide: (d: 'approved' | 'rejected') => void;
  onReopen: () => void;
  onEdit: () => void;
}) {
  const state = estimateState(e);
  const tone = { draft: 'border-slate-200 bg-white', sent: 'border-sky-200 bg-sky-50/60', approved: 'border-emerald-200 bg-emerald-50/60', rejected: 'border-red-200 bg-red-50/50', expired: 'border-amber-200 bg-amber-50/60' }[state];
  const text = {
    draft: ['Send it to the customer', 'Share the estimate on WhatsApp or copy its link. It is marked as sent when you do.'],
    sent: ['Waiting for the customer’s answer', `Sent on ${dateTime(e.sent_at)}. Record their answer here once you have it.`],
    approved: ['Approved by the customer', 'The work can go ahead. The invoice is made from the job’s visits as usual.'],
    rejected: ['Rejected by the customer', 'Reopen it to change the prices, or make a copy as a new estimate.'],
    expired: ['Past its last valid day', `It was valid until ${date(e.valid_until)}. Edit it to give it a new date, or record the customer’s answer.`],
  }[state];
  const open = e.status === 'draft' || e.status === 'sent';
  return (
    <div className={cn('mb-6 flex flex-col gap-4 rounded-xl border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between', tone)}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next step</p>
        <p className="mt-0.5 text-base font-semibold text-slate-900">{text[0]}</p>
        <p className="mt-0.5 text-sm text-slate-600">{text[1]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {open && (
          <>
            <Button icon={<MessageCircle className="h-4 w-4" />} variant={e.status === 'draft' ? 'primary' : 'secondary'} onClick={() => onShare('whatsapp')}>
              WhatsApp
            </Button>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => onShare('link')}>
              Copy link
            </Button>
          </>
        )}
        {manage && e.status === 'draft' && (
          <Button variant="secondary" icon={<Send className="h-4 w-4" />} loading={busy} onClick={onSent}>
            Mark as sent
          </Button>
        )}
        {manage && open && (
          <>
            <Button variant={e.status === 'sent' ? 'primary' : 'secondary'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => onDecide('approved')}>
              Approved
            </Button>
            <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => onDecide('rejected')}>
              Rejected
            </Button>
            <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
              Edit
            </Button>
          </>
        )}
        {manage && !open && (
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={busy} onClick={onReopen}>
            Reopen to change
          </Button>
        )}
      </div>
    </div>
  );
}

function DecideDialog({ estimate, decision, onClose }: { estimate: Estimate; decision: 'approved' | 'rejected'; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation(() => api.post(`/estimates/${estimate.id}/status`, { status: decision, note: note.trim() || null }), {
    toastValidation: false,
    invalidate: [['estimate', String(estimate.id)], ['estimates']],
    onSuccess: onClose,
  });
  const approving = decision === 'approved';
  return (
    <Modal
      open
      onClose={onClose}
      title={approving ? `The customer approved ${estimate.estimate_number}?` : `The customer rejected ${estimate.estimate_number}?`}
      description={approving ? `Approved for ${money(estimate.total_amount)}. The estimate is then locked.` : 'The estimate is then locked. You can reopen it later to change it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Go back</Button>
          <Button variant={approving ? 'primary' : 'danger'} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {approving ? 'Mark approved' : 'Mark rejected'}
          </Button>
        </>
      }
    >
      <Field label="Note" hint={approving ? 'Optional: how they confirmed, or anything agreed.' : 'Optional: why they said no.'} error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={approving ? 'e.g. Confirmed on WhatsApp, wants it done on Saturday' : 'e.g. Will buy a new unit instead'} />
      </Field>
    </Modal>
  );
}
