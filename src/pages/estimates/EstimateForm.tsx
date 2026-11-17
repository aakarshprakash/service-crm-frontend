import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Package, PencilLine, Trash2, Wrench, X } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { money, qty, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Customer, type CustomerProduct, type Estimate, type InventoryItem, type Job } from '@/lib/types';
import { Button, Card, Field, Input, PageHeader, QueryState, SearchInput, Select, Textarea, toast } from '@/components/ui';

interface Line {
  key: number;
  type: 'service' | 'part';
  item_id: number | null;
  /** For a part picked from the price list: its code and unit, shown under the name. */
  meta: string | null;
  description: string;
  quantity: string;
  unit_price: string;
}

interface CustomerView {
  customer: Customer & { products: CustomerProduct[] };
  jobs: Job[];
}

let nextKey = 1;
const lineTotal = (l: Line) => Math.round((parseFloat(l.quantity) || 0) * toMinor(l.unit_price));
const blank = (type: Line['type']): Line => ({ key: nextKey++, type, item_id: null, meta: null, description: '', quantity: '1', unit_price: '' });

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** New estimate (optionally started from a job or a customer), or changes to one that is still open. */
export default function EstimateForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = !!id;
  const existing = useQuery({ queryKey: ['estimate', id], queryFn: () => api.get<Envelope<Estimate>>(`/estimates/${id}`).then((r) => r.data), enabled: editing });
  // Started from a job page: the job brings its customer and product.
  const fromJob = useQuery({ queryKey: ['job', params.get('job_id')], queryFn: () => api.get<Envelope<Job>>(`/jobs/${params.get('job_id')}`).then((r) => r.data), enabled: !editing && !!params.get('job_id') });

  if (editing) {
    return (
      <QueryState loading={existing.isLoading} error={existing.error} onRetry={existing.refetch}>
        {existing.data && <Form key={existing.data.id} estimate={existing.data} />}
      </QueryState>
    );
  }
  if (params.get('job_id')) {
    return (
      <QueryState loading={fromJob.isLoading} error={fromJob.error} onRetry={fromJob.refetch}>
        {fromJob.data && <Form job={fromJob.data} />}
      </QueryState>
    );
  }
  return <Form customerId={params.get('customer_id') ? Number(params.get('customer_id')) : undefined} />;
}

