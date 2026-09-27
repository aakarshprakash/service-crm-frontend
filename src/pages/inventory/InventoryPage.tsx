import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, PackagePlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery, useLookups } from '@/lib/hooks';
import { dateTime, label, money, qty, toMajor, toMinor } from '@/lib/format';
import type { InventoryItem, Named } from '@/lib/types';
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select, Tabs } from '@/components/ui';
import { Hint } from '@/components/tutorial';

type Tab = 'items' | 'stock' | 'transactions' | 'suppliers';
interface Supplier { id: number; name: string; contact: string | null; phone: string | null; email: string | null; gstin: string | null; is_active: boolean }

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'items';
  const { can } = useAuth();
  const manage = can('inventory.manage');
  const [dialog, setDialog] = useState<'stockin' | 'transfer' | 'adjust' | null>(null);

  const tabs: { value: Tab; label: string }[] = [
    { value: 'items', label: 'Items' },
    { value: 'stock', label: 'Branch stock' },
    ...(manage ? ([{ value: 'transactions', label: 'Movements' }, { value: 'suppliers', label: 'Suppliers' }] as const) : []),
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Spares and consumables across branches. Stock updates automatically as technicians use items on jobs."
        actions={
          manage && (
            <>
              <Hint text="Corrects a branch’s stock count after breakage, loss or a stock-take. A reason is required and kept in Movements and the audit trail.">
                <Button variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setDialog('adjust')}>
                  Adjust
                </Button>
              </Hint>
              <Hint text="Moves stock from one branch to another. It comes off the first branch and is added to the second at the same time.">
                <Button variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setDialog('transfer')}>
                  Transfer
                </Button>
              </Hint>
              <Hint text="Records stock received from a supplier into a branch, with quantities and cost. You can add several items at once.">
                <Button icon={<PackagePlus className="h-4 w-4" />} onClick={() => setDialog('stockin')}>
                  Stock in
                </Button>
              </Hint>
            </>
          )
        }
      />
      <Tabs className="mb-4" value={tab} onChange={(v) => setParams({ tab: v })} tabs={tabs} />
      {tab === 'items' && <Items manage={manage} />}
      {tab === 'stock' && <Stock />}
      {tab === 'transactions' && <Transactions />}
      {tab === 'suppliers' && <Suppliers />}
      {dialog === 'stockin' && <StockIn onClose={() => setDialog(null)} />}
      {dialog === 'transfer' && <Transfer onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && <Adjust onClose={() => setDialog(null)} />}
    </>
  );
}

