import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowLeft, Building2, Camera, CheckCircle2, HandCoins, MapPin, MapPinOff, MessageCircle, Minus, Navigation, Phone, PhoneCall, Plus, QrCode, Search, Timer, Trash2, Wrench,
} from 'lucide-react';
import { UpiQrDialog } from '@/components/upi';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups, useNow, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, label, money, qty, toMajor, toMinor } from '@/lib/format';
import { cn, compressImage, getPosition } from '@/lib/utils';
import type { InventoryItem, Invoice, Job, Payment, Visit } from '@/lib/types';
import { Badge, Button, Card, Combobox, ConfirmDialog, DataTable, DefinitionList, Field, Input, Modal, QueryState, Select, Spinner, Tabs, Textarea, toast } from '@/components/ui';
import { MapEmbed, MethodLabel, PriorityBadge, StatusBadge } from '@/components/domain';
import { RecordPayment } from '@/pages/invoices/InvoiceDetail';
import { Hint } from '@/components/tutorial';
import { SignaturePad } from '@/components/SignaturePad';

export default function TechJobDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const q = useQuery({ queryKey: ['tech-job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const job = q.data;
  const active = job?.visits?.find((v) => v.status === 'in_progress');
  const [starting, setStarting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [completed, setCompleted] = useState<{ invoice: Invoice | null; payment: Payment | null; status: string } | null>(null);

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {job && (
        <div className="mx-auto max-w-2xl space-y-4">
          <Link to="/tech/jobs" className="inline-flex items-center gap-1 text-sm text-slate-500">
            <ArrowLeft className="h-4 w-4" /> {t('nav.myJobs')}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{job.crm_call_id}</h1>
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
          </div>

          {completed ? (
            <CompletionSummary result={completed} jobId={job.id} onDone={() => setCompleted(null)} />
          ) : active ? (
            <ActiveService job={job} visitId={active.id} onCompleted={setCompleted} />
          ) : (
            <>
              <JobInfo job={job} />
              {['open', 'pending'].includes(job.status) && (
                <div className="sticky bottom-20 z-10 lg:bottom-4">
                  <Hint block text={t('job.startHint')}>
                    <Button size="lg" className="w-full shadow-lg" icon={<Wrench className="h-5 w-5" />} onClick={() => setStarting(true)}>
                      {t('job.continueToService')}
                    </Button>
                  </Hint>
                </div>
              )}
              {job.invoice && job.invoice.balance_amount > 0 && (
                <Hint block text={t('job.collectHint')}>
                  <Button variant="outline" className="w-full" icon={<HandCoins className="h-4 w-4" />} onClick={() => setCollecting(true)}>
                    {t('job.collectBalance', { amount: money(job.invoice.balance_amount) })}
                  </Button>
                </Hint>
              )}
            </>
          )}

          {starting && <StartServiceDialog job={job} onClose={() => setStarting(false)} />}
          {collecting && job.invoice && <RecordPayment invoice={job.invoice} open technician onClose={() => { setCollecting(false); q.refetch(); }} />}
        </div>
      )}
    </QueryState>
  );
}

function JobInfo({ job }: { job: Job }) {
  const { t } = useTranslation();
  const c = job.customer;
  const p = job.customer_product;
  const history = (job.visits ?? []).filter((v) => v.status !== 'in_progress');
  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{c?.name}</p>
            <p className="text-sm text-slate-600">{[c?.address, c?.city, c?.pincode].filter(Boolean).join(', ')}</p>
            {c?.crm_id && <p className="text-xs text-slate-500">{t('job.crmId')} {c.crm_id}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={`tel:${c?.phone}`} className="flex flex-col items-center gap-1 rounded-lg bg-emerald-50 py-2 text-xs font-medium text-emerald-800">
            <Phone className="h-5 w-5" /> {t('job.call')}
          </a>
          <a href={`https://wa.me/${(c?.phone ?? '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-lg bg-green-50 py-2 text-xs font-medium text-green-800">
            <MessageCircle className="h-5 w-5" /> WhatsApp
          </a>
          <a
            href={c?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c?.address, c?.city, c?.pincode].filter(Boolean).join(', '))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 rounded-lg bg-brand-50 py-2 text-xs font-medium text-brand-800"
          >
            <Navigation className="h-5 w-5" /> {t('job.directions')}
          </a>
        </div>
      </Card>
      <Card title={t('job.complaintProduct')}>
        <DefinitionList
          items={[
            [t('job.complaint'), job.complaint_type?.name ?? '—'],
            [t('job.summary'), job.complaint_summary?.name ?? '—'],
            [t('job.product'), [p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || '—'],
            [t('job.serialNo'), p?.serial_no ?? '—'],
            [t('job.outdoorSerial'), p?.outdoor_serial_no ?? '—'],
            [t('job.warranty'), p ? <span className="flex items-center gap-1">{label(p.warranty_type)} {p.under_warranty !== undefined && <Badge tone={p.under_warranty ? 'green' : 'slate'}>{p.under_warranty ? t('job.covered') : t('job.expired')}</Badge>}</span> : '—'],
            [t('job.purchaseDate'), date(p?.purchase_date)],
            [t('job.dealer'), p?.dealer?.name ?? '—'],
            [t('job.scheduled'), dateTime(job.scheduled_at)],
            [t('job.callType'), label(job.call_type)],
          ]}
        />
        {job.complaint_details && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">{job.complaint_details}</p>}
      </Card>
      {!!history.length && (
        <Card title={t('job.visitHistory')} padded={false}>
          <DataTable
            rows={history}
            columns={[
              { key: 'date', header: t('common.date'), render: (v) => date(v.start_time) },
              { key: 'tech', header: t('common.technician'), render: (v) => v.technician?.name },
              { key: 'svc', header: t('job.service'), render: (v) => money(v.labour_charge), className: 'tabular-nums' },
              { key: 'spare', header: t('job.spare'), render: (v) => money(v.spare_charge), className: 'tabular-nums' },
              { key: 'status', header: t('common.status'), render: (v) => <StatusBadge status={v.status} /> },
            ]}
          />
        </Card>
      )}
      <Card title="Location">
        <MapEmbed lat={c?.lat} lng={c?.lng} />
      </Card>
    </>
  );
}

/** FR-6.1 / FR-6.2: "Ready to Start the Service?" with service type + location gate. */
function StartServiceDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<'on_site' | 'tele_call' | 'office'>('on_site');
  const [locError, setLocError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setLocError(null);
    try {
      let pos: { lat: number; lng: number } | null = null;
      if (type === 'on_site') {
        try {
          pos = await getPosition();
        } catch (e) {
          setLocError((e as Error).message);
          return;
        }
      } else {
        pos = await getPosition(5000).catch(() => null);
      }
      await api.post(`/jobs/${job.id}/visits/start`, { service_type: type, ...(pos ?? {}) });
      toast.success(t('job.started'));
      await qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
      onClose();
    } catch (e) {
      const err = e as ApiError;
      if (err.field?.('location')) setLocError(err.field('location')!);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const p = job.customer_product;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('job.readyToStart')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('job.notYet')}
          </Button>
          <Button loading={busy} onClick={start}>
            {locError ? t('action.retry') : t('job.startService')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">{t('job.serviceType')}</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['on_site', t('label.on_site'), MapPin],
              ['tele_call', t('label.tele_call'), PhoneCall],
              ['office', t('label.office'), Building2],
            ] as const).map(([v, l, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => { setType(v); setLocError(null); }}
                className={cn('flex flex-col items-center gap-1 rounded-lg border py-3 text-sm font-medium', type === v ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600')}
              >
                <Icon className="h-5 w-5" /> {l}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('job.confirmProduct')}</p>
          <p>{[p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || t('job.productNotSpecified')}</p>
          <p className="text-slate-600">{t('common.sn')} {p?.serial_no ?? '—'} {p?.outdoor_serial_no && `· ${t('job.outdoor')} ${p.outdoor_serial_no}`}</p>
          <p className="text-xs text-slate-500">{t('job.correctSerial')}</p>
        </div>
        {locError && (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <MapPinOff className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{t('job.locationOff')}</p>
              <p>{locError}</p>
              <p className="mt-1 text-xs">{t('job.locationTip')}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

type ServiceTab = 'call' | 'images' | 'spare' | 'summary';

function ActiveService({ job, visitId, onCompleted }: { job: Job; visitId: number; onCompleted: (r: { invoice: Invoice | null; payment: Payment | null; status: string }) => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ServiceTab>('call');
  const v = useQuery({ queryKey: ['visit', visitId], queryFn: () => api.get<Envelope<Visit>>(`/visits/${visitId}`).then((r) => r.data) });
  const now = useNow(1000);
  const elapsed = v.data ? Math.max(0, Math.floor((now - new Date(v.data.start_time).getTime()) / 1000)) : 0;

  return (
    <>
      <div className="flex items-center justify-between rounded-xl bg-violet-600 px-4 py-3 text-white shadow">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          <span className="text-sm">{t('job.inProgressType', { type: label(v.data?.service_type) })}</span>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums" aria-live="off">
          {formatTimer(elapsed)}
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'call', label: t('job.tab.call') },
          { value: 'images', label: t('job.tab.images'), count: v.data?.images?.length },
          { value: 'spare', label: t('job.tab.spare'), count: v.data?.inventory_usage?.length },
          { value: 'summary', label: t('job.tab.summary') },
        ]}
      />
      {!v.data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {tab === 'call' && <CallTab job={job} visit={v.data} />}
          {tab === 'images' && <ImagesTab visit={v.data} />}
          {tab === 'spare' && <SpareTab visit={v.data} />}
          {tab === 'summary' && <SummaryTab job={job} visit={v.data} onCompleted={onCompleted} />}
        </>
      )}
    </>
  );
}

function formatTimer(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function CallTab({ job, visit }: { job: Job; visit: Visit }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    complaint_details: job.complaint_details ?? '',
    complaint_type_id: String(job.complaint_type_id ?? ''),
    priority: job.priority,
    address: job.customer?.address ?? '',
    city: job.customer?.city ?? '',
    pincode: job.customer?.pincode ?? '',
    alt_phone: job.customer?.alt_phone ?? '',
    serial_no: job.customer_product?.serial_no ?? '',
    outdoor_serial_no: job.customer_product?.outdoor_serial_no ?? '',
  });
  const m = useApiMutation(() => api.patch(`/visits/${visit.id}`, { ...form, complaint_type_id: form.complaint_type_id || null, alt_phone: form.alt_phone || null }), {
    toastValidation: false,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] }),
  });
  const e = (n: string) => fieldError(m.error, n);
  return (
    <Card>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium">{job.customer?.name}</p>
          <a className="text-brand-700" href={`tel:${job.customer?.phone}`}>
            {job.customer?.phone}
          </a>
          <p className="text-xs text-slate-500">
            {t('job.crmId')} {job.customer?.crm_id ?? '—'} · {t('job.scheduled')} {dateTime(job.scheduled_at)} · {label(job.call_type)}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('job.complaintType')}>
            <Select value={form.complaint_type_id} onChange={(ev) => setForm({ ...form, complaint_type_id: ev.target.value })}>
              <option value="">—</option>
              {lookups?.complaint_types.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('job.priority')}>
            <Select value={form.priority} onChange={(ev) => setForm({ ...form, priority: ev.target.value as Job['priority'] })}>
              <option value="low">{t('priority.low')}</option>
              <option value="medium">{t('priority.medium')}</option>
              <option value="high">{t('priority.high')}</option>
            </Select>
          </Field>
          <Field label={t('job.complaint')} className="sm:col-span-2">
            <Textarea rows={2} value={form.complaint_details} onChange={(ev) => setForm({ ...form, complaint_details: ev.target.value })} />
          </Field>
          <Field label={t('common.address')} className="sm:col-span-2" error={e('address')}>
            <Textarea rows={2} value={form.address} onChange={(ev) => setForm({ ...form, address: ev.target.value })} />
          </Field>
          <Field label={t('common.city')}>
            <Input value={form.city} onChange={(ev) => setForm({ ...form, city: ev.target.value })} />
          </Field>
          <Field label={t('common.pincode')}>
            <Input value={form.pincode} inputMode="numeric" onChange={(ev) => setForm({ ...form, pincode: ev.target.value })} />
          </Field>
          <Field label={t('job.altPhone')} error={e('alt_phone')}>
            <Input value={form.alt_phone} inputMode="tel" onChange={(ev) => setForm({ ...form, alt_phone: ev.target.value })} />
          </Field>
          <Field label={t('job.serialNo')}>
            <Input value={form.serial_no} onChange={(ev) => setForm({ ...form, serial_no: ev.target.value })} disabled={!job.customer_product} />
          </Field>
          <Field label={t('job.outdoorSerial')}>
            <Input value={form.outdoor_serial_no} onChange={(ev) => setForm({ ...form, outdoor_serial_no: ev.target.value })} disabled={!job.customer_product} />
          </Field>
        </div>
        <MapEmbed lat={visit.location_lat} lng={visit.location_lng} label={t('job.visitLocation')} />
        <Button className="w-full" variant="secondary" loading={m.isPending} onClick={() => m.mutate(undefined)}>
          {t('job.saveCall')}
        </Button>
      </div>
    </Card>
  );
}

const IMAGE_TYPES = ['bill', 'serial', 'complaint_part', 'new_part', 'other'] as const;

function ImagesTab({ visit }: { visit: Visit }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pendingType = useRef<string>('bill');

  const upload = async (file: File) => {
    const type = pendingType.current;
    setUploading(type);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('type', type);
      fd.append('image', compressed);
      await api.post(`/visits/${visit.id}/images`, fd);
      toast.success(t('job.photoUploaded'));
      qc.invalidateQueries({ queryKey: ['visit', visit.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const remove = useApiMutation((imageId: number) => api.delete(`/visits/${visit.id}/images/${imageId}`), {
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['visit', visit.id] });
    },
  });

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      {IMAGE_TYPES.map((type) => {
        const imgs = visit.images?.filter((i) => i.type === type) ?? [];
        const name = t(`job.photo.${type}`);
        return (
          <Card key={type} padded={false}>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium">{name}</p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Camera className="h-4 w-4" />}
                loading={uploading === type}
                onClick={() => {
                  pendingType.current = type;
                  input.current?.click();
                }}
              >
                {t('job.addPhoto')}
              </Button>
            </div>
            {!!imgs.length && (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {imgs.map((img) => (
                  <div key={img.id} className="relative">
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      <img src={img.url} alt={name} className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                    <button className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow" onClick={() => setDeleting(img.id)} aria-label={t('job.deletePhoto')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} title={t('job.deletePhotoTitle')} message={t('job.deletePhotoMessage')} confirmLabel={t('action.delete')} loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting)} />
    </div>
  );
}

function SpareTab({ visit }: { visit: Visit }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [removing, setRemoving] = useState<number | null>(null);
  const items = useQuery({
    queryKey: ['spare-search', search],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, active: 1, per_page: 8, branch_id: user?.branch_id ?? undefined }),
    enabled: search.length >= 1 && !picked,
  });
  const availability = useQuery({
    queryKey: ['availability', picked?.code],
    queryFn: () => api.get<Envelope<{ branches: { branch_id: number; branch: string; quantity: number }[] }>>(`/inventory/items/${encodeURIComponent(picked!.code)}/availability`).then((r) => r.data.branches),
    enabled: !!picked,
  });
  const mine = availability.data?.find((b) => b.branch_id === user?.branch_id);
  const add = useApiMutation(() => api.post(`/visits/${visit.id}/spares`, { item_id: picked!.id, quantity }), {
    toastValidation: true,
    success: t('job.partAdded'),
    onSuccess: () => {
      setPicked(null);
      setSearch('');
      setQuantity('1');
      qc.invalidateQueries({ queryKey: ['visit', visit.id] });
    },
  });
  const remove = useApiMutation((usageId: number) => api.delete(`/visits/${visit.id}/spares/${usageId}`), {
    onSuccess: () => {
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['visit', visit.id] });
    },
  });
  const step = picked?.unit_of_measure === 'nos' ? 1 : 0.5;
  const total = (visit.inventory_usage ?? []).reduce((a, u) => a + u.total_price, 0);

  return (
    <div className="space-y-3">
      <Card>
        {!picked ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('job.searchSpare')} className="pl-9" />
            </div>
            {search && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.data?.data.map((i) => (
                  <li key={i.id}>
                    <button className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => setPicked(i)}>
                      <span>
                        <span className="block text-sm font-medium">{i.name}</span>
                        <span className="font-mono text-xs text-slate-500">{i.code}</span>
                      </span>
                      <span className="text-right text-xs">
                        <span className="block text-slate-700">{money(i.unit_price)}/{i.unit_of_measure}</span>
                        <span className={Number(i.stock_total ?? 0) > 0 ? 'text-emerald-700' : 'text-red-600'}>{t('job.inMyBranch', { qty: qty(i.stock_total ?? 0) })}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {items.data && !items.data.data.length && <li className="px-3 py-3 text-sm text-slate-500">{t('job.noMatchingItem')}</li>}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{picked.name}</p>
                <p className="text-xs text-slate-500">
                  {picked.code} · {label(picked.type)} · {money(picked.unit_price)}/{picked.unit_of_measure}
                </p>
              </div>
              <button className="text-xs text-brand-600" onClick={() => setPicked(null)}>
                {t('action.change')}
              </button>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs">
              <p className="font-medium text-slate-700">{t('job.availability')}</p>
              {availability.isLoading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                availability.data?.map((b) => (
                  <p key={b.branch_id} className={cn('flex justify-between', b.branch_id === user?.branch_id && 'font-semibold')}>
                    <span>{b.branch}</span>
                    <span className={b.quantity > 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {qty(b.quantity)} {picked.unit_of_measure}
                    </span>
                  </p>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="md" aria-label={t('job.less')} onClick={() => setQuantity(String(Math.max(step, +(parseFloat(quantity || '0') - step).toFixed(3))))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input className="text-center" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} />
              <Button variant="secondary" size="md" aria-label={t('job.more')} onClick={() => setQuantity(String(+(parseFloat(quantity || '0') + step).toFixed(3)))}>
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-500">{picked.unit_of_measure}</span>
            </div>
            <Button className="w-full" loading={add.isPending} disabled={mine !== undefined && mine.quantity <= 0} onClick={() => add.mutate(undefined)}>
              {t('job.addFor', { amount: money(Math.round(picked.unit_price * (parseFloat(quantity) || 0))) })}
            </Button>
          </div>
        )}
      </Card>
      <Card title={t('job.usedThisVisit')} padded={false}>
        {!visit.inventory_usage?.length ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">{t('job.noSpares')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visit.inventory_usage.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{u.item?.name}</p>
                  <p className="text-xs text-slate-500">
                    {qty(u.quantity)} {u.item?.unit_of_measure} × {money(u.unit_price)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{money(u.total_price)}</span>
                  <button className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => setRemoving(u.id)} aria-label={t('job.removeItem')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
            <li className="flex justify-between px-4 py-3 text-sm font-semibold">
              <span>{t('job.spareTotal')}</span>
              <span className="tabular-nums">{money(total)}</span>
            </li>
          </ul>
        )}
      </Card>
      <ConfirmDialog open={removing !== null} onClose={() => setRemoving(null)} title={t('job.removeItemTitle')} message={t('job.removeItemMessage')} confirmLabel={t('action.remove')} loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing)} />
    </div>
  );
}

function SummaryTab({ job, visit, onCompleted }: { job: Job; visit: Visit; onCompleted: (r: { invoice: Invoice | null; payment: Payment | null; status: string }) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const { data: staff } = useStaffOptions('technician');
  const usageTotal = (visit.inventory_usage ?? []).reduce((a, u) => a + u.total_price, 0);
  const previousBalance = job.invoice?.balance_amount ?? 0;
  const [form, setForm] = useState({
    status: 'completed' as 'completed' | 'pending' | 'cancelled',
    action_taken_id: '',
    service_summary: visit.service_summary ?? '',
    assisted_staff_id: '',
    labour_charge: '',
    spare_charge: toMajor(usageTotal),
    payment_method: 'cash',
    amount_collected: '',
    payment_reference: '',
  });
  const [confirming, setConfirming] = useState(false);
  const [showUpi, setShowUpi] = useState(false);
  const [signing, setSigning] = useState(false);
  const signature = visit.images?.find((i) => i.type === 'signature');
  const signatureRequired = !!user?.tenant?.require_signature && form.status === 'completed';
  const sign = useApiMutation(
    ({ png, name }: { png: Blob; name: string }) => {
      const fd = new FormData();
      fd.append('signature', png, 'signature.png');
      fd.append('signer_name', name);
      return api.post(`/visits/${visit.id}/signature`, fd);
    },
    {
      success: t('job.signature.saved'),
      onSuccess: () => {
        setSigning(false);
        m.reset();
        qc.invalidateQueries({ queryKey: ['visit', visit.id] });
      },
    },
  );
  const total = toMinor(form.labour_charge) + toMinor(form.spare_charge);
  const due = total + previousBalance;
  const collects = ['cash', 'upi', 'cheque', 'bank_transfer'].includes(form.payment_method);
  const collected = form.amount_collected === '' ? due : toMinor(form.amount_collected);

  const m = useApiMutation(
    async () => {
      const pos = await getPosition(5000).catch(() => null);
      return api.post<Envelope<{ invoice: Invoice | null; payment: Payment | null }>>(`/visits/${visit.id}/complete`, {
        status: form.status,
        action_taken_id: form.action_taken_id ? Number(form.action_taken_id) : null,
        service_summary: form.service_summary,
        assisted_staff_id: form.assisted_staff_id ? Number(form.assisted_staff_id) : null,
        labour_charge: toMinor(form.labour_charge),
        spare_charge: toMinor(form.spare_charge),
        payment_method: total > 0 || collected > 0 ? form.payment_method : null,
        amount_collected: collects ? collected : 0,
        payment_reference: form.payment_reference || null,
        ...(pos ?? {}),
      });
    },
    {
      toastValidation: true,
      onSuccess: (r) => {
        setConfirming(false);
        qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
        qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
        qc.invalidateQueries({ queryKey: ['tech-jobs'] });
        onCompleted({ invoice: r.data.invoice, payment: r.data.payment, status: form.status });
      },
    },
  );
  const e = (n: string) => fieldError(m.error, n);
  const methods = [
    ['cash', t('method.cash')],
    ['upi', t('method.upi')],
    ['cheque', t('method.cheque')],
    ['bank_transfer', t('job.bank')],
    ['credit', t('job.credit')],
    ...(user?.tenant?.online_payments ? [['online', t('job.payLink')]] : []),
  ] as [string, string][];

  return (
    <Card>
      <div className="space-y-4">
        <Field label={t('job.visitStatus')} required>
          <div className="grid grid-cols-3 gap-2">
            {(['completed', 'pending', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                className={cn('rounded-lg border py-2 text-sm font-medium', form.status === s ? (s === 'cancelled' ? 'border-red-500 bg-red-50 text-red-800' : 'border-brand-600 bg-brand-50 text-brand-800') : 'border-slate-200 text-slate-600')}
              >
                {t(`status.${s}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('job.actionTaken')} required={form.status === 'completed'} error={e('action_taken_id')}>
          <Combobox
            value={form.action_taken_id}
            onChange={(v) => { setForm({ ...form, action_taken_id: v }); m.reset(); }}
            options={(lookups?.action_taken_options ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
            searchPlaceholder={t('job.searchAction')}
            invalid={!!e('action_taken_id')}
            aria-label={t('job.actionTaken')}
          />
        </Field>
        <Field label={t('job.serviceSummary')} required error={e('service_summary')}>
          <Textarea rows={3} value={form.service_summary} onChange={(ev) => setForm({ ...form, service_summary: ev.target.value })} placeholder={t('job.summaryPlaceholder')} />
        </Field>
        <Field label={t('job.assistedBy')}>
          <Select value={form.assisted_staff_id} onChange={(ev) => setForm({ ...form, assisted_staff_id: ev.target.value })}>
            <option value="">—</option>
            {staff?.filter((s) => s.id !== user?.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('job.labourCharge')} error={e('labour_charge')}>
            <Input inputMode="decimal" value={form.labour_charge} onChange={(ev) => setForm({ ...form, labour_charge: ev.target.value.replace(/[^\d.]/g, ''), amount_collected: '' })} placeholder="0" />
          </Field>
          <Field label={t('job.spareCharge')} error={e('spare_charge')} hint={usageTotal ? t('job.itemsUsed', { amount: money(usageTotal) }) : undefined}>
            <Input inputMode="decimal" value={form.spare_charge} onChange={(ev) => setForm({ ...form, spare_charge: ev.target.value.replace(/[^\d.]/g, ''), amount_collected: '' })} placeholder="0" />
          </Field>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>{t('job.thisVisit')}</span>
            <span className="font-semibold tabular-nums">{money(total)}</span>
          </div>
          {previousBalance > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>{t('job.previousBalance')}</span>
              <span className="tabular-nums">{money(previousBalance)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base">
            <span>{t('job.amountDue')}</span>
            <span className="font-bold tabular-nums">{money(due)}</span>
          </div>
        </div>

        {due > 0 && (
          <>
            <Field label={t('job.payment')} required error={e('payment_method')}>
              <div className="grid grid-cols-3 gap-2">
                {methods.map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: v, payment_reference: '' })}
                    className={cn('rounded-lg border py-2 text-sm font-medium', form.payment_method === v ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600')}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {form.payment_method === 'credit' ? t('job.creditHint') : form.payment_method === 'online' ? t('job.onlineHint') : t('job.collectNote')}
              </p>
            </Field>
            {collects && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('job.amountCollected')} error={e('amount_collected') ?? e('amount')} hint={t('job.partialAllowed')}>
                  <Input inputMode="decimal" value={form.amount_collected === '' ? toMajor(due) : form.amount_collected} onChange={(ev) => setForm({ ...form, amount_collected: ev.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                {form.payment_method !== 'cash' && (
                  <Field label={form.payment_method === 'cheque' ? t('job.chequeNo') : form.payment_method === 'upi' ? t('job.upiRef') : t('job.utrRef')} required error={e('reference_no')}>
                    <Input value={form.payment_reference} onChange={(ev) => setForm({ ...form, payment_reference: ev.target.value })} />
                  </Field>
                )}
                {form.payment_method === 'upi' && collected > 0 && (
                  <Button variant="secondary" className="col-span-2" icon={<QrCode className="h-4 w-4" />} onClick={() => setShowUpi(true)}>
                    {t('job.showUpiQr')}
                  </Button>
                )}
              </div>
            )}
            <UpiQrDialog open={showUpi} onClose={() => setShowUpi(false)} amount={collected} note={`Job ${job.crm_call_id}`} branchId={job.branch_id} title={t('job.customerScans')} />
          </>
        )}

        {form.status !== 'cancelled' && (
          <div className={cn('rounded-lg border p-3', e('signature') ? 'border-red-300 bg-red-50' : 'border-slate-200')}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t('job.signature.title')}</p>
              <Badge tone={signatureRequired ? (signature ? 'green' : 'amber') : 'slate'}>{signatureRequired ? t('job.signature.required') : t('job.signature.optional')}</Badge>
            </div>
            {signature ? (
              <div className="mt-2 flex items-end gap-3">
                <img src={signature.url} alt={t('job.signature.title')} className="h-16 w-40 rounded border border-slate-200 bg-white object-contain" />
                <p className="pb-1 text-xs text-slate-600">{t('job.signature.signedBy', { name: visit.signer_name ?? '' })}</p>
              </div>
            ) : (
              <p className={cn('mt-1 text-xs', e('signature') ? 'text-red-700' : 'text-slate-500')}>{e('signature') ?? t('job.signature.hint')}</p>
            )}
            <Button size="sm" variant={signature ? 'ghost' : 'secondary'} className="mt-2" onClick={() => setSigning(true)}>
              {signature ? t('job.signature.again') : t('job.signature.take')}
            </Button>
            <SignaturePad open={signing} onClose={() => setSigning(false)} defaultName={job.customer?.name} saving={sign.isPending} onSave={(png, name) => sign.mutate({ png, name })} />
          </div>
        )}

        <Hint
          block
          text={form.status === 'completed' ? t('job.completeHint') : form.status === 'pending' ? t('job.pendingHint') : t('job.cancelHint')}
        >
          <Button size="lg" className="w-full" variant={form.status === 'cancelled' ? 'danger' : 'primary'} icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setConfirming(true)}>
            {form.status === 'completed' ? t('job.saveInvoice') : form.status === 'pending' ? t('job.savePending') : t('job.cancelJob')}
          </Button>
        </Hint>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone={form.status === 'cancelled' ? 'danger' : 'primary'}
        title={form.status === 'completed' ? t('job.confirmComplete') : form.status === 'pending' ? t('job.confirmPending') : t('job.confirmCancel')}
        message={
          <>
            {form.status !== 'cancelled' && <>{t('job.totalCharge', { amount: money(total) })} </>}
            {collects && collected > 0 && (
              <>
                <Trans i18nKey="job.youCollected" values={{ amount: money(collected), method: t(`method.${form.payment_method}`) }} components={{ strong: <strong /> }} />{' '}
              </>
            )}
            {t('job.noEditAfter')}
          </>
        }
        confirmLabel={t('job.yesSave')}
        loading={m.isPending}
        onConfirm={() => m.mutate(undefined)}
      />
    </Card>
  );
}


function CompletionSummary({ result, jobId, onDone }: { result: { invoice: Invoice | null; payment: Payment | null; status: string }; jobId: number; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-2 text-lg font-semibold">{t('job.savedAs', { status: t(`status.${result.status}`) })}</h2>
        {result.invoice && (
          <div className="mx-auto mt-4 max-w-xs space-y-1 rounded-lg bg-slate-50 p-4 text-left text-sm">
            <p className="flex justify-between">
              <span className="text-slate-500">{t('job.invoice')}</span> <span className="font-medium">{result.invoice.invoice_number}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">{t('common.total')}</span> <span className="tabular-nums">{money(result.invoice.total_amount)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">{t('common.paid')}</span> <span className="tabular-nums">{money(result.invoice.paid_amount)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>{t('common.balance')}</span> <span className="tabular-nums">{money(result.invoice.balance_amount)}</span>
            </p>
            {result.payment && (
              <p className="border-t border-slate-200 pt-2 text-xs text-emerald-800">
                {t('job.receipt')} {result.payment.receipt_number} · {money(result.payment.amount)} <MethodLabel method={result.payment.method} />
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {result.invoice && (
            <Link to={`/invoices/${result.invoice.id}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium">
              {t('job.viewInvoice')}
            </Link>
          )}
          <Link to="/tech" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white" onClick={onDone}>
            {t('job.backHome')}
          </Link>
        </div>
        <Link to={`/tech/jobs/${jobId}`} className="mt-3 inline-block text-xs text-slate-500 hover:underline" onClick={onDone}>
          {t('job.viewJob')}
        </Link>
      </div>
    </Card>
  );
}
