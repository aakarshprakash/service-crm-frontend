import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Download, Eye, FileClock, FilePen, FilePlus2, Files, MessageCircle, Send, XCircle } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation, useListQuery } from '@/lib/hooks';
import { date, money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Estimate } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, toast } from '@/components/ui';
import { EstimateStatusBadge, gstLabel, validityText, whatsAppLink } from './estimateParts';

interface Summary { draft: number; sent: number; approved: number; rejected: number; expired: number; open_total: number; approved_total: number }

const PERIODS = [
  { value: '', label: 'Any date' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
];

/** A period name → the from/to dates the server filters on. */
function periodRange(period: string | undefined): { from?: string; to?: string } {
  if (!period) return {};
  const [y, m] = today().split('-').map(Number) as [number, number];
  const iso = (yy: number, mm: number, dd: number) => {
    const d = new Date(yy, mm - 1, dd);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  switch (period) {
    case 'this_month': return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'last_month': return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'last_3_months': return { from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) };
    case 'this_year': return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
    default: return {};
  }
}

const toParams = (f: Record<string, string>) => {
  const { period, ...rest } = f;
  return { ...rest, ...periodRange(period) };
};

/** Estimates given to customers before the work: what is waiting for an answer, and what was approved. */
export default function EstimatesPage() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const manage = can('estimates.manage');
  const list = useListQuery<Estimate>('estimates', '/estimates', {}, toParams);
  const f = list.filters;
  // The numbers follow the search and dates, but not the status they are shown on.
  const scope = { search: f.search, ...periodRange(f.period) };
  const summary = useQuery({ queryKey: ['estimates', 'summary', scope], queryFn: () => api.get<Envelope<Summary>>('/estimates/summary', scope).then((r) => r.data) });
  const s = summary.data;
  const status = f.status ?? '';
  const hasFilters = Object.keys(f).some((k) => k !== 'page');
  const rows = list.data?.data;
  const open = (e: Estimate) => navigate(`/estimates/${e.id}`);
  const markSent = useApiMutation((id: number) => api.post(`/estimates/${id}/status`, { status: 'sent' }), { invalidate: [['estimates']] });

  /** Sharing is how an estimate gets sent: a draft becomes "sent" the moment it is shared. */
  const share = (e: Estimate) => {
    window.open(whatsAppLink(e, user?.tenant?.name), '_blank', 'noopener');
    if (e.status === 'draft' && manage) markSent.mutate(e.id);
  };
  const pdf = (e: Estimate) => download(`/estimates/${e.id}/pdf`, `${e.estimate_number}.pdf`).catch((err) => toast.error(err.message));

  const empty = (
    <EmptyState
      title={hasFilters ? 'No estimate matches' : 'No estimates yet'}
      message={hasFilters ? 'Try another status, date or search.' : 'Make one for a customer who wants to know the cost before the work starts.'}
      action={manage && !hasFilters ? <Button size="sm" onClick={() => navigate('/estimates/new')}>New estimate</Button> : undefined}
    />
  );
  const total = s ? s.draft + s.sent + s.approved + s.rejected + s.expired : undefined;

  return (
    <>
      <PageHeader
        title="Estimates"
        description="Quotations for service, installation and maintenance, given before the work."
        actions={
          manage && (
            <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/estimates/new')}>
              New estimate
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        <Tile label="All estimates" value={total} hint={s ? `${money(s.open_total)} open` : undefined} icon={<Files className="h-4 w-4" />} tone="bg-slate-100 text-slate-700" active={status === ''} onClick={() => list.setFilter('status', '')} />
        <Tile label="Draft" value={s?.draft} hint="Not sent yet" icon={<FilePen className="h-4 w-4" />} tone="bg-amber-50 text-amber-700" active={status === 'draft'} onClick={() => list.setFilter('status', 'draft')} />
        <Tile label="Sent" value={s?.sent} hint="Waiting for an answer" icon={<Send className="h-4 w-4" />} tone="bg-sky-50 text-sky-700" active={status === 'sent'} onClick={() => list.setFilter('status', 'sent')} />
        <Tile label="Approved" value={s?.approved} hint={s ? money(s.approved_total) : undefined} icon={<CheckCircle2 className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-700" active={status === 'approved'} onClick={() => list.setFilter('status', 'approved')} />
        <Tile label="Rejected" value={s?.rejected} hint="Customer said no" icon={<XCircle className="h-4 w-4" />} tone="bg-red-50 text-red-700" active={status === 'rejected'} onClick={() => list.setFilter('status', 'rejected')} />
        <Tile label="Expired" value={s?.expired} hint="Past the last valid day" icon={<FileClock className="h-4 w-4" />} tone="bg-orange-50 text-orange-700" active={status === 'expired'} onClick={() => list.setFilter('status', 'expired')} />
      </div>

      <Card padded={false}>
        <FilterBar>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={status} onChange={(e) => list.setFilter('status', e.target.value)} aria-label="Status" className="sm:w-44">
              <option value="">All statuses</option>
              <option value="open">Waiting (draft or sent)</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </Select>
            <Select value={f.period ?? ''} onChange={(e) => list.setFilter('period', e.target.value)} aria-label="Date" className="sm:w-40">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search estimate no., customer, phone or job" className="sm:ml-auto sm:w-80" />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear filters
            </Button>
          )}
        </FilterBar>

        {/* Phones: one tappable card per estimate, the amount and the answer first. */}
        <div className="md:hidden">
          {list.isFetching && !rows ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}</div>
          ) : rows?.length ? (
            <ul className={cn('divide-y divide-slate-100', list.isFetching && 'opacity-60')}>
              {rows.map((e) => (
                <li key={e.id}>
                  <MobileRow estimate={e} onOpen={() => open(e)} />
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </div>

        <div className="hidden md:block">
          <DataTable
            rows={rows}
            loading={list.isFetching}
            onRowClick={open}
            empty={empty}
            columns={[
              {
                key: 'no',
                header: 'Estimate no.',
                render: (e) => (
                  <div>
                    <p className="whitespace-nowrap font-medium text-brand-700">{e.estimate_number}</p>
                    {e.creator && <p className="text-xs text-slate-500">by {e.creator.name}</p>}
                  </div>
                ),
              },
              {
                key: 'customer',
                header: 'Customer',
                render: (e) => (
                  <div className="min-w-0 max-w-[13rem]">
                    <p className="truncate text-slate-900">{e.customer?.name}</p>
                    <p className="text-xs text-slate-500">{e.customer?.phone}</p>
                  </div>
                ),
              },
              {
                key: 'for',
                header: 'Job / service',
                render: (e) => (
                  <div className="max-w-[16rem]">
                    <p className="truncate" title={e.subject ?? undefined}>{e.subject ?? <span className="text-slate-400">No subject</span>}</p>
                    {e.job && <p className="text-xs text-slate-500">Job {e.job.crm_call_id}</p>}
                  </div>
                ),
              },
              { key: 'date', header: 'Date', render: (e) => <span className="whitespace-nowrap tabular-nums">{date(e.estimate_date)}</span> },
              {
                key: 'total',
                header: 'Amount',
                className: 'text-right',
                headerClassName: 'text-right',
                render: (e) => (
                  <div>
                    <p className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{money(e.total_amount)}</p>
                    <p className="text-xs text-slate-500">{gstLabel(e)}</p>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (e) => {
                  const v = validityText(e);
                  return (
                    <div>
                      <EstimateStatusBadge estimate={e} />
                      {v && <p className={cn('mt-1 whitespace-nowrap text-xs', v.urgent ? 'font-medium text-amber-700' : 'text-slate-500')}>{v.text}</p>}
                    </div>
                  );
                },
              },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                className: 'w-px',
                render: (e) => (
                  <div className="flex items-center justify-end gap-0.5" onClick={(ev) => ev.stopPropagation()}>
                    <IconAction label={`Open ${e.estimate_number}`} onClick={() => open(e)}><Eye className="h-4 w-4" /></IconAction>
                    {(e.status === 'draft' || e.status === 'sent') && (
                      <IconAction label={`Send ${e.estimate_number} on WhatsApp`} onClick={() => share(e)}><MessageCircle className="h-4 w-4" /></IconAction>
                    )}
                    <IconAction label={`Download ${e.estimate_number} as PDF`} onClick={() => pdf(e)}><Download className="h-4 w-4" /></IconAction>
                  </div>
                ),
              },
            ]}
          />
        </div>
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
    </>
  );
}

/** A count for one status; selecting it filters the list below to that status. */
function Tile({ label, value, hint, icon, tone, active, onClick }: { label: string; value?: number; hint?: ReactNode; icon: ReactNode; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-3 text-left shadow-card transition sm:flex-row sm:items-center sm:gap-3',
        active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200/80 hover:border-brand-200',
      )}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10', tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-bold tabular-nums text-navy-900">{value ?? '–'}</span>
        <span className="block truncate text-xs font-medium text-slate-600" title={typeof hint === 'string' ? hint : undefined}>{label}</span>
      </span>
    </button>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-700">
      {children}
    </button>
  );
}

function MobileRow({ estimate: e, onOpen }: { estimate: Estimate; onOpen: () => void }) {
  const v = validityText(e);
  const meta: ReactNode[] = [gstLabel(e)];
  if (e.job) meta.push(`Job ${e.job.crm_call_id}`);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-slate-50">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-semibold text-slate-900">{e.customer?.name}</p>
          <p className="shrink-0 font-semibold tabular-nums text-slate-900">{money(e.total_amount)}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs text-slate-500">
            {e.estimate_number} · {date(e.estimate_date)}
          </p>
          <EstimateStatusBadge estimate={e} />
        </div>
        {e.subject && <p className="line-clamp-1 text-sm text-slate-700">{e.subject}</p>}
        <p className="text-xs text-slate-500">
          {v && <span className={cn(v.urgent && 'font-medium text-amber-700')}>{v.text} · </span>}
          {meta.join(' · ')}
        </p>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
    </button>
  );
}
