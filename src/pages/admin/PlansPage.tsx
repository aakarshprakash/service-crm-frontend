import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { label, money, toMajor, toMinor } from '@/lib/format';
import { Badge, Button, Card, Checkbox, DataTable, Field, Input, Modal, PageHeader, QueryState, Select } from '@/components/ui';

interface Plan { id: number; name: string; code: string; price: number; billing_cycle: string; max_users: number; max_technicians: number; features: Record<string, boolean> | null; is_active: boolean; tenants_count: number }
const FEATURES = ['customer_portal', 'sms', 'whatsapp', 'online_payments', 'advanced_reports'];

export default function PlansPage() {
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => api.get<Envelope<Plan[]>>('/admin/plans').then((r) => r.data) });
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Subscription plans" description="Pricing, limits and feature flags per plan." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New plan</Button>} />
      <QueryState loading={q.isLoading} error={q.error}>
        <Card padded={false}>
          <DataTable
            rows={q.data}
            onRowClick={setEditing}
            columns={[
              { key: 'name', header: 'Plan', render: (p) => <div><p className="font-medium">{p.name} {!p.is_active && <Badge>Hidden</Badge>}</p><p className="font-mono text-xs text-slate-500">{p.code}</p></div> },
              { key: 'price', header: 'Price', render: (p) => `${money(p.price, 'INR')} / ${p.billing_cycle === 'yearly' ? 'year' : 'month'}` },
              { key: 'limits', header: 'Limits', render: (p) => `${p.max_technicians} tech · ${p.max_users} office` },
              { key: 'features', header: 'Features', hideOnMobile: true, render: (p) => <div className="flex flex-wrap gap-1">{FEATURES.filter((f) => p.features?.[f]).map((f) => <Badge key={f} tone="blue">{label(f)}</Badge>)}</div> },
              { key: 'tenants', header: 'Tenants', render: (p) => p.tenants_count, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            ]}
          />
        </Card>
      </QueryState>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    code: plan?.code ?? '',
    price: toMajor(plan?.price),
    billing_cycle: plan?.billing_cycle ?? 'monthly',
    max_users: String(plan?.max_users ?? 5),
    max_technicians: String(plan?.max_technicians ?? 10),
    is_active: plan?.is_active ?? true,
    features: Object.fromEntries(FEATURES.map((f) => [f, Boolean(plan?.features?.[f])])) as Record<string, boolean>,
  });
  const m = useApiMutation(
    () => {
      const body = { ...form, price: toMinor(form.price), max_users: Number(form.max_users), max_technicians: Number(form.max_technicians) };
      return plan ? api.patch(`/admin/plans/${plan.id}`, body) : api.post('/admin/plans', body);
    },
    { invalidate: [['admin-plans']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal open onClose={onClose} size="lg" title={plan ? `Edit ${plan.name}` : 'New plan'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Save plan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e('name')}>
          <Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
        </Field>
        <Field label="Code" required error={e('code')}>
          <Input value={form.code} onChange={(ev) => setForm({ ...form, code: ev.target.value.toLowerCase() })} />
        </Field>
        <Field label="Price (INR)" required error={e('price')}>
          <Input inputMode="decimal" value={form.price} onChange={(ev) => setForm({ ...form, price: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Billing cycle">
          <Select value={form.billing_cycle} onChange={(ev) => setForm({ ...form, billing_cycle: ev.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label="Max technicians" error={e('max_technicians')}>
          <Input inputMode="numeric" value={form.max_technicians} onChange={(ev) => setForm({ ...form, max_technicians: ev.target.value.replace(/\D/g, '') })} />
        </Field>
        <Field label="Max office users" error={e('max_users')}>
          <Input inputMode="numeric" value={form.max_users} onChange={(ev) => setForm({ ...form, max_users: ev.target.value.replace(/\D/g, '') })} />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <p className="text-sm font-medium text-slate-700">Features</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <Checkbox key={f} label={label(f)} checked={form.features[f] ?? false} onChange={(v) => setForm({ ...form, features: { ...form.features, [f]: v } })} />
            ))}
          </div>
        </div>
        <Checkbox label="Available for new sign-ups" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
    </Modal>
  );
}
