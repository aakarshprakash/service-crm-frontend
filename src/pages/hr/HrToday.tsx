import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, MapPinOff, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { date, time, today } from '@/lib/format';
import type { AttendanceDay, DayStatus } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, FilterBar, Input, PageHeader, Select, StatCard } from '@/components/ui';
import { AdjustDialog, DayPill, hours } from './hrParts';

interface Punch { id: number; type: 'in' | 'out'; lat: number | null; lng: number | null; accuracy: number | null; distance_m: number | null; within_fence: boolean | null; source: string | null; created_at: string }
interface Row { user: { id: number; name: string; role: string; branch: string | null; punch_status: 'in' | 'out' }; day: AttendanceDay; punches: Punch[] }
interface Meta { date: string; present: number; on_leave: number; absent: number; on_duty_now: number; outside_fence: number }

/** Who's in today: every active staff member's status, punch times and where they punched from. */
export default function HrToday() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { data: lookups } = useLookups();
  const [day, setDay] = useState(today());
  const [role, setRole] = useState('');
  const [branch, setBranch] = useState('');
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ['hr', 'daily', day, role, branch],
    queryFn: () => api.get<Envelope<Row[]> & { meta: Meta }>('/hr/attendance/daily', { date: day, role, branch_id: branch }),
    refetchInterval: day === today() ? 60_000 : false,
  });
  const meta = q.data?.meta;

  return (
    <>
      <PageHeader title="Attendance today" description={`Staff status for ${date(day)}, from punches, approved leave and holidays.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Present" value={meta?.present ?? '–'} tone="green" />
        <StatCard label="On duty now" value={meta?.on_duty_now ?? '–'} tone="blue" />
        <StatCard label="On leave" value={meta?.on_leave ?? '–'} tone="violet" />
        <StatCard label="Absent" value={meta?.absent ?? '–'} tone={meta?.absent ? 'red' : 'slate'} />
        <StatCard label="Punched outside geofence" value={meta?.outside_fence ?? '–'} tone={meta?.outside_fence ? 'amber' : 'slate'} />
      </div>
      <Card padded={false}>
        <FilterBar>
          <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className="sm:w-44" aria-label="Date" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {['technician', 'coordinator', 'accountant', 'admin'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="sm:w-44" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
        <DataTable
          rows={q.data?.data.map((r) => ({ ...r, id: r.user.id }))}
          loading={q.isFetching}
          empty={<EmptyState title="No active staff" />}
          columns={[
            {
              key: 'name',
              header: 'Staff',
              render: (r) => (
                <div>
                  <p className="font-medium text-slate-900">
                    {r.user.name} {r.user.punch_status === 'in' && day === today() && <Badge tone="green" dot>On duty</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t(`role.${r.user.role}`)}
                    {r.user.branch && ` · ${r.user.branch}`}
                  </p>
                </div>
              ),
            },
            {
              key: 's',
              header: 'Status',
              render: (r) => (
                <div className="space-y-0.5">
                  <DayPill status={r.day.status as DayStatus} />
                  {(r.day.leave_type || r.day.holiday || r.day.note) && <p className="text-xs text-slate-500">{r.day.leave_type ?? r.day.holiday ?? r.day.note}</p>}
                  {r.day.adjusted && <p className="text-[11px] text-slate-400">manual entry</p>}
                </div>
              ),
            },
            { key: 'in', header: 'In', render: (r) => r.day.in ?? '—' },
            { key: 'out', header: 'Out', render: (r) => r.day.out ?? '—' },
            { key: 'h', header: 'Hours', hideOnMobile: true, render: (r) => hours(r.day.minutes) },
            {
              key: 'loc',
              header: 'Punch locations',
              hideOnMobile: true,
              render: (r) =>
                r.punches.length ? (
                  <div className="flex flex-wrap gap-1">
                    {r.punches.map((p) => (
                      <PunchChip key={p.id} p={p} />
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-300">—</span>
                ),
            },
            ...(can('hr.manage')
              ? [
                  {
                    key: 'adj',
                    header: '',
                    className: 'w-10',
                    render: (r: Row) => (
                      <Button size="sm" variant="ghost" aria-label="Correct attendance" onClick={() => setAdjusting(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {adjusting && <AdjustDialog user={adjusting.user} day={day} current={adjusting.day.status as DayStatus} onClose={() => setAdjusting(null)} />}
    </>
  );
}

function PunchChip({ p }: { p: Punch }) {
  const label = `${p.type === 'in' ? 'In' : 'Out'} ${time(p.created_at)}`;
  const title = [p.distance_m != null ? `${p.distance_m} m from branch` : null, p.accuracy ? `±${p.accuracy} m` : null, p.source].filter(Boolean).join(' · ');
  const cls = p.within_fence === false ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-600 ring-slate-200';
  const inner = (
    <>
      {p.lat != null ? <MapPin className="h-3 w-3" /> : <MapPinOff className="h-3 w-3" />}
      {label}
      {p.within_fence === false && ' · outside'}
    </>
  );
  return p.lat != null ? (
    <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset hover:underline ${cls}`}>
      {inner}
    </a>
  ) : (
    <span title="No location shared" className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${cls}`}>
      {inner}
    </span>
  );
}
