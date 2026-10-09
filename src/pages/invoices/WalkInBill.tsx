import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, QrCode, Trash2, Wrench, X } from 'lucide-react';
import { UpiQrDialog } from '@/components/upi';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { money, qty, toMajor, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Customer, InventoryItem, Invoice } from '@/lib/types';
import { Button, Card, Field, Input, PageHeader, SearchInput, Select, Textarea, toast } from '@/components/ui';
import { Hint } from '@/components/tutorial';

interface Line {
  key: number;
  type: 'service' | 'part';
  item: InventoryItem | null;
  description: string;
  quantity: string;
  unit_price: string;
}

let nextKey = 1;
const lineTotal = (l: Line) => Math.round((parseFloat(l.quantity) || 0) * toMinor(l.unit_price));

/** Counter bill for a walk-in customer: services and/or parts sold from branch stock, paid at the counter. */
export default function WalkInBill() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: lookups } = useLookups();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [branchId, setBranchId] = useState(user?.branch_id ? String(user.branch_id) : '');
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, type: 'service', item: null, description: '', quantity: '1', unit_price: '' }]);
  const [picking, setPicking] = useState(false);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('cash');
  const [paid, setPaid] = useState<string | null>(null); // null = follow the bill total
  const [reference, setReference] = useState('');
  const [showUpi, setShowUpi] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const results = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search, per_page: 6 }),
    enabled: search.length >= 2 && !customer,
  });

  const services = lines.filter((l) => l.type === 'service').reduce((a, l) => a + lineTotal(l), 0);
  const parts = lines.filter((l) => l.type === 'part').reduce((a, l) => a + lineTotal(l), 0);
  const discountMinor = toMinor(discount);
  const total = Math.max(0, services + parts - discountMinor);
  const isCredit = method === 'credit';
  const paidMinor = isCredit ? 0 : paid === null ? total : toMinor(paid);
  const balance = total - paidMinor;
  const needsRef = ['upi', 'cheque', 'bank_transfer'].includes(method) && paidMinor > 0;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addService = () => setLines((ls) => [...ls, { key: nextKey++, type: 'service', item: null, description: '', quantity: '1', unit_price: '' }]);
  const addPart = (item: InventoryItem) => {
    setLines((ls) => [...ls, { key: nextKey++, type: 'part', item, description: '', quantity: '1', unit_price: toMajor(item.unit_price) || '0' }]);
    setPicking(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<Envelope<Invoice> & { message?: string }>('/walk-in-bills', {
        customer_id: customer?.id ?? null,
        customer: customer ? null : { name: newCustomer.name.trim(), phone: newCustomer.phone.trim() },
        branch_id: branchId ? Number(branchId) : null,
        items: lines.map((l) => ({
          type: l.type,
          item_id: l.item?.id ?? null,
          description: l.description.trim() || null,
          quantity: parseFloat(l.quantity) || 0,
          unit_price: l.unit_price === '' ? null : toMinor(l.unit_price),
        })),
        discount: discountMinor || null,
        notes: notes.trim() || null,
        payment_method: method,
        amount_paid: isCredit ? null : paidMinor,
        reference_no: reference.trim() || null,
      });
      toast.success(res.message ?? 'Bill created.');
      navigate(`/invoices/${res.data.id}`);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.');
      setError(apiErr);
      const shown = ['customer.name', 'customer.phone', 'reference_no', 'discount', 'branch_id'];
      if (!Object.keys(apiErr.errors).some((k) => shown.includes(k) || k.startsWith('items.'))) toast.error(apiErr.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (n: string) => error?.field(n);
  const lineError = (i: number) => ['description', 'item_id', 'quantity', 'unit_price'].map((k) => f(`items.${i}.${k}`)).find(Boolean);
  const branches = lookups?.branches ?? [];

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link to="/invoices?source=walk_in" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Invoices
          </Link>
        }
        title="New walk-in bill"
        description="Bill a customer at the counter for a repair or parts sold. Parts are taken out of the branch’s stock."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Customer">
            {customer ? (
              <div className="flex items-start justify-between rounded-lg bg-slate-50 p-3">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-slate-500">{customer.phone}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCustomer(null)} aria-label="Change customer">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone" required error={f('customer.phone')}>
                    <Input inputMode="tel" value={newCustomer.phone} maxLength={16} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value.replace(/[^\d+]/g, '') })} />
                  </Field>
                  <Field label="Name" required error={f('customer.name')}>
                    <Input value={newCustomer.name} maxLength={150} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  </Field>
                </div>
                <p className="text-xs text-slate-500">If this phone number already belongs to a customer, the bill is added to that customer.</p>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <SearchInput value={search} onChange={setSearch} placeholder="…or search an existing customer by name or phone" delay={250} />
                  {search.length >= 2 && (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {results.data?.data.map((c) => (
                        <button type="button" key={c.id} onClick={() => setCustomer(c)} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50">
                          <span className="text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-slate-500">{c.phone}</span>
                        </button>
                      ))}
                      {results.data && !results.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No customer matches “{search}”.</p>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Items"
            padded={false}
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<Wrench className="h-4 w-4" />} onClick={addService}>
                  Service
                </Button>
                <Hint text="Search your spare parts and add one to the bill. When the bill is saved, the quantity is taken out of the selected branch’s stock.">
                  <Button size="sm" variant="secondary" icon={<Package className="h-4 w-4" />} onClick={() => setPicking(true)}>
                    Part
                  </Button>
                </Hint>
              </div>
            }
          >
            {f('items') && <p className="px-5 pt-3 text-xs text-red-600">{f('items')}</p>}
            {f('quantity') && <p className="px-5 pt-3 text-xs text-red-600">{f('quantity')}</p>}
            {picking && <PartPicker branchId={branchId} onPick={addPart} onClose={() => setPicking(false)} />}
            {!lines.length && <p className="px-5 py-8 text-center text-sm text-slate-500">Add a service or a part to start the bill.</p>}
            <div className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <div key={l.key} className="grid gap-3 px-5 py-4 sm:grid-cols-12 sm:items-start">
                  <div className="sm:col-span-6">
                    {l.type === 'part' ? (
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          <Package className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />
                          {l.item?.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {l.item?.code} · {qty(l.item?.stock_total ?? 0)} {l.item?.unit_of_measure} in stock
                        </p>
                      </div>
                    ) : (
                      <Input placeholder="Service, e.g. Remote repair" aria-label="Service description" value={l.description} maxLength={200} onChange={(e) => update(l.key, { description: e.target.value })} />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:col-span-6 sm:grid-cols-12">
                    <Input className="sm:col-span-3" inputMode="decimal" aria-label="Quantity" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                    <Input className="sm:col-span-4" inputMode="decimal" aria-label="Unit price" placeholder="Price" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value.replace(/[^\d.]/g, '') })} />
                    <div className="flex items-center justify-end gap-1 sm:col-span-5">
                      <span className="text-sm font-medium tabular-nums">{money(lineTotal(l))}</span>
                      <Button size="sm" variant="ghost" className="text-red-600" aria-label="Remove line" onClick={() => remove(l.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {lineError(i) && <p className="text-xs text-red-600 sm:col-span-12">{lineError(i)}</p>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Notes">
            <Textarea rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Optional – printed on the bill" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Bill">
            <div className="space-y-4">
              {branches.length > 1 && (
                <Field label="Branch" error={f('branch_id')} hint="Parts are taken from this branch’s stock.">
                  <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">Default</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <dl className="space-y-1.5 text-sm">
                <Row k="Services" v={money(services)} />
                <Row k="Parts" v={money(parts)} />
              </dl>
              <Field label="Discount" error={f('discount')}>
                <Input inputMode="decimal" value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-slate-700">Total</span>
                <span className="text-xl font-semibold tabular-nums text-slate-900">{money(total)}</span>
              </div>
            </div>
          </Card>

          <Card title="Payment">
            <div className="space-y-4">
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="credit">Credit (pay later)</option>
                </Select>
              </Field>
              {!isCredit && (
                <Field label="Amount received" error={f('amount_paid') ?? f('amount')}>
                  <Input inputMode="decimal" value={paid ?? toMajor(total)} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ''))} />
                </Field>
              )}
              {method === 'upi' && paidMinor > 0 && (
                <Button variant="secondary" size="sm" className="w-full" icon={<QrCode className="h-4 w-4" />} onClick={() => setShowUpi(true)}>
                  Show UPI QR for {money(paidMinor)}
                </Button>
              )}
              {needsRef && (
                <Field label={method === 'cheque' ? 'Cheque number' : method === 'upi' ? 'UPI transaction ref. (optional)' : 'Bank reference / UTR'} required={method !== 'upi'} error={f('reference_no')}>
                  <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
                </Field>
              )}
              <div className={cn('flex items-baseline justify-between rounded-lg px-3 py-2 text-sm', balance > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900')}>
                <span>{balance > 0 ? 'Balance due' : balance < 0 ? 'More than the bill' : 'Fully paid'}</span>
                <span className="font-semibold tabular-nums">{money(balance)}</span>
              </div>
              <Button type="submit" className="w-full" loading={saving} disabled={!lines.length || balance < 0}>
                Create bill
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <UpiQrDialog open={showUpi} onClose={() => setShowUpi(false)} amount={paidMinor} note="Walk-in bill" branchId={branchId ? Number(branchId) : user?.branch_id} />
    </form>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

function PartPicker({ branchId, onPick, onClose }: { branchId: string; onPick: (item: InventoryItem) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const items = useQuery({
    queryKey: ['walkin-items', search, branchId],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, active: 1, per_page: 8, branch_id: branchId || undefined }),
  });
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
            <button type="button" key={it.id} disabled={stock <= 0} onClick={() => onPick(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                <span className="text-xs text-slate-500">
                  {it.code} · {money(it.unit_price)}
                </span>
              </span>
              <span className={cn('shrink-0 text-xs', stock > 0 ? 'text-slate-500' : 'text-red-600')}>
                {stock > 0 ? `${qty(stock)} ${it.unit_of_measure}` : 'Out of stock'}
              </span>
            </button>
          );
        })}
        {items.data && !items.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No parts found.</p>}
      </div>
    </div>
  );
}
