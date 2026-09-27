import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Info, Lightbulb, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { guideFor } from '@/lib/guides';
import { cn } from '@/lib/utils';

/**
 * Tutorial mode: switched on company-wide by an admin in Settings. While it's on, every
 * page shows a short guide card and key buttons get an ⓘ explaining what clicking does.
 * With it off, both components render nothing extra.
 */
export function useTutorial(): boolean {
  return useAuth().user?.tenant?.tutorial_mode ?? false;
}

/**
 * Wraps an action with an ⓘ that explains what happens when it's clicked.
 * `block` is for full-width buttons: the wrapper spans the row and the button shrinks to fit the ⓘ.
 */
export function Hint({ text, children, align = 'right', block, className }: { text: ReactNode; children: ReactNode; align?: 'left' | 'right'; block?: boolean; className?: string }) {
  const on = useTutorial();
  // Hover shows it while the mouse is over the ⓘ; a click (or tap) pins it until clicked again or dismissed.
  const [open, setOpen] = useState<false | 'hover' | 'pinned'>(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!on) return <>{children}</>;

  return (
    <span ref={ref} className={cn('relative items-center gap-1', block ? 'flex w-full' : 'inline-flex', className)}>
      {children}
      <button
        type="button"
        aria-label="What does this do?"
        aria-expanded={!!open}
        onClick={() => setOpen((o) => (o === 'pinned' ? false : 'pinned'))}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen((o) => o || 'hover')}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen((o) => (o === 'hover' ? false : o))}
        className="shrink-0 rounded-full p-0.5 text-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

const DISMISSED_KEY = 'servicecrm.guides.dismissed';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** The "How this page works" card, picked by the current route. Rendered once, in the app shell. */
export function PageGuide() {
  const on = useTutorial();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const guide = on && user ? guideFor(pathname, user.role) : null;

  if (!guide) return null;

  const hidden = dismissed.includes(guide.id);
  const toggle = () => {
    const next = hidden ? dismissed.filter((id) => id !== guide.id) : [...dismissed, guide.id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the choice just won't survive a reload */
    }
  };

  if (hidden) {
    return (
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
          <Lightbulb className="h-3.5 w-3.5" />
          Show page guide
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Page guide" className="mb-6 rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{guide.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{guide.intro}</p>
          {guide.points.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              {guide.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Where a button has <Info className="inline h-3.5 w-3.5 align-text-bottom text-brand-600" /> beside it, click or tap that icon to see what the button does.
          </p>
        </div>
        <button type="button" onClick={toggle} aria-label="Hide page guide" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
