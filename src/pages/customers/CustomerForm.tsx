import { useMemo } from 'react';
import type { ApiError } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { Combobox, Field, Input, Select, Textarea, type ComboboxOption } from '@/components/ui';

export interface ProductDraft {
  product_id: string;
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
  crm_id: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  branch_id: string;
  product: ProductDraft;
}

export const emptyProduct: ProductDraft = { product_id: '', serial_no: '', outdoor_serial_no: '', purchase_date: '', warranty_type: '', warranty_expiry: '', dealer_id: '' };
export const emptyCustomer: CustomerDraft = { name: '', phone: '', alt_phone: '', email: '', crm_id: '', address: '', city: '', state: '', pincode: '', branch_id: '', product: emptyProduct };

export function CustomerForm({ value, onChange, error, withProduct }: { value: CustomerDraft; onChange: (v: CustomerDraft) => void; error: ApiError | null; withProduct?: boolean }) {
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
        <Field label="Email" error={f('email')}>
          <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
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
        <Field label="CRM ID" error={f('crm_id')} hint="From your brand / OEM CRM, if any.">
          <Input value={value.crm_id} onChange={(e) => set('crm_id', e.target.value)} />
        </Field>
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

export function ProductFields({ value, onChange, error, prefix = '', title = 'Product' }: { value: ProductDraft; onChange: (v: ProductDraft) => void; error: ApiError | null; prefix?: string; title?: string | null }) {
  const { data: lookups } = useLookups();
  const set = (k: keyof ProductDraft, v: string) => onChange({ ...value, [k]: v });
  const f = (n: string) => error?.field(prefix + n);

  // Grouped by product category so a long model list stays navigable.
  const productOptions = useMemo<ComboboxOption[]>(() => {
    const categories = new Map((lookups?.categories ?? []).map((c) => [c.id, c.name]));
    return (lookups?.products ?? [])
      .map((p) => ({
        value: String(p.id),
        label: [p.brand?.name, p.model_name].filter(Boolean).join(' ') || 'Model',
        group: (p.category_id ? categories.get(p.category_id) : undefined) ?? 'Other',
      }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  }, [lookups]);

  const dealerOptions = useMemo<ComboboxOption[]>(() => (lookups?.dealers ?? []).map((d) => ({ value: String(d.id), label: d.name })), [lookups]);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      {title && <p className="mb-3 text-sm font-medium text-slate-700">{title}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" error={f('product_id')} className="sm:col-span-2" hint={lookups && !lookups.products.length ? 'No models configured yet — an admin adds them in Settings → Master data.' : undefined}>
          <Combobox
            value={value.product_id}
            onChange={(v) => set('product_id', v)}
            options={productOptions}
            placeholder="Select model…"
            searchPlaceholder="Search brand or model…"
            emptyText="No model matches. Try the brand name."
            invalid={!!f('product_id')}
            aria-label="Product model"
          />
        </Field>
        <Field label="Serial no." error={f('serial_no')}>
          <Input value={value.serial_no} onChange={(e) => set('serial_no', e.target.value)} />
        </Field>
        <Field label="Outdoor serial no." hint="Split ACs only" error={f('outdoor_serial_no')}>
          <Input value={value.outdoor_serial_no} onChange={(e) => set('outdoor_serial_no', e.target.value)} />
        </Field>
        <Field label="Purchase date" error={f('purchase_date')}>
          <Input type="date" value={value.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
        </Field>
        <Field label="Dealer" error={f('dealer_id')}>
          <Combobox value={value.dealer_id} onChange={(v) => set('dealer_id', v)} options={dealerOptions} placeholder="Select…" searchPlaceholder="Search dealer…" invalid={!!f('dealer_id')} aria-label="Dealer" />
        </Field>
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
      </div>
    </div>
  );
}

export function productPayload(p: ProductDraft) {
  return {
    ...p,
    product_id: p.product_id || null,
    dealer_id: p.dealer_id || null,
    warranty_type: p.warranty_type || null,
    purchase_date: p.purchase_date || null,
    warranty_expiry: p.warranty_expiry || null,
  };
}
