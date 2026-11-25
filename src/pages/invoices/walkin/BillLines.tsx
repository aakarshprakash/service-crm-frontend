import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Package, PenLine, Trash2, X } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { money, qty, toMinor } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { InventoryItem } from '@/lib/types';
import { Button, Input, SearchInput, Select } from '@/components/ui';
import { GST_RATES } from '@/pages/estimates/estimateParts';

/** One line of a counter bill as it is typed: money fields stay text until saved. */
export interface BillLine {
  key: number;
  type: 'service' | 'part';
  /** A part sold from branch stock. */
  item: InventoryItem | null;
  description: string;
  quantity: string;
  unit_price: string;
  /** null: the part's own rate, else Settings → GST. */
  gst_rate: number | null;
}

let nextKey = 1;
export const newLineKey = () => nextKey++;
export const lineTotal = (l: BillLine) => Math.round((parseFloat(l.quantity) || 0) * toMinor(l.unit_price));
const num = (v: string) => v.replace(/[^\d.]/g, '');

interface Props {
  lines: BillLine[];
  isGst: boolean;
  inclusive: boolean;
  rateOf: (l: BillLine) => number;
  /** Each line's taxable value and GST (paise), after its share of the discount. */
  taxes: { taxable: number; tax: number }[];
  discounted: boolean;
  errorOf: (i: number) => string | undefined;
  onChange: (key: number, patch: Partial<BillLine>) => void;
  onRemove: (key: number) => void;
}

