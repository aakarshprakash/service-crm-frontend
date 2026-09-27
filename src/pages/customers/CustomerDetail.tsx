import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, label, money } from '@/lib/format';
import type { Customer, CustomerProduct, Job } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Modal, PageHeader, QueryState, StatCard } from '@/components/ui';
import { MapEmbed, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import { CustomerForm, emptyProduct, ProductFields, productPayload, type CustomerDraft, type ProductDraft } from './CustomerForm';

interface CustomerView {
  customer: Customer & { products: CustomerProduct[] };
  jobs: (Job & { invoice?: { invoice_number: string; total_amount: number; balance_amount: number; payment_status: string } | null })[];
  outstanding: number;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<Envelope<CustomerView>>(`/customers/${id}`).then((r) => r.data) });
  const [editing, setEditing] = useState(false);
  const [product, setProduct] = useState<{ id?: number; draft: ProductDraft } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = useApiMutation(() => api.delete(`/customers/${id}`), { invalidate: [['customers']], onSuccess: () => navigate('/customers') });
  const exportData = async () => {
    const res = await api.get<Envelope<unknown>>(`/customers/${id}/export`);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer-${id}-data.json`;
    a.click();
  };

  const c = q.data?.customer;
  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {c && q.data && (
        <>
          <PageHeader
            back={
              <Link to="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Customers
              </Link>
            }
            title={c.name}
            description={[c.phone, c.alt_phone, c.email].filter(Boolean).join(' · ')}
            actions={
              <>
                {can('customers.manage') && (
                  <>
                    <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/jobs/new?customer_id=${c.id}`)}>
                      New job
                    </Button>
                  </>
                )}
                {can('customers.privacy') && (
                  <>
                    <Hint text="Downloads everything held about this customer (details, products, jobs, invoices and payments) as a file, e.g. for a data request. The download is recorded in the audit trail.">
                      <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={exportData} title="Export all data held about this customer">
                        Export data
                      </Button>
                    </Hint>
                    <Hint text="Permanently removes the customer’s name, phone, email and address and disables their portal login. Their jobs and invoices stay for your records. This can’t be undone.">
                      <Button variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
                        Delete
                      </Button>
                    </Hint>
                  </>
                )}
              </>
            }
          />

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total jobs" value={q.data.jobs.length} />
            <StatCard label="Open jobs" value={q.data.jobs.filter((j) => ['open', 'in_progress', 'pending'].includes(j.status)).length} tone="violet" />
            <StatCard label="Products" value={c.products.length} tone="slate" />
            <StatCard label="Outstanding" value={money(q.data.outstanding)} tone={q.data.outstanding > 0 ? 'red' : 'green'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Service history" padded={false}>
                <DataTable
                  rows={q.data.jobs}
                  onRowClick={(j) => navigate(`/jobs/${j.id}`)}
                  empty={<EmptyState title="No jobs yet" message="Create the first job for this customer." />}
                  columns={[
                    { key: 'call', header: 'Call', render: (j) => <span className="font-medium text-slate-900">{j.crm_call_id}</span> },
                    { key: 'date', header: 'Date', render: (j) => date(j.created_at) },
                    { key: 'complaint', header: 'Complaint', hideOnMobile: true, render: (j) => j.complaint_type?.name ?? '—' },
                    { key: 'tech', header: 'Technician', hideOnMobile: true, render: (j) => j.technician?.name ?? '—' },
                    { key: 'inv', header: 'Invoice', hideOnMobile: true, render: (j) => (j.invoice ? `${money(j.invoice.total_amount)}${j.invoice.balance_amount ? ` · due ${money(j.invoice.balance_amount)}` : ''}` : '—') },
                    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
                  ]}
                />
              </Card>
              <Card
                title="Products"
                actions={
                  can('customers.manage') && (
                    <Hint text="Registers an appliance this customer owns, with its serial number, purchase date, warranty and dealer. New jobs are logged against a product.">
                      <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setProduct({ draft: emptyProduct })}>
                        Add product
                      </Button>
                    </Hint>
                  )
                }
                padded={false}
              >
                {c.products.length ? (
                  <ul className="divide-y divide-slate-100">
                    {c.products.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 text-sm">
                          <p className="font-medium text-slate-900">{[p.product?.brand?.name, p.product?.model_name].filter(Boolean).join(' ') || 'Product'}</p>
                          <p className="text-xs text-slate-500">
                            SN {p.serial_no ?? '—'} {p.outdoor_serial_no && `· Outdoor ${p.outdoor_serial_no}`} · Purchased {date(p.purchase_date)} {p.dealer && `· ${p.dealer.name}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.warranty_type && <Badge tone={p.warranty_expiry && new Date(p.warranty_expiry) > new Date() ? 'green' : 'slate'}>{label(p.warranty_type)}</Badge>}
                          {can('customers.manage') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Edit product"
                              onClick={() =>
                                setProduct({
                                  id: p.id,
                                  draft: {
                                    product_id: String(p.product_id ?? ''),
                                    serial_no: p.serial_no ?? '',
                                    outdoor_serial_no: p.outdoor_serial_no ?? '',
                                    purchase_date: p.purchase_date ?? '',
                                    warranty_type: p.warranty_type ?? '',
                                    warranty_expiry: p.warranty_expiry ?? '',
                                    dealer_id: String(p.dealer_id ?? ''),
                                  },
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-6 text-sm text-slate-500">No products registered.</p>
                )}
              </Card>
            </div>
            <div className="space-y-6">
              <Card title="Address">
                <p className="text-sm text-slate-700">{[c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') || '—'}</p>
                {c.crm_id && <p className="mt-2 text-xs text-slate-500">CRM ID: {c.crm_id}</p>}
                {c.branch && <p className="mt-1 text-xs text-slate-500">Branch: {c.branch.name}</p>}
                <MapEmbed lat={c.lat} lng={c.lng} className="mt-4" />
              </Card>
            </div>
          </div>

          <EditCustomer customer={c} open={editing} onClose={() => setEditing(false)} />
          {product && <ProductDialog customerId={c.id} state={product} onClose={() => setProduct(null)} />}
          <ConfirmDialog
            open={deleting}
            onClose={() => setDeleting(false)}
            title="Delete customer data?"
            message="Personal details (name, phone, email, address, location) will be permanently removed. Jobs and invoices stay for accounting, linked to an anonymous record. This cannot be undone."
            confirmLabel="Delete personal data"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined)}
          />
        </>
      )}
    </QueryState>
  );
}

function EditCustomer({ customer, open, onClose }: { customer: Customer; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<CustomerDraft>({
    name: customer.name,
    phone: customer.phone,
    alt_phone: customer.alt_phone ?? '',
    email: customer.email ?? '',
    crm_id: customer.crm_id ?? '',
    address: customer.address ?? '',
    city: customer.city ?? '',
    state: customer.state ?? '',
    pincode: customer.pincode ?? '',
    branch_id: String(customer.branch_id ?? ''),
    product: emptyProduct,
  });
  const m = useApiMutation(({ product: _p, ...rest }: CustomerDraft) => api.patch(`/customers/${customer.id}`, { ...rest, branch_id: rest.branch_id || null }), {
    invalidate: [['customer', String(customer.id)], ['customers']],
    toastValidation: false,
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Edit customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(draft)}>
            Save changes
          </Button>
        </>
      }
    >
      <CustomerForm value={draft} onChange={setDraft} error={m.error as ApiError | null} />
    </Modal>
  );
}

function ProductDialog({ customerId, state, onClose }: { customerId: number; state: { id?: number; draft: ProductDraft }; onClose: () => void }) {
  const [draft, setDraft] = useState(state.draft);
  const m = useApiMutation(
    (d: ProductDraft) => (state.id ? api.patch(`/customers/${customerId}/products/${state.id}`, productPayload(d)) : api.post(`/customers/${customerId}/products`, productPayload(d))),
    { invalidate: [['customer', String(customerId)]], toastValidation: false, onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={state.id ? 'Edit product' : 'Add product'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(draft)}>
            Save
          </Button>
        </>
      }
    >
      <ProductFields value={draft} onChange={setDraft} error={m.error as ApiError | null} />
    </Modal>
  );
}
