import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { Button, Card, Field, Input } from '@/components/ui';

/** Shown instead of the app after signing in with a temporary password from an admin. */
export function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const m = useApiMutation(() => api.put('/auth/password', pw), { toastValidation: false, success: 'Password changed. Welcome!', onSuccess: () => refresh() });
  const e = (n: string) => fieldError(m.error, n);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
            <KeyRound className="h-5 w-5 text-brand-700" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Choose your own password</h1>
            <p className="text-sm text-slate-500">Hi {user?.name}. Your administrator gave you a temporary password; replace it to continue.</p>
          </div>
        </div>
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            m.mutate(undefined);
          }}
        >
          <Field label="Temporary password" required error={e('current_password')}>
            <Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(ev) => setPw({ ...pw, current_password: ev.target.value })} autoFocus />
          </Field>
          <Field label="New password" required error={e('password')} hint="8+ characters with upper and lower case letters and a number.">
            <Input type="password" autoComplete="new-password" value={pw.password} onChange={(ev) => setPw({ ...pw, password: ev.target.value })} />
          </Field>
          <Field label="Confirm new password" required>
            <Input type="password" autoComplete="new-password" value={pw.password_confirmation} onChange={(ev) => setPw({ ...pw, password_confirmation: ev.target.value })} />
          </Field>
          <Button type="submit" className="w-full" loading={m.isPending}>
            Save and continue
          </Button>
          <button type="button" onClick={logout} className="w-full text-center text-sm text-slate-500 hover:text-slate-700">
            Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}
