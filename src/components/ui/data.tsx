import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { Button, Spinner } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: number | string }>({
  columns,
  rows,
  loading,
  onRowClick,
  empty,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (loading && !rows) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }
  if (!rows?.length) return <>{empty ?? <EmptyState />}</>;

  return (
    <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50/80">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', c.hideOnMobile && 'hidden md:table-cell', c.headerClassName)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-slate-50', rowClassName?.(row))}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle text-slate-700', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: { current_page: number; last_page: number; total: number; per_page: number }; onPage: (p: number) => void }) {
  const { t } = useTranslation();
  if (!meta || meta.total === 0) return null;
  const from = (meta.current_page - 1) * meta.per_page + 1;
  const to = Math.min(meta.total, meta.current_page * meta.per_page);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>
        {t('pager.range', { from, to })} <span className="font-medium text-slate-900">{meta.total}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)} aria-label={t('pager.previous')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {meta.current_page} / {meta.last_page}
        </span>
        <Button variant="ghost" size="sm" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)} aria-label={t('pager.next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title?: string; message?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const { t } = useTranslation();
  title ??= t('common.noResults');
  message ??= t('common.noResultsHint');
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-bold tracking-tight text-navy-900 sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'blue', onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'; onClick?: () => void }) {
  const toneCls = {
    blue: 'bg-brand-50 text-brand-600',
    green: 'bg-accent-50 text-accent-600',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('flex w-full items-start gap-4 rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-card', onClick && 'transition hover:-translate-y-px hover:border-brand-200 hover:shadow-lift')}
    >
      {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneCls)}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold tabular-nums text-navy-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </Tag>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] tabular-nums', value === t.value ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className, delay = 300 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; delay?: number }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
  }, [local]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}

export function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: unknown; onRetry?: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <EmptyState
        title={status === 404 ? t('error.notFound') : status === 403 ? t('error.forbidden') : t('error.loadFailed')}
        message={error instanceof Error ? error.message : t('error.tryAgain')}
        action={
          onRetry && status !== 404 && status !== 403 ? (
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
              {t('action.retry')}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children}</>;
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:flex-wrap sm:items-center', className)}>{children}</div>;
}
