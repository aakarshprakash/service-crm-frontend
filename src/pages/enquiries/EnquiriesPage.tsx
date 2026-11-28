import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery, useStaffOptions } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, Tabs } from '@/components/ui';
import { EnquiryDialog } from './EnquiryForm';
import { SOURCES, STATUS, followUpState, sourceLabel, type Enquiry, type EnquirySummary } from './enquiry';

type View = 'open' | 'due' | 'new' | 'follow_up' | 'converted' | 'lost' | 'all';

/** Every lead in one list, the ones to call back first at the top. */
export default function EnquiriesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const list = useListQuery<Enquiry>('enquiries', '/enquiries', { status: 'open' }, ({ new: _new, ...f }) => ({ ...f, status: f.status === 'all' ? undefined : f.status }));
  const summary = useQuery({ queryKey: ['enquiries', 'summary'], queryFn: () => api.get<Envelope<EnquirySummary>>('/enquiries/summary').then((r) => r.data) });
  const { data: staff } = useStaffOptions();
  const [adding, setAdding] = useState(list.filters.new === '1');
  const f = list.filters;
  const s = summary.data;
  const view = (f.status ?? 'open') as View;
  const showClear = ['search', 'type', 'source', 'assigned_to', 'mine'].some((k) => f[k]);

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="People who asked about a repair or about buying something. Follow each one up until it becomes a job or a quotation."
        actions={
          can('enquiries.manage') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              New enquiry
            </Button>
          )
        }
      />

      {/* What needs a call today, then how the month is going. Each figure opens its list. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Call back today" value={s?.due_today} tone={s?.due_today ? 'amber' : undefined} onClick={() => list.setFilter('status', 'due')} />
        <Tile label="Overdue" value={s?.overdue} tone={s?.overdue ? 'red' : undefined} onClick={() => list.setFilter('status', 'overdue')} />
        <Tile label="New, not called yet" value={s?.new} tone={s?.new ? 'blue' : undefined} onClick={() => list.setFilter('status', 'new')} />
        <Tile label="Converted this month" value={s?.converted_this_month} note={s ? `of ${s.received_this_month} received` : undefined} onClick={() => list.setFilter('status', 'converted')} />
        <Tile label="Open sales value" value={s ? money(s.open_value) : undefined} note="Expected, from sales enquiries" onClick={() => navigate('/enquiries?status=open&type=sales', { replace: true })} />
      </div>

      <Card padded={false}>
        <Tabs
          className="px-3"
          value={view === ('overdue' as View) ? 'due' : view}
          onChange={(v) => list.setFilter('status', v)}
          tabs={[
            { value: 'open', label: 'Open', count: s?.open || undefined },
            { value: 'due', label: 'To call now', count: (s?.due_today ?? 0) + (s?.overdue ?? 0) || undefined },
            { value: 'new', label: 'New' },
            { value: 'follow_up', label: 'Following up' },
            { value: 'converted', label: 'Converted' },
            { value: 'lost', label: 'Lost' },
            { value: 'all', label: 'All' },
          ]}
        />
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Name, phone, number or product" className="sm:w-64" />
          <Select value={f.type ?? ''} onChange={(e) => list.setFilter('type', e.target.value)} className="sm:w-44" aria-label="Type">
            <option value="">Service &amp; sales</option>
            <option value="service">Service</option>
            <option value="sales">Sales</option>
          </Select>
          <Select value={f.source ?? ''} onChange={(e) => list.setFilter('source', e.target.value)} className="sm:w-40" aria-label="Source">
            <option value="">Any source</option>
            {SOURCES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
          <Select value={f.assigned_to ?? ''} onChange={(e) => list.setFilter('assigned_to', e.target.value)} className="sm:w-56" aria-label="Following up">
            <option value="">Anyone following up</option>
            <option value="none">Nobody yet</option>
            {(staff ?? [])
              .filter((x) => x.role !== 'technician')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={f.mine === '1'} onChange={(e) => list.setFilter('mine', e.target.checked ? '1' : '')} />
            Mine only
          </label>
          {showClear && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear
            </Button>
          )}
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(e) => navigate(`/enquiries/${e.id}`)}
          empty={
            <EmptyState
              title={view === 'open' ? 'No open enquiries' : 'No enquiries match'}
              message={view === 'open' ? 'Log an enquiry when someone calls about a repair or about buying something.' : 'Try another tab or clear the filters.'}
              action={
                can('enquiries.manage') && view === 'open' ? (
                  <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                    New enquiry
                  </Button>
                ) : undefined
              }
            />
          }
          columns={[
            {
              key: 'who',
              header: 'Who asked',
              render: (e) => (
                <span className="block min-w-0">
                  <span className="block truncate font-medium text-slate-900">{e.name}</span>
                  <span className="block text-xs tabular-nums text-slate-500">
                    {e.phone}
                    {e.customer_id && <span className="ml-1.5 text-emerald-700">· customer</span>}
                  </span>
                </span>
              ),
            },
            {
              key: 'what',
              header: 'About',
              render: (e) => (
                <span className="block min-w-0 max-w-sm">
                  <span className="flex items-center gap-1.5">
                    <Badge tone={e.type === 'sales' ? 'violet' : 'sky'}>{e.type === 'sales' ? 'Sales' : 'Service'}</Badge>
                    <span className="truncate text-slate-800">{[e.brand?.name, e.product].filter(Boolean).join(' ') || '—'}</span>
                  </span>
                  {e.details && <span className="mt-0.5 block truncate text-xs text-slate-500">{e.details}</span>}
                </span>
              ),
            },
            {
              key: 'next',
              header: 'Call back',
              render: (e) => {
                const fu = followUpState(e);
                return fu ? (
                  <span className={cn('whitespace-nowrap text-sm', fu.late ? 'font-medium text-red-700' : fu.today ? 'font-medium text-amber-800' : 'text-slate-700')}>{fu.text}</span>
                ) : (
                  <span className="text-sm text-slate-400">{e.status === 'converted' ? (e.job ? `Job ${e.job.crm_call_id}` : e.estimate ? `Quote ${e.estimate.estimate_number}` : 'Done') : e.status === 'lost' ? e.lost_reason ?? '—' : 'Not set'}</span>
                );
              },
            },
            { key: 'by', header: 'Following up', hideOnMobile: true, render: (e) => e.assignee?.name ?? <span className="text-slate-400">Anyone</span> },
            {
              key: 'from',
              header: 'Received',
              hideOnMobile: true,
              render: (e) => (
                <span className="block whitespace-nowrap">
                  <span className="block text-slate-700">{date(e.created_at)}</span>
                  <span className="block text-xs text-slate-500">
                    {e.enquiry_number} · {sourceLabel(e.source)}
                  </span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', render: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {adding && (
        <EnquiryDialog
          onClose={() => {
            setAdding(false);
            list.setFilter('new', null);
          }}
        />
      )}
    </>
  );
}

function Tile({ label, value, note, tone, onClick }: { label: string; value: number | string | undefined; note?: string; tone?: 'amber' | 'red' | 'blue'; onClick: () => void }) {
  const toneCls = tone === 'red' ? 'border-red-200 text-red-700' : tone === 'amber' ? 'border-amber-300 text-amber-800' : tone === 'blue' ? 'border-brand-200 text-brand-700' : 'border-slate-200 text-navy-900';
  return (
    <button type="button" onClick={onClick} className={cn('rounded-2xl border bg-white px-4 py-3 text-left shadow-card transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', toneCls)}>
      <span className="block text-xs text-slate-600">{label}</span>
      <span className="mt-0.5 block text-2xl font-bold tabular-nums">{value ?? '…'}</span>
      {note && <span className="block truncate text-[11px] text-slate-500">{note}</span>}
    </button>
  );
}
