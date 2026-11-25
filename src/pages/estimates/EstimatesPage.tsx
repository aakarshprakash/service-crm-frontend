import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, FilePlus2, MessageCircle } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation, useListQuery } from '@/lib/hooks';
import { date, money, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Estimate } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, toast } from '@/components/ui';
import { GstFilter } from '@/components/domain';
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Estimates given to customers before the work: what is waiting for an answer, and what was approved. */
export default function EstimatesPage() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const manage = can('estimates.manage');
  const list = useListQuery<Estimate>('estimates', '/estimates', {}, toParams);
  const f = list.filters;
  // The numbers follow the search, GST and dates, but not the status they are shown on.
  const scope = { search: f.search, gst: f.gst, ...periodRange(f.period) };
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
      message={hasFilters ? 'Try another status, GST type, date or search.' : 'Make one for a customer who wants to know the cost before the work starts.'}
      action={manage && !hasFilters ? <Button size="sm" onClick={() => navigate('/estimates/new')}>New estimate</Button> : undefined}
    />
  );
  const total = s ? s.draft + s.sent + s.approved + s.rejected + s.expired : undefined;
  const tabs: { value: string; label: string; count?: number; warn?: boolean }[] = [
    { value: '', label: 'All', count: total },
    { value: 'draft', label: 'Draft', count: s?.draft },
    { value: 'sent', label: 'Sent', count: s?.sent },
    { value: 'approved', label: 'Approved', count: s?.approved },
    { value: 'rejected', label: 'Rejected', count: s?.rejected },
    { value: 'expired', label: 'Expired', count: s?.expired, warn: true },
  ];

  return (
    <>
      <PageHeader
        title="Estimates"
        description="Quotations for service, installation and maintenance, given before the work."
        actions={
          <>
            <Figures summary={s} />
            {manage && (
              <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/estimates/new')}>
                New estimate
              </Button>
            )}
          </>
        }
      />

      <Card padded={false}>
        <div role="group" aria-label="Show estimates by status" className="scroll-light flex gap-1 overflow-x-auto border-b border-slate-200 px-2 sm:px-3">
          {tabs.map((t) => {
            const active = status === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={active}
                onClick={() => list.setFilter('status', t.value)}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                  active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums',
                    active ? 'bg-brand-50 text-brand-700' : t.warn && t.count ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {t.count ?? '–'}
                </span>
              </button>
            );
          })}
        </div>

        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search estimate no., customer, phone or job" className="sm:w-96" />
          <Select value={f.period ?? ''} onChange={(e) => list.setFilter('period', e.target.value)} aria-label="Date" className="sm:w-44">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          <GstFilter value={f.gst ?? ''} onChange={(v) => list.setFilter('gst', v)} />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={list.clear} className="sm:ml-auto">
              Clear filters
            </Button>
          )}
        </FilterBar>

        {/* Phones: one card per estimate, the amount and the answer first, the next step underneath. */}
        <div className="md:hidden">
          {list.isFetching && !rows ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}</div>
          ) : rows?.length ? (
            <ul className={cn('divide-y divide-slate-100', list.isFetching && 'opacity-60')}>
              {rows.map((e) => (
                <li key={e.id}>
                  <MobileRow estimate={e} onOpen={() => open(e)} onShare={() => share(e)} />
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
                key: 'customer',
                header: 'Customer',
                render: (e) => (
                  <div className="min-w-0 max-w-[13rem]">
                    <p className="truncate font-medium text-slate-900">{e.customer?.name}</p>
                    <p className="text-xs tabular-nums text-slate-500">{e.customer?.phone}</p>
                  </div>
                ),
              },
              {
                key: 'estimate',
                header: 'Estimate',
                render: (e) => (
                  <div className="max-w-[18rem]">
                    <p className="truncate" title={e.subject ?? undefined}>{e.subject ?? <span className="text-slate-400">No subject</span>}</p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="font-medium text-brand-700">{e.estimate_number}</span> on {date(e.estimate_date)}
                      {e.job && `, job ${e.job.crm_call_id}`}
                    </p>
                  </div>
                ),
              },
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
                key: 'next',
                header: <span className="sr-only">Actions</span>,
                className: 'w-px',
                render: (e) => (
                  <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                    <SendButton estimate={e} onShare={() => share(e)} />
                    <button
                      type="button"
                      onClick={() => pdf(e)}
                      title="Download PDF"
                      aria-label={`Download ${e.estimate_number} as PDF`}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <Download className="h-4 w-4" />
                    </button>
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

/** The money in play, quietly beside the title: still open (drafts and sent), and approved. */
function Figures({ summary: s }: { summary?: Summary }) {
  const items = [
    { label: 'Open', value: s?.open_total, hint: s ? `${plural(s.draft + s.sent, 'estimate', 'estimates')} not answered yet` : undefined },
    { label: 'Approved', value: s?.approved_total, hint: s ? plural(s.approved, 'estimate', 'estimates') : undefined },
  ];
  return (
    <dl className="mr-2 flex divide-x divide-slate-200">
      {items.map((it) => (
        <div key={it.label} className="px-4 first:pl-0 sm:text-right" title={it.hint}>
          <dt className="text-xs font-medium text-slate-500">{it.label}</dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">{it.value === undefined ? '–' : money(it.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one thing worth doing next with an estimate that has not been answered. */
function SendButton({ estimate: e, onShare, block }: { estimate: Estimate; onShare: () => void; block?: boolean }) {
  if (e.is_expired || (e.status !== 'draft' && e.status !== 'sent')) return null;
  return (
    <Button variant={e.status === 'draft' ? 'secondary' : 'ghost'} size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={onShare} className={cn(block && 'flex-1')}>
      {e.status === 'draft' ? 'Send on WhatsApp' : 'Send again'}
    </Button>
  );
}

function MobileRow({ estimate: e, onOpen, onShare }: { estimate: Estimate; onOpen: () => void; onShare: () => void }) {
  const v = validityText(e);
  const meta: ReactNode[] = [gstLabel(e)];
  if (e.job) meta.push(`Job ${e.job.crm_call_id}`);
  const canSend = !e.is_expired && (e.status === 'draft' || e.status === 'sent');
  return (
    <div>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-slate-50">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-semibold text-slate-900">{e.customer?.name}</p>
            <p className="shrink-0 font-semibold tabular-nums text-slate-900">{money(e.total_amount)}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs text-slate-500">
              {e.estimate_number} on {date(e.estimate_date)}
            </p>
            <EstimateStatusBadge estimate={e} />
          </div>
          {e.subject && <p className="line-clamp-1 text-sm text-slate-700">{e.subject}</p>}
          <p className="text-xs text-slate-500">
            {v && <span className={cn(v.urgent && 'font-medium text-amber-700')}>{v.text}. </span>}
            {meta.join(', ')}
          </p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
      </button>
      {canSend && (
        <div className="flex px-4 pb-3.5">
          <SendButton estimate={e} onShare={onShare} block />
        </div>
      )}
    </div>
  );
}
