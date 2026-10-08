import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <MailCheck className="mb-2 h-6 w-6" />
          <Trans i18nKey="auth.forgot.sent" values={{ email }} components={{ strong: <strong /> }} />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('auth.email')} error={error?.field('email') ?? (error && !error.field('email') ? error.message : undefined)}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
