import { useState } from 'react';
import { Link } from 'react-router';
import { Check, ImageIcon, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fieldError, useApiMutation, useListQuery, useStaffOptions } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { ExpenseClaim, ExpenseMethod } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, Field, FilterBar, Modal, PageHeader, Pagination, Select, StatCard, Tabs, Textarea } from '@/components/ui';

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const;
const METHODS: [ExpenseMethod, string][] = [['cash', 'Cash'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque']];

/**
 * Expense claims from technicians and staff. Approving books the expense; claims paid
 * from collected cash were already deducted from the technician's cash close.
 */
export default function ExpenseClaimsPage() {
  const list = useListQuery<ExpenseClaim>('expense-claims', '/expense-claims', { status: 'pending' }, (f) => ({ ...f, status: f.status === 'all' ? undefined : f.status }));
  const { data: staff } = useStaffOptions();
  const [deciding, setDeciding] = useState<{ claim: ExpenseClaim; action: 'approve' | 'reject' } | null>(null);
  const f = list.filters;
  const meta = list.data?.meta as { pending_count?: number; pending_amount?: number } | undefined;

  return (
    <>
      <PageHeader
        title="Expense claims"
        description="What technicians and staff spent in the field. Approving a claim records it in Expenses."
        back={
          <Link to="/accounts/expenses" className="mb-2 inline-flex text-sm text-slate-500 hover:text-slate-700">
            ← Expenses
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting for approval" value={meta?.pending_count ?? 0} tone="amber" />
        <StatCard label="Pending amount" value={money(meta?.pending_amount ?? 0)} tone="slate" />
      </div>
      <Card padded={false}>
        <Tabs
          className="px-3"
          value={(f.status ?? 'pending') as 'pending' | 'approved' | 'rejected' | 'all'}
          onChange={(v) => list.setFilter('status', v)}
          tabs={[
            { value: 'pending', label: 'Pending', count: meta?.pending_count || undefined },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
        <FilterBar>
          <Select value={f.user_id ?? ''} onChange={(e) => list.setFilter('user_id', e.target.value)} className="sm:w-56" aria-label="Staff member">
            <option value="">All staff</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          empty={<EmptyState title={f.status === 'pending' || !f.status ? 'No claims waiting' : 'No claims'} message="Technicians add expenses from the mobile app (My cash → Expenses)." />}
          columns={[
            { key: 'date', header: 'Date', render: (c) => <span className="font-medium text-slate-900">{date(c.claim_date)}</span> },
            {
              key: 'who',
              header: 'Staff',
              render: (c) => (
                <div>
                  <p>{c.user?.name}</p>
                  <p className="text-xs text-slate-500">{c.paid_from === 'cash_in_hand' ? 'From collected cash' : 'Own money · reimburse'}</p>
                </div>
              ),
            },
            {
              key: 'what',
              header: 'Expense',
              render: (c) => (
                <div>
                  <p>
                    {c.category?.name}
                    {c.job && (
                      <Link to={`/jobs/${c.job.id}`} className="ml-2 text-xs text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.job.crm_call_id}
                      </Link>
                    )}
                  </p>
                  {c.description && <p className="max-w-xs truncate text-xs text-slate-500">{c.description}</p>}
                  {c.status === 'rejected' && c.decision_note && <p className="text-xs text-red-700">Rejected: {c.decision_note}</p>}
                </div>
              ),
            },
            {
              key: 'receipt',
              header: 'Receipt',
              hideOnMobile: true,
              render: (c) =>
                c.receipt_url ? (
                  <a href={c.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    <ImageIcon className="h-4 w-4" /> View
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
            },
            { key: 'status', header: 'Status', render: (c) => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge> },
            { key: 'amt', header: 'Amount', render: (c) => <span className="font-medium">{money(c.amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            {
              key: 'act',
              header: '',
              className: 'text-right',
              render: (c) =>
                c.status === 'pending' ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setDeciding({ claim: c, action: 'approve' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" aria-label="Reject" onClick={() => setDeciding({ claim: c, action: 'reject' })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{c.decider?.name}</span>
                ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {deciding && <DecideDialog claim={deciding.claim} action={deciding.action} onClose={() => setDeciding(null)} />}
    </>
  );
}

function DecideDialog({ claim, action, onClose }: { claim: ExpenseClaim; action: 'approve' | 'reject'; onClose: () => void }) {
  const [method, setMethod] = useState<ExpenseMethod>('cash');
  const [note, setNote] = useState('');
  const approve = action === 'approve';
  const m = useApiMutation(
    () =>
      api.post(`/expense-claims/${claim.id}/${action}`, approve ? { payment_method: claim.paid_from === 'own_money' ? method : undefined, note: note || undefined } : { note }),
    { invalidate: [['expense-claims'], ['expenses'], ['books']], toastValidation: false, onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? 'Approve expense claim' : 'Reject expense claim'}
      description={`${claim.user?.name} · ${claim.category?.name} · ${money(claim.amount)} · ${date(claim.claim_date)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={approve ? 'success' : 'danger'} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {claim.receipt_url && (
          <a href={claim.receipt_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
            <img src={claim.receipt_url} alt="Receipt" className="max-h-64 w-full object-contain" />
          </a>
        )}
        {claim.description && <p className="text-sm text-slate-700">“{claim.description}”</p>}
        {approve && claim.paid_from === 'cash_in_hand' && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Paid from the cash the technician collected. It is recorded as a cash expense and was already deducted from their cash close.</p>
        )}
        {approve && claim.paid_from === 'own_money' && (
          <Field label="Reimbursed by" required error={fieldError(m.error, 'payment_method')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as ExpenseMethod)}>
              {METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!approve && claim.cash_close_id && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This amount was deducted from the technician’s cash close. Rejecting adds it back to the cash they must hand over.</p>
        )}
        <Field label={approve ? 'Note (optional)' : 'Reason'} required={!approve} error={fieldError(m.error, 'note') ?? fieldError(m.error, 'claim')}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}
