import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fieldError, useApiMutation, useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import type { ExpenseMethod, Income } from '@/lib/types';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from '@/components/ui';
import { MethodLabel } from '@/components/domain';

const METHODS: ExpenseMethod[] = ['cash', 'upi', 'cheque', 'bank_transfer'];
const methodName = (m: string) => (m === 'bank_transfer' ? 'Bank transfer' : m === 'upi' ? 'UPI' : m[0]!.toUpperCase() + m.slice(1));

/**
 * Money received without an invoice: a service charge taken on the spot, a part sold over the counter, scrap,
 * commission. It goes into the cash or bank book by how it was paid, and into the register, day book and profit.
 */
export default function IncomePage() {
  const list = useListQuery<Income>('incomes', '/incomes', {}, ({ new: _new, ...f }) => f);
  const { data: lookups } = useLookups();
  const { data: staff } = useStaffOptions();
  const [editing, setEditing] = useState<Income | 'new' | null>(list.filters.new === '1' ? 'new' : null);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const del = useApiMutation((i: Income) => api.delete(`/incomes/${i.id}`), { invalidate: [['incomes'], ['books']], onSuccess: () => setDeleting(null) });
  const showClear = Object.keys(list.filters).some((k) => k !== 'new');
  const f = list.filters;
  const total = list.data?.meta.total_amount as number | undefined;
  const byCategory = Object.entries((list.data?.meta.by_category as Record<string, number> | undefined) ?? {});

  return (
    <>
      <PageHeader
        title="Income"
        description="Money received without an invoice: service charges taken on the spot, parts sold over the counter, scrap, commission. Invoice payments are recorded on the invoice."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add income
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total (filtered)" value={money(total ?? 0)} tone="green" />
        {byCategory.slice(0, 3).map(([name, amount]) => (
          <StatCard key={name} label={name} value={money(amount)} tone="slate" />
        ))}
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Received from, phone, description or reference" className="sm:w-72" />
          <Select value={f.category_id ?? ''} onChange={(e) => list.setFilter('category_id', e.target.value)} className="sm:w-48" aria-label="Category">
            <option value="">All categories</option>
            {lookups?.income_categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={f.payment_method ?? ''} onChange={(e) => list.setFilter('payment_method', e.target.value)} className="sm:w-36" aria-label="Method">
            <option value="">Any method</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {methodName(m)}
              </option>
            ))}
          </Select>
          <Select value={f.user_id ?? ''} onChange={(e) => list.setFilter('user_id', e.target.value)} className="sm:w-44" aria-label="Brought in by">
            <option value="">Anyone</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={f.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From date" />
          <Input type="date" value={f.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To date" />
          {showClear && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear
            </Button>
          )}
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(i) => setEditing(i)}
          empty={<EmptyState title="No income recorded" message="Add money received without an invoice, so the cash book and register match what you actually took in." />}
          columns={[
            { key: 'date', header: 'Date', render: (i) => <span className="font-medium text-slate-900">{date(i.income_date)}</span> },
            {
              key: 'from',
              header: 'Received from',
              render: (i) => (
                <div>
                  <p>{i.received_from ?? '—'}</p>
                  {i.phone && <p className="text-xs tabular-nums text-slate-500">{i.phone}</p>}
                </div>
              ),
            },
            {
              key: 'cat',
              header: 'Category',
              hideOnMobile: true,
              render: (i) => (
                <div>
                  <p>{i.category?.name ?? 'Uncategorised'}</p>
                  {i.description && <p className="max-w-xs truncate text-xs text-slate-500">{i.description}</p>}
                </div>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              hideOnMobile: true,
              render: (i) => (
                <div>
                  <MethodLabel method={i.payment_method} />
                  {i.reference_no && <p className="text-xs text-slate-500">{i.reference_no}</p>}
                </div>
              ),
            },
            { key: 'staff', header: 'Brought in by', hideOnMobile: true, render: (i) => i.user?.name ?? 'Office' },
            { key: 'amt', header: 'Amount', render: (i) => <span className="font-medium text-emerald-700">{money(i.amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            {
              key: 'act',
              header: '',
              className: 'text-right',
              render: (i) => (
                <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(i)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {editing && <IncomeDialog income={editing === 'new' ? null : editing} onClose={() => { setEditing(null); list.setFilter('new', null); }} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this income?"
        message={deleting ? `${money(deleting.amount)} from ${deleting.received_from ?? deleting.category?.name ?? 'income'} on ${date(deleting.income_date)} will be removed from your books.` : ''}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </>
  );
}

function IncomeDialog({ income, onClose }: { income: Income | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const { data: staff } = useStaffOptions();
  const [form, setForm] = useState({
    income_date: income?.income_date ?? today(),
    income_category_id: String(income?.income_category_id ?? ''),
    amount: toMajor(income?.amount),
    payment_method: income?.payment_method ?? 'cash',
    received_from: income?.received_from ?? '',
    phone: income?.phone ?? '',
    reference_no: income?.reference_no ?? '',
    description: income?.description ?? '',
    branch_id: String(income?.branch_id ?? ''),
    user_id: String(income?.user_id ?? ''),
  });
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const body = () => ({
    income_date: form.income_date,
    income_category_id: form.income_category_id ? Number(form.income_category_id) : null,
    amount: toMinor(form.amount),
    payment_method: form.payment_method,
    received_from: form.received_from.trim() || null,
    phone: form.phone.trim() || null,
    reference_no: form.reference_no.trim() || null,
    description: form.description.trim() || null,
    branch_id: form.branch_id ? Number(form.branch_id) : null,
    user_id: form.user_id ? Number(form.user_id) : null,
  });
  const m = useApiMutation(() => (income ? api.patch(`/incomes/${income.id}`, body()) : api.post('/incomes', body())), {
    invalidate: [['incomes'], ['books']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const e = (n: string) => fieldError(m.error, n);
  const categories = lookups?.income_categories ?? [];
  // Keep a deactivated category selectable when editing an old entry.
  const showOld = income?.category && !categories.some((c) => c.id === income.category!.id);
  const needsRef = form.payment_method === 'cheque' || form.payment_method === 'bank_transfer';

  return (
    <Modal
      open
      onClose={onClose}
      title={income ? 'Edit income' : 'Add income'}
      description="For money received without an invoice. A payment against an invoice is recorded on the invoice instead."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {income ? 'Save changes' : 'Add income'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required error={e('income_date')}>
          <Input type="date" value={form.income_date} max={today()} onChange={(ev) => set('income_date', ev.target.value)} />
        </Field>
        <Field label="Amount" required error={e('amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(ev) => set('amount', ev.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Category" required error={e('income_category_id')} hint="Manage categories in Settings → Master data.">
          <Select value={form.income_category_id} onChange={(ev) => set('income_category_id', ev.target.value)}>
            <option value="">Select…</option>
            {showOld && <option value={income!.category!.id}>{income!.category!.name}</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received by" required error={e('payment_method')} hint={form.payment_method === 'cash' ? 'Goes into the cash book.' : 'Goes into the bank book.'}>
          <Select value={form.payment_method} onChange={(ev) => set('payment_method', ev.target.value)}>
            {METHODS.map((mt) => (
              <option key={mt} value={mt}>
                {methodName(mt)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received from" error={e('received_from')} hint="The customer or party who paid.">
          <Input value={form.received_from} maxLength={150} placeholder="e.g. Balachandran" onChange={(ev) => set('received_from', ev.target.value)} />
        </Field>
        <Field label="Phone" error={e('phone')}>
          <Input value={form.phone} inputMode="tel" maxLength={20} onChange={(ev) => set('phone', ev.target.value.replace(/[^\d+ ]/g, ''))} />
        </Field>
        <Field label="Brought in by" error={e('user_id')} hint="The staff member who collected it. Shown as “From …” in the daily register.">
          <Select value={form.user_id} onChange={(ev) => set('user_id', ev.target.value)}>
            <option value="">Office (taken at the counter)</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / receipt no." required={needsRef} error={e('reference_no')} hint={needsRef ? 'Cheque number or UTR.' : undefined}>
          <Input value={form.reference_no} maxLength={100} onChange={(ev) => set('reference_no', ev.target.value)} />
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
        <Field label="Description" className="sm:col-span-2" error={e('description')}>
          <Textarea rows={2} value={form.description} maxLength={500} onChange={(ev) => set('description', ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
