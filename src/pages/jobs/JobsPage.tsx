import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, List, Plus } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Job, JobStatus } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, Tabs } from '@/components/ui';
import { JOB_STATUSES, PriorityBadge, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

type View = 'list' | 'board' | 'calendar';

export default function JobsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => (localStorage.getItem('jobs-view') as View) || 'list');
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('jobs-view', v);
    } catch {
      /* storage unavailable */
    }
  };
  const list = useListQuery<Job>('jobs', '/jobs', view === 'board' ? { per_page: '50' } : {});
  const { filters, setFilter } = list;
  const counts = useQuery({ queryKey: ['job-counts', { ...filters, status: undefined }], queryFn: () => api.get<Envelope<Record<JobStatus, number>>>('/jobs/counts', { ...filters, status: undefined, page: undefined }).then((r) => r.data) });
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every customer complaint from call to closure."
        actions={
          <>
            <Hint text="List shows jobs in a table, Board groups them in columns by status, and Calendar lays them out by visit date. Your choice is remembered on this device.">
              <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
                {([
                  ['list', List, 'List'],
                  ['board', Columns3, 'Board'],
                  ['calendar', CalendarDays, 'Calendar'],
                ] as const).map(([v, Icon, label]) => (
                  <button key={v} onClick={() => changeView(v)} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium', view === v ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100')} aria-pressed={view === v}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </Hint>
            {can('jobs.manage') && (
              <Hint text="Opens the form to log a customer complaint as a new job. The customer gets a confirmation once it's saved.">
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/jobs/new')}>
                  New job
                </Button>
              </Hint>
            )}
          </>
        }
      />

      <Card padded={false}>
        {view === 'list' && (
          <Tabs
            className="px-3"
            value={(filters.status as JobStatus) || ('' as JobStatus)}
            onChange={(v) => setFilter('status', v)}
            tabs={[{ value: '' as JobStatus, label: 'All', count: counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : undefined }, ...JOB_STATUSES.map((s) => ({ value: s, label: <StatusLabel s={s} />, count: counts.data?.[s] }))]}
          />
        )}
        <FilterBar>
          <SearchInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Call ID, phone, serial, CRM ID or name" className="sm:w-72" />
          <Select value={filters.technician_id ?? ''} onChange={(e) => setFilter('technician_id', e.target.value)} className="sm:w-44" aria-label="Technician">
            <option value="">All technicians</option>
            <option value="unassigned">Unassigned</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)} className="sm:w-36" aria-label="Priority">
            <option value="">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={filters.branch_id ?? ''} onChange={(e) => setFilter('branch_id', e.target.value)} className="sm:w-44" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
          {(lookups?.service_locations?.length ?? 0) > 0 && (
            <Select value={filters.service_location_id ?? ''} onChange={(e) => setFilter('service_location_id', e.target.value)} className="sm:w-44" aria-label="Service location">
              <option value="">All locations</option>
              {lookups?.service_locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={filters.complaint_type_id ?? ''} onChange={(e) => setFilter('complaint_type_id', e.target.value)} className="sm:w-44" aria-label="Complaint type">
            <option value="">All complaint types</option>
            {lookups?.complaint_types.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {Object.keys(filters).length > 0 && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear filters
            </Button>
          )}
        </FilterBar>

        {view === 'list' && (
          <>
            <DataTable
              rows={list.data?.data}
              loading={list.isFetching}
              onRowClick={(j) => navigate(`/jobs/${j.id}`)}
              empty={<EmptyState title="No jobs found" message="Adjust the filters, or create a new job." />}
              columns={[
                {
                  key: 'id',
                  header: 'Call',
                  render: (j) => (
                    <div>
                      <p className="font-medium text-slate-900">{j.crm_call_id}</p>
                      <p className="text-xs text-slate-500">{date(j.created_at)} · {j.call_age_days ?? 0}d old</p>
                    </div>
                  ),
                },
                {
                  key: 'customer',
                  header: 'Customer',
                  render: (j) => (
                    <div className="min-w-0">
                      <p className="truncate text-slate-900">{j.customer?.name}</p>
                      <p className="text-xs text-slate-500">{j.customer?.phone}</p>
                    </div>
                  ),
                },
                {
                  key: 'product',
                  header: 'Product / complaint',
                  hideOnMobile: true,
                  render: (j) => (
                    <div className="max-w-[16rem]">
                      <p className="truncate">{[j.customer_product?.product?.brand?.name, j.customer_product?.product?.model_name].filter(Boolean).join(' ') || '–'}</p>
                      <p className="truncate text-xs text-slate-500">{j.complaint_type?.name ?? j.complaint_details}</p>
                    </div>
                  ),
                },
                { key: 'tech', header: 'Technician', hideOnMobile: true, render: (j) => j.technician?.name ?? <span className="text-amber-700">Unassigned</span> },
                { key: 'scheduled', header: 'Scheduled', hideOnMobile: true, render: (j) => dateTime(j.scheduled_at) },
                { key: 'priority', header: 'Priority', hideOnMobile: true, render: (j) => <PriorityBadge priority={j.priority} /> },
                { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
              ]}
            />
            <Pagination meta={list.data?.meta} onPage={(p) => setFilter('page', String(p))} />
          </>
        )}

        {view === 'board' && <Board jobs={list.data?.data ?? []} loading={list.isLoading} total={list.data?.meta.total ?? 0} />}
        {view === 'calendar' && <CalendarView filters={filters} />}
      </Card>
    </>
  );
}

function StatusLabel({ s }: { s: JobStatus }) {
  const labels: Record<JobStatus, string> = { open: 'Open', in_progress: 'In progress', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };
  return <>{labels[s]}</>;
}

function Board({ jobs, loading, total }: { jobs: Job[]; loading: boolean; total: number }) {
  const columns: JobStatus[] = ['open', 'in_progress', 'pending', 'completed'];
  if (loading) return <div className="h-64 animate-pulse bg-slate-50" />;
  return (
    <div className="overflow-x-auto p-3">
      {total > jobs.length && <p className="mb-2 text-xs text-slate-500">Showing the latest {jobs.length} of {total} jobs. Use filters to narrow the board.</p>}
      <div className="grid min-w-[900px] grid-cols-4 gap-3">
        {columns.map((status) => {
          const items = jobs.filter((j) => j.status === status);
          return (
            <div key={status} className="rounded-xl bg-slate-50 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <StatusBadge status={status} />
                <span className="text-xs font-medium text-slate-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{j.crm_call_id}</span>
                      <PriorityBadge priority={j.priority} />
                    </div>
                    <p className="mt-1.5 truncate text-sm text-slate-800">{j.customer?.name}</p>
                    <p className="truncate text-xs text-slate-500">{j.complaint_type?.name ?? j.complaint_details ?? '—'}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{j.technician?.name ?? 'Unassigned'}</span>
                      <span>{j.scheduled_at ? dateTime(j.scheduled_at) : ''}</span>
                    </div>
                  </Link>
                ))}
                {!items.length && <p className="px-1 py-6 text-center text-xs text-slate-400">No jobs</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarView({ filters }: { filters: Record<string, string> }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - ((start.getDay() + 6) % 7)); // Monday first
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const q = useQuery({
    queryKey: ['job-calendar', iso(days[0]!), filters],
    queryFn: () => api.get<Envelope<Job[]>>('/jobs/calendar', { ...filters, page: undefined, from: iso(days[0]!), to: iso(days[41]!) }).then((r) => r.data),
  });
  const byDay = useMemo(() => {
    const map: Record<string, Job[]> = {};
    q.data?.forEach((j) => {
      const key = iso(new Date(j.scheduled_at!));
      (map[key] ??= []).push(j);
    });
    return map;
  }, [q.data]);
  const todayKey = iso(new Date());

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border border-slate-200 text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-500">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const jobs = byDay[key] ?? [];
            const inMonth = d.getMonth() === cursor.getMonth();
            return (
              <div key={key} className={cn('min-h-[104px] border-b border-r border-slate-100 p-1.5', !inMonth && 'bg-slate-50/60')}>
                <span className={cn('mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full', key === todayKey ? 'bg-brand-700 font-semibold text-white' : inMonth ? 'text-slate-700' : 'text-slate-400')}>{d.getDate()}</span>
                <div className="space-y-1">
                  {jobs.slice(0, 3).map((j) => (
                    <Link
                      key={j.id}
                      to={`/jobs/${j.id}`}
                      className={cn(
                        'block truncate rounded px-1.5 py-0.5',
                        j.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : j.status === 'cancelled' ? 'bg-slate-100 text-slate-500 line-through' : j.priority === 'high' ? 'bg-red-50 text-red-800' : 'bg-brand-50 text-brand-800',
                      )}
                      title={`${j.crm_call_id} · ${j.customer?.name} · ${j.technician?.name ?? 'Unassigned'}`}
                    >
                      {time(j.scheduled_at)} {j.customer?.name}
                    </Link>
                  ))}
                  {jobs.length > 3 && <p className="px-1.5 text-[11px] text-slate-500">+{jobs.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
