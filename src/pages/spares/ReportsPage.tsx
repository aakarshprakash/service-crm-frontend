import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Hourglass, ReceiptText, ScanSearch, ShieldCheck, Truck } from 'lucide-react';
import { api, download, type Paginated } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Card, PageHeader, Pagination, Select, toast } from '@/components/ui';
import { PERIODS, periodRange } from './sparesFilters';
import { Breadcrumb } from './sparesParts';

interface Upload {
  id: number; kind: 'bill' | 'pending'; file_name: string; lines: number; added: number; updated: number; unchanged: number; rejected: number;
  problems: { sheet: string; row: number; reason: string }[] | null; created_at: string; user: { id: number; name: string } | null;
}

/** Each report is the SAPRE Excel with a filter, so it opens like the sheet the office already knows. */
const REPORTS: { title: string; help: string; filter: Record<string, string>; icon: ReactNode; file: string }[] = [
  { title: 'Spare parts register', help: 'Every part line with all its details', filter: {}, icon: <FileSpreadsheet className="h-5 w-5" />, file: 'sapre-register' },
  { title: 'Warranty report', help: 'Warranty parts and their return to Lloyd', filter: { path: 'warranty' }, icon: <ShieldCheck className="h-5 w-5" />, file: 'sapre-warranty' },
  { title: 'OW billing and payment', help: 'OW parts: marked, billed by Lloyd, paid', filter: { path: 'ow' }, icon: <ReceiptText className="h-5 w-5" />, file: 'sapre-ow-billing' },
  { title: 'Inspection and RMA', help: 'Waiting for inspection or the courier', filter: { status: 'pending_inspection,pending_dispatch' }, icon: <ScanSearch className="h-5 w-5" />, file: 'sapre-inspection' },
  { title: 'Dispatch and return', help: 'Sent to Lloyd, and returned', filter: { status: 'pending_return,return_completed,replacement_completed' }, icon: <Truck className="h-5 w-5" />, file: 'sapre-dispatch' },
  { title: "Sent, still on Lloyd's list", help: 'Parts to follow up with Lloyd', filter: { attention: 'mismatch' }, icon: <AlertTriangle className="h-5 w-5" />, file: 'sapre-follow-up' },
  { title: 'Pending', help: 'Every part still waiting for a step', filter: { group: 'pending' }, icon: <Hourglass className="h-5 w-5" />, file: 'sapre-pending' },
  { title: 'Completed', help: 'Returned, replaced, paid or kept for stock', filter: { group: 'done' }, icon: <CheckCircle2 className="h-5 w-5" />, file: 'sapre-completed' },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ['spares', 'imports', page], queryFn: () => api.get<Paginated<Upload>>('/spares/imports', { page: String(page) }) });

  const get = (r: (typeof REPORTS)[number]) => {
    const params = new URLSearchParams(Object.entries({ ...r.filter, ...periodRange(period) }).filter(([, v]) => v) as [string, string][]);
    download(`/spares/export?${params}`, `${r.file}.xlsx`).catch((e) => toast.error(e.message));
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Reports' }]} />
      <PageHeader
        title="Reports"
        description="Each report downloads as Excel, in the same columns and colours as the SAPRE sheet."
        actions={
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Billing date" className="w-48">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {REPORTS.map((r) => (
          <button key={r.title} type="button" onClick={() => get(r)}
            className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-card transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden>{r.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{r.title}</span>
              <span className="block text-xs text-slate-500">{r.help}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700"><Download className="h-3.5 w-3.5" aria-hidden />Download Excel</span>
            </span>
          </button>
        ))}
      </div>

      <Card title="Upload history" className="mt-6" padded={false}>
        {history.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
        ) : !history.data?.data.length ? (
          <p className="p-4 text-sm text-slate-500">No uploads yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.data.data.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{u.file_name} <span className="font-normal text-slate-500">{u.kind === 'pending' ? "(Lloyd's pending list)" : '(Excel)'}</span></p>
                  <p className="text-xs text-slate-500">{dateTime(u.created_at)}{u.user && ` by ${u.user.name}`}</p>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {u.kind === 'pending'
                    ? `${u.lines} parts on the list, ${u.updated} updated${u.rejected ? `, ${u.rejected} not found in SAPRE` : ''}`
                    : `${u.lines} rows: ${u.added} added, ${u.updated} updated, ${u.unchanged} unchanged${u.rejected ? `, ${u.rejected} could not be read` : ''}`}
                </p>
                {!!u.problems?.length && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-red-700">See the rows that could not be read</summary>
                    <ul className="mt-1 space-y-0.5 text-red-800">{u.problems.map((p) => <li key={`${p.sheet}-${p.row}`}>{p.sheet}, row {p.row}: {p.reason}</li>)}</ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={history.data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}
