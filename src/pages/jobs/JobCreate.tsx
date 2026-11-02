import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, MapPin, Phone, Plus, User, UserPlus, X } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useLookups, useStaffOptions } from '@/lib/hooks';
import { fromLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Customer, type CustomerProduct, type Job } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Combobox, Field, Input, PageHeader, SearchInput, Select, toast } from '@/components/ui';
import { RichTextField } from '@/components/RichText';
import { CustomerForm, ProductCategoryField, ProductFields, emptyProduct, productPayload, unitDraft, type CustomerDraft, type ProductDraft, emptyCustomer } from '@/pages/customers/CustomerForm';
import { Hint } from '@/components/tutorial';

/** The step's number, or a tick once it is filled in. */
function StepNumber({ n, done, muted }: { n: number; done?: boolean; muted?: boolean }) {
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-emerald-500 text-white' : muted ? 'bg-slate-200 text-slate-500' : 'bg-brand-600 text-white')}>
      {done ? <Check className="h-4 w-4" /> : n}
    </span>
  );
}

/** Section heading: the step number, its name, and the question it answers. */
function Step({ n, title, question, done }: { n: number; title: string; question: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <StepNumber n={n} done={done} />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs font-normal text-slate-500">{question}</p>
      </div>
    </div>
  );
}

