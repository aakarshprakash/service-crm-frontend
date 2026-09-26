import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, X } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useLookups, useStaffOptions } from '@/lib/hooks';
import { fromLocalInput } from '@/lib/format';
import type { Customer, CustomerProduct, Job } from '@/lib/types';
import { Button, Card, Field, Input, PageHeader, SearchInput, Select, Textarea, toast } from '@/components/ui';
import { CustomerForm, type CustomerDraft, emptyCustomer } from '@/pages/customers/CustomerForm';

export default function JobCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');
  const [customer, setCustomer] = useState<(Customer & { products?: CustomerProduct[] }) | null>(null);
  const [newCustomer, setNewCustomer] = useState<CustomerDraft | null>(null);
  const [search, setSearch] = useState('');
  const [job, setJob] = useState({
    customer_product_id: '',
    complaint_type_id: '',
    complaint_summary_id: '',
    complaint_details: '',
    priority: 'medium',
    call_type: 'crm_call',
    crm_call_id: '',
    scheduled_at: '',
    assigned_technician_id: '',
    branch_id: '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  // Preselect a customer when coming from the customer page.
  const preset = params.get('customer_id');
  useEffect(() => {
    if (preset) api.get<Envelope<{ customer: Customer }>>(`/customers/${preset}`).then((r) => setCustomer(r.data.customer)).catch(() => undefined);
  }, [preset]);

  const results = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search, per_page: 8 }),
    enabled: search.length >= 2 && !customer,
  });

  const summaries = lookups?.complaint_summaries.filter((s) => !job.complaint_type_id || s.complaint_type_id === Number(job.complaint_type_id) || !s.complaint_type_id) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let customerId = customer?.id;
      let productId = job.customer_product_id ? Number(job.customer_product_id) : null;
      if (!customerId && newCustomer) {
        const { product, ...rest } = newCustomer;
        const created = await api.post<Envelope<Customer & { products: CustomerProduct[] }>>('/customers', {
          ...rest,
          branch_id: rest.branch_id || null,
          products: product.product_id || product.serial_no ? [{ ...product, product_id: product.product_id || null, dealer_id: product.dealer_id || null, warranty_type: product.warranty_type || null }] : [],
        });
        customerId = created.data.id;
        productId = created.data.products?.[0]?.id ?? null;
      }
      if (!customerId) {
        setError(new ApiError(422, 'Select or add a customer.', { customer_id: ['Select or add a customer.'] }));
        return;
      }
      const res = await api.post<Envelope<Job>>('/jobs', {
        ...job,
        customer_id: customerId,
        customer_product_id: productId,
        complaint_type_id: job.complaint_type_id || null,
        complaint_summary_id: job.complaint_summary_id || null,
        assigned_technician_id: job.assigned_technician_id || null,
        branch_id: job.branch_id || null,
        crm_call_id: job.crm_call_id || null,
        scheduled_at: fromLocalInput(job.scheduled_at),
      });
      toast.success(res.message ?? 'Job created.');
      navigate(`/jobs/${res.data.id}`);
    } catch (err) {
      setError(err as ApiError);
      if (err instanceof ApiError && !Object.keys(err.errors).length) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof job, v: string) => setJob((j) => ({ ...j, [k]: v }));
  const f = (n: string) => error?.field(n);

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to="/jobs" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Jobs
          </Link>
        }
        title="New job"
        description="Log a customer complaint and assign a technician."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Customer">
            {customer ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between rounded-lg bg-slate-50 p-3">
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-slate-500">
                      {customer.phone} {customer.crm_id && `· ${customer.crm_id}`}
                    </p>
                    <p className="text-sm text-slate-500">{[customer.address, customer.city].filter(Boolean).join(', ')}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setCustomer(null); set('customer_product_id', ''); }} aria-label="Change customer">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Field label="Product" error={f('customer_product_id')}>
                  <Select value={job.customer_product_id} onChange={(e) => set('customer_product_id', e.target.value)}>
                    <option value="">Not specified</option>
                    {customer.products?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {[p.product?.brand?.name, p.product?.model_name].filter(Boolean).join(' ') || 'Product'} {p.serial_no ? `· SN ${p.serial_no}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : newCustomer ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">New customer</p>
                  <Button variant="ghost" size="sm" onClick={() => setNewCustomer(null)}>
                    Search existing instead
                  </Button>
                </div>
                <CustomerForm value={newCustomer} onChange={setNewCustomer} error={error} withProduct />
              </div>
            ) : (
              <div className="space-y-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by name, phone, CRM ID or serial number" delay={250} />
                {f('customer_id') && <p className="text-xs text-red-600">{f('customer_id')}</p>}
                {search.length >= 2 && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {results.data?.data.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={async () => {
                          const full = await api.get<Envelope<{ customer: Customer }>>(`/customers/${c.id}`);
                          setCustomer(full.data.customer);
                          if (c.branch_id) set('branch_id', String(c.branch_id));
                        }}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span>
                          <span className="block text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-slate-500">
                            {c.phone} · {c.city ?? '—'}
                          </span>
                        </span>
                        <span className="text-xs text-slate-400">{c.jobs_count} jobs</span>
                      </button>
                    ))}
                    {results.data && !results.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No customer matches “{search}”.</p>}
                  </div>
                )}
                <Button variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setNewCustomer({ ...emptyCustomer, phone: /^\d+$/.test(search) ? search : '', name: /^\d+$/.test(search) ? '' : search })}>
                  Add a new customer
                </Button>
              </div>
            )}
          </Card>

          <Card title="Complaint">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Complaint type" error={f('complaint_type_id')}>
                <Select value={job.complaint_type_id} onChange={(e) => { set('complaint_type_id', e.target.value); set('complaint_summary_id', ''); }}>
                  <option value="">Select…</option>
                  {lookups?.complaint_types.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Complaint summary">
                <Select value={job.complaint_summary_id} onChange={(e) => set('complaint_summary_id', e.target.value)} disabled={!summaries.length}>
                  <option value="">{summaries.length ? 'Select…' : 'None configured'}</option>
                  {summaries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Details" className="sm:col-span-2" error={f('complaint_details')}>
                <Textarea value={job.complaint_details} onChange={(e) => set('complaint_details', e.target.value)} placeholder="What does the customer report?" maxLength={2000} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Scheduling">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Priority" required>
                  <Select value={job.priority} onChange={(e) => set('priority', e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </Field>
                <Field label="Call type" required>
                  <Select value={job.call_type} onChange={(e) => set('call_type', e.target.value)}>
                    <option value="crm_call">CRM call</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="referral">Referral</option>
                  </Select>
                </Field>
              </div>
              <Field label="Visit date & time" error={f('scheduled_at')}>
                <Input type="datetime-local" value={job.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
              </Field>
              <Field label="Technician" error={f('assigned_technician_id')} hint="You can also assign later.">
                <Select value={job.assigned_technician_id} onChange={(e) => set('assigned_technician_id', e.target.value)}>
                  <option value="">Assign later</option>
                  {techs?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.punch_status === 'in' ? '· on duty' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              {(lookups?.branches.length ?? 0) > 1 && (
                <Field label="Branch">
                  <Select value={job.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
                    <option value="">Customer's branch</option>
                    {lookups?.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="External CRM call ID" error={f('crm_call_id')} hint="Leave blank to auto-generate.">
                <Input value={job.crm_call_id} onChange={(e) => set('crm_call_id', e.target.value)} maxLength={50} />
              </Field>
            </div>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/jobs')}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={saving}>
              Create job
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
