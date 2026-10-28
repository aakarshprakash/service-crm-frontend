import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, ClipboardList, Download, IndianRupee, Mail, MapPin, MessageCircle, Package, Pencil, Phone, Plus, Trash2, Wrench } from 'lucide-react';
import { api, ApiError, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { date, label, moneyWhole } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Customer, type CustomerProduct, type Job } from '@/lib/types';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Modal, QueryState } from '@/components/ui';
import { MapEmbed, StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';
import { CustomerForm, emptyProduct, ProductFields, productPayload, type CustomerDraft, type ProductDraft } from './CustomerForm';

interface CustomerView {
  customer: Customer & { products: CustomerProduct[] };
  jobs: (Job & { invoice?: { invoice_number: string; total_amount: number; balance_amount: number; payment_status: string } | null })[];
  outstanding: number;
}

function Kpi({ icon, tone, label: text, value, small }: { icon: ReactNode; tone: string; label: string; value: ReactNode; small?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <span className="text-sm font-medium text-slate-600">{text}</span>
      </div>
      <p className={cn('mt-3 font-bold tabular-nums text-slate-900', small ? 'text-lg' : 'text-2xl')}>{value}</p>
    </div>
  );
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
  const jobs = q.data?.jobs ?? [];
  const openJobs = jobs.filter((j) => ['open', 'in_progress', 'pending'].includes(j.status)).length;
  const lastService = jobs.find((j) => j.status === 'completed');
  const waNumber = (n: string) => n.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');
  const editProduct = (p: CustomerProduct) =>
    setProduct({
      id: p.id,
      draft: {
        product_id: String(p.product_id ?? ''),
        brand_id: String(p.brand_id ?? p.product?.brand?.id ?? ''),
        category_id: String(p.category_id ?? ''),
        serial_no: p.serial_no ?? '',
        outdoor_serial_no: p.outdoor_serial_no ?? '',
        purchase_date: p.purchase_date ?? '',
        warranty_type: p.warranty_type ?? '',
        warranty_expiry: p.warranty_expiry ?? '',
        dealer_id: String(p.dealer_id ?? ''),
      },
    });

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {c && q.data && (
        <>
          <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Customers
          </Link>

          {/* Profile header */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={c.name} className="h-14 w-14 text-lg" />
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-900">{c.name}</h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span>Customer since {date(c.created_at)}</span>
                    {c.branch && <span>· {c.branch.name} branch</span>}
                    {c.crm_id && <span>· CRM ID {c.crm_id}</span>}
                    {c.gstin && <Badge>GSTIN {c.gstin}</Badge>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${c.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
                {can('customers.manage') && (
                  <>
                    <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/jobs/new?customer_id=${c.id}`)}>
                      New job card
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<ClipboardList className="h-5 w-5" />} tone="bg-brand-50 text-brand-700" label="Jobs in total" value={jobs.length} />
            <Kpi icon={<Wrench className="h-5 w-5" />} tone="bg-amber-50 text-amber-700" label="Open jobs" value={openJobs} />
            <Kpi icon={<CalendarCheck className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" label="Last service" value={lastService ? date(lastService.created_at) : '—'} small />
            <Kpi
              icon={<IndianRupee className="h-5 w-5" />}
              tone={q.data.outstanding > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}
              label="Amount due"
              value={<span className={q.data.outstanding > 0 ? 'text-red-700' : undefined}>{moneyWhole(q.data.outstanding)}</span>}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Service history" padded={false} actions={<span className="text-xs text-slate-500">{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>}>
                {jobs.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-2.5">Job</th>
                          <th className="px-5 py-2.5">Service</th>
                          <th className="hidden px-5 py-2.5 md:table-cell">Technician</th>
                          <th className="hidden px-5 py-2.5 text-right sm:table-cell">Bill</th>
                          <th className="px-5 py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jobs.map((j) => (
                          <tr key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                            <td className="whitespace-nowrap px-5 py-3">
                              <p className="font-semibold text-slate-900">{j.crm_call_id}</p>
                              <p className="text-xs text-slate-500">{date(j.created_at)}</p>
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-slate-900">{j.complaint_type?.name ?? '—'}</p>
                              <p className="text-xs text-slate-500">{unitLabel(j.customer_product) || 'Product not set'}</p>
                            </td>
                            <td className="hidden whitespace-nowrap px-5 py-3 text-slate-700 md:table-cell">{j.technician?.name ?? <span className="text-slate-400">Not assigned</span>}</td>
                            <td className="hidden whitespace-nowrap px-5 py-3 text-right tabular-nums sm:table-cell">
                              {j.invoice ? (
                                <>
                                  <p className="text-slate-900">{moneyWhole(j.invoice.total_amount)}</p>
                                  {j.invoice.balance_amount > 0 ? <p className="text-xs font-medium text-red-700">{moneyWhole(j.invoice.balance_amount)} due</p> : <p className="text-xs text-emerald-700">Paid</p>}
                                </>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right">
                              <StatusBadge status={j.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No jobs yet" message="Create the first job card for this customer." />
                )}
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
              >
                {c.products.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {c.products.map((p) => {
                      const covered = p.warranty_expiry && new Date(p.warranty_expiry) > new Date();
                      return (
                        <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Package className="h-4 w-4" /></span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{p.product?.brand?.name ?? p.brand?.name ?? 'Product'}</p>
                                <p className="truncate text-xs text-slate-500">{[p.category?.name, p.product?.model_name].filter(Boolean).join(' · ') || 'Type and model not set'}</p>
                              </div>
                            </div>
                            {can('customers.manage') && (
                              <Button size="sm" variant="ghost" aria-label="Edit product" onClick={() => editProduct(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <dt className="text-slate-500">Serial no.</dt>
                            <dd className="truncate text-right text-slate-800">{p.serial_no ?? '—'}</dd>
                            <dt className="text-slate-500">Purchased</dt>
                            <dd className="text-right text-slate-800">{p.purchase_date ? date(p.purchase_date) : '—'}</dd>
                            <dt className="text-slate-500">Dealer</dt>
                            <dd className="truncate text-right text-slate-800">{p.dealer?.name ?? '—'}</dd>
                          </dl>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {!p.product_id && <Badge tone="amber">Model pending</Badge>}
                            {p.warranty_type && <Badge tone={covered ? 'green' : 'slate'}>{label(p.warranty_type)}{p.warranty_expiry ? ` · till ${date(p.warranty_expiry)}` : ''}</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Package className="h-6 w-6" />} title="No products yet" message="Products are added here or when a job card is created." />
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Contact details">
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <a href={`tel:${c.phone}`} className="font-medium text-slate-900 hover:text-brand-700">{c.phone}</a>
                      {c.alt_phone && <p className="text-slate-600">{c.alt_phone} <span className="text-xs text-slate-400">(alternate)</span></p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {c.email ? <a href={`mailto:${c.email}`} className="break-all text-slate-900 hover:text-brand-700">{c.email}</a> : <span className="text-slate-400">No email</span>}
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-slate-700">{[c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') || <span className="text-slate-400">No address</span>}</span>
                  </div>
                </dl>
                <MapEmbed lat={c.lat} lng={c.lng} className="mt-4" />
              </Card>

              {can('customers.privacy') && (
                <Card title="Data & privacy">
                  <p className="text-xs text-slate-500">For data requests from the customer.</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Hint block text="Downloads everything held about this customer (details, products, jobs, invoices and payments) as a file, e.g. for a data request. The download is recorded in the audit trail.">
                      <Button className="w-full" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportData}>
                        Export customer data
                      </Button>
                    </Hint>
                    <Hint block text="Permanently removes the customer’s name, phone, email and address and disables their portal login. Their jobs and invoices stay for your records. This can’t be undone.">
                      <Button className="w-full text-red-600 hover:bg-red-50" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
                        Delete personal data
                      </Button>
                    </Hint>
                  </div>
                </Card>
              )}
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
    gstin: customer.gstin ?? '',
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
