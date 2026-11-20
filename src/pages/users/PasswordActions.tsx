import { useState } from 'react';
import { Copy, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useApiMutation } from '@/lib/hooks';
import { Button, ConfirmDialog, Modal, toast } from '@/components/ui';
import { Hint } from '@/components/tutorial';

/** Reset someone's password: a one-time temporary password, or a reset link by email. Both sign them out everywhere. */
export function PasswordActions({ user }: { user: { id: number; name: string; email: string | null } }) {
  const [confirm, setConfirm] = useState<'link' | 'temporary' | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);
  const done = { invalidate: [['user-access', user.id]], onSuccess: () => setConfirm(null) };
  const link = useApiMutation(() => api.post(`/users/${user.id}/password`, { mode: 'link' }), done);
  const temp = useApiMutation(() => api.post<Envelope<{ temporary_password: string }>>(`/users/${user.id}/password`, { mode: 'temporary' }), {
    ...done,
    success: () => 'Temporary password set',
    onSuccess: (r) => {
      setConfirm(null);
      setTemporary(r.data.temporary_password);
    },
  });

  return (
    <>
      <div className="flex flex-col gap-2">
        <Hint block text="Creates a one-time password you hand over in person or by phone. They are signed out everywhere and must choose their own password when they next sign in, in the app or on the web.">
          <Button className="w-full" variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirm('temporary')}>
            Set temporary password
          </Button>
        </Hint>
        <Hint block text="Emails them a link to choose a new password. They are signed out everywhere straight away.">
          <Button className="w-full" variant="secondary" icon={<Mail className="h-4 w-4" />} disabled={!user.email} onClick={() => setConfirm('link')}>
            Email a reset link
          </Button>
        </Hint>
      </div>

      <ConfirmDialog
        open={confirm === 'temporary'}
        onClose={() => setConfirm(null)}
        title={`Set a temporary password for ${user.name}?`}
        message="Their current password stops working and they are signed out everywhere. You’ll see the new password once, to pass on to them."
        confirmLabel="Set temporary password"
        loading={temp.isPending}
        onConfirm={() => temp.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'link'}
        onClose={() => setConfirm(null)}
        title={`Email a reset link to ${user.email}?`}
        message="They are signed out everywhere now and choose a new password from the link (valid for 60 minutes)."
        confirmLabel="Send link"
        loading={link.isPending}
        onConfirm={() => link.mutate(undefined)}
      />
      <Modal
        open={!!temporary}
        onClose={() => setTemporary(null)}
        title="Temporary password"
        description="Shown only now. Give it to them privately; they must change it when they sign in."
        footer={<Button onClick={() => setTemporary(null)}>Done</Button>}
      >
        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-4 py-3">
          <code className="text-lg font-semibold tracking-wide text-slate-900">{temporary}</code>
          <Button
            size="sm"
            variant="secondary"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => navigator.clipboard?.writeText(temporary ?? '').then(() => toast.success('Copied'), () => toast.error('Copy failed: select and copy it instead'))}
          >
            Copy
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Don’t send it by email or WhatsApp group. Read it out or send it to them directly.
        </p>
      </Modal>
    </>
  );
}
