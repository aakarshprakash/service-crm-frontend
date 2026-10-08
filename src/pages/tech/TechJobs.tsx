import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { api, type Envelope } from '@/lib/api';
import { useListQuery } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import type { Job, JobStatus } from '@/lib/types';
import { Card, EmptyState, Pagination, SearchInput, Tabs } from '@/components/ui';
import { PriorityBadge, StatusBadge } from '@/components/domain';

export default function TechJobs() {
  const { t } = useTranslation();
  // Default tab is "Open"; a search looks across every status.
  const list = useListQuery<Job>('tech-jobs', '/jobs', { sort: 'scheduled' }, (f) => ({ ...f, status: f.search ? undefined : f.status ?? 'open' }));
  const counts = useQuery({ queryKey: ['tech-job-counts'], queryFn: () => api.get<Envelope<Record<JobStatus, number>>>('/jobs/counts').then((r) => r.data) });
  const status = (list.filters.status ?? 'open') as JobStatus;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-navy-900">{t('nav.myJobs')}</h1>
      <SearchInput value={list.filters.search ?? ''} onChange={(v) => list.setFilter('search', v)} placeholder={t('tech.searchJobs')} className="mb-3" />
      {!list.filters.search && (
        <Tabs
          className="mb-3"
          value={status}
          onChange={(v) => list.setFilter('status', v)}
          tabs={(['open', 'in_progress', 'pending', 'completed'] as JobStatus[]).map((s) => ({ value: s, label: t(`status.${s}`), count: counts.data?.[s] }))}
        />
      )}
      <Card padded={false}>
        {list.isLoading ? (
          <div className="h-40 animate-pulse" />
        ) : !list.data?.data.length ? (
          <EmptyState title={t('tech.noJobs')} message={t('tech.noJobsHint')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data.data.map((j) => (
              <li key={j.id}>
                <Link to={`/tech/jobs/${j.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{j.crm_call_id}</span>
                    <span className="flex gap-1">
                      <PriorityBadge priority={j.priority} />
                      <StatusBadge status={j.status} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{j.customer?.name} · {j.customer?.phone}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[j.customer_product?.product?.brand?.name, j.customer_product?.product?.model_name].filter(Boolean).join(' ')} {j.complaint_type?.name && `· ${j.complaint_type.name}`}
                  </p>
                  <p className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3" /> {j.customer?.city ?? '—'}
                    </span>
                    <span>{dateTime(j.scheduled_at)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={list.data?.meta} onPage={(p) => list.setFilter('page', String(p))} />
      </Card>
    </div>
  );
}
