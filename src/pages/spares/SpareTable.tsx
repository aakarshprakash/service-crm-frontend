import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, DataTable, Pagination } from '@/components/ui';
import { ACTION, BulkDialog, type BulkAction, type Target } from './SpareDialogs';
import { CoverageBadge, StatusBadge, paperwork, type BrandSpare, type Status } from './sparesParts';

/** The most parts one bulk step changes; the server refuses more. */
const BULK_LIMIT = 2000;

/** The next step for parts at a status: the bar's main button. */
export const NEXT_STEP: Partial<Record<Status, BulkAction>> = {
  unsorted: 'coverage',
  pending_inspection: 'inspect',
  pending_dispatch: 'send',
  pending_return: 'received',
  ow_billing_pending: 'ow_billed',
  payment_pending: 'ow_paid',
};

/** The main button when every ticked part is at the same status; otherwise the steps are under "Choose a step". */
export const nextStepFor = (statuses: Status[]): BulkAction | null => (statuses.length === 1 ? NEXT_STEP[statuses[0]!] ?? null : null);

type Picked = Map<number, Status>;

/**
 * A list of part lines that can be ticked and moved on in one go. The main button is the next step
 * for the parts ticked; the other steps that make sense here are under "More".
 */
export function SpareTable({ rows, loading, meta, onPage, listFilter, actions, primaryFor = nextStepFor, couriers, manage, empty }: {
  rows?: BrandSpare[];
  loading: boolean;
  meta?: { current_page: number; last_page: number; total: number; per_page: number };
  onPage: (page: number) => void;
  /** The list's filters; "tick all" sends them, so the step applies to every part they match. */
  listFilter: Record<string, string>;
  actions: BulkAction[];
  primaryFor?: (statuses: Status[]) => BulkAction | null;
  couriers: string[];
  manage: boolean;
  empty: ReactNode;
}) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Picked>(new Map());
  const [allMatching, setAllMatching] = useState(false);
  const [action, setAction] = useState<BulkAction | null>(null);
  const total = meta?.total ?? 0;

  // A new filter is a new list: what was ticked in the old one no longer applies.
  const filterKey = JSON.stringify(listFilter);
  useEffect(() => {
    setPicked(new Map());
    setAllMatching(false);
  }, [filterKey]);

  const clear = () => {
    setPicked(new Map());
    setAllMatching(false);
  };
  const toggle = (r: BrandSpare, on: boolean) => {
    setAllMatching(false);
    setPicked((p) => {
      const next = new Map(p);
      if (on) next.set(r.id, r.status);
      else next.delete(r.id);
      return next;
    });
  };
  const pageAllPicked = !!rows?.length && rows.every((r) => picked.has(r.id));
  const togglePage = (on: boolean) => {
    setAllMatching(false);
    setPicked((p) => {
      const next = new Map(p);
      rows?.forEach((r) => (on ? next.set(r.id, r.status) : next.delete(r.id)));
      return next;
    });
  };
  const isPicked = (r: BrandSpare) => allMatching || picked.has(r.id);
  const count = allMatching ? total : picked.size;
  const value = allMatching ? null : (rows ?? []).filter((r) => picked.has(r.id)).reduce((a, r) => a + r.value, 0);
  const target: Target = allMatching ? { filter: { ...listFilter, all: '1' } } : { ids: [...picked.keys()] };
  // With "tick all", the list's own status (one queue tab) decides the main step.
  const statuses = allMatching ? (listFilter.status && !listFilter.status.includes(',') ? [listFilter.status as Status] : []) : [...new Set(picked.values())];
  const primary = primaryFor(statuses);
  const open = (r: BrandSpare) => navigate(`/spares/${r.id}`);

  const tick = (r: BrandSpare) => (
    <input
      type="checkbox"
      aria-label={`Tick ${r.description ?? r.material_code}`}
      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
      checked={isPicked(r)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => toggle(r, e.target.checked)}
    />
  );

  return (
    <>
      {manage && pageAllPicked && total > (rows?.length ?? 0) && (
        <div className="border-b border-brand-100 bg-brand-50 px-4 py-2 text-sm text-brand-900">
          {allMatching ? (
            <>All {total.toLocaleString('en-IN')} parts in this list are ticked. <button type="button" className="font-medium underline" onClick={clear}>Untick all</button></>
          ) : total > BULK_LIMIT ? (
            <>The {rows?.length} parts on this page are ticked. To change more at once, narrow the list to {BULK_LIMIT.toLocaleString('en-IN')} parts or fewer.</>
          ) : (
            <>The {rows?.length} parts on this page are ticked. <button type="button" className="font-medium underline" onClick={() => setAllMatching(true)}>Tick all {total.toLocaleString('en-IN')} in this list</button></>
          )}
        </div>
      )}

      {/* Phones: one card per part, the tick on the left. */}
      <div className="md:hidden">
        {loading && !rows ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : rows?.length ? (
          <ul className={cn('divide-y divide-slate-100', loading && 'opacity-60')}>
            {rows.map((r) => (
              <li key={r.id} className={cn('flex items-start gap-3 px-4 py-3', isPicked(r) && 'bg-brand-50/60')}>
                {manage && <div className="pt-1">{tick(r)}</div>}
                <button type="button" onClick={() => open(r)} className="min-w-0 flex-1 space-y-1 text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-slate-900">{r.description ?? r.material_code}</p>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">{money(r.value)}</p>
                  </div>
                  <p className="truncate text-xs text-slate-500">{customerOf(r) ?? 'No customer'}{r.ticket_no && `, CRM ${r.ticket_no}`}</p>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><CoverageBadge spare={r} /></div>
                </button>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          rows={rows}
          loading={loading}
          onRowClick={open}
          empty={empty}
          rowClassName={(r) => (isPicked(r) ? 'bg-brand-50/60 hover:bg-brand-50' : undefined)}
          columns={[
            ...(manage ? [{
              key: 'pick',
              header: (
                <input type="checkbox" aria-label="Tick every part on this page" className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  checked={pageAllPicked} onChange={(e) => togglePage(e.target.checked)} />
              ),
              className: 'w-px pr-0',
              headerClassName: 'w-px pr-0',
              render: tick,
            }] : []),
            {
              key: 'part',
              header: 'Part',
              render: (r: BrandSpare) => (
                <div className="min-w-0 max-w-[13rem] 2xl:max-w-[22rem]">
                  <p className="truncate font-medium text-slate-900" title={r.description ?? undefined}>{r.description ?? r.material_code}</p>
                  <p className="truncate text-xs text-slate-500"><span className="font-medium text-slate-600">{r.material_code}</span>, bill {r.billing_doc}, {date(r.billing_date)}</p>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (r: BrandSpare) => (
                <div className="min-w-0 max-w-[9rem] 2xl:max-w-[15rem]">
                  <p className="truncate text-slate-800">{customerOf(r) ?? <span className="text-slate-400">Not given</span>}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.job ? <Link to={`/jobs/${r.job.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-700 hover:underline">Job {r.job.crm_call_id}</Link>
                      : r.ticket_no ? `CRM ${r.ticket_no}` : r.po_number}
                  </p>
                </div>
              ),
            },
            { key: 'coverage', header: 'Warranty', render: (r: BrandSpare) => <CoverageBadge spare={r} /> },
            {
              key: 'value',
              header: 'Value',
              className: 'text-right',
              headerClassName: 'text-right',
              render: (r: BrandSpare) => <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{money(r.value)}</span>,
            },
            {
              key: 'paperwork',
              header: 'Paperwork',
              // Only on wide screens; the part's own page always shows it.
              className: 'hidden 2xl:table-cell',
              headerClassName: 'hidden 2xl:table-cell',
              render: (r: BrandSpare) => {
                const text = paperwork(r);
                return (
                  <div className="min-w-0 max-w-[10rem] text-xs 2xl:max-w-[15rem]">
                    <p className="truncate text-slate-700" title={text ?? undefined}>{text ?? <span className="text-slate-400">–</span>}</p>
                    {r.lr_date && <p className="truncate text-slate-500">Sent {date(r.lr_date)}{r.courier && `, ${r.courier}`}</p>}
                  </div>
                );
              },
            },
            {
              key: 'status',
              header: 'Status',
              render: (r: BrandSpare) => (
                <div className="space-y-1">
                  <StatusBadge status={r.status} />
                  {r.company_pending && r.status === 'pending_return' && <p className="whitespace-nowrap text-xs font-medium text-amber-700">Lloyd shows pending</p>}
                </div>
              ),
            },
          ]}
        />
      </div>
      <Pagination meta={meta} onPage={onPage} />

      {manage && count > 0 && (
        <BulkBar count={count} value={value} primary={primary && actions.includes(primary) ? primary : null} actions={actions} onAction={setAction} onClear={clear} />
      )}
      <BulkDialog action={action} target={target} count={count} couriers={couriers} onClose={() => setAction(null)} onDone={() => { setAction(null); clear(); }} />
    </>
  );
}

const customerOf = (r: BrandSpare) => r.customer_name ?? r.job?.customer?.name ?? null;

/** Stays at the bottom of the screen while parts are ticked: how many, and what to do with them. */
function BulkBar({ count, value, primary, actions, onAction, onClear }: {
  count: number; value: number | null; primary: BulkAction | null; actions: BulkAction[]; onAction: (a: BulkAction) => void; onClear: () => void;
}) {
  const others = actions.filter((a) => a !== primary);
  // Sticky inside the page rather than fixed to the window, so it never covers the side menu.
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center px-2">
      <div role="region" aria-label="Ticked parts" className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-navy-900 px-4 py-3 text-white shadow-lift animate-fade-in">
        <p className="mr-auto text-sm">
          <span className="font-semibold">{count === 1 ? '1 part ticked' : `${count.toLocaleString('en-IN')} parts ticked`}</span>
          {value !== null && <span className="text-slate-300">, {money(value)}</span>}
        </p>
        {primary && <Button size="sm" onClick={() => onAction(primary)}>{ACTION[primary].label}</Button>}
        {others.length > 0 && <Menu label={primary ? 'More' : 'Choose a step'} items={others.map((a) => ({ label: ACTION[a].label, onClick: () => onAction(a), danger: a === 'delete' }))} />}
        <button type="button" onClick={onClear} aria-label="Untick all" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A small button on the dark bar that opens a list of steps, upwards. */
function Menu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Button size="sm" variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-white hover:bg-white/10 hover:text-white">
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute bottom-full right-0 z-40 mb-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lift animate-fade-in">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              className={cn('block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none', it.danger && 'text-red-600')}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
