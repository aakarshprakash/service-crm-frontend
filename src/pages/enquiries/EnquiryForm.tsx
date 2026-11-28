import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { fieldError, useApiMutation, useLookups, useStaffOptions } from '@/lib/hooks';
import { fromLocalInput, toLocalInput, toMajor, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { SOURCES, TYPES, type Enquiry, type EnquiryType } from './enquiry';

/** Tomorrow at 11 am: a sensible first call-back time. */
function tomorrowMorning(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

/** Log a new enquiry while on the call, or change one. Only the name and phone are required. */
export function EnquiryDialog({ enquiry, onClose, defaultType = 'service' }: { enquiry?: Enquiry | null; onClose: () => void; defaultType?: EnquiryType }) {
  const navigate = useNavigate();
  const { data: lookups } = useLookups();
  const { data: staff } = useStaffOptions();
  const [form, setForm] = useState({
    type: enquiry?.type ?? defaultType,
    name: enquiry?.name ?? '',
    phone: enquiry?.phone ?? '',
    email: enquiry?.email ?? '',
    address: enquiry?.address ?? '',
    city: enquiry?.city ?? '',
    pincode: enquiry?.pincode ?? '',
    source: enquiry?.source ?? 'phone',
    brand_id: String(enquiry?.brand_id ?? ''),
    product: enquiry?.product ?? '',
    details: enquiry?.details ?? '',
    expected_value: toMajor(enquiry?.expected_value),
    follow_up_at: enquiry ? toLocalInput(enquiry.follow_up_at) : tomorrowMorning(),
    assigned_to: String(enquiry?.assigned_to ?? ''),
    branch_id: String(enquiry?.branch_id ?? ''),
  });
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const digits = form.phone.replace(/\D/g, '');
  // A number that is already a customer: say so, so nobody adds them twice. The enquiry links to them on save.
  const known = useQuery({
    queryKey: ['customer-search', digits],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search: digits, per_page: 1 }),
    enabled: !enquiry && digits.length >= 10,
  });
  const match = known.data?.data.find((c) => c.phone?.replace(/\D/g, '').endsWith(digits.slice(-10)));

  const body = () => ({
    type: form.type,
    name: form.name.trim(),
    phone: form.phone.replace(/[\s-]/g, ''),
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    pincode: form.pincode.trim() || null,
    source: form.source,
    brand_id: form.brand_id ? Number(form.brand_id) : null,
    product: form.product.trim() || null,
    details: form.details.trim() || null,
    expected_value: form.type === 'sales' && form.expected_value ? toMinor(form.expected_value) : null,
    follow_up_at: form.follow_up_at ? fromLocalInput(form.follow_up_at) : null,
    assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
    branch_id: form.branch_id ? Number(form.branch_id) : null,
  });
  const m = useApiMutation(
    () => (enquiry ? api.patch<Envelope<Enquiry>>(`/enquiries/${enquiry.id}`, body()) : api.post<Envelope<Enquiry>>('/enquiries', body())),
    {
      invalidate: [['enquiries'], ['enquiry']],
      toastValidation: false,
      onSuccess: (r) => {
        onClose();
        if (!enquiry) navigate(`/enquiries/${r.data.id}`);
      },
    },
  );
  const e = (n: string) => fieldError(m.error, n);
  const office = (staff ?? []).filter((s) => s.role !== 'technician');

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={enquiry ? `Edit enquiry ${enquiry.enquiry_number}` : 'New enquiry'}
      description={enquiry ? undefined : 'Note who asked and what for. Only the name and phone number are needed.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {enquiry ? 'Save' : 'Save enquiry'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Enquiry for">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={form.type === t.value}
              onClick={() => set('type', t.value)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                form.type === t.value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <span className={cn('block text-sm font-semibold', form.type === t.value ? 'text-brand-800' : 'text-slate-800')}>{t.label} enquiry</span>
              <span className="block text-xs text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={e('name')}>
            <Input value={form.name} onChange={(ev) => set('name', ev.target.value)} maxLength={150} autoFocus={!enquiry} />
          </Field>
          <Field label="Phone" required error={e('phone')}>
            <Input value={form.phone} onChange={(ev) => set('phone', ev.target.value)} inputMode="tel" maxLength={16} placeholder="10-digit mobile" />
          </Field>
          {match && (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">
              <UserCheck className="h-4 w-4 shrink-0" aria-hidden />
              Already a customer: <strong>{match.name}</strong>. The enquiry will be linked to them.
            </p>
          )}
          <Field label="How did they reach you?" error={e('source')}>
            <Select value={form.source} onChange={(ev) => set('source', ev.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email" error={e('email')}>
            <Input type="email" value={form.email} onChange={(ev) => set('email', ev.target.value)} maxLength={150} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" error={e('brand_id')}>
            <Select value={form.brand_id} onChange={(ev) => set('brand_id', ev.target.value)}>
              <option value="">Not known</option>
              {lookups?.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={form.type === 'sales' ? 'Product they want' : 'Product'} error={e('product')}>
            <Input value={form.product} onChange={(ev) => set('product', ev.target.value)} maxLength={150} placeholder={form.type === 'sales' ? 'e.g. 1.5 ton inverter split AC' : 'e.g. Split AC, washing machine'} />
          </Field>
          <Field label={form.type === 'sales' ? 'What they asked for' : 'The problem, in their words'} className="sm:col-span-2" error={e('details')}>
            <Textarea rows={3} value={form.details} onChange={(ev) => set('details', ev.target.value)} maxLength={2000} />
          </Field>
          {form.type === 'sales' && (
            <Field label="Expected value" hint="What the sale could be worth, if known." error={e('expected_value')}>
              <Input inputMode="decimal" value={form.expected_value} onChange={(ev) => set('expected_value', ev.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Call back on" hint="Leave empty if no call-back is needed." error={e('follow_up_at')}>
            <Input type="datetime-local" value={form.follow_up_at} onChange={(ev) => set('follow_up_at', ev.target.value)} />
          </Field>
          <Field label="Who follows it up" error={e('assigned_to')}>
            <Select value={form.assigned_to} onChange={(ev) => set('assigned_to', ev.target.value)}>
              <option value="">Anyone</option>
              {office.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {(lookups?.branches.length ?? 0) > 1 && (
            <Field label="Branch" error={e('branch_id')}>
              <Select value={form.branch_id} onChange={(ev) => set('branch_id', ev.target.value)}>
                <option value="">Any</option>
                {lookups?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <details className="group rounded-xl border border-slate-200 px-4 py-3" open={!!(enquiry?.address || enquiry?.city)}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Address (optional)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Address" className="sm:col-span-3" error={e('address')}>
              <Input value={form.address} onChange={(ev) => set('address', ev.target.value)} maxLength={500} />
            </Field>
            <Field label="City" className="sm:col-span-2" error={e('city')}>
              <Input value={form.city} onChange={(ev) => set('city', ev.target.value)} maxLength={100} />
            </Field>
            <Field label="PIN code" error={e('pincode')}>
              <Input value={form.pincode} onChange={(ev) => set('pincode', ev.target.value)} inputMode="numeric" maxLength={12} />
            </Field>
          </div>
        </details>
      </div>
    </Modal>
  );
}
