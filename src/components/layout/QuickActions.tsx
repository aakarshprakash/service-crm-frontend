import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MapPinned, Plus, Receipt, Store, Wrench } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';

// The expense form opens over whatever page is on screen; its code loads only when it is first used.
const ExpenseDialog = lazy(() => import('@/pages/expenses/ExpensesPage').then((m) => ({ default: m.ExpenseDialog })));

interface Action {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

/** "+ New" in the top bar: the everyday things to start from any page, shown only to people who may do them. */
export function QuickActions() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expense, setExpense] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const go = (to: string) => () => navigate(to);
  const actions: Action[] = [
    can('jobs.manage') && { key: 'job', label: t('quick.job'), hint: t('quick.jobHint'), icon: <Wrench className="h-4 w-4" />, run: go('/jobs/new') },
    can('expenses.manage') && { key: 'expense', label: t('quick.expense'), hint: t('quick.expenseHint'), icon: <Receipt className="h-4 w-4" />, run: () => setExpense(true) },
    can('billing.walkin') && { key: 'bill', label: t('quick.bill'), hint: t('quick.billHint'), icon: <Store className="h-4 w-4" />, run: go('/invoices/walk-in/new') },
    can('reports.view') && { key: 'report', label: t('quick.techReport'), hint: t('quick.techReportHint'), icon: <MapPinned className="h-4 w-4" />, run: go('/reports?report=technician-jobs') },
  ].filter(Boolean) as Action[];

  if (!actions.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('quick.open')}
        className="flex h-9 items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t('quick.new')}</span>
        <ChevronDown className={cn('hidden h-3.5 w-3.5 opacity-80 transition-transform sm:block', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift animate-fade-in">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.run();
              }}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{a.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{a.label}</span>
                <span className="block text-xs text-slate-500">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {expense && (
        <Suspense fallback={null}>
          <ExpenseDialog expense={null} onClose={() => setExpense(false)} />
        </Suspense>
      )}
    </div>
  );
}
