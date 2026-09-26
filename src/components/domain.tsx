import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { JobStatus, Priority } from '@/lib/types';

const statusTone: Record<string, 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet' | 'sky'> = {
  open: 'sky',
  in_progress: 'violet',
  pending: 'amber',
  completed: 'green',
  cancelled: 'slate',
  unpaid: 'red',
  partial: 'amber',
  paid: 'green',
  submitted: 'amber',
  verified: 'blue',
  closed: 'green',
  active: 'green',
  inactive: 'slate',
  invited: 'amber',
  trial: 'violet',
  suspended: 'red',
  sent: 'green',
  failed: 'red',
  queued: 'amber',
  success: 'green',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={statusTone[status] ?? 'slate'} dot>
      {t(`status.${status}`, { defaultValue: status.replace(/_/g, ' ') })}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  const tone = priority === 'high' ? 'red' : priority === 'medium' ? 'amber' : 'slate';
  return <Badge tone={tone}>{t(`priority.${priority}`)}</Badge>;
}

export function MethodLabel({ method }: { method: string | null | undefined }) {
  const { t } = useTranslation();
  if (!method) return <>–</>;
  return <>{t(`method.${method}`, { defaultValue: method })}</>;
}

export const JOB_STATUSES: JobStatus[] = ['open', 'in_progress', 'pending', 'completed', 'cancelled'];

/** Location preview without an API key (OpenStreetMap) + deep link to Google Maps. */
export function MapEmbed({ lat, lng, label, className }: { lat: number | null | undefined; lng: number | null | undefined; label?: string; className?: string }) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return (
      <div className={cn('flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500', className)}>
        <MapPin className="mr-2 h-4 w-4" /> No location captured yet
      </div>
    );
  }
  const d = 0.004;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200', className)}>
      <iframe title={label ?? 'Location map'} src={src} className="h-48 w-full" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-slate-100"
      >
        <span>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
        <span className="inline-flex items-center gap-1">
          Open in Google Maps <ExternalLink className="h-3 w-3" />
        </span>
      </a>
    </div>
  );
}

export function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5', i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
      ))}
    </span>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}
