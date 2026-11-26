import { useEffect, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { api, download, type Envelope } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Modal, Spinner, toast } from '@/components/ui';
import { STATUS, type Status } from './sparesParts';

export type UploadKind = 'bill' | 'pending';

interface BillPreview {
  lines: number;
  new: number;
  updated: number;
  unchanged: number;
  rejected: number;
  problems: { sheet: string; row: number; reason: string }[];
  value: number;
  linked_to_jobs: number;
  company_pending: number;
  by_status: Record<Status, number>;
  colours: Partial<Record<'blue' | 'light_blue' | 'orange' | 'grey', number>>;
  changes: { billing_doc: string; material_code: string; fields: string[] }[];
}

interface PendingPreview {
  listed: number;
  matched: number;
  not_found: number;
  cleared: number;
  received: number;
  already_sent: number;
  already_sent_value: number;
}

const COPY: Record<UploadKind, { title: string; description: string; path: string }> = {
  bill: {
    title: 'Upload Excel',
    description: 'A Lloyd bill from the portal, or the SAPRE template filled in. New parts are added; parts already here are updated from the filled cells. A blank cell never clears anything.',
    path: '/spares/import',
  },
  pending: {
    title: "Upload Lloyd's pending list",
    description: 'The list of returns Lloyd is still waiting for. It replaces the last list. Sent parts that drop off the list are marked as received by Lloyd.',
    path: '/spares/company-pending',
  },
};

const COLOUR_NAMES = {
  blue: ['Blue', 'bg-[#0070C0]', 'warranty'],
  orange: ['Orange', 'bg-[#FFC000]', 'marked OW'],
  light_blue: ['Light blue', 'bg-[#9DC3E6]', 'billed by Lloyd'],
  grey: ['Grey', 'bg-[#A6A6A6]', 'paid'],
} as const;

