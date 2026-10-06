import { useSearchParams } from 'react-router';
import { useLookups } from '@/lib/hooks';
import { monthStart, today } from '@/lib/format';
import { FilterBar, Input, Select } from '@/components/ui';

export type Period = { from: string; to: string; branch_id?: string };

function shiftMonth(back: number): { from: string; to: string } {
  const [y, m] = monthStart().split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 - back, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { from: `${d.getFullYear()}-${mm}-01`, to: `${d.getFullYear()}-${mm}-${last}` };
}

function financialYear(): { from: string; to: string } {
  const [y, m] = today().split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1; // Indian financial year: April – March
  return { from: `${start}-04-01`, to: today() };
}

const PRESETS: Record<string, () => { from: string; to: string }> = {
  today: () => ({ from: today(), to: today() }),
  month: () => ({ from: monthStart(), to: today() }),
  'last-month': () => shiftMonth(1),
  quarter: () => ({ from: shiftMonth(2).from, to: today() }),
  fy: financialYear,
};

/** Period (and branch) kept in the URL so a filtered view can be bookmarked or shared. */
export function usePeriod(defaultPreset: keyof typeof PRESETS = 'month') {
  const [params, setParams] = useSearchParams();
  const def = PRESETS[defaultPreset]!();
  const period: Period = { from: params.get('from') || def.from, to: params.get('to') || def.to, branch_id: params.get('branch_id') || undefined };
  const set = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };
  const preset = Object.entries(PRESETS).find(([, fn]) => {
    const r = fn();
    return r.from === period.from && r.to === period.to;
  })?.[0] ?? 'custom';
  return { period, set, preset, params };
}

export function PeriodFilter({ state, branches = true, children }: { state: ReturnType<typeof usePeriod>; branches?: boolean; children?: React.ReactNode }) {
  const { data: lookups } = useLookups();
  const { period, set, preset } = state;
  return (
    <FilterBar>
      <Select value={preset} onChange={(e) => e.target.value !== 'custom' && set(PRESETS[e.target.value]!())} className="sm:w-44" aria-label="Period">
        <option value="today">Today</option>
        <option value="month">This month</option>
        <option value="last-month">Last month</option>
        <option value="quarter">Last 3 months</option>
        <option value="fy">This financial year</option>
        <option value="custom" disabled>
          Custom
        </option>
      </Select>
      <Input type="date" value={period.from} max={period.to} onChange={(e) => set({ from: e.target.value })} className="sm:w-40" aria-label="From" />
      <Input type="date" value={period.to} min={period.from} max={today()} onChange={(e) => set({ to: e.target.value })} className="sm:w-40" aria-label="To" />
      {branches && (lookups?.branches.length ?? 0) > 1 && (
        <Select value={period.branch_id ?? ''} onChange={(e) => set({ branch_id: e.target.value })} className="sm:w-44" aria-label="Branch">
          <option value="">All branches</option>
          {lookups?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      )}
      {children}
    </FilterBar>
  );
}
