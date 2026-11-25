import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Download, MoreHorizontal, Upload, X } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery } from '@/lib/hooks';
import { date, money, moneyShort, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, toast } from '@/components/ui';
import { ACTION_LABEL, BulkDialog, SpareEditor, type BulkAction, type Target } from './SpareDialogs';
import { UploadDialog, type UploadKind } from './UploadDialog';
import { Pipeline, StageBadge, returnText, type BrandSpare, type Stage, type SparesSummary } from './sparesParts';

const PERIODS = [
  { value: '', label: 'Any billing date' },
  { value: 'this_month', label: 'Billed this month' },
  { value: 'last_month', label: 'Billed last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
];

function periodRange(period: string | undefined): { from?: string; to?: string } {
  if (!period) return {};
  const [y, m] = today().split('-').map(Number) as [number, number];
  const iso = (yy: number, mm: number, dd: number) => {
    const d = new Date(yy, mm - 1, dd);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  switch (period) {
    case 'this_month': return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'last_month': return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'last_3_months': return { from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) };
    case 'this_year': return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
    default: return {};
  }
}

const toParams = (f: Record<string, string>) => {
  const { period, ...rest } = f;
  return { ...rest, ...periodRange(period) };
};

/** The one thing to do next with parts at each stop of the route. */
const NEXT_ACTION: Record<Stage, BulkAction | null> = { unsorted: 'coverage', inspect: 'inspect', ready: 'send', sent: null, closed: null };
/** The most parts one bulk action changes; the server refuses more. */
const BULK_LIMIT = 2000;
const ALL_ACTIONS: BulkAction[] =['coverage', 'inspect', 'send', 'fresh', 'ow_billed', 'company_cleared', 'delete'];

type Picked = Map<number, { value: number; stage: Stage }>;

/** Brand spares: what Lloyd billed, and getting the warranty parts back to Lloyd. */
export default function SparesPage() {
  const { can } = useAuth();
  const manage = can('spares.manage');
  const list = useListQuery<BrandSpare>('spares', '/spares', {}, toParams);
  const f = list.filters;
  const rows = list.data?.data;
  const total = list.data?.meta?.total ?? 0;

  const scope = { search: f.search, coverage: f.coverage, ...periodRange(f.period) };
  const summary = useQuery({ queryKey: ['spares', 'summary', scope], queryFn: () => api.get<Envelope<SparesSummary>>('/spares/summary', scope).then((r) => r.data) });
  const s = summary.data;
  const couriers = s?.couriers ?? [];

  const [picked, setPicked] = useState<Picked>(new Map());
  const [allMatching, setAllMatching] = useState(false);
  const [action, setAction] = useState<BulkAction | null>(null);
  const [editing, setEditing] = useState<{ spare: BrandSpare | null } | null>(null);
  const [upload, setUpload] = useState<UploadKind | null>(null);

  // A new filter is a new list: what was ticked in the old one no longer applies.
  const filterKey = JSON.stringify({ ...f, page: undefined });
  useEffect(() => {
    setPicked(new Map());
    setAllMatching(false);
  }, [filterKey]);

  const clearPicked = () => {
    setPicked(new Map());
    setAllMatching(false);
  };
  const toggle = (r: BrandSpare, on: boolean) => {
    setAllMatching(false);
    setPicked((p) => {
      const next = new Map(p);
      if (on) next.set(r.id, { value: r.value, stage: r.stage });
      else next.delete(r.id);
      return next;
    });
  };
  const pageAllPicked = !!rows?.length && rows.every((r) => picked.has(r.id));
  const togglePage = (on: boolean) => {
    setAllMatching(false);
    setPicked((p) => {
      const next = new Map(p);
      rows?.forEach((r) => (on ? next.set(r.id, { value: r.value, stage: r.stage }) : next.delete(r.id)));
      return next;
    });
  };

  const count = allMatching ? total : picked.size;
  // "All in this list" sends the list's filters, and says "all" so an unfiltered list is meant on purpose.
  const listFilter = Object.fromEntries(Object.entries(toParams(f)).filter(([k, v]) => k !== 'page' && v)) as Record<string, string>;
  const target: Target = allMatching ? { filter: { ...listFilter, all: '1' } } : { ids: [...picked.keys()] };
  const primary = useMemo(() => primaryAction(picked, f.stage as Stage | undefined, f.attention), [picked, f.stage, f.attention]);

  const exportFile = () =>
    download(`/spares/export?${new URLSearchParams(Object.entries(toParams(f)).filter(([k, v]) => v && k !== 'page') as [string, string][])}`, 'brand-spares.xlsx')
      .catch((e) => toast.error(e.message));

  const hasFilters = Object.keys(f).some((k) => k !== 'page');
  const nothingYet = !hasFilters && s && Object.values(s.stages).every((x) => x.count === 0);

  return (
    <>
      <PageHeader
        title="Brand spares"
        description={s?.last_billing_date ? `Lloyd's bills and warranty returns. Latest bill ${date(s.last_billing_date)}.` : "Lloyd's bills and warranty returns."}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportFile}>Download Excel</Button>
            {manage && (
              <>
                <Menu label="More" items={[
                  { label: "Upload Lloyd's pending list", onClick: () => setUpload('pending') },
                  { label: 'Add one part by hand', onClick: () => setEditing({ spare: null }) },
                ]} />
                <Button icon={<Upload className="h-4 w-4" />} onClick={() => setUpload('bill')}>Upload Lloyd bill</Button>
              </>
            )}
          </>
        }
      />

      {nothingYet ? (
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title="No parts yet"
            message="Upload the Excel Lloyd sends with each bill, or your current tracking sheet. Every part line comes in once, sorted into warranty and out of warranty."
            action={manage ? <Button onClick={() => setUpload('bill')}>Upload Lloyd bill</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-100/80 p-1.5">
            <Pipeline summary={s} value={f.stage ?? ''} onChange={(v) => list.setFilters({ attention: '', stage: v })} />
          </div>

          <MismatchStrip summary={s} active={f.attention === 'mismatch'} onShow={() => list.setFilters({ stage: '', attention: 'mismatch' })} onHide={() => list.setFilter('attention', '')} />

          <Card padded={false}>
            <FilterBar>
              <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search part, bill, ticket, customer, inspection or LR" className="sm:w-96" />
              <Select value={f.coverage ?? ''} onChange={(e) => list.setFilter('coverage', e.target.value)} aria-label="Warranty" className="sm:w-44">
                <option value="">Warranty and OW</option>
                <option value="warranty">Warranty only</option>
                <option value="out_of_warranty">Out of warranty only</option>
                <option value="stock">For stock only</option>
              </Select>
              <Select value={f.period ?? ''} onChange={(e) => list.setFilter('period', e.target.value)} aria-label="Billing date" className="sm:w-44">
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
              {hasFilters && <Button variant="ghost" size="sm" onClick={list.clear} className="sm:ml-auto">Show all parts</Button>}
            </FilterBar>

            {manage && pageAllPicked && total > (rows?.length ?? 0) && (
              <div className="border-b border-brand-100 bg-brand-50 px-4 py-2 text-sm text-brand-900">
                {allMatching ? (
                  <>All {total.toLocaleString('en-IN')} parts in this list are selected. <button type="button" className="font-medium underline" onClick={clearPicked}>Clear selection</button></>
                ) : total > BULK_LIMIT ? (
                  <>The {rows?.length} parts on this page are selected. To change more at once, narrow the list to {BULK_LIMIT.toLocaleString('en-IN')} parts or fewer with a stage, date or search.</>
                ) : (
                  <>The {rows?.length} parts on this page are selected. <button type="button" className="font-medium underline" onClick={() => setAllMatching(true)}>Select all {total.toLocaleString('en-IN')} in this list</button></>
                )}
              </div>
            )}

            <SpareList
              rows={rows}
              loading={list.isFetching}
              picked={picked}
              allMatching={allMatching}
              selectable={manage}
              pageAllPicked={pageAllPicked}
              onToggle={toggle}
              onTogglePage={togglePage}
              onOpen={(r) => setEditing({ spare: r })}
              empty={<EmptyState title="No part matches" message="Try another stop on the route, search or date." />}
            />
            <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
          </Card>
        </div>
      )}

      {manage && count > 0 && (
        <BulkBar
          count={count}
          value={allMatching ? null : [...picked.values()].reduce((a, p) => a + p.value, 0)}
          primary={primary}
          onAction={setAction}
          onClear={clearPicked}
        />
      )}

      <BulkDialog action={action} target={target} count={count} couriers={couriers} onClose={() => setAction(null)} onDone={() => { setAction(null); clearPicked(); }} />
      <SpareEditor open={!!editing} spare={editing?.spare ?? null} couriers={couriers} onClose={() => setEditing(null)} />
      <UploadDialog kind={upload} onClose={() => setUpload(null)} />
    </>
  );
}

