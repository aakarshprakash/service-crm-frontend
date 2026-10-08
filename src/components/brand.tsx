import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Servon logo mark: blue chevron interlocked with a green ribbon forming an "S"
 * (vector redraw of the brand styleboard; swap in the designer's master SVG when available).
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 96 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset=".6" stopColor="#2563EB" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="6" y1="0" x2="82" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1D4ED8" />
          <stop offset=".45" stopColor="#1E6FD9" />
          <stop offset=".75" stopColor="#0E7490" stopOpacity=".85" />
          <stop offset="1" stopColor="#0B4F5C" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#059669" />
          <stop offset=".55" stopColor="#10B981" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <path d="M52 54 L86 35.5 Q90 33.5 90 38 L90 87 L34 115 Q30 117 30 113 L30 97 L52 85.6 Z" fill={`url(#${id}g)`} />
      <path d="M29.2 49.3 L82 76.1 L82 92.6 L6 54 L6 43 Z" fill={`url(#${id}m)`} />
      <path d="M8 40 L56 14.5 Q60 12.5 60 17 L60 33 L29.2 49.3 L6 54 L6 43 Q6 41 8 40 Z" fill={`url(#${id}b)`} />
    </svg>
  );
}

/** Mark + SERVON wordmark (+ tagline). `tone="dark"` for navy backgrounds. */
export function Logo({ tone = 'light', tagline = false, className, size = 'md' }: { tone?: 'light' | 'dark'; tagline?: boolean; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: { mark: 'h-7', word: 'text-lg', tag: 'text-[8px]' }, md: { mark: 'h-9', word: 'text-[22px]', tag: 'text-[9px]' }, lg: { mark: 'h-12', word: 'text-3xl', tag: 'text-[11px]' } }[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn(s.mark, 'w-auto shrink-0')} />
      <span className="flex flex-col leading-none" lang="en">
        <span className={cn('font-extrabold tracking-[0.02em]', s.word, tone === 'dark' ? 'text-white' : 'text-navy-900')}>SERVON</span>
        {tagline && <span className={cn('mt-1 font-medium uppercase tracking-[0.18em]', s.tag, tone === 'dark' ? 'text-slate-300' : 'text-slate-500')}>Service business, simplified.</span>}
      </span>
    </span>
  );
}
