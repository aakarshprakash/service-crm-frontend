import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CornerDownRight, FileText, Pencil, Printer, Repeat2, XCircle } from 'lucide-react';
import { api, imageObjectUrl, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { date, dateTime, duration, label, money, qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Job, Visit } from '@/lib/types';
import { Badge, Button, Card, PageHeader, QueryState, toast } from '@/components/ui';
import { MethodLabel, PriorityBadge, StatusBadge, Stars } from '@/components/domain';
import { CustomerLocationCard } from '@/components/CustomerLocation';
import { RichTextView } from '@/components/RichText';
import { Hint } from '@/components/tutorial';
import { JobStatusPanel, type JobDialog } from './JobStatusPanel';
import {
  AssignDialog, CancelDialog, EditJobDialog, FollowUpDialog, PartPendingDialog, RejectCancelDialog, RejectResumeDialog, RescheduleDialog, SetModelDialog,
} from './jobDialogs';

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

const isClosed = (job: Job) => job.status === 'completed' || job.status === 'cancelled';

/** "Logged on 3 Nov, 10:20 by Asha. Open for 6 days." Closed jobs leave out the age: their clock has stopped. */
function loggedLine(job: Job) {
  const logged = `Logged on ${dateTime(job.created_at)} by ${job.creator?.name ?? 'the customer portal'}.`;
  if (isClosed(job)) return logged;
  const days = job.call_age_days ?? 0;
  return `${logged} ${days === 0 ? 'Opened today.' : `Open for ${days} day${days === 1 ? '' : 's'}.`}`;
}

/** The small "Edit" in a card's header, so the fix sits next to the thing being fixed. */
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Hint text="Corrects the product, complaint, priority, call type, location or branch. To change the visit time or the technician, use Change at the top of the page, so the people involved are notified.">
      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onClick}>
        Edit
      </Button>
    </Hint>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const justCreated = params.get('created') === '1';
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<JobDialog | null>(null);
  const job = q.data;
  const manage = !!(can('jobs.manage') && job && !['completed', 'cancelled'].includes(job.status));
  // While a technician's cancellation waits for an admin, the only thing to do with the job is decide.
  const editable = manage && job?.status !== 'cancel_requested';
  const lastVisit = job?.visits?.[job.visits.length - 1];
  const { print, printing } = usePrintJobCard(job?.id);
  const close = () => setDialog(null);

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {job && (
        <>
          <PageHeader
            back={
              <Link to="/jobs" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> All jobs
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                Job card {job.crm_call_id} <StatusBadge status={job.status} /> <PriorityBadge priority={job.priority} />
              </span>
            }
            description={loggedLine(job)}
            actions={
              <>
                {can('jobs.manage') && (
                  <Hint text="Creates a new job linked to this one, copying the customer, product, complaint and technician. Use it for a revisit or a repeat complaint.">
                    <Button variant="secondary" icon={<Repeat2 className="h-4 w-4" />} onClick={() => setDialog('followup')}>
                      Follow-up call
                    </Button>
                  </Hint>
                )}
                <Button variant="secondary" icon={<Printer className="h-4 w-4" />} loading={printing} onClick={print}>
                  Print job card
                </Button>
                {editable && (
                  <Hint text="Closes the job as cancelled, with a reason. Any visit in progress is stopped. This can’t be undone.">
                    <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<XCircle className="h-4 w-4" />} onClick={() => setDialog('cancel')}>
                      Cancel job
                    </Button>
                  </Hint>
                )}
              </>
            }
          />

          {justCreated && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" role="status">
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

          <JobStatusPanel job={job} manage={manage} onOpen={setDialog} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <ComplaintCard job={job} onEdit={editable ? () => setDialog('edit') : undefined} />
              <ProductCard job={job} onEdit={editable ? () => setDialog('edit') : undefined} onSetModel={editable ? () => setDialog('model') : undefined} />
              <VisitsCard job={job} />
              <PhotosCard job={job} />
            </div>

            <div className="min-w-0 space-y-6">
              <ChargesCard job={job} />
              <JobInfoCard job={job} onEdit={editable ? () => setDialog('edit') : undefined} />
              <CustomerLocationCard job={job} canManage={manage} visitLat={lastVisit?.location_lat} visitLng={lastVisit?.location_lng} />
              {job.review && (
                <Card title="Customer feedback">
                  <Stars rating={job.review.rating} size="md" />
                  {job.review.comment && <p className="mt-2 text-sm text-slate-700">“{job.review.comment}”</p>}
                </Card>
              )}
              <ActivityCard job={job} />
            </div>
          </div>

          {dialog === 'edit' && <EditJobDialog job={job} onClose={close} />}
          {dialog === 'model' && job.customer_product && <SetModelDialog job={job} unit={job.customer_product} onClose={close} />}
          <AssignDialog job={job} open={dialog === 'assign'} onClose={close} />
          <RescheduleDialog job={job} open={dialog === 'reschedule'} onClose={close} />
          {dialog === 'part' && <PartPendingDialog job={job} onClose={close} />}
          {dialog === 'cancel' && <CancelDialog job={job} onClose={close} />}
          {dialog === 'approve-cancel' && <CancelDialog job={job} approving onClose={close} />}
          {dialog === 'reject-cancel' && <RejectCancelDialog job={job} onClose={close} />}
          {dialog === 'reject-resume' && <RejectResumeDialog job={job} onClose={close} />}
          <FollowUpDialog job={job} open={dialog === 'followup'} onClose={close} />
        </>
      )}
    </QueryState>
  );
}

