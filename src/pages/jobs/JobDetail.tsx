import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarClock, Check, CheckCircle2, ClipboardList, Printer, CornerDownRight, FileText, MapPin, Package, PackageCheck, PackageSearch, Pencil, Phone, Repeat2, User, UserCog, Wrench, XCircle,
} from 'lucide-react';
import { api, ApiError, imageObjectUrl, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, duration, fromLocalInput, label, money, qty, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type CustomerProduct, type Job } from '@/lib/types';
import { Avatar, Badge, Button, Card, Combobox, Field, Input, Modal, PageHeader, QueryState, Select, Textarea, toast } from '@/components/ui';
import { MethodLabel, PriorityBadge, StatusBadge, Stars } from '@/components/domain';
import { CustomerLocationCard } from '@/components/CustomerLocation';
import { RichTextField, RichTextView } from '@/components/RichText';
import { ModelField, ProductCategoryField, ProductFields, productPayload, unitDraft, type ProductDraft } from '@/pages/customers/CustomerForm';
import { Hint } from '@/components/tutorial';

/** Logged → Assigned → Visit → Completed, with the current stage highlighted. */
function Progress({ job }: { job: Job }) {
  if (job.status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        <XCircle className="h-4 w-4" /> Cancelled{job.cancel_reason ? `: ${job.cancel_reason}` : ''}
      </div>
    );
  }
  const steps = [
    { label: 'Logged', done: true },
    { label: 'Assigned', done: !!job.assigned_technician_id },
    { label: 'Visit', done: !!job.visits?.length || job.status === 'in_progress' },
    { label: 'Completed', done: job.status === 'completed' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="flex items-center">
      {steps.map((s, i) => (
        <li key={s.label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                s.done ? 'bg-emerald-500 text-white' : i === current ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500',
              )}
            >
              {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs font-medium sm:inline', s.done ? 'text-slate-900' : i === current ? 'text-brand-700' : 'text-slate-400')}>{s.label}</span>
          </span>
          {i < steps.length - 1 && <span className={cn('mx-2 h-0.5 flex-1 rounded', s.done ? 'bg-emerald-400' : 'bg-slate-200')} />}
        </li>
      ))}
    </ol>
  );
}

/** One key fact in the overview at the top of the page. */
function Fact({ icon, label: k, children, note }: { icon: ReactNode; label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
        <div className="truncate text-sm font-semibold text-slate-900">{children}</div>
        {note && <div className="truncate text-xs text-slate-500">{note}</div>}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  const empty = v === '—' || v === '–';
  return (
    <div className={cn('flex justify-between gap-3', strong && 'border-t border-slate-100 pt-2 font-semibold text-slate-900')}>
      <span className={cn('shrink-0', !strong && 'text-slate-500')}>{k}</span>
      <span className={cn('min-w-0 break-words text-right tabular-nums', empty ? 'text-slate-400' : !strong && 'text-slate-900')}>{v}</span>
    </div>
  );
}

/** Opens the A4 job card PDF in a new tab, ready to print. */
function usePrintJobCard(jobId: number | undefined) {
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (!jobId) return;
    setPrinting(true);
    try {
      window.open(await imageObjectUrl(`/jobs/${jobId}/job-card`), '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the job card.');
    } finally {
      setPrinting(false);
    }
  };
  return { print, printing };
}

