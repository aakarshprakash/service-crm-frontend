import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, LogIn, LogOut } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { date, money, time, today } from '@/lib/format';
import { cn, getPosition } from '@/lib/utils';
import type { AttendanceDay, AttendanceSummary, LeaveBalance, LeaveRequest, Payslip } from '@/lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, Textarea, toast } from '@/components/ui';
import { LEAVE_TONE } from './LeaveRequests';
import { STATUS_STYLE, hours, monthName, num, thisMonth } from './hrParts';

/** Self service for every staff member: punch, my attendance, leave and payslips. */
export default function MyHr() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className={cn(user?.role === 'technician' && 'mx-auto max-w-2xl')}>
      <PageHeader title={t('nav.me')} description={t('myhr.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <MyAttendance />
          <MyPayslips />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <MyLeave />
        </div>
      </div>
    </div>
  );
}

function MyAttendance() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const q = useQuery({
    queryKey: ['my-attendance', month],
    queryFn: () => api.get<Envelope<{ month: string; days: AttendanceDay[]; summary: AttendanceSummary; punch_status: 'in' | 'out'; punched_at: string | null }>>('/my/attendance', { month }).then((r) => r.data),
  });
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const on = d?.punch_status === 'in';
  const step = (n: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const dt = new Date(y, m - 1 + n, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };
  const punch = async () => {
    setBusy(true);
    try {
      const pos = await getPosition(8000).catch(() => null);
      const res = await api.post<{ message?: string }>('/punch', { type: on ? 'out' : 'in', source: 'web', ...(pos ?? {}) });
      toast.success(res.message ?? t('common.done'));
      await refresh();
      qc.invalidateQueries({ queryKey: ['my-attendance'] });
      qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const first = d?.days[0]?.date ? new Date(d.days[0].date + 'T00:00:00').getDay() : 0;
  const offset = (first + 6) % 7; // Monday-first grid

  return (
    <Card
      title={t('myhr.attendance')}
      actions={
        <Button size="sm" variant={on ? 'secondary' : 'success'} loading={busy} icon={on ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} onClick={punch}>
          {on ? t('punch.out') : t('punch.in')}
        </Button>
      }
    >
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <>
            <p className="mb-3 text-sm text-slate-500">{on ? t('tech.onDutySince', { time: time(d.punched_at) }) : t('tech.offDuty')}</p>
            <div className="mb-3 flex items-center justify-between">
              <Button variant="ghost" size="sm" aria-label={t('common.previousMonth')} onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">{monthName(month)}</span>
              <Button variant="ghost" size="sm" aria-label={t('common.nextMonth')} disabled={month >= thisMonth()} onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {(t('common.weekdaysShort', { returnObjects: true }) as string[]).map((w, i) => (
                <span key={i} className="pb-1 font-medium text-slate-400">
                  {w}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`b${i}`} />
              ))}
              {d.days.map((day) => {
                const s = STATUS_STYLE[day.status];
                return (
                  <div
                    key={day.date}
                    title={[t(`day.${day.status}`), day.in && `${t('myhr.in')} ${day.in}`, day.out && `${t('myhr.out')} ${day.out}`, day.minutes ? hours(day.minutes) : null, day.leave_type ?? day.holiday ?? day.note].filter(Boolean).join(' · ')}
                    className={cn('flex aspect-square flex-col items-center justify-center rounded-md', s.cell, day.date === today() && 'ring-2 ring-brand-500')}
                  >
                    <span className="text-xs font-semibold">{Number(day.date!.slice(8))}</span>
                    <span className="text-[9px] leading-none">{day.code}</span>
                  </div>
                );
              })}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
              {(
                [
                  [t('day.present'), d.summary.present],
                  [t('myhr.leave'), d.summary.paid_leave],
                  [t('myhr.unpaid'), d.summary.unpaid_leave],
                  [t('day.absent'), d.summary.absent],
                  [t('myhr.holidays'), d.summary.holidays],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-sm font-semibold">{num(v)}</dd>
                </div>
              ))}
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">{t('myhr.hours')}</dt>
                <dd className="text-sm font-semibold">{hours(d.summary.minutes)}</dd>
              </div>
            </dl>
          </>
        )}
      </QueryState>
    </Card>
  );
}

