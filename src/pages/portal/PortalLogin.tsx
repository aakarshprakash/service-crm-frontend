import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, Input, QueryState } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { api, ApiError, type Envelope } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

export default function PortalLogin() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const company = useQuery({ queryKey: ['portal-company', slug], queryFn: () => api.get<Envelope<{ name: string }>>(`/portal/company/${slug}`).then((r) => r.data), retry: false });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<ApiError | null>(null);
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>('/auth/otp/request', { company: slug, phone });
      setInfo(res.message);
      setStep('code');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<Envelope<{ user: AuthUser }>>('/auth/otp/verify', { company: slug, phone, code });
      setUser(res.data.user);
      navigate(`/portal/${slug}`, { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <QueryState loading={company.isLoading} error={company.error}>
      <AuthLayout brand={company.data?.name} title="Customer portal" subtitle={`Track your service requests with ${company.data?.name ?? ''}.`}>
        {step === 'phone' ? (
          <form onSubmit={requestCode} className="space-y-5">
            <Field label="Registered mobile number" error={error?.field('phone') ?? (error && !error.field('phone') ? error.message : undefined)}>
              <Input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))} placeholder="98XXXXXXXX" autoFocus maxLength={15} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading} disabled={phone.length < 10}>
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            {info && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{info}</p>}
            <Field label="6-digit code" error={error?.field('code') ?? (error && !error.field('code') ? error.message : undefined)}>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-lg tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.length !== 6}>
              Verify & continue
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>
                Change number
              </button>
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => requestCode()}>
                Resend code
              </button>
            </div>
          </form>
        )}
      </AuthLayout>
    </QueryState>
  );
}
