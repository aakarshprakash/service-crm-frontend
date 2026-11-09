import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Envelope } from '@/lib/api';
import { fieldError, useApiMutation, useLookups, useStaffOptions } from '@/lib/hooks';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import type { CustomerProduct, Job } from '@/lib/types';
import { Button, Combobox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { RichTextField } from '@/components/RichText';
import { ModelField, ProductCategoryField, ProductFields, productPayload, unitDraft, type ProductDraft } from '@/pages/customers/CustomerForm';
import { Hint } from '@/components/tutorial';

/** The dialogs opened from the job detail page. Each one does one job-level action. */

/** Fill in the unit's model once it is known (the job was logged without it). */
export function SetModelDialog({ job, unit, onClose }: { job: Job; unit: CustomerProduct; onClose: () => void }) {
  const [draft, setDraft] = useState<ProductDraft>(unitDraft(unit));
  const m = useApiMutation((body: object) => api.patch(`/customers/${job.customer_id}/products/${unit.id}`, body), {
    invalidate: [['job', String(job.id)], ['customer', String(job.customer_id)], ['lookups']],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Set the unit’s model"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} disabled={!draft.model_no.trim()} onClick={() => m.mutate(productPayload(draft))}>Save model</Button>
        </>
      }
    >
      <ModelField value={draft.model_no} onChange={(v) => setDraft({ ...draft, model_no: v })} brandId={draft.brand_id} error={m.error instanceof ApiError ? m.error.field('model_no') : undefined} />
    </Modal>
  );
}

/** Corrects the job's own details. Time and technician have their own dialogs because they notify people. */
export function EditJobDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  const unit = job.customer_product;
  // The product was logged with just its brand; model, serial and warranty are completed here.
  const [product, setProduct] = useState<ProductDraft>(unitDraft(unit));
  const [form, setForm] = useState({
    complaint_type_id: s(job.complaint_type_id),
    complaint_summary_id: s(job.complaint_summary_id),
    complaint_details: job.complaint_details_html ?? job.complaint_details ?? '',
    product_category: job.product_category ?? '',
    customer_satisfaction_code: job.customer_satisfaction_code ?? '',
    priority: job.priority as string,
    call_type: job.call_type,
    service_location_id: s(job.service_location_id),
    branch_id: s(job.branch_id),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const summaries = useMemo(
    () => (lookups?.complaint_summaries ?? [])
      .filter((c) => !form.complaint_type_id || !c.complaint_type_id || c.complaint_type_id === Number(form.complaint_type_id))
      .map((c) => ({ value: String(c.id), label: c.name })),
    [lookups, form.complaint_type_id],
  );
  const id = (v: string) => (v ? Number(v) : null);
  const qc = useQueryClient();
  const m = useApiMutation(
    async (body: object) => {
      // 1. Save the product details (update the job's product, or record one if it had none).
      let productId = job.customer_product_id;
      const hasProduct = product.brand_id || product.model_no.trim() || product.category_id || product.serial_no.trim();
      if (productId) {
        await api.patch(`/customers/${job.customer_id}/products/${productId}`, productPayload(product));
      } else if (hasProduct) {
        productId = (await api.post<Envelope<CustomerProduct>>(`/customers/${job.customer_id}/products`, productPayload(product))).data.id;
      }
      // 2. Save the job.
      return api.patch(`/jobs/${job.id}`, { ...body, customer_product_id: productId ?? null });
    },
    {
      invalidate: [['job', String(job.id)], ['jobs'], ['lookups']],
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['customer', String(job.customer_id)] });
        onClose();
      },
    },
  );
  const f = (k: string) => fieldError(m.error, k);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Edit ${job.crm_call_id}`}
      description="Use Reschedule to change the visit time and Assign to change the technician."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={m.isPending}
            onClick={() =>
              m.mutate({
                ...form,
                // Portal jobs keep their call type: it can't be picked by hand.
                call_type: form.call_type === job.call_type ? undefined : form.call_type,
                complaint_type_id: id(form.complaint_type_id),
                complaint_summary_id: id(form.complaint_summary_id),
                service_location_id: id(form.service_location_id),
                branch_id: id(form.branch_id),
                complaint_details: form.complaint_details || null,
                product_category: form.product_category.trim() || null,
                customer_satisfaction_code: form.customer_satisfaction_code.trim() || null,
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Product details</p>
      <ProductFields
        value={product}
        onChange={setProduct}
        error={m.error instanceof ApiError ? m.error : null}
        title={null}
        extra={<ProductCategoryField value={form.product_category} onChange={(v) => set('product_category', v)} error={f('product_category')} />}
      />
      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Complaint & job</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Service type" error={f('complaint_type_id')}>
          <Combobox
            value={form.complaint_type_id}
            onChange={(v) => setForm((x) => ({ ...x, complaint_type_id: v, complaint_summary_id: '' }))}
            options={(lookups?.complaint_types ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="Select…"
            aria-label="Service type"
            searchable
          />
        </Field>
        <Field label="Breakdown / complaint summary" error={f('complaint_summary_id')}>
          <Combobox value={form.complaint_summary_id} onChange={(v) => set('complaint_summary_id', v)} options={summaries} placeholder={summaries.length ? 'Select…' : 'None configured'} disabled={!summaries.length} aria-label="Complaint summary" searchable />
        </Field>
        <Field label="Job summary" className="sm:col-span-2" error={f('complaint_details')}>
          <RichTextField value={form.complaint_details} onChange={(html) => set('complaint_details', html)} />
        </Field>
        <Field label="Customer Satisfaction Code" className="sm:col-span-2" error={f('customer_satisfaction_code')} hint="Given by the customer. The technician usually enters it.">
          <Input value={form.customer_satisfaction_code} onChange={(e) => set('customer_satisfaction_code', e.target.value)} maxLength={50} autoComplete="off" />
        </Field>
        <Field label="Priority" required>
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Call type" required error={f('call_type')}>
          <Select value={form.call_type} onChange={(e) => set('call_type', e.target.value)}>
            <option value="crm_call">CRM call</option>
            <option value="walk_in">Walk-in</option>
            <option value="referral">Referral</option>
            {form.call_type === 'portal' && <option value="portal">Customer portal</option>}
          </Select>
        </Field>
        {(lookups?.service_locations.length ?? 0) > 0 && (
          <Field label="Service location" error={f('service_location_id')}>
            <Select value={form.service_location_id} onChange={(e) => set('service_location_id', e.target.value)}>
              <option value="">Not specified</option>
              {lookups?.service_locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(lookups?.branches.length ?? 0) > 1 && (
          <Field label="Branch" error={f('branch_id')}>
            <Select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
              <option value="">Not specified</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** Technicians as searchable options, on-duty first, with their current workload. */
function useTechOptions() {
  const { data: techs } = useStaffOptions('technician');
  return useMemo(
    () => [...(techs ?? [])]
      .sort((a, b) => Number(b.punch_status === 'in') - Number(a.punch_status === 'in') || a.name.localeCompare(b.name))
      .map((t) => ({
        value: String(t.id),
        label: t.name,
        hint: [t.punch_status === 'in' ? 'On duty' : 'Off duty', t.open_jobs !== undefined ? `${t.open_jobs} open job${t.open_jobs === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
        group: t.punch_status === 'in' ? 'On duty' : 'Off duty',
      })),
    [techs],
  );
}

