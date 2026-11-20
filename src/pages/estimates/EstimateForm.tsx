import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, PencilLine, Plus, Search, X } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { money, qty, toMajor, toMinor, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Customer, type CustomerProduct, type Estimate, type InventoryItem, type Job } from '@/lib/types';
import { Button, Card, Checkbox, Field, Input, PageHeader, QueryState, SearchInput, Select, Textarea, toast } from '@/components/ui';
import { estimateTotals, lineTaxes, sharedRate, UNITS, type Totals } from './estimateParts';
import { blankLine as blank, lineTotal, LineEditor, newKey, noEnterSubmit, type Line } from './LineEditor';
import { QuickAddCustomer } from './QuickAddCustomer';

interface CustomerView {
  customer: Customer & { products: CustomerProduct[] };
  jobs: Job[];
}

const VALID_FOR = [7, 15, 30];
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

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
  const billing = lookups?.billing;
  const gstRegistered = !!billing?.gst_registered;

  const [customerId, setCustomerId] = useState<number | null>(estimate?.customer_id ?? job?.customer_id ?? startCustomerId ?? null);
  const [jobId, setJobId] = useState(String(estimate?.job_id ?? job?.id ?? ''));
  const [productId, setProductId] = useState(String(estimate?.customer_product_id ?? job?.customer_product_id ?? ''));
  const [number, setNumber] = useState(estimate?.estimate_number ?? ''); // blank on a new estimate: numbered automatically
  const [estimateDate, setEstimateDate] = useState(estimate?.estimate_date ?? today());
  const [validUntil, setValidUntil] = useState(estimate ? estimate.valid_until ?? '' : addDays(today(), 15));
  const [subject, setSubject] = useState(estimate?.subject ?? (job?.complaint_type?.name ? `${job.complaint_type.name}${unitLabel(job.customer_product) ? ` – ${unitLabel(job.customer_product)}` : ''}` : ''));
  const [notes, setNotes] = useState(estimate?.notes ?? '');
  // Whether this estimate prints the company signature and stamp; a new one follows Settings → signature.
  const [showSignature, setShowSignature] = useState(estimate ? estimate.show_signature : (lookups?.signature?.on_estimates ?? true));
  const [terms, setTerms] = useState<string | null>(estimate ? estimate.terms ?? '' : null); // null: the company's standard terms
  const [discount, setDiscount] = useState(estimate?.discount_amount ? toMajor(estimate.discount_amount) : '');
  const [gstChoice, setGstChoice] = useState<boolean | null>(estimate ? estimate.is_gst : null); // null: as Settings → GST says
  const [customerGstin, setCustomerGstin] = useState<string | null>(estimate ? estimate.customer_gstin ?? '' : null); // null: not typed yet
  const [lines, setLines] = useState<Line[]>(() =>
    estimate?.items?.length
      ? estimate.items.map((i) => ({
          key: newKey(), type: i.type, item_id: i.item_id, code: i.item?.code ?? null, itemRate: null, description: i.description, details: i.details ?? '',
          unit: i.unit ?? i.item?.unit_of_measure ?? (i.type === 'part' ? 'Nos' : ''), quantity: String(i.quantity), unit_price: toMajor(i.unit_price), gst_rate: i.gst_rate ?? null,
        }))
      : [blank('part')],
  );
  const [picking, setPicking] = useState(false);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const customerQ = useQuery({ queryKey: ['customer', String(customerId)], queryFn: () => api.get<Envelope<CustomerView>>(`/customers/${customerId}`).then((r) => r.data), enabled: !!customerId });
  const customer = customerQ.data?.customer;
  const openJobs = (customerQ.data?.jobs ?? []).filter((j) => !['completed', 'cancelled'].includes(j.status) || String(j.id) === jobId);

  // A line just added gets the cursor in its name box (the table and the phone cards both exist; focus the visible one).
  useEffect(() => {
    if (focusKey === null) return;
    const frame = requestAnimationFrame(() => {
      const box = [...document.querySelectorAll<HTMLInputElement>(`[data-line-name="${focusKey}"]`)].find((el) => el.offsetParent !== null);
      box?.focus();
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      box?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey]);

  // A job brings its product along, unless one was chosen by hand.
  useEffect(() => {
    const chosen = customerQ.data?.jobs.find((j) => String(j.id) === jobId);
    if (chosen?.customer_product_id && !productId) setProductId(String(chosen.customer_product_id));
  }, [jobId, customerQ.data, productId]);

  // Settings → GST decides how a new estimate starts; a saved GST estimate keeps the way it was made.
  const isGst = gstRegistered && (gstChoice ?? billing?.estimates !== 'non_gst');
  const inclusive = estimate?.is_gst ? estimate.prices_include_gst : billing?.estimate_prices === 'include_gst';
  const rateOf = (l: Line) => l.gst_rate ?? (l.type === 'part' ? l.itemRate ?? billing?.part_rate ?? 18 : billing?.service_rate ?? 18);
  const gstin = (customerGstin ?? customer?.gstin ?? '').trim().toUpperCase();
  const discountMinor = toMinor(discount);
  const totals = estimateTotals(lines.map((l) => ({ gross: lineTotal(l), rate: rateOf(l) })), discountMinor, { on: isGst, inclusive });
  const rate = sharedRate(lines.map(rateOf));
  const taxes = lineTaxes(lines.map((l) => ({ gross: lineTotal(l), rate: rateOf(l) })), discountMinor, { on: isGst, inclusive });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  /** A new blank line, with the cursor already in its name box so the user can just type. */
  const addLine = (type: Line['type']) => {
    const line = blank(type);
    setLines((ls) => [...ls, line]);
    setPicking(false);
    setFocusKey(line.key);
  };
  const duplicate = (key: number) =>
    setLines((ls) => {
      const at = ls.findIndex((l) => l.key === key);
      return at < 0 ? ls : [...ls.slice(0, at + 1), { ...ls[at]!, key: newKey() }, ...ls.slice(at + 1)];
    });
  const move = (index: number, by: -1 | 1) =>
    setLines((ls) => {
      const to = index + by;
      if (to < 0 || to >= ls.length) return ls;
      const next = [...ls];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  const addPart = (item: InventoryItem) => {
    const own = item.gst_rate !== null && item.gst_rate !== undefined && item.gst_rate !== '' ? Number(item.gst_rate) : null;
    setLines((ls) => [...ls, { ...blank('part'), item_id: item.id, code: item.code, itemRate: own, description: item.name, unit: item.unit_of_measure, unit_price: toMajor(item.unit_price) || '0' }]);
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
      estimate_number: number.trim() || null,
      job_id: jobId ? Number(jobId) : null,
      customer_product_id: productId ? Number(productId) : null,
      estimate_date: estimateDate,
      valid_until: validUntil || null,
      subject: subject.trim() || null,
      notes: notes.trim() || null,
      ...(terms === null ? {} : { terms: terms.trim() || null }),
      ...(gstRegistered ? { is_gst: isGst, prices_include_gst: inclusive } : {}),
      ...(isGst ? { customer_gstin: gstin || null } : {}),
      show_signature: showSignature,
      discount: discountMinor || 0,
      items: lines.map((l) => ({
        type: l.type,
        item_id: l.item_id,
        description: l.description.trim() || null,
        details: l.details.trim() || null,
        unit: l.unit.trim() || null,
        quantity: parseFloat(l.quantity) || 0,
        unit_price: l.unit_price === '' ? null : toMinor(l.unit_price),
        gst_rate: isGst ? rateOf(l) : l.gst_rate,
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
      const shown = ['estimate_number', 'discount', 'valid_until', 'estimate_date', 'job_id', 'customer_product_id', 'is_gst', 'customer_gstin', 'subject', 'terms', 'items'];
      if (!Object.keys(apiErr.errors).some((k) => shown.includes(k) || k.startsWith('items.'))) toast.error(apiErr.message);
      else toast.error('Some details need a look. They are marked in red.');
    } finally {
      setSaving(false);
    }
  };

  const f = (n: string) => error?.field(n);
  const lineError = (i: number) => ['description', 'details', 'item_id', 'quantity', 'unit', 'unit_price', 'gst_rate'].map((k) => f(`items.${i}.${k}`)).find(Boolean);
  const back = estimate ? `/estimates/${estimate.id}` : job ? `/jobs/${job.id}` : '/estimates';
  const rateLabel = isGst ? (inclusive ? 'Unit price incl. GST' : 'Unit price') : 'Unit price';

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> {estimate ? estimate.estimate_number : job ? `Job ${job.crm_call_id}` : 'Estimates'}
          </Link>
        }
        title={estimate ? `Edit estimate ${estimate.estimate_number}` : 'New estimate'}
        description="A quotation for the customer. Nothing is taken from stock and nothing is billed."
      />

      <div className="space-y-6">
        <Card title="Estimate details">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <CustomerPicker
                customer={customer}
                customerId={customerId}
                locked={!!estimate || !!job}
                error={f('customer_id')}
                onPick={(c) => setCustomerId(c)}
                onClear={() => { setCustomerId(null); setJobId(''); setProductId(''); setCustomerGstin(null); }}
              />
            </div>
            <Field label="Estimate no." hint={estimate ? 'Changing it changes the number printed on the estimate.' : 'Leave blank to number it automatically.'} error={f('estimate_number')}>
              <Input value={number} maxLength={40} placeholder={estimate ? undefined : 'Automatic'} invalid={!!f('estimate_number')} spellCheck={false} onChange={(e) => setNumber(e.target.value.replace(/\s/g, ''))} />
            </Field>
            <Field label="Estimate date" error={f('estimate_date')}>
              <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
            </Field>
            <Field label="Valid until" error={f('valid_until')}>
              <Input type="date" value={validUntil} min={estimateDate} onChange={(e) => setValidUntil(e.target.value)} />
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                {VALID_FOR.map((d) => (
                  <button key={d} type="button" onClick={() => setValidUntil(addDays(estimateDate, d))} className={cn('rounded-full px-2 py-0.5 font-medium ring-1 ring-inset transition', validUntil === addDays(estimateDate, d) ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')}>
                    {d} days
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Reference / job" hint="Optional. Links the estimate to the job card." error={f('job_id')}>
              <Select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!customerId}>
                <option value="">No job</option>
                {openJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.crm_call_id} · {j.complaint_type?.name ?? 'Service'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Tax"
              error={f('is_gst')}
              hint={
                !gstRegistered ? undefined : isGst ? (
                  <>
                    {inclusive ? 'Unit prices include GST' : 'GST is added on top of the unit prices'}, as set in{' '}
                    <Link to="/settings?tab=invoicing" className="font-medium text-brand-700 hover:underline">Settings → GST</Link>.
                  </>
                ) : (
                  'No GST is shown. The total is what the customer pays.'
                )
              }
            >
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="radiogroup" aria-label="Tax">
                {([[true, 'GST'], [false, 'No GST']] as const).map(([value, text]) => (
                  <button key={text} type="button" role="radio" aria-checked={isGst === value} disabled={value && !gstRegistered} onClick={() => setGstChoice(value)} className={cn('rounded-md py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40', isGst === value ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>
                    {text}
                  </button>
                ))}
              </div>
              {!gstRegistered && (
                <p className="mt-1 text-xs text-slate-500">
                  To give GST estimates, add your GSTIN in <Link to="/settings" className="font-medium text-brand-700 hover:underline">Settings → Company</Link>.
                </p>
              )}
            </Field>
            {customer?.products && customer.products.length > 0 && (
              <Field label="Product" hint="Optional. Printed on the estimate." error={f('customer_product_id')}>
                <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">Not for one product</option>
                  {customer.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {unitLabel(p) || `Product ${p.id}`}{p.serial_no ? ` · SN ${p.serial_no}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {isGst && (
              <Field label="Customer GSTIN" hint="Optional, for a registered business. Another state’s GSTIN makes it IGST." error={f('customer_gstin') ?? (gstin.length === 15 && !GSTIN_PATTERN.test(gstin) ? 'This doesn’t look like a GSTIN.' : undefined)}>
                <Input value={customerGstin ?? customer?.gstin ?? ''} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))} placeholder="15-character GSTIN" spellCheck={false} className="uppercase tracking-wide" />
              </Field>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Subject" hint="One line on what the estimate is for, printed above the items." error={f('subject')}>
                <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Supply and installation of new air conditioner" />
              </Field>
            </div>
          </div>
          {isGst && billing?.gstin_valid === false && (
            <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your company GSTIN in Settings is not a valid GSTIN, and it is printed on GST estimates. <Link to="/settings" className="font-medium underline">Correct it in Settings</Link> before sending this.
              </span>
            </p>
          )}
        </Card>

        <Card
          title="Items / services"
          padded={false}
          actions={lines.length > 0 && <span className="text-xs font-normal text-slate-500">{lines.length} {lines.length === 1 ? 'item' : 'items'}</span>}
        >
          <div onKeyDown={noEnterSubmit}>
            {f('items') && <p className="px-5 pt-3 text-xs text-red-600">{f('items')}</p>}
            <datalist id="estimate-units">
              {UNITS.map((u) => <option key={u} value={u} />)}
            </datalist>
            {lines.length > 0 ? (
              <LineEditor
                lines={lines}
                isGst={isGst}
                inclusive={inclusive}
                rateLabel={rateLabel}
                rateOf={rateOf}
                taxes={taxes}
                errorOf={lineError}
                invalid={(i, k) => !!f(`items.${i}.${k}`)}
                onChange={update}
                onRemove={remove}
                onDuplicate={duplicate}
                onMove={move}
              />
            ) : (
              <div className="px-4 py-10 text-center sm:px-5">
                <p className="text-sm font-medium text-slate-900">Nothing on this estimate yet</p>
                <p className="mt-1 text-sm text-slate-500">Add the services you will do and the parts or equipment you will supply.</p>
              </div>
            )}
            {picking && <PartPicker onPick={addPart} onCustom={() => addLine('part')} onClose={() => setPicking(false)} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addLine('part')}>
              Add item
            </Button>
            <button type="button" onClick={() => setPicking(true)} disabled={picking} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700 disabled:opacity-50">
              <Search className="h-3.5 w-3.5" /> Browse price list
            </button>
            {lines.length > 0 && (
              <p className="ml-auto text-sm text-slate-500">
                Subtotal <span className="font-semibold tabular-nums text-slate-900">{money(totals.gross)}</span>
              </p>
            )}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card title="Notes">
            <div className="space-y-4">
              <Field label="Note to the customer" hint="Optional. Printed on the estimate.">
                <Textarea rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Site visit and final measurements are required before the work." />
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
              <div className="border-t border-slate-100 pt-4">
                <Checkbox
                  label="Print signature & stamp"
                  checked={showSignature}
                  onChange={setShowSignature}
                  description={
                    lookups?.signature?.has_signature || lookups?.signature?.has_stamp ? (
                      'Your signature and stamp appear above the signatory line.'
                    ) : (
                      <>No signature or stamp uploaded yet. <Link to="/settings?tab=invoicing" className="font-medium text-brand-700 hover:underline">Add them in Settings</Link>.</>
                    )
                  }
                />
              </div>
            </div>
          </Card>
          <TotalsPanel totals={totals} isGst={isGst} inclusive={inclusive} rate={rate} discount={discount} onDiscount={setDiscount} discountError={f('discount')} />
        </div>
      </div>

      {/* One save bar, always in reach. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur sm:bottom-4 sm:mx-0 sm:rounded-xl sm:border">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{isGst && !inclusive ? 'Total including GST' : 'Total'} · saved as a draft</p>
          <p className="truncate text-lg font-semibold tabular-nums text-slate-900">{money(totals.total)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate(back)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!lines.length || !customerId}>
            {estimate ? 'Save changes' : 'Save estimate'}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Search the customer by name or phone, or add a new one on the spot; once chosen, a card with a button to change it. */
function CustomerPicker({ customer, customerId, locked, error, onPick, onClear }: { customer?: Customer; customerId: number | null; locked: boolean; error?: string; onPick: (id: number) => void; onClear: () => void }) {
  const { can } = useAuth();
  const canAdd = can('customers.manage');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const results = useQuery({ queryKey: ['customer-search', search], queryFn: () => api.get<Paginated<Customer>>('/customers', { search, per_page: 6 }), enabled: search.length >= 2 && !customerId });
  if (customerId) {
    return (
      <Field label="Customer" error={error}>
        <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
          <span className="min-w-0 truncate text-sm">
            <span className="font-medium text-slate-900">{customer?.name ?? '…'}</span>
            {customer?.phone && <span className="text-slate-500"> · {customer.phone}</span>}
          </span>
          {!locked && (
            <button type="button" onClick={onClear} className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Change customer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Field>
    );
  }
  const label = (
    <span className="flex items-center justify-between gap-2">
      Customer
      {canAdd && (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          <Plus className="h-3.5 w-3.5" /> New customer
        </button>
      )}
    </span>
  );
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or phone" delay={250} />
        {search.length >= 2 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
            {results.data?.data.map((c) => (
              <button type="button" key={c.id} onClick={() => { onPick(c.id); setSearch(''); }} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                <span className="truncate text-sm font-medium">{c.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>
              </button>
            ))}
            {results.data && !results.data.data.length && <p className="px-3 py-3 text-sm text-slate-500">No customer matches “{search}”.</p>}
            {canAdd && results.data && (
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-brand-50">
                <Plus className="h-4 w-4 shrink-0" /> Add “{search}” as a new customer
              </button>
            )}
            {!canAdd && results.data && !results.data.data.length && <p className="px-3 py-3 text-xs text-slate-500">Ask someone who manages customers to add them first.</p>}
          </div>
        )}
      </div>
      {adding && (
        <QuickAddCustomer
          typed={search}
          onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); setSearch(''); onPick(id); }}
        />
      )}
    </Field>
  );
}

/** Subtotal, discount, GST and the total, in the order the PDF prints them. */
function TotalsPanel({ totals: t, isGst, inclusive, rate, discount, onDiscount, discountError }: { totals: Totals; isGst: boolean; inclusive: boolean; rate: number | null; discount: string; onDiscount: (v: string) => void; discountError?: string }) {
  const taxName = `GST${rate !== null ? ` @ ${rate}%` : ''}`;
  return (
    <section className="self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <dl className="space-y-2.5 px-5 py-4 text-sm">
        <Row k="Subtotal" v={money(t.gross)} />
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">Discount</dt>
          <dd className="flex items-center gap-1">
            <span className="text-slate-400">−</span>
            <Input aria-label="Discount" inputMode="decimal" value={discount} placeholder="0" invalid={!!discountError} onChange={(e) => onDiscount(e.target.value.replace(/[^\d.]/g, ''))} className="h-8 w-28 text-right tabular-nums" />
          </dd>
        </div>
        {discountError && <p className="text-right text-xs text-red-600">{discountError}</p>}
        {isGst && !inclusive && (
          <>
            {t.discount > 0 && <Row k="Taxable value" v={money(t.taxable)} muted />}
            <Row k={taxName} v={money(t.tax)} />
          </>
        )}
        {isGst && inclusive && <Row k={`Includes ${taxName}`} v={money(t.tax)} muted />}
      </dl>
      <div className="flex items-baseline justify-between gap-3 bg-navy-900 px-5 py-4 text-white">
        <span className="text-sm font-medium">{isGst && !inclusive ? 'Total including GST' : 'Total'}</span>
        <span className="text-2xl font-semibold tabular-nums">{money(t.total)}</span>
      </div>
    </section>
  );
}

function Row({ k, v, muted }: { k: ReactNode; v: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', muted ? 'text-slate-500' : 'text-slate-700')}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

/** Parts from the price list. Out-of-stock parts can be estimated too: nothing is taken from stock. */
function PartPicker({ onPick, onCustom, onClose }: { onPick: (item: InventoryItem) => void; onCustom: () => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const items = useQuery({ queryKey: ['estimate-items', search], queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, active: 1, per_page: 8 }) });
  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
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
      <button type="button" onClick={onCustom} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <Plus className="h-3.5 w-3.5" /> The part isn’t in the list: type it in
      </button>
    </div>
  );
}
