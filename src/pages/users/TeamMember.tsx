import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, KeyRound, LogOut, Mail, Monitor, Pencil, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, relative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AttendanceDay, EmployeeProfile, LeaveBalance, LeaveRequest, StaffUser } from '@/lib/types';
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, DefinitionList, EmptyState, Modal, PageHeader, QueryState, StatCard, Tabs, toast } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import { hours, monthName, num, STATUS_STYLE, thisMonth } from '@/pages/hr/hrParts';
import { UserDialog } from './TeamPage';

type Tab = 'overview' | 'access' | 'attendance' | 'leave' | 'pay';

interface Session {
  id: number;
  app: 'web' | 'technician' | 'manager';
  device: string;
  ip_address: string | null;
  signed_in_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface Access {
  sessions: Session[];
  push_devices: { id: number; platform: string; app: string; updated_at: string }[];
  last_login_at: string | null;
  password_changed_at: string | null;
  must_change_password: boolean;
  two_factor_enabled: boolean;
}

const APP_LABEL: Record<Session['app'], string> = { web: 'Web app', technician: 'Technician app', manager: 'Manager app' };

/** One person: profile, sign-in access, attendance, leave and pay, in one place. */
export default function TeamMember() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { can, user: me } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['users', id], queryFn: () => api.get<Envelope<StaffUser>>(`/users/${id}`).then((r) => r.data) });
  const u = q.data;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    ...(can('users.manage') ? [{ value: 'access' as Tab, label: 'Access & security' }] : []),
    ...(can('hr.view') ? [{ value: 'attendance' as Tab, label: 'Attendance' }] : []),
    ...(can('leave.approve') ? [{ value: 'leave' as Tab, label: 'Leave' }] : []),
    ...(can('payroll.manage') ? [{ value: 'pay' as Tab, label: 'Salary & pay' }] : []),
  ];

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {u && (
        <>
          <PageHeader
            back={
              <Link to="/team" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Team
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                <Avatar name={u.name} className="h-10 w-10" /> {u.name} <StatusBadge status={u.status} />
                {u.role === 'technician' && (
                  <Badge tone={u.punch_status === 'in' ? 'green' : 'slate'} dot>
                    {u.punch_status === 'in' ? 'On duty' : 'Off duty'}
                  </Badge>
                )}
              </span>
            }
            description={`${t(`role.${u.role}`)}${u.branch ? ` · ${u.branch.name}` : ''}${u.id === me?.id ? ' · you' : ''}`}
            actions={
              can('users.manage') && (
                <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )
            }
          />
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />
          {tab === 'overview' && <Overview u={u} />}
          {tab === 'access' && <AccessTab u={u} self={u.id === me?.id} />}
          {tab === 'attendance' && <AttendanceTab u={u} />}
          {tab === 'leave' && <LeaveTab u={u} />}
          {tab === 'pay' && <PayTab u={u} />}
          {editing && <UserDialog user={u} onClose={() => setEditing(false)} />}
        </>
      )}
    </QueryState>
  );
}

