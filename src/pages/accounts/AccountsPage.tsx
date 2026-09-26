import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Lock } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, money, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CashClose, CashSummary } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, Select, StatCard, Tabs, Textarea } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

type Tab = 'queue' | 'in_hand';

export default function AccountsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'queue';
  const { is } = useAuth();
  const [forceClose, setForceClose] = useState(false);

  return (
    <>
      <PageHeader
        title="Daily cash close"
        description="Reconcile cash & cheques collected by service agents against what is handed over and deposited."
        actions={
          is('admin') && (
            <Button variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={() => setForceClose(true)}>
              Close on behalf of technician
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === 'queue' ? {} : { tab: v })}
        tabs={[
          { value: 'queue', label: 'Cash closes' },
          { value: 'in_hand', label: 'Cash in hand' },
        ]}
      />
      {tab === 'queue' ? <Queue /> : <InHand />}
      {forceClose && <ForceClose onClose={() => setForceClose(false)} />}
    </>
  );
}

function Queue() {
  const navigate = useNavigate();
  const list = useListQuery<CashClose>('cash-closes', '/accounts/cash-close');
  const { data: techs } = useStaffOptions('technician');
  const f = list.filters;
  return (
    <Card padded={false}>
      <FilterBar>
        <Select value={f.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} className="sm:w-48" aria-label="Status">
          <option value="">All statuses</option>
          <option value="submitted">Awaiting verification</option>
          <option value="verified">Verified (cash pending)</option>
          <option value="closed">Closed</option>
        </Select>
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
          Discrepancies only
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        onRowClick={(c) => navigate(`/accounts/${c.id}`)}
        rowClassName={(c) => (c.discrepancy_amount !== 0 || c.amount_confirmed !== c.expected_in_hand ? 'bg-amber-50/60' : undefined)}
        empty={<EmptyState title="No cash closes" message="Technicians submit their daily cash from the app at the end of the day." />}
        columns={[
          { key: 'date', header: 'Date', render: (c) => <span className="font-medium text-slate-900">{date(c.close_date)}</span> },
          { key: 'tech', header: 'Technician', render: (c) => c.technician?.name },
          { key: 'branch', header: 'Branch', hideOnMobile: true, render: (c) => c.branch?.name ?? '—' },
          { key: 'expected', header: 'Expected', render: (c) => money(c.expected_in_hand), className: 'text-right tabular-nums', headerClassName: 'text-right' },
          {
            key: 'declared',
            header: 'Declared',
            className: 'text-right tabular-nums',
            headerClassName: 'text-right',
            render: (c) => (
              <span className={cn(c.amount_confirmed !== c.expected_in_hand && 'font-medium text-amber-800')}>
                {c.amount_confirmed !== c.expected_in_hand && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                {money(c.amount_confirmed)}
              </span>
            ),
          },
          { key: 'disc', header: 'Discrepancy', hideOnMobile: true, render: (c) => (c.status === 'submitted' ? '—' : <span className={c.discrepancy_amount ? 'font-medium text-red-700' : ''}>{money(c.discrepancy_amount)}</span>), className: 'text-right tabular-nums', headerClassName: 'text-right' },
          { key: 'carry', header: 'Carry fwd', hideOnMobile: true, render: (c) => money(c.closing_balance), className: 'text-right tabular-nums', headerClassName: 'text-right' },
          { key: 'status', header: 'Status', render: (c) => <span className="flex items-center gap-1"><StatusBadge status={c.status} />{c.force_closed && <span className="text-[11px] text-slate-500">forced</span>}</span> },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
    </Card>
  );
}

interface Overview {
  technicians: { technician: { id: number; name: string; branch: string | null }; cash_in_hand: number; last_close: { id: number; close_date: string; status: string } | null }[];
  pending_verification: number;
}

interface Ledger {
  technician: { id: number; name: string };
  cash_in_hand: number;
  entries: { date: string; type: 'collection' | 'deposit' | 'discrepancy'; description: string; amount: number; balance: number }[];
}

function InHand() {
  const q = useQuery({ queryKey: ['cash-overview'], queryFn: () => api.get<Envelope<Overview>>('/accounts/overview').then((r) => r.data) });
  const [ledgerFor, setLedgerFor] = useState<number | null>(null);
  const total = q.data?.technicians.reduce((a, t) => a + t.cash_in_hand, 0) ?? 0;
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <StatCard label="Cash & cheques with technicians" value={money(total)} tone={total > 0 ? 'amber' : 'green'} />
        <StatCard label="Closes awaiting verification" value={q.data?.pending_verification ?? 0} tone="blue" />
      </div>
      <Card padded={false}>
        <DataTable
          rows={q.data?.technicians.map((t) => ({ ...t, id: t.technician.id }))}
          loading={q.isLoading}
          onRowClick={(r) => setLedgerFor(r.id)}
          columns={[
            { key: 'name', header: 'Technician', render: (r) => <span className="font-medium text-slate-900">{r.technician.name}</span> },
            { key: 'branch', header: 'Branch', hideOnMobile: true, render: (r) => r.technician.branch ?? '—' },
            { key: 'last', header: 'Last close', render: (r) => (r.last_close ? <span className="flex items-center gap-2">{date(r.last_close.close_date)} <StatusBadge status={r.last_close.status} /></span> : 'Never') },
            { key: 'hand', header: 'Cash in hand', render: (r) => <span className={r.cash_in_hand > 0 ? 'font-semibold text-amber-800' : ''}>{money(r.cash_in_hand)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            { key: 'act', header: '', render: () => <BookOpen className="h-4 w-4 text-slate-400" />, className: 'w-8' },
          ]}
        />
      </Card>
      {ledgerFor && <LedgerDialog technicianId={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </>
  );
}

function LedgerDialog({ technicianId, onClose }: { technicianId: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['ledger', technicianId], queryFn: () => api.get<Envelope<Ledger>>('/accounts/ledger', { technician_id: technicianId }).then((r) => r.data) });
  return (
    <Modal open onClose={onClose} size="xl" title={`Cash ledger · ${q.data?.technician.name ?? ''}`} description={q.data ? `Currently holding ${money(q.data.cash_in_hand)}` : undefined}>
      <DataTable
        rows={q.data?.entries.map((e, i) => ({ ...e, id: i }))}
        loading={q.isLoading}
        empty={<EmptyState title="No cash movements yet" />}
        columns={[
          { key: 'date', header: 'Date', render: (e) => dateTime(e.date) },
          { key: 'desc', header: 'Entry', render: (e) => e.description },
          { key: 'amt', header: 'Amount', render: (e) => <span className={e.amount < 0 ? 'text-emerald-700' : e.type === 'discrepancy' ? 'text-red-700' : ''}>{money(e.amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
          { key: 'bal', header: 'Balance', render: (e) => money(e.balance), className: 'text-right tabular-nums font-medium', headerClassName: 'text-right' },
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
