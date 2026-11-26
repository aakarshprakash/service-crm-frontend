import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, money, toMajor, toMinor, today } from '@/lib/format';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal, Textarea } from '@/components/ui';
import { COVERAGE, OW_STAGE, Segmented, StatusBadge, type BrandSpare, type Coverage, type OwStage } from './sparesParts';

export type BulkAction = 'coverage' | 'inspect' | 'rma' | 'fresh' | 'send' | 'received' | 'ow_billed' | 'ow_paid' | 'company_cleared' | 'delete';

/** Which parts a step applies to: the ticked ones, or everything the list's filters match. */
export type Target = { ids: number[] } | { filter: Record<string, string> };

/** The words for each step, used on buttons, menus and dialogs alike. */
export const ACTION: Record<BulkAction, { label: string; help: string }> = {
  coverage: { label: 'Mark warranty or OW', help: 'Warranty parts go back to Lloyd; OW parts are billed by Lloyd.' },
  inspect: { label: 'Add inspection number', help: "Lloyd's inspection number for the faulty part." },
  rma: { label: 'Add RMA / challan', help: 'The RMA or delivery challan the parts go back on.' },
  fresh: { label: 'Return as fresh (unused)', help: 'Unused parts go back without an inspection.' },
  send: { label: 'Send to Lloyd by courier', help: 'The courier and LR they were handed over on.' },
  received: { label: 'Lloyd received it', help: 'Lloyd confirmed the parts arrived.' },
  ow_billed: { label: 'Lloyd billed it as OW', help: 'Lloyd raised its OW bill (light blue).' },
  ow_paid: { label: 'Mark OW paid', help: 'The OW bill was paid (grey).' },
  company_cleared: { label: "Remove from Lloyd's pending list", help: "Lloyd's list no longer shows them." },
  delete: { label: 'Delete', help: 'Only for lines added by mistake.' },
};

const parts = (n: number) => (n === 1 ? '1 part' : `${n.toLocaleString('en-IN')} parts`);

