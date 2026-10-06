import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Download, Pencil, Trash2, Wallet } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { money, toMajor, toMinor, today } from '@/lib/format';
import type { PayrollRun, Payslip } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, PageHeader, QueryState, Select, StatCard, toast } from '@/components/ui';
import { Hint } from '@/components/tutorial';
import { RUN_TONE } from './PayrollPage';
import { monthName, num } from './hrParts';

export default function PayrollRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['payroll', id], queryFn: () => api.get<Envelope<PayrollRun>>(`/hr/payroll/${id}`).then((r) => r.data) });
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [dialog, setDialog] = useState<'finalize' | 'pay' | 'delete' | null>(null);
  const finalize = useApiMutation(() => api.post(`/hr/payroll/${id}/finalize`), { invalidate: [['payroll']], onSuccess: () => setDialog(null) });
  const del = useApiMutation(() => api.delete(`/hr/payroll/${id}`), { invalidate: [['payroll']], onSuccess: () => navigate('/hr/payroll') });
  const run = q.data;
  const draft = run?.status === 'draft';

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {run && (
        <>
          <PageHeader
            back={
              <Link to="/hr/payroll" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Payroll
              </Link>
            }
            title={
              <span className="flex items-center gap-3">
                Payroll · {monthName(run.month)} <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
              </span>
            }
            description={draft ? 'Draft: adjust bonuses, deductions or loss-of-pay days, then finalize. Staff see payslips once finalized.' : run.status === 'finalized' ? 'Finalized: payslips are visible to staff. Mark as paid once salaries are transferred.' : 'Paid: salaries were recorded as expenses under “Salaries & wages”.'}
            actions={
              <>
                {draft && (
                  <>
                    <Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDialog('delete')}>
                      Delete draft
                    </Button>
                    <Hint text="Locks the payslips and the month’s attendance, and lets staff download their payslips.">
                      <Button icon={<BadgeCheck className="h-4 w-4" />} onClick={() => setDialog('finalize')}>
                        Finalize
                      </Button>
                    </Hint>
                  </>
                )}
                {run.status === 'finalized' && (
                  <Hint text="Records each net salary as an expense (Salaries & wages) on the pay date, so it shows in the books and profit & loss.">
                    <Button icon={<Wallet className="h-4 w-4" />} onClick={() => setDialog('pay')}>
                      Mark as paid
                    </Button>
                  </Hint>
                )}
              </>
            }
          />
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Employees" value={run.payslips?.length ?? 0} tone="slate" />
            <StatCard label="Gross (incl. bonus)" value={money(run.total_gross)} tone="blue" />
            <StatCard label="Deductions" value={money(run.total_deductions)} tone="amber" />
            <StatCard label="Net pay" value={money(run.total_net)} tone="green" />
          </div>
          <Card padded={false}>
            <DataTable
              rows={run.payslips}
              columns={[
                {
                  key: 'n',
                  header: 'Employee',
                  render: (p) => (
                    <div>
                      <p className="font-medium text-slate-900">{p.user?.name}</p>
                      <p className="text-xs text-slate-500">{p.user?.branch?.name}</p>
                    </div>
                  ),
                },
                {
                  key: 'att',
                  header: 'Attendance',
                  hideOnMobile: true,
                  render: (p) => (
                    <div className="text-xs text-slate-600">
                      <p>
                        Present {num(p.present_days)} / {num(p.working_days)} · Leave {num(p.paid_leave_days)}
                      </p>
                      <p className={p.lop_days ? 'text-red-700' : ''}>LOP {num(p.lop_days)} day{p.lop_days === 1 ? '' : 's'}</p>
                    </div>
                  ),
                },
                { key: 'g', header: 'Gross', className: 'text-right tabular-nums', headerClassName: 'text-right', render: (p) => money(p.gross + p.bonus) },
                {
                  key: 'd',
                  header: 'Deductions',
                  hideOnMobile: true,
                  className: 'text-right tabular-nums text-red-700',
                  headerClassName: 'text-right',
                  render: (p) => money((p.deductions ?? []).reduce((a, d) => a + d.amount, 0) + p.lop_amount + p.other_deduction),
                },
                { key: 'net', header: 'Net pay', className: 'text-right tabular-nums font-semibold', headerClassName: 'text-right', render: (p) => money(p.net_pay) },
                {
                  key: 'a',
                  header: '',
                  className: 'text-right',
                  render: (p) => (
                    <div className="flex justify-end gap-1">
                      {draft && (
                        <Button size="sm" variant="ghost" aria-label="Adjust" onClick={() => setEditing(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" aria-label="Download payslip" onClick={() => download(`/hr/payslips/${p.id}/pdf`, `payslip-${run.month}.pdf`).catch((err) => toast.error(err.message))}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
          {editing && <AdjustSlip runId={run.id} slip={editing} onClose={() => setEditing(null)} />}
          {dialog === 'pay' && <PayDialog runId={run.id} total={run.total_net} onClose={() => setDialog(null)} />}
          <ConfirmDialog open={dialog === 'finalize'} onClose={() => setDialog(null)} tone="primary" title="Finalize payroll?" message="Payslips can no longer be changed, and the month’s attendance is locked." confirmLabel="Finalize" loading={finalize.isPending} onConfirm={() => finalize.mutate(undefined)} />
          <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this draft?" message="You can run payroll for the month again afterwards." confirmLabel="Delete" loading={del.isPending} onConfirm={() => del.mutate(undefined)} />
        </>
      )}
    </QueryState>
  );
}

function AdjustSlip({ runId, slip, onClose }: { runId: number; slip: Payslip; onClose: () => void }) {
  const [form, setForm] = useState({ bonus: toMajor(slip.bonus), other_deduction: toMajor(slip.other_deduction), lop_days: String(slip.lop_days), note: slip.note ?? '' });
  const lopChanged = Number(form.lop_days) !== slip.lop_days;
  const m = useApiMutation(
    () =>
      api.patch(`/hr/payroll/${runId}/payslips/${slip.id}`, {
        bonus: toMinor(form.bonus),
        other_deduction: toMinor(form.other_deduction),
        ...(lopChanged ? { lop_days: Number(form.lop_days) } : {}),
        note: form.note || null,
      }),
    { invalidate: [['payroll']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${slip.user?.name}’s payslip`}
      description={`Gross ${money(slip.gross)} · loss of pay ${money(slip.lop_amount)} for ${num(slip.lop_days)} day(s).`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bonus / incentive" error={e('bonus')}>
          <Input inputMode="decimal" value={form.bonus} onChange={(ev) => setForm({ ...form, bonus: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Other deduction" error={e('other_deduction')} hint="Advance, fine…">
          <Input inputMode="decimal" value={form.other_deduction} onChange={(ev) => setForm({ ...form, other_deduction: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="LOP days" error={e('lop_days')} hint="Override if needed">
          <Input inputMode="decimal" value={form.lop_days} onChange={(ev) => setForm({ ...form, lop_days: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Note on payslip" className="sm:col-span-3">
          <Input value={form.note} maxLength={300} onChange={(ev) => setForm({ ...form, note: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function PayDialog({ runId, total, onClose }: { runId: number; total: number; onClose: () => void }) {
  const [form, setForm] = useState({ payment_method: 'bank_transfer', paid_on: today() });
  const m = useApiMutation(() => api.post(`/hr/payroll/${runId}/pay`, form), { invalidate: [['payroll'], ['books'], ['expenses']], toastValidation: false, onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Mark ${money(total)} as paid`}
      description="Each net salary is recorded as a “Salaries & wages” expense."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Mark as paid
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Paid by" error={fieldError(m.error, 'payment_method')}>
          <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        <Field label="Paid on" error={fieldError(m.error, 'paid_on') ?? fieldError(m.error, 'status')}>
          <Input type="date" max={today()} value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
