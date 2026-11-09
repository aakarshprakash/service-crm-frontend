import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  CalendarClock, Check, CheckCircle2, FileText, Hourglass, PackageCheck, PackageSearch, Phone, UserCog, UserPlus, Wrench, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, dateParts, dateTime, daysFromToday, label, money, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Job } from '@/lib/types';
import { Avatar, Badge, Button } from '@/components/ui';
import { Hint } from '@/components/tutorial';

export type JobDialog =
  | 'edit' | 'assign' | 'reschedule' | 'part' | 'cancel' | 'approve-cancel' | 'reject-cancel' | 'reject-resume' | 'followup' | 'model';

/**
 * Where the job stands, worked out from its status. Checked in this order because the
 * stages overlap: a cancelled job may still have a technician, a parked job may have a date, and so on.
 */
type Stage = 'cancelled' | 'completed' | 'cancel_requested' | 'part_pending' | 'resume' | 'in_progress' | 'unassigned' | 'unscheduled' | 'scheduled';

function stageOf(job: Job): Stage {
  if (job.status === 'cancelled') return 'cancelled';
  if (job.status === 'completed') return 'completed';
  if (job.status === 'cancel_requested') return 'cancel_requested';
  if (job.status === 'part_pending') return 'part_pending';
  if (job.needs_resume_approval) return 'resume';
  if (job.status === 'in_progress') return 'in_progress';
  if (!job.assigned_technician_id) return 'unassigned';
  if (!job.scheduled_at) return 'unscheduled';
  return 'scheduled';
}

function isOverdue(job: Job, now: number) {
  return !!job.scheduled_at && new Date(job.scheduled_at).getTime() < now;
}

/** The panel's colour says who has to act: you, someone else, a decision, a blocker, or nobody. */
type Tone = 'you' | 'waiting' | 'decide' | 'blocked' | 'done' | 'closed';