function Overview({ u }: { u: StaffUser }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Details" className="lg:col-span-2">
        <DefinitionList
          items={[
            ['Email', u.email ?? '—'],
            ['Mobile', u.phone ?? '—'],
            ['Role', t(`role.${u.role}`)],
            ['Branch', u.branch?.name ?? '—'],
            ['Service locations', u.service_locations?.length ? u.service_locations.map((l) => l.name).join(', ') : u.role === 'technician' ? 'None: auto-assignment skips them' : '—'],
            ['Last sign-in', u.last_login_at ? `${dateTime(u.last_login_at)} (${relative(u.last_login_at)})` : 'Never'],
          ]}
        />
      </Card>
      <Card title="What they can sign in to">
        <ul className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-2">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Web app{u.role === 'technician' ? ' (mobile web view)' : ''}
          </li>
          {u.role === 'technician' ? (
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Servon Technician app, with their email or mobile number
            </li>
          ) : (
            <li className="flex gap-2">
              <Tablet className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Servon Manager app, if your plan includes it
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function AccessTab({ u, self }: { u: StaffUser; self: boolean }) {
  const q = useQuery({ queryKey: ['user-access', u.id], queryFn: () => api.get<Envelope<Access>>(`/users/${u.id}/sessions`).then((r) => r.data) });
  const [confirm, setConfirm] = useState<'signout' | 'link' | 'temporary' | null>(null);
  const [revoking, setRevoking] = useState<Session | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);
  const done = { invalidate: [['user-access', u.id]], onSuccess: () => setConfirm(null) };
  const signOut = useApiMutation(() => api.post(`/users/${u.id}/sign-out`), done);
  const link = useApiMutation(() => api.post(`/users/${u.id}/password`, { mode: 'link' }), done);
  const temp = useApiMutation(() => api.post<Envelope<{ temporary_password: string }>>(`/users/${u.id}/password`, { mode: 'temporary' }), {
    ...done,
    success: () => 'Temporary password set',
    onSuccess: (r) => {
      setConfirm(null);
      setTemporary(r.data.temporary_password);
    },
  });
  const revoke = useApiMutation((s: Session) => api.delete(`/users/${u.id}/sessions/${s.id}`), { invalidate: [['user-access', u.id]], onSuccess: () => setRevoking(null) });
  const a = q.data;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {a && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card
              title="Signed in on"
              padded={false}
              actions={
                !self && (
                  <Hint text="Ends every session on every browser and phone. They can sign in again with their password. Use Deactivate on the Team list to stop them signing in at all.">
                    <Button size="sm" variant="secondary" icon={<LogOut className="h-4 w-4" />} disabled={!a.sessions.length} onClick={() => setConfirm('signout')}>
                      Sign out everywhere
                    </Button>
                  </Hint>
                )
              }
            >
              <DataTable
                rows={a.sessions}
                empty={<EmptyState title="Not signed in anywhere" message="Sessions appear here when they sign in on the web or in an app." />}
                columns={[
                  {
                    key: 'device',
                    header: 'Device',
                    render: (s) => (
                      <div className="flex items-center gap-3">
                        {s.app === 'web' ? <Monitor className="h-4 w-4 text-slate-400" /> : <Smartphone className="h-4 w-4 text-slate-400" />}
                        <div>
                          <p className="font-medium text-slate-900">{s.device}</p>
                          <p className="text-xs text-slate-500">{APP_LABEL[s.app]}{s.ip_address ? ` · IP ${s.ip_address}` : ''}</p>
                        </div>
                      </div>
                    ),
                  },
                  { key: 'in', header: 'Signed in', hideOnMobile: true, render: (s) => dateTime(s.signed_in_at) },
                  { key: 'used', header: 'Last active', render: (s) => (s.last_used_at ? relative(s.last_used_at) : 'Not yet') },
                  {
                    key: 'x',
                    header: '',
                    className: 'text-right',
                    render: (s) =>
                      !self && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setRevoking(s)}>
                          Sign out
                        </Button>
                      ),
                  },
                ]}
              />
            </Card>
            <p className="text-xs text-slate-500">
              Sessions last 30 days, then they sign in again. Signing out a phone also stops its push notifications once no other session of that app is left.
            </p>
          </div>

          <div className="space-y-6">
            <Card title="Password & sign-in">
              <DefinitionList
                columns={1}
                items={[
                  ['Password last changed', a.password_changed_at ? dateTime(a.password_changed_at) : 'Not recorded'],
                  ['Temporary password', a.must_change_password ? <Badge tone="amber">Must change at next sign-in</Badge> : 'No'],
                  ['Two-factor authentication', a.two_factor_enabled ? <Badge tone="green">On</Badge> : 'Off'],
                  ['Phones registered for push', String(a.push_devices.length)],
                ]}
              />
              {!self ? (
                <div className="mt-4 flex flex-col gap-2">
                  <Hint block text="Creates a one-time password you hand over in person or by phone. They are signed out everywhere and must choose their own password when they next sign in, in the app or on the web.">
                    <Button className="w-full" variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirm('temporary')}>
                      Set temporary password
                    </Button>
                  </Hint>
                  <Hint block text="Emails them a link to choose a new password. They are signed out everywhere straight away.">
                    <Button className="w-full" variant="secondary" icon={<Mail className="h-4 w-4" />} disabled={!u.email} onClick={() => setConfirm('link')}>
                      Email a reset link
                    </Button>
                  </Hint>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  This is you. Change your password and see your devices on <Link to="/profile" className="text-brand-700 hover:underline">your profile</Link>.
                </p>
              )}
            </Card>
          </div>

          <ConfirmDialog
            open={confirm === 'signout'}
            onClose={() => setConfirm(null)}
            tone="danger"
            title={`Sign ${u.name} out everywhere?`}
            message="Every browser and phone they use is signed out now. Work they had already saved is kept; photos still waiting to upload on their phone upload after they sign in again."
            confirmLabel="Sign out everywhere"
            loading={signOut.isPending}
            onConfirm={() => signOut.mutate(undefined)}
          />
          <ConfirmDialog
            open={confirm === 'temporary'}
            onClose={() => setConfirm(null)}
            title={`Set a temporary password for ${u.name}?`}
            message="Their current password stops working and they are signed out everywhere. You’ll see the new password once, to pass on to them."
            confirmLabel="Set temporary password"
            loading={temp.isPending}
            onConfirm={() => temp.mutate(undefined)}
          />
          <ConfirmDialog
            open={confirm === 'link'}
            onClose={() => setConfirm(null)}
            title={`Email a reset link to ${u.email}?`}
            message="They are signed out everywhere now and choose a new password from the link (valid for 60 minutes)."
            confirmLabel="Send link"
            loading={link.isPending}
            onConfirm={() => link.mutate(undefined)}
          />
          <ConfirmDialog
            open={!!revoking}
            onClose={() => setRevoking(null)}
            tone="danger"
            title={`Sign out of ${revoking?.device}?`}
            message="Use this for a lost or shared phone. They stay signed in on their other devices."
            confirmLabel="Sign out"
            loading={revoke.isPending}
            onConfirm={() => revoking && revoke.mutate(revoking)}
          />
          <Modal
            open={!!temporary}
            onClose={() => setTemporary(null)}
            title="Temporary password"
            description="Shown only now. Give it to them privately; they must change it when they sign in."
            footer={<Button onClick={() => setTemporary(null)}>Done</Button>}
          >
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-4 py-3">
              <code className="text-lg font-semibold tracking-wide text-slate-900">{temporary}</code>
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy className="h-4 w-4" />}
                onClick={() => navigator.clipboard?.writeText(temporary ?? '').then(() => toast.success('Copied'), () => toast.error('Copy failed: select and copy it instead'))}
              >
                Copy
              </Button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Don’t send it by email or WhatsApp group. Read it out or send it to them directly.
            </p>
          </Modal>
        </div>
      )}
    </QueryState>
  );
}

