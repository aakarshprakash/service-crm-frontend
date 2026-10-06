import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Undo2, UserCheck } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, label, money } from '@/lib/format';
import type { Asset } from '@/lib/types';
import { Button, Card, DefinitionList, EmptyState, Field, Modal, PageHeader, QueryState, Select, Textarea } from '@/components/ui';
import { Hint } from '@/components/tutorial';
import { AssetDialog, AssetStatusBadge, ConditionSelect } from './assetParts';

export default function AssetDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const manage = can('assets.manage');
  const q = useQuery({ queryKey: ['asset', id], queryFn: () => api.get<Envelope<Asset>>(`/assets/${id}`).then((r) => r.data) });
  const [dialog, setDialog] = useState<'edit' | 'issue' | 'return' | 'status' | null>(null);
  const a = q.data;

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {a && (
        <>
          <PageHeader
            back={
              <Link to="/assets" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Assets
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                {a.name} <AssetStatusBadge status={a.status} />
              </span>
            }
            description={`${a.asset_code} · ${label(a.category)}${a.holder ? ` · with ${a.holder.name}` : ''}`}
            actions={
              manage && (
                <>
                  <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                  {a.status === 'assigned' ? (
                    <Hint text="Records that the technician handed the asset back, with the condition it came back in. You can also send it for repair or mark it lost here.">
                      <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => setDialog('return')}>
                        Take back
                      </Button>
                    </Hint>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => setDialog('status')}>
                        Change status
                      </Button>
                      {a.status === 'available' && (
                        <Hint text="Hands the asset to a technician. They get a notification, and it shows under My assets in their app until you take it back.">
                          <Button icon={<UserCheck className="h-4 w-4" />} onClick={() => setDialog('issue')}>
                            Issue
                          </Button>
                        </Hint>
                      )}
                    </>
                  )}
                </>
              )
            }
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Details">
                <DefinitionList
                  items={[
                    ['Brand / model', [a.brand, a.model].filter(Boolean).join(' ') || '—'],
                    ['Serial / reg. no.', a.serial_no ?? '—'],
                    ['Condition', label(a.condition)],
                    ['Branch', a.branch?.name ?? '—'],
                    ['Purchased', a.purchase_date ? `${date(a.purchase_date)}${a.purchase_cost ? ` · ${money(a.purchase_cost)}` : ''}` : a.purchase_cost ? money(a.purchase_cost) : '—'],
                    ['Warranty until', date(a.warranty_expiry)],
                  ]}
                />
                {a.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{a.notes}</p>}
              </Card>
              <Card title="Issue history" padded={false}>
                {!a.assignments?.length ? (
                  <EmptyState title="Never issued" message="Issue it to a technician to start its history." />
                ) : (
                  <ol className="divide-y divide-slate-100">
                    {a.assignments.map((h) => (
                      <li key={h.id} className="px-5 py-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">{h.user?.name}</p>
                          <p className="text-xs text-slate-500">{h.returned_at ? `${dateTime(h.issued_at)} → ${dateTime(h.returned_at)}` : `Since ${dateTime(h.issued_at)}`}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          Issued {h.issue_condition && `in ${h.issue_condition} condition `}
                          {h.issuer && `by ${h.issuer.name}`}
                          {h.issue_notes && ` — ${h.issue_notes}`}
                        </p>
                        {h.returned_at ? (
                          <p className="text-xs text-slate-600">
                            Returned {h.return_condition && `in ${h.return_condition} condition `}
                            {h.receiver && `to ${h.receiver.name}`}
                            {h.return_notes && ` — ${h.return_notes}`}
                          </p>
                        ) : (
                          <p className="text-xs font-medium text-brand-700">Currently held</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
            <div>
              <Card title="Current holder">
                {a.holder ? (
                  <>
                    <p className="font-medium">{a.holder.name}</p>
                    {a.holder.phone && <p className="text-sm text-slate-500">{a.holder.phone}</p>}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">{a.status === 'available' ? 'In the store, ready to issue.' : `Not issued (${label(a.status).toLowerCase()}).`}</p>
                )}
              </Card>
            </div>
          </div>
          {dialog === 'edit' && <AssetDialog asset={a} onClose={() => setDialog(null)} />}
          {dialog === 'issue' && <IssueDialog asset={a} onClose={() => setDialog(null)} />}
          {dialog === 'return' && <ReturnDialog asset={a} onClose={() => setDialog(null)} />}
          {dialog === 'status' && <StatusDialog asset={a} onClose={() => setDialog(null)} />}
        </>
      )}
    </QueryState>
  );
}

const invalidate = [['assets'], ['asset']];

function IssueDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { data: techs } = useStaffOptions('technician');
  const [form, setForm] = useState({ user_id: '', condition: asset.condition as string, notes: '' });
  const m = useApiMutation(() => api.post(`/assets/${asset.id}/issue`, { user_id: Number(form.user_id), condition: form.condition, notes: form.notes || null }), { invalidate, toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Issue ${asset.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!form.user_id} onClick={() => m.mutate(undefined)}>
            Issue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {e('status') && <p className="text-sm text-red-600">{e('status')}</p>}
        <Field label="Technician" required error={e('user_id')}>
          <Select value={form.user_id} onChange={(ev) => setForm({ ...form, user_id: ev.target.value })}>
            <option value="">Select…</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Condition when issued" error={e('condition')}>
          <ConditionSelect value={form.condition} onChange={(v) => setForm({ ...form, condition: v })} />
        </Field>
        <Field label="Notes" error={e('notes')}>
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} placeholder="e.g. with carry case and 2 hoses" />
        </Field>
      </div>
    </Modal>
  );
}

function ReturnDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [form, setForm] = useState({ condition: asset.condition as string, status: 'available', notes: '' });
  const m = useApiMutation(() => api.post(`/assets/${asset.id}/return`, { condition: form.condition, status: form.status, notes: form.notes || null }), { invalidate, toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Take back ${asset.name}`}
      description={asset.holder ? `From ${asset.holder.name}` : undefined}
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
      <div className="space-y-4">
        {e('status') && <p className="text-sm text-red-600">{e('status')}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Condition now" required error={e('condition')}>
            <ConditionSelect value={form.condition} onChange={(v) => setForm({ ...form, condition: v })} />
          </Field>
          <Field label="Then">
            <Select value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
              <option value="available">Back in store</option>
              <option value="under_repair">Send for repair</option>
              <option value="lost">Lost / not returned</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" required={form.status === 'lost'} error={e('notes')}>
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function StatusDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [form, setForm] = useState({ status: asset.status === 'available' ? 'under_repair' : 'available', notes: '' });
  const m = useApiMutation(() => api.patch(`/assets/${asset.id}/status`, { status: form.status, notes: form.notes || null }), { invalidate, toastValidation: false, onSuccess: onClose });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Modal
      open
      onClose={onClose}
      title="Change status"
      description="The note is added to the asset’s notes with today’s date."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={form.status === asset.status} onClick={() => m.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status" error={e('status')}>
          <Select value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
            <option value="available">Available (in store)</option>
            <option value="under_repair">Under repair</option>
            <option value="lost">Lost</option>
            <option value="retired">Retired / disposed</option>
          </Select>
        </Field>
        <Field label="Note" error={e('notes')}>
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
