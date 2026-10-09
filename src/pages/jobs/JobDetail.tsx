import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CornerDownRight, Phone, Repeat2, UserCog, XCircle } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, duration, fromLocalInput, label, money, qty, toLocalInput } from '@/lib/format';
import type { Job } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, DefinitionList, Field, Input, Modal, PageHeader, QueryState, Select, Textarea } from '@/components/ui';
import { MethodLabel, PriorityBadge, Section, StatusBadge, Stars } from '@/components/domain';
import { CustomerLocationCard } from '@/components/CustomerLocation';
import { Hint } from '@/components/tutorial';

export default function JobDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<'assign' | 'reschedule' | 'cancel' | 'followup' | null>(null);
  const job = q.data;
  const manage = can('jobs.manage') && job && !['completed', 'cancelled'].includes(job.status);
  const lastVisit = job?.visits?.[job.visits.length - 1];
  const photos = job?.images?.filter((i) => i.type !== 'signature') ?? [];

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {job && (
        <>
          <PageHeader
            back={
              <Link to="/jobs" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Jobs
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                {job.crm_call_id} <StatusBadge status={job.status} /> <PriorityBadge priority={job.priority} />
              </span>
            }
            description={`Logged ${dateTime(job.created_at)} by ${job.creator?.name ?? 'customer portal'} · ${job.call_age_days ?? 0} day(s) old`}
            actions={
              <>
                {manage && (
                  <>
                    <Hint
                      text={
                        job.technician
                          ? 'Hands the job to another technician. The new technician gets a push notification, the previous one is told it was reassigned, and the customer is sent the new technician’s details.'
                          : 'Picks the technician for this job. They get a push notification and the customer is sent their name and phone number.'
                      }
                    >
                      <Button variant="secondary" icon={<UserCog className="h-4 w-4" />} onClick={() => setDialog('assign')}>
                        {job.technician ? 'Reassign' : 'Assign'}
                      </Button>
                    </Hint>
                    <Hint text="Moves the visit to a new date and time. The assigned technician is notified.">
                      <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setDialog('reschedule')}>
                        Reschedule
                      </Button>
                    </Hint>
                    <Hint text="Closes the job as cancelled, with a reason. Any visit in progress is stopped. This can’t be undone.">
                      <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<XCircle className="h-4 w-4" />} onClick={() => setDialog('cancel')}>
                        Cancel job
                      </Button>
                    </Hint>
                  </>
                )}
                {can('jobs.manage') && (
                  <Hint text="Creates a new job linked to this one, copying the customer, product, complaint and technician. Use it for a revisit or a repeat complaint.">
                    <Button variant="outline" icon={<Repeat2 className="h-4 w-4" />} onClick={() => setDialog('followup')}>
                      Follow-up call
                    </Button>
                  </Hint>
                )}
              </>
            }
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Customer & product">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1 text-sm">
                    <Link to={`/customers/${job.customer_id}`} className="font-semibold text-brand-700 hover:underline">
                      {job.customer?.name}
                    </Link>
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <Phone className="h-3.5 w-3.5" />
                      <a href={`tel:${job.customer?.phone}`} className="hover:underline">
                        {job.customer?.phone}
                      </a>
                      {job.customer?.alt_phone && <span>· {job.customer.alt_phone}</span>}
                    </p>
                    <p className="text-slate-600">{[job.customer?.address, job.customer?.city, job.customer?.pincode].filter(Boolean).join(', ') || '—'}</p>
                    {job.customer?.crm_id && <p className="text-xs text-slate-500">CRM ID: {job.customer.crm_id}</p>}
                  </div>
                  <DefinitionList
                    columns={1}
                    items={[
                      ['Product', [job.customer_product?.product?.brand?.name, job.customer_product?.product?.model_name].filter(Boolean).join(' ') || '—'],
                      ['Serial no.', [job.customer_product?.serial_no, job.customer_product?.outdoor_serial_no && `Outdoor ${job.customer_product.outdoor_serial_no}`].filter(Boolean).join(' · ') || '—'],
                      [
                        'Warranty',
                        job.customer_product ? (
                          <span className="flex items-center gap-2">
                            {label(job.customer_product.warranty_type)}
                            {job.customer_product.warranty_expiry && <span className="text-slate-500">till {date(job.customer_product.warranty_expiry)}</span>}
                            {job.customer_product.under_warranty !== undefined && <Badge tone={job.customer_product.under_warranty ? 'green' : 'slate'}>{job.customer_product.under_warranty ? 'Covered' : 'Expired'}</Badge>}
                          </span>
                        ) : (
                          '—'
                        ),
                      ],
                      ['Dealer', job.customer_product?.dealer?.name ?? '—'],
                    ]}
                  />
                </div>
              </Card>

              <Card title="Complaint">
                <DefinitionList
                  items={[
                    ['Type', job.complaint_type?.name ?? '—'],
                    ['Summary', job.complaint_summary?.name ?? '—'],
                    ['Call type', label(job.call_type)],
                    ['Service type', label(job.service_type)],
                    ['Scheduled', dateTime(job.scheduled_at)],
                    ['Branch', job.branch?.name ?? '—'],
                    ['Service location', job.service_location?.name ?? '—'],
                  ]}
                />
                {job.complaint_details && <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{job.complaint_details}</p>}
                {job.cancel_reason && <p className="mt-3 text-sm text-red-700">Cancelled: {job.cancel_reason}</p>}
              </Card>

              <Card title={`Visits (${job.visits?.length ?? 0})`} padded={false}>
                {!job.visits?.length ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">No visits yet. The technician starts the service from their app.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {job.visits.map((v) => (
                      <div key={v.id} className="space-y-3 px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm">
                            <span className="font-medium text-slate-900">{dateTime(v.start_time)}</span>
                            <span className="text-slate-500"> · {v.technician?.name} · {label(v.service_type)} · {duration(v.duration_seconds)}</span>
                          </div>
                          <StatusBadge status={v.status} />
                        </div>
                        {v.action_taken && <p className="text-sm"><span className="text-slate-500">Action taken:</span> <span className="font-medium">{v.action_taken.name}</span></p>}
                        {v.service_summary && <p className="text-sm text-slate-700">{v.service_summary}</p>}
                        {!!v.inventory_usage?.length && (
                          <ul className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            {v.inventory_usage.map((u) => (
                              <li key={u.id} className="flex justify-between py-0.5">
                                <span>
                                  {u.item?.name} ({u.item?.code}) × {qty(u.quantity)} {u.item?.unit_of_measure}
                                </span>
                                <span className="tabular-nums">{money(u.total_price)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {job.voice_notes?.some((n) => n.job_visit_id === v.id) && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-slate-500">Voice notes</p>
                            {job.voice_notes
                              .filter((n) => n.job_visit_id === v.id)
                              .map((n) => (
                                <div key={n.id} className="flex items-center gap-2">
                                  <audio controls preload="none" src={n.url} className="h-9 w-full max-w-sm" />
                                  <span className="shrink-0 text-xs text-slate-500">{duration(n.duration_seconds)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                        {(() => {
                          const sig = job.images?.find((i) => i.type === 'signature' && i.job_visit_id === v.id);
                          return sig ? (
                            <div className="flex items-end gap-3">
                              <a href={sig.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white p-1">
                                <img src={sig.url} alt="Customer signature" className="h-14 w-36 object-contain" />
                              </a>
                              <p className="pb-1 text-xs text-slate-600">
                                Signed by <span className="font-medium text-slate-900">{v.signer_name ?? 'customer'}</span>
                                {v.signed_at && <> · {dateTime(v.signed_at)}</>}
                              </p>
                            </div>
                          ) : null;
                        })()}
                        {v.status !== 'in_progress' && (
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                            <span>Labour {money(v.labour_charge)}</span>
                            <span>Spares {money(v.spare_charge)}</span>
                            <span className="font-semibold text-slate-900">Total {money(v.total_charge)}</span>
                            <span>
                              Payment: <MethodLabel method={v.payment_method} /> {v.amount_collected > 0 && `· collected ${money(v.amount_collected)}`}
                            </span>
                            {v.assisted_staff && <span>Assisted by {v.assisted_staff.name}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {!!photos.length && (
                <Card title={`Photos (${photos.length})`}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photos.map((img) => (
                      <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-slate-200">
                        <img src={img.url} alt={label(img.type)} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                        <p className="bg-white px-2 py-1 text-xs text-slate-600">{label(img.type)}</p>
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Assignment">
                <DefinitionList
                  columns={1}
                  items={[
                    ['Technician', job.technician ? `${job.technician.name}${job.technician.phone ? ` · ${job.technician.phone}` : ''}` : <span className="text-amber-700">Not assigned</span>],
                    ['Scheduled', dateTime(job.scheduled_at)],
                  ]}
                />
                {job.parent && (
                  <p className="mt-3 flex items-center gap-1 text-sm">
                    <CornerDownRight className="h-4 w-4 text-slate-400" /> Follow-up of{' '}
                    <Link className="font-medium text-brand-700 hover:underline" to={`/jobs/${job.parent.id}`}>
                      {job.parent.crm_call_id}
                    </Link>
                  </p>
                )}
                {!!job.follow_ups?.length && (
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="text-xs font-medium uppercase text-slate-500">Follow-ups</p>
                    {job.follow_ups.map((f) => (
                      <Link key={f.id} to={`/jobs/${f.id}`} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-slate-50">
                        <span className="font-medium text-brand-700">{f.crm_call_id}</span>
                        <StatusBadge status={f.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Charges & invoice">
                {job.invoice ? (
                  <div className="space-y-2 text-sm">
                    <Row k="Service charge" v={money(job.invoice.total_service_charge)} />
                    <Row k="Spare charge" v={money(job.invoice.total_spare_charge)} />
                    <Row k="Total" v={<strong>{money(job.invoice.total_amount)}</strong>} />
                    <Row k="Paid" v={money(job.invoice.paid_amount)} />
                    <Row k="Balance" v={<span className={job.invoice.balance_amount > 0 ? 'font-semibold text-red-700' : ''}>{money(job.invoice.balance_amount)}</span>} />
                    <div className="flex items-center justify-between pt-2">
                      <StatusBadge status={job.invoice.payment_status} />
                      <Link to={`/invoices/${job.invoice.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {job.invoice.invoice_number} →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">An invoice is generated automatically when a visit is closed with charges.</p>
                )}
              </Card>

              <CustomerLocationCard job={job} canManage={!!manage} visitLat={lastVisit?.location_lat} visitLng={lastVisit?.location_lng} />

              {job.review && (
                <Card title="Customer feedback">
                  <Stars rating={job.review.rating} size="md" />
                  {job.review.comment && <p className="mt-2 text-sm text-slate-700">“{job.review.comment}”</p>}
                </Card>
              )}

              <Card title="History">
                <Section title="">
                  <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                    {job.status_history?.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
                        <p className="text-sm text-slate-800">{h.remarks ?? label(h.status)}</p>
                        <p className="text-xs text-slate-500">
                          {dateTime(h.changed_at)} {h.user && `· ${h.user.name}`}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Section>
              </Card>
            </div>
          </div>

          <AssignDialog job={job} open={dialog === 'assign'} onClose={() => setDialog(null)} />
          <RescheduleDialog job={job} open={dialog === 'reschedule'} onClose={() => setDialog(null)} />
          <CancelDialog job={job} open={dialog === 'cancel'} onClose={() => setDialog(null)} />
          <FollowUpDialog job={job} open={dialog === 'followup'} onClose={() => setDialog(null)} />
        </>
      )}
    </QueryState>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function AssignDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const { data: techs } = useStaffOptions('technician');
  const [tech, setTech] = useState(String(job.assigned_technician_id ?? ''));
  const [when, setWhen] = useState(toLocalInput(job.scheduled_at));
  const m = useApiMutation((body: object) => api.patch(`/jobs/${job.id}/assign`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  const auto = useApiMutation(() => api.post(`/jobs/${job.id}/auto-assign`), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={job.technician ? 'Reassign technician' : 'Assign technician'}
      description="The technician gets a push notification and the customer an SMS/WhatsApp update."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Hint text="Picks the technician linked to this job’s service location (or its branch, if it has no location) who has the fewest open jobs.">
            <Button variant="secondary" loading={auto.isPending} onClick={() => auto.mutate(undefined)}>
              Auto-assign
            </Button>
          </Hint>
          <Button loading={m.isPending} disabled={!tech} onClick={() => m.mutate({ technician_id: Number(tech), scheduled_at: fromLocalInput(when) })}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Technician" error={fieldError(m.error, 'technician_id') ?? fieldError(m.error, 'assigned_technician_id') ?? fieldError(m.error, 'technician')}>
          <Select value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">Select…</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.punch_status === 'in' ? '· on duty' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visit date & time">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RescheduleDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const [when, setWhen] = useState(toLocalInput(job.scheduled_at));
  const [reason, setReason] = useState('');
  const m = useApiMutation((body: object) => api.patch(`/jobs/${job.id}/reschedule`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule visit"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!when} onClick={() => m.mutate({ scheduled_at: fromLocalInput(when), reason })}>
            Reschedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New date & time" required error={fieldError(m.error, 'scheduled_at')}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer requested evening slot" maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

function CancelDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/cancel`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Cancel this job?"
      message="The job will be closed as cancelled. Any running visit is stopped. This cannot be undone."
      confirmLabel="Cancel job"
      loading={m.isPending}
      onConfirm={() => m.mutate({ reason })}
    >
      <Field label="Reason" required error={fieldError(m.error, 'reason')}>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
    </ConfirmDialog>
  );
}

function FollowUpDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const { data: techs } = useStaffOptions('technician');
  const [form, setForm] = useState({ scheduled_at: '', complaint_details: '', assigned_technician_id: String(job.assigned_technician_id ?? '') });
  const m = useApiMutation((body: object) => api.post<Envelope<Job>>(`/jobs/${job.id}/follow-up`, body), {
    invalidate: [['job', String(job.id)], ['jobs']],
    onSuccess: (r) => {
      onClose();
      window.location.assign(`/jobs/${r.data.id}`);
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create follow-up call"
      description="A reminder / 2nd service call linked to this job."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={m.isPending}
            onClick={() => m.mutate({ ...form, scheduled_at: fromLocalInput(form.scheduled_at), assigned_technician_id: form.assigned_technician_id ? Number(form.assigned_technician_id) : null })}
          >
            Create follow-up
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Visit date & time">
          <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        </Field>
        <Field label="Technician">
          <Select value={form.assigned_technician_id} onChange={(e) => setForm({ ...form, assigned_technician_id: e.target.value })}>
            <option value="">Assign later</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={form.complaint_details} onChange={(e) => setForm({ ...form, complaint_details: e.target.value })} placeholder="e.g. Periodic service due / check gas pressure" />
        </Field>
      </div>
    </Modal>
  );
}