export default function JobDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const justCreated = params.get('created') === '1';
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<'edit' | 'assign' | 'reschedule' | 'part' | 'cancel' | 'approve-cancel' | 'reject-cancel' | 'followup' | 'model' | null>(null);
  const job = q.data;
  const manage = can('jobs.manage') && job && !['completed', 'cancelled'].includes(job.status);
  // While a technician's cancellation waits for an admin, the only thing to do with the job is decide.
  const deciding = job?.status === 'cancel_requested';
  const lastVisit = job?.visits?.[job.visits.length - 1];
  const photos = job?.images?.filter((i) => i.type !== 'signature') ?? [];
  const { data: photoLookups } = useLookups();
  const photoLabel = (type: string) => photoLookups?.photo_types?.find((p) => p.key === type)?.label ?? photoLookups?.photo_labels?.[type] ?? label(type);
  const unit = job?.customer_product;
  const inv = job?.invoice;
  const { print, printing } = usePrintJobCard(job?.id);
  const received = useApiMutation(() => api.post(`/jobs/${id}/part-received`), { invalidate: [['job', String(id)], ['jobs']] });

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
                Job card {job.crm_call_id} <StatusBadge status={job.status} /> <PriorityBadge priority={job.priority} />
              </span>
            }
            description={`Logged ${dateTime(job.created_at)} by ${job.creator?.name ?? 'customer portal'} · ${job.call_age_days ?? 0} day(s) old`}
          />

          {/* Everything you can do with this job, in one row */}
          <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
            {manage && !deciding && (
              <>
                <Hint
                  text={
                    job.technician
                      ? 'Hands the job to another technician. The new technician gets a push notification, the previous one is told it was reassigned, and the customer is sent the new technician’s details.'
                      : 'Picks the technician for this job. They get a push notification and the customer is sent their name and phone number.'
                  }
                >
                  <Button variant={job.technician ? 'secondary' : 'primary'} icon={<UserCog className="h-4 w-4" />} onClick={() => setDialog('assign')}>
                    {job.technician ? 'Reassign' : 'Assign'}
                  </Button>
                </Hint>
                <Hint text="Moves the visit to a new date and time. The assigned technician is notified.">
                  <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setDialog('reschedule')}>
                    Reschedule
                  </Button>
                </Hint>
                {(job.status === 'open' || job.status === 'pending') && (
                  <Hint text="Use this when the job can’t go ahead until a part arrives. It stays open and is listed under Part pending until you mark the part received.">
                    <Button variant="secondary" icon={<PackageSearch className="h-4 w-4" />} onClick={() => setDialog('part')}>
                      Part pending
                    </Button>
                  </Hint>
                )}
                <Hint text="Corrects the product, complaint, priority, call type, location or branch. To change the visit time use Reschedule, and to change the technician use Assign, so the people involved are notified.">
                  <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                </Hint>
              </>
            )}
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} loading={printing} onClick={print}>
              Print job card
            </Button>
            {can('jobs.manage') && (
              <Hint text="Creates a new job linked to this one, copying the customer, product, complaint and technician. Use it for a revisit or a repeat complaint.">
                <Button variant="secondary" icon={<Repeat2 className="h-4 w-4" />} onClick={() => setDialog('followup')}>
                  Follow-up call
                </Button>
              </Hint>
            )}
            {manage && !deciding && (
              <div className="sm:ml-auto">
                <Hint text="Closes the job as cancelled, with a reason. Any visit in progress is stopped. This can’t be undone.">
                  <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<XCircle className="h-4 w-4" />} onClick={() => setDialog('cancel')}>
                    Cancel job
                  </Button>
                </Hint>
              </div>
            )}
          </div>

          {justCreated && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-5 w-5" /> Job card {job.crm_call_id} created{job.technician ? ` and assigned to ${job.technician.name}` : ''}.
              </p>
              <div className="flex gap-2">
                <Button size="sm" icon={<Printer className="h-4 w-4" />} loading={printing} onClick={print}>
                  Print job card
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams({}, { replace: true })}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {deciding && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-red-900">
                    {job.cancel_requester?.name ?? 'The technician'} asked to cancel this job{job.cancel_requested_at ? ` on ${dateTime(job.cancel_requested_at)}` : ''}
                  </p>
                  {job.cancel_reason && <p className="break-words text-red-800">Reason: {job.cancel_reason}</p>}
                </div>
              </div>
              {can('jobs.approve_cancel') ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setDialog('reject-cancel')}>
                    Reject
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDialog('approve-cancel')}>
                    Approve & cancel job
                  </Button>
                </div>
              ) : (
                <p className="text-sm font-medium text-red-900">Waiting for an admin, coordinator or head engineer to decide.</p>
              )}
            </div>
          )}

          {job.status === 'part_pending' && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <PackageSearch className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-red-900">Waiting for a part{job.part_pending_at ? ` since ${date(job.part_pending_at)}` : ''}</p>
                  {job.part_pending_note && <p className="break-words text-red-800">{job.part_pending_note}</p>}
                </div>
              </div>
              {manage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDialog('part')}>
                    Change note
                  </Button>
                  <Hint text="The part has arrived. The job goes back to waiting for a visit and the technician is notified.">
                    <Button size="sm" icon={<PackageCheck className="h-4 w-4" />} loading={received.isPending} onClick={() => received.mutate(undefined)}>
                      Part received
                    </Button>
                  </Hint>
                </div>
              )}
            </div>
          )}

          {/* Overview: where the job stands and the four things people look for first */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="border-b border-slate-100 px-5 py-4">
              <Progress job={job} />
            </div>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
              <Fact
                icon={<User className="h-4 w-4" />}
                label="Customer"
                note={job.customer?.phone && <a href={`tel:${job.customer.phone}`} className="hover:underline">{job.customer.phone}</a>}
              >
                <Link to={`/customers/${job.customer_id}`} className="text-brand-700 hover:underline">{job.customer?.name}</Link>
              </Fact>
              <Fact icon={<Package className="h-4 w-4" />} label="Product" note={[job.product_category, unit?.serial_no && `S/N ${unit.serial_no}`].filter(Boolean).join(' · ')}>
                {unit ? unitLabel(unit) : <span className="font-normal text-slate-400">Not recorded</span>}
              </Fact>
              <Fact
                icon={<Wrench className="h-4 w-4" />}
                label="Technician"
                note={job.technician?.phone && <a href={`tel:${job.technician.phone}`} className="hover:underline">{job.technician.phone}</a>}
              >
                {job.technician ? (
                  job.technician.name
                ) : manage ? (
                  <button type="button" onClick={() => setDialog('assign')} className="text-brand-700 hover:underline">Assign a technician</button>
                ) : (
                  <span className="text-amber-700">Not assigned</span>
                )}
              </Fact>
              <Fact icon={<CalendarClock className="h-4 w-4" />} label="Visit on">
                {job.scheduled_at ? (
                  dateTime(job.scheduled_at)
                ) : manage ? (
                  <button type="button" onClick={() => setDialog('reschedule')} className="text-brand-700 hover:underline">Set visit date</button>
                ) : (
                  <span className="font-normal text-slate-400">Not scheduled</span>
                )}
              </Fact>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <Card title="Complaint">
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ['Service type', job.complaint_type?.name],
                    ['Breakdown / complaint summary', job.complaint_summary?.name],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs font-medium text-slate-500">{k}</p>
                      <p className={cn('mt-0.5 font-medium', v ? 'text-slate-900' : 'font-normal text-slate-400')}>{v ?? '—'}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Job summary</p>
                  {job.complaint_details_html || job.complaint_details ? (
                    <RichTextView html={job.complaint_details_html} text={job.complaint_details} />
                  ) : (
                    <p className="text-sm text-slate-400">Nothing written yet.</p>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card title="Customer" className="min-w-0">
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={job.customer?.name ?? '?'} />
                      <Link to={`/customers/${job.customer_id}`} className="min-w-0 break-words font-semibold text-brand-700 hover:underline">
                        {job.customer?.name}
                      </Link>
                    </div>
                    <p className="flex items-center gap-2 text-slate-700">
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <a href={`tel:${job.customer?.phone}`} className="hover:underline">{job.customer?.phone}</a>
                        {job.customer?.alt_phone && <> · <a href={`tel:${job.customer.alt_phone}`} className="hover:underline">{job.customer.alt_phone}</a></>}
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-slate-700">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 break-words">{[job.customer?.address, job.customer?.city, job.customer?.pincode].filter(Boolean).join(', ') || <span className="text-slate-400">No address</span>}</span>
                    </p>
                    {job.customer?.crm_id && <p className="text-xs text-slate-500">CRM ID: {job.customer.crm_id}</p>}
                  </div>
                </Card>

                <Card title="Product" className="min-w-0">
                  <div className="space-y-2 text-sm">
                    <Row k="Brand" v={unit?.product?.brand?.name ?? unit?.brand?.name ?? '—'} />
                    <Row k="Type" v={unit?.category?.name ?? unit?.product?.category?.name ?? '—'} />
                    <Row k="Category" v={job.product_category ?? '—'} />
                    <Row
                      k="Model"
                      v={
                        unit?.model_no ?? (
                          !unit ? '—' : manage ? (
                            <button type="button" onClick={() => setDialog('model')} className="font-medium text-brand-700 hover:underline">Set model</button>
                          ) : (
                            <span className="text-amber-700">Not set yet</span>
                          )
                        )
                      }
                    />
                    <Row k="Serial no." v={unit?.serial_no ?? '—'} />
                    {unit?.outdoor_serial_no && <Row k="Outdoor serial no." v={unit.outdoor_serial_no} />}
                    <Row
                      k="Warranty"
                      v={
                        unit?.warranty_type || unit?.warranty_expiry ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                            {unit.warranty_type && label(unit.warranty_type)}
                            {unit.warranty_expiry && <span className="text-slate-500">till {date(unit.warranty_expiry)}</span>}
                            {unit.warranty_expiry && <Badge tone={unit.under_warranty ? 'green' : 'slate'}>{unit.under_warranty ? 'Covered' : 'Expired'}</Badge>}
                          </span>
                        ) : '—'
                      }
                    />
                    {unit?.purchase_date && <Row k="Purchase date" v={date(unit.purchase_date)} />}
                    <Row k="Dealer" v={unit?.dealer?.name ?? '—'} />
                  </div>
                </Card>
              </div>

              <Card title={`Visits (${job.visits?.length ?? 0})`} padded={false}>
                {!job.visits?.length ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">No visits yet. The technician starts the service from their app.</p>
                ) : (
                  <ol className="divide-y divide-slate-100">
                    {job.visits.map((v, i) => (
                      <li key={v.id} className="relative space-y-2.5 px-5 py-4 pl-14">
                        <span className="absolute left-5 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{i + 1}</span>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 text-sm">
                            <p className="font-semibold text-slate-900">{dateTime(v.start_time)}</p>
                            <p className="text-xs text-slate-500">{v.technician?.name} · {label(v.service_type)} · {duration(v.duration_seconds)}</p>
                          </div>
                          <StatusBadge status={v.status} />
                        </div>
                        {v.action_taken && <p className="text-sm"><span className="text-slate-500">Action taken:</span> <span className="font-medium">{v.action_taken.name}</span></p>}
                        {v.service_summary && <p className="break-words text-sm text-slate-700">{v.service_summary}</p>}
                        {!!v.inventory_usage?.length && (
                          <ul className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            {v.inventory_usage.map((u) => (
                              <li key={u.id} className="flex justify-between gap-3 py-0.5">
                                <span>{u.item?.name} ({u.item?.code}) × {qty(u.quantity)} {u.item?.unit_of_measure}{u.from_technician_stock ? ' · from technician’s parts' : ''}</span>
                                <span className="tabular-nums">{money(u.total_price)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {job.voice_notes?.some((n) => n.job_visit_id === v.id) && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-slate-500">Voice notes</p>
                            {job.voice_notes.filter((n) => n.job_visit_id === v.id).map((n) => (
                              <div key={n.id} className="flex items-center gap-2">
                                <audio controls preload="none" src={n.url} className="h-9 w-full max-w-sm" />
                                <span className="shrink-0 text-xs text-slate-500">{duration(n.duration_seconds)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const sig = job.images?.find((im) => im.type === 'signature' && im.job_visit_id === v.id);
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
                        {v.status !== 'in_progress' && (v.total_charge > 0 || v.assisted_staff) && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {v.labour_charge > 0 && <Badge>Labour {money(v.labour_charge)}</Badge>}
                            {v.spare_charge > 0 && <Badge>Spares {money(v.spare_charge)}</Badge>}
                            {v.total_charge > 0 && <Badge tone="blue">Total {money(v.total_charge)}</Badge>}
                            {v.total_charge > 0 && v.payment_method && (
                              <Badge tone={v.amount_collected > 0 ? 'green' : 'slate'}>
                                <MethodLabel method={v.payment_method} />{v.amount_collected > 0 && ` · collected ${money(v.amount_collected)}`}
                              </Badge>
                            )}
                            {v.assisted_staff && <Badge tone="violet">Assisted by {v.assisted_staff.name}</Badge>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              {!!photos.length && (
                <Card title={`Photos (${photos.length})`}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photos.map((img) => (
                      <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-slate-200">
                        <img src={img.url} alt={photoLabel(img.type)} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                        <p className="bg-white px-2 py-1 text-xs text-slate-600">{photoLabel(img.type)}</p>
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <div className="min-w-0 space-y-6">
              <Card title="Charges & invoice" actions={inv && <StatusBadge status={inv.payment_status} />}>
                {inv ? (
                  <div className="space-y-2 text-sm">
                    <Row k="Service charge" v={money(inv.total_service_charge)} />
                    <Row k="Spare charge" v={money(inv.total_spare_charge)} />
                    {inv.discount_amount > 0 && <Row k="Discount" v={`− ${money(inv.discount_amount)}`} />}
                    {inv.is_gst && (
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <Row k="Taxable value" v={money(inv.taxable_amount ?? 0)} />
                        {(inv.igst_amount ?? 0) > 0 ? (
                          <Row k="IGST" v={money(inv.igst_amount ?? 0)} />
                        ) : (
                          <>
                            <Row k="CGST" v={money(inv.cgst_amount ?? 0)} />
                            <Row k="SGST" v={money(inv.sgst_amount ?? 0)} />
                          </>
                        )}
                      </div>
                    )}
                    <Row k={inv.is_gst ? 'Total (incl. GST)' : 'Total'} v={money(inv.total_amount)} strong />
                    <Row k="Paid" v={money(inv.paid_amount)} />
                    <Row k="Balance" v={<span className={inv.balance_amount > 0 ? 'font-semibold text-red-700' : 'text-emerald-700'}>{money(inv.balance_amount)}</span>} />
                    <Link to={`/invoices/${inv.id}`} className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                      <FileText className="h-4 w-4" /> Open invoice {inv.invoice_number}
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">An invoice is generated automatically when a visit is closed with charges.</p>
                )}
              </Card>

              <Card title="Job details">
                <div className="space-y-2 text-sm">
                  <Row k="Call type" v={label(job.call_type)} />
                  <Row k="Visit type" v={label(job.service_type)} />
                  <Row k="Branch" v={job.branch?.name ?? '—'} />
                  <Row k="Service location" v={job.service_location?.name ?? '—'} />
                  <Row k="Customer Satisfaction Code" v={job.customer_satisfaction_code ?? '—'} />
                </div>
                {job.parent && (
                  <p className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3 text-sm">
                    <CornerDownRight className="h-4 w-4 text-slate-400" /> Follow-up of{' '}
                    <Link className="font-medium text-brand-700 hover:underline" to={`/jobs/${job.parent.id}`}>{job.parent.crm_call_id}</Link>
                  </p>
                )}
                {!!job.follow_ups?.length && (
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                    <p className="text-xs font-medium text-slate-500">Follow-ups</p>
                    {job.follow_ups.map((fu) => (
                      <Link key={fu.id} to={`/jobs/${fu.id}`} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-slate-50">
                        <span className="font-medium text-brand-700">{fu.crm_call_id}</span>
                        <StatusBadge status={fu.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <CustomerLocationCard job={job} canManage={!!manage} visitLat={lastVisit?.location_lat} visitLng={lastVisit?.location_lng} />

              {job.review && (
                <Card title="Customer feedback">
                  <Stars rating={job.review.rating} size="md" />
                  {job.review.comment && <p className="mt-2 text-sm text-slate-700">“{job.review.comment}”</p>}
                </Card>
              )}

              <Card title={<span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ClipboardList className="h-4 w-4 text-slate-400" /> History</span>}>
                <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                  {job.status_history?.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
                      <p className="break-words text-sm text-slate-800">{h.remarks ?? label(h.status)}</p>
                      <p className="text-xs text-slate-500">{dateTime(h.changed_at)} {h.user && `· ${h.user.name}`}</p>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>

          {dialog === 'edit' && <EditJobDialog job={job} onClose={() => setDialog(null)} />}
          {dialog === 'model' && unit && <SetModelDialog job={job} unit={unit} onClose={() => setDialog(null)} />}
          <AssignDialog job={job} open={dialog === 'assign'} onClose={() => setDialog(null)} />
          <RescheduleDialog job={job} open={dialog === 'reschedule'} onClose={() => setDialog(null)} />
          {dialog === 'part' && <PartPendingDialog job={job} onClose={() => setDialog(null)} />}
          {dialog === 'cancel' && <CancelDialog job={job} onClose={() => setDialog(null)} />}
          {dialog === 'approve-cancel' && <CancelDialog job={job} approving onClose={() => setDialog(null)} />}
          {dialog === 'reject-cancel' && <RejectCancelDialog job={job} onClose={() => setDialog(null)} />}
          <FollowUpDialog job={job} open={dialog === 'followup'} onClose={() => setDialog(null)} />
        </>
      )}
    </QueryState>
  );
}

/** Fill in the unit's model once it is known (the job was logged without it). */
function SetModelDialog({ job, unit, onClose }: { job: Job; unit: CustomerProduct; onClose: () => void }) {
  const [draft, setDraft] = useState<ProductDraft>(unitDraft(unit));
  const m = useApiMutation((body: object) => api.patch(`/customers/${job.customer_id}/products/${unit.id}`, body), {
    invalidate: [['job', String(job.id)], ['customer', String(job.customer_id)], ['lookups']],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Set the unit’s model"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} disabled={!draft.model_no.trim()} onClick={() => m.mutate(productPayload(draft))}>Save model</Button>
        </>
      }
    >
      <ModelField value={draft.model_no} onChange={(v) => setDraft({ ...draft, model_no: v })} brandId={draft.brand_id} error={m.error instanceof ApiError ? m.error.field('model_no') : undefined} />
    </Modal>
  );
}

/** Corrects the job's own details. Time and technician have their own dialogs because they notify people. */
function EditJobDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  const unit = job.customer_product;
  // The product was logged with just its brand; model, serial and warranty are completed here.
  const [product, setProduct] = useState<ProductDraft>(unitDraft(unit));
  const [form, setForm] = useState({
    complaint_type_id: s(job.complaint_type_id),
    complaint_summary_id: s(job.complaint_summary_id),
    complaint_details: job.complaint_details_html ?? job.complaint_details ?? '',
    product_category: job.product_category ?? '',
    customer_satisfaction_code: job.customer_satisfaction_code ?? '',
    priority: job.priority as string,
    call_type: job.call_type,
    service_location_id: s(job.service_location_id),
    branch_id: s(job.branch_id),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const summaries = useMemo(
    () => (lookups?.complaint_summaries ?? [])
      .filter((c) => !form.complaint_type_id || !c.complaint_type_id || c.complaint_type_id === Number(form.complaint_type_id))
      .map((c) => ({ value: String(c.id), label: c.name })),
    [lookups, form.complaint_type_id],
  );
  const id = (v: string) => (v ? Number(v) : null);
  const qc = useQueryClient();
  const m = useApiMutation(
    async (body: object) => {
      // 1. Save the product details (update the job's product, or record one if it had none).
      let productId = job.customer_product_id;
      const hasProduct = product.brand_id || product.model_no.trim() || product.category_id || product.serial_no.trim();
      if (productId) {
        await api.patch(`/customers/${job.customer_id}/products/${productId}`, productPayload(product));
      } else if (hasProduct) {
        productId = (await api.post<Envelope<CustomerProduct>>(`/customers/${job.customer_id}/products`, productPayload(product))).data.id;
      }
      // 2. Save the job.
      return api.patch(`/jobs/${job.id}`, { ...body, customer_product_id: productId ?? null });
    },
    {
      invalidate: [['job', String(job.id)], ['jobs'], ['lookups']],
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['customer', String(job.customer_id)] });
        onClose();
      },
    },
  );
  const f = (k: string) => fieldError(m.error, k);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Edit ${job.crm_call_id}`}
      description="Use Reschedule to change the visit time and Assign to change the technician."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={m.isPending}
            onClick={() =>
              m.mutate({
                ...form,
                // Portal jobs keep their call type: it can't be picked by hand.
                call_type: form.call_type === job.call_type ? undefined : form.call_type,
                complaint_type_id: id(form.complaint_type_id),
                complaint_summary_id: id(form.complaint_summary_id),
                service_location_id: id(form.service_location_id),
                branch_id: id(form.branch_id),
                complaint_details: form.complaint_details || null,
                product_category: form.product_category.trim() || null,
                customer_satisfaction_code: form.customer_satisfaction_code.trim() || null,
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Product details</p>
      <ProductFields
        value={product}
        onChange={setProduct}
        error={m.error instanceof ApiError ? m.error : null}
        title={null}
        extra={<ProductCategoryField value={form.product_category} onChange={(v) => set('product_category', v)} error={f('product_category')} />}
      />
      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Complaint & job</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Service type" error={f('complaint_type_id')}>
          <Combobox
            value={form.complaint_type_id}
            onChange={(v) => setForm((x) => ({ ...x, complaint_type_id: v, complaint_summary_id: '' }))}
            options={(lookups?.complaint_types ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="Select…"
            aria-label="Service type"
            searchable
          />
        </Field>
        <Field label="Breakdown / complaint summary" error={f('complaint_summary_id')}>
          <Combobox value={form.complaint_summary_id} onChange={(v) => set('complaint_summary_id', v)} options={summaries} placeholder={summaries.length ? 'Select…' : 'None configured'} disabled={!summaries.length} aria-label="Complaint summary" searchable />
        </Field>
        <Field label="Job summary" className="sm:col-span-2" error={f('complaint_details')}>
          <RichTextField value={form.complaint_details} onChange={(html) => set('complaint_details', html)} />
        </Field>
        <Field label="Customer Satisfaction Code" className="sm:col-span-2" error={f('customer_satisfaction_code')} hint="Given by the customer. The technician usually enters it.">
          <Input value={form.customer_satisfaction_code} onChange={(e) => set('customer_satisfaction_code', e.target.value)} maxLength={50} autoComplete="off" />
        </Field>
        <Field label="Priority" required>
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Call type" required error={f('call_type')}>
          <Select value={form.call_type} onChange={(e) => set('call_type', e.target.value)}>
            <option value="crm_call">CRM call</option>
            <option value="walk_in">Walk-in</option>
            <option value="referral">Referral</option>
            {form.call_type === 'portal' && <option value="portal">Customer portal</option>}
          </Select>
        </Field>
        {(lookups?.service_locations.length ?? 0) > 0 && (
          <Field label="Service location" error={f('service_location_id')}>
            <Select value={form.service_location_id} onChange={(e) => set('service_location_id', e.target.value)}>
              <option value="">Not specified</option>
              {lookups?.service_locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(lookups?.branches.length ?? 0) > 1 && (
          <Field label="Branch" error={f('branch_id')}>
            <Select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
              <option value="">Not specified</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** Technicians as searchable options, on-duty first, with their current workload. */
function useTechOptions() {
  const { data: techs } = useStaffOptions('technician');
  return useMemo(
    () => [...(techs ?? [])]
      .sort((a, b) => Number(b.punch_status === 'in') - Number(a.punch_status === 'in') || a.name.localeCompare(b.name))
      .map((t) => ({
        value: String(t.id),
        label: t.name,
        hint: [t.punch_status === 'in' ? 'On duty' : 'Off duty', t.open_jobs !== undefined ? `${t.open_jobs} open job${t.open_jobs === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
        group: t.punch_status === 'in' ? 'On duty' : 'Off duty',
      })),
    [techs],
  );
}

function AssignDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const techOptions = useTechOptions();
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
          <Combobox value={tech} onChange={setTech} options={techOptions} placeholder="Select technician…" searchPlaceholder="Search technician…" aria-label="Technician" searchable />
        </Field>
        <Field label="Visit date & time">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Parks the job until a part arrives; opened again, it corrects the note. */
function PartPendingDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [note, setNote] = useState(job.part_pending_note ?? '');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/part-pending`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Waiting for a part"
      description="The job stays open and is listed under Part pending until you mark the part received."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate({ note: note.trim() })}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Which part is needed?" required error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Compressor 1.5 ton, ordered from the dealer on Monday" />
      </Field>
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

/** Closes the job as cancelled. It can't be saved without a reason; approving starts from the technician's. */
function CancelDialog({ job, approving = false, onClose }: { job: Job; approving?: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(approving ? job.cancel_reason ?? '' : '');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/cancel${approving ? '/approve' : ''}`, body), { toastValidation: false, invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={approving ? 'Approve the cancellation?' : 'Cancel this job?'}
      description={approving ? 'The job closes as cancelled and the technician is told. This can’t be undone.' : 'The job closes as cancelled and any running visit is stopped. This can’t be undone.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button variant="danger" loading={m.isPending} disabled={!reason.trim()} onClick={() => m.mutate({ reason: reason.trim() })}>
            {approving ? 'Approve & cancel job' : 'Cancel job'}
          </Button>
        </>
      }
    >
      <Field label="Reason for cancelling" required error={fieldError(m.error, 'reason') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer has sold the unit" />
      </Field>
    </Modal>
  );
}

/** Keeps the job open: it goes back to Pending and the technician sees why. */
function RejectCancelDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/cancel/reject`, body), { toastValidation: false, invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Reject the cancellation?"
      description="The job goes back to Pending and the technician is told why."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate({ note: note.trim() })}>
            Reject cancellation
          </Button>
        </>
      }
    >
      <Field label="Why does the job stay open?" required error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer still wants the repair" />
      </Field>
    </Modal>
  );
}

function FollowUpDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const techOptions = useTechOptions();
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
          <Combobox value={form.assigned_technician_id} onChange={(v) => setForm({ ...form, assigned_technician_id: v })} options={techOptions} placeholder="Assign later" aria-label="Technician" searchable />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={form.complaint_details} onChange={(e) => setForm({ ...form, complaint_details: e.target.value })} placeholder="e.g. Periodic service due / check gas pressure" />
        </Field>
      </div>
    </Modal>
  );
}
