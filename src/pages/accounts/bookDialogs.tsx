import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { toMajor, toMinor, today } from '@/lib/format';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

/** Cash paid into the bank, or drawn from it: moves money between the cash and bank accounts, not income or expense. */
export function TransferDialog({ onClose, defaultDate }: { onClose: () => void; defaultDate?: string }) {
  const [form, setForm] = useState({ transfer_date: defaultDate ?? today(), direction: 'cash_to_bank', amount: '', reference_no: '', notes: '' });
  const m = useApiMutation(
    () => api.post('/books/transfers', { ...form, amount: toMinor(form.amount), reference_no: form.reference_no || null, notes: form.notes || null }),
    { invalidate: [['books']], toastValidation: false, onSuccess: onClose },
  );
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title="Cash to bank, or bank to cash"
      description="Paying office cash into the bank, or drawing cash from it. It is not income or an expense: the money only moves."
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
        <Field label="What happened" className="sm:col-span-2">
          <Select value={form.direction} onChange={(ev) => setForm({ ...form, direction: ev.target.value })}>
            <option value="cash_to_bank">Cash paid into the bank</option>
            <option value="bank_to_cash">Cash drawn from the bank</option>
          </Select>
        </Field>
        <Field label="Date" required error={e('transfer_date')}>
          <Input type="date" max={today()} value={form.transfer_date} onChange={(ev) => setForm({ ...form, transfer_date: ev.target.value })} />
        </Field>
        <Field label="Amount" required error={e('amount')}>
          <Input inputMode="decimal" value={form.amount} onChange={(ev) => setForm({ ...form, amount: ev.target.value.replace(/[^\d.]/g, '') })} autoFocus />
        </Field>
        <Field label="Deposit slip / reference" error={e('reference_no')} className="sm:col-span-2">
          <Input value={form.reference_no} maxLength={100} onChange={(ev) => setForm({ ...form, reference_no: ev.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

interface OpeningSettings {
  date: string | null;
  cash: number;
  bank: number;
}

/** What the business had in cash and in the bank on the day it started keeping its books in Servon. */
export function OpeningDialog({ onClose }: { onClose: () => void }) {
  const q = useQuery({
    queryKey: ['books', 'ledger', 'opening'],
    queryFn: () => api.get<Envelope<{ opening_settings: OpeningSettings }>>('/books/ledger', { book: 'cash', from: today(), to: today() }).then((r) => r.data.opening_settings),
  });
  return (
    <Modal open onClose={onClose} title="Opening balances" description="What you had in cash and in the bank on the day you start keeping books in Servon. Everything after that date is added automatically.">
      {q.data ? <OpeningForm initial={q.data} onClose={onClose} /> : <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}
    </Modal>
  );
}

function OpeningForm({ initial, onClose }: { initial: OpeningSettings; onClose: () => void }) {
  const [form, setForm] = useState({ date: initial.date ?? today().slice(0, 8) + '01', cash: toMajor(initial.cash) || '0', bank: toMajor(initial.bank) || '0' });
  const m = useApiMutation(() => api.put('/books/opening', { date: form.date, cash: toMinor(form.cash), bank: toMinor(form.bank) }), { invalidate: [['books']], toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <div className="space-y-4">
      <Field label="As on date" required error={e('date')} hint="Bills raised before this date and still unpaid are carried in as what customers owed.">
        <Input type="date" value={form.date} onChange={(ev) => setForm({ ...form, date: ev.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cash in hand" error={e('cash')}>
          <Input inputMode="decimal" value={form.cash} onChange={(ev) => setForm({ ...form, cash: ev.target.value.replace(/[^\d.-]/g, '') })} />
        </Field>
        <Field label="Bank balance" error={e('bank')}>
          <Input inputMode="decimal" value={form.bank} onChange={(ev) => setForm({ ...form, bank: ev.target.value.replace(/[^\d.-]/g, '') })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>
          Save
        </Button>
      </div>
    </div>
  );
}
