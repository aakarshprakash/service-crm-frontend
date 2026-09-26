import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, LogIn, LogOut, MapPin, Package, PlayCircle, Wallet } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { dateTime, money, time } from '@/lib/format';
import { getPosition } from '@/lib/utils';
import type { Job, Visit } from '@/lib/types';
import { Button, Card, QueryState } from '@/components/ui';
import { PriorityBadge, StatusBadge } from '@/components/domain';

interface TechDashboard {
  counts: { open: number; in_progress: number; pending: number; completed: number };
  today: Job[];
  punch_status: 'in' | 'out';
  punched_at: string | null;
  cash_in_hand: number;
  collected_today: number;
  active_visit: (Visit & { job: { id: number; crm_call_id: string } }) | null;
}

export default function TechHome() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['tech-dashboard'], queryFn: () => api.get<Envelope<TechDashboard>>('/dashboard/technician').then((r) => r.data), refetchInterval: 60_000 });
  const punch = useApiMutation(
    async (type: 'in' | 'out') => {
      const pos = await getPosition(8000).catch(() => null); // location is optional for attendance
      return api.post('/punch', { type, ...(pos ?? {}) });
    },
    { invalidate: [['tech-dashboard']], onSuccess: () => refresh() },
  );
  const d = q.data;
  const tiles = [
    { key: 'open', label: 'Open', tone: 'bg-sky-50 text-sky-800 border-sky-100' },
    { key: 'in_progress', label: 'In Progress', tone: 'bg-violet-50 text-violet-800 border-violet-100' },
    { key: 'pending', label: 'Pending', tone: 'bg-amber-50 text-amber-900 border-amber-100' },
    { key: 'completed', label: 'Completed', tone: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
  ] as const;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {d && (
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Hello,</p>
              <h1 className="text-xl font-semibold">{user?.name}</h1>
              <p className="text-xs text-slate-500">{d.punch_status === 'in' ? `On duty since ${time(d.punched_at)}` : 'You are off duty'}</p>
            </div>
            {d.punch_status === 'in' ? (
              <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} loading={punch.isPending} onClick={() => punch.mutate('out')}>
                Punch out
              </Button>
            ) : (
              <Button variant="success" icon={<LogIn className="h-4 w-4" />} loading={punch.isPending} onClick={() => punch.mutate('in')}>
                Punch in
              </Button>
            )}
          </div>

          {d.active_visit && (
            <button onClick={() => navigate(`/tech/jobs/${d.active_visit!.job_id}`)} className="flex w-full items-center gap-3 rounded-xl bg-violet-600 p-4 text-left text-white shadow-lg">
              <PlayCircle className="h-8 w-8 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Service in progress · {d.active_visit.job.crm_call_id}</p>
                <p className="text-xs text-violet-100">Started {dateTime(d.active_visit.start_time)} — tap to continue</p>
              </div>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <Link key={t.key} to={`/tech/jobs?status=${t.key}`} className={`rounded-xl border p-4 ${t.tone}`}>
                <p className="text-3xl font-bold tabular-nums">{d.counts[t.key]}</p>
                <p className="text-sm font-medium">{t.label}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Link to="/tech/jobs" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <ClipboardList className="h-6 w-6 text-brand-700" /> Customer services
            </Link>
            <Link to="/tech/parts" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <Package className="h-6 w-6 text-brand-700" /> Spare inventory
            </Link>
            <Link to="/tech/cash" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <Wallet className="h-6 w-6 text-brand-700" /> Cash close
            </Link>
          </div>

          <Card>
            <div className="grid grid-cols-2 divide-x divide-slate-100 text-center">
              <div>
                <p className="text-xs text-slate-500">Collected today</p>
                <p className="text-lg font-semibold tabular-nums">{money(d.collected_today)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cash in hand</p>
                <p className="text-lg font-semibold tabular-nums">{money(d.cash_in_hand)}</p>
              </div>
            </div>
          </Card>

          <Card title="Today & overdue" padded={false}>
            {!d.today.length ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No visits scheduled for today. 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.today.map((j) => (
                  <li key={j.id}>
                    <Link to={`/tech/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{j.crm_call_id}</span>
                          <PriorityBadge priority={j.priority} />
                        </div>
                        <p className="truncate text-sm text-slate-700">{j.customer?.name} · {j.complaint_type?.name ?? 'Service'}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                          <MapPin className="h-3 w-3" /> {[j.customer?.address, j.customer?.city].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={j.status} />
                        <p className="mt-1 text-xs text-slate-500">{time(j.scheduled_at)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </QueryState>
  );
}
