import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Play } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation, useListQuery } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';
import type { PayrollRun } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, PageHeader, Pagination } from '@/components/ui';
import { Hint } from '@/components/tutorial';
import { monthName, thisMonth } from './hrParts';

export const RUN_TONE: Record<PayrollRun['status'], 'amber' | 'blue' | 'green'> = { draft: 'amber', finalized: 'blue', paid: 'green' };

/** Monthly payroll runs: draft → finalized (payslips visible to staff) → paid (added to expenses). */
export default function PayrollPage() {
  const navigate = useNavigate();
  const list = useListQuery<PayrollRun>('payroll', '/hr/payroll');
  const [running, setRunning] = useState(false);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Salaries are worked out from each person’s monthly salary and attendance: absent days and unpaid leave are deducted as loss of pay."
        actions={
          <Hint text="Creates a draft for a finished month from attendance, approved leave, holidays and salaries. You can review and adjust each payslip before finalizing.">
            <Button icon={<Play className="h-4 w-4" />} onClick={() => setRunning(true)}>
              Run payroll
            </Button>
          </Hint>
        }
      />
      <Card padded={false}>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(r) => navigate(`/hr/payroll/${r.id}`)}
          empty={<EmptyState title="No payroll yet" message="Set salaries under Employees & salary, then run payroll once a month is over." />}
          columns={[
            {
              key: 'm',
              header: 'Month',
              render: (r) => (
                <div>
                  <p className="font-medium text-slate-900">{monthName(r.month)}</p>
                  <p className="text-xs text-slate-500">{r.payslips_count} payslips · created {dateTime(r.created_at)}</p>
                </div>
              ),
            },
            { key: 'g', header: 'Gross', hideOnMobile: true, className: 'text-right tabular-nums', headerClassName: 'text-right', render: (r) => money(r.total_gross) },
            { key: 'd', header: 'Deductions', hideOnMobile: true, className: 'text-right tabular-nums', headerClassName: 'text-right', render: (r) => money(r.total_deductions) },
            { key: 'n', header: 'Net pay', className: 'text-right tabular-nums font-semibold', headerClassName: 'text-right', render: (r) => money(r.total_net) },
            { key: 's', header: 'Status', render: (r) => <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {running && <RunDialog onClose={() => setRunning(false)} onDone={(id) => navigate(`/hr/payroll/${id}`)} />}
    </>
  );
}

function RunDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [month, setMonth] = useState(thisMonth(-1));
  const m = useApiMutation(() => api.post<Envelope<PayrollRun>>('/hr/payroll', { month }), {
    invalidate: [['payroll']],
    toastValidation: false,
    onSuccess: (r) => {
      onClose();
      onDone(r.data.id);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Run payroll"
      description="Correct the attendance register and approve pending leave for the month first."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Create draft
          </Button>
        </>
      }
    >
      <Field label="Month" error={fieldError(m.error, 'month')}>
        <Input type="month" value={month} max={thisMonth(-1)} onChange={(e) => setMonth(e.target.value)} />
      </Field>
    </Modal>
  );
}
