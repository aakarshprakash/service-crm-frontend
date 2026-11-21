import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, CopyPlus, Trash2 } from 'lucide-react';
import { money, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Input, Select, Textarea } from '@/components/ui';
import { GST_RATES } from './estimateParts';

/** One line of an estimate as it is typed: money fields stay text until saved. */
export interface Line {
  key: number;
  type: 'service' | 'part';
  item_id: number | null;
  /** A part from the price list: its code, and its own GST rate if it has one. */
  code: string | null;
  itemRate: number | null;
  description: string;
  details: string;
  unit: string;
  quantity: string;
  unit_price: string;
  /** null: the rate Settings → GST gives this kind of line. */
  gst_rate: number | null;
}

let nextKey = 1;
export const newKey = () => nextKey++;
export const lineTotal = (l: Line) => Math.round((parseFloat(l.quantity) || 0) * toMinor(l.unit_price));
export const blankLine = (type: Line['type']): Line => ({ key: newKey(), type, item_id: null, code: null, itemRate: null, description: '', details: '', unit: type === 'service' ? 'Job' : 'Nos', quantity: '1', unit_price: '', gst_rate: null });

/** Switching service↔part: a part forgets its price-list link; the untouched default unit flips too (Job↔Nos). */
function typePatch(l: Line, type: Line['type']): Partial<Line> {
  const patch: Partial<Line> = { type };
  if (type === 'service') {
    Object.assign(patch, { item_id: null, code: null, itemRate: null });
    if (l.unit === 'Nos') patch.unit = 'Job';
  } else if (l.unit === 'Job') {
    patch.unit = 'Nos';
  }
  return patch;
}

/** Enter in a single-line box moves on instead of saving the whole estimate by accident. */
export function noEnterSubmit(e: KeyboardEvent<HTMLElement>) {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
}

const MAX_GROW_PX = 240;

