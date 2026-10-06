import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/lib/types';
import { Badge, Card, DataTable, EmptyState, FilterBar, Modal, PageHeader, QueryState, SearchInput, StatCard } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

type Buckets = { total: number; d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
interface Row extends Buckets {
  customer: { id: number | null; name: string; phone: string | null };
  invoices: number;
  credit: boolean;
  oldest_days: number;
}

/** Who owes money, how much and for how long (aging by invoice date). */
export default function ReceivablesPage() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ['books', 'receivables', search],
    queryFn: () => api.get<Envelope<{ rows: Row[]; totals: Buckets; customers: number }>>('/books/receivables', { search }).then((r) => r.data),
  });
  const t = q.data?.totals;

  return (
    <>
      <PageHeader title="Receivables" description="Outstanding balances by customer, aged from the invoice date. Click a customer to see their invoices." />
      <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {t && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Total outstanding" value={money(t.total)} tone={t.total ? 'red' : 'slate'} />
            <StatCard label="0–30 days" value={money(t.d0_30)} tone="green" />
            <StatCard label="31–60 days" value={money(t.d31_60)} tone="amber" />
            <StatCard label="61–90 days" value={money(t.d61_90)} tone="amber" />
            <StatCard label="Over 90 days" value={money(t.d90_plus)} tone="red" />
          </div>
        )}
        <Card padded={false}>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Customer name or phone" className="sm:w-72" />
          </FilterBar>
          <DataTable
            rows={q.data?.rows.map((r) => ({ ...r, id: r.customer.id ?? 0 }))}
            loading={q.isFetching}
            onRowClick={(r) => setOpen(r)}
            rowClassName={(r) => (r.oldest_days > 90 ? 'bg-red-50/40' : undefined)}
            empty={<EmptyState title="Nothing outstanding" message="Every invoice is fully paid." />}
            columns={[
              {
                key: 'cust',
                header: 'Customer',
                render: (r) => (
                  <div>
                    <p className="font-medium text-slate-900">
                      {r.customer.name} {r.credit && <Badge tone="violet">Credit</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.customer.phone} · {r.invoices} invoice{r.invoices === 1 ? '' : 's'}
                    </p>
                  </div>
                ),
              },
              ...(['d0_30', 'd31_60', 'd61_90', 'd90_plus'] as const).map((k, i) => ({
                key: k,
                header: ['0–30', '31–60', '61–90', '90+'][i],
                hideOnMobile: true,
                className: cn('text-right tabular-nums', k === 'd90_plus' && 'text-red-700'),
                headerClassName: 'text-right',
                render: (r: Row) => (r[k] ? money(r[k]) : <span className="text-slate-300">—</span>),
              })),
              { key: 'total', header: 'Total due', className: 'text-right tabular-nums font-semibold', headerClassName: 'text-right', render: (r) => money(r.total) },
              {
                key: 'call',
                header: '',
                className: 'w-10',
                render: (r) =>
                  r.customer.phone ? (
                    <a href={`tel:${r.customer.phone}`} onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-brand-700" aria-label={`Call ${r.customer.name}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null,
              },
            ]}
          />
        </Card>
      </QueryState>
      {open && <CustomerInvoices row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CustomerInvoices({ row, onClose }: { row: Row; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['invoices', 'due', row.customer.id],
    queryFn: () => api.get<Paginated<Invoice>>('/invoices', { customer_id: row.customer.id, payment_status: 'unpaid,partial', per_page: 50 }),
  });
  return (
    <Modal open onClose={onClose} size="xl" title={`${row.customer.name} owes ${money(row.total)}`} description="Open an invoice to record a payment, send a reminder or show a UPI QR.">
      <DataTable
        rows={q.data?.data}
        loading={q.isLoading}
        columns={[
          {
            key: 'no',
            header: 'Invoice',
            render: (i) => (
              <Link to={`/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                {i.invoice_number}
              </Link>
            ),
          },
          { key: 'date', header: 'Date', render: (i) => date(i.generated_at) },
          { key: 'job', header: 'Job', hideOnMobile: true, render: (i) => (i.source === 'walk_in' ? 'Walk-in' : i.job?.crm_call_id) },
          { key: 'total', header: 'Total', className: 'text-right tabular-nums', headerClassName: 'text-right', render: (i) => money(i.total_amount) },
          { key: 'bal', header: 'Balance', className: 'text-right tabular-nums font-medium text-red-700', headerClassName: 'text-right', render: (i) => money(i.balance_amount) },
          { key: 's', header: '', render: (i) => <StatusBadge status={i.payment_status} /> },
        ]}
      />
    </Modal>
  );
}