/** What the customer reported. */
function ComplaintCard({ job, onEdit }: { job: Job; onEdit?: () => void }) {
  return (
    <Card title="Complaint" actions={onEdit && <EditButton onClick={onEdit} />}>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        {[
          ['Service type', job.complaint_type?.name],
          ['Breakdown / complaint summary', job.complaint_summary?.name],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-medium text-slate-500">{k}</p>
            <p className={cn('mt-0.5 font-medium', v ? 'text-slate-900' : 'font-normal text-slate-400')}>{v ?? 'Not recorded'}</p>
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
  );
}

/** The unit being serviced. Model is often unknown when the job is logged, so it can be filled in here. */
function ProductCard({ job, onEdit, onSetModel }: { job: Job; onEdit?: () => void; onSetModel?: () => void }) {
  const unit = job.customer_product;
  // A missing model only needs attention while the job is still open.
  const model = unit?.model_no ?? (
    !unit || isClosed(job) ? '—' : onSetModel ? (
      <button type="button" onClick={onSetModel} className="font-medium text-brand-700 hover:underline">Set model</button>
    ) : (
      <span className="text-amber-700">Not set yet</span>
    )
  );
  return (
    <Card title="Product" actions={onEdit && <EditButton onClick={onEdit} />}>
      {!unit ? (
        <p className="text-sm text-slate-500">No product recorded for this job yet.{onEdit && ' Use Edit to add it.'}</p>
      ) : (
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Brand" v={unit.product?.brand?.name ?? unit.brand?.name ?? '—'} />
          <Row k="Type" v={unit.category?.name ?? unit.product?.category?.name ?? '—'} />
          <Row k="Model" v={model} />
          <Row k="Category" v={job.product_category ?? '—'} />
          <Row k="Serial no." v={unit.serial_no ?? '—'} />
          {unit.outdoor_serial_no && <Row k="Outdoor serial no." v={unit.outdoor_serial_no} />}
          <Row
            k="Warranty"
            v={
              unit.warranty_type || unit.warranty_expiry ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  {unit.warranty_type && label(unit.warranty_type)}
                  {unit.warranty_expiry && <span className="text-slate-500">till {date(unit.warranty_expiry)}</span>}
                  {unit.warranty_expiry && <Badge tone={unit.under_warranty ? 'green' : 'slate'}>{unit.under_warranty ? 'Covered' : 'Expired'}</Badge>}
                </span>
              ) : '—'
            }
          />
          {unit.purchase_date && <Row k="Purchase date" v={date(unit.purchase_date)} />}
          <Row k="Dealer" v={unit.dealer?.name ?? '—'} />
        </div>
      )}
    </Card>
  );
}

function VisitsCard({ job }: { job: Job }) {
  const visits = job.visits ?? [];
  return (
    <Card title={`Visits (${visits.length})`} padded={false}>
      {!visits.length ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          {isClosed(job) ? 'No visits were made for this job.' : 'No visits yet. The technician starts the service from their app.'}
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {visits.map((v, i) => <VisitItem key={v.id} job={job} visit={v} n={i + 1} />)}
        </ol>
      )}
    </Card>
  );
}

