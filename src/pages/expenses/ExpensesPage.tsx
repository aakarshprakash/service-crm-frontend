import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fieldError, useApiMutation, useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import type { Expense, ExpenseMethod } from '@/lib/types';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from '@/components/ui';
import { MethodLabel } from '@/components/domain';

const METHODS: ExpenseMethod[] = ['cash', 'upi', 'cheque', 'bank_transfer'];

export default function ExpensesPage() {
  const list = useListQuery<Expense>('expenses', '/expenses', {}, ({ new: _new, ...f }) => f);
  const { data: lookups } = useLookups();
  const [editing, setEditing] = useState<Expense | 'new' | null>(list.filters.new === '1' ? 'new' : null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const del = useApiMutation((e: Expense) => api.delete(`/expenses/${e.id}`), { invalidate: [['expenses'], ['books']], onSuccess: () => setDeleting(null) });
  const showClear = Object.keys(list.filters).some((k) => k !== 'new');
  const f = list.filters;
  const total = list.data?.meta.total_amount as number | undefined;
  const byCategory = Object.entries((list.data?.meta.by_category as Record<string, number> | undefined) ?? {});

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Money your business spends: fuel, salaries, rent, parts purchases and more."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add expense
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total (filtered)" value={money(total ?? 0)} tone="red" />
        {byCategory.slice(0, 3).map(([name, amount]) => (
          <StatCard key={name} label={name} value={money(amount)} tone="slate" />
        ))}
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Paid to, description or reference" className="sm:w-64" />
          <Select value={f.category_id ?? ''} onChange={(e) => list.setFilter('category_id', e.target.value)} className="sm:w-48" aria-label="Category">
            <option value="">All categories</option>
            {lookups?.expense_categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={f.payment_method ?? ''} onChange={(e) => list.setFilter('payment_method', e.target.value)} className="sm:w-36" aria-label="Method">
            <option value="">Any method</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m === 'bank_transfer' ? 'Bank transfer' : m === 'upi' ? 'UPI' : m[0]!.toUpperCase() + m.slice(1)}
              </option>
            ))}
          </Select>
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={f.branch_id ?? ''} onChange={(e) => list.setFilter('branch_id', e.target.value)} className="sm:w-40" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
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
          onRowClick={(e) => setEditing(e)}
          empty={<EmptyState title="No expenses" message="Record what the business spends so Books can show your profit." />}
          columns={[
            { key: 'date', header: 'Date', render: (e) => <span className="font-medium text-slate-900">{date(e.expense_date)}</span> },
            {
              key: 'cat',
              header: 'Category',
              render: (e) => (
                <div>
                  <p>{e.category?.name ?? 'Uncategorised'}</p>
                  {e.description && <p className="max-w-xs truncate text-xs text-slate-500">{e.description}</p>}
                </div>
              ),
            },
            { key: 'to', header: 'Paid to', hideOnMobile: true, render: (e) => e.paid_to ?? '—' },
            {
              key: 'method',
              header: 'Method',
              hideOnMobile: true,
              render: (e) => (
                <div>
                  <MethodLabel method={e.payment_method} />
                  {e.reference_no && <p className="text-xs text-slate-500">{e.reference_no}</p>}
                </div>
              ),
            },
            { key: 'staff', header: 'Staff / branch', hideOnMobile: true, render: (e) => [e.user?.name, e.branch?.name].filter(Boolean).join(' · ') || '—' },
            { key: 'amt', header: 'Amount', render: (e) => <span className="font-medium">{money(e.amount)}</span>, className: 'text-right tabular-nums', headerClassName: 'text-right' },
            {
              key: 'act',
              header: '',
              className: 'text-right',
              render: (e) => (
                <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(e)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(e)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {editing && <ExpenseDialog expense={editing === 'new' ? null : editing} onClose={() => { setEditing(null); list.setFilter('new', null); }} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this expense?"
        message={deleting ? `${deleting.category?.name ?? 'Expense'} of ${money(deleting.amount)} on ${date(deleting.expense_date)} will be removed from your books.` : ''}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </>
  );
}

function ExpenseDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const { data: staff } = useStaffOptions();
  const [form, setForm] = useState({
    expense_date: expense?.expense_date ?? today(),
    expense_category_id: String(expense?.expense_category_id ?? ''),
    amount: toMajor(expense?.amount),
    payment_method: expense?.payment_method ?? 'cash',
    paid_to: expense?.paid_to ?? '',
    reference_no: expense?.reference_no ?? '',
    description: expense?.description ?? '',
    branch_id: String(expense?.branch_id ?? ''),
    user_id: String(expense?.user_id ?? ''),
  });
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const body = () => ({
    expense_date: form.expense_date,
    expense_category_id: form.expense_category_id ? Number(form.expense_category_id) : null,
    amount: toMinor(form.amount),
    payment_method: form.payment_method,
    paid_to: form.paid_to.trim() || null,
    reference_no: form.reference_no.trim() || null,
    description: form.description.trim() || null,
    branch_id: form.branch_id ? Number(form.branch_id) : null,
    user_id: form.user_id ? Number(form.user_id) : null,
  });
  const m = useApiMutation(() => (expense ? api.patch(`/expenses/${expense.id}`, body()) : api.post('/expenses', body())), {
    invalidate: [['expenses'], ['books']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const e = (n: string) => fieldError(m.error, n);
  const categories = lookups?.expense_categories ?? [];
  // Keep a deactivated category selectable when editing an old expense.
  const showOld = expense?.category && !categories.some((c) => c.id === expense.category!.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
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
        <Field label="Date" required error={e('expense_date')}>
          <Input type="date" value={form.expense_date} max={today()} onChange={(ev) => set('expense_date', ev.target.value)} />
        </Field>
        <Field label="Amount" required error={e('amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(ev) => set('amount', ev.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Category" required error={e('expense_category_id')} hint="Manage categories in Settings → Master data.">
          <Select value={form.expense_category_id} onChange={(ev) => set('expense_category_id', ev.target.value)}>
            <option value="">Select…</option>
            {showOld && <option value={expense!.category!.id}>{expense!.category!.name}</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid by" required error={e('payment_method')}>
          <Select value={form.payment_method} onChange={(ev) => set('payment_method', ev.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </Field>
        <Field label="Paid to" error={e('paid_to')}>
          <Input value={form.paid_to} maxLength={150} placeholder="e.g. HP petrol pump" onChange={(ev) => set('paid_to', ev.target.value)} />
        </Field>
        <Field label="Reference / bill no." error={e('reference_no')}>
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
        <Field label="For staff member" error={e('user_id')} hint="e.g. whose salary or fuel this is">
          <Select value={form.user_id} onChange={(ev) => set('user_id', ev.target.value)}>
            <option value="">—</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2" error={e('description')}>
          <Textarea rows={2} value={form.description} maxLength={500} onChange={(ev) => set('description', ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
