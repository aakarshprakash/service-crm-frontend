import { Link } from 'react-router';
import { useListQuery, useStaffOptions } from '@/lib/hooks';
import { dateTime, money, monthStart, today } from '@/lib/format';
import type { Named, Payment } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, Input, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui';
import { MethodLabel, StatusBadge } from '@/components/domain';

type Receipt = Payment & { invoice?: { id: number; invoice_number: string; customer?: Named | null } | null };

/** Receipts register: every payment received, by any method, from anyone. */
export default function ReceiptsPage() {
  const list = useListQuery<Receipt>('receipts', '/payments', { from: monthStart(), to: today() });
  const { data: staff } = useStaffOptions();
  const f = list.filters;
  const byMethod = (list.data?.meta.by_method as Record<string, number> | undefined) ?? {};
  const total = (list.data?.meta.total_amount as number | undefined) ?? 0;

  return (
    <>
      <PageHeader
        title="Receipts"
        description="Every payment received — at the office, by technicians in the field and online."
        actions={
          <Link to={`/reports?report=receipts`}>
            <Button variant="secondary">Export</Button>
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total received" value={money(total)} tone="blue" />
        {(['cash', 'upi', 'cheque', 'bank_transfer'] as const).map((m) => (
          <StatCard key={m} label={m === 'bank_transfer' ? 'Bank transfer' : m === 'upi' ? 'UPI' : m[0]!.toUpperCase() + m.slice(1)} value={money((byMethod[m] ?? 0) + (m === 'bank_transfer' ? byMethod.online ?? 0 : 0))} tone="slate" />
        ))}
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Receipt, invoice, reference or customer" className="sm:w-72" />
          <Select value={f.method ?? ''} onChange={(e) => list.setFilter('method', e.target.value)} className="sm:w-36" aria-label="Method">
            <option value="">Any method</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="online">Online</option>
          </Select>
          <Select value={f.collected_by ?? ''} onChange={(e) => list.setFilter('collected_by', e.target.value)} className="sm:w-44" aria-label="Collected by">
            <option value="">Anyone</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={f.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From" />
          <Input type="date" value={f.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To" />
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          empty={<EmptyState title="No receipts" message="Payments recorded against invoices appear here." />}
          columns={[
            {
              key: 'r',
              header: 'Receipt',
              render: (p) => (
                <div>
                  <p className="font-medium text-slate-900">{p.receipt_number ?? '—'}</p>
                  <p className="text-xs text-slate-500">{dateTime(p.paid_at)}</p>
                </div>
              ),
            },
            {
              key: 'inv',
              header: 'Customer / invoice',
              render: (p) =>
                p.invoice ? (
                  <div>
                    <p>{p.invoice.customer?.name}</p>
                    <Link to={`/invoices/${p.invoice.id}`} className="text-xs text-brand-700 hover:underline">
                      {p.invoice.invoice_number}
                    </Link>
                  </div>
                ) : (
                  '—'
                ),
            },
            {
              key: 'm',
              header: 'Method',
              hideOnMobile: true,
              render: (p) => (
                <div>
                  <MethodLabel method={p.method} />
                  {p.reference_no && <p className="text-xs text-slate-500">{p.reference_no}</p>}
                </div>
              ),
            },
            { key: 'by', header: 'Collected by', hideOnMobile: true, render: (p) => p.collector?.name ?? 'Office / online' },
            { key: 's', header: 'Status', hideOnMobile: true, render: (p) => <StatusBadge status={p.status} /> },
            { key: 'a', header: 'Amount', className: 'text-right tabular-nums font-medium', headerClassName: 'text-right', render: (p) => money(p.amount) },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
    </>
  );
}
