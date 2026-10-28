import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, IndianRupee, Plus, UserPlus, Users, Wrench } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useApiMutation, useListQuery, useLookups } from '@/lib/hooks';
import { date, moneyWhole } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { Avatar, Badge, Button, Card, EmptyState, FilterBar, Modal, PageHeader, Pagination, SearchInput, Select, Spinner } from '@/components/ui';
import { CustomerForm, emptyCustomer, productPayload, type CustomerDraft } from './CustomerForm';
import { Hint } from '@/components/tutorial';
import { ApiError } from '@/lib/api';

type Row = Customer & { products_count?: number; open_jobs_count?: number; outstanding?: number | null; last_job_at?: string | null };
interface Summary { total: number; new_this_month: number; with_open_jobs: number; with_dues: number; dues_total: number }

export default function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: lookups } = useLookups();
  const list = useListQuery<Row>('customers', '/customers');
  const [adding, setAdding] = useState(false);
  const summary = list.data?.meta?.summary as Summary | undefined;
  const view = list.filters.view ?? '';

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you serve: their contact details, products and service history."
        actions={
          can('customers.manage') && (
            <Hint text="Creates a customer record with their contact details and, optionally, their first product. You can also add customers while logging a new job.">
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                Add customer
              </Button>
            </Hint>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={<Users className="h-5 w-5" />} tone="bg-brand-50 text-brand-700" label="Total customers" value={summary?.total} onClick={() => list.setFilter('view', null)} active={!view} />
        <SummaryTile icon={<UserPlus className="h-5 w-5" />} tone="bg-violet-50 text-violet-700" label="New this month" value={summary?.new_this_month} />
        <SummaryTile icon={<Wrench className="h-5 w-5" />} tone="bg-amber-50 text-amber-700" label="With open jobs" value={summary?.with_open_jobs} onClick={() => list.setFilter('view', 'open')} active={view === 'open'} />
        <SummaryTile
          icon={<IndianRupee className="h-5 w-5" />}
          tone="bg-red-50 text-red-700"
          label="With pending dues"
          value={summary?.with_dues}
          note={summary?.dues_total ? `${moneyWhole(summary.dues_total)} to collect` : undefined}
          onClick={() => list.setFilter('view', 'dues')}
          active={view === 'dues'}
        />
      </div>

      <Card padded={false}>
        <FilterBar>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm" role="tablist">
            {[
              ['', 'All'],
              ['open', 'Open jobs'],
              ['dues', 'Pending dues'],
            ].map(([v, text]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => list.setFilter('view', v || null)}
                className={cn('rounded-md px-3 py-1.5 font-medium transition', view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
              >
                {text}
              </button>
            ))}
          </div>
          <SearchInput value={list.filters.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder="Search name, phone, email, CRM ID or serial no." className="sm:w-96" />
          {(lookups?.branches.length ?? 0) > 1 && (
            <Select value={list.filters.branch_id ?? ''} onChange={(e) => list.setFilter('branch_id', e.target.value)} className="sm:w-44" aria-label="Branch">
              <option value="">All branches</option>
              {lookups?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
          {list.isFetching && <Spinner className="h-4 w-4" />}
        </FilterBar>

        {list.data && !list.data.data.length ? (
          <EmptyState
            title={view || list.filters.search ? 'No customers match' : 'No customers yet'}
            message={view || list.filters.search ? 'Try another search or filter.' : 'Customers are added here or while creating a job card.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-y border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="hidden px-5 py-3 lg:table-cell">Location</th>
                  <th className="hidden px-5 py-3 text-center md:table-cell">Products</th>
                  <th className="px-5 py-3 text-center">Jobs</th>
                  <th className="hidden px-5 py-3 text-right sm:table-cell">Due</th>
                  <th className="hidden px-5 py-3 xl:table-cell">Last service</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(list.data?.data ?? []).map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="group cursor-pointer hover:bg-brand-50/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{c.name}</p>
                          <p className="text-xs text-slate-500">
                            Since {date(c.created_at)}
                            {c.crm_id && <span> · CRM {c.crm_id}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="tabular-nums text-slate-800">{c.phone}</p>
                      {c.email && <p className="max-w-[200px] truncate text-xs text-slate-500">{c.email}</p>}
                    </td>
                    <td className="hidden px-5 py-3 lg:table-cell">
                      <p className="text-slate-800">{[c.city, c.pincode].filter(Boolean).join(' · ') || '—'}</p>
                      {c.branch && <p className="text-xs text-slate-500">{c.branch.name} branch</p>}
                    </td>
                    <td className="hidden px-5 py-3 text-center tabular-nums text-slate-700 md:table-cell">{c.products_count ?? 0}</td>
                    <td className="px-5 py-3 text-center">
                      {(c.open_jobs_count ?? 0) > 0 ? (
                        <Badge tone="amber">{c.open_jobs_count} open</Badge>
                      ) : (
                        <span className="tabular-nums text-slate-700">{c.jobs_count ?? 0}</span>
                      )}
                      {(c.open_jobs_count ?? 0) > 0 && <p className="mt-0.5 text-[11px] text-slate-400">{c.jobs_count} total</p>}
                    </td>
                    <td className="hidden px-5 py-3 text-right tabular-nums sm:table-cell">
                      {Number(c.outstanding ?? 0) > 0 ? <span className="font-semibold text-red-700">{moneyWhole(Number(c.outstanding))}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="hidden px-5 py-3 text-slate-600 xl:table-cell">{c.last_job_at ? date(c.last_job_at) : <span className="text-slate-400">Never</span>}</td>
                    <td className="pr-4 text-slate-300 group-hover:text-brand-600">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
      <AddCustomer open={adding} onClose={() => setAdding(false)} onCreated={(id) => navigate(`/customers/${id}`)} />
    </>
  );
}

function SummaryTile({ icon, tone, label, value, note, onClick, active }: { icon: ReactNode; tone: string; label: string; value?: number; note?: string; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white p-4 text-left shadow-card transition',
        onClick && 'hover:border-brand-200 hover:shadow-lift',
        active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value ?? '–'}</p>
      {note && <p className="mt-0.5 text-xs font-medium text-red-700">{note}</p>}
    </Tag>
  );
}

function AddCustomer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer);
  const m = useApiMutation(
    (d: CustomerDraft) => {
      const { product, ...rest } = d;
      const hasProduct = product.product_id || product.brand_id || product.category_id || product.serial_no;
      return api.post<Envelope<Customer>>('/customers', { ...rest, branch_id: rest.branch_id || null, products: hasProduct ? [productPayload(product)] : [] });
    },
    {
      invalidate: [['customers']],
      toastValidation: false,
      onSuccess: (r) => {
        onClose();
        setDraft(emptyCustomer);
        onCreated(r.data.id);
      },
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate(draft)}>
            Save customer
          </Button>
        </>
      }
    >
      <CustomerForm value={draft} onChange={setDraft} error={m.error as ApiError | null} withProduct />
    </Modal>
  );
}
