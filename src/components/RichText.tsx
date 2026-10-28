import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui';

const Editor = lazy(() => import('./RichTextEditor'));

/** Formatted-text field; shows a plain textarea while the editor loads. */
export function RichTextField({ value, onChange, placeholder, invalid }: { value: string; onChange: (html: string) => void; placeholder?: string; invalid?: boolean }) {
  return (
    <Suspense fallback={<Textarea rows={5} value={value.replace(/<[^>]+>/g, '')} readOnly placeholder="Loading editor…" />}>
      <Editor value={value} onChange={onChange} placeholder={placeholder} invalid={invalid} />
    </Suspense>
  );
}

/** Shows formatted details (HTML already sanitised by the server) or falls back to plain text. */
export function RichTextView({ html, text, className }: { html?: string | null; text?: string | null; className?: string }) {
  if (html) return <div className={cn('rich-text text-sm text-slate-700', className)} dangerouslySetInnerHTML={{ __html: html }} />;
  if (!text) return null;
  return <p className={cn('whitespace-pre-line text-sm text-slate-700', className)}>{text}</p>;
}