function MyLeave() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['my-leaves'], queryFn: () => api.get<Envelope<{ year: number; balances: LeaveBalance[]; requests: LeaveRequest[] }>>('/my/leaves').then((r) => r.data) });
  const [applying, setApplying] = useState(false);
  const cancel = useApiMutation((id: number) => api.post(`/my/leaves/${id}/cancel`), { invalidate: [['my-leaves'], ['my-attendance']] });
  const d = q.data;
  return (
    <Card
      title={t('myhr.leave')}
      actions={
        <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setApplying(true)}>
          {t('myhr.apply')}
        </Button>
      }
    >
      <QueryState loading={q.isLoading} error={q.error}>
        {d && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              {d.balances.map((b) => (
                <div key={b.leave_type.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{b.leave_type.name}</p>
                  <p className="text-lg font-semibold tabular-nums">{b.remaining === null ? num(b.used) : num(b.remaining)}</p>
                  <p className="text-[11px] text-slate-500">{b.remaining === null ? t('myhr.daysTaken') : t('myhr.leftOf', { quota: num(b.quota) })}{b.pending > 0 && ` · ${t('myhr.pendingDays', { days: num(b.pending) })}`}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('myhr.myRequests')}</p>
              {!d.requests.length ? (
                <p className="text-sm text-slate-500">{t('myhr.noRequests')}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.requests.map((l) => {
                    const canCancel = l.status === 'pending' || (l.status === 'approved' && l.from_date > today());
                    return (
                      <li key={l.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">
                            {l.type?.name} · {t('myhr.daysShort', { days: num(l.days) })}
                          </p>
                          <p className="text-xs text-slate-500">
                            {date(l.from_date)}
                            {l.to_date !== l.from_date && ` → ${date(l.to_date)}`}
                          </p>
                          {l.decision_note && <p className="text-xs text-slate-500">“{l.decision_note}”</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge tone={LEAVE_TONE[l.status]}>{t(`leaveStatus.${l.status}`)}</Badge>
                          {canCancel && (
                            <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => cancel.mutate(l.id)}>
                              {t('action.cancel')}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </QueryState>
      {applying && <ApplyLeave onClose={() => setApplying(false)} />}
    </Card>
  );
}

function ApplyLeave({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const [form, setForm] = useState({ leave_type_id: '', from_date: today(), to_date: today(), half_day: false, reason: '' });
  const m = useApiMutation(() => api.post('/my/leaves', { ...form, leave_type_id: Number(form.leave_type_id), to_date: form.half_day ? form.from_date : form.to_date, reason: form.reason || null }), {
    invalidate: [['my-leaves']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('myhr.applyTitle')}
      description={t('myhr.applyHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button loading={m.isPending} disabled={!form.leave_type_id} onClick={() => m.mutate(undefined)}>
            {t('myhr.sendRequest')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('myhr.leaveType')} required className="sm:col-span-2" error={e('leave_type_id')}>
          <Select value={form.leave_type_id} onChange={(ev) => setForm({ ...form, leave_type_id: ev.target.value })}>
            <option value="">{t('common.select')}</option>
            {lookups?.leave_types?.map((lt) => (
              <option key={lt.id} value={lt.id}>
                {lt.name}
                {!lt.is_paid && ` (${t('myhr.unpaidLower')})`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={form.half_day ? t('common.date') : t('common.from')} required error={e('from_date')}>
          <Input type="date" value={form.from_date} onChange={(ev) => setForm({ ...form, from_date: ev.target.value, to_date: ev.target.value > form.to_date ? ev.target.value : form.to_date })} />
        </Field>
        {!form.half_day && (
          <Field label={t('common.to')} required error={e('to_date')}>
            <Input type="date" min={form.from_date} value={form.to_date} onChange={(ev) => setForm({ ...form, to_date: ev.target.value })} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Checkbox label={t('myhr.halfDay')} checked={form.half_day} onChange={(v) => setForm({ ...form, half_day: v })} />
          {e('half_day') && <p className="text-xs text-red-600">{e('half_day')}</p>}
        </div>
        <Field label={t('myhr.reason')} className="sm:col-span-2" error={e('reason')}>
          <Textarea rows={2} maxLength={500} value={form.reason} onChange={(ev) => setForm({ ...form, reason: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function MyPayslips() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['my-payslips'], queryFn: () => api.get<Envelope<Payslip[]>>('/my/payslips').then((r) => r.data) });
  return (
    <Card title={t('myhr.payslips')} padded={false}>
      <QueryState loading={q.isLoading} error={q.error}>
        {!q.data?.length ? (
          <EmptyState title={t('myhr.noPayslips')} message={t('myhr.noPayslipsHint')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {q.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.run && monthName(p.run.month)}</p>
                  <p className="text-xs text-slate-500">
                    {t('myhr.daysPresent', { days: num(p.present_days) })}
                    {p.lop_days > 0 && ` · ${t('myhr.lop', { days: num(p.lop_days) })}`} · {p.run?.status === 'paid' ? t('common.paid') : t('myhr.processing')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{money(p.net_pay)}</span>
                  <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => download(`/my/payslips/${p.id}/pdf`, `payslip-${p.run?.month}.pdf`).catch((err) => toast.error(err.message))}>
                    PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