const toneStyle: Record<Tone, { band: string; icon: string; cue: string }> = {
  you: { band: 'bg-brand-50 border-brand-100', icon: 'bg-brand-600 text-white', cue: 'text-brand-700' },
  waiting: { band: 'bg-slate-50 border-slate-100', icon: 'bg-white text-slate-600 ring-1 ring-slate-200', cue: 'text-slate-600' },
  decide: { band: 'bg-amber-50 border-amber-100', icon: 'bg-amber-500 text-white', cue: 'text-amber-800' },
  blocked: { band: 'bg-red-50 border-red-100', icon: 'bg-red-600 text-white', cue: 'text-red-700' },
  done: { band: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-600 text-white', cue: 'text-emerald-700' },
  closed: { band: 'bg-slate-100 border-slate-200', icon: 'bg-slate-500 text-white', cue: 'text-slate-600' },
};

interface Summary {
  tone: Tone;
  cue: string;
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
}

const ic = 'h-5 w-5';

/** Finished jobs: how they ended. */
function summariseClosed(job: Job): Summary {
  if (job.status === 'cancelled') {
    return { tone: 'closed', cue: 'Closed', icon: <XCircle className={ic} />, title: `Cancelled${job.cancelled_at ? ` on ${dateTime(job.cancelled_at)}` : ''}`, detail: job.cancel_reason && `Reason: ${job.cancel_reason}` };
  }
  return { tone: 'done', cue: 'Done', icon: <CheckCircle2 className={ic} />, title: `Completed${job.completed_at ? ` on ${dateTime(job.completed_at)}` : ''}`, detail: paymentLine(job) };
}

/** Jobs that are stuck until someone decides or something arrives. */
function summariseHeld(job: Job, stage: 'cancel_requested' | 'part_pending' | 'resume'): Summary {
  const tech = job.technician?.name ?? 'The technician';
  if (stage === 'cancel_requested') {
    return {
      tone: 'decide', cue: 'Needs a decision', icon: <XCircle className={ic} />,
      title: `${job.cancel_requester?.name ?? 'The technician'} asked to cancel this job`,
      detail: [job.cancel_reason && `Reason: ${job.cancel_reason}`, job.cancel_requested_at && `Asked on ${dateTime(job.cancel_requested_at)}.`].filter(Boolean).join(' '),
    };
  }
  if (stage === 'part_pending') {
    return {
      tone: 'blocked', cue: 'On hold', icon: <PackageSearch className={ic} />,
      title: `Waiting for a part${job.part_pending_at ? ` since ${date(job.part_pending_at)}` : ''}`,
      detail: job.part_pending_note ?? 'No note about which part.',
    };
  }
  return {
    tone: 'decide', cue: 'Needs a decision', icon: <Hourglass className={ic} />,
    title: job.resume_requested_at ? `${tech} asked to go back to this job` : `${tech} needs approval before the next visit`,
    detail: job.resume_request_note
      ? `“${job.resume_request_note}”`
      : job.resume_requested_at ? `Asked on ${dateTime(job.resume_requested_at)}.` : `The job was left ${label(job.status).toLowerCase()} and stays with them. Approve when it can go ahead.`,
  };
}

/** Jobs moving normally: who is doing what, and when. */
function summariseActive(job: Job, stage: 'in_progress' | 'unassigned' | 'unscheduled' | 'scheduled', manage: boolean, now: number): Summary {
  const tech = job.technician?.name ?? 'The technician';
  if (stage === 'in_progress') {
    const lastVisit = job.visits?.[job.visits.length - 1];
    return { tone: 'waiting', cue: 'Visit in progress', icon: <Wrench className={ic} />, title: `${tech} is working on it now`, detail: lastVisit && `Started ${dateTime(lastVisit.start_time)}.` };
  }
  if (stage === 'unassigned') {
    return manage
      ? { tone: 'you', cue: 'Your next step', icon: <UserPlus className={ic} />, title: 'Assign a technician', detail: 'No one is working on this job yet.' }
      : { tone: 'waiting', cue: 'Waiting', icon: <UserPlus className={ic} />, title: 'Waiting for a technician to be assigned' };
  }
  if (stage === 'unscheduled') {
    return manage
      ? { tone: 'you', cue: 'Your next step', icon: <CalendarClock className={ic} />, title: 'Set the visit date', detail: `${tech} is assigned, but no visit time is set yet.` }
      : { tone: 'waiting', cue: 'Waiting', icon: <CalendarClock className={ic} />, title: 'Waiting for a visit date' };
  }
  const pendingNote = job.status === 'pending' ? 'The last visit didn’t finish the job. ' : '';
  return isOverdue(job, now)
    ? { tone: 'decide', cue: 'Visit overdue', icon: <CalendarClock className={ic} />, title: `${tech}’s visit was due ${dateTime(job.scheduled_at)}`, detail: `${pendingNote}The visit hasn’t started. Call the technician, or set a new time.` }
    : { tone: 'waiting', cue: 'Waiting for the visit', icon: <CalendarClock className={ic} />, title: `${tech} visits on ${dateTime(job.scheduled_at)}`, detail: pendingNote ? `${pendingNote}This is the next visit.` : 'The technician starts the service from their app.' };
}

function summarise(job: Job, manage: boolean, now: number): Summary {
  const stage = stageOf(job);
  if (stage === 'cancelled' || stage === 'completed') return summariseClosed(job);
  if (stage === 'cancel_requested' || stage === 'part_pending' || stage === 'resume') return summariseHeld(job, stage);
  return summariseActive(job, stage, manage, now);
}

function paymentLine(job: Job): ReactNode {
  const inv = job.invoice;
  if (!inv) return 'No charges were billed.';
  if (inv.balance_amount > 0) return <><span className="font-semibold text-red-700">{money(inv.balance_amount)}</span> still to collect on invoice {inv.invoice_number}.</>;
  return `Invoice ${inv.invoice_number} is fully paid.`;
}

/** The buttons for the current stage. The filled one is what most people will want to do. */
function StageActions({ job, manage, onOpen }: { job: Job; manage: boolean; onOpen: (d: JobDialog) => void }) {
  const { can } = useAuth();
  const key = ['job', String(job.id)];
  const received = useApiMutation(() => api.post(`/jobs/${job.id}/part-received`), { invalidate: [key, ['jobs']] });
  const resume = useApiMutation(() => api.post(`/jobs/${job.id}/resume/approve`), { invalidate: [key, ['jobs']] });
  const stage = stageOf(job);
  const nobodyToDecide = <p className="text-sm font-medium text-slate-600">Waiting for an admin, coordinator or head engineer.</p>;

  if (stage === 'completed') {
    return job.invoice ? (
      <Link to={`/invoices/${job.invoice.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <FileText className="h-4 w-4" /> Open invoice
      </Link>
    ) : null;
  }
  if (stage === 'cancel_requested') {
    return can('jobs.approve_cancel') ? (
      <>
        <Button variant="secondary" onClick={() => onOpen('reject-cancel')}>Reject</Button>
        <Button variant="danger" onClick={() => onOpen('approve-cancel')}>Approve & cancel job</Button>
      </>
    ) : nobodyToDecide;
  }
  if (stage === 'resume') {
    return can('jobs.approve_resume') ? (
      <>
        <Button variant="secondary" onClick={() => onOpen('reject-resume')}>Not yet</Button>
        <Button loading={resume.isPending} onClick={() => resume.mutate(undefined)}>Approve to resume</Button>
      </>
    ) : nobodyToDecide;
  }
  if (!manage) return null;
  if (stage === 'part_pending') {
    return (
      <>
        <Button variant="ghost" onClick={() => onOpen('part')}>Change note</Button>
        <Hint text="The part has arrived. The job goes back to waiting for a visit and the technician is notified.">
          <Button icon={<PackageCheck className="h-4 w-4" />} loading={received.isPending} onClick={() => received.mutate(undefined)}>Part received</Button>
        </Hint>
      </>
    );
  }
  const partButton = (job.status === 'open' || job.status === 'pending') && (
    <Hint text="Use this when the job can’t go ahead until a part arrives. It stays open and is listed under Part pending until you mark the part received.">
      <Button variant="secondary" icon={<PackageSearch className="h-4 w-4" />} onClick={() => onOpen('part')}>Part pending</Button>
    </Hint>
  );
  return (
    <>
      {partButton}
      {stage === 'unassigned' && (
        <Hint text="Picks the technician for this job. They get a push notification and the customer is sent their name and phone number.">
          <Button icon={<UserCog className="h-4 w-4" />} onClick={() => onOpen('assign')}>Assign technician</Button>
        </Hint>
      )}
      {stage === 'unscheduled' && <Button icon={<CalendarClock className="h-4 w-4" />} onClick={() => onOpen('reschedule')}>Set visit date</Button>}
      {stage === 'scheduled' && isOverdue(job, Date.now()) && (
        <Hint text="Moves the visit to a new date and time. The assigned technician is notified.">
          <Button icon={<CalendarClock className="h-4 w-4" />} onClick={() => onOpen('reschedule')}>Reschedule</Button>
        </Hint>
      )}
    </>
  );
}

/** Logged → Assigned → Visit → Completed. Compact: the headline below says the rest. */
function Progress({ job }: { job: Job }) {
  const steps = [
    { label: 'Logged', done: true },
    { label: 'Assigned', done: !!job.assigned_technician_id },
    { label: 'Visit', done: !!job.visits?.length || job.status === 'in_progress' },
    { label: 'Completed', done: job.status === 'completed' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Job progress">
      {steps.map((s, i) => (
        <li key={s.label} className={cn('flex items-center gap-1', i < steps.length - 1 && 'flex-1')} aria-current={i === current ? 'step' : undefined}>
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
              s.done ? 'bg-emerald-500 text-white' : i === current ? 'bg-white text-brand-700 ring-2 ring-brand-500' : 'bg-white text-slate-400 ring-1 ring-slate-300',
            )}
          >
            {s.done ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cn('hidden font-medium sm:inline', s.done ? 'text-slate-700' : i === current ? 'text-brand-700' : 'text-slate-400')}>{s.label}</span>
          {i < steps.length - 1 && <span className={cn('mx-1.5 h-px flex-1', s.done ? 'bg-emerald-400' : 'bg-slate-300')} />}
        </li>
      ))}
    </ol>
  );
}

/** One key fact under the headline, with its "Change" action right beside it. */
function Fact({ label: k, action, children, note }: { label: string; action?: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{k}</p>
        {action}
      </div>
      <div className="mt-1 break-words text-[15px] font-semibold text-slate-900">{children}</div>
      {note && <div className="mt-0.5 space-y-0.5 text-sm text-slate-600">{note}</div>}
    </div>
  );
}

function ChangeLink({ onClick, children, hint }: { onClick: () => void; children: ReactNode; hint: string }) {
  return (
    <Hint text={hint}>
      <button type="button" onClick={onClick} className="rounded text-xs font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        {children}
      </button>
    </Hint>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-700 hover:underline">
      <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {phone}
    </a>
  );
}

/** Who is going: initials, a large name and their number, so it can be read at a glance. */
function TechnicianFact({ job }: { job: Job }) {
  const t = job.technician;
  if (!t) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-amber-300 text-amber-600" aria-hidden>
          <UserPlus className="h-5 w-5" />
        </span>
        <p className="text-lg font-semibold text-amber-700">Not assigned yet</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Avatar name={t.name} className="h-12 w-12 text-base" />
      <div className="min-w-0">
        <p className="break-words text-lg font-bold leading-tight text-navy-900">{t.name}</p>
        {t.phone && <p className="mt-0.5 text-sm font-normal text-slate-600"><PhoneLink phone={t.phone} /></p>}
      </div>
    </div>
  );
}

/** "Today", "Tomorrow", "In 3 days": how soon the visit is, in words. Only while the visit is still to come. */
function WhenChip({ job, datePassed }: { job: Job; datePassed: boolean }) {
  const days = daysFromToday(job.scheduled_at);
  if (datePassed) return <Badge tone="amber">{days === 0 ? 'Today, overdue' : 'This date has passed'}</Badge>;
  const done = job.status === 'completed' || job.status === 'cancelled';
  if (done || days === null || days < 0) return null;
  if (days === 0) return <Badge tone="blue" dot>Today</Badge>;
  if (days === 1) return <Badge tone="sky">Tomorrow</Badge>;
  return <Badge>In {days} days</Badge>;
}

/** When: a calendar-style tile for the day, the time in large type, and how soon it is. */
function VisitFact({ job, datePassed }: { job: Job; datePassed: boolean }) {
  if (!job.scheduled_at) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400" aria-hidden>
          <CalendarClock className="h-5 w-5" />
        </span>
        <p className="text-lg font-semibold text-slate-400">Not set yet</p>
      </div>
    );
  }
  const d = dateParts(job.scheduled_at);
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn('flex w-12 shrink-0 flex-col overflow-hidden rounded-lg text-center ring-1', datePassed ? 'ring-amber-300' : 'ring-brand-200')}
        aria-hidden
      >
        <span className={cn('py-0.5 text-[10px] font-semibold text-white', datePassed ? 'bg-amber-500' : 'bg-brand-600')}>{d.month}</span>
        <span className="bg-white py-0.5 text-lg font-bold leading-tight text-navy-900">{d.day}</span>
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-navy-900">
          {d.weekday}, {time(job.scheduled_at)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-normal text-slate-600">
          <WhenChip job={job} datePassed={datePassed} />
          {job.service_type && <span>{label(job.service_type)}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * The top of the job page: what's happening, what to do next, and the three facts people
 * look for first (who the customer is, who's going, and when).
 */
export function JobStatusPanel({ job, manage, onOpen }: { job: Job; manage: boolean; onOpen: (d: JobDialog) => void }) {
  const s = summarise(job, manage, Date.now());
  const style = toneStyle[s.tone];
  const c = job.customer;
  const address = [c?.address, c?.city, c?.pincode].filter(Boolean).join(', ');
  // Once a cancellation is asked for, the decision comes first: no other changes until it's made.
  const editable = manage && job.status !== 'cancel_requested';
  // Only worth flagging while the visit is still to come; afterwards the date is history.
  const stage = stageOf(job);
  const datePassed = isOverdue(job, Date.now()) && (stage === 'unassigned' || stage === 'scheduled');

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="job-next-step">
      <div className={cn('border-b px-5 py-5', style.band)}>
        {job.status !== 'cancelled' && (
          <div className="mb-4 max-w-xl">
            <Progress job={job} />
          </div>
        )}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', style.icon)} aria-hidden>{s.icon}</span>
            <div className="min-w-0">
              <p className={cn('text-xs font-semibold', style.cue)}>{s.cue}</p>
              <h2 id="job-next-step" className="text-lg font-semibold leading-snug text-navy-900">{s.title}</h2>
              {s.detail && <p className="mt-1 max-w-prose break-words text-sm text-slate-700">{s.detail}</p>}
            </div>
          </div>
          {/* On phones the stack is reversed so the main (last) button comes first, under the headline. */}
          <div className="flex shrink-0 flex-col-reverse items-start gap-2 pl-[3.375rem] sm:flex-row sm:flex-wrap sm:items-center md:justify-end md:pl-0">
            <StageActions job={job} manage={manage} onOpen={onOpen} />
          </div>
        </div>
      </div>

      <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        <Fact
          label="Customer"
          note={
            <>
              {c?.phone && <p><PhoneLink phone={c.phone} /></p>}
              {c?.alt_phone && <p><PhoneLink phone={c.alt_phone} /></p>}
              <p className={cn('break-words', !address && 'text-slate-400')}>{address || 'No address'}</p>
            </>
          }
        >
          <Link to={`/customers/${job.customer_id}`} className="text-brand-700 hover:underline">{c?.name}</Link>
        </Fact>

        <Fact
          label="Technician"
          action={editable && job.technician && (
            <ChangeLink hint="Hands the job to another technician. The new technician gets a push notification, the previous one is told it was reassigned, and the customer is sent the new technician’s details." onClick={() => onOpen('assign')}>
              Change
            </ChangeLink>
          )}
        >
          <TechnicianFact job={job} />
        </Fact>

        <Fact
          label="Visit on"
          action={editable && job.scheduled_at && (
            <ChangeLink hint="Moves the visit to a new date and time. The assigned technician is notified." onClick={() => onOpen('reschedule')}>
              Change
            </ChangeLink>
          )}
        >
          <VisitFact job={job} datePassed={datePassed} />
        </Fact>
      </div>
    </section>
  );
}