/** The main button for what is ticked: the next step of the stage most of them are at. */
function primaryAction(picked: Picked, stage: Stage | undefined, attention: string | undefined): BulkAction | null {
  if (attention === 'mismatch') return 'company_cleared';
  if (stage) return NEXT_ACTION[stage];
  const tally = new Map<Stage, number>();
  picked.forEach((p) => tally.set(p.stage, (tally.get(p.stage) ?? 0) + 1));
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? NEXT_ACTION[top] : null;
}

/** Parts sent back that Lloyd still lists as pending: money that may be charged to you. */
function MismatchStrip({ summary: s, active, onShow, onHide }: { summary?: SparesSummary; active: boolean; onShow: () => void; onHide: () => void }) {
  if (active) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p className="flex-1">Showing parts you sent that Lloyd still lists as pending. Once Lloyd confirms, tick them and choose "Lloyd has received it".</p>
        <Button size="sm" variant="secondary" onClick={onHide}>Show all parts</Button>
      </div>
    );
  }
  if (!s?.mismatch.count) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <p className="flex-1">
        <span className="font-semibold">{s.mismatch.count.toLocaleString('en-IN')} parts you sent are still on Lloyd's pending list</span>
        {' '}({moneyShort(s.mismatch.value)}). Lloyd may charge these to you if they stay pending.
        {s.company_checked_on && <span className="text-amber-800"> List uploaded on {date(s.company_checked_on)}.</span>}
      </p>
      <Button size="sm" variant="secondary" onClick={onShow}>Show them</Button>
    </div>
  );
}

