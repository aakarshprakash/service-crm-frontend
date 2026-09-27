import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailPlus, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery, useLookups } from '@/lib/hooks';
import { relative } from '@/lib/format';
import type { StaffUser } from '@/lib/types';
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

export default function TeamPage() {
  const { t } = useTranslation();
  const { can, user: me } = useAuth();
  const manage = can('users.manage');
  const list = useListQuery<StaffUser>('users', '/users');
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null);
  const [toggling, setToggling] = useState<StaffUser | null>(null);
  const f = list.filters;
  const toggle = useApiMutation((u: StaffUser) => api.patch(`/users/${u.id}/status`, { status: u.status === 'inactive' ? 'active' : 'inactive' }), {
    invalidate: [['users'], ['staff-options']],
    onSuccess: () => setToggling(null),
  });
  const resend = useApiMutation((u: StaffUser) => api.post(`/users/${u.id}/invite`));

  return (
    <>
      <PageHeader
        title="Team"
        description="Office staff and field technicians. Access is controlled by role."
        actions={
          manage && (
            <Hint text="Adds a person with a role (admin, coordinator, accounts or technician) and emails them an invitation to set their own password. Until they accept, you can resend it from the list.">
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing('new')}>
                Add team member
              </Button>
            </Hint>
          )
        }
      />
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Name, email or phone" className="sm:w-64" />
          <Select value={f.role ?? ''} onChange={(e) => list.setFilter('role', e.target.value)} className="sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {['admin', 'coordinator', 'accountant', 'technician'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
          <Select value={f.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} className="sm:w-36" aria-label="Status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={manage ? (u) => setEditing(u) : undefined}
          empty={<EmptyState title="No team members" />}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div>
                    <p className="font-medium text-slate-900">{u.name} {u.id === me?.id && <span className="text-xs text-slate-400">(you)</span>}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'technician' ? 'blue' : u.role === 'admin' ? 'violet' : 'slate'}>{t(`role.${u.role}`)}</Badge> },
            { key: 'phone', header: 'Phone', hideOnMobile: true, render: (u) => u.phone ?? '—' },
            { key: 'branch', header: 'Branch', hideOnMobile: true, render: (u) => u.branch?.name ?? '—' },
            { key: 'duty', header: 'Duty', hideOnMobile: true, render: (u) => (u.role === 'technician' ? <Badge tone={u.punch_status === 'in' ? 'green' : 'slate'} dot>{u.punch_status === 'in' ? 'On duty' : 'Off duty'}</Badge> : '—') },
            { key: 'last', header: 'Last sign-in', hideOnMobile: true, render: (u) => (u.last_login_at ? relative(u.last_login_at) : 'Never') },
            { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
            ...(manage
              ? [
                  {
                    key: 'actions',
                    header: '',
                    className: 'text-right',
                    render: (u: StaffUser) => (
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {u.status === 'invited' && (
                          <Button size="sm" variant="ghost" icon={<MailPlus className="h-3.5 w-3.5" />} loading={resend.isPending && resend.variables?.id === u.id} onClick={() => resend.mutate(u)}>
                            Resend
                          </Button>
                        )}
                        {u.id !== me?.id && u.status !== 'invited' && (
                          <Button size="sm" variant="ghost" className={u.status === 'active' ? 'text-red-600 hover:bg-red-50' : 'text-emerald-700'} onClick={() => setToggling(u)}>
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>

      {editing && <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        tone={toggling?.status === 'active' ? 'danger' : 'primary'}
        title={toggling?.status === 'active' ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        message={toggling?.status === 'active' ? 'They will be signed out everywhere and cannot sign in. Their job history is kept.' : 'They will be able to sign in again.'}
        confirmLabel={toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
      />
    </>
  );
}

function UserDialog({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', role: user?.role ?? 'technician', branch_id: String(user?.branch_id ?? '') });
  const m = useApiMutation(
    () => {
      const body = { ...form, phone: form.phone || null, branch_id: form.branch_id || null };
      return user ? api.patch(`/users/${user.id}`, body) : api.post('/users', body);
    },
    { invalidate: [['users'], ['staff-options']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Edit team member' : 'Add team member'}
      description={user ? undefined : 'They receive an email invitation to set their own password.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {user ? 'Save changes' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={e('name')} className="sm:col-span-2">
          <Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
        </Field>
        <Field label="Email" required error={e('email')}>
          <Input type="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} />
        </Field>
        <Field label="Mobile" error={e('phone')} hint="Technicians can sign in to the app with this number.">
          <Input value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} inputMode="tel" />
        </Field>
        <Field label="Role" required error={e('role')}>
          <Select value={form.role} onChange={(ev) => setForm({ ...form, role: ev.target.value as StaffUser['role'] })}>
            {['technician', 'coordinator', 'accountant', 'admin'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch" error={e('branch_id')}>
          <Select value={form.branch_id} onChange={(ev) => setForm({ ...form, branch_id: ev.target.value })}>
            <option value="">—</option>
            {lookups?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
          <strong>Coordinator:</strong> creates & assigns jobs. <strong>Accountant:</strong> invoices, cash close, inventory & financial reports. <strong>Technician:</strong> executes visits in the field app.{' '}
          <strong>Company Admin:</strong> everything, including settings and users.
        </p>
      </div>
    </Modal>
  );
}
