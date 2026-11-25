import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, CopyPlus, Download, MessageCircle, Pencil, Phone, Printer, RotateCcw, Send, Trash2, Wrench, XCircle } from 'lucide-react';
import { api, download, imageObjectUrl, type Envelope } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, dateTime, money, qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { unitLabel, type Estimate, type EstimateItem } from '@/lib/types';
import { Button, Card, ConfirmDialog, Field, Modal, PageHeader, QueryState, Spinner, Textarea, toast } from '@/components/ui';
import { EstimateStatusBadge, gstLabel, sharedRate, validityText, whatsAppLink } from './estimateParts';

/** One estimate: where it stands and the next step, then the estimate as the customer reads it. */
export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['estimate', id], queryFn: () => api.get<Envelope<Estimate>>(`/estimates/${id}`).then((r) => r.data) });
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const e = q.data;
  const manage = can('estimates.manage');
  const open = e?.status === 'draft' || e?.status === 'sent';
  const invalidate = [['estimate', String(id)], ['estimates']];

  const status = useApiMutation((s: Estimate['status']) => api.post(`/estimates/${id}/status`, { status: s }), { invalidate });
  const copy = useApiMutation(() => api.post<Envelope<Estimate>>(`/estimates/${id}/duplicate`), { invalidate: [['estimates']], onSuccess: (r) => navigate(`/estimates/${r.data.id}/edit`) });
  const remove = useApiMutation(() => api.delete(`/estimates/${id}`), { invalidate: [['estimates']], onSuccess: () => navigate('/estimates', { replace: true }) });

  /** Sharing is how an estimate gets sent: a draft becomes "sent" the moment it is shared. */
  const share = (how: 'whatsapp' | 'link') => {
    if (!e) return;
    if (how === 'whatsapp') window.open(whatsAppLink(e, user?.tenant?.name), '_blank', 'noopener');
    else navigator.clipboard.writeText(e.share_url ?? '').then(() => toast.success('Link copied. Paste it in a message to the customer.'));
    if (e.status === 'draft' && manage) status.mutate('sent');
  };

  return (
    <QueryState loading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {e && (
        <>
          <PageHeader
            back={
              <Link to="/estimates" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Estimates
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {e.estimate_number} <EstimateStatusBadge estimate={e} />
              </span>
            }
            description={
              <>
                For <span className="font-medium text-slate-700">{e.customer?.name}</span> · {date(e.estimate_date)}
                {e.creator ? ` · made by ${e.creator.name}` : ''}
              </>
            }
          />

          {/*
            One toolbar under the title, so the buttons never squeeze it. Left: the steps with the customer
            (Send while it is a draft, their answer once it is out). Right: working on the estimate itself.
          */}
          <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {open && <SendMenu primary={e.status === 'draft'} canMarkSent={manage && e.status === 'draft'} busy={status.isPending} onShare={share} onSent={() => status.mutate('sent')} />}
              {manage && open && (
                <>
                  <Button variant={e.status === 'sent' ? 'primary' : 'secondary'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDeciding('approved')}>
                    Approve
                  </Button>
                  <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => setDeciding('rejected')}>
                    Reject
                  </Button>
                </>
              )}
              {manage && !open && (
                <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={status.isPending} onClick={() => status.mutate('draft')}>
                  Reopen to change
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {manage && open && (
                <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/estimates/${e.id}/edit`)}>
                  Edit
                </Button>
              )}
              {/* Opens the PDF in the page; its window has the Print and Download buttons. */}
              <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => setPreviewing(true)}>
                Print / download
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <EstimateSheet estimate={e} />
            </div>

            <div className="min-w-0 space-y-6">
              <Card title="Customer">
                <Link to={`/customers/${e.customer_id}`} className="font-medium text-brand-700 hover:underline">{e.customer?.name}</Link>
                {e.customer?.phone && (
                  <a href={`tel:${e.customer.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
                    <Phone className="h-3.5 w-3.5" /> {e.customer.phone}
                  </a>
                )}
                {(e.customer?.address || e.customer?.city) && <p className="mt-1 text-sm text-slate-600">{[e.customer?.address, e.customer?.city, e.customer?.state].filter(Boolean).join(', ')}</p>}
                {e.customer_gstin && <p className="mt-2 text-sm text-slate-600">GSTIN <span className="font-medium tabular-nums text-slate-800">{e.customer_gstin}</span></p>}
                {e.is_gst && e.place_of_supply && <p className="text-xs text-slate-500">Place of supply: {e.place_of_supply}</p>}
                {e.customer_product && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">{unitLabel(e.customer_product) || 'Product'}{e.customer_product.serial_no ? ` · SN ${e.customer_product.serial_no}` : ''}</p>}
              </Card>


              <Card title="Job">
                {e.job ? (
                  <Link to={`/jobs/${e.job.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                    <Wrench className="h-4 w-4" /> Job {e.job.crm_call_id}
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">This estimate isn’t linked to a job.</p>
                    {can('jobs.manage') && (
                      <Button size="sm" variant="secondary" icon={<Wrench className="h-4 w-4" />} onClick={() => navigate(`/jobs/new?customer_id=${e.customer_id}`)}>
                        Create a job for this customer
                      </Button>
                    )}
                  </div>
                )}
              </Card>

              <History estimate={e} />

              {manage && (
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" icon={<CopyPlus className="h-4 w-4" />} loading={copy.isPending} onClick={() => copy.mutate(undefined)}>
                    Make a copy
                  </Button>
                  {e.status !== 'approved' && (
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
                      Delete this estimate
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {previewing && <PdfPreview path={`/estimates/${e.id}/pdf`} title={`Estimate ${e.estimate_number}`} filename={`${e.estimate_number}.pdf`} onClose={() => setPreviewing(false)} />}
          {deciding && <DecideDialog estimate={e} decision={deciding} onClose={() => setDeciding(null)} />}
          <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate(undefined)} title={`Delete estimate ${e.estimate_number}?`} message="It is removed for good. The link shared with the customer stops working." confirmLabel="Delete estimate" loading={remove.isPending} />
        </>
      )}
    </QueryState>
  );
}

/** The estimate laid out the way the customer's PDF reads: subject, lines, then the totals. */
function EstimateSheet({ estimate: e }: { estimate: Estimate }) {
  const items = e.items ?? [];
  const rates = lineRates(e);
  const gstLines = lineGst(e);
  const inclusive = e.is_gst && e.prices_include_gst;
  const discounted = e.discount_amount > 0;
  // With GST each line lists its tax and what it comes to with GST: added, 1000 at 18% is 1180; included, 1000 stays 1000.
  const amountOf = (l: EstimateItem, i: number) => (e.is_gst ? gstLines[i]?.net ?? l.total : l.total);
  const v = validityText(e);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <header className="bg-navy-900 px-5 py-4 text-white sm:px-6">
        <p className="text-base font-semibold leading-snug sm:text-lg">{e.subject ?? 'Estimate'}</p>
        <p className="mt-1 text-sm text-slate-300">
          {gstLabel(e)}
          {e.valid_until && <> · valid until {date(e.valid_until)}</>}
          {v && <span className={cn('ml-1', v.urgent ? 'font-medium text-amber-300' : 'text-slate-400')}>({v.text.toLowerCase()})</span>}
        </p>
      </header>

      {/*
        Wide screens: the PDF's columns. The card sits beside the side panels, so the table stays compact:
        the unit goes with the quantity ("60 Nos"), amounts never break, and the description takes what is left.
      */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="w-8 py-2.5 pl-5 pr-1 font-semibold">#</th>
            <th className="px-2 py-2.5 font-semibold">Item description</th>
            <th className="px-2 py-2.5 text-right font-semibold">Qty</th>
            <th className="px-2 py-2.5 text-right font-semibold">{inclusive ? 'Rate incl. GST' : 'Rate'}</th>
            {e.is_gst && <th className="px-2 py-2.5 text-right font-semibold">Tax %</th>}
            {e.is_gst && <th className="px-2 py-2.5 text-right font-semibold">{discounted ? 'Tax after discount' : 'Tax amount'}</th>}
            <th className="py-2.5 pl-2 pr-5 text-right font-semibold">{!e.is_gst ? 'Amount' : discounted ? 'Amount after discount' : 'Amount incl. GST'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((l, i) => (
            <tr key={l.id} className="align-top">
              <td className="py-3 pl-5 pr-1 tabular-nums text-slate-400">{i + 1}</td>
              <td className="px-2 py-3">
                <LineText line={l} />
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                {qty(l.quantity)} {l.unit && <span className="text-slate-500">{l.unit}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{money(l.unit_price)}</td>
              {e.is_gst && <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-600">{rates[i]}%</td>}
              {e.is_gst && <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-600">{money(gstLines[i]?.tax ?? 0)}</td>}
              <td className="whitespace-nowrap py-3 pl-2 pr-5 text-right font-medium tabular-nums text-slate-900">{money(amountOf(l, i))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: one block per line, the sum spelled out under the description. */}
      <ol className="divide-y divide-slate-100 sm:hidden">
        {items.map((l, i) => (
          <li key={l.id} className="flex gap-3 px-4 py-3.5">
            <span className="w-5 shrink-0 pt-0.5 text-sm tabular-nums text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <LineText line={l} />
              <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="tabular-nums text-slate-500">
                  {qty(l.quantity)} {l.unit ?? ''} × {money(l.unit_price)}
                  {e.is_gst && ` · GST ${rates[i]}% (${money(gstLines[i]?.tax ?? 0)})`}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{money(amountOf(l, i))}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-6">
        <Totals estimate={e} />
      </div>

      {(e.notes || e.terms) && (
        <div className="grid gap-4 border-t border-slate-200 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6">
          {e.notes && (
            <div>
              <h3 className="font-medium text-slate-900">Note</h3>
              <p className="mt-1 whitespace-pre-line text-slate-700">{e.notes}</p>
            </div>
          )}
          {e.terms && (
            <div>
              <h3 className="font-medium text-slate-900">Terms</h3>
              <p className="mt-1 whitespace-pre-line text-slate-600">{e.terms}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Long equipment specifications are cut to four lines until asked for. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 4;
  return (
    <>
      <p className={cn('whitespace-pre-line', long && !open && 'line-clamp-4')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 text-xs font-medium text-brand-700 hover:underline">
          {open ? 'Show less' : 'Show full description'}
        </button>
      )}
    </>
  );
}

/** The item name, its description under it, and whether it is a service or a part. */
function LineText({ line: l }: { line: EstimateItem }) {
  return (
    <>
      {l.details ? <p className="font-medium text-slate-900">{l.description}</p> : <Description text={l.description} />}
      {l.details && <div className="mt-0.5 text-slate-600"><Description text={l.details} /></div>}
      <p className="mt-0.5 text-xs text-slate-500">{l.type === 'part' ? (l.item ? `Part · ${l.item.code}` : 'Part · to be bought') : 'Service'}</p>
    </>
  );
}

/**
 * Each line's GST rate as saved in the GST breakup (which already applied Settings to lines without
 * their own rate); 0 on an estimate without GST.
 */
function lineRates(e: Estimate): number[] {
  const breakup = e.gst_breakup?.lines ?? [];
  return (e.items ?? []).map((l, i) => Number(l.gst_rate ?? breakup[i]?.gst_rate ?? 0));
}

/** Each line's GST and its amount with GST (after its share of any discount), in paise, from the saved breakup. */
function lineGst(e: Estimate): { tax: number; net: number | undefined }[] {
  const breakup = e.gst_breakup?.lines ?? [];
  return (e.items ?? []).map((_, i) => ({ tax: breakup[i]?.tax ?? 0, net: breakup[i]?.net }));
}

function TotalRow({ k, v, sub, strong, muted }: { k: ReactNode; v: ReactNode; sub?: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn(strong && 'mt-1 border-t border-slate-200 pt-2.5')}>
      <div className={cn('flex items-baseline justify-between gap-4', strong ? 'text-base font-semibold text-slate-900 sm:text-lg' : muted ? 'text-slate-500' : 'text-slate-700')}>
        <span>{k}</span>
        <span className="tabular-nums">{v}</span>
      </div>
      {sub && <p className="text-right text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** The totals in the PDF's order. With GST added on top: Total, GST, Total including GST. */
function Totals({ estimate: e }: { estimate: Estimate }) {
  const gross = e.total_service_charge + e.total_spare_charge;
  const tax = e.cgst_amount + e.sgst_amount + e.igst_amount;
  const rate = sharedRate(lineRates(e));
  // Same state: GST splits into CGST + SGST. Another state is all IGST, which is the GST amount itself, so there is nothing to add.
  const split = e.igst_amount ? undefined : `CGST${rate !== null ? ` ${rate / 2}%` : ''} ${money(e.cgst_amount)} + SGST${rate !== null ? ` ${rate / 2}%` : ''} ${money(e.sgst_amount)}`;

  if (e.is_gst && !e.prices_include_gst) {
    return (
      <div className="ml-auto max-w-sm space-y-1.5 text-sm">
        <TotalRow k="Total" v={money(gross)} />
        {e.discount_amount > 0 && (
          <>
            <TotalRow k="Less discount" v={`− ${money(e.discount_amount)}`} muted />
            <TotalRow k="Taxable value" v={money(e.taxable_amount)} muted />
          </>
        )}
        <TotalRow k={`GST${rate !== null ? ` @ ${rate}%` : ''}`} v={money(tax)} sub={split} />
        <TotalRow k="Total including GST" v={money(e.total_amount)} strong />
      </div>
    );
  }
  return (
    <div className="ml-auto max-w-sm space-y-1.5 text-sm">
      {e.total_service_charge > 0 && e.total_spare_charge > 0 && (
        <>
          <TotalRow k="Services" v={money(e.total_service_charge)} muted />
          <TotalRow k="Parts" v={money(e.total_spare_charge)} muted />
        </>
      )}
      {e.discount_amount > 0 && <TotalRow k="Discount" v={`− ${money(e.discount_amount)}`} muted />}
      <TotalRow k="Estimated total" v={money(e.total_amount)} strong sub={e.is_gst ? `Includes GST ${money(tax)}${split ? ` (${split})` : ''}` : undefined} />
    </div>
  );
}

function History({ estimate: e }: { estimate: Estimate }) {
  const v = validityText(e);
  const steps = [
    { title: 'Created', when: `${dateTime(e.created_at)}${e.creator ? ` · ${e.creator.name}` : ''}`, tone: 'bg-slate-400' },
    e.sent_at && { title: 'Sent to the customer', when: dateTime(e.sent_at), tone: 'bg-sky-500' },
    e.decided_at && {
      title: e.status === 'approved' ? 'Approved' : 'Rejected',
      when: `${dateTime(e.decided_at)}${e.decider ? ` · recorded by ${e.decider.name}` : ''}`,
      note: e.decision_note,
      tone: e.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500',
    },
    // Still waiting: when the offer ends, so the follow-up is not left too late.
    v && e.valid_until && { title: `Valid until ${date(e.valid_until)}`, when: v.text, tone: v.urgent ? 'bg-amber-500' : 'bg-slate-300' },
  ].filter(Boolean) as { title: string; when: string; note?: string | null; tone: string }[];
  return (
    <Card title="History">
      <ol className="relative space-y-4 text-sm">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3">
            {i < steps.length - 1 && <span className="absolute left-[4px] top-4 h-[calc(100%+0.5rem)] w-px bg-slate-200" aria-hidden />}
            <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', s.tone)} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{s.title}</p>
              <p className="text-slate-500">{s.when}</p>
              {s.note && <p className="mt-1 text-slate-700">“{s.note}”</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Send: WhatsApp, the link, or just record that it went out some other way. Sharing a draft marks it sent. */
function SendMenu({ primary, canMarkSent, busy, onShare, onSent }: {
  primary: boolean;
  canMarkSent: boolean;
  busy: boolean;
  onShare: (how: 'whatsapp' | 'link') => void;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (ev: MouseEvent) => ref.current && !ref.current.contains(ev.target as Node) && setOpen(false);
    const escape = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const pick = (act: () => void) => () => {
    setOpen(false);
    act();
  };
  const item = 'flex w-full items-start gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none';
  return (
    <div className="relative" ref={ref}>
      <Button variant={primary ? 'primary' : 'secondary'} icon={<Send className="h-4 w-4" />} loading={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Send
        <ChevronDown className="-mr-1 h-4 w-4 opacity-70" aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift animate-fade-in">
          <button type="button" role="menuitem" autoFocus className={item} onClick={pick(() => onShare('whatsapp'))}>
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Send on WhatsApp
          </button>
          <button type="button" role="menuitem" className={item} onClick={pick(() => onShare('link'))}>
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Copy link
          </button>
          {canMarkSent && (
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button type="button" role="menuitem" className={item} onClick={pick(onSent)}>
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  Mark as sent
                  <span className="block text-xs text-slate-500">Sent it some other way</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shows the estimate PDF in the page so the office can read or print it without downloading a file first. */
function PdfPreview({ path, title, filename, onClose }: { path: string; title: string; filename: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    let made: string | null = null;
    imageObjectUrl(path)
      .then((u) => { if (active) { made = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'The estimate could not be opened.'));
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);

  const print = () => {
    const win = frame.current?.contentWindow;
    if (win) { win.focus(); win.print(); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => download(path, filename).catch((e) => toast.error(e.message))}>
            Download
          </Button>
          <Button icon={<Printer className="h-4 w-4" />} disabled={!url} onClick={print}>
            Print
          </Button>
        </>
      }
    >
      {error ? (
        <div className="flex h-[55vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-slate-900">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => download(path, filename).catch((e) => toast.error(e.message))}>Download instead</Button>
        </div>
      ) : url ? (
        <iframe ref={frame} src={url} title={title} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50" />
      ) : (
        <div className="flex h-[55vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>
      )}
    </Modal>
  );
}

function DecideDialog({ estimate, decision, onClose }: { estimate: Estimate; decision: 'approved' | 'rejected'; onClose: () => void }) {
  const [note, setNote] = useState('');
  const m = useApiMutation(() => api.post(`/estimates/${estimate.id}/status`, { status: decision, note: note.trim() || null }), {
    toastValidation: false,
    invalidate: [['estimate', String(estimate.id)], ['estimates']],
    onSuccess: onClose,
  });
  const approving = decision === 'approved';
  return (
    <Modal
      open
      onClose={onClose}
      title={approving ? `The customer approved ${estimate.estimate_number}?` : `The customer rejected ${estimate.estimate_number}?`}
      description={approving ? `Approved for ${money(estimate.total_amount)}. The estimate is then locked.` : 'The estimate is then locked. You can reopen it later to change it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Go back</Button>
          <Button variant={approving ? 'primary' : 'danger'} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            {approving ? 'Mark approved' : 'Mark rejected'}
          </Button>
        </>
      }
    >
      <Field label="Note" hint={approving ? 'Optional: how they confirmed, or anything agreed.' : 'Optional: why they said no.'} error={fieldError(m.error, 'note') ?? fieldError(m.error, 'status')}>
        <Textarea autoFocus rows={3} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={approving ? 'e.g. Confirmed on WhatsApp, wants it done on Saturday' : 'e.g. Will buy a new unit instead'} />
      </Field>
    </Modal>
  );
}
