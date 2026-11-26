import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { money } from '@/lib/format';
import { Card } from '@/components/ui';
import { CoverageBadge, StatusBadge, type BrandSpare } from './sparesParts';

/**
 * On a job: the Lloyd spare parts billed against its call, found by the job's External CRM call ID
 * being the part's EX CRM ID. Shown only when there are some.
 */
export function JobSparesCard({ ticket }: { ticket: string }) {
  const q = useQuery({
    queryKey: ['spares', 'job', ticket],
    queryFn: () => api.get<Paginated<BrandSpare>>('/spares', { ticket, per_page: '20' }),
    enabled: !!ticket,
  });
  const rows = q.data?.data;
  if (!rows?.length) return null;

  return (
    <Card title={`Lloyd spare parts (${rows.length})`} padded={false}>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Billed by Lloyd against CRM ID {ticket}. Open a part to see its return or OW billing.</p>
      <ul className="divide-y divide-slate-100">
        {rows.map((s) => (
          <li key={s.id}>
            <Link to={`/spares/${s.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-slate-900">{s.description ?? s.material_code}</span>
                <span className="shrink-0 text-sm tabular-nums text-slate-900">{money(s.value)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><StatusBadge status={s.status} /><CoverageBadge spare={s} /></div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
