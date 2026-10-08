import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './primitives';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Focus the first field for keyboard users.
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={panel} className={cn('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl animate-fade-in sm:rounded-2xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('action.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-light overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for destructive / irreversible actions (NFR Usability). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === 'danger' && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
        )}
        <div className="space-y-3 text-sm text-slate-600">
          <div>{message}</div>
          {children}
        </div>
      </div>
    </Modal>
  );
}

// ---- Toasts ---------------------------------------------------------------

type ToastItem = { id: number; message: string; tone: 'success' | 'error' | 'info' };
let listeners: ((items: ToastItem[]) => void)[] = [];
let items: ToastItem[] = [];
let nextId = 1;

function emit() {
  listeners.forEach((l) => l(items));
}

export const toast = {
  show(message: string, tone: ToastItem['tone'] = 'info') {
    const id = nextId++;
    items = [...items, { id, message, tone }].slice(-4);
    emit();
    setTimeout(() => {
      items = items.filter((t) => t.id !== id);
      emit();
    }, tone === 'error' ? 6000 : 3500);
  },
  success: (m: string) => toast.show(m, 'success'),
  error: (m: string) => toast.show(m, 'error'),
  info: (m: string) => toast.show(m, 'info'),
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:items-end" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 animate-fade-in',
            t.tone === 'success' && 'bg-emerald-600 text-white ring-emerald-700',
            t.tone === 'error' && 'bg-red-600 text-white ring-red-700',
            t.tone === 'info' && 'bg-slate-900 text-white ring-slate-800',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
