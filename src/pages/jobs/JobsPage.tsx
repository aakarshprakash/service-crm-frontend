import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Columns3, Flag, Hourglass, List, MapPinOff, Plus, Settings2, SlidersHorizontal, UserX, X } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, label, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Job, type JobStatus } from '@/lib/types';
import { Button, Card, Checkbox, DataTable, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select, Tabs } from '@/components/ui';
import { JOB_STATUSES, PriorityBadge, StatusBadge, ageBand, ageBands, type AgeBand } from '@/components/domain';
import { Hint } from '@/components/tutorial';

type View = 'list' | 'board' | 'calendar';

/** Columns that can be shown or hidden from the View menu. Call, customer and status always show. */
const OPTIONAL_COLUMNS = [
  { key: 'product', label: 'Product / complaint', on: true },
  { key: 'tech', label: 'Technician', on: true },
  { key: 'scheduled', label: 'Scheduled', on: true },
  { key: 'priority', label: 'Priority', on: true },
  { key: 'location', label: 'Service location', on: false },
  { key: 'category', label: 'Product category', on: false },
  { key: 'call_type', label: 'Call type', on: false },
  { key: 'branch', label: 'Branch', on: false },
] as const;
const DEFAULT_COLUMNS: string[] = OPTIONAL_COLUMNS.filter((c) => c.on).map((c) => c.key);

