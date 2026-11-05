import { useId, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type ApiError, type Envelope } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import type { CustomerProduct } from '@/lib/types';
import { useAuth } from '@/auth/AuthProvider';
import { INDIAN_STATES } from '@/lib/india';
import { Button, Combobox, Field, Input, Modal, Select, Textarea, toast, type ComboboxOption } from '@/components/ui';

export interface ProductDraft {
  model_no: string;
  brand_id: string;
  category_id: string;
  serial_no: string;
  outdoor_serial_no: string;
  purchase_date: string;
  warranty_type: string;
  warranty_expiry: string;
  dealer_id: string;
}

export interface CustomerDraft {
  name: string;
  phone: string;
  alt_phone: string;
  email: string;
  gstin: string;
  crm_id: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  branch_id: string;
  product: ProductDraft;
}

export const emptyProduct: ProductDraft = { model_no: '', brand_id: '', category_id: '', serial_no: '', outdoor_serial_no: '', purchase_date: '', warranty_type: '', warranty_expiry: '', dealer_id: '' };
export const emptyCustomer: CustomerDraft = { name: '', phone: '', alt_phone: '', email: '', gstin: '', crm_id: '', address: '', city: '', state: '', pincode: '', branch_id: '', product: emptyProduct };

/** A saved unit as an editable draft. */
export function unitDraft(unit?: CustomerProduct | null): ProductDraft {
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  return {
    model_no: unit?.model_no ?? '',
    brand_id: s(unit?.brand_id ?? unit?.product?.brand?.id),
    category_id: s(unit?.category_id ?? unit?.product?.category?.id),
    serial_no: unit?.serial_no ?? '',
    outdoor_serial_no: unit?.outdoor_serial_no ?? '',
    purchase_date: unit?.purchase_date ?? '',
    warranty_type: unit?.warranty_type ?? '',
    warranty_expiry: unit?.warranty_expiry ?? '',
    dealer_id: s(unit?.dealer_id),
  };
}

/**
 * `minimal` (job card): only the customer details the office needs to send a technician – name, phones
 * and address. Everything else is completed later on the customer page.
 */