function Items({ manage }: { manage: boolean }) {
  const list = useListQuery<InventoryItem>('inventory-items', '/inventory/items');
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const f = list.filters;
  return (
    <Card padded={false}>
      <FilterBar>
        <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Code or name" className="sm:w-64" />
        <Select value={f.type ?? ''} onChange={(e) => list.setFilter('type', e.target.value)} className="sm:w-40" aria-label="Type">
          <option value="">Spares & consumables</option>
          <option value="spare">Spares</option>
          <option value="consumable">Consumables</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={f.low_stock === '1'} onChange={(e) => list.setFilter('low_stock', e.target.checked ? '1' : '')} />
          Low stock only
        </label>
        {manage && (
          <Hint className="sm:ml-auto" text="Adds a spare or consumable to your catalogue, with its code, price and reorder level. Use Stock in to add quantities.">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New item
            </Button>
          </Hint>
        )}
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        onRowClick={manage ? (i) => setEditing(i) : undefined}
        empty={<EmptyState title="No items" message="Add spares (counted in units) and consumables (gas, wire, chemicals measured in kg / m / ltr)." />}
        columns={[
          { key: 'code', header: 'Code', render: (i) => <span className="font-mono text-xs">{i.code}</span> },
          { key: 'name', header: 'Item', render: (i) => <span className="font-medium text-slate-900">{i.name}{!i.is_active && <Badge className="ml-2">Inactive</Badge>}</span> },
          { key: 'type', header: 'Type', render: (i) => <Badge tone={i.type === 'spare' ? 'blue' : 'violet'}>{label(i.type)}</Badge> },
          { key: 'cat', header: 'Category', hideOnMobile: true, render: (i) => i.category ?? '—' },
          { key: 'price', header: 'Price', render: (i) => `${money(i.unit_price)} / ${i.unit_of_measure}`, className: 'tabular-nums' },
          {
            key: 'stock',
            header: 'In stock',
            className: 'text-right tabular-nums',
            headerClassName: 'text-right',
            render: (i) => {
              const s = Number(i.stock_total ?? 0);
              return <span className={i.reorder_level > 0 && s <= i.reorder_level ? 'font-semibold text-red-700' : ''}>{qty(s)} {i.unit_of_measure}</span>;
            },
          },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      {editing && <ItemDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ItemDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const cats = useQuery({ queryKey: ['inv-categories'], queryFn: () => api.get<Envelope<string[]>>('/inventory/categories').then((r) => r.data) });
  const [form, setForm] = useState({
    code: item?.code ?? '',
    name: item?.name ?? '',
    type: item?.type ?? 'spare',
    category: item?.category ?? '',
    unit_of_measure: item?.unit_of_measure ?? 'nos',
    unit_price: toMajor(item?.unit_price),
    reorder_level: item ? String(item.reorder_level) : '',
    is_active: item?.is_active ?? true,
  });
  const m = useApiMutation(
    () => {
      const body = { ...form, unit_price: toMinor(form.unit_price), reorder_level: form.reorder_level || 0, category: form.category || null };
      return item ? api.patch(`/inventory/items/${item.id}`, body) : api.post('/inventory/items', body);
    },
    { invalidate: [['inventory-items'], ['inv-categories']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item ? 'Edit item' : 'New inventory item'}
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
        <Field label="Code" required error={e('code')}>
          <Input value={form.code} onChange={(ev) => setForm({ ...form, code: ev.target.value.toUpperCase() })} />
        </Field>
        <Field label="Name" required error={e('name')}>
          <Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
        </Field>
        <Field label="Type" required>
          <Select value={form.type} onChange={(ev) => setForm({ ...form, type: ev.target.value as 'spare' | 'consumable', unit_of_measure: ev.target.value === 'spare' ? 'nos' : form.unit_of_measure })}>
            <option value="spare">Spare (discrete part)</option>
            <option value="consumable">Consumable (bulk)</option>
          </Select>
        </Field>
        <Field label="Unit of measure" required error={e('unit_of_measure')}>
          <Select value={form.unit_of_measure} onChange={(ev) => setForm({ ...form, unit_of_measure: ev.target.value })}>
            {['nos', 'kg', 'gram', 'ltr', 'ml', 'metre'].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" error={e('category')}>
          <Input list="inv-cats" value={form.category} onChange={(ev) => setForm({ ...form, category: ev.target.value })} placeholder="e.g. AC Parts" />
          <datalist id="inv-cats">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Selling price per unit" required error={e('unit_price')}>
          <Input inputMode="decimal" value={form.unit_price} onChange={(ev) => setForm({ ...form, unit_price: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Reorder level" error={e('reorder_level')} hint="Alert when branch stock falls to this level.">
          <Input inputMode="decimal" value={form.reorder_level} onChange={(ev) => setForm({ ...form, reorder_level: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <div className="flex items-end">
          <Checkbox label="Active" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} description="Inactive items can't be used on new jobs." />
        </div>
      </div>
    </Modal>
  );
}

interface StockRow { id: number; branch_id: number; item_id: number; code: string; name: string; type: string; category: string | null; unit_of_measure: string; reorder_level: string; quantity_available: string; avg_unit_cost: number; stock_value: string; is_low: number; branch_name: string }

function Stock() {
  const list = useListQuery<StockRow>('inventory-stock', '/inventory/stock');
  const { data: lookups } = useLookups();
  const f = list.filters;
  return (
    <Card padded={false}>
      <FilterBar>
        <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Code or name" className="sm:w-64" />
        <Select value={f.branch_id ?? ''} onChange={(e) => list.setFilter('branch_id', e.target.value)} className="sm:w-48" aria-label="Branch">
          <option value="">All branches</option>
          {lookups?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={f.type ?? ''} onChange={(e) => list.setFilter('type', e.target.value)} className="sm:w-40" aria-label="Type">
          <option value="">All types</option>
          <option value="spare">Spares</option>
          <option value="consumable">Consumables</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={f.low_stock === '1'} onChange={(e) => list.setFilter('low_stock', e.target.checked ? '1' : '')} />
          Low stock only
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        rowClassName={(r) => (Number(r.is_low) ? 'bg-red-50/50' : undefined)}
        empty={<EmptyState title="No stock records" message="Record a stock-in to start tracking branch quantities." />}
        columns={[
          { key: 'item', header: 'Item', render: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="font-mono text-xs text-slate-500">{r.code}</p></div> },
          { key: 'branch', header: 'Branch', render: (r) => r.branch_name },
          { key: 'type', header: 'Type', hideOnMobile: true, render: (r) => label(r.type) },
          {
            key: 'qty',
            header: 'On hand',
            className: 'tabular-nums',
            render: (r) => (
              <span className="flex items-center gap-2">
                {qty(r.quantity_available)} {r.unit_of_measure}
                {Number(r.is_low) === 1 && <Badge tone="red">Reorder at {qty(r.reorder_level)}</Badge>}
              </span>
            ),
          },
          { key: 'cost', header: 'Avg cost', hideOnMobile: true, render: (r) => money(r.avg_unit_cost), className: 'text-right tabular-nums', headerClassName: 'text-right' },
          { key: 'value', header: 'Value', render: (r) => money(Number(r.stock_value)), className: 'text-right tabular-nums', headerClassName: 'text-right' },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
    </Card>
  );
}

interface TxRow { id: number; type: string; quantity: number; balance_after: number; unit_cost: number; invoice_ref: string | null; remarks: string | null; reference_type: string | null; created_at: string; item?: { code: string; name: string; unit_of_measure: string }; branch?: Named; supplier?: Named | null; creator?: Named | null }

function Transactions() {
  const list = useListQuery<TxRow>('inventory-tx', '/inventory/transactions');
  const f = list.filters;
  const tone: Record<string, 'green' | 'red' | 'blue' | 'amber' | 'slate'> = { stock_in: 'green', stock_out: 'red', transfer_in: 'blue', transfer_out: 'blue', adjustment: 'amber', return: 'slate' };
  return (
    <Card padded={false}>
      <FilterBar>
        <Select value={f.type ?? ''} onChange={(e) => list.setFilter('type', e.target.value)} className="sm:w-44" aria-label="Movement type">
          <option value="">All movements</option>
          {Object.keys(tone).map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </Select>
        <Input type="date" value={f.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From" />
        <Input type="date" value={f.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To" />
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        columns={[
          { key: 'date', header: 'When', render: (t) => dateTime(t.created_at) },
          { key: 'item', header: 'Item', render: (t) => <span>{t.item?.name} <span className="font-mono text-xs text-slate-500">{t.item?.code}</span></span> },
          { key: 'branch', header: 'Branch', hideOnMobile: true, render: (t) => t.branch?.name },
          { key: 'type', header: 'Type', render: (t) => <Badge tone={tone[t.type] ?? 'slate'}>{label(t.type)}</Badge> },
          { key: 'qty', header: 'Qty', className: 'tabular-nums', render: (t) => <span className={t.quantity < 0 ? 'text-red-700' : 'text-emerald-700'}>{t.quantity > 0 ? '+' : ''}{qty(t.quantity)} {t.item?.unit_of_measure}</span> },
          { key: 'bal', header: 'Balance', hideOnMobile: true, className: 'tabular-nums', render: (t) => qty(t.balance_after) },
          { key: 'note', header: 'Details', hideOnMobile: true, render: (t) => <span className="text-xs text-slate-500">{[t.supplier?.name, t.invoice_ref, t.remarks, t.reference_type === 'job_visit' && 'Used on job'].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'by', header: 'By', hideOnMobile: true, render: (t) => t.creator?.name ?? '—' },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
    </Card>
  );
}

function Suppliers() {
  const list = useListQuery<Supplier>('suppliers', '/suppliers');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  return (
    <Card padded={false}>
      <FilterBar>
        <SearchInput value={list.filters.search ?? ''} onChange={(v) => list.setFilter('search', v)} className="sm:w-64" />
        <Button className="sm:ml-auto" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add supplier
        </Button>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        onRowClick={(s) => setEditing(s)}
        empty={<EmptyState title="No suppliers" />}
        columns={[
          { key: 'name', header: 'Supplier', render: (s) => <span className="font-medium text-slate-900">{s.name}</span> },
          { key: 'contact', header: 'Contact', render: (s) => [s.contact, s.phone].filter(Boolean).join(' · ') || '—' },
          { key: 'email', header: 'Email', hideOnMobile: true, render: (s) => s.email ?? '—' },
          { key: 'gstin', header: 'GSTIN', hideOnMobile: true, render: (s) => s.gstin ?? '—' },
          { key: 'edit', header: '', render: () => <Pencil className="h-4 w-4 text-slate-400" />, className: 'w-8' },
        ]}
      />
      {editing && <SupplierDialog supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: supplier?.name ?? '', contact: supplier?.contact ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', gstin: supplier?.gstin ?? '' });
  const m = useApiMutation(() => (supplier ? api.patch(`/suppliers/${supplier.id}`, form) : api.post('/suppliers', form)), { invalidate: [['suppliers']], toastValidation: false, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['name', 'contact', 'phone', 'email', 'gstin'] as const).map((k) => (
          <Field key={k} label={k === 'gstin' ? 'GSTIN' : label(k)} required={k === 'name'} error={fieldError(m.error, k)}>
            <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: k === 'gstin' ? e.target.value.toUpperCase() : e.target.value })} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}

// ---- Stock movements -----------------------------------------------------

function ItemPicker({ value, onChange }: { value: InventoryItem | null; onChange: (i: InventoryItem | null) => void }) {
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['item-pick', search], queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, per_page: 8, active: 1 }), enabled: !value });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
        <span>
          {value.name} <span className="font-mono text-xs text-slate-500">{value.code}</span>
        </span>
        <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <SearchInput value={search} onChange={setSearch} placeholder="Search item code or name" delay={200} />
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
        {q.data?.data.map((i) => (
          <button type="button" key={i.id} onClick={() => onChange(i)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
            <span>{i.name}</span>
            <span className="font-mono text-xs text-slate-500">{i.code}</span>
          </button>
        ))}
        {q.data && !q.data.data.length && <p className="px-3 py-2 text-sm text-slate-500">No items</p>}
      </div>
    </div>
  );
}

function StockIn({ onClose }: { onClose: () => void }) {
  const { data: lookups } = useLookups();
  const suppliers = useQuery({ queryKey: ['suppliers-all'], queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { per_page: 50 }) });
  const [branch, setBranch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [ref, setRef] = useState('');
  const [lines, setLines] = useState<{ item: InventoryItem | null; quantity: string; unit_cost: string }[]>([{ item: null, quantity: '', unit_cost: '' }]);
  const m = useApiMutation(
    () =>
      api.post('/inventory/stock-in', {
        branch_id: Number(branch || lookups?.branches[0]?.id),
        supplier_id: supplier || null,
        invoice_ref: ref || null,
        lines: lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, quantity: l.quantity, unit_cost: toMinor(l.unit_cost) })),
      }),
    { invalidate: [['inventory-items'], ['inventory-stock'], ['inventory-tx']], onSuccess: onClose },
  );
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + (parseFloat(l.quantity) || 0) * toMinor(l.unit_cost), 0);
  const err = m.error instanceof ApiError ? Object.values(m.error.errors)[0]?.[0] : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Stock in"
      description="Record items received from a supplier."
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-600">
            Purchase value <strong>{money(Math.round(total))}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!lines.some((l) => l.item && l.quantity)} onClick={() => m.mutate(undefined)}>
            Receive stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Branch" required>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">—</option>
              {suppliers.data?.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier invoice ref.">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid items-start gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_120px_140px_36px]">
              <ItemPicker value={l.item} onChange={(item) => setLine(i, { item, unit_cost: l.unit_cost })} />
              <Input placeholder={`Qty ${l.item ? `(${l.item.unit_of_measure})` : ''}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
              <Input placeholder="Unit cost" inputMode="decimal" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value.replace(/[^\d.]/g, '') })} />
              <Button variant="ghost" size="sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, { item: null, quantity: '', unit_cost: '' }])}>
            Add line
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Transfer({ onClose }: { onClose: () => void }) {
  const { data: lookups } = useLookups();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ from_branch_id: '', to_branch_id: '', quantity: '', remarks: '' });
  const m = useApiMutation(() => api.post('/inventory/transfer', { ...form, item_id: item?.id }), { invalidate: [['inventory-stock'], ['inventory-tx'], ['inventory-items']], toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal open onClose={onClose} title="Transfer stock" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!item} onClick={() => m.mutate(undefined)}>Transfer</Button></>}>
      <div className="space-y-4">
        <Field label="Item" required error={e('item_id')}>
          <ItemPicker value={item} onChange={setItem} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['from_branch_id', 'to_branch_id'] as const).map((k) => (
            <Field key={k} label={k === 'from_branch_id' ? 'From branch' : 'To branch'} required error={e(k)}>
              <Select value={form[k]} onChange={(ev) => setForm({ ...form, [k]: ev.target.value })}>
                <option value="">Select…</option>
                {lookups?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
        <Field label={`Quantity ${item ? `(${item.unit_of_measure})` : ''}`} required error={e('quantity')}>
          <Input inputMode="decimal" value={form.quantity} onChange={(ev) => setForm({ ...form, quantity: ev.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Remarks">
          <Input value={form.remarks} onChange={(ev) => setForm({ ...form, remarks: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function Adjust({ onClose }: { onClose: () => void }) {
  const { data: lookups } = useLookups();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ branch_id: '', direction: '-1', quantity: '', reason: '' });
  const m = useApiMutation(
    () => api.post('/inventory/adjust', { branch_id: form.branch_id || lookups?.branches[0]?.id, item_id: item?.id, quantity: Number(form.direction) * (parseFloat(form.quantity) || 0), reason: form.reason }),
    { invalidate: [['inventory-stock'], ['inventory-tx'], ['inventory-items']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal open onClose={onClose} title="Adjust stock" description="For breakage, loss or stock-count corrections. A reason is mandatory and kept in the audit trail." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!item} onClick={() => m.mutate(undefined)}>Save adjustment</Button></>}>
      <div className="space-y-4">
        <Field label="Item" required error={e('item_id')}>
          <ItemPicker value={item} onChange={setItem} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Branch" required>
            <Select value={form.branch_id} onChange={(ev) => setForm({ ...form, branch_id: ev.target.value })}>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Adjustment" required>
            <Select value={form.direction} onChange={(ev) => setForm({ ...form, direction: ev.target.value })}>
              <option value="-1">Reduce</option>
              <option value="1">Increase</option>
            </Select>
          </Field>
          <Field label="Quantity" required error={e('quantity')}>
            <Input inputMode="decimal" value={form.quantity} onChange={(ev) => setForm({ ...form, quantity: ev.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
        </div>
        <Field label="Reason" required error={e('reason')}>
          <Input value={form.reason} onChange={(ev) => setForm({ ...form, reason: ev.target.value })} placeholder="e.g. Damaged in transit / physical count" />
        </Field>
      </div>
    </Modal>
  );
}
