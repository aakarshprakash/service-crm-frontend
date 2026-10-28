import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CalendarPlus, ClipboardList, Flag, MapPin, Package, Phone, User, UserPlus, Wrench, X } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useLookups, useStaffOptions } from '@/lib/hooks';
import { fromLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Customer, CustomerProduct, Job } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Combobox, Field, Input, PageHeader, SearchInput, Select, toast } from '@/components/ui';
import { RichTextField } from '@/components/RichText';
import { CustomerForm, ProductFields, emptyProduct, productPayload, type CustomerDraft, type ProductDraft, emptyCustomer } from '@/pages/customers/CustomerForm';
import { Hint } from '@/components/tutorial';

/** Section heading with a step number. */
function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700')}>{n}</span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Small pill choice used for priority and call type. */
function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; tone?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition',
            value === o.value ? (o.tone ?? 'border-brand-600 bg-brand-600 text-white') : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Next whole hour, as a datetime-local value – a sensible default visit time. */
function nextHour(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

const dateLabel = (local: string) =>
  local ? new Date(local).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;

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
    scheduled_at: nextHour(),
    assigned_technician_id: '',
    branch_id: '',
    service_location_id: '',
  });
  const [autoAssign, setAutoAssign] = useState(false);
  const locations = lookups?.service_locations ?? [];

  // Suggest the service location whose PIN codes include the customer's PIN.
  const pincode = (customer?.pincode ?? newCustomer?.pincode ?? '').replace(/\D/g, '');
  const suggested = pincode.length >= 4 ? locations.find((l) => (l.pincodes ?? '').split(/[\s,]+/).includes(pincode)) : undefined;
  useEffect(() => {
    if (suggested) setJob((j) => (j.service_location_id ? j : { ...j, service_location_id: String(suggested.id) }));
  }, [suggested?.id]);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  // At job card time only the brand is known; model, serial and warranty are added by the technician on site.
  const [brand, setBrand] = useState<ProductDraft>({ ...emptyProduct });
  const [productError, setProductError] = useState<ApiError | null>(null);
  // Keeps a retry after a failed job save from creating the product twice.
  const createdProduct = useRef<{ brand: string; id: number } | null>(null);

  // Preselect a customer when coming from the customer page.
  const preset = params.get('customer_id');
  useEffect(() => {
    if (preset) api.get<Envelope<{ customer: Customer }>>(`/customers/${preset}`).then((r) => setCustomer(r.data.customer)).catch(() => undefined);
  }, [preset]);
  // Brands this customer already has products of – offered as one-click choices; a single one is preselected.
  const ownedBrands = useMemo(() => {
    const seen = new Map<string, string>();
    (customer?.products ?? []).forEach((p) => {
      const id = p.brand_id ?? p.product?.brand?.id;
      const name = p.brand?.name ?? p.product?.brand?.name;
      if (id && name) seen.set(String(id), name);
    });
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [customer]);
  useEffect(() => {
    setBrand({ ...emptyProduct, brand_id: ownedBrands.length === 1 ? ownedBrands[0]!.id : '' });
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search, per_page: 8 }),
    enabled: search.length >= 2 && !customer,
  });

  const typeOptions = useMemo(() => (lookups?.complaint_types ?? []).map((c) => ({ value: String(c.id), label: c.name })), [lookups]);
  const summaryOptions = useMemo(
    () => (lookups?.complaint_summaries ?? [])
      .filter((s) => !job.complaint_type_id || s.complaint_type_id === Number(job.complaint_type_id) || !s.complaint_type_id)
      .map((s) => ({ value: String(s.id), label: s.name })),
    [lookups, job.complaint_type_id],
  );
  // On-duty technicians first, each with their current workload.
  const techOptions = useMemo(
    () => [...(techs ?? [])]
      .sort((a, b) => Number(b.punch_status === 'in') - Number(a.punch_status === 'in') || a.name.localeCompare(b.name))
      .map((t) => ({
        value: String(t.id),
        label: t.name,
        hint: [t.punch_status === 'in' ? 'On duty' : 'Off duty', t.open_jobs !== undefined ? `${t.open_jobs} open job${t.open_jobs === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
        group: t.punch_status === 'in' ? 'On duty' : 'Off duty',
      })),
    [techs],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setProductError(null);
    try {
      let customerId = customer?.id;
      let productId: number | null = null;

      // Existing customer: reuse their latest product of this brand, or record a new brand-only product.
      if (customer && brand.brand_id) {
        const saved = (customer.products ?? [])
          .filter((p) => String(p.brand_id ?? p.product?.brand?.id ?? '') === brand.brand_id)
          .sort((a, b) => b.id - a.id)[0];
        if (saved) {
          productId = saved.id;
        } else if (createdProduct.current?.brand === brand.brand_id) {
          productId = createdProduct.current.id;
        } else {
          try {
            const added = await api.post<Envelope<CustomerProduct>>(`/customers/${customer.id}/products`, productPayload(brand));
            createdProduct.current = { brand: brand.brand_id, id: added.data.id };
            productId = added.data.id;
          } catch (err) {
            setProductError(err as ApiError);
            if (err instanceof ApiError && !Object.keys(err.errors).length) toast.error(err.message);
            return;
          }
        }
      }

      if (!customerId && newCustomer) {
        const { product, ...rest } = newCustomer;
        const hasProduct = product.product_id || product.brand_id || product.category_id || product.serial_no;
        const created = await api.post<Envelope<Customer & { products: CustomerProduct[] }>>('/customers', {
          ...rest,
          branch_id: rest.branch_id || null,
          products: hasProduct ? [productPayload(product)] : [],
        });
        customerId = created.data.id;
        productId = created.data.products?.[0]?.id ?? null;
      }
      if (!customerId) {
        setError(new ApiError(422, 'Select or add a customer.', { customer_id: ['Select or add a customer.'] }));
        return;
      }
      if (!job.scheduled_at) {
        setError(new ApiError(422, 'Choose the visit date and time.', { scheduled_at: ['Choose when the technician should visit.'] }));
        return;
      }
      const res = await api.post<Envelope<Job> & { meta?: { auto_assign?: { assigned: boolean } } }>('/jobs', {
        ...job,
        customer_id: customerId,
        customer_product_id: productId,
        complaint_type_id: job.complaint_type_id || null,
        complaint_summary_id: job.complaint_summary_id || null,
        complaint_details: job.complaint_details || null,
        assigned_technician_id: autoAssign ? null : job.assigned_technician_id || null,
        branch_id: job.branch_id || null,
        service_location_id: job.service_location_id || null,
        auto_assign: autoAssign,
        crm_call_id: job.crm_call_id || null,
        scheduled_at: fromLocalInput(job.scheduled_at),
      });
      // Auto-assign can fail (nobody covers the area / everyone at the limit); the job is still created.
      if (res.meta?.auto_assign && !res.meta.auto_assign.assigned) toast.info(res.message ?? 'Job created but not assigned.');
      else toast.success(res.message ?? 'Job created.');
      navigate(`/jobs/${res.data.id}?created=1`);
    } catch (err) {
      setError(err as ApiError);
      if (err instanceof ApiError && !Object.keys(err.errors).length) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof job, v: string) => setJob((j) => ({ ...j, [k]: v }));
  const f = (n: string) => error?.field(n);
  const resetCustomer = () => {
    setCustomer(null);
    setBrand({ ...emptyProduct });
    setProductError(null);
    createdProduct.current = null;
  };

  const hasCustomer = !!customer || !!newCustomer;
  const brandId = customer ? brand.brand_id : newCustomer?.product.brand_id;
  const summary = {
    customer: customer?.name ?? newCustomer?.name ?? null,
    unit: lookups?.brands.find((b) => String(b.id) === brandId)?.name ?? null,
    type: typeOptions.find((o) => o.value === job.complaint_type_id)?.label ?? null,
    tech: autoAssign ? 'Auto-assign' : techOptions.find((o) => o.value === job.assigned_technician_id)?.label ?? null,
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to="/jobs" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Jobs
          </Link>
        }
        title="New job card"
        description="Log the customer’s complaint, the unit and who should attend."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 1. Customer */}
          <Card title={<Step n={1} title="Customer" done={hasCustomer} />}>
            {customer ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><User className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{customer.name}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-600"><Phone className="h-3.5 w-3.5" /> {customer.phone} {customer.crm_id && <span className="text-slate-400">· {customer.crm_id}</span>}</p>
                    {(customer.address || customer.city) && (
                      <p className="flex items-start gap-1 text-sm text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {[customer.address, customer.city, customer.pincode].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={resetCustomer} aria-label="Change customer" icon={<X className="h-4 w-4" />}>
                  Change
                </Button>
              </div>
            ) : newCustomer ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Badge tone="blue">New customer</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setNewCustomer(null)}>
                    Search existing instead
                  </Button>
                </div>
                <CustomerForm value={newCustomer} onChange={setNewCustomer} error={error} withProduct minimal />
              </div>
            ) : (
              <div className="space-y-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by name, phone, CRM ID or serial number" delay={250} />
                {f('customer_id') && <p className="text-xs text-red-600">{f('customer_id')}</p>}
                {search.length >= 2 && (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                    {results.data?.data.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={async () => {
                          const full = await api.get<Envelope<{ customer: Customer }>>(`/customers/${c.id}`);
                          setCustomer(full.data.customer);
                          if (c.branch_id) set('branch_id', String(c.branch_id));
                        }}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-brand-50/50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                          <span className="text-xs text-slate-500">{c.phone} · {c.city ?? '—'}</span>
                        </span>
                        <Badge>{c.jobs_count} jobs</Badge>
                      </button>
                    ))}
                    {results.data && !results.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No customer matches “{search}”.</p>}
                  </div>
                )}
                <Hint align="left" text="Opens a short customer form right here. The customer is saved together with the job when you click Create job.">
                  <Button variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setNewCustomer({ ...emptyCustomer, phone: /^\d+$/.test(search) ? search : '', name: /^\d+$/.test(search) ? '' : search })}>
                    Add a new customer
                  </Button>
                </Hint>
              </div>
            )}
          </Card>

          {/* 2. Product – for an existing customer (a new customer's unit is part of their form above) */}
          {customer && (
            <Card title={<Step n={2} title="Product brand" done={!!brand.brand_id} />}>
              <div className="space-y-3">
                {ownedBrands.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">{customer.name} already has:</p>
                    <div className="flex flex-wrap gap-2">
                      {ownedBrands.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBrand({ ...emptyProduct, brand_id: b.id })}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                            brand.brand_id === b.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300',
                          )}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <ProductFields value={brand} onChange={setBrand} error={productError} title={null} brandOnly />
              </div>
            </Card>
          )}

          {/* 3. Complaint */}
          <Card title={<Step n={customer ? 3 : 2} title="Complaint" done={!!job.complaint_type_id} />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service type" error={f('complaint_type_id')}>
                <Combobox
                  value={job.complaint_type_id}
                  onChange={(v) => setJob((j) => ({ ...j, complaint_type_id: v, complaint_summary_id: '' }))}
                  options={typeOptions}
                  placeholder="Select service type…"
                  searchPlaceholder="Search service type…"
                  invalid={!!f('complaint_type_id')}
                  aria-label="Service type"
                  searchable
                />
              </Field>
              <Field label="Breakdown / complaint summary" error={f('complaint_summary_id')}>
                <Combobox
                  value={job.complaint_summary_id}
                  onChange={(v) => set('complaint_summary_id', v)}
                  options={summaryOptions}
                  placeholder={summaryOptions.length ? 'Select…' : 'None configured'}
                  searchPlaceholder="Search e.g. compressor, PCB…"
                  disabled={!summaryOptions.length}
                  aria-label="Complaint summary"
                  searchable
                />
              </Field>
              <Field label="Details" className="sm:col-span-2" error={f('complaint_details')}>
                <RichTextField value={job.complaint_details} onChange={(html) => set('complaint_details', html)} placeholder="What does the customer report? Any error codes, access notes or timing preferences…" invalid={!!f('complaint_details')} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={<Step n={customer ? 4 : 3} title="Schedule & assign" done={autoAssign || !!job.assigned_technician_id} />}>
            <div className="space-y-4">
              <Field label="Priority" required>
                <Pills
                  value={job.priority as 'low' | 'medium' | 'high'}
                  onChange={(v) => set('priority', v)}
                  options={[
                    { value: 'low', label: 'Low', tone: 'border-slate-600 bg-slate-600 text-white' },
                    { value: 'medium', label: 'Medium', tone: 'border-amber-500 bg-amber-500 text-white' },
                    { value: 'high', label: 'High', tone: 'border-red-600 bg-red-600 text-white' },
                  ]}
                />
              </Field>
              <Field label="Call type" required>
                <Pills value={job.call_type as 'crm_call' | 'walk_in' | 'referral'} onChange={(v) => set('call_type', v)} options={[{ value: 'crm_call', label: 'CRM call' }, { value: 'walk_in', label: 'Walk-in' }, { value: 'referral', label: 'Referral' }]} />
              </Field>
              <Field label="Visit date & time" required error={f('scheduled_at')} hint={!f('scheduled_at') && job.scheduled_at ? dateLabel(job.scheduled_at) ?? undefined : undefined}>
                <Input type="datetime-local" required value={job.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} invalid={!!f('scheduled_at')} />
              </Field>
              {locations.length > 0 && (
                <Field label="Service location" error={f('service_location_id')} hint={suggested && String(suggested.id) === job.service_location_id ? `Matched from PIN code ${pincode}.` : undefined}>
                  <Select value={job.service_location_id} onChange={(e) => set('service_location_id', e.target.value)}>
                    <option value="">Not specified</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.city ? ` · ${l.city}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Hint align="left" block text="Picks the technician linked to this job’s service location who has the fewest open jobs, skipping anyone at the limit set in Settings. Without a location, technicians of the job’s branch are used.">
                <Checkbox label="Auto-assign a technician" checked={autoAssign} onChange={setAutoAssign} />
              </Hint>
              <Field label="Technician" error={f('assigned_technician_id')} hint={autoAssign ? 'Chosen automatically when you save.' : 'You can also assign later.'}>
                <Combobox
                  value={autoAssign ? '' : job.assigned_technician_id}
                  onChange={(v) => set('assigned_technician_id', v)}
                  options={techOptions}
                  placeholder="Assign later"
                  searchPlaceholder="Search technician…"
                  disabled={autoAssign}
                  aria-label="Technician"
                  searchable
                />
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

          <div className="lg:sticky lg:top-20">
            <Card title="Job card summary">
              <dl className="space-y-2.5 text-sm">
                {[
                  [<User key="u" className="h-4 w-4" />, 'Customer', summary.customer],
                  [<Package key="p" className="h-4 w-4" />, 'Brand', summary.unit],
                  [<ClipboardList key="c" className="h-4 w-4" />, 'Service type', summary.type],
                  [<Wrench key="w" className="h-4 w-4" />, 'Technician', summary.tech],
                  [<CalendarClock key="t" className="h-4 w-4" />, 'Visit on', dateLabel(job.scheduled_at)],
                  [<Flag key="f" className="h-4 w-4" />, 'Priority', job.priority[0]!.toUpperCase() + job.priority.slice(1)],
                  [<CalendarPlus key="l" className="h-4 w-4" />, 'Logged on', `Today, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`],
                ].map(([icon, k, v]) => (
                  <div key={k as string} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-slate-500">{icon}{k}</dt>
                    <dd className={cn('truncate text-right font-medium', v ? 'text-slate-900' : 'text-slate-400')}>{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => navigate('/jobs')}>
                  Cancel
                </Button>
                <Hint className="flex-1" text="Saves the job with a new job number. The customer is sent a confirmation, and if you picked a technician they get a push notification.">
                  <Button type="submit" className="w-full" loading={saving} disabled={!hasCustomer}>
                    Create job
                  </Button>
                </Hint>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </form>
  );
}