function AttendanceTab({ u }: { u: StaffUser }) {
  const [offset, setOffset] = useState(0);
  const month = thisMonth(offset);
  const q = useQuery({
    queryKey: ['hr-register', month, u.id],
    queryFn: () =>
      api
        .get<Envelope<{ dates: string[]; rows: { days: Record<string, AttendanceDay>; summary: Record<string, number> }[] }>>('/hr/attendance/register', { month, user_id: String(u.id) })
        .then((r) => r.data),
  });
  const row = q.data?.rows[0];
  return (
    <Card
      title={`Attendance · ${monthName(month)}`}
      actions={
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => setOffset(offset - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
            Next
          </Button>
        </div>
      }
    >
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {!row ? (
          <EmptyState title="No attendance" message="Only active staff have attendance." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Present" value={num(row.summary.present ?? 0)} tone="green" />
              <StatCard label="Leave" value={num((row.summary.leave ?? 0) + (row.summary.unpaid_leave ?? 0))} tone="blue" />
              <StatCard label="Absent" value={num(row.summary.absent ?? 0)} tone="red" />
              <StatCard label="Hours worked" value={hours(row.summary.minutes ?? 0)} tone="slate" />
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {Object.entries(row.days).map(([d, day]) => (
                <div key={d} title={[STATUS_STYLE[day.status].label, day.in && `In ${dateTime(day.in)}`, day.out && `Out ${dateTime(day.out)}`].filter(Boolean).join(' · ')} className={cn('rounded-lg p-2 text-center text-xs', STATUS_STYLE[day.status].cell, day.outside && 'ring-2 ring-amber-400')}>
                  <p className="font-semibold">{Number(d.slice(8))}</p>
                  <p>{day.code || '·'}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Hover a day for punch times. An amber ring means a punch outside the branch geofence. Correct days in HR → Attendance register.</p>
          </>
        )}
      </QueryState>
    </Card>
  );
}

function LeaveTab({ u }: { u: StaffUser }) {
  const balances = useQuery({
    queryKey: ['hr-balances', u.id],
    queryFn: () => api.get<Envelope<{ rows: { balances: LeaveBalance[] }[] }>>('/hr/leave-balances', { user_id: String(u.id) }).then((r) => r.data.rows[0]?.balances ?? []),
  });
  const requests = useQuery({
    queryKey: ['hr-leave', 'user', u.id],
    queryFn: () => api.get<{ data: (LeaveRequest & { type?: { name: string } | null })[] }>('/hr/leave-requests', { user_id: String(u.id), per_page: '20' }).then((r) => r.data),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Balances this year">
        <QueryState loading={balances.isLoading} error={balances.error} onRetry={balances.refetch}>
          <ul className="divide-y divide-slate-100 text-sm">
            {balances.data?.map((b) => (
              <li key={b.leave_type.id} className="flex justify-between py-2">
                <span className="text-slate-700">{b.leave_type.name}</span>
                <span className="font-medium tabular-nums text-slate-900">{b.remaining == null ? `${num(b.used)} used` : `${num(b.remaining)} of ${num(b.quota)} left`}</span>
              </li>
            ))}
          </ul>
        </QueryState>
      </Card>
      <Card title="Requests" padded={false} className="lg:col-span-2">
        <DataTable
          rows={requests.data}
          loading={requests.isLoading}
          empty={<EmptyState title="No leave requests" />}
          columns={[
            { key: 'type', header: 'Type', render: (r) => r.type?.name ?? '—' },
            { key: 'dates', header: 'Dates', render: (r) => (r.from_date === r.to_date ? date(r.from_date) : `${date(r.from_date)} – ${date(r.to_date)}`) },
            { key: 'days', header: 'Days', render: (r) => num(r.days) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
        <p className="px-4 pb-4 text-xs text-slate-500">Approve or reject pending requests in HR → Leave.</p>
      </Card>
    </div>
  );
}

function PayTab({ u }: { u: StaffUser }) {
  const q = useQuery({ queryKey: ['hr-employee', u.id], queryFn: () => api.get<Envelope<{ profile: EmployeeProfile | null }>>(`/hr/employees/${u.id}`).then((r) => r.data) });
  const p = q.data?.profile;
  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      <Card title="Employment & salary" actions={<Link to="/hr/employees" className="text-sm text-brand-700 hover:underline">Edit in HR → Employees</Link>}>
        {!p ? (
          <EmptyState title="No salary set" message="Without a monthly salary they are left out of payroll. Add it in HR → Employees." />
        ) : (
          <DefinitionList
            items={[
              ['Employee code', p.employee_code ?? '—'],
              ['Designation', p.designation ?? '—'],
              ['Department', p.department ?? '—'],
              ['Date of joining', date(p.date_of_joining)],
              ['Monthly gross salary', money(p.monthly_salary)],
              ['Salary components', p.components?.length ? p.components.map((c) => c.name).join(', ') : 'None'],
            ]}
          />
        )}
      </Card>
    </QueryState>
  );
}