function Form({ estimate, job, customerId: startCustomerId }: { estimate?: Estimate; job?: Job; customerId?: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: lookups } = useLookups();
  const gstRegistered = !!lookups?.billing.gst_registered;

  const [customerId, setCustomerId] = useState<number | null>(estimate?.customer_id ?? job?.customer_id ?? startCustomerId ?? null);
  const [search, setSearch] = useState('');
  const [jobId, setJobId] = useState(String(estimate?.job_id ?? job?.id ?? ''));
  const [productId, setProductId] = useState(String(estimate?.customer_product_id ?? job?.customer_product_id ?? ''));
  const [estimateDate, setEstimateDate] = useState(estimate?.estimate_date ?? today());
  const [validUntil, setValidUntil] = useState(estimate ? estimate.valid_until ?? '' : addDays(today(), 15));
  const [subject, setSubject] = useState(estimate?.subject ?? (job?.complaint_type?.name ? `${job.complaint_type.name}${unitLabel(job.customer_product) ? ` – ${unitLabel(job.customer_product)}` : ''}` : ''));
  const [notes, setNotes] = useState(estimate?.notes ?? '');
  const [terms, setTerms] = useState<string | null>(estimate ? estimate.terms ?? '' : null); // null: the company's standard terms
  const [discount, setDiscount] = useState(estimate?.discount_amount ? toMajor(estimate.discount_amount) : '');
  const [gstChoice, setGstChoice] = useState<boolean | null>(estimate ? estimate.is_gst : null);
  const [lines, setLines] = useState<Line[]>(() =>
    estimate?.items?.length
      ? estimate.items.map((i) => ({ key: nextKey++, type: i.type, item_id: i.item_id, meta: i.item ? `${i.item.code} · per ${i.item.unit_of_measure}` : null, description: i.description, quantity: String(i.quantity), unit_price: toMajor(i.unit_price) }))
      : [blank('service')],
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const customerQ = useQuery({ queryKey: ['customer', String(customerId)], queryFn: () => api.get<Envelope<CustomerView>>(`/customers/${customerId}`).then((r) => r.data), enabled: !!customerId });
  const customer = customerQ.data?.customer;
  const results = useQuery({ queryKey: ['customer-search', search], queryFn: () => api.get<Paginated<Customer>>('/customers', { search, per_page: 6 }), enabled: search.length >= 2 && !customerId });
  const openJobs = (customerQ.data?.jobs ?? []).filter((j) => !['completed', 'cancelled'].includes(j.status) || String(j.id) === jobId);

  // A job brings its product along, unless one was chosen by hand.
  useEffect(() => {
    const chosen = customerQ.data?.jobs.find((j) => String(j.id) === jobId);
    if (chosen?.customer_product_id && !productId) setProductId(String(chosen.customer_product_id));
  }, [jobId, customerQ.data, productId]);

  const services = lines.filter((l) => l.type === 'service').reduce((a, l) => a + lineTotal(l), 0);
  const parts = lines.filter((l) => l.type === 'part').reduce((a, l) => a + lineTotal(l), 0);
  const discountMinor = toMinor(discount);
  const total = Math.max(0, services + parts - discountMinor);
  const isGst = gstChoice ?? (gstRegistered && lookups?.billing.walkin_bills !== 'non_gst');

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const move = (index: number, by: number) =>
    setLines((ls) => {
      const next = [...ls];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });
  const addPart = (item: InventoryItem) => {
    setLines((ls) => [...ls, { key: nextKey++, type: 'part', item_id: item.id, meta: `${item.code} · per ${item.unit_of_measure}`, description: item.name, quantity: '1', unit_price: toMajor(item.unit_price) || '0' }]);
    setPicking(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error('Choose the customer first.');
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      customer_id: customerId,
      job_id: jobId ? Number(jobId) : null,
      customer_product_id: productId ? Number(productId) : null,
      estimate_date: estimateDate,
      valid_until: validUntil || null,
      subject: subject.trim() || null,
      notes: notes.trim() || null,
      ...(terms === null ? {} : { terms: terms.trim() || null }),
      ...(gstRegistered ? { is_gst: isGst } : {}),
      discount: discountMinor || 0,
      items: lines.map((l) => ({
        type: l.type,
        item_id: l.item_id,
        description: l.description.trim() || null,
        quantity: parseFloat(l.quantity) || 0,
        unit_price: l.unit_price === '' ? null : toMinor(l.unit_price),
      })),
    };
    try {
      const res = estimate ? await api.patch<Envelope<Estimate> & { message?: string }>(`/estimates/${estimate.id}`, body) : await api.post<Envelope<Estimate> & { message?: string }>('/estimates', body);
      toast.success(res.message ?? 'Estimate saved.');
      qc.invalidateQueries({ queryKey: ['estimates'] });
      qc.invalidateQueries({ queryKey: ['estimate', String(res.data.id)] });
      navigate(`/estimates/${res.data.id}`, { replace: true });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.');
      setError(apiErr);
      const shown = ['discount', 'valid_until', 'estimate_date', 'job_id', 'customer_product_id', 'is_gst', 'subject', 'items'];
      if (!Object.keys(apiErr.errors).some((k) => shown.includes(k) || k.startsWith('items.'))) toast.error(apiErr.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (n: string) => error?.field(n);
  const lineError = (i: number) => ['description', 'item_id', 'quantity', 'unit_price'].map((k) => f(`items.${i}.${k}`)).find(Boolean);
  const back = estimate ? `/estimates/${estimate.id}` : job ? `/jobs/${job.id}` : '/estimates';

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> {estimate ? estimate.estimate_number : job ? `Job ${job.crm_call_id}` : 'Estimates'}
          </Link>
        }
        title={estimate ? `Edit estimate ${estimate.estimate_number}` : 'New estimate'}
        description="Prices include GST, the same as on your invoices. Nothing is taken from stock and nothing is billed."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Customer">
            {customerId ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between rounded-lg bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{customer?.name ?? '…'}</p>
                    <p className="text-sm text-slate-500">{[customer?.phone, customer?.city].filter(Boolean).join(' · ')}</p>
                  </div>
                  {!estimate && !job && (
                    <Button variant="ghost" size="sm" onClick={() => { setCustomerId(null); setJobId(''); setProductId(''); }} aria-label="Change customer">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="For job" hint="Optional. Links the estimate to the job card." error={f('job_id')}>
                    <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                      <option value="">No job</option>
                      {openJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.crm_call_id} · {j.complaint_type?.name ?? 'Service'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Product" hint="Optional. Printed on the estimate." error={f('customer_product_id')}>
                    <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                      <option value="">Not for one product</option>
                      {customer?.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {unitLabel(p) || `Product ${p.id}`}{p.serial_no ? ` · SN ${p.serial_no}` : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search the customer by name or phone" delay={250} />
                {search.length >= 2 && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {results.data?.data.map((c) => (
                      <button type="button" key={c.id} onClick={() => { setCustomerId(c.id); setSearch(''); }} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-slate-500">{c.phone}</span>
                      </button>
                    ))}
                    {results.data && !results.data.data.length && (
                      <p className="px-3 py-4 text-center text-sm text-slate-500">
                        No customer matches “{search}”. <Link to="/customers?new=1" className="font-medium text-brand-700 hover:underline">Add the customer</Link> first.
                      </p>
                    )}
                  </div>
                )}
                {search.length < 2 && <p className="text-xs text-slate-500">Type at least two letters or digits.</p>}
              </div>
            )}
          </Card>

          <Card
            title="What is being estimated"
            padded={false}
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<Wrench className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, blank('service')])}>
                  Service
                </Button>
                <Button size="sm" variant="secondary" icon={<Package className="h-4 w-4" />} onClick={() => setPicking(true)}>
                  Part
                </Button>
              </div>
            }
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <Field label="Subject" hint="One line on what the estimate is for, printed above the items." error={f('subject')}>
                <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Compressor replacement – LG 1.5T split AC" />
              </Field>
            </div>
            {f('items') && <p className="px-5 pt-3 text-xs text-red-600">{f('items')}</p>}
            {picking && <PartPicker onPick={addPart} onCustom={() => { setLines((ls) => [...ls, blank('part')]); setPicking(false); }} onClose={() => setPicking(false)} />}
            {!lines.length && <p className="px-5 py-8 text-center text-sm text-slate-500">Add a service or a part.</p>}
            <div className="hidden grid-cols-12 gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span className="col-span-6">Item</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-2">Rate</span>
              <span className="col-span-2 text-right">Amount</span>
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <div key={l.key} className="grid gap-3 px-5 py-4 sm:grid-cols-12 sm:items-start">
                  <div className="sm:col-span-6">
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500', l.type === 'part' ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700')} title={l.type === 'part' ? 'Part' : 'Service'}>
                        {l.type === 'part' ? <Package className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Input placeholder={l.type === 'part' ? 'Part name' : 'Service, e.g. Gas charging'} aria-label={l.type === 'part' ? 'Part description' : 'Service description'} value={l.description} maxLength={300} onChange={(e) => update(l.key, { description: e.target.value })} />
                        {l.meta && <p className="mt-1 text-xs text-slate-500">{l.meta}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:col-span-6 sm:grid-cols-6">
                    <Input className="sm:col-span-2" inputMode="decimal" aria-label="Quantity" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                    <Input className="sm:col-span-2" inputMode="decimal" aria-label="Rate" placeholder="Rate" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value.replace(/[^\d.]/g, '') })} />
                    <div className="flex items-center justify-end gap-0.5 sm:col-span-2">
                      <span className="mr-1 text-sm font-medium tabular-nums">{money(lineTotal(l))}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:col-span-12">
                    <p className="text-xs text-red-600">{lineError(i)}</p>
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" aria-label="Remove line" onClick={() => remove(l.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Notes and terms">
            <div className="space-y-4">
              <Field label="Note to the customer" hint="Optional. Printed on the estimate.">
                <Textarea rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. The outdoor unit needs to be brought down for this work." />
              </Field>
              {terms === null ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-sm text-slate-600">Your standard terms are printed at the bottom.</p>
                  <Button size="sm" variant="ghost" icon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setTerms('')}>
                    Write different terms
                  </Button>
                </div>
              ) : (
                <Field label="Terms" hint="Printed at the bottom. One per line." error={f('terms')}>
                  <Textarea rows={4} value={terms} maxLength={3000} onChange={(e) => setTerms(e.target.value)} />
                </Field>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Estimate">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" error={f('estimate_date')}>
                  <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
                </Field>
                <Field label="Valid until" error={f('valid_until')}>
                  <Input type="date" value={validUntil} min={estimateDate} onChange={(e) => setValidUntil(e.target.value)} />
                </Field>
              </div>
              {gstRegistered && (
                <Field label="Type" error={f('is_gst')} hint={isGst ? 'The estimate shows the GST split out of each price.' : 'No GST is shown. The total stays the same.'}>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="radiogroup" aria-label="Estimate type">
                    {([[true, 'With GST'], [false, 'Without GST']] as const).map(([value, text]) => (
                      <button key={text} type="button" role="radio" aria-checked={isGst === value} onClick={() => setGstChoice(value)} className={cn('rounded-md px-2 py-1.5 text-sm font-medium transition', isGst === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                        {text}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Services</dt><dd className="tabular-nums">{money(services)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Parts</dt><dd className="tabular-nums">{money(parts)}</dd></div>
              </dl>
              <Field label="Discount" error={f('discount')}>
                <Input inputMode="decimal" value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-slate-700">Estimated total</span>
                <span className="text-xl font-semibold tabular-nums text-slate-900">{money(total)}</span>
              </div>
              <Button type="submit" className="w-full" loading={saving} disabled={!lines.length || !customerId}>
                {estimate ? 'Save changes' : 'Save estimate'}
              </Button>
              <p className="text-center text-xs text-slate-500">Saved as a draft. You send it to the customer from the next page.</p>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}

/** Parts from the price list. Out-of-stock parts can be estimated too: nothing is taken from stock. */
function PartPicker({ onPick, onCustom, onClose }: { onPick: (item: InventoryItem) => void; onCustom: () => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const items = useQuery({ queryKey: ['estimate-items', search], queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, active: 1, per_page: 8 }) });
  return (
    <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search part by code or name" delay={250} className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close part search">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {items.data?.data.map((it) => {
          const stock = Number(it.stock_total ?? 0);
          return (
            <button type="button" key={it.id} onClick={() => onPick(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                <span className="text-xs text-slate-500">
                  {it.code} · {money(it.unit_price)}
                </span>
              </span>
              <span className={cn('shrink-0 text-xs', stock > 0 ? 'text-slate-500' : 'text-amber-700')}>{stock > 0 ? `${qty(stock)} ${it.unit_of_measure} in stock` : 'To be ordered'}</span>
            </button>
          );
        })}
        {items.data && !items.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No parts found.</p>}
      </div>
      <button type="button" onClick={onCustom} className="text-sm font-medium text-brand-700 hover:underline">
        The part isn’t in the list: type it in
      </button>
    </div>
  );
}