/** A step that opens once the customer is chosen. It still says what is in it, so nothing looks missing. */
function UpcomingStep({ n, title, contents }: { n: number; title: string; contents: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-4">
      <StepNumber n={n} muted />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-600">{title}</h2>
        <p className="text-xs text-slate-500">{contents}</p>
      </div>
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
    product_category: '',
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
  // The unit this job is for: one of the customer's saved units, or a new one (unitId null). All its fields are optional.
  const [unitId, setUnitId] = useState<number | null>(null);
  const [product, setProduct] = useState<ProductDraft>({ ...emptyProduct });
  const [productError, setProductError] = useState<ApiError | null>(null);
  // Keeps a retry after a failed job save from creating the product twice.
  const createdUnit = useRef<{ id: number; saved: string } | null>(null);

  // Preselect a customer when coming from the customer page.
  const preset = params.get('customer_id');
  useEffect(() => {
    if (preset) api.get<Envelope<{ customer: Customer }>>(`/customers/${preset}`).then((r) => setCustomer(r.data.customer)).catch(() => undefined);
  }, [preset]);
  const units = customer?.products ?? [];
  const pickUnit = (u: CustomerProduct | null) => {
    setUnitId(u?.id ?? null);
    setProduct(u ? unitDraft(u) : { ...emptyProduct });
  };
  // A customer with a single unit almost always calls about that one.
  useEffect(() => {
    if (units.length === 1) pickUnit(units[0]!);
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

  const productFilled = Object.values(product).some(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setProductError(null);
    try {
      if (!job.scheduled_at) {
        setError(new ApiError(422, 'Choose the visit date and time.', { scheduled_at: ['Choose when the technician should visit.'] }));
        return;
      }
      let customerId = customer?.id;
      let productId: number | null = null;

      // Existing customer: update the chosen unit if it was changed, or record a new one.
      if (customer && (unitId || productFilled)) {
        const draft = JSON.stringify(product);
        const known = unitId ? { id: unitId, saved: JSON.stringify(unitDraft(units.find((u) => u.id === unitId))) } : createdUnit.current;
        try {
          if (!known) {
            const added = await api.post<Envelope<CustomerProduct>>(`/customers/${customer.id}/products`, productPayload(product));
            createdUnit.current = { id: added.data.id, saved: draft };
            productId = added.data.id;
          } else {
            if (known.saved !== draft) await api.patch(`/customers/${customer.id}/products/${known.id}`, productPayload(product));
            if (!unitId) createdUnit.current = { id: known.id, saved: draft };
            productId = known.id;
          }
        } catch (err) {
          setProductError(err as ApiError);
          if (err instanceof ApiError && !Object.keys(err.errors).length) toast.error(err.message);
          return;
        }
      }

      if (!customerId && newCustomer) {
        const { product: _unit, ...rest } = newCustomer;
        const created = await api.post<Envelope<Customer & { products: CustomerProduct[] }>>('/customers', {
          ...rest,
          branch_id: rest.branch_id || null,
          products: productFilled ? [productPayload(product)] : [],
        });
        customerId = created.data.id;
        productId = created.data.products?.[0]?.id ?? null;
      }
      if (!customerId) {
        setError(new ApiError(422, 'Select or add a customer.', { customer_id: ['Select or add a customer.'] }));
        return;
      }
      const res = await api.post<Envelope<Job> & { meta?: { auto_assign?: { assigned: boolean } } }>('/jobs', {
        ...job,
        customer_id: customerId,
        customer_product_id: productId,
        complaint_type_id: job.complaint_type_id || null,
        complaint_summary_id: job.complaint_summary_id || null,
        complaint_details: job.complaint_details || null,
        product_category: job.product_category.trim() || null,
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
    pickUnit(null);
    setProductError(null);
    createdUnit.current = null;
  };

  const hasCustomer = !!customer || !!newCustomer;
  const customerDone = !!customer || !!(newCustomer?.name.trim() && newCustomer.phone.trim());
  const productDone = productFilled || !!job.product_category.trim();
  const chosenUnit = units.find((u) => u.id === unitId);
  const unitChanged = !!chosenUnit && JSON.stringify(product) !== JSON.stringify(unitDraft(chosenUnit));
  const techName = autoAssign ? 'Auto-assign' : techOptions.find((o) => o.value === job.assigned_technician_id)?.label ?? null;
  const joined = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;
  // The panel beside the form: each step, what has been entered, and a jump back to it.
  const progress = [
    { n: 1, title: 'Customer', done: customerDone, value: customer?.name ?? (newCustomer?.name || null), empty: 'Required' },
    {
      n: 2,
      title: 'Product',
      done: productDone,
      value: joined(lookups?.brands.find((b) => String(b.id) === product.brand_id)?.name, product.model_no.trim(), job.product_category.trim()),
      empty: 'Optional',
    },
    {
      n: 3,
      title: 'Complaint',
      done: !!job.complaint_type_id,
      value: joined(typeOptions.find((o) => o.value === job.complaint_type_id)?.label, summaryOptions.find((o) => o.value === job.complaint_summary_id)?.label),
      empty: 'Optional',
    },
    {
      n: 4,
      title: 'Visit',
      done: !!techName,
      value: joined(dateLabel(job.scheduled_at), techName ?? 'Assign later', `${job.priority[0]!.toUpperCase()}${job.priority.slice(1)} priority`),
      empty: 'Required',
    },
  ];
  const jumpTo = (n: number) => document.getElementById(`step-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to="/jobs" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Jobs
          </Link>
        }
        title="New job card"
        description="Log the customer’s complaint and send a technician."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* 1. Customer */}
          <section id="step-1" className="scroll-mt-20">
            <Card title={<Step n={1} title="Customer" question="Who is calling?" done={customerDone} />}>
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
                  <CustomerForm value={newCustomer} onChange={setNewCustomer} error={error} minimal />
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
          </section>

          {!hasCustomer ? (
            <>
              <UpcomingStep n={2} title="Product" contents="Brand, type, model, serial no., warranty and dealer" />
              <UpcomingStep n={3} title="Complaint" contents="Service type, breakdown and job summary" />
              <UpcomingStep n={4} title="Schedule & assign" contents="Visit time, technician, priority and call type" />
            </>
          ) : (
            <>
              {/* 2. Product */}
              <section id="step-2" className="scroll-mt-20">
                <Card title={<Step n={2} title="Product" question="Which unit is it? Fill in what you know; the technician can add the rest." done={productDone} />}>
                  <div className="space-y-5">
                    {units.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-500">{customer?.name}’s units</p>
                        <div className="flex flex-wrap gap-2">
                          {units.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              aria-pressed={unitId === u.id}
                              onClick={() => pickUnit(u)}
                              className={cn(
                                'rounded-lg border px-3 py-1.5 text-left text-sm font-medium transition',
                                unitId === u.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300',
                              )}
                            >
                              {unitLabel(u)}
                              {u.serial_no && <span className={cn('block text-xs font-normal', unitId === u.id ? 'text-brand-100' : 'text-slate-500')}>S/N {u.serial_no}</span>}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-pressed={unitId === null}
                            onClick={() => pickUnit(null)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-sm font-medium transition',
                              unitId === null ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600 hover:border-brand-300',
                            )}
                          >
                            <Plus className="h-4 w-4" /> A different unit
                          </button>
                        </div>
                        {unitChanged && <p className="mt-2 text-xs font-medium text-amber-700">Your changes will be saved to this unit when you create the job.</p>}
                      </div>
                    )}
                    <ProductFields
                      value={product}
                      onChange={setProduct}
                      error={newCustomer ? error : productError}
                      prefix={newCustomer ? 'products.0.' : ''}
                      title={null}
                      extra={
                        <ProductCategoryField value={job.product_category} onChange={(v) => set('product_category', v)} error={f('product_category')} />
                      }
                    />
                  </div>
                </Card>
              </section>

              {/* 3. Complaint */}
              <section id="step-3" className="scroll-mt-20">
                <Card title={<Step n={3} title="Complaint" question="What is wrong?" done={!!job.complaint_type_id} />}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <Field label="Job summary" className="sm:col-span-2" error={f('complaint_details')}>
                      <RichTextField value={job.complaint_details} onChange={(html) => set('complaint_details', html)} placeholder="What does the customer report? Any error codes, access notes or timing preferences…" invalid={!!f('complaint_details')} />
                    </Field>
                  </div>
                </Card>
              </section>

              {/* 4. Schedule & assign */}
              <section id="step-4" className="scroll-mt-20">
                <Card title={<Step n={4} title="Schedule & assign" question="When, and who should attend?" done={!!techName} />}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Visit date & time" required error={f('scheduled_at')} hint={!f('scheduled_at') && job.scheduled_at ? dateLabel(job.scheduled_at) ?? undefined : undefined}>
                      <Input type="datetime-local" required value={job.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} invalid={!!f('scheduled_at')} />
                    </Field>
                    <div className="space-y-2">
                      <Field label="Technician" error={f('assigned_technician_id')} hint={autoAssign ? 'Chosen automatically when you save.' : undefined}>
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
                      <Hint align="left" block text="Picks the technician linked to this job’s service location who has the fewest open jobs, skipping anyone at the limit set in Settings. Without a location, technicians of the job’s branch are used.">
                        <Checkbox label="Auto-assign a technician" checked={autoAssign} onChange={setAutoAssign} />
                      </Hint>
                    </div>
                    <Field label="Priority">
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
                    <Field label="Call type">
                      <Pills value={job.call_type as 'crm_call' | 'walk_in' | 'referral'} onChange={(v) => set('call_type', v)} options={[{ value: 'crm_call', label: 'CRM call' }, { value: 'walk_in', label: 'Walk-in' }, { value: 'referral', label: 'Referral' }]} />
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
              </section>
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card title="Job card summary">
            <ol className="space-y-1">
              {progress.map((p) => (
                <li key={p.n}>
                  <button type="button" disabled={!hasCustomer && p.n > 1} onClick={() => jumpTo(p.n)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition enabled:hover:bg-slate-50">
                    <StepNumber n={p.n} done={p.done} muted={!p.done} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{p.title}</span>
                      <span className={cn('block break-words text-xs', p.value ? 'text-slate-600' : p.empty === 'Required' ? 'font-medium text-amber-700' : 'text-slate-400')}>{p.value ?? p.empty}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" className="flex-1" onClick={() => navigate('/jobs')}>
                Cancel
              </Button>
              <Hint className="flex-1" text="Saves the job with a new job number. The customer is sent a confirmation, and if you picked a technician they get a push notification.">
                <Button type="submit" className="w-full" loading={saving} disabled={!hasCustomer}>
                  Create job
                </Button>
              </Hint>
            </div>
            {!hasCustomer && <p className="mt-2 text-center text-xs text-slate-500">Choose or add a customer to continue.</p>}
          </Card>
        </div>
      </div>
    </form>
  );
}
