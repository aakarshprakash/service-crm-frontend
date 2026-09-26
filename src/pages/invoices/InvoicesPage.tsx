import { useNavigate } from 'react-router';
import { useListQuery, useStaffOptions } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, FilterBar, Input, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const list = useListQuery<Invoice>('invoices', '/invoices');
  const { data: techs } = useStaffOptions('technician');
  const f = list.filters;
  const totals = list.data?.meta.totals as { total: number; paid: number; balance: number } | undefined;

  return (
    <>
      <PageHeader title="Invoices" description="Billing for every job, with offline and online payments." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Invoiced (filtered)" value={money(totals?.total ?? 0)} tone="blue" />
        <StatCard label="Received" value={money(totals?.paid ?? 0)} tone="green" />
        <StatCard label="Balance due" value={money(totals?.balance ?? 0)} tone={totals?.balance ? 'red' : 'slate'} />
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Invoice no., call ID, customer or phone" className="sm:w-72" />
          <Select value={f.payment_status ?? ''} onChange={(e) => list.setFilter('payment_status', e.target.value)} className="sm:w-40" aria-label="Payment status">
            <option value="">Any status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="unpaid,partial">Unpaid + partial</option>
            <option value="paid">Paid</option>
          </Select>
          <Select value={f.technician_id ?? ''} onChange={(e) => list.setFilter('technician_id', e.target.value)} className="sm:w-44" aria-label="Technician">
            <option value="">All technicians</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={f.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From date" />
          <Input type="date" value={f.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To date" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={f.credit === '1'} onChange={(e) => list.setFilter('credit', e.target.checked ? '1' : '')} />
            Credit only
          </label>
          {Object.keys(f).length > 0 && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear
            </Button>
          )}
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          empty={<EmptyState title="No invoices" message="Invoices are created automatically when technicians close visits with charges." />}
          columns={[
            {
              key: 'no',
              header: 'Invoice',
              render: (i) => (
                <div>
                  <p className="font-medium text-slate-900">{i.invoice_number}</p>
                  <p className="text-xs text-slate-500">{date(i.generated_at)}</p>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (i) => (
                <div>
                  <p>{i.customer?.name}</p>
                  <p className="text-xs text-slate-500">{i.job?.crm_call_id}</p>
                </div>
              ),
            },
            { key: 'tech', header: 'Technician', hideOnMobile: true, render: (i) => i.job?.technician?.name ?? '—' },
            { key: 'total', header: 'Total', render: (i) => money(i.total_amount), className: 'text-right tabular-nums', headerClassName: 'text-right' },
            { key: 'bal', header: 'Balance', render: (i) => <span className={i.balance_amount ? 'font-medium text-red-700' : ''}>{money(i.balance_amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            {
              key: 'status',
              header: 'Status',
              render: (i) => (
                <span className="flex items-center gap-1">
                  <StatusBadge status={i.payment_status} />
                  {i.is_credit && i.balance_amount > 0 && <Badge tone="violet">Credit</Badge>}
                </span>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
    </>
  );
}