function VisitItem({ job, visit: v, n }: { job: Job; visit: Visit; n: number }) {
  const notes = job.voice_notes?.filter((x) => x.job_visit_id === v.id) ?? [];
  const sig = job.images?.find((im) => im.type === 'signature' && im.job_visit_id === v.id);
  return (
    <li className="relative space-y-2.5 px-5 py-4 pl-14">
      <span className="absolute left-5 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{n}</span>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-slate-900">{dateTime(v.start_time)}</p>
          <p className="text-xs text-slate-500">{[v.technician?.name, label(v.service_type), duration(v.duration_seconds)].filter(Boolean).join(', ')}</p>
        </div>
        <StatusBadge status={v.status} />
      </div>
      {v.action_taken && <p className="text-sm"><span className="text-slate-500">Action taken:</span> <span className="font-medium">{v.action_taken.name}</span></p>}
      {v.service_summary && <p className="break-words text-sm text-slate-700">{v.service_summary}</p>}
      {!!v.inventory_usage?.length && (
        <ul className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600" aria-label="Parts used">
          {v.inventory_usage.map((u) => (
            <li key={u.id} className="flex justify-between gap-3 py-0.5">
              <span>{u.item?.name} ({u.item?.code}) × {qty(u.quantity)} {u.item?.unit_of_measure}{u.from_technician_stock ? ', from technician’s parts' : ''}</span>
              <span className="tabular-nums">{money(u.total_price)}</span>
            </li>
          ))}
        </ul>
      )}
      {!!notes.length && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Voice notes</p>
          {notes.map((x) => (
            <div key={x.id} className="flex items-center gap-2">
              <audio controls preload="none" src={x.url} className="h-9 w-full max-w-sm" />
              <span className="shrink-0 text-xs text-slate-500">{duration(x.duration_seconds)}</span>
            </div>
          ))}
        </div>
      )}
      {sig && (
        <div className="flex items-end gap-3">
          <a href={sig.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white p-1">
            <img src={sig.url} alt="Customer signature" className="h-14 w-36 object-contain" />
          </a>
          <p className="pb-1 text-xs text-slate-600">
            Signed by <span className="font-medium text-slate-900">{v.signer_name ?? 'customer'}</span>
            {v.signed_at && <>, {dateTime(v.signed_at)}</>}
          </p>
        </div>
      )}
      {v.status !== 'in_progress' && (v.total_charge > 0 || v.assisted_staff) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {v.labour_charge > 0 && <Badge>Labour {money(v.labour_charge)}</Badge>}
          {v.spare_charge > 0 && <Badge>Spares {money(v.spare_charge)}</Badge>}
          {v.total_charge > 0 && <Badge tone="blue">Total {money(v.total_charge)}</Badge>}
          {v.total_charge > 0 && v.payment_method && (
            <Badge tone={v.amount_collected > 0 ? 'green' : 'slate'}>
              <MethodLabel method={v.payment_method} />{v.amount_collected > 0 && `, collected ${money(v.amount_collected)}`}
            </Badge>
          )}
          {v.assisted_staff && <Badge tone="violet">Assisted by {v.assisted_staff.name}</Badge>}
        </div>
      )}
    </li>
  );
}

function PhotosCard({ job }: { job: Job }) {
  const { data: lookups } = useLookups();
  const photos = job.images?.filter((i) => i.type !== 'signature') ?? [];
  if (!photos.length) return null;
  const photoLabel = (type: string) => lookups?.photo_types?.find((p) => p.key === type)?.label ?? lookups?.photo_labels?.[type] ?? label(type);
  return (
    <Card title={`Photos (${photos.length})`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((img) => (
          <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-slate-200">
            <img src={img.url} alt={photoLabel(img.type)} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
            <p className="bg-white px-2 py-1 text-xs text-slate-600">{photoLabel(img.type)}</p>
          </a>
        ))}
      </div>
    </Card>
  );
}

/** Money first: what's still owed is the line people look for. */
function ChargesCard({ job }: { job: Job }) {
  const inv = job.invoice;
  return (
    <Card title="Charges & invoice" actions={inv && <StatusBadge status={inv.payment_status} />}>
      {inv ? (
        <div className="space-y-2 text-sm">
          <div className={cn('mb-3 rounded-lg px-3 py-2.5', inv.balance_amount > 0 ? 'bg-red-50' : 'bg-emerald-50')}>
            <p className={cn('text-xs font-medium', inv.balance_amount > 0 ? 'text-red-700' : 'text-emerald-700')}>{inv.balance_amount > 0 ? 'Still to collect' : 'Fully paid'}</p>
            <p className={cn('text-xl font-semibold tabular-nums', inv.balance_amount > 0 ? 'text-red-800' : 'text-emerald-800')}>{money(inv.balance_amount > 0 ? inv.balance_amount : inv.paid_amount)}</p>
          </div>
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
          <Link to={`/invoices/${inv.id}`} className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            <FileText className="h-4 w-4" /> Open invoice {inv.invoice_number}
          </Link>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {isClosed(job) ? 'No charges were billed for this job.' : 'No charges yet. An invoice is made automatically when a visit is closed with charges.'}
        </p>
      )}
    </Card>
  );
}

function JobInfoCard({ job, onEdit }: { job: Job; onEdit?: () => void }) {
  return (
    <Card title="Job details" actions={onEdit && <EditButton onClick={onEdit} />}>
      <div className="space-y-2 text-sm">
        <Row k="Call type" v={label(job.call_type)} />
        <Row k="Branch" v={job.branch?.name ?? '—'} />
        <Row k="Service location" v={job.service_location?.name ?? '—'} />
        {job.customer?.crm_id && <Row k="Customer CRM ID" v={job.customer.crm_id} />}
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
          <p className="text-xs font-medium text-slate-500">Follow-up calls</p>
          {job.follow_ups.map((fu) => (
            <Link key={fu.id} to={`/jobs/${fu.id}`} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-slate-50">
              <span className="font-medium text-brand-700">{fu.crm_call_id}</span>
              <StatusBadge status={fu.status} />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Everything that happened to the job, newest last, as recorded by the server. */
function ActivityCard({ job }: { job: Job }) {
  const history = job.status_history ?? [];
  return (
    <Card title="Activity">
      {!history.length ? (
        <p className="text-sm text-slate-500">Nothing recorded yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-4">
          {history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
              <p className="break-words text-sm text-slate-800">{h.remarks ?? label(h.status)}</p>
              <p className="text-xs text-slate-500">{dateTime(h.changed_at)}{h.user && `, ${h.user.name}`}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
