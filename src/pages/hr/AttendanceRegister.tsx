import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FileBarChart } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';
import type { AttendanceSummary, DayStatus } from '@/lib/types';
import { Button, Card, EmptyState, FilterBar, PageHeader, QueryState, Select } from '@/components/ui';
import { AdjustDialog, STATUS_STYLE, hours, monthName, num, thisMonth } from './hrParts';

interface Cell { code: string; status: DayStatus; in: string | null; out: string | null; minutes: number; outside: boolean; adjusted: boolean; note: string | null }
interface Register { month: string; dates: string[]; rows: { user: { id: number; name: string; role: string; branch: string | null }; days: Record<string, Cell>; summary: AttendanceSummary }[] }

/** Monthly attendance register: one row per staff member, one column per day. */
export default function AttendanceRegister() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [role, setRole] = useState('');
  const [adjust, setAdjust] = useState<{ user: { id: number; name: string }; day: string; status: DayStatus } | null>(null);
  const q = useQuery({ queryKey: ['hr', 'register', month, role], queryFn: () => api.get<Envelope<Register>>('/hr/attendance/register', { month, role }).then((r) => r.data) });
  const r = q.data;
  const step = (n: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <>
      <PageHeader
        title="Attendance register"
        description="Click a day to correct it. P present · HD half day · L paid leave · LOP unpaid leave · A absent · H holiday · WO weekly off."
        actions={
          <Link to="/reports?report=attendance">
            <Button variant="secondary" icon={<FileBarChart className="h-4 w-4" />}>
              Export
            </Button>
          </Link>
        }
      />
      <Card padded={false}>
        <FilterBar>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-36 text-center text-sm font-semibold">{monthName(month)}</span>
            <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => step(1)} disabled={month >= thisMonth()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {['technician', 'coordinator', 'accountant', 'admin'].map((x) => (
              <option key={x} value={x}>
                {t(`role.${x}`)}
              </option>
            ))}
          </Select>
        </FilterBar>
        <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {r && !r.rows.length && <EmptyState title="No active staff" />}
          {r && r.rows.length > 0 && (
            <div className={cn('overflow-x-auto', q.isFetching && 'opacity-60')}>
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 min-w-[11rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Staff</th>
                    {r.dates.map((d) => {
                      const day = new Date(d + 'T00:00:00');
                      return (
                        <th key={d} className={cn('min-w-[2.1rem] border-b border-slate-200 px-0.5 py-2 text-center font-medium', day.getDay() === 0 ? 'text-red-500' : 'text-slate-500')}>
                          {day.getDate()}
                          <span className="block text-[10px] font-normal">{day.toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
                        </th>
                      );
                    })}
                    {['P', 'L', 'LOP', 'A', 'Hours'].map((h) => (
                      <th key={h} className="border-b border-l border-slate-200 px-2 py-2 text-right font-semibold text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr key={row.user.id} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5">
                        <p className="font-medium text-slate-900">{row.user.name}</p>
                        <p className="text-[11px] text-slate-500">{t(`role.${row.user.role}`)}</p>
                      </td>
                      {r.dates.map((d) => {
                        const c = row.days[d]!;
                        const style = STATUS_STYLE[c.status];
                        const tip = [style.label, c.in && `In ${c.in}`, c.out && `Out ${c.out}`, c.minutes ? hours(c.minutes) : null, c.outside && 'Punched outside geofence', c.note, c.adjusted && '(manual)'].filter(Boolean).join(' · ');
                        const editable = can('hr.manage') && c.status !== 'future' && c.status !== 'not_joined';
                        return (
                          <td key={d} className="border-b border-slate-100 p-0.5 text-center">
                            <button
                              type="button"
                              title={tip}
                              disabled={!editable}
                              onClick={() => setAdjust({ user: row.user, day: d, status: c.status })}
                              className={cn('relative h-7 w-full rounded text-[10px] font-semibold', style.cell, editable && 'hover:ring-2 hover:ring-brand-400', c.adjusted && 'underline decoration-dotted')}
                            >
                              {c.code}
                              {c.outside && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-slate-100 px-2 text-right tabular-nums font-medium">{num(row.summary.present)}</td>
                      <td className="border-b border-slate-100 px-2 text-right tabular-nums">{num(row.summary.paid_leave)}</td>
                      <td className="border-b border-slate-100 px-2 text-right tabular-nums">{num(row.summary.unpaid_leave)}</td>
                      <td className={cn('border-b border-slate-100 px-2 text-right tabular-nums', row.summary.absent > 0 && 'text-red-700')}>{num(row.summary.absent)}</td>
                      <td className="border-b border-slate-100 px-2 text-right tabular-nums text-slate-600">{hours(row.summary.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>
      {adjust && <AdjustDialog user={adjust.user} day={adjust.day} current={adjust.status} onClose={() => setAdjust(null)} />}
    </>
  );
}
