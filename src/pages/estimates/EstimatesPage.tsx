import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileClock, FilePlus2, Hourglass, Send } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { Estimate } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, Input, PageHeader, Pagination, SearchInput, StatCard, Tabs } from '@/components/ui';
import { EstimateStatusBadge } from './estimateParts';

interface Summary { draft: number; sent: number; approved: number; rejected: number; expired: number; open_total: number; approved_total: number }

/** 'open' has no tab of its own: it is draft and sent together, reached from the first card. */
type Tab = '' | 'open' | 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';

/** Estimates given to customers before the work: what is waiting for an answer, and what was approved. */
export default function EstimatesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const list = useListQuery<Estimate>('estimates', '/estimates');
  const f = list.filters;
  // The numbers follow the search and dates, but not the status tab they are shown on.
  const scope = { search: f.search, from: f.from, to: f.to, customer_id: f.customer_id };
  const summary = useQuery({ queryKey: ['estimates', 'summary', scope], queryFn: () => api.get<Envelope<Summary>>('/estimates/summary', scope).then((r) => r.data) });
  const s = summary.data;
  const tab = (f.status ?? '') as Tab;
  const hasFilters = Object.keys(f).some((k) => k !== 'page');

  return (
    <>
      <PageHeader
        title="Estimates"
        description="What a job will cost, given to the customer before the work. Approve or reject once they answer."
        actions={
          can('estimates.manage') && (
            <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/estimates/new')}>
              New estimate
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Waiting for an answer" value={(s?.draft ?? 0) + (s?.sent ?? 0)} hint={s ? `${money(s.open_total)} in open estimates` : undefined} icon={<Hourglass className="h-5 w-5" />} tone="blue" onClick={() => list.setFilter('status', 'open')} />
        <StatCard label="Sent to customer" value={s?.sent ?? 0} hint="Not answered yet" icon={<Send className="h-5 w-5" />} tone="violet" onClick={() => list.setFilter('status', 'sent')} />
        <StatCard label="Approved" value={s?.approved ?? 0} hint={s ? money(s.approved_total) : undefined} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" onClick={() => list.setFilter('status', 'approved')} />
        <StatCard label="Expired" value={s?.expired ?? 0} hint="Past the last valid day" icon={<FileClock className="h-5 w-5" />} tone={s?.expired ? 'amber' : 'slate'} onClick={() => list.setFilter('status', 'expired')} />
      </div>

      <Card padded={false}>
        <Tabs<Tab>
          className="px-3"
          value={tab}
          onChange={(v) => list.setFilter('status', v)}
          tabs={[
            { value: '', label: 'All', count: s ? s.draft + s.sent + s.approved + s.rejected + s.expired : undefined },
            { value: 'draft', label: 'Draft', count: s?.draft },
            { value: 'sent', label: 'Sent', count: s?.sent },
            { value: 'approved', label: 'Approved', count: s?.approved },
            { value: 'rejected', label: 'Rejected', count: s?.rejected },
            { value: 'expired', label: 'Expired', count: s?.expired },
          ]}
        />
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Estimate no., customer, phone, job or subject" className="sm:w-80" />
          <Input type="date" value={f.from ?? ''} max={f.to} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From date" />
          <Input type="date" value={f.to ?? ''} min={f.from} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To date" />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear
            </Button>
          )}
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(e) => navigate(`/estimates/${e.id}`)}
          empty={
            <EmptyState
              title={hasFilters ? 'No estimate matches' : 'No estimates yet'}
              message={hasFilters ? 'Try another status, search or dates.' : 'Make one for a customer who wants to know the cost before the work starts.'}
              action={can('estimates.manage') && !hasFilters ? <Button size="sm" onClick={() => navigate('/estimates/new')}>New estimate</Button> : undefined}
            />
          }
          columns={[
            {
              key: 'no',
              header: 'Estimate',
              render: (e) => (
                <div>
                  <p className="font-medium text-slate-900">{e.estimate_number}</p>
                  <p className="text-xs text-slate-500">{date(e.estimate_date)}</p>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (e) => (
                <div className="min-w-0">
                  <p className="truncate text-slate-900">{e.customer?.name}</p>
                  <p className="text-xs text-slate-500">{e.customer?.phone}</p>
                </div>
              ),
            },
            {
              key: 'for',
              header: 'For',
              hideOnMobile: true,
              render: (e) => (
                <div className="max-w-[18rem]">
                  <p className="truncate">{e.subject ?? <span className="text-slate-400">—</span>}</p>
                  {e.job && <p className="text-xs text-slate-500">Job {e.job.crm_call_id}</p>}
                </div>
              ),
            },
            { key: 'valid', header: 'Valid until', hideOnMobile: true, render: (e) => (e.valid_until ? <span className={e.is_expired ? 'font-medium text-amber-700' : undefined}>{date(e.valid_until)}</span> : '—') },
            { key: 'by', header: 'Made by', hideOnMobile: true, render: (e) => e.creator?.name ?? '—' },
            { key: 'status', header: 'Status', render: (e) => <EstimateStatusBadge estimate={e} /> },
            { key: 'total', header: 'Total', render: (e) => <span className="font-medium">{money(e.total_amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
    </>
  );
}
