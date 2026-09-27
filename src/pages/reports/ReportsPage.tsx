import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileBarChart, FileSpreadsheet, FileText, Lock } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { useLookups, useStaffOptions } from '@/lib/hooks';
import { dateTime, money, monthStart, qty, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReportColumn, ReportData } from '@/lib/types';
import { Badge, Button, Card, EmptyState, FilterBar, Input, Modal, PageHeader, QueryState, Select, toast } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { Hint } from '@/components/tutorial';

interface ReportMeta { key: string; title: string; description: string; financial: boolean }
interface ExportRow { id: number; title: string; format: string; status: string; created_at: string; error: string | null }

const NEEDS_DATES = new Set(['jobs', 'technician-performance', 'revenue', 'cash-collection', 'cash-close', 'inventory-consumption', 'detailed-summary']);

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const key = params.get('report');
  const reports = useQuery({ queryKey: ['reports'], queryFn: () => api.get<Envelope<ReportMeta[]>>('/reports').then((r) => r.data) });
  const [showExports, setShowExports] = useState(params.get('exports') === '1');

  if (key) {
    const meta = reports.data?.find((r) => r.key === key);
    return <ReportViewer reportKey={key} meta={meta} onBack={() => setParams({})} />;
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report can be viewed on screen and exported to Excel or PDF."
        actions={
          <Hint text="Lists large reports that were prepared in the background. Each one can be downloaded for 7 days.">
            <Button variant="secondary" onClick={() => setShowExports(true)}>
              My exports
            </Button>
          </Hint>
        }
      />
      <QueryState loading={reports.isLoading} error={reports.error}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.data?.map((r) => (
            <button key={r.key} onClick={() => setParams({ report: r.key })} className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-card transition hover:border-brand-300 hover:shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-100">
                  <FileBarChart className="h-5 w-5" />
                </div>
                {r.financial && (
                  <Badge tone="violet">
                    <Lock className="h-3 w-3" /> Finance
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-slate-900">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </button>
          ))}
        </div>
      </QueryState>
      {showExports && <ExportsDialog onClose={() => setShowExports(false)} />}
    </>
  );
}