/** One step on many parts. It asks only for what that step needs, with today's date filled in. */
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
  const usualCourier = couriers[0] ?? '';
  const { reset } = run;
  useEffect(() => {
    if (!action) return;
    reset();
    const t = today();
    setF({ coverage: 'warranty', inspection_on: t, rma_on: t, lr_date: t, return_received_on: t, ow_billed_on: t, ow_paid_on: t, courier: usualCourier });
  }, [action, usualCourier, reset]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const err = (k: string) => fieldError(run.error, k);
  // About which parts were chosen (too many, nothing chosen) rather than a field.
  const choiceError = err('ids') ?? err('filter');
  const choiceAlert = choiceError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{choiceError}</p>;
  if (!action) return null;

  const confirmOnly: Partial<Record<BulkAction, { title: string; message: string; confirm: string; danger?: boolean }>> = {
    delete: { title: `Delete ${parts(count)}?`, message: "Use this only for lines added by mistake. Lloyd's bill is not changed.", confirm: 'Delete', danger: true },
    fresh: { title: `Return ${parts(count)} as fresh?`, message: 'Fresh parts were never fitted. They go back unused, so no inspection number is needed. They move to Pending dispatch.', confirm: 'Return as fresh' },
    company_cleared: { title: `Remove ${parts(count)} from Lloyd's pending list?`, message: "Do this when Lloyd's latest list no longer shows them.", confirm: 'Remove from the list' },
  };
  const c = confirmOnly[action];
  if (c) {
    return (
      <ConfirmDialog open onClose={onClose} onConfirm={() => run.mutate(undefined)} loading={run.isPending} tone={c.danger ? 'danger' : 'primary'} title={c.title} message={c.message} confirmLabel={c.confirm}>
        {choiceAlert}
      </ConfirmDialog>
    );
  }

  const dateField = (k: string, label: string) => (
    <Field label={label} required error={err(k)}>
      <Input type="date" value={f[k] ?? ''} max={today()} onChange={set(k)} invalid={!!err(k)} />
    </Field>
  );
  const text = (k: string, label: string, hint?: string, required?: boolean) => (
    <Field label={label} required={required} error={err(k)} hint={hint}>
      <Input value={f[k] ?? ''} onChange={set(k)} invalid={!!err(k)} autoComplete="off" />
    </Field>
  );

  const forms: Partial<Record<BulkAction, { title: string; body: ReactNode; confirm: string }>> = {
    coverage: {
      title: `Mark ${parts(count)} as`,
      confirm: 'Save',
      body: (
        <Segmented<Coverage> label="Warranty or OW" value={(f.coverage ?? 'warranty') as Coverage} onChange={(v) => setF((p) => ({ ...p, coverage: v }))}
          options={(Object.keys(COVERAGE) as Coverage[]).map((v) => ({ value: v, label: COVERAGE[v] }))} />
      ),
    },
    inspect: {
      title: `Add the inspection number to ${parts(count)}`,
      confirm: 'Add inspection number',
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          {text('inspection_no', 'Inspection number', 'As on the inspection, e.g. 3925016159W or WI3925000598.', true)}
          {dateField('inspection_on', 'Inspected on')}
          <div className="sm:col-span-2">{text('rma_no', 'RMA or challan number', 'Optional. Add it if the challan is already made.')}</div>
        </div>
      ),
    },
    rma: {
      title: `Add the RMA or challan to ${parts(count)}`,
      confirm: 'Add RMA / challan',
      body: <div className="grid gap-4 sm:grid-cols-2">{text('rma_no', 'RMA or challan number', 'e.g. DC2026114496, or MANUAL for a hand-written challan.', true)}{dateField('rma_on', 'Challan date')}</div>,
    },
    send: {
      title: `Send ${parts(count)} to Lloyd by courier`,
      confirm: 'Mark as sent',
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          {dateField('lr_date', 'Handed over on')}
          <Field label="Courier" required error={err('courier')}>
            <Input value={f.courier ?? ''} onChange={set('courier')} list="sapre-couriers" invalid={!!err('courier')} autoComplete="off" />
            <datalist id="sapre-couriers">{couriers.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          {text('lr_number', 'LR number', "From the courier's receipt, e.g. C1704030.")}
          {text('rma_no', 'RMA or challan number', 'If not added already.')}
        </div>
      ),
    },
    received: {
      title: `Lloyd received ${parts(count)}`,
      confirm: 'Mark received',
      body: <div className="grid gap-4 sm:grid-cols-2">{dateField('return_received_on', 'Received on')}<p className="self-end pb-2 text-sm text-slate-500">They move to Return completed.</p></div>,
    },
    ow_billed: {
      title: `Lloyd billed ${parts(count)} as out of warranty`,
      confirm: 'Mark billed',
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          {dateField('ow_billed_on', 'Billed on')}
          {text('ow_bill_no', "Lloyd's OW bill number", 'e.g. 5513508698.')}
          <p className="text-sm text-slate-500 sm:col-span-2">Warranty parts in the selection are charged to you as OW. They move to Payment pending (light blue).</p>
        </div>
      ),
    },
    ow_paid: {
      title: `Mark ${parts(count)} as paid`,
      confirm: 'Mark paid',
      body: <div className="grid gap-4 sm:grid-cols-2">{dateField('ow_paid_on', 'Paid on')}{text('ow_payment_ref', 'Payment reference', 'UTR, cheque or receipt number.')}</div>,
    },
  };
  const form = forms[action]!;

  return (
    <Modal
      open
      onClose={onClose}
      title={form.title}
      description={`${ACTION[action].help} Parts this step does not apply to are left as they are.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bulk-form" loading={run.isPending}>{form.confirm}</Button>
        </>
      }
    >
      <form id="bulk-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.mutate(undefined); }}>
        {choiceAlert}
        {form.body}
      </form>
    </Modal>
  );
}

type Form = Record<string, string>;

const FIELDS = [
  'billing_doc', 'billing_date', 'material_code', 'description', 'delivery_no', 'po_number', 'received_on', 'ticket_no', 'customer_name',
  'inspection_no', 'inspection_on', 'rma_no', 'rma_on', 'lr_number', 'lr_date', 'courier', 'return_received_on', 'replacement_doc',
  'replacement_material', 'replacement_on', 'ow_billed_on', 'ow_bill_no', 'ow_paid_on', 'ow_payment_ref', 'remarks',
] as const;

const toForm = (s: BrandSpare | null): Form => ({
  ...Object.fromEntries(FIELDS.map((k) => [k, (s?.[k] as string | null) ?? ''])),
  billing_date: s?.billing_date ?? today(),
  quantity: String(s?.quantity ?? 1),
  value: toMajor(s?.value ?? 0),
  coverage: s?.coverage ?? '',
  return_type: s?.return_type ?? 'defective',
  ow_billed: s?.ow_billed ? '1' : '',
  ow_stage: s?.ow_stage ?? 'marked',
  company_pending: s?.company_pending ? '1' : '',
});

/** Payload for the API: empty text becomes null, money goes to paise. */
const toPayload = (f: Form) => {
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
  const owPath = f.coverage === 'out_of_warranty' || (f.coverage === 'warranty' && f.ow_billed === '1');
  return {
    ...out,
    // A blank quantity means one; a typed 0 stays 0.
    quantity: (f.quantity ?? '').trim() === '' || !Number.isFinite(Number(f.quantity)) ? 1 : Number(f.quantity),
    value: toMinor(f.value),
    return_type: f.return_type || 'defective',
    ow_billed: f.coverage === 'warranty' && f.ow_billed === '1',
    ow_stage: owPath ? f.ow_stage : null,
    company_pending: f.company_pending === '1',
  };
};

/** One part, every field, grouped the way the work goes: warranty or OW, the return or the OW bill, the customer, Lloyd's bill. */
export function SpareEditor({ spare, open, couriers, onClose }: { spare: BrandSpare | null; open: boolean; couriers: string[]; onClose: () => void }) {
  const [f, setF] = useState<Form>(toForm(spare));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useApiMutation(
    () => (spare ? api.patch(`/spares/${spare.id}`, toPayload(f)) : api.post('/spares', toPayload(f))),
    { invalidate: [['spares']], onSuccess: onClose, toastValidation: false },
  );
  const remove = useApiMutation(() => api.delete(`/spares/${spare?.id}`), { invalidate: [['spares']], onSuccess: () => { setConfirmDelete(false); onClose(); } });
  const { reset } = save;
  useEffect(() => {
    if (!open) return;
    reset();
    setF(toForm(spare));
  }, [open, spare, reset]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const err = (k: string) => fieldError(save.error, k);
  const input = (k: string, label: string, opts: { type?: string; hint?: ReactNode; required?: boolean; className?: string; list?: string } = {}) => (
    <Field label={label} required={opts.required} error={err(k)} hint={opts.hint} className={opts.className}>
      <Input type={opts.type} value={f[k] ?? ''} onChange={set(k)} invalid={!!err(k)} autoComplete="off" list={opts.list} inputMode={k === 'value' || k === 'quantity' ? 'decimal' : undefined} />
    </Field>
  );
  const warranty = f.coverage === 'warranty';
  const owPath = f.coverage === 'out_of_warranty' || (warranty && f.ow_billed === '1');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={spare ? 'Edit part' : 'Add a part by hand'}
      description={spare
        ? <span className="inline-flex flex-wrap items-center gap-2">{spare.description || spare.material_code}, bill {spare.billing_doc}, {money(spare.value)} <StatusBadge status={spare.status} /></span>
        : 'For a part on a Lloyd bill that was not uploaded. Uploading that bill later updates this line instead of adding it twice.'}
      footer={
        <>
          {spare && <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="spare-form" loading={save.isPending}>{spare ? 'Save changes' : 'Add part'}</Button>
        </>
      }
    >
      <form id="spare-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Section title="Warranty or out of warranty" hint="The status moves on by itself as the fields below are filled.">
          <Segmented label="Warranty or OW" value={f.coverage} onChange={(v) => setF((p) => ({ ...p, coverage: v }))}
            options={[{ value: 'warranty', label: 'Warranty' }, { value: 'out_of_warranty', label: 'Out of warranty (OW)' }, { value: 'stock', label: 'For stock' }, { value: '', label: 'Not sorted' }]} />
        </Section>

        {warranty && (
          <Section title="Return to Lloyd" hint="Fill each step when it happens: inspection, challan, courier, Lloyd receiving it.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Part going back" className="lg:col-span-3">
                <Segmented label="Part going back" value={f.return_type} onChange={(v) => setF((p) => ({ ...p, return_type: v }))} options={[{ value: 'defective', label: 'Faulty part' }, { value: 'fresh', label: 'Fresh, unused' }]} />
              </Field>
              {input('inspection_no', 'Inspection number')}
              {input('inspection_on', 'Inspected on', { type: 'date' })}
              {input('rma_no', 'RMA or challan number')}
              {input('rma_on', 'Challan date', { type: 'date' })}
              {input('courier', 'Courier', { list: 'sapre-editor-couriers' })}
              {input('lr_number', 'LR number')}
              {input('lr_date', 'Handed to courier on', { type: 'date' })}
              {input('return_received_on', 'Lloyd received it on', { type: 'date' })}
              <datalist id="sapre-editor-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
              <p className="text-sm text-slate-600 sm:col-span-3">Replacement part issued after inspection, if any</p>
              {input('replacement_doc', 'Replacement billing document')}
              {input('replacement_material', 'Replacement material code')}
              {input('replacement_on', 'Issued on', { type: 'date' })}
            </div>
            <div className="mt-4">
              <Checkbox
                label="Lloyd charged this part to us as OW"
                description="It was not returned in time, or Lloyd refused it. It moves to OW billing."
                checked={f.ow_billed === '1'}
                onChange={(v) => setF((p) => ({ ...p, ow_billed: v ? '1' : '', ow_stage: v && p.ow_stage === 'marked' ? 'billed' : p.ow_stage }))}
              />
            </div>
          </Section>
        )}

        {owPath && (
          <Section title="OW billing" hint="The same colours as the Excel: orange, light blue, grey.">
            <Segmented<OwStage> label="OW stage" value={(f.ow_stage || 'marked') as OwStage} onChange={(v) => setF((p) => ({ ...p, ow_stage: v }))}
              options={(Object.keys(OW_STAGE) as OwStage[]).map((k) => ({
                value: k,
                label: <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${OW_STAGE[k].swatch}`} aria-hidden />{OW_STAGE[k].label}</span>,
              }))} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {input('ow_billed_on', 'Billed by Lloyd on', { type: 'date' })}
              {input('ow_bill_no', "Lloyd's OW bill number")}
              {input('ow_paid_on', 'Paid on', { type: 'date' })}
              {input('ow_payment_ref', 'Payment reference')}
            </div>
          </Section>
        )}

        <Section title="Customer">
          <div className="grid gap-4 sm:grid-cols-2">
            {input('ticket_no', 'EX CRM ID (ticket number)', {
              hint: spare?.job
                ? <>Linked to job <Link className="font-medium text-brand-700 hover:underline" to={`/jobs/${spare.job.id}`}>{spare.job.crm_call_id}</Link>.</>
                : 'Links by itself to the job with the same External CRM call ID.',
            })}
            {input('customer_name', 'Customer name')}
          </div>
        </Section>

        <Section title="From Lloyd's bill">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {input('billing_doc', 'Billing document', { required: true })}
            {input('billing_date', 'Billing date', { type: 'date', required: true })}
            {input('material_code', 'Material code', { required: true })}
            {input('value', 'Issued value (₹)')}
            {input('description', 'Item description', { className: 'sm:col-span-2' })}
            {input('quantity', 'Issued quantity')}
            {input('po_number', 'PO number')}
            {input('delivery_no', 'Delivery number', { hint: "Lloyd's delivery of the part to you." })}
            {input('received_on', 'Received on', { type: 'date' })}
          </div>
        </Section>

        <div className="space-y-4">
          <Checkbox
            label="On Lloyd's pending list"
            description={spare?.company_checked_on ? `As of the list uploaded on ${date(spare.company_checked_on)}.` : 'Lloyd still waits for this part.'}
            checked={f.company_pending === '1'}
            onChange={(v) => setF((p) => ({ ...p, company_pending: v ? '1' : '' }))}
          />
          <Field label="Remarks" error={err('remarks')}><Textarea value={f.remarks} onChange={set('remarks')} rows={2} /></Field>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(undefined)}
        loading={remove.isPending}
        title="Delete this part line?"
        message="Use this only for a line added by mistake. Lloyd's bill is not changed."
        confirmLabel="Delete"
      />
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
