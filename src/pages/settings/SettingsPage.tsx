import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Copy, CreditCard, Database, Eye, FileText, GraduationCap, Hash, History, Mail, MapPin, MessageSquareText, Pencil, Plus, ReceiptText, Send, SlidersHorizontal, Trash2, Upload, Wallet, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GSTIN_PATTERN, PAN_PATTERN } from '@/lib/india';
import { api, imageObjectUrl, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { date, dateTime, label, money } from '@/lib/format';
import { getPosition } from '@/lib/utils';
import type { Named } from '@/lib/types';
import { UpiQr, upiLink } from '@/components/upi';
import { Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, EmptyState, Field, FilterBar, Input, Modal, PageHeader, Pagination, QueryState, SearchInput, Select, Tabs, Textarea, Toggle, toast } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

type Tab = 'company' | 'invoicing' | 'preferences' | 'master' | 'templates' | 'payments' | 'email' | 'logs' | 'audit';

interface SettingsData {
  company: {
    name: string; slug: string; email: string | null; phone: string | null; address: string | null; state: string | null; gstin: string | null; pan: string | null;
    timezone: string; currency: string; status: string; trial_ends_at: string | null;
  };
  states: string[];
  invoice_templates: string[];
  has_logo: boolean;
  settings: {
    gst: { service_sac: string; service_rate: number; part_rate: number };
    invoice_template: string;
    invoice_prefix: string;
    job_prefix: string;
    receipt_prefix: string;
    notifications: { sms: boolean; whatsapp: boolean; push: boolean; email?: boolean };
    online_payments: boolean;
    strict_cash_close: boolean;
    customer_portal: boolean;
    tutorial_mode: boolean;
    auto_assign_max_jobs: number;
    auto_assign_on_duty_only: boolean;
    attendance: { geofence: 'off' | 'flag' | 'enforce'; geofence_technicians: boolean; require_location: boolean };
    jobs?: { require_signature: boolean; require_punch_in?: boolean };
  };
  plan: { name: string; price: number; billing_cycle: string; max_users: number; max_technicians: number } | null;
  features: Record<string, boolean>;
  gateway: { driver: string; own_account: boolean; key_hint: string | null; platform_available: boolean; webhook_url: string };
  email: EmailSettingsData;
  timezones: string[];
}

const SECTIONS: { group: string; items: { value: Tab; label: string; hint: string; icon: typeof Building2 }[] }[] = [
  {
    group: 'Business',
    items: [
      { value: 'company', label: 'Company', hint: 'Profile, tax IDs, logo', icon: Building2 },
      { value: 'invoicing', label: 'Invoicing & GST', hint: 'GST rates, invoice design', icon: FileText },
      { value: 'payments', label: 'Payments', hint: 'Online payment gateway', icon: CreditCard },
      { value: 'email', label: 'Email', hint: 'Outgoing mail (SMTP)', icon: Mail },
    ],
  },
  {
    group: 'Operations',
    items: [
      { value: 'preferences', label: 'Preferences', hint: 'Jobs, cash, attendance', icon: SlidersHorizontal },
      { value: 'master', label: 'Master data', hint: 'Brands, types, lists', icon: Database },
      { value: 'templates', label: 'Message templates', hint: 'SMS & WhatsApp text', icon: MessageSquareText },
    ],
  },
  {
    group: 'Records',
    items: [
      { value: 'logs', label: 'Delivery logs', hint: 'Messages sent', icon: Send },
      { value: 'audit', label: 'Audit log', hint: 'Who changed what', icon: History },
    ],
  },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'company';
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Envelope<SettingsData>>('/settings').then((r) => r.data) });
  const current = SECTIONS.flatMap((s) => s.items).find((i) => i.value === tab);

  return (
    <>
      <PageHeader title="Settings" description="Your company profile, invoicing, preferences and master data." />
      {/* Phones: a scrolling tab strip. Desktop: a grouped side menu. */}
      <Tabs
        className="mb-6 lg:hidden"
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        tabs={SECTIONS.flatMap((s) => s.items.map((i) => ({ value: i.value, label: i.label })))}
      />
      <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-8">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <div className="sticky top-20 space-y-5">
            {SECTIONS.map((s) => (
              <div key={s.group}>
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.group}</p>
                <ul className="space-y-0.5">
                  {s.items.map((i) => {
                    const Icon = i.icon;
                    const active = i.value === tab;
                    return (
                      <li key={i.value}>
                        <button
                          type="button"
                          onClick={() => setParams({ tab: i.value })}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition',
                            active ? 'bg-white text-brand-800 shadow-card ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                          )}
                        >
                          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400')} />
                          <span>
                            <span className="block text-sm font-medium">{i.label}</span>
                            <span className="block text-xs text-slate-400">{i.hint}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          {current && (
            <div className="mb-5 hidden items-center gap-3 lg:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><current.icon className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{current.label}</h2>
                <p className="text-sm text-slate-500">{current.hint}</p>
              </div>
            </div>
          )}
          <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
            {q.data && (
              <>
                {tab === 'company' && <Company data={q.data} />}
                {tab === 'invoicing' && <Invoicing data={q.data} />}
                {tab === 'preferences' && <Preferences data={q.data} />}
                {tab === 'master' && <MasterData />}
                {tab === 'templates' && <Templates />}
                {tab === 'payments' && <Payments data={q.data} />}
                {tab === 'email' && <EmailSettings data={q.data.email} />}
                {tab === 'logs' && <DeliveryLogs />}
                {tab === 'audit' && <AuditLog />}
              </>
            )}
          </QueryState>
        </div>
      </div>
    </>
  );
}

/** Heading for a group of fields inside a card. */
function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Company({ data }: { data: SettingsData }) {
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const initial = () => ({
    ...data.company,
    email: data.company.email ?? '', phone: data.company.phone ?? '', address: data.company.address ?? '',
    gstin: data.company.gstin ?? '', pan: data.company.pan ?? '', state: data.company.state ?? '',
  });
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  // A GSTIN already contains the PAN (characters 3–12): offer it when the PAN is still empty.
  const panFromGstin = GSTIN_PATTERN.test(form.gstin) ? form.gstin.slice(2, 12) : '';
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const m = useApiMutation(() => api.put('/settings/company', form), { invalidate: [['settings']], toastValidation: false, onSuccess: () => refresh() });
  const e = (n: string) => fieldError(m.error, n);

  useEffect(() => {
    if (!data.has_logo) return setLogoUrl(null);
    let url: string | null = null;
    imageObjectUrl('/settings/logo')
      .then((u) => setLogoUrl((url = u)))
      .catch(() => setLogoUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [data.has_logo, logoVersion]);

  const uploadLogo = async (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api.post('/settings/logo', fd);
      toast.success('Logo updated.');
      setLogoVersion((v) => v + 1);
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Company profile" className="lg:col-span-2">
        <div className="space-y-6">
          <FormSection title="Business details" hint="Shown on invoices, receipts and messages to customers.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" required error={e('name')} className="sm:col-span-2">
                <Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
              </Field>
              <Field label="Email" error={e('email')}>
                <Input value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} />
              </Field>
              <Field label="Phone" error={e('phone')}>
                <Input value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} />
              </Field>
              <Field label="Address (printed on invoices)" className="sm:col-span-2" error={e('address')}>
                <Textarea rows={3} value={form.address} onChange={(ev) => setForm({ ...form, address: ev.target.value })} />
              </Field>
              <Field label="State" error={e('state')} hint="Your place of business – decides CGST + SGST or IGST.">
                <Select value={form.state} onChange={(ev) => setForm({ ...form, state: ev.target.value })}>
                  <option value="">Select state…</option>
                  {data.states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Tax & registration" hint="With a GSTIN, invoices are issued as GST tax invoices.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN" error={e('gstin')} hint={form.gstin && !GSTIN_PATTERN.test(form.gstin) ? '15 characters, e.g. 32ABCDE1234F1Z5' : undefined}>
                <Input value={form.gstin} onChange={(ev) => setForm({ ...form, gstin: ev.target.value.toUpperCase().replace(/\s/g, '') })} maxLength={15} placeholder="32ABCDE1234F1Z5" />
              </Field>
              <Field
                label="PAN"
                error={e('pan')}
                hint={
                  form.pan && !PAN_PATTERN.test(form.pan) ? '10 characters, e.g. ABCDE1234F' : panFromGstin && !form.pan ? (
                    <button type="button" className="text-brand-700 hover:underline" onClick={() => setForm({ ...form, pan: panFromGstin })}>
                      Use {panFromGstin} from the GSTIN
                    </button>
                  ) : 'Printed on invoices.'
                }
              >
                <Input value={form.pan} onChange={(ev) => setForm({ ...form, pan: ev.target.value.toUpperCase().replace(/\s/g, '') })} maxLength={10} placeholder="ABCDE1234F" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Regional">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Currency" error={e('currency')}>
                <Select value={form.currency} onChange={(ev) => setForm({ ...form, currency: ev.target.value })}>
                  {['INR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Timezone" error={e('timezone')} className="sm:col-span-2">
                <Select value={form.timezone} onChange={(ev) => setForm({ ...form, timezone: ev.target.value })}>
                  {data.timezones.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="Logo">
          {logoUrl && <img src={logoUrl} alt="Company logo" className="mb-4 max-h-20 rounded border border-slate-100 p-2" />}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Upload PNG / JPG
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(ev) => ev.target.files?.[0] && uploadLogo(ev.target.files[0])} />
          </label>
          <p className="mt-2 text-xs text-slate-500">Shown on invoices. Max 1 MB.</p>
        </Card>
        <Card title="Subscription">
          <p className="text-sm">
            <span className="font-semibold">{data.plan?.name ?? 'No plan'}</span> <StatusBadge status={data.company.status} />
          </p>
          {data.plan && (
            <p className="mt-1 text-sm text-slate-500">
              {money(data.plan.price)}/{data.plan.billing_cycle === 'yearly' ? 'year' : 'month'} · {data.plan.max_technicians} technicians · {data.plan.max_users} office users
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {Object.entries(data.features).map(([k, v]) => (
              <Badge key={k} tone={v ? 'green' : 'slate'}>
                {label(k)}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Customer portal link: <span className="font-mono">{window.location.origin}/portal/{data.company.slug}</span>
          </p>
        </Card>
      </div>
    </div>
    <SaveBar dirty={dirty} saving={m.isPending} onSave={() => m.mutate(undefined)} onDiscard={() => setForm(initial())} />
    </>
  );
}

const TEMPLATE_INFO: Record<string, { name: string; text: string; swatch: ReactNode }> = {
  classic: {
    name: 'Classic',
    text: 'Formal bordered tax invoice – the layout auditors and B2B customers expect.',
    swatch: (
      <div className="space-y-1 rounded border-2 border-slate-800 bg-white p-2">
        <div className="mx-auto h-1.5 w-1/2 rounded bg-slate-800" />
        <div className="flex gap-1"><div className="h-6 flex-1 border border-slate-400" /><div className="h-6 flex-1 border border-slate-400" /></div>
        <div className="h-1 rounded bg-slate-300" /><div className="h-1 rounded bg-slate-200" /><div className="h-1 rounded bg-slate-200" />
      </div>
    ),
  },
  modern: {
    name: 'Modern',
    text: 'Colour header band, card layout and a clean item table.',
    swatch: (
      <div className="space-y-1 overflow-hidden rounded border border-slate-200 bg-white">
        <div className="h-4 bg-[#0f3d63]" />
        <div className="space-y-1 p-2">
          <div className="flex gap-1"><div className="h-5 flex-1 rounded bg-slate-100" /><div className="h-5 flex-1 rounded bg-slate-100" /></div>
          <div className="h-1.5 rounded bg-[#0f3d63]" /><div className="h-1 rounded bg-slate-200" /><div className="h-1 rounded bg-slate-100" />
        </div>
      </div>
    ),
  },
};

/** GST rates and SAC code used on invoices, and the invoice design. */
function Invoicing({ data }: { data: SettingsData }) {
  const { refresh } = useAuth();
  const [gst, setGst] = useState(data.settings.gst);
  const [template, setTemplate] = useState(data.settings.invoice_template);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const m = useApiMutation(() => api.put('/settings/preferences', { gst: { ...gst, service_rate: Number(gst.service_rate), part_rate: Number(gst.part_rate) }, invoice_template: template }), {
    invalidate: [['settings']],
    toastValidation: false,
    onSuccess: () => refresh(),
  });
  const e = (n: string) => fieldError(m.error, n);
  const registered = !!data.company.gstin;
  const dirty = JSON.stringify(gst) !== JSON.stringify(data.settings.gst) || template !== data.settings.invoice_template;

  const preview = async (t: string) => {
    setPreviewing(t);
    try {
      window.open(await imageObjectUrl(`/settings/invoice-preview?template=${t}`), '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview not available yet – create an invoice first.');
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', registered ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
        <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />
        {registered ? (
          <p>
            GST registered (<span className="font-mono">{data.company.gstin}</span>
            {data.company.state ? `, ${data.company.state}` : ''}). Invoices are issued as <strong>tax invoices</strong>; prices you enter <strong>include GST</strong>, which is shown as CGST + SGST
            (same state) or IGST (other state).
          </p>
        ) : (
          <p>No GSTIN set – invoices are issued without tax. Add your GSTIN under <strong>Company</strong> to issue GST tax invoices.</p>
        )}
      </div>

      <Card title="GST rates">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Service SAC code" error={e('gst.service_sac')} hint="998719 = repair & maintenance of other goods.">
            <Input value={gst.service_sac} onChange={(ev) => setGst({ ...gst, service_sac: ev.target.value.replace(/\D/g, '') })} maxLength={8} />
          </Field>
          <Field label="GST on service charges" error={e('gst.service_rate')}>
            <Select value={String(gst.service_rate)} onChange={(ev) => setGst({ ...gst, service_rate: Number(ev.target.value) })}>
              {[0, 5, 12, 18, 28].map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </Select>
          </Field>
          <Field label="Default GST on parts" error={e('gst.part_rate')} hint="Items with their own HSN rate use that instead.">
            <Select value={String(gst.part_rate)} onChange={(ev) => setGst({ ...gst, part_rate: Number(ev.target.value) })}>
              {[0, 5, 12, 18, 28].map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-4 text-xs text-slate-500">Changes apply to new invoices. Invoices already issued keep the tax they were issued with.</p>
      </Card>

      <Card title="Invoice design">
        <div className="grid gap-4 sm:grid-cols-2">
          {data.invoice_templates.map((t) => {
            const info = TEMPLATE_INFO[t] ?? { name: label(t), text: '', swatch: null };
            const active = template === t;
            return (
              <div
                key={t}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => setTemplate(t)}
                onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setTemplate(t)}
                className={cn('cursor-pointer rounded-xl border-2 p-4 transition', active ? 'border-brand-600 bg-brand-50/40' : 'border-slate-200 hover:border-slate-300')}
              >
                <div className="flex gap-4">
                  <div className="w-24 shrink-0">{info.swatch}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      {info.name} {active && <Badge tone="blue">Selected</Badge>}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{info.text}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 -ml-2"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      loading={previewing === t}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        preview(t);
                      }}
                    >
                      Preview with latest invoice
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <SaveBar dirty={dirty} saving={m.isPending} onSave={() => m.mutate(undefined)} onDiscard={() => { setGst(data.settings.gst); setTemplate(data.settings.invoice_template); }} />
    </div>
  );
}

/**
 * The one way to save a settings page: a bar that appears only when something has changed,
 * so nobody has to hunt for the right Save button (or wonder whether a change was kept).
 */
function SaveBar({ dirty, saving, onSave, onDiscard }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  if (!dirty && !saving) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lift animate-fade-in">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> You have unsaved changes
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button loading={saving} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

/** A switch with a plain-language title and explanation. */
function SettingRow({ title, desc, checked, onChange, disabled, note }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
        {note && <p className="mt-1 text-xs font-medium text-amber-700">{note}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

/** A titled group of settings with an icon. */
function SettingGroup({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <Card padded={false}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100 px-5 py-4">{children}</div>
    </Card>
  );
}

function Preferences({ data }: { data: SettingsData }) {
  const { refresh } = useAuth();
  const [s, setS] = useState(data.settings);
  useEffect(() => setS(data.settings), [data.settings]);
  const m = useApiMutation(() => api.put('/settings/preferences', s), { invalidate: [['settings']], toastValidation: false, onSuccess: () => refresh() });
  const e = (n: string) => fieldError(m.error, n);
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const notInPlan = 'Not included in your plan.';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SettingGroup icon={<Wrench className="h-4 w-4" />} title="Jobs & technicians" desc="How technicians start and finish a job, and how new jobs are handed out.">
        <SettingRow
          title="Technician must punch in first"
          desc="A technician has to be on duty (punched in) before starting a job."
          checked={s.jobs?.require_punch_in ?? true}
          onChange={(v) => setS({ ...s, jobs: { require_signature: !!s.jobs?.require_signature, ...s.jobs, require_punch_in: v } })}
        />
        <SettingRow
          title="Customer must sign to finish a job"
          desc="The technician takes the customer’s signature in the app before closing the visit. It is printed on the invoice."
          checked={!!s.jobs?.require_signature}
          onChange={(v) => setS({ ...s, jobs: { ...s.jobs, require_signature: v } })}
        />
        <div className="flex items-start justify-between gap-6 py-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Auto-assign: most open jobs per technician</p>
            <p className="mt-0.5 text-sm text-slate-500">When “Auto-assign” is used, technicians who already have this many open jobs are skipped.</p>
            {e('auto_assign_max_jobs') && <p className="mt-1 text-xs text-red-600">{e('auto_assign_max_jobs')}</p>}
          </div>
          <Input
            type="number"
            min={1}
            max={500}
            className="w-24 shrink-0"
            aria-label="Most open jobs per technician"
            value={s.auto_assign_max_jobs ?? 10}
            onChange={(ev) => setS({ ...s, auto_assign_max_jobs: Number(ev.target.value) })}
          />
        </div>
        <SettingRow
          title="Auto-assign only to technicians on duty"
          desc="Only pick technicians who have punched in today."
          checked={!!s.auto_assign_on_duty_only}
          onChange={(v) => setS({ ...s, auto_assign_on_duty_only: v })}
        />
      </SettingGroup>

      <SettingGroup icon={<MessageSquareText className="h-4 w-4" />} title="Customers" desc="Messages customers receive and their self-service portal.">
        <SettingRow title="SMS updates" desc="Job booked, technician on the way, job done and payment received." checked={s.notifications.sms} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, sms: v } })} disabled={!data.features.sms} note={!data.features.sms ? notInPlan : undefined} />
        <SettingRow
          title="Email updates"
          desc="The same updates by email, for customers who have an email address. Sent from the account in Settings → Email."
          checked={!!s.notifications.email}
          onChange={(v) => setS({ ...s, notifications: { ...s.notifications, email: v } })}
        />
        <SettingRow title="WhatsApp updates" desc="The same updates on WhatsApp, with invoice and payment links." checked={s.notifications.whatsapp} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, whatsapp: v } })} disabled={!data.features.whatsapp} note={!data.features.whatsapp ? notInPlan : undefined} />
        <SettingRow title="Customer portal" desc="Customers log in with their phone number to book service, track jobs and download invoices." checked={s.customer_portal} onChange={(v) => setS({ ...s, customer_portal: v })} disabled={!data.features.customer_portal} note={!data.features.customer_portal ? notInPlan : undefined} />
        <SettingRow title="Phone alerts for technicians" desc="Technicians get a notification for new, changed and upcoming jobs." checked={s.notifications.push} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, push: v } })} />
      </SettingGroup>

      <SettingGroup icon={<Wallet className="h-4 w-4" />} title="Payments & cash" desc="Technicians always collect cash, UPI, cheque or bank transfer at the visit.">
        <SettingRow
          title="Online payment links"
          desc="Customers can pay a pending invoice online from a link."
          checked={s.online_payments}
          onChange={(v) => setS({ ...s, online_payments: v })}
          disabled={!data.features.online_payments}
          note={!data.features.online_payments ? notInPlan : undefined}
        />
        <SettingRow title="Close cash day by day" desc="A technician must hand over earlier days’ cash before closing today. Admins can always override." checked={s.strict_cash_close} onChange={(v) => setS({ ...s, strict_cash_close: v })} />
      </SettingGroup>

      <SettingGroup icon={<Hash className="h-4 w-4" />} title="Numbering" desc="The letters at the start of job, invoice and receipt numbers.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Job numbers" error={e('job_prefix')} hint={`e.g. ${s.job_prefix}-2610-00042`}>
            <Input value={s.job_prefix} onChange={(ev) => setS({ ...s, job_prefix: ev.target.value.toUpperCase() })} maxLength={10} />
          </Field>
          <Field label="Invoice numbers" error={e('invoice_prefix')} hint={`e.g. ${s.invoice_prefix}-2610-00042`}>
            <Input value={s.invoice_prefix} onChange={(ev) => setS({ ...s, invoice_prefix: ev.target.value.toUpperCase() })} maxLength={10} />
          </Field>
          <Field label="Receipt numbers" error={e('receipt_prefix')} hint={`e.g. ${s.receipt_prefix}-2610-00042`}>
            <Input value={s.receipt_prefix} onChange={(ev) => setS({ ...s, receipt_prefix: ev.target.value.toUpperCase() })} maxLength={10} />
          </Field>
        </div>
      </SettingGroup>

      <SettingGroup icon={<MapPin className="h-4 w-4" />} title="Attendance" desc="Where staff are allowed to punch in. Set each branch’s location in Master data → Branches.">
        <div className="flex items-start justify-between gap-6 py-4 first:pt-0">
          <div>
            <p className="text-sm font-medium text-slate-900">Punching away from the branch</p>
            <p className="mt-0.5 text-sm text-slate-500">Allow it, allow it but mark it, or don’t allow it.</p>
          </div>
          <Select
            className="w-48 shrink-0"
            aria-label="Punching away from the branch"
            value={s.attendance?.geofence ?? 'off'}
            onChange={(ev) => setS({ ...s, attendance: { ...s.attendance, geofence: ev.target.value as 'off' | 'flag' | 'enforce' } })}
          >
            <option value="off">Allow</option>
            <option value="flag">Allow, but mark it</option>
            <option value="enforce">Don’t allow</option>
          </Select>
        </div>
        <SettingRow
          title="Same rule for technicians"
          desc="Technicians usually start from customer sites, so they are free to punch anywhere unless you turn this on."
          checked={!!s.attendance?.geofence_technicians}
          onChange={(v) => setS({ ...s, attendance: { ...s.attendance, geofence_technicians: v } })}
        />
        <SettingRow
          title="Location must be switched on"
          desc="Don’t accept a punch if the phone or browser doesn’t share its location."
          checked={!!s.attendance?.require_location}
          onChange={(v) => setS({ ...s, attendance: { ...s.attendance, require_location: v } })}
        />
        <details className="group py-4 last:pb-0">
          <summary className="cursor-pointer list-none text-sm font-medium text-brand-700 hover:underline">What this means for your staff ›</summary>
          <PunchRules attendance={s.attendance} punchBeforeVisit={s.jobs?.require_punch_in ?? true} />
        </details>
      </SettingGroup>

      <SettingGroup icon={<GraduationCap className="h-4 w-4" />} title="Help for new users" desc="Guidance shown across the app while your team learns it.">
        <SettingRow
          title="Show help tips"
          desc="A short guide at the top of each page and ⓘ hints on buttons. Turn it off once everyone is comfortable."
          checked={s.tutorial_mode}
          onChange={(v) => setS({ ...s, tutorial_mode: v })}
        />
      </SettingGroup>

      <SaveBar dirty={dirty} saving={m.isPending} onSave={() => m.mutate(undefined)} onDiscard={() => setS(data.settings)} />
    </div>
  );
}

const MASTER_TYPES = [
  { key: 'action-taken-options', label: 'Action taken', hint: 'Outcome options technicians pick when closing a visit.' },
  { key: 'complaint-types', label: 'Complaint types', hint: '' },
  { key: 'complaint-summaries', label: 'Complaint summaries', hint: 'Optional sub-types under a complaint type.' },
  { key: 'brands', label: 'Brands', hint: '' },
  { key: 'categories', label: 'Product categories', hint: '' },
  { key: 'products', label: 'Products / models', hint: '' },
  { key: 'dealers', label: 'Dealers', hint: '' },
  { key: 'branches', label: 'Branches', hint: 'Service centres / warehouses holding stock.' },
  { key: 'service-locations', label: 'Service locations', hint: 'Areas you serve. Link technicians to each one so new jobs there can be auto-assigned.' },
  { key: 'expense-categories', label: 'Expense categories', hint: 'Heads for recording expenses, e.g. Fuel, Rent, Salaries.' },
  { key: 'upi-accounts', label: 'UPI accounts', hint: 'UPI IDs you collect into. They are printed as a “scan to pay” QR on invoices and shown to technicians when collecting.' },
  { key: 'leave-types', label: 'Leave types', hint: 'Types of leave staff can apply for, with a yearly quota (0 = not tracked). Unpaid leave is deducted in payroll.' },
  { key: 'holidays', label: 'Holidays', hint: 'Company holidays. They are paid days off and not counted against leave.' },
] as const;

type MasterRow = Named & { is_active: boolean; model_name?: string; brand?: Named | null; category?: Named | null; complaint_type?: Named | null; complaint_type_id?: number | null; brand_id?: number | null; category_id?: number | null; contact?: string | null; phone?: string | null; code?: string | null; city?: string | null; address?: string | null; pincodes?: string | null; technicians?: Named[]; technicians_count?: number;
  vpa?: string; payee_name?: string; is_default?: boolean; branch_id?: number | null; branch?: Named | null;
  annual_quota?: number; is_paid?: boolean; date?: string; lat?: number | null; lng?: number | null; geofence_radius?: number | null };

/** Plain-language result of the attendance settings above, for office staff and for technicians. */
function PunchRules({ attendance, punchBeforeVisit }: { attendance: SettingsData['settings']['attendance']; punchBeforeVisit: boolean }) {
  const mode = attendance?.geofence ?? 'off';
  const where = (applies: boolean) =>
    !applies || mode === 'off'
      ? 'from anywhere. Their location is saved with the punch so you can see it in HR → Today.'
      : mode === 'flag'
        ? 'from anywhere, but punches outside their branch radius are marked with an amber “outside” chip in HR → Today.'
        : 'only within their branch radius. The app shows how far away they are and refuses the punch outside it.';
  const location = attendance?.require_location || mode === 'enforce' ? ' Location (GPS) must be on.' : '';
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
      <p className="mb-2 font-medium text-slate-900">How punching works with these settings</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <b>Office staff</b> punch in {where(true)}
          {location}
        </li>
        <li>
          <b>Technicians</b> punch in {where(!!attendance?.geofence_technicians)}
          {attendance?.geofence_technicians ? location : attendance?.require_location ? ' Location (GPS) must be on.' : ''}
          {punchBeforeVisit ? ' They must be punched in before they can start a service.' : ''}
        </li>
        <li>The geofence only applies to branches that have a location and radius set in Master data → Branches.</li>
      </ul>
    </div>
  );
}

function MasterData() {
  const [type, setType] = useState<(typeof MASTER_TYPES)[number]['key']>('action-taken-options');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterRow | null>(null);
  const q = useQuery({ queryKey: ['master', type, search, page], queryFn: () => api.get<Paginated<MasterRow>>(`/master/${type}`, { search, page }) });
  const del = useApiMutation((row: MasterRow) => api.delete(`/master/${type}/${row.id}`), { invalidate: [['master'], ['lookups']], onSuccess: () => setDeleting(null) });
  const current = MASTER_TYPES.find((t) => t.key === type)!;

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {MASTER_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setType(t.key);
              setPage(1);
              setSearch('');
            }}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${type === t.key ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Card className="lg:col-span-3" padded={false} title={current.label} actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add</Button>}>
        {current.hint && <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{current.hint}</p>}
        <FilterBar>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="sm:w-64" />
        </FilterBar>
        <DataTable
          rows={q.data?.data}
          loading={q.isFetching}
          empty={<EmptyState title="Nothing configured yet" />}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-900">{r.model_name ?? r.name}</span> },
            ...(type === 'products' ? [{ key: 'brand', header: 'Brand / category', render: (r: MasterRow) => [r.brand?.name, r.category?.name].filter(Boolean).join(' · ') || '—' }] : []),
            ...(type === 'complaint-summaries' ? [{ key: 'ct', header: 'Complaint type', render: (r: MasterRow) => r.complaint_type?.name ?? '—' }] : []),
            ...(type === 'dealers' ? [{ key: 'c', header: 'Contact', render: (r: MasterRow) => [r.contact, r.phone].filter(Boolean).join(' · ') || '—' }] : []),
            ...(type === 'branches'
              ? [
                  { key: 'city', header: 'City', render: (r: MasterRow) => r.city ?? '—' },
                  { key: 'fence', header: 'Geofence', render: (r: MasterRow) => (r.lat != null && r.geofence_radius ? <span className="text-sm">{r.geofence_radius} m</span> : <span className="text-xs text-slate-400">Not set</span>) },
                ]
              : []),
            ...(type === 'upi-accounts'
              ? [
                  { key: 'vpa', header: 'UPI ID', render: (r: MasterRow) => <span className="font-mono text-sm">{r.vpa}</span> },
                  { key: 'payee', header: 'Payee / branch', render: (r: MasterRow) => <span className="text-sm">{r.payee_name}{r.branch && <span className="block text-xs text-slate-500">{r.branch.name}</span>}</span> },
                  { key: 'def', header: '', render: (r: MasterRow) => (r.is_default ? <Badge tone="blue">Default</Badge> : null) },
                ]
              : []),
            ...(type === 'leave-types'
              ? [
                  { key: 'quota', header: 'Days / year', render: (r: MasterRow) => (r.annual_quota ? r.annual_quota : '—') },
                  { key: 'paid', header: 'Pay', render: (r: MasterRow) => <Badge tone={r.is_paid ? 'green' : 'amber'}>{r.is_paid ? 'Paid' : 'Unpaid'}</Badge> },
                ]
              : []),
            ...(type === 'holidays' ? [{ key: 'date', header: 'Date', render: (r: MasterRow) => date(r.date) }] : []),
            ...(type === 'service-locations'
              ? [
                  { key: 'city', header: 'City / PIN codes', render: (r: MasterRow) => <span className="text-sm">{r.city ?? '—'}{r.pincodes && <span className="block max-w-xs truncate text-xs text-slate-500">{r.pincodes}</span>}</span> },
                  {
                    key: 'techs',
                    header: 'Technicians',
                    render: (r: MasterRow) =>
                      r.technicians?.length ? <span className="text-sm">{r.technicians.map((t) => t.name).join(', ')}</span> : <span className="text-xs text-amber-700">None – jobs here can’t be auto-assigned</span>,
                  },
                ]
              : []),
            { key: 'active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'slate'}>{r.is_active ? 'Active' : 'Inactive'}</Badge> },
            {
              key: 'act',
              header: '',
              className: 'text-right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(r)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={q.data?.meta} onPage={setPage} />
      </Card>
      {editing && <MasterDialog type={type} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.model_name ?? deleting?.name}”?`}
        message="If it is already used on jobs or stock it will be deactivated instead, so history stays intact."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </div>
  );
}

function MasterDialog({ type, row, onClose }: { type: string; row: MasterRow | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const [form, setForm] = useState<Record<string, string | boolean>>({
    name: row?.name ?? '',
    model_name: row?.model_name ?? '',
    brand_id: String(row?.brand_id ?? ''),
    category_id: String(row?.category_id ?? ''),
    complaint_type_id: String(row?.complaint_type_id ?? ''),
    contact: row?.contact ?? '',
    phone: row?.phone ?? '',
    code: row?.code ?? '',
    city: row?.city ?? '',
    address: row?.address ?? '',
    pincodes: row?.pincodes ?? '',
    vpa: row?.vpa ?? '',
    payee_name: row?.payee_name ?? '',
    branch_id: String(row?.branch_id ?? ''),
    is_default: row?.is_default ?? false,
    annual_quota: String(row?.annual_quota ?? ''),
    is_paid: row?.is_paid ?? true,
    date: row?.date ?? '',
    lat: row?.lat != null ? String(row.lat) : '',
    lng: row?.lng != null ? String(row.lng) : '',
    geofence_radius: row?.geofence_radius ? String(row.geofence_radius) : '',
    is_active: row?.is_active ?? true,
  });
  const [locating, setLocating] = useState(false);
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await getPosition(10000);
      setForm((f) => ({ ...f, lat: String(pos.lat), lng: String(pos.lng), geofence_radius: f.geofence_radius || '200' }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLocating(false);
    }
  };
  const { data: techs } = useStaffOptions('technician');
  const [techIds, setTechIds] = useState<number[]>(row?.technicians?.map((t) => t.id) ?? []);
  const body = () => {
    const base: Record<string, unknown> = { is_active: form.is_active };
    if (type === 'products') Object.assign(base, { model_name: form.model_name, brand_id: form.brand_id || null, category_id: form.category_id || null });
    else base.name = form.name;
    if (type === 'complaint-summaries') base.complaint_type_id = form.complaint_type_id || null;
    if (type === 'dealers') Object.assign(base, { contact: form.contact || null, phone: form.phone || null });
    if (type === 'branches')
      Object.assign(base, {
        code: form.code || null, city: form.city || null, address: form.address || null, phone: form.phone || null,
        lat: form.lat === '' ? null : Number(form.lat), lng: form.lng === '' ? null : Number(form.lng),
        geofence_radius: form.geofence_radius === '' ? null : Number(form.geofence_radius),
      });
    if (type === 'upi-accounts') Object.assign(base, { vpa: String(form.vpa).trim(), payee_name: form.payee_name, branch_id: form.branch_id || null, is_default: form.is_default });
    if (type === 'leave-types') Object.assign(base, { code: form.code || null, annual_quota: form.annual_quota === '' ? 0 : Number(form.annual_quota), is_paid: form.is_paid });
    if (type === 'holidays') base.date = form.date;
    if (type === 'service-locations') Object.assign(base, { code: form.code || null, city: form.city || null, pincodes: form.pincodes || null, technician_ids: techIds });
    return base;
  };
  const m = useApiMutation(() => (row ? api.patch(`/master/${type}/${row.id}`, body()) : api.post(`/master/${type}`, body())), { invalidate: [['master'], ['lookups']], toastValidation: false, onSuccess: onClose, success: 'Saved.' });
  const e = (n: string) => fieldError(m.error, n);
  const text = (k: string, lbl: string, required = false) => (
    <Field label={lbl} required={required} error={e(k)}>
      <Input value={String(form[k] ?? '')} onChange={(ev) => setForm({ ...form, [k]: ev.target.value })} />
    </Field>
  );
  return (
    <Modal open onClose={onClose} title={row ? 'Edit' : 'Add'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        {type === 'products' ? (
          <>
            {text('model_name', 'Model name', true)}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand">
                <Select value={String(form.brand_id)} onChange={(ev) => setForm({ ...form, brand_id: ev.target.value })}>
                  <option value="">—</option>
                  {lookups?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={String(form.category_id)} onChange={(ev) => setForm({ ...form, category_id: ev.target.value })}>
                  <option value="">—</option>
                  {lookups?.categories.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </div>
          </>
        ) : (
          text('name', 'Name', true)
        )}
        {type === 'complaint-summaries' && (
          <Field label="Complaint type">
            <Select value={String(form.complaint_type_id)} onChange={(ev) => setForm({ ...form, complaint_type_id: ev.target.value })}>
              <option value="">Any</option>
              {lookups?.complaint_types.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
        {type === 'dealers' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text('contact', 'Contact person')}
            {text('phone', 'Phone')}
          </div>
        )}
        {type === 'branches' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {text('code', 'Code')}
              {text('city', 'City')}
              {text('phone', 'Phone')}
              {text('address', 'Address')}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Attendance geofence</p>
                  <p className="text-xs text-slate-500">Staff of this branch punch in within this distance of the office. Turn it on in Preferences.</p>
                </div>
                <Button size="sm" variant="secondary" loading={locating} onClick={useMyLocation}>
                  Use my location
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {text('lat', 'Latitude')}
                {text('lng', 'Longitude')}
                {text('geofence_radius', 'Radius (m)')}
              </div>
            </div>
          </>
        )}
        {type === 'upi-accounts' && (
          <>
            <Field label="UPI ID" required error={e('vpa')} hint="As shown in your bank / UPI app, e.g. servon@okhdfcbank">
              <Input value={String(form.vpa)} onChange={(ev) => setForm({ ...form, vpa: ev.target.value })} placeholder="name@bank" />
            </Field>
            <Field label="Payee name" required error={e('payee_name')} hint="The account holder name customers see when they scan.">
              <Input value={String(form.payee_name)} onChange={(ev) => setForm({ ...form, payee_name: ev.target.value })} />
            </Field>
            {(lookups?.branches.length ?? 0) > 1 && (
              <Field label="Branch" hint="Optional: use this UPI ID for one branch’s invoices.">
                <Select value={String(form.branch_id)} onChange={(ev) => setForm({ ...form, branch_id: ev.target.value })}>
                  <option value="">All branches</option>
                  {lookups?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            <Checkbox label="Default UPI account" checked={Boolean(form.is_default)} onChange={(v) => setForm({ ...form, is_default: v })} />
            {form.vpa && form.payee_name && (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <UpiQr link={upiLink({ vpa: String(form.vpa), payee_name: String(form.payee_name) }, 100, 'Test')} size={96} />
                <p className="text-xs text-slate-600">Scan this test QR (₹1) with your phone to check the UPI ID before saving.</p>
              </div>
            )}
          </>
        )}
        {type === 'leave-types' && (
          <div className="grid grid-cols-2 gap-4">
            {text('code', 'Short code')}
            <Field label="Days per year" error={e('annual_quota')} hint="0 = not limited">
              <Input inputMode="decimal" value={String(form.annual_quota)} onChange={(ev) => setForm({ ...form, annual_quota: ev.target.value.replace(/[^\d.]/g, '') })} />
            </Field>
            <div className="col-span-2">
              <Checkbox label="Paid leave" description="Unpaid leave is deducted from salary as loss of pay." checked={Boolean(form.is_paid)} onChange={(v) => setForm({ ...form, is_paid: v })} />
            </div>
          </div>
        )}
        {type === 'holidays' && (
          <Field label="Date" required error={e('date')}>
            <Input type="date" value={String(form.date)} onChange={(ev) => setForm({ ...form, date: ev.target.value })} />
          </Field>
        )}
        {type === 'service-locations' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {text('code', 'Code')}
              {text('city', 'City')}
            </div>
            <Field label="PIN codes covered" error={e('pincodes')} hint="Separate with commas or spaces. Used to suggest this location for a customer.">
              <Textarea rows={2} value={String(form.pincodes)} onChange={(ev) => setForm({ ...form, pincodes: ev.target.value })} />
            </Field>
            <Field label="Technicians who cover this location" error={e('technician_ids')}>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {!techs?.length && <p className="px-1 py-2 text-sm text-slate-500">No technicians yet.</p>}
                {techs?.map((t) => (
                  <Checkbox
                    key={t.id}
                    label={t.name}
                    checked={techIds.includes(t.id)}
                    onChange={(v) => setTechIds((ids) => (v ? [...ids, t.id] : ids.filter((i) => i !== t.id)))}
                  />
                ))}
              </div>
            </Field>
          </>
        )}
        <Checkbox label="Active" checked={Boolean(form.is_active)} onChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
    </Modal>
  );
}

interface TemplateRow { event: string; channel: string; body: string; is_active: boolean; customized: boolean }

function Templates() {
  const q = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Envelope<TemplateRow[]>>('/settings/templates').then((r) => r.data) });
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  return (
    <Card title="Customer message templates" padded={false}>
      <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
        Placeholders: {'{customer_name} {call_id} {company} {technician_name} {technician_phone} {scheduled_at} {invoice_number} {amount} {balance} {pay_link} {receipt_number}'}
      </p>
      <DataTable
        rows={q.data?.map((t) => ({ ...t, id: `${t.event}.${t.channel}` }))}
        loading={q.isLoading}
        onRowClick={(r) => setEditing(r)}
        columns={[
          { key: 'event', header: 'Event', render: (t) => <span className="font-medium text-slate-900">{label(t.event)}</span> },
          { key: 'channel', header: 'Channel', render: (t) => <Badge tone={t.channel === 'whatsapp' ? 'green' : 'blue'}>{label(t.channel)}</Badge> },
          { key: 'body', header: 'Message', render: (t) => <span className="line-clamp-2 max-w-xl text-xs text-slate-600">{t.body}</span> },
          { key: 'state', header: '', render: (t) => (!t.is_active ? <Badge>Off</Badge> : t.customized ? <Badge tone="violet">Custom</Badge> : <Badge>Default</Badge>) },
        ]}
      />
      {editing && <TemplateDialog row={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TemplateDialog({ row, onClose }: { row: TemplateRow; onClose: () => void }) {
  const [body, setBody] = useState(row.body);
  const [active, setActive] = useState(row.is_active);
  const m = useApiMutation(() => api.put('/settings/templates', { event: row.event, channel: row.channel, body, is_active: active }), { invalidate: [['templates']], toastValidation: false, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`${label(row.event)} · ${label(row.channel)}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Save template</Button></>}>
      <div className="space-y-4">
        <Field label="Message" error={fieldError(m.error, 'body')} hint={`${body.length}/1000 characters`}>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
        </Field>
        <Checkbox label="Send this message" checked={active} onChange={setActive} />
      </div>
    </Modal>
  );
}

function Payments({ data }: { data: SettingsData }) {
  const [form, setForm] = useState({ key_id: '', key_secret: '', webhook_secret: '' });
  const [removing, setRemoving] = useState(false);
  const m = useApiMutation((body: object) => api.put('/settings/gateway', body), { invalidate: [['settings']], toastValidation: false, onSuccess: () => { setForm({ key_id: '', key_secret: '', webhook_secret: '' }); setRemoving(false); } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Offline payments">
        <p className="text-sm text-slate-600">
          Service agents collect <strong>cash, UPI, cheque or bank transfer</strong> at the visit (full or partial) and each receipt gets a number automatically. Cash and cheques are reconciled in the <strong>daily cash close</strong>; unpaid balances on <strong>credit</strong> appear in the customer outstanding report. The office can record later payments from any invoice.
        </p>
      </Card>
      <Card title="Online payment gateway (Razorpay)">
        <p className="text-sm text-slate-600">
          {data.gateway.own_account ? (
            <>Using your own merchant account <span className="font-mono">{data.gateway.key_hint}</span>.</>
          ) : data.gateway.platform_available ? (
            'Using the platform payment account. Add your own Razorpay keys to receive payments directly.'
          ) : (
            'No gateway configured. Add your Razorpay keys to enable online payment links.'
          )}
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Key ID" error={fieldError(m.error, 'key_id')}>
            <Input value={form.key_id} onChange={(e) => setForm({ ...form, key_id: e.target.value })} placeholder="rzp_live_…" autoComplete="off" />
          </Field>
          <Field label="Key secret" error={fieldError(m.error, 'key_secret')}>
            <Input type="password" value={form.key_secret} onChange={(e) => setForm({ ...form, key_secret: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Webhook secret" hint="Secrets are stored encrypted and never shown again.">
            <Input type="password" value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Webhook URL (add in Razorpay dashboard → payment.captured, payment.failed)">
            <div className="flex gap-2">
              <Input readOnly value={data.gateway.webhook_url} className="font-mono text-xs" />
              <Button variant="secondary" aria-label="Copy webhook URL" onClick={() => navigator.clipboard.writeText(data.gateway.webhook_url).then(() => toast.success('Copied'))}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button loading={m.isPending && !removing} disabled={!form.key_id || !form.key_secret} onClick={() => m.mutate({ driver: 'razorpay', ...form })}>
              Save keys
            </Button>
            {data.gateway.own_account && (
              <Button variant="ghost" className="text-red-600" onClick={() => { setRemoving(true); m.mutate({ driver: 'razorpay', remove: true }); }}>
                Remove my keys
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

interface EmailSettingsData {
  own_account: boolean;
  host: string;
  port: number;
  encryption: 'ssl' | 'tls' | 'none';
  username: string;
  from_address: string;
  from_name: string;
  has_password: boolean;
  platform_available: boolean;
  platform_from: string | null;
}

const EMAIL_PRESETS = { ssl: 465, tls: 587, none: 25 } as const;

function EmailSettings({ data }: { data: EmailSettingsData }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    host: data.host,
    port: String(data.port),
    encryption: data.encryption,
    username: data.username,
    password: '',
    from_address: data.from_address,
    from_name: data.from_name,
  });
  const [testTo, setTestTo] = useState(user?.email ?? '');
  const [removing, setRemoving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useApiMutation((body: object) => api.put('/settings/email', body), {
    invalidate: [['settings']],
    toastValidation: false,
    onSuccess: () => { set({ password: '' }); setRemoving(false); },
  });
  const test = useApiMutation((to: string) => api.post('/settings/email/test', { to }));
  const e = (name: string) => fieldError(save.error, name);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Outgoing email (SMTP)">
        <p className="text-sm text-slate-600">
          {data.own_account ? (
            <>Emails (such as staff invitations) are sent from <span className="font-mono">{data.from_address}</span> using your own mail server.</>
          ) : data.platform_available ? (
            <>Using the platform mail account (<span className="font-mono">{data.platform_from}</span>). Add your own SMTP account to send from your company address.</>
          ) : (
            'No mail server is configured, so emails cannot be delivered. Add your SMTP details below.'
          )}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="SMTP host" error={e('host')} className="sm:col-span-2">
            <Input value={form.host} onChange={(ev) => set({ host: ev.target.value })} placeholder="mail.example.com" autoComplete="off" />
          </Field>
          <Field label="Security" error={e('encryption')}>
            <Select value={form.encryption} onChange={(ev) => { const enc = ev.target.value as keyof typeof EMAIL_PRESETS; set({ encryption: enc, port: String(EMAIL_PRESETS[enc]) }); }}>
              <option value="ssl">SSL / TLS (port 465)</option>
              <option value="tls">STARTTLS (port 587)</option>
              <option value="none">None (port 25)</option>
            </Select>
          </Field>
          <Field label="Port" error={e('port')}>
            <Input type="number" value={form.port} onChange={(ev) => set({ port: ev.target.value })} />
          </Field>
          <Field label="Username" error={e('username')}>
            <Input value={form.username} onChange={(ev) => set({ username: ev.target.value })} autoComplete="off" />
          </Field>
          <Field label="Password" error={e('password')} hint={data.has_password ? 'Saved. Leave blank to keep it.' : 'Stored encrypted and never shown again.'}>
            <Input type="password" value={form.password} onChange={(ev) => set({ password: ev.target.value })} autoComplete="new-password" placeholder={data.has_password ? '••••••••' : ''} />
          </Field>
          <Field label="From address" error={e('from_address')}>
            <Input type="email" value={form.from_address} onChange={(ev) => set({ from_address: ev.target.value })} placeholder="no-reply@example.com" />
          </Field>
          <Field label="From name" error={e('from_name')}>
            <Input value={form.from_name} onChange={(ev) => set({ from_name: ev.target.value })} placeholder="Your company" />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Button loading={save.isPending && !removing} disabled={!form.host || !form.port || !form.from_address} onClick={() => save.mutate({ ...form, port: Number(form.port) })}>
            Save email settings
          </Button>
          {data.own_account && (
            <Button variant="ghost" className="text-red-600" onClick={() => { setRemoving(true); save.mutate({ remove: true }); }}>
              Remove my SMTP account
            </Button>
          )}
        </div>
      </Card>
      <Card title="Send a test email">
        <p className="text-sm text-slate-600">
          Sends a real message using the <strong>saved</strong> settings{data.own_account ? '' : ' (or the platform account if you have none)'}, so you can confirm delivery. Save any changes first.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Send to" error={fieldError(test.error, 'to')}>
            <Input type="email" value={testTo} onChange={(ev) => setTestTo(ev.target.value)} placeholder="you@example.com" />
          </Field>
          <Button loading={test.isPending} disabled={!testTo} onClick={() => test.mutate(testTo)}>
            Send test email
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface LogRow { id: number; type: string; channel: string; recipient: string | null; message: string; status: string; error: string | null; created_at: string; sent_at: string | null }

function DeliveryLogs() {
  const list = useListQuery<LogRow>('notification-logs', '/notifications/logs');
  const stats = (list.data?.meta.stats ?? {}) as Record<string, number>;
  return (
    <Card padded={false} title="SMS / WhatsApp / push delivery (last 30 days)" actions={<div className="flex gap-2 text-xs">{Object.entries(stats).map(([k, v]) => <StatusBadgeCount key={k} status={k} count={v} />)}</div>}>
      <FilterBar>
        <Select value={list.filters.channel ?? ''} onChange={(e) => list.setFilter('channel', e.target.value)} className="sm:w-40" aria-label="Channel">
          <option value="">All channels</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="push">Push</option>
        </Select>
        <Select value={list.filters.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} className="sm:w-36" aria-label="Status">
          <option value="">Any status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
        </Select>
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        empty={<EmptyState title="No messages sent yet" />}
        columns={[
          { key: 'time', header: 'Time', render: (r) => dateTime(r.created_at) },
          { key: 'event', header: 'Event', render: (r) => label(r.type) },
          { key: 'channel', header: 'Channel', render: (r) => label(r.channel) },
          { key: 'to', header: 'To', render: (r) => <span className="font-mono text-xs">{r.recipient}</span> },
          { key: 'msg', header: 'Message', hideOnMobile: true, render: (r) => <span className="line-clamp-2 max-w-md text-xs text-slate-600">{r.message}</span> },
          { key: 'status', header: 'Status', render: (r) => <span title={r.error ?? undefined}><StatusBadge status={r.status} /></span> },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
    </Card>
  );
}

function StatusBadgeCount({ status, count }: { status: string; count: number }) {
  return (
    <span className="flex items-center gap-1">
      <StatusBadge status={status} /> {count}
    </span>
  );
}

interface AuditRow { id: number; action: string; model: string | null; model_id: number | null; changes: Record<string, unknown> | null; ip_address: string | null; created_at: string; user?: Named | null }

function AuditLog() {
  const list = useListQuery<AuditRow>('audit', '/audit-logs');
  const [open, setOpen] = useState<AuditRow | null>(null);
  return (
    <Card padded={false} title="Audit trail">
      <FilterBar>
        <Select value={list.filters.model ?? ''} onChange={(e) => list.setFilter('model', e.target.value)} className="sm:w-48" aria-label="Record type">
          <option value="">All records</option>
          {['ServiceJob', 'JobVisit', 'Invoice', 'Payment', 'CashClose', 'CashDeposit', 'Customer', 'User', 'InventoryItem', 'Tenant'].map((m) => (
            <option key={m} value={m}>
              {label(m.replace(/([a-z])([A-Z])/g, '$1 $2'))}
            </option>
          ))}
        </Select>
        <Input type="date" value={list.filters.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value)} className="sm:w-40" aria-label="From" />
        <Input type="date" value={list.filters.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value)} className="sm:w-40" aria-label="To" />
      </FilterBar>
      <DataTable
        rows={list.data?.data}
        loading={list.isFetching}
        onRowClick={(r) => r.changes && setOpen(r)}
        columns={[
          { key: 'time', header: 'When', render: (r) => dateTime(r.created_at) },
          { key: 'user', header: 'User', render: (r) => r.user?.name ?? 'System' },
          { key: 'action', header: 'Action', render: (r) => <Badge tone={r.action === 'deleted' ? 'red' : r.action === 'created' ? 'green' : 'slate'}>{r.action}</Badge> },
          { key: 'model', header: 'Record', render: (r) => (r.model ? `${r.model} #${r.model_id}` : '—') },
          { key: 'ip', header: 'IP', hideOnMobile: true, render: (r) => <span className="font-mono text-xs">{r.ip_address ?? '—'}</span> },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      {open && (
        <Modal open onClose={() => setOpen(null)} size="lg" title={`${open.action} · ${open.model} #${open.model_id}`}>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(open.changes, null, 2)}</pre>
        </Modal>
      )}
    </Card>
  );
}
