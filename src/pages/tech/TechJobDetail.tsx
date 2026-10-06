import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Building2, Camera, CheckCircle2, ChevronDown, HandCoins, MapPin, MapPinOff, MessageCircle, Minus, Navigation, Phone, PhoneCall, Plus, QrCode, Search, Timer, Trash2, Wrench,
} from 'lucide-react';
import { UpiQrDialog } from '@/components/upi';
import { api, ApiError, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups, useNow, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, label, money, qty, toMajor, toMinor } from '@/lib/format';
import { cn, compressImage, getPosition } from '@/lib/utils';
import type { InventoryItem, Invoice, Job, Payment, Visit } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, DataTable, DefinitionList, Field, Input, Modal, QueryState, Select, Spinner, Tabs, Textarea, toast } from '@/components/ui';
import { MapEmbed, MethodLabel, PriorityBadge, StatusBadge } from '@/components/domain';
import { RecordPayment } from '@/pages/invoices/InvoiceDetail';
import { Hint } from '@/components/tutorial';

export default function TechJobDetail() {
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
            <ArrowLeft className="h-4 w-4" /> My jobs
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
                  <Hint block text="Asks where you’re working (on site, by phone or at the office) and starts the visit timer. On-site visits need your phone’s location. You can only have one visit running at a time.">
                    <Button size="lg" className="w-full shadow-lg" icon={<Wrench className="h-5 w-5" />} onClick={() => setStarting(true)}>
                      Continue to service
                    </Button>
                  </Hint>
                </div>
              )}
              {job.invoice && job.invoice.balance_amount > 0 && (
                <Hint block text="Records money the customer is paying now towards the unpaid bill. You get a receipt number, and cash or cheques are handed over at your daily cash close.">
                  <Button variant="outline" className="w-full" icon={<HandCoins className="h-4 w-4" />} onClick={() => setCollecting(true)}>
                    Collect balance {money(job.invoice.balance_amount)}
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
            {c?.crm_id && <p className="text-xs text-slate-500">CRM ID {c.crm_id}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={`tel:${c?.phone}`} className="flex flex-col items-center gap-1 rounded-lg bg-emerald-50 py-2 text-xs font-medium text-emerald-800">
            <Phone className="h-5 w-5" /> Call
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
            <Navigation className="h-5 w-5" /> Directions
          </a>
        </div>
      </Card>
      <Card title="Complaint & product">
        <DefinitionList
          items={[
            ['Complaint', job.complaint_type?.name ?? '—'],
            ['Summary', job.complaint_summary?.name ?? '—'],
            ['Product', [p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || '—'],
            ['Serial no.', p?.serial_no ?? '—'],
            ['Outdoor serial', p?.outdoor_serial_no ?? '—'],
            ['Warranty', p ? <span className="flex items-center gap-1">{label(p.warranty_type)} {p.under_warranty !== undefined && <Badge tone={p.under_warranty ? 'green' : 'slate'}>{p.under_warranty ? 'Covered' : 'Expired'}</Badge>}</span> : '—'],
            ['Purchase date', date(p?.purchase_date)],
            ['Dealer', p?.dealer?.name ?? '—'],
            ['Scheduled', dateTime(job.scheduled_at)],
            ['Call type', label(job.call_type)],
          ]}
        />
        {job.complaint_details && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">{job.complaint_details}</p>}
      </Card>
      {!!history.length && (
        <Card title="Visit history" padded={false}>
          <DataTable
            rows={history}
            columns={[
              { key: 'date', header: 'Date', render: (v) => date(v.start_time) },
              { key: 'tech', header: 'Technician', render: (v) => v.technician?.name },
              { key: 'svc', header: 'Service', render: (v) => money(v.labour_charge), className: 'tabular-nums' },
              { key: 'spare', header: 'Spare', render: (v) => money(v.spare_charge), className: 'tabular-nums' },
              { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
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
      toast.success('Service started. Timer is running.');
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
      title="Ready to start the service?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not yet
          </Button>
          <Button loading={busy} onClick={start}>
            {locError ? 'Try again' : 'Start service'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Service type</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['on_site', 'On site', MapPin],
              ['tele_call', 'Tele call', PhoneCall],
              ['office', 'Office', Building2],
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
          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Confirm product details</p>
          <p>{[p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || 'Product not specified'}</p>
          <p className="text-slate-600">SN {p?.serial_no ?? '—'} {p?.outdoor_serial_no && `· Outdoor ${p.outdoor_serial_no}`}</p>
          <p className="text-xs text-slate-500">You can correct serial numbers in the Call tab.</p>
        </div>
        {locError && (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <MapPinOff className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Location services disabled</p>
              <p>{locError}</p>
              <p className="mt-1 text-xs">Tip: tap the lock icon in the address bar → Permissions → Location → Allow, and switch on GPS on your phone.</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

type ServiceTab = 'call' | 'images' | 'spare' | 'summary';

function ActiveService({ job, visitId, onCompleted }: { job: Job; visitId: number; onCompleted: (r: { invoice: Invoice | null; payment: Payment | null; status: string }) => void }) {
  const [tab, setTab] = useState<ServiceTab>('call');
  const v = useQuery({ queryKey: ['visit', visitId], queryFn: () => api.get<Envelope<Visit>>(`/visits/${visitId}`).then((r) => r.data) });
  const now = useNow(1000);
  const elapsed = v.data ? Math.max(0, Math.floor((now - new Date(v.data.start_time).getTime()) / 1000)) : 0;

  return (
    <>
      <div className="flex items-center justify-between rounded-xl bg-violet-600 px-4 py-3 text-white shadow">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          <span className="text-sm">Service in progress · {label(v.data?.service_type)}</span>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums" aria-live="off">
          {formatTimer(elapsed)}
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'call', label: 'Call' },
          { value: 'images', label: 'Images', count: v.data?.images?.length },
          { value: 'spare', label: 'Spare', count: v.data?.inventory_usage?.length },
          { value: 'summary', label: 'Summary' },
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
            CRM ID {job.customer?.crm_id ?? '—'} · Scheduled {dateTime(job.scheduled_at)} · {label(job.call_type)}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Complaint type">
            <Select value={form.complaint_type_id} onChange={(ev) => setForm({ ...form, complaint_type_id: ev.target.value })}>
              <option value="">—</option>
              {lookups?.complaint_types.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(ev) => setForm({ ...form, priority: ev.target.value as Job['priority'] })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Complaint" className="sm:col-span-2">
            <Textarea rows={2} value={form.complaint_details} onChange={(ev) => setForm({ ...form, complaint_details: ev.target.value })} />
          </Field>
          <Field label="Address" className="sm:col-span-2" error={e('address')}>
            <Textarea rows={2} value={form.address} onChange={(ev) => setForm({ ...form, address: ev.target.value })} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(ev) => setForm({ ...form, city: ev.target.value })} />
          </Field>
          <Field label="PIN code">
            <Input value={form.pincode} inputMode="numeric" onChange={(ev) => setForm({ ...form, pincode: ev.target.value })} />
          </Field>
          <Field label="Alternate phone" error={e('alt_phone')}>
            <Input value={form.alt_phone} inputMode="tel" onChange={(ev) => setForm({ ...form, alt_phone: ev.target.value })} />
          </Field>
          <Field label="Serial no.">
            <Input value={form.serial_no} onChange={(ev) => setForm({ ...form, serial_no: ev.target.value })} disabled={!job.customer_product} />
          </Field>
          <Field label="Outdoor serial no.">
            <Input value={form.outdoor_serial_no} onChange={(ev) => setForm({ ...form, outdoor_serial_no: ev.target.value })} disabled={!job.customer_product} />
          </Field>
        </div>
        <MapEmbed lat={visit.location_lat} lng={visit.location_lng} label="Visit location" />
        <Button className="w-full" variant="secondary" loading={m.isPending} onClick={() => m.mutate(undefined)}>
          Save call details
        </Button>
      </div>
    </Card>
  );
}

const IMAGE_TYPES = [
  { type: 'bill', label: 'Bill image' },
  { type: 'serial', label: 'Serial number' },
  { type: 'complaint_part', label: 'Complaint part' },
  { type: 'new_part', label: 'New part' },
  { type: 'other', label: 'Other' },
] as const;

function ImagesTab({ visit }: { visit: Visit }) {
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
      toast.success('Photo uploaded');
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
      {IMAGE_TYPES.map((t) => {
        const imgs = visit.images?.filter((i) => i.type === t.type) ?? [];
        return (
          <Card key={t.type} padded={false}>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium">{t.label}</p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Camera className="h-4 w-4" />}
                loading={uploading === t.type}
                onClick={() => {
                  pendingType.current = t.type;
                  input.current?.click();
                }}
              >
                Add photo
              </Button>
            </div>
            {!!imgs.length && (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {imgs.map((img) => (
                  <div key={img.id} className="relative">
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      <img src={img.url} alt={t.label} className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                    <button className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow" onClick={() => setDeleting(img.id)} aria-label="Delete photo">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this photo?" message="The photo will be removed from this visit." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting)} />
    </div>
  );
}

function SpareTab({ visit }: { visit: Visit }) {
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
    success: 'Added to this visit',
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
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search spare / consumable by code or name" className="pl-9" />
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
                        <span className={Number(i.stock_total ?? 0) > 0 ? 'text-emerald-700' : 'text-red-600'}>{qty(i.stock_total ?? 0)} in my branch</span>
                      </span>
                    </button>
                  </li>
                ))}
                {items.data && !items.data.data.length && <li className="px-3 py-3 text-sm text-slate-500">No matching item.</li>}
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
              <button className="text-xs text-brand-700" onClick={() => setPicked(null)}>
                Change
              </button>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs">
              <p className="font-medium text-slate-700">Availability</p>
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
              <Button variant="secondary" size="md" aria-label="Less" onClick={() => setQuantity(String(Math.max(step, +(parseFloat(quantity || '0') - step).toFixed(3))))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input className="text-center" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} />
              <Button variant="secondary" size="md" aria-label="More" onClick={() => setQuantity(String(+(parseFloat(quantity || '0') + step).toFixed(3)))}>
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-500">{picked.unit_of_measure}</span>
            </div>
            <Button className="w-full" loading={add.isPending} disabled={mine !== undefined && mine.quantity <= 0} onClick={() => add.mutate(undefined)}>
              Add · {money(Math.round(picked.unit_price * (parseFloat(quantity) || 0)))}
            </Button>
          </div>
        )}
      </Card>
      <Card title="Used on this visit" padded={false}>
        {!visit.inventory_usage?.length ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">No spares or consumables added.</p>
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
                  <button className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => setRemoving(u.id)} aria-label="Remove item">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
            <li className="flex justify-between px-4 py-3 text-sm font-semibold">
              <span>Spare total</span>
              <span className="tabular-nums">{money(total)}</span>
            </li>
          </ul>
        )}
      </Card>
      <ConfirmDialog open={removing !== null} onClose={() => setRemoving(null)} title="Remove this item?" message="It will be returned to branch stock." confirmLabel="Remove" loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing)} />
    </div>
  );
}

function SummaryTab({ job, visit, onCompleted }: { job: Job; visit: Visit; onCompleted: (r: { invoice: Invoice | null; payment: Payment | null; status: string }) => void }) {
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
    ['cash', 'Cash'],
    ['upi', 'UPI'],
    ['cheque', 'Cheque'],
    ['bank_transfer', 'Bank'],
    ['credit', 'Credit'],
    ...(user?.tenant?.online_payments ? [['online', 'Pay link']] : []),
  ] as [string, string][];

  return (
    <Card>
      <div className="space-y-4">
        <Field label="Visit status" required>
          <div className="grid grid-cols-3 gap-2">
            {(['completed', 'pending', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                className={cn('rounded-lg border py-2 text-sm font-medium', form.status === s ? (s === 'cancelled' ? 'border-red-500 bg-red-50 text-red-800' : 'border-brand-600 bg-brand-50 text-brand-800') : 'border-slate-200 text-slate-600')}
              >
                {label(s)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Action taken" required={form.status === 'completed'} error={e('action_taken_id')}>
          <SearchableSelect value={form.action_taken_id} onChange={(v) => { setForm({ ...form, action_taken_id: v }); m.reset(); }} options={lookups?.action_taken_options ?? []} placeholder="Search action taken…" />
        </Field>
        <Field label="Service summary" required error={e('service_summary')}>
          <Textarea rows={3} value={form.service_summary} onChange={(ev) => setForm({ ...form, service_summary: ev.target.value })} placeholder="What was checked / done, parts pending, advice given…" />
        </Field>
        <Field label="Assisted by (optional)">
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
          <Field label="Labour charge" error={e('labour_charge')}>
            <Input inputMode="decimal" value={form.labour_charge} onChange={(ev) => setForm({ ...form, labour_charge: ev.target.value.replace(/[^\d.]/g, ''), amount_collected: '' })} placeholder="0" />
          </Field>
          <Field label="Spare charge" error={e('spare_charge')} hint={usageTotal ? `Items used: ${money(usageTotal)}` : undefined}>
            <Input inputMode="decimal" value={form.spare_charge} onChange={(ev) => setForm({ ...form, spare_charge: ev.target.value.replace(/[^\d.]/g, ''), amount_collected: '' })} placeholder="0" />
          </Field>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>This visit</span>
            <span className="font-semibold tabular-nums">{money(total)}</span>
          </div>
          {previousBalance > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>Previous balance on this job</span>
              <span className="tabular-nums">{money(previousBalance)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base">
            <span>Amount due</span>
            <span className="font-bold tabular-nums">{money(due)}</span>
          </div>
        </div>

        {due > 0 && (
          <>
            <Field label="Payment" required error={e('payment_method')}>
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
                {form.payment_method === 'credit'
                  ? 'Nothing collected now. The amount goes to the customer’s outstanding ledger.'
                  : form.payment_method === 'online'
                    ? 'The customer gets a secure payment link by SMS / WhatsApp.'
                    : 'Record what you collected. Cash and cheques are handed over at the daily cash close.'}
              </p>
            </Field>
            {collects && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount collected" error={e('amount_collected') ?? e('amount')} hint="Partial payment allowed">
                  <Input inputMode="decimal" value={form.amount_collected === '' ? toMajor(due) : form.amount_collected} onChange={(ev) => setForm({ ...form, amount_collected: ev.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                {form.payment_method !== 'cash' && (
                  <Field label={form.payment_method === 'cheque' ? 'Cheque no.' : form.payment_method === 'upi' ? 'UPI ref.' : 'UTR / ref.'} required error={e('reference_no')}>
                    <Input value={form.payment_reference} onChange={(ev) => setForm({ ...form, payment_reference: ev.target.value })} />
                  </Field>
                )}
                {form.payment_method === 'upi' && collected > 0 && (
                  <Button variant="secondary" className="col-span-2" icon={<QrCode className="h-4 w-4" />} onClick={() => setShowUpi(true)}>
                    Show UPI QR to customer
                  </Button>
                )}
              </div>
            )}
            <UpiQrDialog open={showUpi} onClose={() => setShowUpi(false)} amount={collected} note={`Job ${job.crm_call_id}`} branchId={job.branch_id} title="Customer scans to pay" />
          </>
        )}

        <Hint
          block
          text={
            form.status === 'completed'
              ? 'Ends the visit and closes the job. The invoice is created from your charges and parts, any payment you collected is recorded, and the customer is sent the bill.'
              : form.status === 'pending'
                ? 'Ends this visit but keeps the job open, e.g. while a part is on order. The job can be visited again later.'
                : 'Ends the visit and cancels the job for good. This can’t be undone.'
          }
        >
          <Button size="lg" className="w-full" variant={form.status === 'cancelled' ? 'danger' : 'primary'} icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setConfirming(true)}>
            {form.status === 'completed' ? 'Save & generate invoice' : form.status === 'pending' ? 'Save as pending' : 'Cancel this job'}
          </Button>
        </Hint>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone={form.status === 'cancelled' ? 'danger' : 'primary'}
        title={form.status === 'completed' ? 'Complete this visit?' : form.status === 'pending' ? 'Save visit as pending?' : 'Cancel this job?'}
        message={
          <>
            {form.status !== 'cancelled' && <>Total charge {money(total)}. </>}
            {collects && collected > 0 && (
              <>
                You collected <strong>{money(collected)}</strong> by <MethodLabel method={form.payment_method} />.{' '}
              </>
            )}
            After saving, this visit can no longer be edited.
          </>
        }
        confirmLabel="Yes, save"
        loading={m.isPending}
        onConfirm={() => m.mutate(undefined)}
      />
    </Card>
  );
}

function SearchableSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { id: number; name: string }[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const selected = options.find((o) => String(o.id) === value);
  const filtered = useMemo(() => options.filter((o) => o.name.toLowerCase().includes(term.toLowerCase())), [options, term]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm shadow-sm">
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>{selected?.name ?? 'Select…'}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} />
          </div>
          <ul className="max-h-60 overflow-y-auto" role="listbox">
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={cn('w-full px-3 py-2 text-left text-sm hover:bg-slate-50', String(o.id) === value && 'bg-brand-50 font-medium text-brand-800')}
                  onClick={() => {
                    onChange(String(o.id));
                    setOpen(false);
                    setTerm('');
                  }}
                >
                  {o.name}
                </button>
              </li>
            ))}
            {!filtered.length && <li className="px-3 py-2 text-sm text-slate-500">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompletionSummary({ result, jobId, onDone }: { result: { invoice: Invoice | null; payment: Payment | null; status: string }; jobId: number; onDone: () => void }) {
  return (
    <Card>
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-2 text-lg font-semibold">Visit saved as {label(result.status)}</h2>
        {result.invoice && (
          <div className="mx-auto mt-4 max-w-xs space-y-1 rounded-lg bg-slate-50 p-4 text-left text-sm">
            <p className="flex justify-between">
              <span className="text-slate-500">Invoice</span> <span className="font-medium">{result.invoice.invoice_number}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Total</span> <span className="tabular-nums">{money(result.invoice.total_amount)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Paid</span> <span className="tabular-nums">{money(result.invoice.paid_amount)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>Balance</span> <span className="tabular-nums">{money(result.invoice.balance_amount)}</span>
            </p>
            {result.payment && (
              <p className="border-t border-slate-200 pt-2 text-xs text-emerald-800">
                Receipt {result.payment.receipt_number} · {money(result.payment.amount)} <MethodLabel method={result.payment.method} />
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {result.invoice && (
            <Link to={`/invoices/${result.invoice.id}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium">
              View invoice
            </Link>
          )}
          <Link to="/tech" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white" onClick={onDone}>
            Back to home
          </Link>
        </div>
        <Link to={`/tech/jobs/${jobId}`} className="mt-3 inline-block text-xs text-slate-500 hover:underline" onClick={onDone}>
          View job details
        </Link>
      </div>
    </Card>
  );
}
