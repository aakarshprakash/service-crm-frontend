import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownLeft, Check, ChevronRight, Landmark, Lock, Scale } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, money, relative, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CashClose, CashSummary } from '@/lib/types';
import { Avatar, Button, Card, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

type Tab = 'queue' | 'in_hand';

interface Overview {
  technicians: { technician: { id: number; name: string; branch: string | null }; cash_in_hand: number; last_close: { id: number; close_date: string; status: string } | null }[];
  pending_verification: number;
}

interface Ledger {
  technician: { id: number; name: string };
  cash_in_hand: number;
  entries: { date: string; type: 'collection' | 'deposit' | 'discrepancy'; description: string; amount: number; balance: number }[];
}

/** A technician holding cash whose last handover is this many days old (or who never handed over) is flagged. */
const OVERDUE_DAYS = 2;

/** Whole days between a YYYY-MM-DD date and today in the tenant timezone. */
function daysSince(day: string): number {
  return Math.round((new Date(today() + 'T00:00:00').getTime() - new Date(day + 'T00:00:00').getTime()) / 86400000);
}

function sinceLabel(day: string): string {
  const d = daysSince(day);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
}

type Holder = Overview['technicians'][number];

function isOverdue(t: Holder): boolean {
  return t.cash_in_hand > 0 && (!t.last_close || daysSince(t.last_close.close_date) >= OVERDUE_DAYS);
}

function useOverview() {
  return useQuery({ queryKey: ['cash-overview'], queryFn: () => api.get<Envelope<Overview>>('/accounts/overview').then((r) => r.data) });
}

export default function AccountsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'queue';
  const { is } = useAuth();
  const [forceClose, setForceClose] = useState(false);
  const overview = useOverview();

  return (
    <>
      <PageHeader
        title="Cash from technicians"
        description="Check the cash and cheques technicians hand over at the end of the day, and record where it was deposited."
        actions={
          is('admin') && (
            <Hint text="Submits a day’s cash close for a technician who couldn’t do it, e.g. they forgot. It skips the rule that earlier days must be closed first. That day’s payments are then locked.">
              <Button variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={() => setForceClose(true)}>
                Close on behalf of technician
              </Button>
            </Hint>
          )
        }
      />
      <Position data={overview.data} loading={overview.isLoading} onGo={(next) => setParams(next)} />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === 'queue' ? {} : { tab: v })}
        tabs={[
          { value: 'queue', label: 'Handovers to check', count: overview.data?.pending_verification || undefined },
          { value: 'in_hand', label: 'Cash still with technicians' },
        ]}
      />
      {tab === 'queue' ? <Queue /> : <InHand data={overview.data} loading={overview.isLoading} />}
      {forceClose && <ForceClose onClose={() => setForceClose(false)} />}
    </>
  );
}

/** The three things an accountant opens this page to find out, each a shortcut to the list that answers it. */
function Position({ data, loading, onGo }: { data: Overview | undefined; loading: boolean; onGo: (params: Record<string, string>) => void }) {
  const holders = data?.technicians.filter((t) => t.cash_in_hand > 0) ?? [];
  const total = holders.reduce((a, t) => a + t.cash_in_hand, 0);
  const overdue = data?.technicians.filter(isOverdue) ?? [];
  const pending = data?.pending_verification ?? 0;

  return (
    <section aria-label="Cash position" className="mb-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card sm:grid-cols-[1.4fr_1fr_1fr] sm:divide-x divide-y sm:divide-y-0 divide-slate-100">
      <PositionCell onClick={() => onGo({ tab: 'in_hand' })} loading={loading}>
        <p className="text-sm text-slate-500">Still with technicians</p>
        <p className="mt-1 text-[32px] font-bold leading-none tracking-tight tabular-nums text-navy-900">{money(total)}</p>
        <p className="mt-2 text-sm text-slate-500">
          {holders.length === 0 ? 'Everything has been handed over.' : `Held by ${holders.length} of ${data?.technicians.length ?? 0} technicians`}
        </p>
      </PositionCell>
      <PositionCell onClick={() => onGo({ status: 'submitted' })} loading={loading}>
        <p className="text-sm text-slate-500">Waiting for you to check</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', pending ? 'text-brand-700' : 'text-slate-400')}>{pending}</p>
        <p className="mt-2 text-sm text-slate-500">{pending ? (pending === 1 ? 'handover to count and verify' : 'handovers to count and verify') : 'You’re up to date.'}</p>
      </PositionCell>
      <PositionCell onClick={() => onGo({ tab: 'in_hand' })} loading={loading}>
        <p className="text-sm text-slate-500">Not handed over for {OVERDUE_DAYS}+ days</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', overdue.length ? 'text-amber-700' : 'text-slate-400')}>{overdue.length}</p>
        <p className="mt-2 truncate text-sm text-slate-500">{overdue.length ? overdue.map((t) => t.technician.name.split(' ')[0]).join(', ') : 'Everyone is handing over on time.'}</p>
      </PositionCell>
    </section>
  );
}