/** The bill's lines: a table on wide screens, one card per line on phones. GST bills show each line's tax. */
export function BillLines({ lines, isGst, inclusive, rateOf, taxes, discounted, errorOf, onChange, onRemove }: Props) {
  const rateLabel = isGst && inclusive ? 'Rate incl. GST' : 'Rate';
  const amountLabel = !isGst ? 'Amount' : discounted ? 'Amount after discount' : 'Amount incl. GST';
  // With GST the line comes to its taxable value plus its tax; that is what the lines add up to.
  const amountOf = (l: BillLine, i: number) => (isGst && taxes[i] ? taxes[i].taxable + taxes[i].tax : lineTotal(l));

  const cells = (l: BillLine, i: number) => ({
    item: <ItemCell line={l} index={i} onChange={onChange} />,
    qty: <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => onChange(l.key, { quantity: num(e.target.value) })} />,
    price: <Input aria-label={`Item ${i + 1} ${rateLabel.toLowerCase()}`} inputMode="decimal" placeholder="0" value={l.unit_price} onChange={(e) => onChange(l.key, { unit_price: num(e.target.value) })} />,
    rate: (
      <Select aria-label={`Item ${i + 1} GST rate`} value={String(rateOf(l))} onChange={(e) => onChange(l.key, { gst_rate: Number(e.target.value) })}>
        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
      </Select>
    ),
    tax: money(isGst ? taxes[i]?.tax ?? 0 : 0),
    amount: money(amountOf(l, i)),
    remove: (
      <button type="button" onClick={() => onRemove(l.key)} aria-label={`Remove item ${i + 1}`} title="Remove" className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <Trash2 className="h-4 w-4" />
      </button>
    ),
  });

  return (
    <>
      <table className="hidden w-full table-fixed text-sm md:table">
        <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="w-10 py-2.5 pl-5 pr-1">#</th>
            <th className="px-2 py-2.5">Item</th>
            <th className="w-20 px-2 py-2.5">Qty</th>
            <th className="w-32 px-2 py-2.5">{rateLabel}</th>
            {isGst && <th className="w-24 px-2 py-2.5">Tax %</th>}
            {isGst && <th className="w-28 px-2 py-2.5 text-right">{discounted ? 'Tax after discount' : 'Tax amount'}</th>}
            <th className="w-32 px-2 py-2.5 text-right">{amountLabel}</th>
            <th className="w-14 py-2.5 pr-3"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => {
            const c = cells(l, i);
            return (
              <tr key={l.key} className={cn('align-top', errorOf(i) && 'bg-red-50/40')}>
                <td className="py-4 pl-5 pr-1 tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-2 py-3">
                  {c.item}
                  {errorOf(i) && <p className="mt-1 text-xs text-red-600">{errorOf(i)}</p>}
                </td>
                <td className="px-2 py-3">{c.qty}</td>
                <td className="px-2 py-3">{c.price}</td>
                {isGst && <td className="px-2 py-3">{c.rate}</td>}
                {isGst && <td className="whitespace-nowrap px-2 pb-3 pt-5 text-right tabular-nums text-slate-600">{c.tax}</td>}
                <td className="whitespace-nowrap px-2 pb-3 pt-5 text-right font-semibold tabular-nums text-slate-900">{c.amount}</td>
                <td className="py-3 pr-3">{c.remove}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ol className="divide-y divide-slate-100 md:hidden">
        {lines.map((l, i) => {
          const c = cells(l, i);
          return (
            <li key={l.key} className={cn('space-y-3 px-4 py-4', errorOf(i) && 'bg-red-50/40')}>
              <div className="flex items-start gap-3">
                <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs tabular-nums text-slate-600">{i + 1}</span>
                <div className="min-w-0 flex-1">{c.item}</div>
                {c.remove}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labelled label="Qty">{c.qty}</Labelled>
                <Labelled label={rateLabel}>{c.price}</Labelled>
                {isGst && <Labelled label="Tax %">{c.rate}</Labelled>}
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-xs text-red-600">{errorOf(i)}</p>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums text-slate-900">{c.amount}</p>
                  {isGst && (taxes[i]?.tax ?? 0) > 0 && <p className="text-xs tabular-nums text-slate-500">incl. {c.tax} GST</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * A service, or a part typed in by name (not kept in stock), is written in words and can be switched
 * between the two as on an estimate. A part picked from stock shows its name, code and what is left.
 */
function ItemCell({ line: l, index, onChange }: { line: BillLine; index: number; onChange: Props['onChange'] }) {
  if (!l.item) {
    const part = l.type === 'part';
    return (
      <div className="space-y-1.5">
        <Input
          aria-label={`Item ${index + 1} ${part ? 'part name' : 'service'}`}
          value={l.description}
          maxLength={200}
          placeholder={part ? 'Part name, e.g. Copper pipe 1/4 inch' : 'Service, e.g. AC gas top-up'}
          className="font-medium"
          onChange={(e) => onChange(l.key, { description: e.target.value })}
        />
        <span className="flex flex-wrap items-center gap-2">
          <TypeSelect value={l.type} onChange={(type) => onChange(l.key, { type })} />
          {part && <span className="text-xs text-slate-500">Typed in, not taken from stock</span>}
        </span>
      </div>
    );
  }
  const stock = Number(l.item?.stock_total ?? 0);
  const short = (parseFloat(l.quantity) || 0) > stock;
  return (
    <div className="pt-1.5">
      <p className="font-medium text-slate-900">{l.item?.name}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <Kind icon={<Package className="h-3 w-3" />}>Part · {l.item?.code}</Kind>
        <span className={cn(short && 'font-medium text-red-600')}>
          {short ? `Only ${qty(stock)} ${l.item?.unit_of_measure ?? ''} in stock` : `${qty(stock)} ${l.item?.unit_of_measure ?? ''} in stock`}
        </span>
      </p>
    </div>
  );
}

/** Service or part, for a line written in words. */
function TypeSelect({ value, onChange }: { value: BillLine['type']; onChange: (t: BillLine['type']) => void }) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label="Item type"
        value={value}
        onChange={(e) => onChange(e.target.value as BillLine['type'])}
        className="h-7 appearance-none rounded-md border border-slate-200 bg-white pl-2 pr-6 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="service">Service</option>
        <option value="part">Part</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-slate-400" aria-hidden />
    </span>
  );
}

function Kind({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{icon}{children}</span>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/**
 * Search the parts list and add one; parts out of stock at the branch can't be picked.
 * A part not in the list (bought locally, say) can be typed in instead, with what was searched as its name.
 */
export function PartPicker({ branchId, onPick, onType, onClose }: { branchId: string; onPick: (item: InventoryItem) => void; onType: (name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const items = useQuery({
    queryKey: ['walkin-items', search, branchId],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search, active: 1, per_page: 8, branch_id: branchId || undefined }),
  });
  return (
    <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search part by code or name" delay={250} className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close part search">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {items.data?.data.map((it) => {
          const stock = Number(it.stock_total ?? 0);
          return (
            <button type="button" key={it.id} disabled={stock <= 0} onClick={() => onPick(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                <span className="text-xs text-slate-500">{it.code} · {money(it.unit_price)}</span>
              </span>
              <span className={cn('shrink-0 text-xs', stock > 0 ? 'text-slate-500' : 'text-red-600')}>
                {stock > 0 ? `${qty(stock)} ${it.unit_of_measure}` : 'Out of stock'}
              </span>
            </button>
          );
        })}
        {items.data && !items.data.data.length && <p className="px-3 py-4 text-center text-sm text-slate-500">{search ? `No part in stock matches “${search}”.` : 'No parts in stock yet.'}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs text-slate-500">Part not in the list?</p>
        <Button size="sm" variant="secondary" icon={<PenLine className="h-4 w-4" />} onClick={() => onType(search.trim())}>
          {search.trim() ? `Type in “${search.trim()}”` : 'Type the part in'}
        </Button>
      </div>
    </div>
  );
}
