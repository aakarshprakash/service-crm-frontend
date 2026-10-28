import {
  Children, Fragment, forwardRef, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-brand-500 shadow-sm',
  outline: 'bg-transparent text-brand-700 border border-brand-200 hover:bg-brand-50 focus-visible:ring-brand-500',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
  success: 'bg-accent-500 text-white hover:bg-accent-600 focus-visible:ring-accent-500 shadow-sm',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

const control =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)} {...props} />;
});

/** Plain text of option children such as `{label} ({count})`. */
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

/** Read <option> / <optgroup> children (through fragments and arrays) into combobox options. */
function readOptions(children: ReactNode, group?: string): (ComboboxOption & { disabled?: boolean })[] {
  const out: (ComboboxOption & { disabled?: boolean })[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return;
    if (child.type === Fragment) out.push(...readOptions(child.props.children, group));
    else if (child.type === 'optgroup') out.push(...readOptions(child.props.children, child.props.label));
    else if (child.type === 'option') {
      const label = nodeText(child.props.children);
      out.push({ value: String(child.props.value ?? label), label, group, disabled: child.props.disabled });
    }
  });
  return out;
}

/**
 * The application's standard dropdown: written like a native <select> with <option>s, rendered as a
 * searchable "select2" style list (search appears once there are more than a handful of options).
 */
export function Select({
  className, invalid, children, value, onChange, disabled, 'aria-label': ariaLabel, id,
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { t } = useTranslation();
  const options = useMemo(() => readOptions(children).filter((o) => !o.disabled), [children]);
  const current = value == null ? '' : String(value);
  const blank = options.find((o) => o.value === '');
  return (
    <Combobox
      id={id}
      className={className}
      invalid={invalid}
      disabled={disabled}
      aria-label={ariaLabel}
      value={options.some((o) => o.value === current) ? current : (blank ? '' : (options[0]?.value ?? ''))}
      options={options}
      placeholder={t('common.select')}
      clearable={!!blank && current !== ''}
      onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as ChangeEvent<HTMLSelectElement>)}
    />
  );
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line under the label, e.g. a serial number or category. */
  hint?: string;
  /** Options sharing a group are listed under one heading. */
  group?: string;
}

/**
 * Searchable single-select ("select2" style): type to filter, arrow keys to move,
 * Enter to pick, Escape to close. Use instead of <Select> once a list grows past
 * ~15 options. `footer` holds an action such as "Add a new product".
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  invalid,
  disabled,
  clearable = true,
  footer,
  className,
  searchable,
  id,
  onCreate,
  createLabel,
  'aria-label': ariaLabel,
}: {
  /** Offer "Add “typed text”" when nothing matches exactly (instant add of a master record). */
  onCreate?: (term: string) => void;
  createLabel?: (term: string) => string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  footer?: ReactNode;
  className?: string;
  /** Show the search box; by default only when the list has more than 6 options. */
  searchable?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  const { t } = useTranslation();
  placeholder ??= t('common.select');
  searchPlaceholder ??= t('common.typeToSearch');
  emptyText ??= t('common.noMatch');
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const showSearch = searchable ?? (!!onCreate || options.length > 6);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(t));
  }, [options, term]);

  // The list is drawn in a portal at a fixed position so modals and scrolling cards never clip it;
  // it opens upwards when there is not enough room below.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 260 && above > below;
      setPos({
        left: r.left,
        width: Math.max(r.width, 200),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        maxHeight: Math.min(360, (up ? above : below) - 4),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const t = setTimeout(() => (showSearch ? search.current : list.current)?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[active];
      if (option) pick(option);
      else if (onCreate && term.trim()) {
        onCreate(term.trim());
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)} ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(control, 'flex h-10 items-center gap-2 text-left', invalid && 'border-red-400', disabled && 'cursor-not-allowed')}
      >
        <span className={cn('flex-1 truncate', !selected && 'text-slate-400')}>{selected?.label ?? placeholder}</span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t('common.clear')}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panel}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[70] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-fade-in"
        >
          {showSearch && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  ref={search}
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  className={cn(control, 'h-9 pl-8')}
                />
              </div>
            </div>
          )}
          <ul ref={list} role="listbox" tabIndex={-1} className="scroll-light min-h-0 flex-1 overflow-y-auto py-1 outline-none">
            {filtered.map((option, i) => {
              const heading = option.group && option.group !== filtered[i - 1]?.group;
              return (
                <li key={option.value}>
                  {heading && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{option.group}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(option)}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-sm',
                      i === active && 'bg-slate-50',
                      option.value === value && 'bg-brand-50 font-medium text-brand-800',
                    )}
                  >
                    {option.label}
                    {option.hint && <span className="block text-xs font-normal text-slate-500">{option.hint}</span>}
                  </button>
                </li>
              );
            })}
            {!filtered.length && !(onCreate && term.trim()) && <li className="px-3 py-6 text-center text-sm text-slate-500">{emptyText}</li>}
            {onCreate && term.trim() && !options.some((o) => o.label.toLowerCase() === term.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCreate(term.trim());
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-100 text-brand-700">+</span>
                  {createLabel ? createLabel(term.trim()) : `Add “${term.trim()}”`}
                </button>
              </li>
            )}
          </ul>
          {footer && <div className="border-t border-slate-100 p-1.5" onClick={() => setOpen(false)}>{footer}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2', invalid && 'border-red-400', className)} {...props} />;
});

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50',
        checked ? 'bg-brand-700' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

type Tone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet' | 'sky';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/10',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/15',
};

export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          {typeof title === 'string' ? <h2 className="text-sm font-semibold text-slate-900">{title}</h2> : title}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  const colors = ['bg-brand-100 text-brand-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-sky-100 text-sky-800', 'bg-rose-100 text-rose-800'];
  return <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', colors[hue], className)}>{initials}</span>;
}

export function DefinitionList({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">{v ?? '–'}</dd>
        </div>
      ))}
    </dl>
  );
}
