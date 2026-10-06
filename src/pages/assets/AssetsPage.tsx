import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery, useLookups, useStaffOptions } from '@/lib/hooks';
import { label } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';
import { Badge, Button, Card, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, Tabs } from '@/components/ui';
import { Hint } from '@/components/tutorial';
import { AssetDialog, AssetStatusBadge, CATEGORIES } from './assetParts';

const STATUS_TABS: { value: '' | AssetStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Issued' },
  { value: 'under_repair', label: 'Under repair' },
  { value: 'lost', label: 'Lost' },
  { value: 'retired', label: 'Retired' },
];

/** Company tools, vehicles and devices, and who holds each one. */
export default function AssetsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const manage = can('assets.manage');
  const list = useListQuery<Asset>('assets', '/assets');
  const { data: lookups } = useLookups();
  const { data: techs } = useStaffOptions('technician');
  const [adding, setAdding] = useState(false);
  const f = list.filters;
  const counts = list.data?.meta.counts as Record<AssetStatus, number> | undefined;
  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;

  return (
    <>
      <PageHeader
        title="Assets"
        description="Tools, vehicles and devices your company owns, and which technician has each one."
        actions={
          manage && (
            <Hint text="Registers a company-owned item such as a vacuum pump, gauge set, bike or phone. A code like AST-0001 is generated if you leave it blank.">
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                Add asset
              </Button>
            </Hint>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={(f.status ?? '') as '' | AssetStatus}
        onChange={(v) => list.setFilter('status', v)}
        tabs={STATUS_TABS.map((t) => ({ ...t, count: t.value ? counts?.[t.value] : all }))}
      />
      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Code, name, serial, brand or model" className="sm:w-72" />
          <Select value={f.category ?? ''} onChange={(e) => list.setFilter('category', e.target.value)} className="sm:w-40" aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
          <Select value={f.assigned_to ?? ''} onChange={(e) => list.setFilter('assigned_to', e.target.value)} className="sm:w-44" aria-label="Held by">
            <option value="">Anyone</option>
            {techs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={f.branch_id ?? ''} onChange={(e) => list.setFilter('branch_id', e.target.value)} className="sm:w-40" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
          {Object.keys(f).length > 0 && (
            <Button variant="ghost" size="sm" onClick={list.clear}>
              Clear
            </Button>
          )}
        </FilterBar>
        <DataTable
          rows={list.data?.data}
          loading={list.isFetching}
          onRowClick={(a) => navigate(`/assets/${a.id}`)}
          empty={<EmptyState title="No assets" message={manage ? 'Add the tools and equipment you issue to technicians.' : undefined} />}
          columns={[
            {
              key: 'name',
              header: 'Asset',
              render: (a) => (
                <div>
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    {a.asset_code}
                    {a.serial_no && ` · SN ${a.serial_no}`}
                  </p>
                </div>
              ),
            },
            { key: 'cat', header: 'Category', hideOnMobile: true, render: (a) => label(a.category) },
            { key: 'make', header: 'Brand / model', hideOnMobile: true, render: (a) => [a.brand, a.model].filter(Boolean).join(' ') || '—' },
            { key: 'holder', header: 'Held by', render: (a) => a.holder?.name ?? <span className="text-slate-400">—</span> },
            { key: 'cond', header: 'Condition', hideOnMobile: true, render: (a) => <Badge tone={a.condition === 'damaged' || a.condition === 'poor' ? 'amber' : 'slate'}>{label(a.condition)}</Badge> },
            { key: 'status', header: 'Status', render: (a) => <AssetStatusBadge status={a.status} /> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      {adding && <AssetDialog asset={null} onClose={() => setAdding(false)} onSaved={(a) => navigate(`/assets/${a.id}`)} />}
    </>
  );
}
