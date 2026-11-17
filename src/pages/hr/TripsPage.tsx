import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, ExternalLink, LogIn, LogOut, MapPin, MapPinOff, Navigation, Route, Wrench } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useLookups, useStaffOptions } from '@/lib/hooks';
import { date, time, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, FilterBar, Input, Modal, PageHeader, Select, Spinner, StatCard } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

interface Totals { visits: number; completed: number; distance_m: number; travel_seconds: number; on_site_seconds: number; unlocated_legs: number; first_at: string | null; last_at: string | null; punched_in_at: string | null; punched_out_at: string | null }
interface DayRow extends Totals { user_id: number; name: string; date: string }
interface TechRow { user_id: number; name: string; days: number; visits: number; distance_m: number; travel_seconds: number; on_site_seconds: number; unlocated_legs: number }
interface Summary { days: DayRow[]; technicians: TechRow[]; totals: { days: number; visits: number; distance_m: number; travel_seconds: number; on_site_seconds: number } }
interface Stop {
  kind: 'punch_in' | 'punch_out' | 'visit';
  label: string;
  detail: string | null;
  job_id: number | null;
  visit_status: string | null;
  arrived_at: string;
  left_at: string | null;
  on_site_seconds: number | null;
  lat: number | null;
  lng: number | null;
  outside_fence: boolean;
  leg: { distance_m: number | null; seconds: number } | null;
}
interface DayDetail { user: { id: number; name: string }; date: string; stops: Stop[]; summary: Totals; map_url: string | null }

