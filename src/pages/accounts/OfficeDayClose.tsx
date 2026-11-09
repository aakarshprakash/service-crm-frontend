import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Lock, LockOpen } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { money, toMinor } from '@/lib/format';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, ConfirmDialog, Field, Input, Modal, QueryState, Textarea } from '@/components/ui';

export interface OfficeClose {
  id: number;
  close_date: string;
  period_from: string;
  opening_cash: number;
  counter_receipts: number;
  other_income: number;
  from_technicians: number;
  from_bank: number;
  cash_expenses: number;
  to_bank: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  remarks: string | null;
  closed_by: string | null;
  closed_at: string | null;
  reopenable: boolean;
}

type Flows = Pick<OfficeClose, 'counter_receipts' | 'other_income' | 'from_technicians' | 'from_bank' | 'cash_expenses' | 'to_bank'>;

interface Preview {
  date: string;
  closed_through: string | null;
  close: OfficeClose | null;
  with_technicians: number;
  can_close: boolean;
  period_from: string | null;
  previous: { date: string; counted_cash: number } | null;
  needs_opening: boolean;
  opening_cash: number | null;
  flows: Flows | null;
  expected_cash: number | null;
}

const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const INVALIDATE = [['books'], ['office-close']];

/** The steps of the drawer sum, in plain words. Only the ones that moved money are shown. */
const STEPS: { key: keyof Flows; label: string; sign: '+' | '−' }[] = [
  { key: 'counter_receipts', label: 'Customers paid at the office', sign: '+' },
  { key: 'from_technicians', label: 'Technicians handed over', sign: '+' },
  { key: 'other_income', label: 'Other money received in cash', sign: '+' },
  { key: 'from_bank', label: 'Taken out of the bank', sign: '+' },
  { key: 'cash_expenses', label: 'Paid out in cash', sign: '−' },
  { key: 'to_bank', label: 'Put in the bank', sign: '−' },
];

/** "₹10.00 short", "₹5.00 extra" or "Matches". */
export function CountDifference({ amount, className }: { amount: number; className?: string }) {
  if (amount === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm font-medium text-accent-700', className)}>
        <Check className="h-4 w-4" aria-hidden /> Matches
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', amount < 0 ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-amber-50 text-amber-800 ring-amber-600/20', className)}>
      {money(Math.abs(amount))} {amount < 0 ? 'short' : 'extra'}
    </span>
  );
}

/** The foot of a register day: count the office cash and close the day, or see what was counted. */
export function OfficeCloseBand({ date, close, locked, isToday }: { date: string; close: OfficeClose | null; locked: boolean; isToday: boolean }) {
  const { can } = useAuth();
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const reopen = useApiMutation(() => api.delete(`/books/day-close/${close!.id}`), { invalidate: INVALIDATE, onSuccess: () => setReopening(false) });

  if (close) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white" aria-hidden>
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-navy-900">
              Day closed. Cash in the office: <span className="tabular-nums">{money(close.counted_cash)}</span>
              <CountDifference amount={close.difference} />
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Counted by {close.closed_by ?? 'a staff member'} on {clock(close.closed_at)}
              {close.difference !== 0 && `. It should have been ${money(close.expected_cash)}`}.
            </p>
            {close.remarks && <p className="mt-1 text-sm text-slate-700">“{close.remarks}”</p>}
          </div>
        </div>
        {close.reopenable && can('books.reopen') && (
          <Button variant="secondary" size="sm" icon={<LockOpen className="h-4 w-4" />} onClick={() => setReopening(true)} className="print:hidden">
            Reopen day
          </Button>
        )}
        <ConfirmDialog
          open={reopening}
          onClose={() => setReopening(false)}
          onConfirm={() => reopen.mutate(undefined)}
          loading={reopen.isPending}
          title="Reopen this day?"
          confirmLabel="Reopen day"
          message={`Entries ${close.period_from === close.close_date ? `on ${shortDay(close.close_date)}` : `from ${shortDay(close.period_from)} to ${shortDay(close.close_date)}`} can be changed again. Count the cash and close the day again when you’re done.`}
        />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        This day is closed, so its entries can’t be changed. The cash was counted on a later day.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 print:hidden">
      <div className="min-w-0">
        <p className="font-semibold text-navy-900">{isToday ? 'Done for the day?' : 'This day isn’t closed yet'}</p>
        <p className="mt-0.5 max-w-xl text-sm text-slate-500">Count the cash in the office and close the day. After that, this day’s entries can’t be changed.</p>
      </div>
      {can('books.close') && (
        <Button icon={<Lock className="h-4 w-4" />} onClick={() => setClosing(true)}>
          Count cash and close
        </Button>
      )}
      {closing && <CloseDayDialog date={date} onClose={() => setClosing(false)} />}
    </div>
  );
}

function CloseDayDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['office-close', date], queryFn: () => api.get<Envelope<Preview>>('/books/day-close', { date }).then((r) => r.data) });
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [remarks, setRemarks] = useState('');
  const [showSum, setShowSum] = useState(false);
  const p = q.data;

  const start = p?.needs_opening ? (opening === '' ? null : toMinor(opening)) : (p?.opening_cash ?? null);
  const f = p?.flows;
  const expected = f && start !== null ? start + f.counter_receipts + f.other_income + f.from_technicians + f.from_bank - f.cash_expenses - f.to_bank : null;
  const diff = expected !== null && counted !== '' ? toMinor(counted) - expected : null;

  const m = useApiMutation(
    () => api.post('/books/day-close', { date, counted_cash: toMinor(counted), opening_cash: p?.needs_opening ? toMinor(opening) : null, remarks: remarks || null }),
    { invalidate: INVALIDATE, toastValidation: false, onSuccess: onClose },
  );
  const dayError = fieldError(m.error, 'date');
  const longDay = new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const moved = f ? STEPS.filter((s) => f[s.key]) : [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Count cash and close the day"
      description={longDay}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!p?.can_close || counted === '' || (p.needs_opening && opening === '')} icon={<Lock className="h-4 w-4" />} onClick={() => m.mutate(undefined)}>
            Close the day
          </Button>
        </>
      }
    >
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {p && !p.can_close && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {p.close ? 'This day is already closed.' : p.closed_through ? `Days up to ${shortDay(p.closed_through)} are already closed.` : 'This day can’t be closed yet.'}
          </p>
        )}
        {p?.can_close && f && (
          <div className="space-y-5">
            {p.needs_opening && (
              <Field label="How much cash was in the office at the start of this day?" required hint="Only asked the first time. After this, each day starts from your last count." error={fieldError(m.error, 'opening_cash')}>
                <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ''))} autoFocus placeholder="0" />
              </Field>
            )}

            <div className="rounded-xl bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-600">The office should have</p>
              <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums text-navy-900">{expected === null ? '—' : money(expected)}</p>
              {expected === null && <p className="mt-1 text-sm text-slate-500">Enter the cash at the start of the day first.</p>}
              <button type="button" onClick={() => setShowSum((s) => !s)} aria-expanded={showSum} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                How is this worked out? <ChevronDown className={cn('h-4 w-4 transition-transform', showSum && 'rotate-180')} aria-hidden />
              </button>
              {showSum && (
                <dl className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
                  <SumLine label={p.previous ? `Cash you counted on ${shortDay(p.previous.date)}` : 'Cash at the start of the day'} value={start === null ? '—' : money(start)} />
                  {moved.map((s) => (
                    <SumLine key={s.key} label={s.label} value={`${s.sign} ${money(f[s.key])}`} tone={s.sign === '+' ? 'text-emerald-700' : 'text-red-700'} />
                  ))}
                  {!moved.length && <p className="text-slate-500">No cash came into or went out of the office{p.period_from !== date ? ` since ${shortDay(p.period_from!)}` : ' this day'}.</p>}
                  {p.with_technicians > 0 && <p className="pt-1 text-xs text-slate-500">Cash still with technicians ({money(p.with_technicians)}) isn’t in the office, so it’s not counted here.</p>}
                </dl>
              )}
            </div>

            <Field label="How much cash did you count?" required error={fieldError(m.error, 'counted_cash')}>
              <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))} autoFocus={!p.needs_opening} placeholder="0" className="h-12 text-lg tabular-nums" />
            </Field>

            {diff !== null &&
              (diff === 0 ? (
                <p className="flex items-center gap-2 rounded-lg bg-accent-50 p-3 text-sm font-medium text-accent-800">
                  <Check className="h-4 w-4" aria-hidden /> The count matches.
                </p>
              ) : (
                <>
                  <p className={cn('rounded-lg p-3 text-sm', diff < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
                    <strong>
                      {money(Math.abs(diff))} {diff < 0 ? 'short' : 'extra'}.
                    </strong>{' '}
                    Count again to be sure. If it’s still different, say why below and close the day.
                  </p>
                  <Field label="Why is it different?" required error={fieldError(m.error, 'remarks')}>
                    <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} placeholder="For example: gave change to a customer and didn’t note it" />
                  </Field>
                </>
              ))}
            {dayError && <p className="text-sm text-red-700">{dayError}</p>}

            <p className="flex gap-2 text-xs text-slate-500">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              After closing, entries for {shortDay(date)} and earlier can’t be added, changed or deleted. Technicians can keep collecting.
            </p>
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

function SumLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className={cn('tabular-nums', tone ?? 'text-slate-900')}>{value}</dd>
    </div>
  );
}
