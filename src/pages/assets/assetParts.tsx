import { useState } from 'react';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { label, toMajor, toMinor, today } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

export const CATEGORIES = ['tool', 'vehicle', 'device', 'equipment', 'other'] as const;
export const CONDITIONS = ['new', 'good', 'fair', 'poor', 'damaged'] as const;

const statusTone: Record<AssetStatus, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = {
  available: 'green',
  assigned: 'blue',
  under_repair: 'amber',
  lost: 'red',
  retired: 'slate',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge tone={statusTone[status]} dot>
      {status === 'assigned' ? 'Issued' : label(status)}
    </Badge>
  );
}

export function ConditionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {label(c)}
        </option>
      ))}
    </Select>
  );
}

/** Register a new asset or edit its details (issue / return / status have their own actions). */
export function AssetDialog({ asset, onClose, onSaved }: { asset: Asset | null; onClose: () => void; onSaved?: (a: Asset) => void }) {
  const { data: lookups } = useLookups();
  const [form, setForm] = useState({
    asset_code: asset?.asset_code ?? '',
    name: asset?.name ?? '',
    category: asset?.category ?? 'tool',
    brand: asset?.brand ?? '',
    model: asset?.model ?? '',
    serial_no: asset?.serial_no ?? '',
    purchase_date: asset?.purchase_date ?? '',
    purchase_cost: toMajor(asset?.purchase_cost),
    warranty_expiry: asset?.warranty_expiry ?? '',
    branch_id: String(asset?.branch_id ?? ''),
    condition: asset?.condition ?? 'good',
    notes: asset?.notes ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const body = () => ({
    asset_code: form.asset_code.trim() || null,
    name: form.name.trim(),
    category: form.category,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    serial_no: form.serial_no.trim() || null,
    purchase_date: form.purchase_date || null,
    purchase_cost: form.purchase_cost ? toMinor(form.purchase_cost) : null,
    warranty_expiry: form.warranty_expiry || null,
    branch_id: form.branch_id ? Number(form.branch_id) : null,
    condition: form.condition,
    notes: form.notes.trim() || null,
  });
  const m = useApiMutation(() => (asset ? api.patch<Envelope<Asset>>(`/assets/${asset.id}`, body()) : api.post<Envelope<Asset>>('/assets', body())), {
    invalidate: [['assets'], ['asset']],
    toastValidation: false,
    onSuccess: (r) => {
      onClose();
      onSaved?.(r.data);
    },
  });
  const e = (n: string) => fieldError(m.error, n);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={asset ? `Edit ${asset.asset_code}` : 'Add asset'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e('name')} className="sm:col-span-2">
          <Input value={form.name} maxLength={150} placeholder="e.g. Vacuum pump, Gauge manifold, Honda Activa" onChange={(ev) => set('name', ev.target.value)} />
        </Field>
        <Field label="Category" required error={e('category')}>
          <Select value={form.category} onChange={(ev) => set('category', ev.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Asset code" error={e('asset_code')} hint={asset ? undefined : 'Leave blank to generate one.'}>
          <Input value={form.asset_code} maxLength={30} onChange={(ev) => set('asset_code', ev.target.value.toUpperCase())} />
        </Field>
        <Field label="Brand" error={e('brand')}>
          <Input value={form.brand} maxLength={100} onChange={(ev) => set('brand', ev.target.value)} />
        </Field>
        <Field label="Model" error={e('model')}>
          <Input value={form.model} maxLength={100} onChange={(ev) => set('model', ev.target.value)} />
        </Field>
        <Field label="Serial / registration no." error={e('serial_no')}>
          <Input value={form.serial_no} maxLength={100} onChange={(ev) => set('serial_no', ev.target.value)} />
        </Field>
        {!asset && (
          <Field label="Condition" error={e('condition')}>
            <ConditionSelect value={form.condition} onChange={(v) => set('condition', v)} />
          </Field>
        )}
        <Field label="Purchase date" error={e('purchase_date')}>
          <Input type="date" value={form.purchase_date} max={today()} onChange={(ev) => set('purchase_date', ev.target.value)} />
        </Field>
        <Field label="Purchase cost" error={e('purchase_cost')}>
          <Input inputMode="decimal" value={form.purchase_cost} onChange={(ev) => set('purchase_cost', ev.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Warranty until" error={e('warranty_expiry')}>
          <Input type="date" value={form.warranty_expiry} onChange={(ev) => set('warranty_expiry', ev.target.value)} />
        </Field>
        {(lookups?.branches.length ?? 0) > 1 && (
          <Field label="Branch" error={e('branch_id')}>
            <Select value={form.branch_id} onChange={(ev) => set('branch_id', ev.target.value)}>
              <option value="">—</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes" error={e('notes')} className="sm:col-span-2">
          <Textarea rows={3} value={form.notes} maxLength={2000} onChange={(ev) => set('notes', ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
