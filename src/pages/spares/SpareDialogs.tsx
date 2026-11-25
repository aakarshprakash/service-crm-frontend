import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal, Textarea } from '@/components/ui';
import { COVERAGE_LABEL, Segmented, StageBadge, type BrandSpare, type Coverage } from './sparesParts';

export type BulkAction = 'coverage' | 'inspect' | 'send' | 'fresh' | 'ow_billed' | 'company_cleared' | 'delete';

/** Which lines a bulk action applies to: the ticked ones, or everything the list's filters match. */
export type Target = { ids: number[] } | { filter: Record<string, string> };

export const ACTION_LABEL: Record<BulkAction, string> = {
  coverage: 'Mark warranty or OW',
  inspect: 'Add inspection no.',
  send: 'Send by courier',
  fresh: 'Mark as fresh return',
  ow_billed: 'Lloyd billed it as OW',
  company_cleared: 'Lloyd has received it',
  delete: 'Delete',
};

const plural = (n: number) => (n === 1 ? '1 part' : `${n.toLocaleString('en-IN')} parts`);

/** One action on many parts. The fields asked for are only the ones that action needs. */
export function BulkDialog({ action, target, count, couriers, onClose, onDone }: {
  action: BulkAction | null;
  target: Target;
  count: number;
  couriers: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const run = useApiMutation(() => api.post('/spares/bulk', { action, ...target, ...f }), { invalidate: [['spares']], onSuccess: onDone, toastValidation: false });
  // Fresh defaults each time a dialog opens; the most used courier is the likely one.
  const usualCourier = couriers[0] ?? '';
  const { reset } = run;
  useEffect(() => {
    if (!action) return;
    reset();
    setF({ coverage: 'warranty', lr_date: today(), ow_billed_on: today(), courier: usualCourier });
  }, [action, usualCourier, reset]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const err = (k: string) => fieldError(run.error, k);
  // Errors about which parts were chosen (too many, nothing chosen) rather than about a field.
  const choiceError = err('ids') ?? err('filter');
  const choiceAlert = choiceError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{choiceError}</p>;
  if (!action) return null;

  if (action === 'delete' || action === 'fresh' || action === 'company_cleared') {
    const copy = {
      delete: { title: `Delete ${plural(count)}?`, message: 'Use this only for lines added by mistake. The brand\'s bill is not changed.', confirm: 'Delete' },
      fresh: { title: `Return ${plural(count)} as fresh?`, message: 'Fresh parts were never fitted. They go back unused, so no inspection number is needed: they move to Ready to send.', confirm: 'Mark as fresh return' },
      company_cleared: { title: `Lloyd has received ${plural(count)}?`, message: 'Takes these parts off the brand\'s pending list here. Do this once Lloyd confirms they arrived.', confirm: 'Mark received' },
    }[action];
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={() => run.mutate(undefined)}
        loading={run.isPending}
        tone={action === 'delete' ? 'danger' : 'primary'}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirm}
      >
        {choiceAlert}
      </ConfirmDialog>
    );
  }

  const titles: Record<string, string> = {
    coverage: `Mark ${plural(count)} as`,
    inspect: `Add the inspection number to ${plural(count)}`,
    send: `Send ${plural(count)} by courier`,
    ow_billed: `Lloyd billed ${plural(count)} as out of warranty`,
  };
  const descriptions: Record<string, string> = {
    coverage: 'Warranty parts go back to Lloyd. Out of warranty and stock parts need nothing returned.',
    inspect: 'One inspection usually covers a batch, so the same number goes on every selected part.',
    send: 'The same LR goes on every selected part. Out of warranty and stock parts are left out.',
    ow_billed: 'For warranty parts Lloyd charged to you, for example because they were not returned in time. They move to Closed.',
  };
  const confirm: Record<string, string> = { coverage: 'Save', inspect: 'Add inspection no.', send: 'Mark as sent', ow_billed: 'Mark billed as OW' };

  return (
    <Modal
      open
      onClose={onClose}
      title={titles[action]}
      description={descriptions[action]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bulk-form" loading={run.isPending}>{confirm[action]}</Button>
        </>
      }
    >
      <form id="bulk-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.mutate(undefined); }}>
        {choiceAlert}
        {action === 'coverage' && (
          <Segmented<Coverage>
            label="Coverage"
            value={(f.coverage ?? 'warranty') as Coverage}
            onChange={(v) => setF((p) => ({ ...p, coverage: v }))}
            options={(Object.keys(COVERAGE_LABEL) as Coverage[]).map((c) => ({ value: c, label: COVERAGE_LABEL[c] }))}
          />
        )}
        {action === 'inspect' && (
          <>
            <Field label="Inspection number" required error={err('inspection_no')} hint="As on the brand's inspection, for example 3925016159W or WI3925000598.">
              <Input value={f.inspection_no ?? ''} onChange={set('inspection_no')} invalid={!!err('inspection_no')} autoComplete="off" />
            </Field>
            <Field label="RMA or challan number" error={err('rma_no')} hint="Optional. Add it now if the challan is already made.">
              <Input value={f.rma_no ?? ''} onChange={set('rma_no')} autoComplete="off" />
            </Field>
          </>
        )}
        {action === 'send' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Handed over on" required error={err('lr_date')}>
              <Input type="date" value={f.lr_date ?? ''} max={today()} onChange={set('lr_date')} invalid={!!err('lr_date')} />
            </Field>
            <Field label="Courier" required error={err('courier')}>
              <Input value={f.courier ?? ''} onChange={set('courier')} list="spare-couriers" invalid={!!err('courier')} autoComplete="off" />
              <datalist id="spare-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="LR number" error={err('lr_number')} hint="From the courier's receipt, for example C1704030.">
              <Input value={f.lr_number ?? ''} onChange={set('lr_number')} autoComplete="off" />
            </Field>
            <Field label="RMA or challan number" error={err('rma_no')}>
              <Input value={f.rma_no ?? ''} onChange={set('rma_no')} autoComplete="off" />
            </Field>
          </div>
        )}
        {action === 'ow_billed' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billed on" required error={err('ow_billed_on')}>
              <Input type="date" value={f.ow_billed_on ?? ''} max={today()} onChange={set('ow_billed_on')} />
            </Field>
            <Field label="Lloyd's bill number" error={err('ow_bill_no')}>
              <Input value={f.ow_bill_no ?? ''} onChange={set('ow_bill_no')} autoComplete="off" />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

type Form = Record<string, string>;

const toForm = (s: BrandSpare | null): Form => ({
  billing_doc: s?.billing_doc ?? '',
  billing_date: s?.billing_date ?? today(),
  material_code: s?.material_code ?? '',
  description: s?.description ?? '',
  quantity: String(s?.quantity ?? 1),
  value: toMajor(s?.value ?? 0),
  delivery_no: s?.delivery_no ?? '',
  po_number: s?.po_number ?? '',
  ticket_no: s?.ticket_no ?? '',
  customer_name: s?.customer_name ?? '',
  coverage: s?.coverage ?? '',
  return_type: s?.return_type ?? 'defective',
  inspection_no: s?.inspection_no ?? '',
  rma_no: s?.rma_no ?? '',
  lr_number: s?.lr_number ?? '',
  lr_date: s?.lr_date ?? '',
  courier: s?.courier ?? '',
  ow_billed: s?.ow_billed ? '1' : '',
  ow_billed_on: s?.ow_billed_on ?? '',
  ow_bill_no: s?.ow_bill_no ?? '',
  company_pending: s?.company_pending ? '1' : '',
  remarks: s?.remarks ?? '',
});

/** Payload for the API: empty text becomes null, money goes to paise. */
const toPayload = (f: Form) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = v === '' ? null : v;
  return {
    ...out,
    // A blank quantity means one; a typed 0 stays 0.
    quantity: f.quantity.trim() === '' || !Number.isFinite(Number(f.quantity)) ? 1 : Number(f.quantity),
    value: toMinor(f.value),
    return_type: f.return_type || 'defective',
    ow_billed: f.ow_billed === '1',
    company_pending: f.company_pending === '1',
  };
};

/** One part: everything from the brand's bill, the customer it went to, and its return. */
export function SpareEditor({ spare, open, couriers, onClose }: { spare: BrandSpare | null; open: boolean; couriers: string[]; onClose: () => void }) {
  const [f, setF] = useState<Form>(toForm(spare));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useApiMutation(
    () => (spare ? api.patch(`/spares/${spare.id}`, toPayload(f)) : api.post('/spares', toPayload(f))),
    { invalidate: [['spares']], onSuccess: onClose, toastValidation: false },
  );
  // Each opening starts clean: the part's own values, no errors from the last try.
  const { reset } = save;
  useEffect(() => {
    if (!open) return;
    reset();
    setF(toForm(spare));
  }, [open, spare, reset]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const remove = useApiMutation(() => api.delete(`/spares/${spare?.id}`), { invalidate: [['spares']], onSuccess: () => { setConfirmDelete(false); onClose(); } });
  const err = (k: string) => fieldError(save.error, k);
  const warranty = f.coverage === 'warranty';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={spare ? spare.description || spare.material_code : 'Add a part'}
      description={spare ? <span className="inline-flex flex-wrap items-center gap-2">{spare.material_code}, bill {spare.billing_doc} on {date(spare.billing_date)}, {money(spare.value)} <StageBadge spare={spare} /></span> : 'For a part on a brand bill that was not uploaded.'}
      footer={
        <>
          {spare && <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="spare-form" loading={save.isPending}>{spare ? 'Save changes' : 'Add part'}</Button>
        </>
      }
    >
      <form id="spare-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Return to Lloyd</h3>
          <Segmented
            label="Coverage"
            value={f.coverage}
            onChange={(v) => setF((p) => ({ ...p, coverage: v }))}
            options={[{ value: 'warranty', label: 'Warranty' }, { value: 'out_of_warranty', label: 'Out of warranty' }, { value: 'stock', label: 'For stock' }, { value: '', label: 'Not sorted' }]}
          />
          {warranty && (
            <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Part going back">
                <Segmented label="Part going back" value={f.return_type ?? 'defective'} onChange={(v) => setF((p) => ({ ...p, return_type: v }))} options={[{ value: 'defective', label: 'Faulty part' }, { value: 'fresh', label: 'Fresh, unused' }]} />
              </Field>
              <Field label="Inspection number" error={err('inspection_no')}>
                <Input value={f.inspection_no} onChange={set('inspection_no')} autoComplete="off" />
              </Field>
              <Field label="RMA or challan number" error={err('rma_no')}>
                <Input value={f.rma_no} onChange={set('rma_no')} autoComplete="off" />
              </Field>
              <Field label="Handed to courier on" error={err('lr_date')}>
                <Input type="date" value={f.lr_date} onChange={set('lr_date')} />
              </Field>
              <Field label="Courier" error={err('courier')}>
                <Input value={f.courier} onChange={set('courier')} list="spare-editor-couriers" autoComplete="off" />
                <datalist id="spare-editor-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="LR number" error={err('lr_number')}>
                <Input value={f.lr_number} onChange={set('lr_number')} autoComplete="off" />
              </Field>
              <div className="space-y-3 sm:col-span-2 lg:col-span-3">
                <Checkbox
                  label="Lloyd billed this as out of warranty"
                  description="The part was charged to you instead of being returned. Nothing more to send."
                  checked={f.ow_billed === '1'}
                  onChange={(v) => setF((p) => ({ ...p, ow_billed: v ? '1' : '', ow_billed_on: v && !p.ow_billed_on ? today() : p.ow_billed_on }))}
                />
                {f.ow_billed === '1' && (
                  <div className="grid gap-4 pl-7 sm:grid-cols-2">
                    <Field label="Billed on" error={err('ow_billed_on')}><Input type="date" value={f.ow_billed_on} onChange={set('ow_billed_on')} /></Field>
                    <Field label="Lloyd's bill number" error={err('ow_bill_no')}><Input value={f.ow_bill_no} onChange={set('ow_bill_no')} /></Field>
                  </div>
                )}
                <Checkbox
                  label="On Lloyd's pending list"
                  description={spare?.company_checked_on ? `As of the list uploaded on ${date(spare.company_checked_on)}.` : 'Lloyd still waits for this part.'}
                  checked={f.company_pending === '1'}
                  onChange={(v) => setF((p) => ({ ...p, company_pending: v ? '1' : '' }))}
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Customer</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Ticket number"
              error={err('ticket_no')}
              hint={spare?.job ? <>Linked to job <Link className="font-medium text-brand-700 hover:underline" to={`/jobs/${spare.job.id}`}>{spare.job.crm_call_id}</Link>.</> : 'Lloyd\'s call number. It links to the job booked with the same External CRM call ID.'}
            >
              <Input value={f.ticket_no} onChange={set('ticket_no')} inputMode="numeric" autoComplete="off" />
            </Field>
            <Field label="Customer name" error={err('customer_name')}>
              <Input value={f.customer_name} onChange={set('customer_name')} />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">From Lloyd's bill</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Billing document" required error={err('billing_doc')}><Input value={f.billing_doc} onChange={set('billing_doc')} invalid={!!err('billing_doc')} /></Field>
            <Field label="Billing date" required error={err('billing_date')}><Input type="date" value={f.billing_date} onChange={set('billing_date')} /></Field>
            <Field label="Material code" required error={err('material_code')}><Input value={f.material_code} onChange={set('material_code')} invalid={!!err('material_code')} /></Field>
            <Field label="Value (₹)" error={err('value')}><Input value={f.value} onChange={set('value')} inputMode="decimal" /></Field>
            <Field label="Description" className="sm:col-span-2" error={err('description')}><Input value={f.description} onChange={set('description')} /></Field>
            <Field label="Quantity" error={err('quantity')}><Input value={f.quantity} onChange={set('quantity')} inputMode="decimal" /></Field>
            <Field label="PO number" error={err('po_number')}><Input value={f.po_number} onChange={set('po_number')} /></Field>
            <Field label="Delivery number" error={err('delivery_no')}><Input value={f.delivery_no} onChange={set('delivery_no')} /></Field>
          </div>
        </section>

        <Field label="Remarks" error={err('remarks')}>
          <Textarea value={f.remarks} onChange={set('remarks')} rows={2} />
        </Field>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(undefined)}
        loading={remove.isPending}
        title="Delete this part line?"
        message="Use this only for a line added by mistake. The brand's bill is not changed."
        confirmLabel="Delete"
      />
    </Modal>
  );
}
