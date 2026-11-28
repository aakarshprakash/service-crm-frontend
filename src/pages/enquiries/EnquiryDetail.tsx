import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Check, FileSignature, MessageCircle, Pencil, Phone, RotateCcw, Trash2, Wrench, X } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { dateTime, fromLocalInput, money, relative, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, QueryState, Textarea, toast } from '@/components/ui';
import { EnquiryDialog } from './EnquiryForm';
import { STATUS, followUpState, sourceLabel, type Enquiry } from './enquiry';

/** One enquiry: who asked and what for, the follow-up trail, and turning it into a job or a quotation. */
export default function EnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['enquiry', id], queryFn: () => api.get<Envelope<Enquiry>>(`/enquiries/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<'edit' | 'lost' | 'won' | 'delete' | null>(null);
  const [opening, setOpening] = useState<'job' | 'estimate' | null>(null);
  const e = q.data;
  const manage = can('enquiries.manage');
  const open = e?.status === 'new' || e?.status === 'follow_up';
  const reopen = useApiMutation(() => api.post(`/enquiries/${id}/status`, { status: 'reopen' }), { invalidate: [['enquiry', id], ['enquiries']] });
  const del = useApiMutation(() => api.delete(`/enquiries/${id}`), { invalidate: [['enquiries']], onSuccess: () => navigate('/enquiries') });

  // The job or quotation form opens with the customer chosen: found by phone, or added from the enquiry.
  const goTo = async (kind: 'job' | 'estimate') => {
    if (!e) return;
    setOpening(kind);
    try {
      const c = await api.post<Envelope<{ id: number }>>(`/enquiries/${e.id}/customer`);
      navigate(kind === 'job' ? `/jobs/new?customer_id=${c.data.id}&enquiry_id=${e.id}` : `/estimates/new?customer_id=${c.data.id}&enquiry_id=${e.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the form.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {e && (
        <>
          <PageHeader
            back={
              <Link to="/enquiries" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Enquiries
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                {e.name}
                <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                <Badge tone={e.type === 'sales' ? 'violet' : 'sky'}>{e.type === 'sales' ? 'Sales enquiry' : 'Service enquiry'}</Badge>
              </span>
            }
            description={`${e.enquiry_number} · received ${dateTime(e.created_at)} · ${sourceLabel(e.source)}${e.creator ? ` · logged by ${e.creator.name}` : ''}`}
            actions={
              manage && (
                <>
                  {open && (
                    <>
                      <Button variant={e.type === 'service' ? 'primary' : 'secondary'} icon={<Wrench className="h-4 w-4" />} loading={opening === 'job'} onClick={() => goTo('job')}>
                        Book a job
                      </Button>
                      {can('estimates.manage') && (
                        <Button variant={e.type === 'sales' ? 'primary' : 'secondary'} icon={<FileSignature className="h-4 w-4" />} loading={opening === 'estimate'} onClick={() => goTo('estimate')}>
                          Make a quotation
                        </Button>
                      )}
                      <Button variant="secondary" icon={<Check className="h-4 w-4" />} onClick={() => setDialog('won')}>
                        Converted
                      </Button>
                      <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setDialog('lost')}>
                        Lost
                      </Button>
                    </>
                  )}
                  {!open && (
                    <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={reopen.isPending} onClick={() => reopen.mutate(undefined)}>
                      Reopen
                    </Button>
                  )}
                  <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                </>
              )
            }
          />

          <Outcome e={e} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {manage && open && <FollowUpForm e={e} />}
              <Card title="Follow-up trail" padded={false}>
                {e.notes?.length ? (
                  <ol className="divide-y divide-slate-100">
                    {e.notes.map((n) => (
                      <li key={n.id} className="flex gap-3 px-5 py-3">
                        <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', n.kind === 'status' ? 'bg-slate-300' : 'bg-brand-500')} aria-hidden />
                        <div className="min-w-0">
                          <p className={cn('whitespace-pre-line text-sm', n.kind === 'status' ? 'text-slate-500' : 'text-slate-900')}>{n.note}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {n.user?.name ?? 'System'} · {relative(n.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="px-5 py-6 text-sm text-slate-500">No follow-ups yet.</p>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Contact">
                <p className="text-lg font-semibold text-slate-900">{e.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Phone className="h-4 w-4" /> {e.phone}
                  </a>
                  <a
                    href={`https://wa.me/${e.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  {e.email && <Row k="Email" v={e.email} />}
                  {(e.address || e.city || e.pincode) && <Row k="Address" v={[e.address, e.city, e.pincode].filter(Boolean).join(', ')} />}
                  <Row
                    k="Customer"
                    v={
                      e.customer ? (
                        <Link to={`/customers/${e.customer.id}`} className="font-medium text-brand-700 hover:underline">
                          {e.customer.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Not a customer yet. Added when you book a job or make a quotation.</span>
                      )
                    }
                  />
                </dl>
              </Card>
              <Card title="What they asked about">
                <dl className="space-y-2 text-sm">
                  <Row k="Product" v={[e.brand?.name, e.product].filter(Boolean).join(' ') || '—'} />
                  {e.type === 'sales' && <Row k="Expected value" v={e.expected_value ? money(e.expected_value) : '—'} />}
                  <Row k="Following up" v={e.assignee?.name ?? 'Anyone'} />
                  {e.branch && <Row k="Branch" v={e.branch.name} />}
                </dl>
                {e.details && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{e.details}</p>}
              </Card>
              {manage && (
                <button type="button" onClick={() => setDialog('delete')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" /> Delete this enquiry
                </button>
              )}
            </div>
          </div>

          {dialog === 'edit' && <EnquiryDialog enquiry={e} onClose={() => setDialog(null)} />}
          {(dialog === 'lost' || dialog === 'won') && <CloseDialog e={e} status={dialog === 'lost' ? 'lost' : 'converted'} onClose={() => setDialog(null)} />}
          <ConfirmDialog
            open={dialog === 'delete'}
            onClose={() => setDialog(null)}
            title="Delete this enquiry?"
            message="Its follow-up trail is deleted too. To keep it on record, mark it lost instead."
            confirmLabel="Delete"
            loading={del.isPending}
            onConfirm={() => del.mutate(undefined)}
          />
        </>
      )}
    </QueryState>
  );
}

/** Where the enquiry stands: when to call next, or what it became. */
function Outcome({ e }: { e: Enquiry }) {
  const fu = followUpState(e);
  if (e.status === 'converted' || e.status === 'lost' || e.job || e.estimate) {
    return (
      <div className={cn('mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3 text-sm', e.status === 'lost' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>
        {e.status === 'lost' && <span>Lost{e.lost_reason ? `: ${e.lost_reason}` : ''}</span>}
        {e.job && (
          <Link to={`/jobs/${e.job.id}`} className="font-medium underline">
            Job {e.job.crm_call_id}
          </Link>
        )}
        {e.estimate && (
          <Link to={`/estimates/${e.estimate.id}`} className="font-medium underline">
            Quotation {e.estimate.estimate_number} ({e.estimate.status})
          </Link>
        )}
        {e.status === 'converted' && !e.job && !e.estimate && <span>Converted</span>}
        {e.closed_at && <span className="text-xs opacity-80">Closed {relative(e.closed_at)}</span>}
      </div>
    );
  }
  if (!fu) return null;
  return (
    <div className={cn('mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm', fu.late ? 'border-red-200 bg-red-50 text-red-800' : fu.today ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700')}>
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
      Call back: <strong>{fu.text}</strong>
    </div>
  );
}

const at = (days: number, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d.toISOString());
};

/** A follow-up: what was said on the call, and when to call again. */
function FollowUpForm({ e }: { e: Enquiry }) {
  const [note, setNote] = useState('');
  const [next, setNext] = useState(at(1));
  const m = useApiMutation(() => api.post(`/enquiries/${e.id}/notes`, { note, follow_up_at: next ? fromLocalInput(next) : null }), {
    invalidate: [['enquiry', String(e.id)], ['enquiries']],
    toastValidation: false,
    onSuccess: () => setNote(''),
  });
  const chips: [string, string][] = [
    ['Tomorrow', at(1)],
    ['In 3 days', at(3)],
    ['Next week', at(7)],
  ];
  return (
    <Card title="Add a follow-up">
      <div className="space-y-3">
        <Field label="What was said" required error={fieldError(m.error, 'note')}>
          <Textarea rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={1000} placeholder="e.g. Called, wants a visit on Saturday morning" />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Call again on" className="w-56" error={fieldError(m.error, 'follow_up_at')}>
            <Input type="datetime-local" value={next} onChange={(ev) => setNext(ev.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {chips.map(([label, v]) => (
              <button key={label} type="button" onClick={() => setNext(v)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', next === v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setNext('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !next ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              No call-back
            </button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate(undefined)}>
            Save follow-up
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CloseDialog({ e, status, onClose }: { e: Enquiry; status: 'lost' | 'converted'; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const lost = status === 'lost';
  const m = useApiMutation(() => api.post(`/enquiries/${e.id}/status`, { status, reason: reason.trim() || null }), {
    invalidate: [['enquiry', String(e.id)], ['enquiries']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const reasons = ['Price too high', 'Bought elsewhere', 'Not reachable', 'No longer needed'];
  return (
    <Modal
      open
      onClose={onClose}
      title={lost ? 'Mark this enquiry lost?' : 'Mark this enquiry converted?'}
      description={lost ? 'Say why, so you can see later why customers went elsewhere.' : 'Use this when it became business some other way, e.g. a sale at the counter. Booking a job or an accepted quotation converts it by itself.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={lost ? 'danger' : 'success'} loading={m.isPending} disabled={lost && !reason.trim()} onClick={() => m.mutate(undefined)}>
            {lost ? 'Mark lost' : 'Mark converted'}
          </Button>
        </>
      }
    >
      {lost && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', reason === r ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {r}
            </button>
          ))}
        </div>
      )}
      <Field label={lost ? 'Reason' : 'Note (optional)'} required={lost} error={fieldError(m.error, 'reason') ?? fieldError(m.error, 'status')}>
        <Textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-900">{v}</dd>
    </div>
  );
}
