import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LogIn, Plus } from 'lucide-react';
import { api, setToken, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery } from '@/lib/hooks';
import { date, toLocalInput } from '@/lib/format';
import type { AuthUser } from '@/lib/types';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

interface TenantRow { id: number; name: string; slug: string; status: string; email: string | null; phone: string | null; plan_id: number | null; plan?: { id: number; name: string } | null; staff_count: number; technician_count: number; job_count: number; trial_ends_at: string | null; created_at: string }
interface Plan { id: number; name: string }

export default function TenantsPage() {
  const list = useListQuery<TenantRow>('tenants', '/admin/tenants');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<TenantRow | null>(null);

  return (
    <>
      <PageHeader title="Tenants" description="Companies subscribed to the platform." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New tenant</Button>} />
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={list.filters.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Name, code or email" className="sm:w-64" />
          <Select value={list.filters.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} className="sm:w-40" aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </Select>
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={setManaging}
          empty={<EmptyState title="No tenants yet" />}
          columns={[
            { key: 'name', header: 'Company', render: (t) => <div><p className="font-medium text-slate-900">{t.name}</p><p className="font-mono text-xs text-slate-500">{t.slug}</p></div> },
            { key: 'plan', header: 'Plan', render: (t) => t.plan?.name ?? '—' },
            { key: 'users', header: 'Users', hideOnMobile: true, render: (t) => `${t.staff_count} (${t.technician_count} tech)` },
            { key: 'jobs', header: 'Jobs', hideOnMobile: true, render: (t) => t.job_count.toLocaleString('en-IN'), className: 'tabular-nums' },
            { key: 'since', header: 'Since', hideOnMobile: true, render: (t) => date(t.created_at) },
            { key: 'status', header: 'Status', render: (t) => <span className="flex flex-col items-start gap-0.5"><StatusBadge status={t.status} />{t.status === 'trial' && t.trial_ends_at && <span className="text-[11px] text-slate-500">ends {date(t.trial_ends_at)}</span>}</span> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {creating && <CreateTenant onClose={() => setCreating(false)} />}
      {managing && <ManageTenant tenant={managing} onClose={() => setManaging(null)} />}
    </>
  );
}

function usePlans() {
  return useQuery({ queryKey: ['admin-plans'], queryFn: () => api.get<Envelope<Plan[]>>('/admin/plans').then((r) => r.data) });
}

function CreateTenant({ onClose }: { onClose: () => void }) {
  const plans = usePlans();
  const [form, setForm] = useState({ company_name: '', slug: '', name: '', email: '', phone: '', password: '', plan_id: '', status: 'trial' });
  const m = useApiMutation(() => api.post('/admin/tenants', { ...form, plan_id: Number(form.plan_id || plans.data?.[0]?.id) }), { invalidate: [['tenants']], toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  const text = (k: keyof typeof form, l: string, type = 'text') => (
    <Field label={l} required={k !== 'phone'} error={e(k)}>
      <Input type={type} value={form[k]} onChange={(ev) => setForm({ ...form, [k]: k === 'slug' ? ev.target.value.toLowerCase() : ev.target.value })} autoComplete={type === 'password' ? 'new-password' : 'off'} />
    </Field>
  );
  return (
    <Modal open onClose={onClose} size="lg" title="New tenant" description="Creates the company with default master data and a Company Admin login." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Create tenant</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('company_name', 'Company name')}
        {text('slug', 'Company code')}
        {text('name', 'Admin name')}
        {text('email', 'Admin email', 'email')}
        {text('phone', 'Phone')}
        {text('password', 'Initial password', 'password')}
        <Field label="Plan" required>
          <Select value={form.plan_id} onChange={(ev) => setForm({ ...form, plan_id: ev.target.value })}>
            {plans.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" required>
          <Select value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ManageTenant({ tenant, onClose }: { tenant: TenantRow; onClose: () => void }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const plans = usePlans();
  const [plan, setPlan] = useState(String(tenant.plan_id ?? ''));
  const [trialEnds, setTrialEnds] = useState(toLocalInput(tenant.trial_ends_at).slice(0, 10));
  const [confirm, setConfirm] = useState<'suspend' | 'delete' | 'impersonate' | null>(null);
  const [typed, setTyped] = useState('');

  const update = useApiMutation(() => api.patch(`/admin/tenants/${tenant.id}`, { plan_id: Number(plan), trial_ends_at: trialEnds || null }), { invalidate: [['tenants']], onSuccess: onClose });
  const status = useApiMutation((s: string) => api.patch(`/admin/tenants/${tenant.id}/status`, { status: s }), { invalidate: [['tenants']], onSuccess: onClose });
  const remove = useApiMutation(() => api.delete(`/admin/tenants/${tenant.id}`, { confirm: typed }), { invalidate: [['tenants']], toastValidation: true, onSuccess: onClose });
  const impersonate = useApiMutation(() => api.post<Envelope<{ user: AuthUser; token?: string }>>(`/admin/tenants/${tenant.id}/impersonate`), {
    onSuccess: (r) => {
      if (r.data.token) setToken(r.data.token);
      setUser(r.data.user);
      navigate('/dashboard');
    },
  });

  return (
    <Modal open onClose={onClose} size="lg" title={tenant.name} description={`${tenant.slug} · ${tenant.email ?? ''}`}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trial ends">
            <Input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} />
          </Field>
        </div>
        <Button loading={update.isPending} onClick={() => update.mutate(undefined)}>
          Save plan
        </Button>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {tenant.status !== 'active' && (
            <Button variant="success" loading={status.isPending} onClick={() => status.mutate('active')}>
              Activate subscription
            </Button>
          )}
          {tenant.status !== 'suspended' && (
            <Button variant="secondary" className="text-red-700" onClick={() => setConfirm('suspend')}>
              Suspend
            </Button>
          )}
          <Button variant="secondary" icon={<LogIn className="h-4 w-4" />} onClick={() => setConfirm('impersonate')}>
            Sign in as admin
          </Button>
          <Button variant="ghost" className="ml-auto text-red-600" onClick={() => setConfirm('delete')}>
            Delete tenant
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm === 'suspend'}
        onClose={() => setConfirm(null)}
        title="Suspend this tenant?"
        message="All users of this company are blocked immediately and mobile sessions are revoked. You can re-activate later."
        confirmLabel="Suspend"
        loading={status.isPending}
        onConfirm={() => status.mutate('suspended')}
      />
      <ConfirmDialog
        open={confirm === 'impersonate'}
        onClose={() => setConfirm(null)}
        tone="primary"
        title="Sign in as this tenant's admin?"
        message="For support only. This action is recorded in the audit log of both the platform and the tenant."
        confirmLabel="Continue"
        loading={impersonate.isPending}
        onConfirm={() => impersonate.mutate(undefined)}
      />
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Delete this tenant?" message={<>Type <strong className="font-mono">{tenant.slug}</strong> to confirm. The tenant is suspended and archived.</>} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(undefined)}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tenant.slug} />
      </ConfirmDialog>
    </Modal>
  );
}
