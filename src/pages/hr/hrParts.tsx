import { useState } from 'react';
import i18n from 'i18next';
import { api } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DayStatus } from '@/lib/types';
import { Button, Field, Input, Modal, Select } from '@/components/ui';

export const STATUS_STYLE: Record<DayStatus, { label: string; cell: string; badge: string }> = {
  present: { label: 'Present', cell: 'bg-emerald-100 text-emerald-800', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  half_day: { label: 'Half day', cell: 'bg-lime-100 text-lime-800', badge: 'bg-lime-50 text-lime-700 ring-lime-200' },
  absent: { label: 'Absent', cell: 'bg-red-100 text-red-700', badge: 'bg-red-50 text-red-700 ring-red-200' },
  leave: { label: 'On leave', cell: 'bg-sky-100 text-sky-800', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  unpaid_leave: { label: 'Unpaid leave', cell: 'bg-amber-100 text-amber-800', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  holiday: { label: 'Holiday', cell: 'bg-violet-100 text-violet-800', badge: 'bg-violet-50 text-violet-700 ring-violet-200' },
  weekly_off: { label: 'Weekly off', cell: 'bg-slate-100 text-slate-500', badge: 'bg-slate-50 text-slate-600 ring-slate-200' },
  not_joined: { label: 'Not employed', cell: 'bg-slate-50 text-slate-300', badge: 'bg-slate-50 text-slate-400 ring-slate-200' },
  future: { label: '', cell: 'text-slate-300', badge: 'bg-white text-slate-400 ring-slate-200' },
};

export function DayPill({ status }: { status: DayStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.badge)}>{s.label || '—'}</span>;
}

export function hours(minutes: number): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function thisMonth(offset = 0): string {
  const [y, m] = today().split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(`${i18n.language || 'en'}-IN`, { month: 'long', year: 'numeric' });
}

export function num(n: number): string {
  return String(Number(n.toFixed(1)));
}

/** Manually mark a day present / half day / absent (forgot to punch, on-site training…), or clear it. */
export function AdjustDialog({ user, day, current, onClose }: { user: { id: number; name: string }; day: string; current?: DayStatus; onClose: () => void }) {
  const [status, setStatus] = useState<string>(current && ['present', 'half_day', 'absent'].includes(current) ? current : 'present');
  const [note, setNote] = useState('');
  const m = useApiMutation((s: string | null) => api.post('/hr/attendance/adjust', { user_id: user.id, date: day, status: s, note: note || null }), {
    invalidate: [['hr']],
    toastValidation: true,
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${user.name} · ${date(day)}`}
      description="Overrides what the punches say for this day. Payroll uses it."
      footer={
        <>
          <Button variant="ghost" onClick={() => m.mutate(null)} loading={m.isPending && m.variables === null}>
            Clear manual entry
          </Button>
          <Button onClick={() => m.mutate(status)} loading={m.isPending && m.variables !== null}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Mark as" error={fieldError(m.error, 'status') ?? fieldError(m.error, 'date')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="present">Present</option>
            <option value="half_day">Half day</option>
            <option value="absent">Absent</option>
          </Select>
        </Field>
        <Field label="Reason">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Forgot to punch, was at customer site" />
        </Field>
      </div>
    </Modal>
  );
}
