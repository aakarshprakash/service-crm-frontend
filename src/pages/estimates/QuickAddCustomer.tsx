import { useId, useState, type FormEvent } from 'react';
import { api, type ApiError, type Envelope } from '@/lib/api';
import { useApiMutation } from '@/lib/hooks';
import type { Customer } from '@/lib/types';
import { Button, Field, Input, Modal, Textarea } from '@/components/ui';

interface Draft { name: string; phone: string; city: string; address: string }

/** What was typed in the customer search becomes the name, or the mobile number when it is all digits. */
function startingDraft(typed: string): Draft {
  const text = typed.trim();
  const isNumber = /^\+?\d[\d\s-]*$/.test(text);
  return { name: isNumber ? '' : text, phone: isNumber ? text.replace(/[^\d+]/g, '') : '', city: '', address: '' };
}

/**
 * Add a customer without leaving the estimate: just a name and a mobile number, the rest optional.
 * The full record (products, GSTIN, state) can be completed later on the customer page.
 */
export function QuickAddCustomer({ typed, onClose, onCreated }: { typed: string; onClose: () => void; onCreated: (id: number) => void }) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => startingDraft(typed));
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const m = useApiMutation(
    (d: Draft) =>
      api.post<Envelope<Customer>>('/customers', {
        name: d.name.trim(),
        phone: d.phone,
        city: d.city.trim() || null,
        address: d.address.trim() || null,
        branch_id: null,
        products: [],
      }),
    {
      invalidate: [['customers'], ['customer-search']],
      toastValidation: false,
      success: 'Customer added.',
      onSuccess: (r) => onCreated(r.data.id),
    },
  );
  const error = m.error as ApiError | null;
  const f = (n: string) => error?.field(n);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // This dialog sits inside the estimate form, and React passes a submit up to it even through the portal:
    // without this, adding the customer also "saves" the estimate and shows "Choose the customer first".
    e.stopPropagation();
    m.mutate(draft);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a new customer"
      description="Only the name and mobile number are needed now. You can add the rest later from the customer page."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={m.isPending}>
            Add and use for this estimate
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={f('name')}>
          <Input autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" maxLength={150} invalid={!!f('name')} />
        </Field>
        <Field label="Mobile number" required error={f('phone')} hint="10 digits, WhatsApp number if possible.">
          <Input value={draft.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" maxLength={15} invalid={!!f('phone')} />
        </Field>
        <Field label="City (optional)" error={f('city')}>
          <Input value={draft.city} onChange={(e) => set('city', e.target.value)} maxLength={100} />
        </Field>
        <Field label="Address (optional)" error={f('address')} className="sm:col-span-2">
          <Textarea rows={2} value={draft.address} onChange={(e) => set('address', e.target.value)} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}