/** A text box that grows with what is typed, up to a limit, then scrolls. */
function AutoTextarea({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_GROW_PX)}px`;
    el.style.overflowY = el.scrollHeight + 2 > MAX_GROW_PX ? 'auto' : 'hidden';
  };
  useLayoutEffect(fit, [value]);
  // A narrower or wider box wraps the text differently: fit again once the width settles (table layout, window resize).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const watcher = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  return <Textarea ref={ref} rows={1} value={value} className={cn('resize-none text-sm leading-snug', className)} {...props} />;
}

interface Props {
  lines: Line[];
  isGst: boolean;
  inclusive: boolean;
  rateLabel: string;
  rateOf: (l: Line) => number;
  /** GST of each line (paise), after its share of the discount. */
  taxes: { taxable: number; tax: number }[];
  errorOf: (i: number) => string | undefined;
  invalid: (i: number, key: string) => boolean;
  onChange: (key: number, patch: Partial<Line>) => void;
  onRemove: (key: number) => void;
  onDuplicate: (key: number) => void;
  onMove: (index: number, by: -1 | 1) => void;
}

/** The lines as a table on wide screens and as one card per line on phones. */
export function LineEditor({ lines, isGst, inclusive, rateLabel, rateOf, taxes, errorOf, invalid, onChange, onRemove, onDuplicate, onMove }: Props) {
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  const last = lines.length - 1;

  const parts = (l: Line, i: number) => ({
    name: <Input data-line-name={l.key} aria-label={`Item ${i + 1} name`} value={l.description} maxLength={2000} invalid={invalid(i, 'description')} placeholder={l.type === 'part' ? 'Item name, e.g. VOLTAS 1.5T split AC' : 'Service, e.g. AC installation'} className="font-medium" onChange={(e) => onChange(l.key, { description: e.target.value.replace(/\n/g, ' ') })} />,
    details: <AutoTextarea aria-label={`Item ${i + 1} description`} value={l.details} maxLength={2000} placeholder="Add a description (optional), e.g. specification or what is included" onChange={(e) => onChange(l.key, { details: e.target.value })} />,
    unit: <Input aria-label={`Item ${i + 1} unit`} list="estimate-units" value={l.unit} maxLength={20} placeholder="Nos" onChange={(e) => onChange(l.key, { unit: e.target.value })} />,
    qty: <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" value={l.quantity} invalid={invalid(i, 'quantity')} onChange={(e) => onChange(l.key, { quantity: num(e.target.value) })} />,
    price: <Input aria-label={`Item ${i + 1} ${rateLabel.toLowerCase()}`} inputMode="decimal" placeholder="0" value={l.unit_price} invalid={invalid(i, 'unit_price')} onChange={(e) => onChange(l.key, { unit_price: num(e.target.value) })} />,
    tax: (
      <Select aria-label={`Item ${i + 1} GST rate`} value={String(rateOf(l))} onChange={(e) => onChange(l.key, { gst_rate: Number(e.target.value) })}>
        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
      </Select>
    ),
    type: <TypePicker line={l} onType={(t) => onChange(l.key, typePatch(l, t))} />,
    amount: <Amount value={lineTotal(l)} tax={isGst ? taxes[i]?.tax ?? 0 : 0} inclusive={inclusive} />,
    tools: <Tools index={i} last={last} onMove={onMove} onDuplicate={() => onDuplicate(l.key)} onRemove={() => onRemove(l.key)} />,
  });

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="w-12 py-2.5 pl-5 pr-1">#</th>
            <th className="px-2 py-2.5">Item / description</th>
            <th className="w-24 px-2 py-2.5">Unit</th>
            <th className="w-20 px-2 py-2.5">Qty</th>
            <th className="w-32 px-2 py-2.5">{rateLabel}</th>
            {isGst && <th className="w-24 px-2 py-2.5">Tax</th>}
            <th className="w-36 px-2 py-2.5 text-right">Amount</th>
            <th className="w-20 py-2.5 pr-4"><span className="sr-only">Move, copy or remove</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => {
            const c = parts(l, i);
            return (
              <tr key={l.key} className={cn('align-top', errorOf(i) && 'bg-red-50/40')}>
                <td className="py-4 pl-5 pr-1 tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-2 py-3">
                  <div className="space-y-1.5">
                    {c.name}
                    {c.details}
                    <div className="flex items-center justify-between gap-3">
                      {c.type}
                      {errorOf(i) && <p className="text-xs text-red-600">{errorOf(i)}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3">{c.unit}</td>
                <td className="px-2 py-3">{c.qty}</td>
                <td className="px-2 py-3">{c.price}</td>
                {isGst && <td className="px-2 py-3">{c.tax}</td>}
                <td className="px-2 py-3 pt-4 text-right">{c.amount}</td>
                <td className="py-3 pr-4">{c.tools}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ol className="divide-y divide-slate-100 md:hidden">
        {lines.map((l, i) => {
          const c = parts(l, i);
          return (
            <li key={l.key} className={cn('space-y-3 px-4 py-4', errorOf(i) && 'bg-red-50/40')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs tabular-nums text-slate-600">{i + 1}</span>
                  {c.type}
                </div>
                {c.tools}
              </div>
              {c.name}
              {c.details}
              <div className="grid grid-cols-2 gap-3">
                <Labelled label="Unit">{c.unit}</Labelled>
                <Labelled label="Qty">{c.qty}</Labelled>
                <Labelled label={rateLabel}>{c.price}</Labelled>
                {isGst && <Labelled label="Tax">{c.tax}</Labelled>}
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-xs text-red-600">{errorOf(i)}</p>
                <div className="text-right">{c.amount}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/** Choose whether the line is a service or a part; a catalog part also shows its code. */
function TypePicker({ line: l, onType }: { line: Line; onType: (t: Line['type']) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex items-center">
        <select
          aria-label="Item type"
          value={l.type}
          onChange={(e) => onType(e.target.value as Line['type'])}
          className="h-7 appearance-none rounded-md border border-slate-200 bg-white pl-2 pr-6 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="service">Service</option>
          <option value="part">Part</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-slate-400" aria-hidden />
      </span>
      {l.type === 'part' && l.code && <span className="text-xs text-slate-500">· {l.code}</span>}
    </span>
  );
}

/** The line total, with its GST under it: "+ ₹x GST" when GST is added on top, "incl. ₹x GST" when it is inside. */
function Amount({ value, tax, inclusive }: { value: number; tax: number; inclusive: boolean }) {
  return (
    <>
      <p className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-900">{money(value)}</p>
      {tax > 0 && (
        <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">
          {inclusive ? 'incl.' : '+'} {money(tax)} GST
        </p>
      )}
    </>
  );
}

function Tools({ index, last, onMove, onDuplicate, onRemove }: { index: number; last: number; onMove: (i: number, by: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void }) {
  const base = 'flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30';
  return (
    <div className="grid grid-cols-2 gap-0.5 md:w-[4.25rem]">
      <button type="button" className={base} disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Move item ${index + 1} up`} title="Move up">
        <ChevronUp className="h-4 w-4" />
      </button>
      <button type="button" className={base} disabled={index === last} onClick={() => onMove(index, 1)} aria-label={`Move item ${index + 1} down`} title="Move down">
        <ChevronDown className="h-4 w-4" />
      </button>
      <button type="button" className={base} onClick={onDuplicate} aria-label={`Copy item ${index + 1}`} title="Copy this item">
        <CopyPlus className="h-4 w-4" />
      </button>
      <button type="button" className={cn(base, 'hover:bg-red-50 hover:text-red-600')} onClick={onRemove} aria-label={`Remove item ${index + 1}`} title="Remove">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