/** Reads a remembered choice on this device; storage can be unavailable. */
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** One-click filters. The server decides what each one means, so the counts and the list always agree. */
const QUICK_FILTERS = [
  { value: 'unassigned', label: 'Unassigned', icon: UserX },
  { value: 'overdue', label: 'Overdue visits', icon: CalendarClock },
  { value: 'today', label: 'Visit today', icon: CalendarDays },
  { value: 'high', label: 'High priority', icon: Flag },
  { value: 'aged', label: 'Old jobs', icon: Hourglass },
  { value: 'no_location', label: 'No location', icon: MapPinOff },
] as const;

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
  const [perPage, setPerPage] = useState(() => remembered('jobs-per-page') ?? '25');
  const [columns, setColumns] = useState<string[]>(() => {
    try {
      return JSON.parse(remembered('jobs-columns') ?? '') as string[];
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [showFilters, setShowFilters] = useState(false);
  const list = useListQuery<Job>('jobs', '/jobs', { per_page: view === 'board' ? '50' : perPage });
  const { filters, setFilter } = list;
  const counts = useQuery({ queryKey: ['job-counts', { ...filters, status: undefined }], queryFn: () => api.get<Envelope<Record<JobStatus, number>>>('/jobs/counts', { ...filters, status: undefined, page: undefined }).then((r) => r.data) });
  const quickCounts = useQuery({
    queryKey: ['job-quick-counts', { ...filters, status: undefined, quick: undefined, page: undefined }],
    queryFn: () => api.get<Envelope<Record<string, number>>>('/jobs/quick-counts', { ...filters, status: undefined, quick: undefined, page: undefined }).then((r) => r.data),
  });
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');
  const hasLocations = (lookups?.service_locations?.length ?? 0) > 0;
  const hasFilters = Object.keys(filters).some((k) => k !== 'per_page');
  const named = (rows: { id: number; name: string }[] | undefined, id: string) => rows?.find((r) => String(r.id) === id)?.name ?? id;
  const statusNames: Record<string, string> = { open: 'Open', in_progress: 'In progress', pending: 'Pending', part_pending: 'Part pending', cancel_requested: 'Cancel requests', completed: 'Completed', cancelled: 'Cancelled' };
  // What the Filters panel has applied, shown as tags. Status has its own tabs in the list, so it only needs a tag when they can't show it.
  const panelTags = [
    filters.technician_id && { key: 'technician_id', text: `Technician: ${filters.technician_id === 'unassigned' ? 'Unassigned' : named(techs, filters.technician_id)}` },
    filters.priority && { key: 'priority', text: `Priority: ${label(filters.priority)}` },
    filters.service_location_id && { key: 'service_location_id', text: `Location: ${filters.service_location_id === 'none' ? 'No location' : named(lookups?.service_locations, filters.service_location_id)}` },
    filters.complaint_type_id && { key: 'complaint_type_id', text: `Complaint: ${named(lookups?.complaint_types, filters.complaint_type_id)}` },
    filters.call_type && { key: 'call_type', text: `Call type: ${label(filters.call_type)}` },
    filters.branch_id && { key: 'branch_id', text: `Branch: ${named(lookups?.branches, filters.branch_id)}` },
    filters.from && { key: 'from', text: `Logged from ${date(filters.from)}` },
    filters.to && { key: 'to', text: `Logged to ${date(filters.to)}` },
  ].filter((t): t is { key: string; text: string } => !!t);
  const statusTag = filters.status && (view !== 'list' || filters.status.includes(','))
    ? { key: 'status', text: `Status: ${filters.status.includes(',') ? 'Jobs in hand' : statusNames[filters.status] ?? filters.status}` }
    : null;
  const tags = statusTag ? [statusTag, ...panelTags] : panelTags;
  const visibleColumns = (all: Parameters<typeof DataTable<Job>>[0]['columns']) => all.filter((c) => !OPTIONAL_COLUMNS.some((o) => o.key === c.key) || columns.includes(c.key));
  const toggleColumn = (key: string, on: boolean) => {
    const next = on ? [...columns, key] : columns.filter((c) => c !== key);
    setColumns(next);
    remember('jobs-columns', JSON.stringify(next));
  };
  const changePerPage = (n: string) => {
    setPerPage(n);
    remember('jobs-per-page', n);
    setFilter('page', null);
  };
  const bands = useMemo(() => ageBands(lookups?.job_age), [lookups?.job_age]);
  const [ageColours, setAgeColours] = useState(() => localStorage.getItem('jobs-age-colours') !== '0');
  const changeAgeColours = (on: boolean) => {
    setAgeColours(on);
    try {
      localStorage.setItem('jobs-age-colours', on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

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
        {/* Search, sort and the two menus everything else lives in */}
        <div className="flex flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-center">
          <SearchInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Search call ID, phone, serial, model, name or category" className="sm:max-w-xl sm:flex-1" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Select value={filters.sort ?? ''} onChange={(e) => setFilter('sort', e.target.value)} className="!w-40" aria-label="Sort by">
              <option value="">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="scheduled">By visit date</option>
              <option value="priority">By priority</option>
            </Select>
            <Button variant={showFilters || panelTags.length ? 'outline' : 'secondary'} icon={<SlidersHorizontal className="h-4 w-4" />} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
              Filters
              {panelTags.length > 0 && <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-xs font-semibold tabular-nums text-white">{panelTags.length}</span>}
            </Button>
            <ViewMenu
              view={view}
              ageColours={ageColours}
              onAgeColours={changeAgeColours}
              bands={bands}
              columns={columns}
              onColumn={toggleColumn}
              onResetColumns={() => {
                setColumns(DEFAULT_COLUMNS);
                remember('jobs-columns', JSON.stringify(DEFAULT_COLUMNS));
              }}
              hiddenColumns={[...(hasLocations ? [] : ['location']), ...((lookups?.branches.length ?? 0) > 1 ? [] : ['branch'])]}
              perPage={perPage}
              onPerPage={changePerPage}
            />
          </div>
        </div>

        {/* One-click filters */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2.5" role="group" aria-label="Quick filters">
          {QUICK_FILTERS.filter((f) => f.value !== 'no_location' || hasLocations).map((f) => {
            const on = filters.quick === f.value;
            const count = quickCounts.data?.[f.value];
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter('quick', on ? null : f.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/50',
                )}
              >
                <f.icon className="h-3.5 w-3.5" />
                {f.value === 'aged' ? `${f.label} (${lookups?.job_age.old ?? 7}+ days)` : f.label}
                {count !== undefined && <span className={cn('rounded-full px-1.5 tabular-nums', on ? 'bg-white/20' : count ? 'bg-slate-100 text-slate-900' : 'text-slate-400')}>{count}</span>}
              </button>
            );
          })}
        </div>

        {showFilters && (
          <div className="border-b border-slate-100 bg-slate-50/70 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Technician">
                <Select value={filters.technician_id ?? ''} onChange={(e) => setFilter('technician_id', e.target.value)} aria-label="Technician">
                  <option value="">All technicians</option>
                  <option value="unassigned">Unassigned</option>
                  {techs?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority">
                  <option value="">Any priority</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </Field>
              {hasLocations && (
                <Field label="Service location">
                  <Select value={filters.service_location_id ?? ''} onChange={(e) => setFilter('service_location_id', e.target.value)} aria-label="Service location">
                    <option value="">All locations</option>
                    <option value="none">No location</option>
                    {lookups?.service_locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Complaint type">
                <Select value={filters.complaint_type_id ?? ''} onChange={(e) => setFilter('complaint_type_id', e.target.value)} aria-label="Complaint type">
                  <option value="">All complaint types</option>
                  {lookups?.complaint_types.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Call type">
                <Select value={filters.call_type ?? ''} onChange={(e) => setFilter('call_type', e.target.value)} aria-label="Call type">
                  <option value="">Any call type</option>
                  <option value="crm_call">CRM call</option>
                  <option value="walk_in">Walk-in</option>
                  <option value="referral">Referral</option>
                  <option value="portal">Customer portal</option>
                </Select>
              </Field>
              {(lookups?.branches.length ?? 0) > 1 && (
                <Field label="Branch">
                  <Select value={filters.branch_id ?? ''} onChange={(e) => setFilter('branch_id', e.target.value)} aria-label="Branch">
                    <option value="">All branches</option>
                    {lookups?.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Logged from">
                <Input type="date" value={filters.from ?? ''} max={filters.to} onChange={(e) => setFilter('from', e.target.value)} />
              </Field>
              <Field label="Logged to">
                <Input type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => setFilter('to', e.target.value)} />
              </Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">The list updates as you choose.</p>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2" aria-label="Filters in use">
            {tags.map((t) => (
              <button key={t.key} type="button" onClick={() => setFilter(t.key, null)} aria-label={`Remove filter ${t.text}`} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100">
                {t.text} <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={list.clear} className="ml-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
              Clear all
            </button>
          </div>
        )}

        {view === 'list' && (
          <>
            <DataTable
              rows={list.data?.data}
              loading={list.isFetching}
              onRowClick={(j) => navigate(`/jobs/${j.id}`)}
              rowClassName={(j) => (ageColours ? ageBand(j, bands)?.row : undefined)}
              empty={<EmptyState title="No jobs found" message={hasFilters ? 'No job matches these filters.' : 'Create a new job to get started.'} action={hasFilters ? <Button variant="secondary" size="sm" onClick={list.clear}>Clear all filters</Button> : undefined} />}
              columns={visibleColumns([
                {
                  key: 'id',
                  header: 'Call',
                  render: (j) => (
                    <div>
                      <p className="font-medium text-slate-900">{j.crm_call_id}</p>
                      <p className="text-xs text-slate-500">
                        {date(j.created_at)} ·{' '}
                        {ageColours && ageBand(j, bands) ? <span className={cn('rounded px-1.5 py-0.5 font-medium', ageBand(j, bands)!.pill)}>{j.call_age_days}d old</span> : `${j.call_age_days ?? 0}d old`}
                      </p>
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
                      <p className="truncate">{unitLabel(j.customer_product) || '–'}</p>
                      <p className="truncate text-xs text-slate-500">{[!columns.includes('category') && j.product_category, j.complaint_type?.name ?? j.complaint_details].filter(Boolean).join(' · ')}</p>
                    </div>
                  ),
                },
                { key: 'tech', header: 'Technician', hideOnMobile: true, render: (j) => j.technician?.name ?? <span className="text-amber-700">Unassigned</span> },
                { key: 'scheduled', header: 'Scheduled', hideOnMobile: true, render: (j) => dateTime(j.scheduled_at) },
                { key: 'priority', header: 'Priority', hideOnMobile: true, render: (j) => <PriorityBadge priority={j.priority} /> },
                { key: 'location', header: 'Service location', hideOnMobile: true, render: (j) => j.service_location?.name ?? <span className="text-slate-400">—</span> },
                { key: 'category', header: 'Product category', hideOnMobile: true, render: (j) => j.product_category ?? <span className="text-slate-400">—</span> },
                { key: 'call_type', header: 'Call type', hideOnMobile: true, render: (j) => label(j.call_type) },
                { key: 'branch', header: 'Branch', hideOnMobile: true, render: (j) => j.branch?.name ?? <span className="text-slate-400">—</span> },
                { key: 'status', header: 'Status', render: (j) => (
                    <div className="max-w-[11rem]">
                      <StatusBadge status={j.status} />
                      {j.status === 'part_pending' && j.part_pending_note && <p className="mt-1 truncate text-xs text-slate-500" title={j.part_pending_note}>{j.part_pending_note}</p>}
                      {j.status === 'cancel_requested' && j.cancel_reason && <p className="mt-1 truncate text-xs text-slate-500" title={j.cancel_reason}>{j.cancel_reason}</p>}
                    </div>
                  ) },
              ])}
            />
            <Pagination meta={list.data?.meta} onPage={(p) => setFilter('page', String(p))} />
          </>
        )}

        {view === 'board' && <Board jobs={list.data?.data ?? []} loading={list.isLoading} total={list.data?.meta.total ?? 0} bands={ageColours ? bands : []} />}
        {view === 'calendar' && <CalendarView filters={filters} />}
      </Card>
    </>
  );
}

/** Display choices, remembered on this device: age colours, columns and rows per page. */
function ViewMenu({ view, ageColours, onAgeColours, bands, columns, onColumn, onResetColumns, hiddenColumns, perPage, onPerPage }: {
  view: View;
  ageColours: boolean;
  onAgeColours: (on: boolean) => void;
  bands: AgeBand[];
  columns: string[];
  onColumn: (key: string, on: boolean) => void;
  onResetColumns: () => void;
  hiddenColumns: string[];
  perPage: string;
  onPerPage: (n: string) => void;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const heading = 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500';
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        View
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div>
            <p className={heading}>Job age</p>
            <Checkbox label="Colour by job age" checked={ageColours} onChange={onAgeColours} />
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {[...bands].reverse().map((b) => (
                <li key={b.from} className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-full', b.dot)} />{b.label}</li>
              ))}
            </ul>
            {can('settings.manage') && <Link to="/settings" className="mt-1.5 inline-block text-xs font-medium text-brand-700 hover:underline">Change the days in Settings</Link>}
          </div>
          {view === 'list' && (
            <>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <p className={heading}>Columns</p>
                  <button type="button" onClick={onResetColumns} className="mb-2 text-xs font-medium text-brand-700 hover:underline">Reset</button>
                </div>
                <div className="space-y-1">
                  {OPTIONAL_COLUMNS.filter((c) => !hiddenColumns.includes(c.key)).map((c) => (
                    <Checkbox key={c.key} label={c.label} checked={columns.includes(c.key)} onChange={(on) => onColumn(c.key, on)} />
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className={heading}>Rows per page</p>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Rows per page">
                  {['10', '25', '50'].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={perPage === n}
                      onClick={() => onPerPage(n)}
                      className={cn('rounded-full border px-3 py-1 text-xs font-medium', perPage === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-700 hover:border-brand-300')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusLabel({ s }: { s: JobStatus }) {
  const labels: Record<JobStatus, string> = { open: 'Open', in_progress: 'In progress', pending: 'Pending', part_pending: 'Part pending', cancel_requested: 'Cancel requests', completed: 'Completed', cancelled: 'Cancelled' };
  return <>{labels[s]}</>;
}

function Board({ jobs, loading, total, bands }: { jobs: Job[]; loading: boolean; total: number; bands: AgeBand[] }) {
  const columns: JobStatus[] = ['open', 'in_progress', 'pending', 'part_pending', 'cancel_requested', 'completed'];
  if (loading) return <div className="h-64 animate-pulse bg-slate-50" />;
  return (
    <div className="overflow-x-auto p-3">
      {total > jobs.length && <p className="mb-2 text-xs text-slate-500">Showing the latest {jobs.length} of {total} jobs. Use filters to narrow the board.</p>}
      <div className="grid min-w-[1320px] grid-cols-6 gap-3">
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
                  <Link key={j.id} to={`/jobs/${j.id}`} className={cn('block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow', ageBand(j, bands)?.card)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{j.crm_call_id}</span>
                      <PriorityBadge priority={j.priority} />
                    </div>
                    <p className="mt-1.5 truncate text-sm text-slate-800">{j.customer?.name}</p>
                    <p className="truncate text-xs text-slate-500">{j.status === 'part_pending' && j.part_pending_note ? j.part_pending_note : j.complaint_type?.name ?? j.complaint_details ?? '—'}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{j.technician?.name ?? 'Unassigned'}</span>
                      <span>{j.scheduled_at ? dateTime(j.scheduled_at) : ''}</span>
                    </div>
                    {ageBand(j, bands) && <span className={cn('mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium', ageBand(j, bands)!.pill)}>{j.call_age_days}d old</span>}
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
