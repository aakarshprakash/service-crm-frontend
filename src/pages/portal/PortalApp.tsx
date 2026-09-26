import { useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Download, FileText, Home, LogOut, Phone, PlusCircle, Star, Wrench } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { api, download, type Envelope, type Paginated } from '@/lib/api';
import { openCheckout } from '@/lib/checkout';
import { useApiMutation } from '@/lib/hooks';
import { date, dateTime, label, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CustomerProduct, Named } from '@/lib/types';
import { Button, Card, EmptyState, Field, Input, QueryState, Select, Spinner, Textarea, toast } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

interface PortalJob { id: number; crm_call_id: string; status: string; complaint_type: string | null; complaint_details: string | null; product: string | null; technician: string | null; scheduled_at: string | null; created_at: string; completed_at: string | null; rated: boolean | null }
interface PortalInvoice { id: number; invoice_number: string; total_amount: number; paid_amount: number; balance_amount: number; payment_status: string; generated_at: string; call_id?: string }

export default function PortalApp() {
  const { slug = '' } = useParams();
  const { user, loading, logout } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user || user.role !== 'customer' || user.tenant?.slug !== slug) return <Navigate to={`/portal/${slug}/login`} replace />;
  const base = `/portal/${slug}`;
  const nav = [
    { to: base, label: 'Home', icon: Home, end: true },
    { to: `${base}/requests`, label: 'My requests', icon: Wrench },
    { to: `${base}/new`, label: 'Raise request', icon: PlusCircle },
    { to: `${base}/invoices`, label: 'Invoices', icon: FileText },
  ];

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Wrench className="h-4 w-4" />
            </div>
            <span className="font-semibold">{user.tenant?.name}</span>
          </div>
          <nav className="hidden gap-1 sm:flex">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Routes>
          <Route index element={<PortalHome base={base} />} />
          <Route path="requests" element={<Requests base={base} />} />
          <Route path="requests/:id" element={<RequestDetail base={base} />} />
          <Route path="new" element={<NewRequest base={base} />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-slate-500')}>
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

interface Overview { customer: { name: string; phone: string; address: string | null }; open_jobs: number; completed_jobs: number; outstanding: number; products: CustomerProduct[]; online_payments: boolean }

function PortalHome({ base }: { base: string }) {
  const q = useQuery({ queryKey: ['portal-overview'], queryFn: () => api.get<Envelope<Overview>>('/customer/overview').then((r) => r.data) });
  const jobs = useQuery({ queryKey: ['portal-jobs', 'open'], queryFn: () => api.get<Paginated<PortalJob>>('/customer/jobs', { status: 'open,in_progress,pending' }) });
  const d = q.data;
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      {d && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Hello, {d.customer.name.split(' ')[0]}</h1>
            <p className="text-sm text-slate-500">How can we help you today?</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Card><p className="text-2xl font-semibold">{d.open_jobs}</p><p className="text-xs text-slate-500">Open requests</p></Card>
            <Card><p className="text-2xl font-semibold">{d.completed_jobs}</p><p className="text-xs text-slate-500">Completed</p></Card>
            <Card><p className={cn('text-2xl font-semibold', d.outstanding > 0 && 'text-red-700')}>{money(d.outstanding)}</p><p className="text-xs text-slate-500">Due</p></Card>
          </div>
          <Link to={`${base}/new`} className="flex items-center justify-between rounded-xl bg-brand-700 p-5 text-white shadow">
            <span>
              <span className="block text-lg font-semibold">Raise a service request</span>
              <span className="text-sm text-brand-100">Tell us what's wrong and pick a preferred date.</span>
            </span>
            <PlusCircle className="h-8 w-8" />
          </Link>
          <Card title="Open requests" padded={false}>
            <JobList jobs={jobs.data?.data} base={base} empty="No open requests." />
          </Card>
          <Card title="My products" padded={false}>
            {d.products.length ? (
              <ul className="divide-y divide-slate-100">
                {d.products.map((p) => (
                  <li key={p.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{[p.product?.brand?.name, p.product?.model_name].filter(Boolean).join(' ') || 'Product'}</p>
                    <p className="text-xs text-slate-500">SN {p.serial_no ?? '—'} · Warranty till {date(p.warranty_expiry)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-500">No products registered.</p>
            )}
          </Card>
        </div>
      )}
    </QueryState>
  );
}

function JobList({ jobs, base, empty }: { jobs?: PortalJob[]; base: string; empty: string }) {
  if (!jobs) return <div className="h-24 animate-pulse" />;
  if (!jobs.length) return <p className="px-5 py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link to={`${base}/requests/${j.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{j.crm_call_id}</p>
              <p className="truncate text-sm text-slate-600">{j.complaint_type ?? j.complaint_details}</p>
              <p className="text-xs text-slate-500">Raised {date(j.created_at)} {j.technician && `· ${j.technician}`}</p>
            </div>
            <StatusBadge status={j.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Requests({ base }: { base: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['portal-jobs', page], queryFn: () => api.get<Paginated<PortalJob>>('/customer/jobs', { page }) });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My requests</h1>
      <Card padded={false}>
        <JobList jobs={q.data?.data} base={base} empty="You haven't raised any requests yet." />
        {q.data && q.data.meta.last_page > 1 && (
          <div className="flex justify-between border-t border-slate-100 px-5 py-3">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={page >= q.data.meta.last_page} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

interface JobView extends PortalJob {
  timeline: { status: string; at: string; remarks: string | null }[];
  visits: { date: string; status: string; action_taken: string | null; summary: string | null; total_charge: number }[];
  invoice: PortalInvoice | null;
  review: { rating: number; comment: string | null } | null;
  technician_phone: string | null;
}

function RequestDetail({ base }: { base: string }) {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['portal-job', id], queryFn: () => api.get<Envelope<JobView>>(`/customer/jobs/${id}`).then((r) => r.data), refetchInterval: 30_000 });
  const j = q.data;
  const steps = ['open', 'in_progress', 'completed'];
  const reached = j ? (j.status === 'pending' ? 1 : steps.indexOf(j.status)) : -1;
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      {j && (
        <div className="space-y-4">
          <Link to={`${base}/requests`} className="inline-flex items-center gap-1 text-sm text-slate-500">
            <ArrowLeft className="h-4 w-4" /> My requests
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{j.crm_call_id}</h1>
            <StatusBadge status={j.status} />
          </div>
          {j.status !== 'cancelled' && (
            <Card>
              <ol className="flex items-center">
                {['Registered', 'Technician working', 'Completed'].map((s, i) => (
                  <li key={s} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold', i <= reached ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-400')}>
                        {i < reached || (i === reached && j.status === 'completed') ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                      </span>
                      <span className="text-xs text-slate-600">{s}</span>
                    </div>
                    {i < 2 && <div className={cn('mx-2 h-0.5 flex-1', i < reached ? 'bg-brand-700' : 'bg-slate-200')} />}
                  </li>
                ))}
              </ol>
              {j.status === 'pending' && <p className="mt-3 text-center text-sm text-amber-800">Waiting for a part or a follow-up visit.</p>}
            </Card>
          )}
          <Card>
            <div className="space-y-1 text-sm">
              <p><span className="text-slate-500">Issue:</span> {j.complaint_type ?? '—'}</p>
              {j.complaint_details && <p className="text-slate-700">{j.complaint_details}</p>}
              <p><span className="text-slate-500">Product:</span> {j.product ?? '—'}</p>
              <p><span className="text-slate-500">Visit:</span> {dateTime(j.scheduled_at)}</p>
              {j.technician && (
                <p className="flex items-center gap-2">
                  <span className="text-slate-500">Technician:</span> {j.technician}
                  {j.technician_phone && (
                    <a href={`tel:${j.technician_phone}`} className="inline-flex items-center gap-1 text-brand-700">
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </p>
              )}
            </div>
          </Card>
          {!!j.visits.length && (
            <Card title="Visits" padded={false}>
              <ul className="divide-y divide-slate-100">
                {j.visits.map((v, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <div className="flex justify-between"><span className="font-medium">{date(v.date)}</span><StatusBadge status={v.status} /></div>
                    {v.action_taken && <p className="text-slate-700">{v.action_taken}</p>}
                    {v.summary && <p className="text-xs text-slate-500">{v.summary}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {j.invoice && <InvoiceCard invoice={j.invoice} />}
          {j.status === 'completed' && <ReviewCard jobId={j.id} review={j.review} />}
          <Card title="Updates">
            <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
              {j.timeline.map((t, i) => (
                <li key={i}>
                  <p className="font-medium">{t.remarks ?? label(t.status)}</p>
                  <p className="text-xs text-slate-500">{dateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </QueryState>
  );
}

function ReviewCard({ jobId, review }: { jobId: number; review: { rating: number; comment: string | null } | null }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const m = useApiMutation(() => api.post(`/customer/jobs/${jobId}/review`, { rating, comment: comment || null }), { onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-job'] }) });
  if (review) {
    return (
      <Card title="Your feedback">
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn('h-6 w-6', i <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />)}</div>
        {review.comment && <p className="mt-2 text-sm text-slate-600">“{review.comment}”</p>}
      </Card>
    );
  }
  return (
    <Card title="How was our service?">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star`} onClick={() => setRating(i)}>
            <Star className={cn('h-8 w-8 transition', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300')} />
          </button>
        ))}
      </div>
      <Textarea className="mt-3" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us more (optional)" maxLength={1000} />
      <Button className="mt-3" disabled={!rating} loading={m.isPending} onClick={() => m.mutate(undefined)}>
        Submit feedback
      </Button>
    </Card>
  );
}

function InvoiceCard({ invoice }: { invoice: PortalInvoice }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const pay = async () => {
    setPaying(true);
    try {
      const order = await api.post<Envelope<{ order_id: string; amount: number; currency: string; key: string; company: string; invoice_number: string }>>(`/customer/invoices/${invoice.id}/pay`);
      const result = await openCheckout(order.data, { name: user?.name, contact: user?.phone ?? undefined });
      await api.post(`/customer/invoices/${invoice.id}/confirm`, result);
      toast.success('Payment successful. Thank you!');
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(false);
    }
  };
  return (
    <Card title={`Invoice ${invoice.invoice_number}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <p>Total <strong>{money(invoice.total_amount)}</strong></p>
          <p className="text-slate-500">Paid {money(invoice.paid_amount)} · Balance {money(invoice.balance_amount)}</p>
        </div>
        <StatusBadge status={invoice.payment_status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download(`/customer/invoices/${invoice.id}/pdf`, `${invoice.invoice_number}.pdf`).catch((e) => toast.error(e.message))}>
          Download PDF
        </Button>
        {invoice.balance_amount > 0 && user?.tenant?.online_payments && (
          <Button size="sm" loading={paying} onClick={pay}>
            Pay {money(invoice.balance_amount)} online
          </Button>
        )}
      </div>
      {invoice.balance_amount > 0 && !user?.tenant?.online_payments && <p className="mt-2 text-xs text-slate-500">You can pay our service agent (cash / UPI / cheque) or at our office.</p>}
    </Card>
  );
}

function Invoices() {
  const q = useQuery({ queryKey: ['portal-invoices'], queryFn: () => api.get<Paginated<PortalInvoice>>('/customer/invoices') });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Invoices</h1>
      {q.isLoading ? <Spinner /> : !q.data?.data.length ? <Card><EmptyState title="No invoices yet" /></Card> : q.data.data.map((i) => <InvoiceCard key={i.id} invoice={i} />)}
    </div>
  );
}

function NewRequest({ base }: { base: string }) {
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ['portal-overview'], queryFn: () => api.get<Envelope<Overview>>('/customer/overview').then((r) => r.data) });
  const types = useQuery({ queryKey: ['portal-types'], queryFn: () => api.get<Envelope<Named[]>>('/customer/complaint-types').then((r) => r.data) });
  const [form, setForm] = useState({ customer_product_id: '', complaint_type_id: '', complaint_details: '', preferred_date: '' });
  const m = useApiMutation(() => api.post<Envelope<PortalJob>>('/customer/complaints', { ...form, customer_product_id: form.customer_product_id || null, complaint_type_id: form.complaint_type_id || null, preferred_date: form.preferred_date || null }), {
    toastValidation: false,
    invalidate: [['portal-jobs'], ['portal-overview']],
    onSuccess: (r) => navigate(`${base}/requests/${r.data.id}`),
  });
  const err = (n: string) => (m.error as { field?: (n: string) => string | undefined } | null)?.field?.(n);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate(undefined);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">Raise a service request</h1>
      <Card>
        <div className="space-y-4">
          <Field label="Product">
            <Select value={form.customer_product_id} onChange={(e) => setForm({ ...form, customer_product_id: e.target.value })}>
              <option value="">Select product</option>
              {overview.data?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.product?.brand?.name, p.product?.model_name].filter(Boolean).join(' ') || 'Product'} {p.serial_no && `· SN ${p.serial_no}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What's the problem?">
            <Select value={form.complaint_type_id} onChange={(e) => setForm({ ...form, complaint_type_id: e.target.value })}>
              <option value="">Select</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Describe the issue" required error={err('complaint_details')}>
            <Textarea rows={4} value={form.complaint_details} onChange={(e) => setForm({ ...form, complaint_details: e.target.value })} placeholder="e.g. AC is running but not cooling since yesterday" />
          </Field>
          <Field label="Preferred visit date" error={err('preferred_date')}>
            <Input type="date" value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            Submit request
          </Button>
        </div>
      </Card>
    </form>
  );
}