function PositionCell({ children, onClick, loading }: { children: ReactNode; onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full px-5 py-4 text-left sm:py-5 transition-colors hover:bg-slate-50/80 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
    >
      {loading ? (
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
          <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
        </div>
      ) : (
        children
      )}
      <ChevronRight className="absolute right-4 top-5 h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden />
    </button>
  );
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'To check' },
  { value: 'verified', label: 'To deposit' },
  { value: 'closed', label: 'Closed' },
];

/** Short or extra for a close: the accountant's count once verified, otherwise what the technician declared. */
function difference(c: CashClose): { amount: number; declared: boolean } {
  return c.status === 'submitted' ? { amount: c.amount_confirmed - c.expected_in_hand, declared: true } : { amount: c.discrepancy_amount, declared: false };
}

function DifferencePill({ close }: { close: CashClose }) {
  const { amount, declared } = difference(close);
  if (amount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Check className="h-3.5 w-3.5 text-accent-600" aria-hidden /> Matches
      </span>
    );
  }
  const short = amount < 0;
  return (
    <span
      title={declared ? 'Declared by the technician, not yet counted' : 'Found when the handover was counted'}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
        short ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-amber-50 text-amber-800 ring-amber-600/20',
      )}
    >
      {money(Math.abs(amount))} {short ? 'short' : 'extra'}
      {declared && <span className="font-normal opacity-70">(declared)</span>}
    </span>
  );
}

