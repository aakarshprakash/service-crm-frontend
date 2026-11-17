import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { Button, Field, Input, Modal, Spinner } from '@/components/ui';

export type HardDeleteType = 'job' | 'customer' | 'invoice' | 'payment' | 'expense' | 'income';

interface Preview {
  title: string;
  /** What has to be typed back to confirm: the record's number or name. */
  confirm: string;
  lines: string[];
  warnings: string[];
  blocked: string | null;
  enabled: boolean;
}

/** True while permanent delete is switched on in Settings and the signed-in person may use it. */
export function useHardDelete(): boolean {
  const { can } = useAuth();
  const { data: lookups } = useLookups();
  return !!lookups?.hard_delete && can('records.hard_delete');
}

/**
 * "Delete permanently" for a test entry. Renders nothing unless permanent delete is switched on
 * (Settings → Preferences) and the person is an admin. Shows what will go, then asks for the
 * record's number or name to be typed back.
 */
export function HardDeleteButton({ type, id, onDeleted, compact, label = 'Delete permanently' }: { type: HardDeleteType; id: number; onDeleted?: () => void; compact?: boolean; label?: string }) {
  const allowed = useHardDelete();
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <>
      {compact ? (
        <Button size="sm" variant="ghost" aria-label={label} title={label} className="text-red-600 hover:bg-red-50" onClick={() => setOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      {open && <HardDeleteDialog type={type} id={id} onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </>
  );
}

function HardDeleteDialog({ type, id, onClose, onDeleted }: { type: HardDeleteType; id: number; onClose: () => void; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const q = useQuery({ queryKey: ['hard-delete', type, id], queryFn: () => api.get<Envelope<Preview>>(`/hard-delete/${type}/${id}`).then((r) => r.data), gcTime: 0 });
  const m = useApiMutation(() => api.delete(`/hard-delete/${type}/${id}`, { confirm: typed.trim() }), {
    toastValidation: false,
    onSuccess: () => {
      // Almost every list and total can include the record: start them all afresh.
      qc.invalidateQueries();
      onClose();
      onDeleted?.();
    },
  });
  const p = q.data;
  const matches = !!p && typed.trim().toLowerCase() === p.confirm.trim().toLowerCase();
  return (
    <Modal
      open
      onClose={onClose}
      title={p?.title ?? 'Delete permanently?'}
      description="This can’t be undone. It is meant for test entries only."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant="danger" loading={m.isPending} disabled={!matches || !!p?.blocked} onClick={() => m.mutate(undefined)}>
            Delete permanently
          </Button>
        </>
      }
    >
      {q.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
      {q.error && <p className="text-sm text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load the details.'}</p>}
      {p && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-900">This will be removed:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {p.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
          {p.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> Your accounts will change</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {p.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {p.blocked ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{p.blocked}</p>
          ) : (
            <Field label={<>Type <span className="font-semibold text-slate-900">{p.confirm}</span> to confirm</>} error={fieldError(m.error, 'confirm') ?? fieldError(m.error, 'hard_delete')}>
              <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