export function AssignDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const techOptions = useTechOptions();
  const [tech, setTech] = useState(String(job.assigned_technician_id ?? ''));
  const [when, setWhen] = useState(toLocalInput(job.scheduled_at));
  const m = useApiMutation((body: object) => api.patch(`/jobs/${job.id}/assign`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  const auto = useApiMutation(() => api.post(`/jobs/${job.id}/auto-assign`), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={job.technician ? 'Reassign technician' : 'Assign technician'}
      description="The technician gets a push notification and the customer an SMS/WhatsApp update."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Hint text="Picks the technician linked to this job’s service location (or its branch, if it has no location) who has the fewest open jobs.">
            <Button variant="secondary" loading={auto.isPending} onClick={() => auto.mutate(undefined)}>
              Auto-assign
            </Button>
          </Hint>
          <Button loading={m.isPending} disabled={!tech} onClick={() => m.mutate({ technician_id: Number(tech), scheduled_at: fromLocalInput(when) })}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Technician" error={fieldError(m.error, 'technician_id') ?? fieldError(m.error, 'assigned_technician_id') ?? fieldError(m.error, 'technician')}>
          <Combobox value={tech} onChange={setTech} options={techOptions} placeholder="Select technician…" searchPlaceholder="Search technician…" aria-label="Technician" searchable />
        </Field>
        <Field label="Visit date & time">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Parks the job until a part arrives; opened again, it corrects the note. */
export function PartPendingDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [note, setNote] = useState(job.part_pending_note ?? '');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/part-pending`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Waiting for a part"
      description="The job stays open and is listed under Part pending until you mark the part received."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate({ note: note.trim() })}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Which part is needed?" required error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Compressor 1.5 ton, ordered from the dealer on Monday" />
      </Field>
    </Modal>
  );
}

export function RescheduleDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const [when, setWhen] = useState(toLocalInput(job.scheduled_at));
  const [reason, setReason] = useState('');
  const m = useApiMutation((body: object) => api.patch(`/jobs/${job.id}/reschedule`, body), { invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  // The same dialog sets the first visit date; it's only a "reschedule" once there is one.
  const first = !job.scheduled_at;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={first ? 'Set visit date' : 'Reschedule visit'}
      description="The assigned technician is notified."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!when} onClick={() => m.mutate({ scheduled_at: fromLocalInput(when), reason })}>
            {first ? 'Save visit date' : 'Reschedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New date & time" required error={fieldError(m.error, 'scheduled_at')}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer requested evening slot" maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

/** Closes the job as cancelled. It can't be saved without a reason; approving starts from the technician's. */
export function CancelDialog({ job, approving = false, onClose }: { job: Job; approving?: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(approving ? job.cancel_reason ?? '' : '');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/cancel${approving ? '/approve' : ''}`, body), { toastValidation: false, invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={approving ? 'Approve the cancellation?' : 'Cancel this job?'}
      description={approving ? 'The job closes as cancelled and the technician is told. This can’t be undone.' : 'The job closes as cancelled and any running visit is stopped. This can’t be undone.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button variant="danger" loading={m.isPending} disabled={!reason.trim()} onClick={() => m.mutate({ reason: reason.trim() })}>
            {approving ? 'Approve & cancel job' : 'Cancel job'}
          </Button>
        </>
      }
    >
      <Field label="Reason for cancelling" required error={fieldError(m.error, 'reason') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer has sold the unit" />
      </Field>
    </Modal>
  );
}

/** Keeps the job open: it goes back to Pending and the technician sees why. */
export function RejectCancelDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/cancel/reject`, body), { toastValidation: false, invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Reject the cancellation?"
      description="The job goes back to Pending and the technician is told why."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate({ note: note.trim() })}>
            Reject cancellation
          </Button>
        </>
      }
    >
      <Field label="Why does the job stay open?" required error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer still wants the repair" />
      </Field>
    </Modal>
  );
}

/** The job stays pending with its technician; they're told why they can't go back yet. */
export function RejectResumeDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation((body: object) => api.post(`/jobs/${job.id}/resume/reject`, body), { toastValidation: false, invalidate: [['job', String(job.id)], ['jobs']], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Not ready to resume?"
      description="The job stays pending with the same technician, and they’re told why."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate({ note: note.trim() })}>
            Tell the technician
          </Button>
        </>
      }
    >
      <Field label="Why not yet?" required error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The part arrives on Monday" />
      </Field>
    </Modal>
  );
}

export function FollowUpDialog({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const techOptions = useTechOptions();
  const [form, setForm] = useState({ scheduled_at: '', complaint_details: '', assigned_technician_id: String(job.assigned_technician_id ?? '') });
  const m = useApiMutation((body: object) => api.post<Envelope<Job>>(`/jobs/${job.id}/follow-up`, body), {
    invalidate: [['job', String(job.id)], ['jobs']],
    onSuccess: (r) => {
      onClose();
      window.location.assign(`/jobs/${r.data.id}`);
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create follow-up call"
      description="A reminder / 2nd service call linked to this job."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={m.isPending}
            onClick={() => m.mutate({ ...form, scheduled_at: fromLocalInput(form.scheduled_at), assigned_technician_id: form.assigned_technician_id ? Number(form.assigned_technician_id) : null })}
          >
            Create follow-up
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Visit date & time">
          <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        </Field>
        <Field label="Technician">
          <Combobox value={form.assigned_technician_id} onChange={(v) => setForm({ ...form, assigned_technician_id: v })} options={techOptions} placeholder="Assign later" aria-label="Technician" searchable />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={form.complaint_details} onChange={(e) => setForm({ ...form, complaint_details: e.target.value })} placeholder="e.g. Periodic service due / check gas pressure" />
        </Field>
      </div>
    </Modal>
  );
}
