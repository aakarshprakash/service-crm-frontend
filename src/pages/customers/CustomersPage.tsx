import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation, useListQuery } from '@/lib/hooks';
import { date } from '@/lib/format';
import type { Customer } from '@/lib/types';
import { Button, Card, DataTable, EmptyState, FilterBar, Modal, PageHeader, Pagination, SearchInput } from '@/components/ui';
import { CustomerForm, emptyCustomer, productPayload, type CustomerDraft } from './CustomerForm';
import { ApiError } from '@/lib/api';

export default function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const list = useListQuery<Customer>('customers', '/customers');
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer records, their products and complete service history."
        actions={can('customers.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add customer</Button>}
      />
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={list.filters.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Name, phone, email, CRM ID or serial no." className="sm:w-96" />
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={<EmptyState title="No customers found" message="Customers are added here or while creating a job." />}
          columns={[
            {
              key: 'name',
              header: 'Customer',
              render: (c) => (
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.email ?? c.crm_id ?? ''}</p>
                </div>
              ),
            },
            { key: 'phone', header: 'Phone', render: (c) => c.phone },
            { key: 'city', header: 'Location', hideOnMobile: true, render: (c) => [c.city, c.pincode].filter(Boolean).join(' · ') || '—' },
            { key: 'branch', header: 'Branch', hideOnMobile: true, render: (c) => c.branch?.name ?? '—' },
            { key: 'jobs', header: 'Jobs', render: (c) => c.jobs_count ?? 0, className: 'tabular-nums' },
            { key: 'since', header: 'Since', hideOnMobile: true, render: (c) => date(c.created_at) },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      <AddCustomer open={adding} onClose={() => setAdding(false)} onCreated={(id) => navigate(`/customers/${id}`)} />
    </>
  );
}

function AddCustomer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer);
  const m = useApiMutation(
    (d: CustomerDraft) => {
      const { product, ...rest } = d;
      const hasProduct = product.product_id || product.serial_no;
      return api.post<Envelope<Customer>>('/customers', { ...rest, branch_id: rest.branch_id || null, products: hasProduct ? [productPayload(product)] : [] });
    },
    {
      invalidate: [['customers']],
      toastValidation: false,
      onSuccess: (r) => {
        onClose();
        setDraft(emptyCustomer);
        onCreated(r.data.id);
      },
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(draft)}>
            Save customer
          </Button>
        </>
      }
    >
      <CustomerForm value={draft} onChange={setDraft} error={m.error as ApiError | null} withProduct />
    </Modal>
  );
}
