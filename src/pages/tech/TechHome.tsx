import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardList, LogIn, LogOut, MapPin, Package, PlayCircle, Wallet, Wrench } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, time } from '@/lib/format';
import { getPosition } from '@/lib/utils';
import type { Asset, Job, Visit } from '@/lib/types';
import { Button, Card, QueryState } from '@/components/ui';
import { PriorityBadge, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

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
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['tech-dashboard'], queryFn: () => api.get<Envelope<TechDashboard>>('/dashboard/technician').then((r) => r.data), refetchInterval: 60_000 });
  const punch = useApiMutation(
    async (type: 'in' | 'out') => {
      const pos = await getPosition(8000).catch(() => null); // location is optional for attendance
      return api.post('/punch', { type, source: 'web', ...(pos ?? {}) });
    },
    { invalidate: [['tech-dashboard']], onSuccess: () => refresh() },
  );
  const d = q.data;
  const tiles = [
    { key: 'open', label: t('status.open'), tone: 'bg-brand-50 text-brand-800 border-brand-100' },
    { key: 'in_progress', label: t('status.in_progress'), tone: 'bg-violet-50 text-violet-800 border-violet-100' },
    { key: 'pending', label: t('status.pending'), tone: 'bg-amber-50 text-amber-900 border-amber-100' },
    { key: 'completed', label: t('status.completed'), tone: 'bg-accent-50 text-accent-800 border-accent-100' },
  ] as const;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {d && (
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-navy-900 p-5 text-white shadow-lift">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_0%,rgba(37,99,235,0.45),transparent_60%),radial-gradient(60%_100%_at_100%_100%,rgba(16,185,129,0.3),transparent_60%)]" />
            <div className="relative">
              <p className="text-sm text-slate-300">{t('tech.hello')}</p>
              <h1 className="text-xl font-bold">{user?.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300">
                <span className={d.punch_status === 'in' ? 'h-2 w-2 rounded-full bg-accent-400' : 'h-2 w-2 rounded-full bg-slate-500'} />
                {d.punch_status === 'in' ? t('tech.onDutySince', { time: time(d.punched_at) }) : t('tech.offDuty')}
              </p>
            </div>
            <Hint className="relative" text={d.punch_status === 'in' ? t('tech.punchOutHint') : t('tech.punchInHint')}>
              {d.punch_status === 'in' ? (
                <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} loading={punch.isPending} onClick={() => punch.mutate('out')}>
                  {t('punch.out')}
                </Button>
              ) : (
                <Button variant="success" icon={<LogIn className="h-4 w-4" />} loading={punch.isPending} onClick={() => punch.mutate('in')}>
                  {t('punch.in')}
                </Button>
              )}
            </Hint>
          </div>

          {d.active_visit && (
            <button onClick={() => navigate(`/tech/jobs/${d.active_visit!.job_id}`)} className="flex w-full items-center gap-3 rounded-xl bg-violet-600 p-4 text-left text-white shadow-lg">
              <PlayCircle className="h-8 w-8 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{t('tech.inProgress', { call: d.active_visit.job.crm_call_id })}</p>
                <p className="text-xs text-violet-100">{t('tech.startedTapToContinue', { time: dateTime(d.active_visit.start_time) })}</p>
              </div>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <Link key={tile.key} to={`/tech/jobs?status=${tile.key}`} className={`rounded-xl border p-4 transition hover:shadow-card ${tile.tone}`}>
                <p className="text-3xl font-bold tabular-nums">{d.counts[tile.key]}</p>
                <p className="text-sm font-medium">{tile.label}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Link to="/tech/jobs" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <ClipboardList className="h-6 w-6 text-brand-600" /> {t('tech.customerServices')}
            </Link>
            <Link to="/tech/parts" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <Package className="h-6 w-6 text-brand-600" /> {t('tech.spareInventory')}
            </Link>
            <Link to="/tech/cash" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-medium text-slate-700 shadow-card">
              <Wallet className="h-6 w-6 text-brand-600" /> {t('tech.cashClose')}
            </Link>
          </div>

          <Card>
            <div className="grid grid-cols-2 divide-x divide-slate-100 text-center">
              <div>
                <p className="text-xs text-slate-500">{t('tech.collectedToday')}</p>
                <p className="text-lg font-semibold tabular-nums">{money(d.collected_today)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('tech.cashInHand')}</p>
                <p className="text-lg font-semibold tabular-nums">{money(d.cash_in_hand)}</p>
              </div>
            </div>
          </Card>

          <MyAssets />

          <Card title={t('tech.todayOverdue')} padded={false}>
            {!d.today.length ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">{t('tech.noVisitsToday')}</p>
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
                        <p className="truncate text-sm text-slate-700">{j.customer?.name} · {j.complaint_type?.name ?? t('tech.service')}</p>
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

type MyAsset = Pick<Asset, 'id' | 'asset_code' | 'name' | 'category' | 'brand' | 'model' | 'serial_no' | 'condition'> & {
  current_assignment: { issued_at: string; issue_notes: string | null } | null;
};

/** Company tools / devices currently issued to this technician. Hidden when they hold none. */
function MyAssets() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['my-assets'], queryFn: () => api.get<Envelope<MyAsset[]>>('/my/assets').then((r) => r.data) });
  if (!q.data?.length) return null;
  return (
    <Card title={t('tech.myAssets', { count: q.data.length })} padded={false}>
      <ul className="divide-y divide-slate-100">
        {q.data.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <Wrench className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-slate-500">
                {a.asset_code}
                {a.serial_no && ` · ${t('common.sn')} ${a.serial_no}`}
                {a.current_assignment && ` · ${t('tech.since', { date: date(a.current_assignment.issued_at) })}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
