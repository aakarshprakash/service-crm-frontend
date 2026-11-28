import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronRight, HandCoins, ImageIcon, Landmark, ReceiptText, UserRound, X } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CashClose, ExpenseClaim } from '@/lib/types';
import { Avatar, Button, Field, Input, Modal, Textarea } from '@/components/ui';
import { DecideDialog } from '@/pages/expenses/ExpenseClaimsPage';

const SHOWN = 5;

/** A handover as the list gives it: whether it is the technician's latest, which holds the cash to take in. */
type Handover = CashClose & { is_latest?: boolean; latest_close_date?: string | null };
interface Later {
  date: string;
  /** That later day is also waiting to be checked. */
  waiting: boolean;
}

/**
 * The top of the daily register: what is waiting for the accountant today, each with its action right here.
 * Technicians' cash handovers to count and take in, and staff expense claims to approve.
 */
export function DailyDesk() {
  const { can } = useAuth();
  // Enough to see each technician's latest waiting day: cash can only be taken in against the latest one.
  const handovers = useQuery({
    queryKey: ['cash-closes', { status: 'submitted', per_page: '50' }],
    queryFn: () => api.get<Paginated<Handover>>('/accounts/cash-close', { status: 'submitted', per_page: 50 }),
    enabled: can('cash.verify'),
  });
  // Oldest first, the order they should be checked in.
  const waiting = [...(handovers.data?.data ?? [])].sort((a, b) => a.close_date.localeCompare(b.close_date) || a.id - b.id);
  // An older day's cash travels with the technician's latest handover: it is taken in there, not here.
  const laterOf = (c: Handover): Later | null =>
    c.is_latest === false && c.latest_close_date ? { date: c.latest_close_date, waiting: waiting.some((o) => o.technician_id === c.technician_id && o.close_date === c.latest_close_date) } : null;
  const claims = useQuery({
    queryKey: ['expense-claims', { status: 'pending', per_page: String(SHOWN) }],
    queryFn: () => api.get<Paginated<ExpenseClaim> & { meta: { pending_count?: number; pending_amount?: number } }>('/expense-claims', { status: 'pending', per_page: SHOWN }),
    enabled: can('expenses.manage'),
  });
  const [taking, setTaking] = useState<Handover | null>(null);
  const [deciding, setDeciding] = useState<{ claim: ExpenseClaim; action: 'approve' | 'reject' } | null>(null);

  const showHandovers = can('cash.verify');
  const showClaims = can('expenses.manage');
  if (!showHandovers && !showClaims) return null;
  const handoverCount = handovers.data?.meta.total ?? 0;
  const claimCount = claims.data?.meta.pending_count ?? claims.data?.meta.total ?? 0;
  const loading = (showHandovers && handovers.isLoading) || (showClaims && claims.isLoading);

  if (!loading && !handoverCount && !claimCount) {
    return (
      <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900 print:hidden">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        Nothing waiting for you: every handover from technicians is checked{showClaims ? ' and every staff claim is decided' : ''}.
      </p>
    );
  }

  return (
    <section aria-label="Waiting for you" className={cn('mb-5 grid gap-4 print:hidden', showHandovers && showClaims && 'lg:grid-cols-2')}>
      {showHandovers && (
        <DeskCard
          icon={<HandCoins className="h-4 w-4" />}
          title="Cash from technicians to check"
          count={handoverCount}
          empty="Every handover is checked."
          loading={handovers.isLoading}
          more={{ to: '/accounts/cash-close', label: handoverCount > SHOWN ? `See all ${handoverCount}` : 'All handovers' }}
        >
          {waiting.slice(0, SHOWN).map((c) => {
            const diff = c.amount_confirmed - c.expected_in_hand;
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={c.technician?.name ?? '?'} className="hidden h-8 w-8 sm:inline-flex" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{c.technician?.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {date(c.close_date)} · hands over <span className="font-medium tabular-nums text-slate-700">{money(c.amount_confirmed)}</span>
                    {diff !== 0 && <span className={cn('ml-1 font-medium', diff < 0 ? 'text-red-700' : 'text-amber-700')}>({money(Math.abs(diff))} {diff < 0 ? 'short' : 'extra'})</span>}
                  </p>
                </div>
                <Button size="sm" onClick={() => setTaking(c)}>
                  Count &amp; take
                </Button>
              </li>
            );
          })}
        </DeskCard>
      )}
      {showClaims && (
        <DeskCard
          icon={<ReceiptText className="h-4 w-4" />}
          title="Staff expense claims to approve"
          count={claimCount}
          total={claims.data?.meta.pending_amount}
          empty="No claims are waiting."
          loading={claims.isLoading}
          more={{ to: '/accounts/expense-claims', label: claimCount > SHOWN ? `See all ${claimCount}` : 'All claims' }}
        >
          {claims.data?.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {c.user?.name} · <span className="tabular-nums">{money(c.amount)}</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {[c.category?.name, date(c.claim_date), c.paid_from === 'cash_in_hand' ? 'from collected cash' : 'own money, to reimburse'].filter(Boolean).join(' · ')}
                  {c.receipt_url && (
                    <a href={c.receipt_url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                      <ImageIcon className="h-3 w-3" aria-hidden /> Receipt
                    </a>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setDeciding({ claim: c, action: 'approve' })}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Reject ${c.user?.name}'s claim`} onClick={() => setDeciding({ claim: c, action: 'reject' })}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </DeskCard>
      )}
      {taking && <TakeCashDialog close={taking} later={laterOf(taking)} onClose={() => setTaking(null)} />}
      {deciding && <DecideDialog claim={deciding.claim} action={deciding.action} onClose={() => setDeciding(null)} />}
    </section>
  );
}

function DeskCard({ icon, title, count, total, empty, loading, more, children }: {
  icon: React.ReactNode; title: string; count: number; total?: number; empty: string; loading: boolean; more: { to: string; label: string }; children: React.ReactNode;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-white shadow-card', count ? 'border-amber-300' : 'border-slate-200')}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', count ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500')}>{icon}</span>
          {title}
          {count > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-900">{count}</span>}
        </h2>
        {!!total && <span className="text-sm font-medium tabular-nums text-slate-700">{money(total)}</span>}
      </div>
      {loading ? (
        <div className="space-y-2 p-4">
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : count ? (
        <ul className="divide-y divide-slate-100">{children}</ul>
      ) : (
        <p className="px-4 py-5 text-sm text-slate-500">{empty}</p>
      )}
      <Link to={more.to} className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-2 text-xs font-medium text-brand-700 hover:bg-slate-50">
        {more.label} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

type Destination = 'office' | 'bank' | 'keep';

/**
 * Checking a handover and taking the cash in, in one go: count what the technician hands over, then say
 * where it went (the office drawer or the bank). Before, these were two steps on two screens.
 */
export function TakeCashDialog({ close, later, onClose }: { close: CashClose; later?: Later | null; onClose: () => void }) {
  const [counted, setCounted] = useState(toMajor(close.amount_confirmed) || '0');
  const [remarks, setRemarks] = useState('');
  // A later day is still waiting: its handover carries this day's cash, so the cash is taken in with that one.
  const [dest, setDest] = useState<Destination>(later ? 'keep' : 'office');
  const [reference, setReference] = useState('');
  const diff = toMinor(counted) - close.expected_in_hand;
  const m = useApiMutation(
    async () => {
      const verified = await api.patch<Envelope<CashClose>>(`/accounts/cash-close/${close.id}/verify`, { amount_verified: toMinor(counted), discrepancy_remarks: remarks || null });
      const left = verified.data.closing_balance;
      if (dest === 'keep' || left <= 0) return { message: 'Handover checked.' };
      try {
        await api.post(`/accounts/cash-close/${close.id}/deposit`, { amount: left, deposited_to: dest, reference_no: dest === 'bank' ? reference : null, deposit_date: today() });
      } catch (e) {
        // The count is saved; only taking the cash in failed (for example, a later handover holds it).
        return { message: `Handover checked. The cash wasn’t taken in: ${e instanceof Error ? e.message : 'try again from the handover'}` };
      }
      return { message: dest === 'office' ? `Checked. ${money(left)} is now in the office cash.` : `Checked. ${money(left)} recorded as paid into the bank.` };
    },
    { invalidate: [['cash-closes'], ['cash-overview'], ['cash-close', String(close.id)], ['books']], toastValidation: false, onSuccess: onClose },
  );
  const needsRef = dest === 'bank' && !reference.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cash from ${close.technician?.name ?? 'technician'}`}
      description={`${date(close.close_date)} · should hand over ${money(close.expected_in_hand)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={needsRef || (diff !== 0 && !remarks.trim())} onClick={() => m.mutate(undefined)}>
            {dest === 'keep' ? 'Save the count' : 'Save and take the cash'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <dt className="text-slate-500">Carried from before</dt>
          <dd className="text-right tabular-nums">{money(close.opening_balance)}</dd>
          <dt className="text-slate-500">Cash and cheques collected</dt>
          <dd className="text-right tabular-nums">{money(close.total_cash_collected + close.total_cheque_collected)}</dd>
          <dt className="font-medium text-slate-900">Should hand over</dt>
          <dd className="text-right font-semibold tabular-nums text-slate-900">{money(close.expected_in_hand)}</dd>
          <dt className="text-slate-500">Technician says</dt>
          <dd className="text-right tabular-nums">{money(close.amount_confirmed)}</dd>
        </dl>
        {close.technician_remarks && <p className="text-sm text-slate-600">Technician’s note: “{close.technician_remarks}”</p>}

        <Field label="How much did you count?" required error={fieldError(m.error, 'amount_verified')}>
          <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))} autoFocus className="h-11 text-lg tabular-nums" />
        </Field>
        {diff !== 0 && (
          <>
            <p className={cn('rounded-lg p-3 text-sm', diff < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
              <strong>
                {money(Math.abs(diff))} {diff < 0 ? 'short' : 'extra'}.
              </strong>{' '}
              Count again. If it is still different, say why.
            </p>
            <Field label="Why is it different?" required error={fieldError(m.error, 'discrepancy_remarks')}>
              <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
            </Field>
          </>
        )}

        {later ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {later.waiting ? (
              <>
                {close.technician?.name ?? 'The technician'}’s handover for <strong>{date(later.date)}</strong> is also waiting and includes this day’s cash. Save this count now, then take the cash in when you check {date(later.date)}.
              </>
            ) : (
              <>
                This day’s cash was carried into {close.technician?.name ?? 'the technician'}’s handover for <strong>{date(later.date)}</strong>, which is already checked. Only the count is saved here.
              </>
            )}
          </p>
        ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Where is the cash now?</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {(
              [
                ['office', 'In the office', 'Goes into the office cash', <Building2 key="o" className="h-4 w-4" />],
                ['bank', 'Paid into the bank', 'Needs the slip number', <Landmark key="b" className="h-4 w-4" />],
                ['keep', 'Still with them', 'Only save the count', <UserRound key="k" className="h-4 w-4" />],
              ] as const
            ).map(([value, label, hint, icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={dest === value}
                onClick={() => setDest(value)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  dest === value ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {icon} {label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        )}
        {dest === 'bank' && (
          <Field label="Bank deposit slip / reference" required error={fieldError(m.error, 'reference_no')}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </Field>
        )}
        {fieldError(m.error, 'cash_close') && <p className="text-sm text-red-700">{fieldError(m.error, 'cash_close')}</p>}
      </div>
    </Modal>
  );
}