export function CustomerForm({ value, onChange, error, withProduct, minimal = false }: { value: CustomerDraft; onChange: (v: CustomerDraft) => void; error: ApiError | null; withProduct?: boolean; minimal?: boolean }) {
  const { data: lookups } = useLookups();
  const set = (k: keyof CustomerDraft, v: string) => onChange({ ...value, [k]: v });
  const f = (n: string) => error?.field(n);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={f('name')}>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Mobile number" required error={f('phone')}>
          <Input value={value.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" maxLength={15} />
        </Field>
        <Field label="Alternate number" error={f('alt_phone')}>
          <Input value={value.alt_phone} onChange={(e) => set('alt_phone', e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" maxLength={15} />
        </Field>
        <Field label="Email (optional)" error={f('email')} hint="Used to email job updates and invoices.">
          <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Address" className="sm:col-span-2" error={f('address')}>
          <Textarea rows={2} value={value.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="City" error={f('city')}>
          <Input value={value.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="PIN code" error={f('pincode')}>
          <Input value={value.pincode} onChange={(e) => set('pincode', e.target.value)} inputMode="numeric" maxLength={12} />
        </Field>
        {!minimal && (
          <>
            <Field label="State" error={f('state')} hint="Decides CGST + SGST or IGST on invoices.">
              <Select value={value.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">Same as company</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GSTIN" error={f('gstin')} hint="Business customers only – printed on their tax invoices.">
              <Input value={value.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={15} placeholder="e.g. 32ABCDE1234F1Z5" />
            </Field>
            <Field label="CRM ID" error={f('crm_id')} hint="From your brand / OEM CRM, if any.">
              <Input value={value.crm_id} onChange={(e) => set('crm_id', e.target.value)} />
            </Field>
          </>
        )}
        {(lookups?.branches.length ?? 0) > 1 && (
          <Field label="Branch" error={f('branch_id')}>
            <Select value={value.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
              <option value="">Select…</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {withProduct && <ProductFields value={value.product} onChange={(p) => onChange({ ...value, product: p })} error={error} prefix="products.0." />}
    </div>
  );
}

/** The job's product category: plain text, separate from the unit's product type. */
export function ProductCategoryField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="Product category" error={error} hint="You can search jobs by this.">
      <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={100} autoComplete="off" placeholder="e.g. Split AC" />
    </Field>
  );
}

/** The unit's model: typed as it appears on the unit, with models entered earlier suggested (this brand's first). */
export function ModelField({ value, onChange, brandId, error, label = 'Model', disabled }: { value: string; onChange: (v: string) => void; brandId?: string; error?: string; label?: ReactNode; disabled?: boolean }) {
  const { data: lookups } = useLookups();
  const listId = useId();
  const suggestions = useMemo(() => {
    const all = lookups?.model_suggestions ?? [];
    const sameBrand = all.filter((m) => brandId && String(m.brand_id) === brandId);
    return [...new Set([...sameBrand, ...all].map((m) => m.model_no))];
  }, [lookups, brandId]);
  return (
    <Field label={label} error={error} hint="Type it as shown on the unit. Models entered before are suggested.">
      <Input list={listId} value={value} onChange={(e) => onChange(e.target.value)} maxLength={150} autoComplete="off" placeholder="e.g. GLS18I5FWBEV" disabled={disabled} />
      <datalist id={listId}>
        {suggestions.map((m) => <option key={m} value={m} />)}
      </datalist>
    </Field>
  );
}

/** A titled group of fields, so a long form reads as a few short ones. */
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function ProductFields({ value, onChange, error, prefix = '', title = 'Product', extra }: {
  value: ProductDraft;
  onChange: (v: ProductDraft) => void;
  error: ApiError | null;
  prefix?: string;
  title?: string | null;
  /** One more field for the unit group, next to the model. */
  extra?: ReactNode;
}) {
  const { data: lookups } = useLookups();
  const { can } = useAuth();
  const qc = useQueryClient();
  const quickAdd = can('master.quick_add');
  const set = (k: keyof ProductDraft, v: string) => onChange({ ...value, [k]: v });
  const f = (n: string) => error?.field(prefix + n);

  // Instant add: create the brand / type, refresh the lists and select it.
  const add = async (type: 'brands' | 'categories', body: object, apply: (id: string) => ProductDraft) => {
    try {
      const res = await api.post<Envelope<{ id: number }>>(`/master/quick/${type}`, body);
      await qc.invalidateQueries({ queryKey: ['lookups'] });
      onChange(apply(String(res.data.id)));
      toast.success(res.message ?? 'Added.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add it.');
    }
  };

  const brandOptions = useMemo<ComboboxOption[]>(() => (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: b.name })), [lookups]);
  const categoryOptions = useMemo<ComboboxOption[]>(() => (lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })), [lookups]);

  const dealerOptions = useMemo<ComboboxOption[]>(() => (lookups?.dealers ?? []).map((d) => ({ value: String(d.id), label: d.name })), [lookups]);

  // Which "Add new" box is open, and what has been typed.
  const [adding, setAdding] = useState<null | 'brands' | 'categories'>(null);
  const [newName, setNewName] = useState('');
  const openAdd = (type: 'brands' | 'categories') => { setNewName(''); setAdding(type); };
  const saveNew = async () => {
    const name = newName.trim();
    if (!name || !adding) return;
    if (adding === 'brands') await add('brands', { name }, (id) => ({ ...value, brand_id: id }));
    if (adding === 'categories') await add('categories', { name }, (id) => ({ ...value, category_id: id }));
    setAdding(null);
  };
  const addLabel = (text: string, type: 'brands' | 'categories') => (
    <span className="flex items-center justify-between gap-2">
      {text}
      {quickAdd && (
        <button type="button" onClick={() => openAdd(type)} className="text-xs font-medium text-brand-700 hover:underline">
          + Add new
        </button>
      )}
    </span>
  );
  const addTitles = { brands: 'Add a new brand', categories: 'Add a new product type' } as const;

  return (
    <div className={title ? 'rounded-lg border border-slate-200 p-4' : undefined}>
      {title && <p className="mb-3 text-sm font-medium text-slate-700">{title}</p>}
      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        size="sm"
        title={adding ? addTitles[adding] : ''}
        description="It’s added to the list and selected straight away."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>Cancel</Button>
            <Button disabled={!newName.trim()} onClick={saveNew}>Add</Button>
          </>
        }
      >
        <Field label={adding === 'brands' ? 'Brand name' : 'Product type'}>
          <Input autoFocus value={newName} onChange={(ev) => setNewName(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), saveNew())} placeholder={adding === 'brands' ? 'e.g. LLOYD' : 'e.g. INVERTER AC'} />
        </Field>
      </Modal>
      <div className="space-y-5 [&>*+*]:border-t [&>*+*]:border-slate-100 [&>*+*]:pt-5">
        <FieldGroup title="Unit">
          <Field label={addLabel('Brand', 'brands')} error={f('brand_id')}>
            <Combobox
              value={value.brand_id}
              onChange={(v) => onChange({ ...value, brand_id: v })}
              options={brandOptions}
              placeholder="Select brand…"
              searchPlaceholder="Search brand…"
              invalid={!!f('brand_id')}
              aria-label="Brand"
              onCreate={quickAdd ? (name) => add('brands', { name }, (id) => ({ ...value, brand_id: id })) : undefined}
              createLabel={(t) => `Add brand “${t}”`}
            />
          </Field>
          <Field label={addLabel('Product type', 'categories')} error={f('category_id')}>
            <Combobox
              value={value.category_id}
              onChange={(v) => onChange({ ...value, category_id: v })}
              options={categoryOptions}
              placeholder="Select type…"
              searchPlaceholder="Search type…"
              invalid={!!f('category_id')}
              aria-label="Product type"
              onCreate={quickAdd ? (name) => add('categories', { name }, (id) => ({ ...value, category_id: id })) : undefined}
              createLabel={(t) => `Add type “${t}”`}
            />
          </Field>
          <ModelField value={value.model_no} onChange={(v) => set('model_no', v)} brandId={value.brand_id} error={f('model_no')} />
          {extra}
        </FieldGroup>
        <FieldGroup title="Serial numbers">
          <Field label="Serial no." error={f('serial_no')}>
            <Input value={value.serial_no} onChange={(e) => set('serial_no', e.target.value)} />
          </Field>
          <Field label="Outdoor serial no." hint="Split ACs only" error={f('outdoor_serial_no')}>
            <Input value={value.outdoor_serial_no} onChange={(e) => set('outdoor_serial_no', e.target.value)} />
          </Field>
        </FieldGroup>
        <FieldGroup title="Purchase & warranty">
          <Field label="Warranty" error={f('warranty_type')}>
            <Select value={value.warranty_type} onChange={(e) => set('warranty_type', e.target.value)}>
              <option value="">Select…</option>
              <option value="in_warranty">In warranty</option>
              <option value="extended">Extended warranty</option>
              <option value="amc">AMC</option>
              <option value="out_of_warranty">Out of warranty</option>
            </Select>
          </Field>
          <Field label="Warranty expiry" error={f('warranty_expiry')}>
            <Input type="date" value={value.warranty_expiry} onChange={(e) => set('warranty_expiry', e.target.value)} />
          </Field>
          <Field label="Purchase date" required={value.warranty_type === 'in_warranty'} error={f('purchase_date')} hint={value.warranty_type === 'in_warranty' ? 'Needed for a unit in warranty.' : undefined}>
            <Input type="date" value={value.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </Field>
          <Field label="Dealer" error={f('dealer_id')}>
            <Combobox value={value.dealer_id} onChange={(v) => set('dealer_id', v)} options={dealerOptions} placeholder="Select…" searchPlaceholder="Search dealer…" invalid={!!f('dealer_id')} aria-label="Dealer" />
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}

export function productPayload(p: ProductDraft) {
  return {
    ...p,
    model_no: p.model_no.trim() || null,
    brand_id: p.brand_id || null,
    category_id: p.category_id || null,
    dealer_id: p.dealer_id || null,
    warranty_type: p.warranty_type || null,
    purchase_date: p.purchase_date || null,
    warranty_expiry: p.warranty_expiry || null,
  };
}
