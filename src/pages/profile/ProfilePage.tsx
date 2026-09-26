import { useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import type { AuthUser } from '@/lib/types';
import { Badge, Button, Card, Field, Input, Modal, PageHeader } from '@/components/ui';

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [twoFactor, setTwoFactor] = useState<{ secret: string; qr: string } | null>(null);
  const [disabling, setDisabling] = useState(false);

  const saveProfile = useApiMutation(() => api.put<Envelope<{ user: AuthUser }>>('/auth/profile', profile), { toastValidation: false, onSuccess: (r) => setUser(r.data.user) });
  const changePw = useApiMutation(() => api.put('/auth/password', pw), { toastValidation: false, onSuccess: () => setPw({ current_password: '', password: '', password_confirmation: '' }) });
  const setup = useApiMutation(() => api.post<Envelope<{ secret: string; otpauth_url: string }>>('/auth/two-factor'), {
    success: '',
    onSuccess: async (r) => setTwoFactor({ secret: r.data.secret, qr: await QRCode.toDataURL(r.data.otpauth_url, { margin: 1, width: 200 }) }),
  });

  if (!user) return null;
  const canUse2fa = user.role !== 'technician' && user.role !== 'customer';

  return (
    <>
      <PageHeader title="My profile" description={`${user.role_label}${user.tenant ? ` · ${user.tenant.name}` : ''}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Personal details" actions={<Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate(undefined)}>Save</Button>}>
          <div className="space-y-4">
            <Field label="Name" error={fieldError(saveProfile.error, 'name')}>
              <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Mobile" error={fieldError(saveProfile.error, 'phone')}>
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input value={user.email ?? ''} disabled />
            </Field>
          </div>
        </Card>

        <Card title="Change password" actions={<Button loading={changePw.isPending} onClick={() => changePw.mutate(undefined)}>Update</Button>}>
          <div className="space-y-4">
            <Field label="Current password" error={fieldError(changePw.error, 'current_password')}>
              <Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </Field>
            <Field label="New password" error={fieldError(changePw.error, 'password')} hint="8+ characters with upper & lower case and a number. Other devices are signed out.">
              <Input type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" autoComplete="new-password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
            </Field>
          </div>
        </Card>

        {canUse2fa && (
          <Card title="Two-factor authentication">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-slate-600">Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) at every sign-in.</p>
              <Badge tone={user.two_factor_enabled ? 'green' : 'slate'}>{user.two_factor_enabled ? 'Enabled' : 'Off'}</Badge>
            </div>
            <div className="mt-4">
              {user.two_factor_enabled ? (
                <Button variant="secondary" icon={<ShieldOff className="h-4 w-4" />} onClick={() => setDisabling(true)}>
                  Turn off
                </Button>
              ) : (
                <Button icon={<ShieldCheck className="h-4 w-4" />} loading={setup.isPending} onClick={() => setup.mutate(undefined)}>
                  Set up two-factor
                </Button>
              )}
            </div>
          </Card>
        )}

        <Card title="Session">
          <p className="text-sm text-slate-600">Signed in as {user.email ?? user.phone}.</p>
          <Button className="mt-4" variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </Card>
      </div>

      {twoFactor && <ConfirmTwoFactor data={twoFactor} onDone={(u) => { setUser(u); setTwoFactor(null); }} onClose={() => setTwoFactor(null)} />}
      {disabling && <DisableTwoFactor onDone={(u) => { setUser(u); setDisabling(false); }} onClose={() => setDisabling(false)} />}
    </>
  );
}

function ConfirmTwoFactor({ data, onDone, onClose }: { data: { secret: string; qr: string }; onDone: (u: AuthUser) => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const m = useApiMutation(() => api.post<Envelope<{ user: AuthUser }>>('/auth/two-factor/confirm', { code }), { toastValidation: false, onSuccess: (r) => onDone(r.data.user) });
  return (
    <Modal open onClose={onClose} title="Set up two-factor authentication" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={code.length !== 6} onClick={() => m.mutate(undefined)}>Verify & enable</Button></>}>
      <div className="space-y-4 text-sm">
        <p>1. Scan this QR code with your authenticator app.</p>
        <img src={data.qr} alt="Two-factor QR code" className="mx-auto h-48 w-48 rounded-lg border border-slate-200" />
        <p className="text-center text-xs text-slate-500">
          Can't scan? Enter this key: <span className="select-all font-mono">{data.secret}</span>
        </p>
        <Field label="2. Enter the 6-digit code shown in the app" error={fieldError(m.error, 'code')}>
          <Input inputMode="numeric" maxLength={6} className="text-center tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function DisableTwoFactor({ onDone, onClose }: { onDone: (u: AuthUser) => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const m = useApiMutation(() => api.delete<Envelope<{ user: AuthUser }>>('/auth/two-factor', { password }), { toastValidation: false, onSuccess: (r) => onDone(r.data.user) });
  return (
    <Modal open onClose={onClose} title="Turn off two-factor authentication?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={m.isPending} onClick={() => m.mutate(undefined)}>Turn off</Button></>}>
      <Field label="Confirm with your password" error={fieldError(m.error, 'password')}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