function ReportViewer({ reportKey, meta, onBack }: { reportKey: string; meta?: ReportMeta; onBack: () => void }) {
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');
  const [filters, setFilters] = useState<Record<string, string>>({ from: monthStart(), to: today() });
  const [exporting, setExporting] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['report', reportKey, filters],
    queryFn: () => api.get<Envelope<ReportData>>(`/reports/${reportKey}`, filters).then((r) => r.data),
  });
  const set = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const doExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), format }).toString();
      const res = await download(`/reports/${reportKey}/export?${qs}`, `${reportKey}.${format}`);
      if (res.queued) toast.info(res.message ?? 'Export queued. You will be notified when it is ready.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const showTech = ['jobs', 'technician-performance', 'revenue', 'cash-collection', 'cash-close', 'inventory-consumption', 'detailed-summary'].includes(reportKey);
  const showType = ['inventory-stock', 'low-stock', 'inventory-valuation', 'inventory-consumption'].includes(reportKey);

  return (
    <>
      <PageHeader
        back={
          <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> All reports
          </button>
        }
        title={meta?.title ?? q.data?.title ?? 'Report'}
        description={meta?.description}
        actions={
          <>
            <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4 text-emerald-700" />} loading={exporting === 'xlsx'} onClick={() => doExport('xlsx')}>
              Excel
            </Button>
            <Hint text="Excel and PDF download this report with the filters you’ve set. Very large reports are prepared in the background instead: you’re notified when ready and can download them from My exports.">
              <Button variant="secondary" icon={<FileText className="h-4 w-4 text-red-600" />} loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>
                PDF
              </Button>
            </Hint>
          </>
        }
      />
      <Card padded={false}>
        <FilterBar>
          {NEEDS_DATES.has(reportKey) && (
            <>
              <Input type="date" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value)} className="sm:w-40" aria-label="From" />
              <Input type="date" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value)} className="sm:w-40" aria-label="To" />
            </>
          )}
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={filters.branch_id ?? ''} onChange={(e) => set('branch_id', e.target.value)} className="sm:w-44" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
          {showTech && (
            <Select value={filters.technician_id ?? ''} onChange={(e) => set('technician_id', e.target.value)} className="sm:w-44" aria-label="Technician">
              <option value="">All technicians</option>
              {techs?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          {showType && (
            <Select value={filters.type ?? ''} onChange={(e) => set('type', e.target.value)} className="sm:w-40" aria-label="Type">
              <option value="">Spares & consumables</option>
              <option value="spare">Spares</option>
              <option value="consumable">Consumables</option>
            </Select>
          )}
          {reportKey === 'jobs' && (
            <>
              <Select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)} className="sm:w-40" aria-label="Status">
                <option value="">Any status</option>
                {['open', 'in_progress', 'pending', 'completed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Select value={filters.priority ?? ''} onChange={(e) => set('priority', e.target.value)} className="sm:w-36" aria-label="Priority">
                <option value="">Any priority</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </>
          )}
          {reportKey === 'revenue' && (
            <Select value={filters.group_by ?? 'day'} onChange={(e) => set('group_by', e.target.value)} className="sm:w-44" aria-label="Group by">
              <option value="day">Group by day</option>
              <option value="month">Group by month</option>
              <option value="technician">Group by technician</option>
              <option value="branch">Group by branch</option>
            </Select>
          )}
          {reportKey === 'cash-close' && (
            <Select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)} className="sm:w-40" aria-label="Status">
              <option value="">Any status</option>
              <option value="submitted">Submitted</option>
              <option value="verified">Verified</option>
              <option value="closed">Closed</option>
            </Select>
          )}
          {reportKey === 'customer-ledger' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="rounded border-slate-300 text-brand-700" checked={filters.credit_only === '1'} onChange={(e) => set('credit_only', e.target.checked ? '1' : '')} />
              Credit invoices only
            </label>
          )}
        </FilterBar>

        <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && (
            <>
              {Object.keys(q.data.summary).length > 0 && (
                <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-slate-100 px-5 py-4">
                  {Object.entries(q.data.summary).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-slate-500">{k}</p>
                      <p className="text-lg font-semibold tabular-nums text-slate-900">{v}</p>
                    </div>
                  ))}
                </div>
              )}
              {q.data.truncated && <p className="bg-amber-50 px-5 py-2 text-xs text-amber-900">Showing the first 1,000 rows. Export to Excel or PDF for the complete report.</p>}
              {q.data.rows.length ? (
                <div className={cn('overflow-x-auto', q.isFetching && 'opacity-60')}>
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {q.data.columns.map((c) => (
                          <th key={c.key} className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500', isNum(c) ? 'text-right' : 'text-left')}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {q.data.rows.map((row, i) => (
                        <tr key={i} className={row._flag ? 'bg-amber-50' : undefined}>
                          {q.data.columns.map((c) => (
                            <td key={c.key} className={cn('whitespace-nowrap px-4 py-2 text-slate-700', isNum(c) && 'text-right tabular-nums')}>
                              {formatCell(row[c.key], c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No data" message="Nothing matches these filters. Try a wider date range." />
              )}
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}

function isNum(c: ReportColumn) {
  return c.type === 'money' || c.type === 'number' || c.type === 'quantity';
}

function formatCell(v: unknown, c: ReportColumn) {
  if (v === null || v === undefined || v === '') return '–';
  switch (c.type) {
    case 'money':
      return money(Number(v));
    case 'quantity':
      return qty(Number(v));
    case 'number':
      return typeof v === 'number' ? v.toLocaleString('en-IN') : String(v);
    default:
      return String(v);
  }
}

function ExportsDialog({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['exports'], queryFn: () => api.get<Envelope<ExportRow[]>>('/reports/exports').then((r) => r.data), refetchInterval: 5000 });
  return (
    <Modal open onClose={onClose} size="lg" title="My exports" description="Large reports are generated in the background and kept for 7 days.">
      {!q.data?.length ? (
        <EmptyState title="No background exports" message="Exports of very large reports appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">
                  {e.title} <span className="uppercase text-slate-500">· {e.format}</span>
                </p>
                <p className="text-xs text-slate-500">{dateTime(e.created_at)}</p>
                {e.error && <p className="text-xs text-red-600">{e.error}</p>}
              </div>
              {e.status === 'ready' ? (
                <Button size="sm" variant="secondary" onClick={() => download(`/reports/exports/${e.id}/download`, `report.${e.format}`).catch((err) => toast.error(err.message))}>
                  Download
                </Button>
              ) : (
                <StatusBadge status={e.status === 'processing' ? 'queued' : e.status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
