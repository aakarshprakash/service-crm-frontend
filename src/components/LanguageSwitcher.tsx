import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES, setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Globe-style menu to switch between English, Hindi and Malayalam (remembered on this device). */
export function LanguageSwitcher({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('lang.choose')}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
          tone === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <Languages className="h-[18px] w-[18px]" />
        <span>{current.native}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift animate-fade-in">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('lang.title')}</p>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="menuitemradio"
              aria-checked={l.code === current.code}
              lang={l.code}
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-900">{l.native}</span>
                {l.native !== l.label && <span className="text-xs text-slate-500">{l.label}</span>}
              </span>
              {l.code === current.code && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