function SpareList({ rows, loading, picked, allMatching, selectable, pageAllPicked, onToggle, onTogglePage, onOpen, empty }: {
  rows?: BrandSpare[];
  loading: boolean;
  picked: Picked;
  allMatching: boolean;
  selectable: boolean;
  pageAllPicked: boolean;
  onToggle: (r: BrandSpare, on: boolean) => void;
  onTogglePage: (on: boolean) => void;
  onOpen: (r: BrandSpare) => void;
  empty: ReactNode;
}) {
  const isPicked = (r: BrandSpare) => allMatching || picked.has(r.id);
  const tick = (r: BrandSpare) => (
    <input
      type="checkbox"
      aria-label={`Select ${r.description ?? r.material_code}`}
      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
      checked={isPicked(r)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onToggle(r, e.target.checked)}
    />
  );

  return (
    <>
      {/* Phones: one card per part, the tick on the left. */}
      <div className="md:hidden">
        {loading && !rows ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : rows?.length ? (
          <ul className={cn('divide-y divide-slate-100', loading && 'opacity-60')}>
            {rows.map((r) => (
              <li key={r.id} className={cn('flex items-start gap-3 px-4 py-3', isPicked(r) && 'bg-brand-50/60')}>
                {selectable && <div className="pt-1">{tick(r)}</div>}
                <button type="button" onClick={() => onOpen(r)} className="min-w-0 flex-1 space-y-1 text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-slate-900">{r.description ?? r.material_code}</p>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">{money(r.value)}</p>
                  </div>
                  <p className="truncate text-xs text-slate-500">{r.customer_name ?? r.job?.customer?.name ?? 'No customer'}{r.ticket_no && `, ticket ${r.ticket_no}`}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StageBadge spare={r} />
                    {r.company_pending && <span className="text-xs font-medium text-amber-700">On Lloyd's pending list</span>}
                  </div>
                </button>
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
          onRowClick={onOpen}
          empty={empty}
          rowClassName={(r) => (isPicked(r) ? 'bg-brand-50/60 hover:bg-brand-50' : undefined)}
          columns={[
            ...(selectable ? [{
              key: 'pick',
              header: (
                <input
                  type="checkbox"
                  aria-label="Select every part on this page"
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  checked={pageAllPicked}
                  onChange={(e) => onTogglePage(e.target.checked)}
                />
              ),
              className: 'w-px pr-0',
              headerClassName: 'w-px pr-0',
              render: tick,
            }] : []),
            {
              key: 'part',
              header: 'Part',
              render: (r: BrandSpare) => (
                <div className="min-w-0 max-w-[14rem] 2xl:max-w-[22rem]">
                  <p className="truncate font-medium text-slate-900" title={r.description ?? undefined}>{r.description ?? r.material_code}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-medium text-slate-600">{r.material_code}</span>, bill {r.billing_doc} on {date(r.billing_date)}
                    {r.quantity !== 1 && `, qty ${r.quantity}`}
                  </p>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (r: BrandSpare) => (
                <div className="min-w-0 max-w-[10rem] 2xl:max-w-[14rem]">
                  <p className="truncate text-slate-800">{r.customer_name ?? r.job?.customer?.name ?? <span className="text-slate-400">Not given</span>}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.job ? (
                      <Link to={`/jobs/${r.job.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-700 hover:underline">Job {r.job.crm_call_id}</Link>
                    ) : r.ticket_no ? `Ticket ${r.ticket_no}` : r.po_number}
                  </p>
                </div>
              ),
            },
            {
              key: 'value',
              header: 'Value',
              className: 'text-right',
              headerClassName: 'text-right',
              render: (r: BrandSpare) => <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{money(r.value)}</span>,
            },
            {
              key: 'return',
              header: 'Return',
              hideOnMobile: true,
              render: (r: BrandSpare) => {
                const text = returnText(r);
                return (
                  <div className="min-w-0 max-w-[10rem] text-xs 2xl:max-w-[15rem]">
                    <p className="truncate text-slate-700" title={text ?? undefined}>{text ?? <span className="text-slate-400">–</span>}</p>
                    {r.lr_date && <p className="text-slate-500">Sent {date(r.lr_date)}{r.courier && ` by ${r.courier}`}</p>}
                    {r.ow_billed && r.ow_billed_on && <p className="text-slate-500">Billed as OW on {date(r.ow_billed_on)}</p>}
                  </div>
                );
              },
            },
            {
              key: 'stage',
              header: 'Stage',
              render: (r: BrandSpare) => (
                <div className="space-y-1">
                  <StageBadge spare={r} />
                  {r.company_pending && <p className="whitespace-nowrap text-xs font-medium text-amber-700">On Lloyd's pending list</p>}
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}

/** Stays at the bottom of the screen while parts are ticked: how many, and what to do with them. */
function BulkBar({ count, value, primary, onAction, onClear }: { count: number; value: number | null; primary: BulkAction | null; onAction: (a: BulkAction) => void; onClear: () => void }) {
  const others = ALL_ACTIONS.filter((a) => a !== primary);
  // Sticky inside the page rather than fixed to the window, so it never covers the side menu.
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
      <div role="region" aria-label="Selected parts" className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-navy-900 px-4 py-3 text-white shadow-lift animate-fade-in">
        <p className="mr-auto text-sm">
          <span className="font-semibold">{count === 1 ? '1 part' : `${count.toLocaleString('en-IN')} parts`}</span>
          {value !== null && <span className="text-slate-300"> worth {money(value)}</span>}
        </p>
        {primary && <Button size="sm" onClick={() => onAction(primary)}>{ACTION_LABEL[primary]}</Button>}
        <Menu label={primary ? 'More' : 'Choose action'} dark up items={others.map((a) => ({ label: ACTION_LABEL[a], onClick: () => onAction(a), danger: a === 'delete' }))} />
        <button type="button" onClick={onClear} aria-label="Clear selection" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A small button that opens a list of actions. */
function Menu({ label, items, dark, up }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[]; dark?: boolean; up?: boolean }) {
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
      <Button
        size="sm"
        variant={dark ? 'ghost' : 'secondary'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        icon={dark ? undefined : <MoreHorizontal className="h-4 w-4" />}
        className={cn(dark && 'text-white hover:bg-white/10 hover:text-white', !dark && 'h-10 px-3')}
      >
        {label}
        {dark && <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
      </Button>
      {open && (
        <div role="menu" className={cn('absolute right-0 z-40 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lift animate-fade-in', up ? 'bottom-full mb-2' : 'top-full mt-2')}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              className={cn('block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none', it.danger && 'text-red-600')}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
