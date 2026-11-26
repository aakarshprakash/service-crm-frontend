import { useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { download } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useListQuery } from '@/lib/hooks';
import { Button, Card, EmptyState, FilterBar, PageHeader, SearchInput, Select, toast } from '@/components/ui';
import { SpareEditor, type BulkAction } from './SpareDialogs';
import { SpareTable } from './SpareTable';
import { UploadDialog, type UploadKind } from './UploadDialog';
import { PERIODS, toServerFilter } from './sparesFilters';
import { Breadcrumb, STATUS, useSparesSummary, type BrandSpare, type Status } from './sparesParts';

const ALL_STEPS: BulkAction[] = ['coverage', 'inspect', 'rma', 'fresh', 'send', 'received', 'ow_billed', 'ow_paid', 'company_cleared', 'delete'];

/** Every part line, with filters; the place to find one part or download a list. */
export default function RegisterPage() {
  const { can } = useAuth();
  const manage = can('spares.manage');
  const list = useListQuery<BrandSpare>('spares', '/spares', {}, toServerFilter);
  const f = list.filters;
  const server = toServerFilter(f);
  const summary = useSparesSummary();
  const [upload, setUpload] = useState<UploadKind | null>(null);
  const [adding, setAdding] = useState(false);
  const hasFilters = Object.keys(server).length > 0;
  // "Warranty" picks a path (warranty or OW) or a kind (stock, not sorted); one select, plain words.
  const warrantyValue = f.path ? `path:${f.path}` : f.coverage ? `coverage:${f.coverage}` : '';
  const setWarranty = (v: string) => {
    const [k, val] = v.split(':');
    list.setFilters({ path: k === 'path' ? val : '', coverage: k === 'coverage' ? val : '' });
  };
  const statusValue = f.group ? `group:${f.group}` : f.status ?? '';
  const setStatus = (v: string) => list.setFilters(v.startsWith('group:') ? { group: v.slice(6), status: '' } : { status: v, group: '' });

  const exportFile = () =>
    download(`/spares/export?${new URLSearchParams(server)}`, 'sapre-spare-parts.xlsx').catch((e) => toast.error(e.message));

  return (
    <>
      <Breadcrumb items={[{ label: 'Spare Parts Register' }]} />
      <PageHeader
        title="Spare Parts Register"
        description="Every part line Lloyd billed. Click a part to see its steps; tick parts to move them on together."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportFile}>Download Excel</Button>
            {manage && <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add a part</Button>}
            {manage && <Button icon={<Upload className="h-4 w-4" />} onClick={() => setUpload('bill')}>Upload Excel</Button>}
          </>
        }
      />

      <Card padded={false}>
        <FilterBar>
          <SearchInput value={f.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search bill, material, CRM ID, customer, inspection, LR" className="sm:w-96" />
          <Select value={warrantyValue} onChange={(e) => setWarranty(e.target.value)} aria-label="Warranty" className="sm:w-48">
            <option value="">Warranty and OW</option>
            <option value="path:warranty">Warranty</option>
            <option value="path:ow">Out of warranty (OW)</option>
            <option value="coverage:stock">For stock</option>
            <option value="coverage:none">Not sorted</option>
          </Select>
          <Select value={statusValue} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-52">
            <option value="">Every status</option>
            <option value="group:pending">Waiting for a step</option>
            <option value="group:done">Completed</option>
            {(Object.keys(STATUS) as Status[]).map((st) => (
              <option key={st} value={st}>{STATUS[st].label}{summary.data ? ` (${summary.data.by_status[st].count})` : ''}</option>
            ))}
          </Select>
          <Select value={f.period ?? ''} onChange={(e) => list.setFilter('period', e.target.value)} aria-label="Billing date" className="sm:w-44">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          {hasFilters && <Button variant="ghost" size="sm" onClick={list.clear} className="sm:ml-auto">Show all parts</Button>}
        </FilterBar>
        <SpareTable
          rows={list.data?.data}
          loading={list.isFetching}
          meta={list.data?.meta}
          onPage={(p) => list.setFilter('page', String(p))}
          listFilter={server}
          actions={ALL_STEPS}
          couriers={summary.data?.couriers ?? []}
          manage={manage}
          empty={<EmptyState title={hasFilters ? 'No part matches' : 'No parts yet'} message={hasFilters ? 'Try another status, warranty type, date or search.' : 'Upload the Excel Lloyd sends with each bill.'} />}
        />
      </Card>

      <UploadDialog kind={upload} onClose={() => setUpload(null)} />
      <SpareEditor open={adding} spare={null} couriers={summary.data?.couriers ?? []} onClose={() => setAdding(false)} />
    </>
  );
}
