import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation, useListQuery } from '@/lib/hooks';
import { date, money, toMajor, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EmployeeProfile, LeaveBalance, Role } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner, StatCard } from '@/components/ui';
import { num } from './hrParts';

interface Employee { id: number; name: string; email: string | null; phone: string | null; role: Role; status: string; branch: string | null; profile: EmployeeProfile | null }

const WEEKDAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
] as const;

/** Employee HR records: job details, salary structure, weekly offs and bank details. */
export default function EmployeesPage() {
  const { t } = useTranslation();
  const list = useListQuery<Employee>('hr-employees', '/hr/employees');
  const [editing, setEditing] = useState<Employee | null>(null);
  const f = list.filters;
  const missing = list.data?.data.filter((e) => !e.profile?.monthly_salary).length ?? 0;

  return (
    <>
      <PageHeader title="Employees & salary" description="Salary, joining date, weekly off and bank details for each staff member. Payroll is calculated from these." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Monthly payroll (gross)" value={money((list.data?.meta.monthly_payroll as number) ?? 0)} tone="blue" />
        <StatCard label="Staff" value={list.data?.meta.total ?? '–'} tone="slate" />
        <StatCard label="Without a salary set" value={missing} tone={missing ? 'amber' : 'green'} />
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Name" className="sm:w-64" />
          <Select value={f.role ?? ''} onChange={(e) => list.setFilter('role', e.target.value)} className="sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {['technician', 'coordinator', 'accountant', 'admin'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={setEditing}
          empty={<EmptyState title="No staff" />}
          columns={[
            {
              key: 'n',
              header: 'Employee',
              render: (e) => (
                <div>
                  <p className="font-medium text-slate-900">
                    {e.name} {e.status === 'inactive' && <Badge tone="slate">Inactive</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.profile?.employee_code && `${e.profile.employee_code} · `}
                    {e.profile?.designation ?? t(`role.${e.role}`)}
                  </p>
                </div>
              ),
            },
            { key: 'b', header: 'Branch', hideOnMobile: true, render: (e) => e.branch ?? '—' },
            { key: 'j', header: 'Joined', hideOnMobile: true, render: (e) => date(e.profile?.date_of_joining) },
            { key: 'w', header: 'Weekly off', hideOnMobile: true, render: (e) => (e.profile?.weekly_offs ?? [7]).map((d) => WEEKDAYS[d - 1]?.[1]).join(', ') },
            {
              key: 's',
              header: 'Monthly salary',
              className: 'text-right tabular-nums',
              headerClassName: 'text-right',
              render: (e) => (e.profile?.monthly_salary ? money(e.profile.monthly_salary) : <span className="text-xs text-amber-700">Not set</span>),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {editing && <EmployeeDialog employee={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EmployeeDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const p = employee.profile;
  const [form, setForm] = useState({
    employee_code: p?.employee_code ?? '',
    designation: p?.designation ?? '',
    department: p?.department ?? '',
    date_of_joining: p?.date_of_joining ?? '',
    date_of_leaving: p?.date_of_leaving ?? '',
    monthly_salary: toMajor(p?.monthly_salary),
    bank_name: p?.bank_name ?? '',
    bank_account: p?.bank_account ?? '',
    ifsc: p?.ifsc ?? '',
    pan: p?.pan ?? '',
    uan: p?.uan ?? '',
  });
  const [offs, setOffs] = useState<number[]>(p?.weekly_offs ?? [7]);
  const [components, setComponents] = useState((p?.components ?? []).map((c) => ({ ...c, amount: toMajor(c.amount) })));
  const balances = useQuery({
    queryKey: ['hr', 'employee', employee.id],
    queryFn: () => api.get<Envelope<{ balances: LeaveBalance[] }>>(`/hr/employees/${employee.id}`).then((r) => r.data.balances),
  });
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const gross = toMinor(form.monthly_salary);
  const earnings = components.filter((c) => c.type === 'earning').reduce((a, c) => a + toMinor(c.amount), 0);
  const deductions = components.filter((c) => c.type === 'deduction').reduce((a, c) => a + toMinor(c.amount), 0);

  const m = useApiMutation(
    () =>
      api.put(`/hr/employees/${employee.id}`, {
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])),
        monthly_salary: gross,
        weekly_offs: offs,
        components: components.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), type: c.type, amount: toMinor(c.amount) })),
      }),
    { invalidate: [['hr-employees'], ['hr']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  const text = (k: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={e(k)}>
      <Input value={form[k]} onChange={(ev) => set(k, ev.target.value)} {...props} />
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={employee.name}
      description={[employee.email, employee.phone].filter(Boolean).join(' · ')}
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
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          {text('employee_code', 'Employee code', { maxLength: 30 })}
          {text('designation', 'Designation', { maxLength: 100 })}
          {text('department', 'Department', { maxLength: 100 })}
          {text('date_of_joining', 'Date of joining', { type: 'date' })}
          {text('date_of_leaving', 'Last working day', { type: 'date' })}
          <Field label="Weekly off">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map(([d, l]) => {
                const on = offs.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setOffs((o) => (on ? o.filter((x) => x !== d) : [...o, d]))} className={cn('rounded-md border px-2 py-1 text-xs', on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600')}>
                    {l}
                  </button>
                );
              })}
            </div>
          </Field>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 grid gap-4 sm:grid-cols-3">
            <Field label="Monthly gross salary" required error={e('monthly_salary')} hint="Total earnings per month before deductions.">
              <Input inputMode="decimal" value={form.monthly_salary} onChange={(ev) => set('monthly_salary', ev.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <div className="sm:col-span-2 grid grid-cols-3 gap-2 self-end rounded-lg bg-slate-50 p-3 text-center text-xs">
              <div>
                <p className="text-slate-500">Gross</p>
                <p className="text-sm font-semibold tabular-nums">{money(gross)}</p>
              </div>
              <div>
                <p className="text-slate-500">Fixed deductions</p>
                <p className="text-sm font-semibold tabular-nums text-red-700">{money(deductions)}</p>
              </div>
              <div>
                <p className="text-slate-500">Take-home (full month)</p>
                <p className="text-sm font-semibold tabular-nums text-emerald-700">{money(gross - deductions)}</p>
              </div>
            </div>
          </div>
          <p className="mb-2 text-xs font-medium text-slate-600">Salary components (optional)</p>
          {e('components') && <p className="mb-2 text-xs text-red-600">{e('components')}</p>}
          <div className="space-y-2">
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-5" placeholder="e.g. HRA, PF, Professional tax" value={c.name} onChange={(ev) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                <Select className="col-span-3" value={c.type} onChange={(ev) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, type: ev.target.value as 'earning' | 'deduction' } : x)))}>
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </Select>
                <Input className="col-span-3" inputMode="decimal" placeholder="Amount" value={c.amount} onChange={(ev) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, amount: ev.target.value.replace(/[^\d.]/g, '') } : x)))} />
                <Button size="sm" variant="ghost" className="col-span-1 text-red-600" aria-label="Remove" onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setComponents((cs) => [...cs, { name: '', type: 'earning', amount: '' }])}>
              Add component
            </Button>
            {earnings > 0 && <p className="text-xs text-slate-500">Earnings listed: {money(earnings)}{earnings < gross && ` · rest shown as “Other allowances”`}</p>}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {text('bank_name', 'Bank', { maxLength: 100 })}
          {text('bank_account', 'Account number', { maxLength: 40, inputMode: 'numeric' })}
          {text('ifsc', 'IFSC', { maxLength: 20 })}
          {text('pan', 'PAN', { maxLength: 20 })}
          {text('uan', 'UAN (PF)', { maxLength: 30 })}
        </section>

        <section>
          <p className="mb-2 text-xs font-medium text-slate-600">Leave this year</p>
          {balances.isLoading ? (
            <Spinner />
          ) : (
            <div className="flex flex-wrap gap-2">
              {balances.data?.map((b) => (
                <span key={b.leave_type.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                  {b.leave_type.name}: <strong>{num(b.used)}</strong>
                  {b.quota > 0 && ` of ${num(b.quota)}`} used
                  {b.pending > 0 && <span className="text-amber-700"> · {num(b.pending)} pending</span>}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
