import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery } from '@/lib/hooks';
import { date, relative } from '@/lib/format';
import type { LeaveBalance, LeaveRequest } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, Field, FilterBar, Modal, PageHeader, Pagination, QueryState, Select, Tabs, Textarea } from '@/components/ui';
import { num } from './hrParts';

export const LEAVE_TONE: Record<LeaveRequest['status'], 'amber' | 'green' | 'red' | 'slate'> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' };

/** Approve or reject leave, and see everyone's balances. */
export default function LeaveRequests() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'balances' ? 'balances' : 'requests';
  return (
    <>
      <PageHeader title="Leave" description="Staff apply from their phone or the web. Approved leave shows on the attendance register and is used in payroll." />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === 'requests' ? {} : { tab: v })}
        tabs={[
          { value: 'requests', label: 'Requests' },
          { value: 'balances', label: 'Balances' },
        ]}
      />
      {tab === 'requests' ? <Requests /> : <Balances />}
    </>
  );
}

function Requests() {
  const { user } = useAuth();
  const list = useListQuery<LeaveRequest>('hr-leave', '/hr/leave-requests', { status: 'pending' });
  const [deciding, setDeciding] = useState<{ leave: LeaveRequest; status: 'approved' | 'rejected' } | null>(null);
  const f = list.filters;
  return (
    <Card padded={false}>
      <FilterBar>
        <Select value={f.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value || 'pending,approved,rejected,cancelled')} className="sm:w-48" aria-label="Status">
          <option value="pending">Pending ({(list.data?.meta.pending as number) ?? 0})</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="pending,approved,rejected,cancelled">All</option>
        </Select>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        empty={<EmptyState title={f.status === 'pending' ? 'No pending requests' : 'No leave requests'} message="Requests from staff appear here." />}
        columns={[
          {
            key: 'who',
            header: 'Staff',
            render: (l) => (
              <div>
                <p className="font-medium text-slate-900">{l.user?.name}</p>
                <p className="text-xs text-slate-500">Applied {relative(l.created_at)}</p>
              </div>
            ),
          },
          {
            key: 'what',
            header: 'Leave',
            render: (l) => (
              <div>
                <p>
                  {l.type?.name} · <strong>{num(l.days)}</strong> day{l.days === 1 ? '' : 's'}
                  {l.half_day && ' (half day)'}
                </p>
                <p className="text-xs text-slate-500">
                  {date(l.from_date)}
                  {l.to_date !== l.from_date && ` → ${date(l.to_date)}`}
                </p>
              </div>
            ),
          },
          { key: 'why', header: 'Reason', hideOnMobile: true, render: (l) => <span className="line-clamp-2 max-w-xs text-sm text-slate-600">{l.reason ?? '—'}</span> },
          {
            key: 's',
            header: 'Status',
            render: (l) => (
              <div>
                <Badge tone={LEAVE_TONE[l.status]}>{l.status}</Badge>
                {l.decider && <p className="mt-0.5 text-[11px] text-slate-500">by {l.decider.name}</p>}
                {l.decision_note && <p className="text-[11px] text-slate-500">{l.decision_note}</p>}
              </div>
            ),
          },
          {
            key: 'act',
            header: '',
            className: 'text-right',
            render: (l) =>
              l.status === 'pending' && l.user_id !== user?.id ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setDeciding({ leave: l, status: 'approved' })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" icon={<X className="h-3.5 w-3.5" />} onClick={() => setDeciding({ leave: l, status: 'rejected' })}>
                    Reject
                  </Button>
                </div>
              ) : null,
          },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      {deciding && <DecideDialog {...deciding} onClose={() => setDeciding(null)} />}
    </Card>
  );
}

function DecideDialog({ leave, status, onClose }: { leave: LeaveRequest; status: 'approved' | 'rejected'; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation(() => api.patch(`/hr/leave-requests/${leave.id}`, { status, note: note || null }), { invalidate: [['hr-leave'], ['hr']], toastValidation: false, onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${status === 'approved' ? 'Approve' : 'Reject'} ${leave.user?.name}’s leave?`}
      description={`${leave.type?.name}, ${num(leave.days)} day(s) from ${date(leave.from_date)}. They will be notified.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={status === 'approved' ? 'success' : 'danger'} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {status === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <Field label={status === 'rejected' ? 'Reason' : 'Note (optional)'} required={status === 'rejected'} error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function Balances() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useQuery({
    queryKey: ['hr', 'balances', year],
    queryFn: () => api.get<Envelope<{ year: number; rows: { user: { id: number; name: string; role: string }; balances: LeaveBalance[] }[] }>>('/hr/leave-balances', { year }).then((r) => r.data),
  });
  const types = q.data?.rows[0]?.balances.map((b) => b.leave_type) ?? [];
  return (
    <Card padded={false}>
      <FilterBar>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="sm:w-32" aria-label="Year">
          {[0, 1, 2].map((n) => {
            const y = new Date().getFullYear() - n;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </Select>
      </FilterBar>
      <QueryState loading={q.isLoading} error={q.error}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Staff</th>
                {types.map((ty) => (
                  <th key={ty.id} className="px-4 py-2.5 text-right font-semibold">
                    {ty.code ?? ty.name}
                    <span className="block font-normal normal-case">used / quota</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data?.rows.map((r) => (
                <tr key={r.user.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{r.user.name}</p>
                    <p className="text-xs text-slate-500">{t(`role.${r.user.role}`)}</p>
                  </td>
                  {r.balances.map((b) => (
                    <td key={b.leave_type.id} className="px-4 py-2.5 text-right tabular-nums">
                      {num(b.used)}
                      {b.quota > 0 && <span className="text-slate-400"> / {num(b.quota)}</span>}
                      {b.pending > 0 && <span className="block text-[11px] text-amber-700">{num(b.pending)} pending</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}