/** Choose a file, see exactly what it will do, then confirm. Nothing changes before the confirm. */
export function UploadDialog({ kind, onClose }: { kind: UploadKind | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BillPreview | PendingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!kind) {
      setFile(null);
      setPreview(null);
      setError(null);
    }
  }, [kind]);

  if (!kind) return null;
  const copy = COPY[kind];

  const send = (f: File, dryRun: boolean) => {
    const body = new FormData();
    body.append('file', f);
    body.append('dry_run', dryRun ? '1' : '0');
    return api.post<Envelope<BillPreview | PendingPreview>>(copy.path, body);
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      setPreview((await send(f, true)).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await send(file, false);
      if (res.message) toast.success(res.message);
      await qc.invalidateQueries({ queryKey: ['spares'] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  };

  const bill = kind === 'bill' ? (preview as BillPreview | null) : null;
  const nothingToDo = !!bill && bill.new === 0 && bill.updated === 0;
  const confirmLabel = bill
    ? [bill.new ? `Add ${bill.new.toLocaleString('en-IN')} new` : null, bill.updated ? `update ${bill.updated.toLocaleString('en-IN')}` : null]
      .filter(Boolean).join(' and ').replace(/^u/, 'U') + ' parts'
    : 'Update the pending list';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={copy.title}
      description={copy.description}
      footer={
        <>
          {kind === 'bill' && (
            <Button variant="ghost" className="sm:mr-auto" icon={<Download className="h-4 w-4" />}
              onClick={() => download('/spares/template', 'sapre-template.xlsx').catch((e) => toast.error(e.message))}>
              Download blank template
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{preview ? 'Cancel' : 'Close'}</Button>
          {preview && !nothingToDo && <Button onClick={confirm} loading={busy}>{confirmLabel}</Button>}
        </>
      }
    >
      <div className="space-y-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors focus-within:ring-2 focus-within:ring-brand-500',
            file ? 'py-4' : 'py-10',
            dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50',
          )}
        >
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
          {file ? (
            <span className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" aria-hidden />
              <span className="font-medium">{file.name}</span>
              <span className="text-brand-700">Choose another file</span>
            </span>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-slate-400" aria-hidden />
              <span className="text-sm font-medium text-slate-800">Drop the Excel file here, or click to choose it</span>
              <span className="text-xs text-slate-500">.xlsx, .xls or .csv, with "Billing Document" and "Material" columns</span>
            </>
          )}
        </label>

        {busy && !preview && <p className="flex items-center gap-2 text-sm text-slate-600"><Spinner className="h-4 w-4" /> Reading the file…</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {bill && <BillSummary p={bill} />}
        {preview && kind === 'pending' && <PendingSummary p={preview as PendingPreview} />}
      </div>
    </Modal>
  );
}

function BillSummary({ p }: { p: BillPreview }) {
  const statuses = (Object.keys(p.by_status) as Status[]).filter((s) => p.by_status[s] > 0);
  const colours = (Object.keys(p.colours) as (keyof typeof COLOUR_NAMES)[]).filter((c) => p.colours[c]);
  const tiles: [string, number, string][] = [
    ['New parts', p.new, 'text-slate-900'],
    ['Updated', p.updated, 'text-slate-900'],
    ['No change', p.unchanged, 'text-slate-500'],
    ['Cannot be read', p.rejected, p.rejected ? 'text-red-700' : 'text-slate-500'],
  ];
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, n, tone]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={cn('text-lg font-semibold tabular-nums', tone)}>{n.toLocaleString('en-IN')}</dd>
          </div>
        ))}
      </dl>

      {p.new > 0 && (
        <div className="space-y-2">
          <p>The new parts are worth <span className="font-semibold tabular-nums text-slate-900">{money(p.value)}</span>. They will start at:</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {statuses.map((s) => (
              <li key={s} className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', STATUS[s].dot)} aria-hidden />{STATUS[s].label} <span className="font-medium tabular-nums text-slate-900">{p.by_status[s]}</span></li>
            ))}
          </ul>
          <p className="text-slate-600">{p.linked_to_jobs > 0 ? `${p.linked_to_jobs} match a job by its External CRM call ID.` : 'None match a job yet. They link by themselves once a job is booked with the same CRM ID.'}</p>
        </div>
      )}

      {colours.length > 0 && (
        <p className="text-slate-600">
          Row colours read from the sheet:{' '}
          {colours.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1">
              {i > 0 && ', '}<span className={cn('h-2.5 w-2.5 rounded-sm', COLOUR_NAMES[c][1])} aria-hidden />{COLOUR_NAMES[c][0]} {p.colours[c]} ({COLOUR_NAMES[c][2]})
            </span>
          ))}
        </p>
      )}

      {p.updated > 0 && (
        <div>
          <p className="font-medium text-slate-900">Changes to parts already here</p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {p.changes.map((c) => <li key={c.billing_doc + c.material_code}>Bill {c.billing_doc}, {c.material_code}: {c.fields.map((x) => x.replace(/_/g, ' ')).join(', ')}</li>)}
            {p.updated > p.changes.length && <li>and {p.updated - p.changes.length} more</li>}
          </ul>
        </div>
      )}

      {p.rejected > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-2 font-medium text-red-800"><AlertTriangle className="h-4 w-4" aria-hidden /> {p.rejected} rows cannot be read and will be skipped</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-red-800">
            {p.problems.map((x) => <li key={`${x.sheet}-${x.row}`}>{x.sheet}, row {x.row}: {x.reason}</li>)}
          </ul>
          <p className="mt-1 text-xs text-red-700">Fix them in the Excel and upload it again. The other rows go in now.</p>
        </div>
      )}

      {p.new === 0 && p.updated === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3">Everything in this file is already here. Nothing to change.</p>}
    </div>
  );
}

function PendingSummary({ p }: { p: PendingPreview }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>Lloyd lists <span className="font-semibold text-slate-900">{p.listed.toLocaleString('en-IN')} parts</span> as pending.</p>
      <ul className="space-y-1.5">
        <li><span className="font-medium text-slate-900">{p.matched}</span> match parts here and will be marked pending.</li>
        <li>
          <span className="font-medium text-slate-900">{p.cleared}</span> were pending before and are not on this list any more
          {p.received > 0 && <>; <span className="font-medium text-slate-900">{p.received}</span> of them were sent, so they will be marked received by Lloyd</>}.
        </li>
        {p.not_found > 0 && <li className="text-amber-800">{p.not_found} are not in SAPRE yet. Upload the bill they came on first.</li>}
        {p.already_sent > 0 && <li className="text-amber-800">{p.already_sent} of them you already sent ({money(p.already_sent_value)}). They stay in Pending return so you can follow up with Lloyd.</li>}
      </ul>
    </div>
  );
}