const km = (m: number) => (m >= 100_000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`);
const span = (seconds: number) => {
  if (seconds < 60) return seconds > 0 ? '1 min' : '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Where each technician went: their stops for a day, the distance between them and the time on site.
 * Built from punches and visits, so nothing extra is asked of the technician.
 */
export default function TripsPage() {
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [tech, setTech] = useState('');
  const [branch, setBranch] = useState('');
  const [open, setOpen] = useState<{ userId: number; date: string } | null>(null);
  const oneDay = from === to;
  const q = useQuery({
    queryKey: ['hr', 'trips', from, to, tech, branch],
    queryFn: () => api.get<Envelope<Summary>>('/hr/trips', { from, to, user_id: tech, branch_id: branch }).then((r) => r.data),
    refetchInterval: oneDay && to === today() ? 120_000 : false,
  });
  const s = q.data;
  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const presets: [string, string, string][] = [['Today', today(), today()], ['Yesterday', daysAgo(1), daysAgo(1)], ['Last 7 days', daysAgo(6), today()], ['Last 30 days', daysAgo(29), today()]];

  return (
    <>
      <PageHeader title="Trips" description="Each technician’s day on the road: where they went, how far and how long they spent at each customer." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Distance" value={s ? km(s.totals.distance_m) : '–'} hint="Straight line between stops" icon={<Route className="h-5 w-5" />} tone="blue" />
        <StatCard label="Visits" value={s?.totals.visits ?? '–'} hint={s && !oneDay ? `over ${s.totals.days} technician-days` : undefined} icon={<Wrench className="h-5 w-5" />} tone="violet" />
        <StatCard label="Time at customers" value={s ? span(s.totals.on_site_seconds) : '–'} icon={<Clock className="h-5 w-5" />} tone="green" />
        <StatCard label="Average per day" value={s && s.totals.days ? km(Math.round(s.totals.distance_m / s.totals.days)) : '–'} hint="Distance per technician per day" icon={<Navigation className="h-5 w-5" />} tone="amber" />
      </div>

      <Card padded={false}>
        <FilterBar>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(([label, f, t]) => (
              <button key={label} type="button" aria-pressed={from === f && to === t} onClick={() => setRange(f, t)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', from === f && to === t ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300')}>
                {label}
              </button>
            ))}
          </div>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="sm:w-40" aria-label="From date" />
          <Input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="sm:w-40" aria-label="To date" />
          <Select value={tech} onChange={(e) => setTech(e.target.value)} className="sm:w-48" aria-label="Technician">
            <option value="">All technicians</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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

        {q.error ? (
          <p className="px-5 py-8 text-center text-sm text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load trips.'}</p>
        ) : (
          <>
            {!oneDay && !!s?.technicians.length && (
              <div className="border-b border-slate-100">
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Totals for {date(from)} – {date(to)}</p>
                <DataTable
                  rows={s.technicians.map((t) => ({ ...t, id: t.user_id }))}
                  onRowClick={(t) => setTech(String(t.user_id))}
                  columns={[
                    { key: 'name', header: 'Technician', render: (t) => <span className="font-medium text-slate-900">{t.name}</span> },
                    { key: 'days', header: 'Days', render: (t) => t.days, className: 'text-right tabular-nums', headerClassName: 'text-right' },
                    { key: 'visits', header: 'Visits', render: (t) => t.visits, className: 'text-right tabular-nums', headerClassName: 'text-right' },
                    { key: 'km', header: 'Distance', render: (t) => <span className="font-medium">{km(t.distance_m)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
                    { key: 'site', header: 'At customers', hideOnMobile: true, render: (t) => span(t.on_site_seconds), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                    { key: 'avg', header: 'Per day', hideOnMobile: true, render: (t) => (t.days ? km(Math.round(t.distance_m / t.days)) : '—'), className: 'text-right tabular-nums', headerClassName: 'text-right' },
                  ]}
                />
              </div>
            )}
            {!oneDay && <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Day by day</p>}
            <DataTable
              rows={s?.days.map((d) => ({ ...d, id: `${d.user_id}-${d.date}` }))}
              loading={q.isFetching}
              onRowClick={(d) => setOpen({ userId: d.user_id, date: d.date })}
              empty={<EmptyState title="No trips recorded" message={oneDay ? 'No technician has punched in or started a visit on this day.' : 'Nothing was recorded in this period.'} />}
              columns={[
                {
                  key: 'name',
                  header: 'Technician',
                  render: (d) => (
                    <div>
                      <p className="font-medium text-slate-900">{d.name}</p>
                      {!oneDay && <p className="text-xs text-slate-500">{date(d.date)}</p>}
                    </div>
                  ),
                },
                {
                  key: 'day',
                  header: 'Day',
                  hideOnMobile: true,
                  render: (d) => (
                    <span className="text-slate-600">
                      {d.punched_in_at ? time(d.punched_in_at) : time(d.first_at)} – {d.punched_out_at ? time(d.punched_out_at) : d.date === today() ? 'still out' : time(d.last_at)}
                    </span>
                  ),
                },
                { key: 'visits', header: 'Visits', render: (d) => (d.visits ? `${d.visits}${d.completed !== d.visits ? ` (${d.completed} done)` : ''}` : <span className="text-slate-400">None</span>), className: 'tabular-nums' },
                {
                  key: 'km',
                  header: 'Distance',
                  render: (d) => (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-medium">{km(d.distance_m)}</span>
                      {d.unlocated_legs > 0 && (
                        <span title="Part of the day has no location, so the distance is incomplete.">
                          <MapPinOff className="h-3.5 w-3.5 text-amber-600" />
                        </span>
                      )}
                    </span>
                  ),
                  className: 'text-right tabular-nums',
                  headerClassName: 'text-right',
                },
                { key: 'site', header: 'At customers', hideOnMobile: true, render: (d) => span(d.on_site_seconds), className: 'text-right tabular-nums', headerClassName: 'text-right' },
              ]}
            />
          </>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Distance is measured in a straight line from one stop to the next, so the road distance is usually longer. Open a day to see its stops.
        </p>
      </Card>

      {open && <DayRoute userId={open.userId} day={open.date} onClose={() => setOpen(null)} />}
    </>
  );
}

function DayRoute({ userId, day, onClose }: { userId: number; day: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['hr', 'trip-day', userId, day], queryFn: () => api.get<Envelope<DayDetail>>(`/hr/trips/${userId}`, { date: day }).then((r) => r.data) });
  const d = q.data;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={d ? `${d.user.name} · ${date(day)}` : date(day)}
      description={d ? `${d.summary.visits} visit${d.summary.visits === 1 ? '' : 's'} · ${km(d.summary.distance_m)} · ${span(d.summary.on_site_seconds)} at customers` : undefined}
      footer={
        <>
          {d?.map_url && (
            <a href={d.map_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> Open route in Google Maps
            </a>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {q.isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
      {q.error && <p className="text-sm text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load the day.'}</p>}
      {d && !d.stops.length && <EmptyState title="Nothing recorded" message="No punch or visit on this day." />}
      {d && d.stops.length > 0 && (
        <ol className="relative ml-3 border-l-2 border-slate-200">
          {d.stops.map((s, i) => (
            <li key={`${s.arrived_at}-${i}`} className="relative pb-5 pl-6 last:pb-0">
              {s.leg && (
                <p className="-mt-1 mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Navigation className="h-3 w-3" />
                  {s.leg.distance_m === null ? 'No location for this leg' : s.leg.distance_m === 0 ? 'Same place' : km(s.leg.distance_m)}
                  {s.leg.seconds >= 60 && ` · ${span(s.leg.seconds)} later`}
                </p>
              )}
              <span className={cn('absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white', s.kind === 'visit' ? 'bg-brand-600 text-white' : s.kind === 'punch_in' ? 'bg-emerald-600 text-white' : 'bg-slate-500 text-white')} style={{ top: s.leg ? 26 : 0 }}>
                {s.kind === 'visit' ? <Wrench className="h-3 w-3" /> : s.kind === 'punch_in' ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
              </span>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {s.job_id ? <Link to={`/jobs/${s.job_id}`} className="hover:text-brand-700 hover:underline">{s.label}</Link> : s.label}
                    </p>
                    {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {s.outside_fence && <Badge tone="amber">Outside geofence</Badge>}
                    {s.visit_status && <StatusBadge status={s.visit_status} />}
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                  <span className="tabular-nums">
                    {time(s.arrived_at)}
                    {s.kind === 'visit' && ` – ${s.left_at ? time(s.left_at) : 'still there'}`}
                  </span>
                  {s.on_site_seconds !== null && <span className="text-slate-500">{span(s.on_site_seconds)} on site</span>}
                  {s.lat !== null && s.lng !== null ? (
                    <a href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      <MapPin className="h-3.5 w-3.5" /> Map
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <MapPinOff className="h-3.5 w-3.5" /> No location
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
