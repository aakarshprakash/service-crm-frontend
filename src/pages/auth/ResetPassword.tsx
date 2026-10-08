import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, Input, toast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/** Handles both password reset and invitation ("set your password") links. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const invite = params.get('invite') === '1';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token: params.get('token'), email: params.get('email'), password, password_confirmation: confirm });
      toast.success(invite ? t('auth.reset.doneInvite') : t('auth.reset.done'));
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={invite ? t('auth.reset.titleInvite') : t('auth.reset.title')}
      subtitle={params.get('email') ?? undefined}
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {error?.field('email') && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error.field('email')}</div>}
        <Field label={t('auth.reset.newPassword')} error={error?.field('password')} hint={t('auth.reset.rules')}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        <Field label={t('auth.reset.confirm')}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          {invite ? t('auth.reset.submitInvite') : t('auth.reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
