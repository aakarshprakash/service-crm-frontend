import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { homePath, useAuth } from '@/auth/AuthProvider';
import { api, ApiError, type Envelope } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/types';

interface Plan {
  id: number;
  name: string;
  price: number;
  billing_cycle: string;
  max_users: number;
  max_technicians: number;
  features: Record<string, boolean>;
}

export default function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { data: plans } = useQuery({ queryKey: ['public-plans'], queryFn: () => api.get<Envelope<Plan[]>>('/plans').then((r) => r.data) });
  const [form, setForm] = useState({ company_name: '', slug: '', name: '', email: '', phone: '', password: '', password_confirmation: '', plan_id: 0 });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'company_name' && !slugTouched) {
        next.slug = String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      }
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<Envelope<{ user: AuthUser }>>('/auth/register', { ...form, plan_id: form.plan_id || plans?.[0]?.id });
      setUser(res.data.user);
      navigate(homePath(res.data.user), { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  const selected = form.plan_id || plans?.[0]?.id;
  const f = (name: string) => error?.field(name);

  return (
    <AuthLayout
      title="Start your free trial"
      subtitle="14 days free. No card required."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && Object.keys(error.errors).length === 0 && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error.message}</div>}
        <Field label="Company name" required error={f('company_name')}>
          <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} autoFocus />
        </Field>
        <Field label="Company code" required error={f('slug')} hint="Used in your customer portal link. Lowercase letters, numbers, hyphens.">
          <Input
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value.toLowerCase());
            }}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Your name" required error={f('name')}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Phone" error={f('phone')}>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" />
          </Field>
        </div>
        <Field label="Work email" required error={f('email')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" required error={f('password')} hint="8+ chars, upper & lower case, a number.">
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {!!plans?.length && (
          <Field label="Plan (you can change it later)">
            <div className="grid gap-2">
              {plans.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => set('plan_id', p.id)}
                  className={cn('flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition', selected === p.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300')}
                >
                  <span>
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">
                      Up to {p.max_technicians} technicians · {p.max_users} office users
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-slate-700">
                    {money(p.price, 'INR')}/{p.billing_cycle === 'yearly' ? 'yr' : 'mo'}
                    {selected === p.id && <Check className="h-4 w-4 text-brand-700" />}
                  </span>
                </button>
              ))}
            </div>
          </Field>
        )}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create my account
        </Button>
      </form>
    </AuthLayout>
  );
}