function Queue() {
  const navigate = useNavigate();
  const list = useListQuery<CashClose>('cash-closes', '/accounts/cash-close');
  const { data: techs } = useStaffOptions('technician');
  const f = list.filters;
  const status = f.status ?? '';
  return (
    <Card padded={false}>
      <FilterBar>
        <div role="radiogroup" aria-label="Status" className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={status === s.value}
              onClick={() => list.setFilter('status', s.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                status === s.value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Select value={f.technician_id ?? ''} onChange={(e) => list.setFilter('technician_id', e.target.value)} className="sm:w-48" aria-label="Technician">
          <option value="">All technicians</option>
          {techs?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={f.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From" />
        <Input type="date" value={f.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={f.discrepancy === '1'} onChange={(e) => list.setFilter('discrepancy', e.target.checked ? '1' : '')} />
          Short or extra only
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        onRowClick={(c) => navigate(`/accounts/cash-close/${c.id}`)}
        empty={
          <EmptyState
            title={status === 'submitted' ? 'Nothing to check' : 'No handovers match'}
            message={status === 'submitted' ? 'New handovers appear here when technicians close their day in the app.' : 'Technicians submit their daily cash from the app at the end of the day. Try clearing the filters.'}
          />
        }
        columns={[
          {
            key: 'date',
            header: 'Day',
            render: (c) => (
              <span className="block whitespace-nowrap">
                <span className="block font-medium text-slate-900">{date(c.close_date)}</span>
                <span className="hidden text-xs text-slate-500 sm:block">Sent {relative(c.submitted_at)}</span>
              </span>
            ),
          },
          {
            key: 'tech',
            header: 'Technician',
            render: (c) => (
              <span className="flex items-center gap-2.5">
                <Avatar name={c.technician?.name ?? '?'} className="hidden sm:inline-flex" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{c.technician?.name}</span>
                  {c.branch && <span className="hidden truncate text-xs text-slate-500 sm:block">{c.branch.name}</span>}
                  <span className="mt-1 block sm:hidden">
                    <StatusBadge status={c.status} />
                  </span>
                </span>
              </span>
            ),
          },
          { key: 'expected', header: 'Should hand over', hideOnMobile: true, render: (c) => <span className="text-slate-600">{money(c.expected_in_hand)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
          {
            key: 'declared',
            header: 'Handed over',
            className: 'text-right tabular-nums',
            headerClassName: 'text-right',
            render: (c) => (
              <span className="block whitespace-nowrap">
                <span className="block font-semibold text-navy-900">{money(c.amount_confirmed)}</span>
                <span className="mt-1 block sm:hidden">
                  <DifferencePill close={c} />
                </span>
              </span>
            ),
          },
          { key: 'disc', header: 'Difference', hideOnMobile: true, render: (c) => <DifferencePill close={c} /> },
          { key: 'carry', header: 'Still with them', hideOnMobile: true, render: (c) => <span className={c.closing_balance > 0 ? 'text-slate-900' : 'text-slate-400'}>{money(c.closing_balance)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
          {
            key: 'status',
            header: 'Status',
            hideOnMobile: true,
            render: (c) => (
              <span className="flex items-center gap-1.5">
                <StatusBadge status={c.status} />
                {c.force_closed && (
                  <span className="text-[11px] text-slate-500" title="Closed by an admin on the technician’s behalf">
                    by admin
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'go',
            header: '',
            hideOnMobile: true,
            className: 'w-24 text-right',
            render: (c) =>
              c.status === 'submitted' ? (
                <span className="inline-flex items-center gap-0.5 text-sm font-medium text-brand-700">
                  Check <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              ) : (
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
              ),
          },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
    </Card>
  );
}

/** Who is holding the company's money right now, biggest first, with anyone who's stopped handing over flagged. */
function InHand({ data, loading }: { data: Overview | undefined; loading: boolean }) {
  const [ledgerFor, setLedgerFor] = useState<number | null>(null);
  const holders = [...(data?.technicians ?? [])].filter((t) => t.cash_in_hand > 0).sort((a, b) => b.cash_in_hand - a.cash_in_hand);
  const clear = (data?.technicians ?? []).filter((t) => t.cash_in_hand <= 0);
  const max = holders[0]?.cash_in_hand ?? 0;

  if (loading) {
    return (
      <Card padded={false}>
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card padded={false}>
        {holders.length === 0 ? (
          <EmptyState icon={<Check className="h-6 w-6 text-accent-600" />} title="No cash with technicians" message="Every rupee collected has been handed over or deposited." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {holders.map((t) => {
              const overdue = isOverdue(t);
              return (
                <li key={t.technician.id}>
                  <button
                    type="button"
                    onClick={() => setLedgerFor(t.technician.id)}
                    aria-label={`Open cash ledger for ${t.technician.name}`}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:grid-cols-[auto_minmax(10rem,14rem)_1fr_auto]"
                  >
                    <Avatar name={t.technician.name} className="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{t.technician.name}</span>
                      <span className={cn('block truncate text-xs', overdue ? 'font-medium text-amber-700' : 'text-slate-500')}>
                        {overdue && <AlertTriangle className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />}
                        {t.last_close ? `Last handover ${sinceLabel(t.last_close.close_date).toLowerCase()}` : 'Has never handed over'}
                        {!overdue && t.technician.branch && ` · ${t.technician.branch}`}
                      </span>
                    </span>
                    <span className="col-span-3 row-start-2 h-2 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto" aria-hidden>
                      <span className={cn('block h-full rounded-full', overdue ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${Math.max(3, (t.cash_in_hand / max) * 100)}%` }} />
                    </span>
                    <span className="col-start-3 row-start-1 text-right text-base font-semibold tabular-nums text-navy-900 sm:col-start-auto sm:row-start-auto sm:min-w-[8rem]">{money(t.cash_in_hand)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {clear.length > 0 && (
        <p className="mt-3 px-1 text-sm text-slate-500">
          <Check className="mr-1 inline h-4 w-4 align-[-3px] text-accent-600" aria-hidden />
          Nothing in hand: {clear.map((t) => t.technician.name).join(', ')}
        </p>
      )}
      {ledgerFor && <LedgerDialog technicianId={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </>
  );
}

const ENTRY: Record<Ledger['entries'][number]['type'], { icon: ReactNode; tone: string }> = {
  collection: { icon: <ArrowDownLeft className="h-4 w-4" />, tone: 'bg-brand-50 text-brand-700' },
  deposit: { icon: <Landmark className="h-4 w-4" />, tone: 'bg-accent-50 text-accent-700' },
  discrepancy: { icon: <Scale className="h-4 w-4" />, tone: 'bg-red-50 text-red-700' },
};

function LedgerDialog({ technicianId, onClose }: { technicianId: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['ledger', technicianId], queryFn: () => api.get<Envelope<Ledger>>('/accounts/ledger', { technician_id: technicianId }).then((r) => r.data) });
  return (
    <Modal open onClose={onClose} size="xl" title={q.data ? `${q.data.technician.name}’s cash ledger` : 'Cash ledger'} description="Every collection, deposit and correction, newest first.">
      {q.data && (
        <div className="mb-4 flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-500">Holding now</span>
          <span className="text-xl font-bold tabular-nums text-navy-900">{money(q.data.cash_in_hand)}</span>
        </div>
      )}
      <DataTable
        rows={q.data?.entries.map((e, i) => ({ ...e, id: i }))}
        loading={q.isLoading}
        empty={<EmptyState title="No cash movements yet" message="Collections appear here once this technician takes cash or a cheque on a job." />}
        columns={[
          {
            key: 'desc',
            header: 'Entry',
            render: (e) => (
              <span className="flex items-center gap-3">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', ENTRY[e.type].tone)} aria-hidden>
                  {ENTRY[e.type].icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-slate-900">{e.description}</span>
                  <span className="block text-xs text-slate-500">{dateTime(e.date)}</span>
                </span>
              </span>
            ),
          },
          {
            key: 'amt',
            header: 'Amount',
            render: (e) => <span className={cn('font-medium', e.type === 'deposit' ? 'text-accent-700' : e.type === 'discrepancy' ? 'text-red-700' : 'text-slate-900')}>{e.amount > 0 ? '+' : ''}{money(e.amount)}</span>,
            className: 'text-right tabular-nums whitespace-nowrap',
            headerClassName: 'text-right',
          },
          { key: 'bal', header: 'Balance', render: (e) => money(e.balance), className: 'text-right tabular-nums whitespace-nowrap text-slate-600', headerClassName: 'text-right' },
        ]}
      />
    </Modal>
  );
}

/** FR-15.4 admin override: submit a close for an unavailable technician. */
function ForceClose({ onClose }: { onClose: () => void }) {
  const { data: techs } = useStaffOptions('technician');
  const [tech, setTech] = useState('');
  const [day, setDay] = useState(today());
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const summary = useQuery({
    queryKey: ['cash-summary', tech, day],
    queryFn: () => api.get<Envelope<CashSummary>>('/accounts/cash-summary', { technician_id: tech, date: day }).then((r) => r.data),
    enabled: !!tech,
  });
  const m = useApiMutation(() => api.post('/accounts/cash-close', { technician_id: Number(tech), date: day, amount_confirmed: toMinor(amount), remarks: remarks || null }), {
    invalidate: [['cash-closes'], ['cash-overview']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const s = summary.data;
  return (
    <Modal
      open
      onClose={onClose}
      title="Close cash on behalf of a technician"
      description="Use when a technician is unavailable. The close is marked as forced in the audit trail."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!tech || !s || !!s.close} onClick={() => m.mutate(undefined)}>
            Submit close
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Technician" required>
            <Select value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Select…</option>
              {techs?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required error={fieldError(m.error, 'date')}>
            <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        {s && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            {s.close ? (
              <p>This date is already closed.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <span className="text-slate-500">Opening (carried)</span> <span className="text-right tabular-nums">{money(s.opening_balance)}</span>
                <span className="text-slate-500">Cash</span> <span className="text-right tabular-nums">{money(s.cash)}</span>
                <span className="text-slate-500">Cheques</span> <span className="text-right tabular-nums">{money(s.cheque)}</span>
                <span className="font-medium">Expected in hand</span>
                <button type="button" className="text-right font-semibold tabular-nums text-brand-700 hover:underline" onClick={() => setAmount(toMajor(s.expected_in_hand) || '0')}>
                  {money(s.expected_in_hand)}
                </button>
              </div>
            )}
          </div>
        )}
        <Field label="Amount actually handed over" required error={fieldError(m.error, 'amount_confirmed')}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Remarks" error={fieldError(m.error, 'remarks')} hint="Required if the amount differs from expected.">
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
