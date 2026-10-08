import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { homePath, useAuth } from '@/auth/AuthProvider';
import { api, ApiError, setToken, type Envelope } from '@/lib/api';
import { safeNext } from '@/lib/utils';
import type { AuthUser } from '@/lib/types';

export default function Login() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<Envelope<{ user?: AuthUser; two_factor?: boolean; token?: string }>>('/auth/login', { email, password, code: needsCode ? code : undefined });
      if (res.data.two_factor) {
        setNeedsCode(true);
        return;
      }
      const user = res.data.user!;
      setToken(res.data.token ?? null);
      setUser(user);
      navigate(safeNext(params.get('next'), homePath(user)), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, t('auth.login.failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={needsCode ? t('auth.login.twoFactorTitle') : t('auth.login.title')}
      subtitle={needsCode ? t('auth.login.twoFactorSubtitle') : t('auth.login.subtitle')}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && !error.field('email') && !error.field('code') && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
            {error.message}
          </div>
        )}
        {!needsCode ? (
          <>
            <Field label={t('auth.email')} error={error?.field('email')} htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error?.field('email')} autoFocus />
            </Field>
            <Field
              label={
                <span className="flex items-center justify-between">
                  {t('auth.password')}
                  <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
                    {t('auth.login.forgot')}
                  </Link>
                </span>
              }
              error={error?.field('password')}
              htmlFor="password"
            >
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label={t('auth.login.code')} error={error?.field('code')} htmlFor="code">
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="pl-9 tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
          </Field>
        )}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          {needsCode ? t('auth.login.verify') : t('auth.login.submit')}
        </Button>
        {needsCode && (
          <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-slate-700" onClick={() => { setNeedsCode(false); setCode(''); }}>
            {t('auth.login.otherAccount')}
          </button>
        )}
      </form>
    </AuthLayout>
  );
}
