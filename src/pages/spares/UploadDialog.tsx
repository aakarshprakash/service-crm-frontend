import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Modal, Spinner, toast } from '@/components/ui';
import { STAGES, type Stage } from './sparesParts';

export type UploadKind = 'bill' | 'pending';

interface BillPreview {
  lines: number;
  new: number;
  already_added: number;
  value: number;
  linked_to_jobs: number;
  company_pending: number;
  by_stage: Record<Stage, { count: number; value: number }>;
}

interface PendingPreview {
  listed: number;
  matched: number;
  not_found: number;
  cleared: number;
  already_sent: number;
  already_sent_value: number;
}

const COPY: Record<UploadKind, { title: string; description: string; path: string; confirm: (n: number) => string }> = {
  bill: {
    title: 'Upload a Lloyd bill',
    description: 'The Excel from the brand portal, or your own tracking sheet. Lines already added are skipped, so the same file can be uploaded again.',
    path: '/spares/import',
    confirm: (n) => (n === 1 ? 'Add 1 part' : `Add ${n.toLocaleString('en-IN')} parts`),
  },
  pending: {
    title: "Upload Lloyd's pending list",
    description: 'The list of returns Lloyd is still waiting for. It replaces the last list you uploaded.',
    path: '/spares/company-pending',
    confirm: () => 'Update the pending list',
  },
};

/** Choose a file, see what it will do, then confirm. Nothing changes before the confirm. */
export function UploadDialog({ kind, onClose }: { kind: UploadKind | null; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
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

  const send = async (f: File, dryRun: boolean) => {
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

  const nothingNew = kind === 'bill' && preview && (preview as BillPreview).new === 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{preview ? 'Cancel' : 'Close'}</Button>
          {preview && !nothingNew && (
            <Button onClick={confirm} loading={busy}>
              {copy.confirm(kind === 'bill' ? (preview as BillPreview).new : 0)}
            </Button>
          )}
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
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
          {file ? (
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" aria-hidden />
              <span className="font-medium">{file.name}</span>
              <span className="text-brand-700 underline-offset-2 hover:underline">Choose another</span>
            </span>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-slate-400" aria-hidden />
              <span className="text-sm font-medium text-slate-800">Drop the Excel file here, or click to choose it</span>
              <span className="text-xs text-slate-500">.xlsx, .xls or .csv with "Billing Document" and "Material" columns</span>
            </>
          )}
        </label>

        {busy && !preview && (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Spinner className="h-4 w-4" /> Reading the file…</p>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {preview && kind === 'bill' && <BillSummary p={preview as BillPreview} />}
        {preview && kind === 'pending' && <PendingSummary p={preview as PendingPreview} />}
      </div>
    </Modal>
  );
}

function BillSummary({ p }: { p: BillPreview }) {
  if (p.new === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
        All {p.lines.toLocaleString('en-IN')} lines in this file are already added. Nothing new to add.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{p.new.toLocaleString('en-IN')} new parts</span> worth{' '}
        <span className="font-semibold tabular-nums text-slate-900">{money(p.value)}</span>
        {p.already_added > 0 && <>; {p.already_added.toLocaleString('en-IN')} already added will be skipped</>}.
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STAGES.map((s) => (
          <div key={s.value} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{p.by_stage[s.value].count.toLocaleString('en-IN')}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 text-sm text-slate-600">
        <li>{p.linked_to_jobs > 0 ? `${p.linked_to_jobs} will be linked to jobs by ticket number.` : 'None match a job yet. They link on their own once a job is booked with the same External CRM call ID.'}</li>
        {p.company_pending > 0 && <li>{p.company_pending} are marked as on Lloyd's pending list.</li>}
      </ul>
    </div>
  );
}

function PendingSummary({ p }: { p: PendingPreview }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>
        Lloyd lists <span className="font-semibold text-slate-900">{p.listed.toLocaleString('en-IN')} parts</span> as pending.
      </p>
      <ul className="space-y-1.5">
        <li><span className="font-medium text-slate-900">{p.matched}</span> match parts here and will be marked pending.</li>
        <li><span className="font-medium text-slate-900">{p.cleared}</span> were pending before and are not on this list, so they will be cleared.</li>
        {p.not_found > 0 && <li className="text-amber-800">{p.not_found} are not in the app yet. Upload the bill they came on first.</li>}
        {p.already_sent > 0 && (
          <li className="text-amber-800">
            {p.already_sent} of them you have already sent ({money(p.already_sent_value)}). They will be flagged so you can follow up with Lloyd.
          </li>
        )}
      </ul>
    </div>
  );
}
