import { Badge } from '@/components/ui';
import { date, money } from '@/lib/format';
import type { Estimate } from '@/lib/types';

/** What the office sees: an open estimate past its last valid day reads as expired, whatever its stored status. */
export function estimateState(e: Pick<Estimate, 'status' | 'is_expired'>): 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' {
  return e.is_expired ? 'expired' : e.status;
}

const STATE = {
  draft: { label: 'Draft', tone: 'slate' },
  sent: { label: 'Sent', tone: 'sky' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  expired: { label: 'Expired', tone: 'amber' },
} as const;

export function EstimateStatusBadge({ estimate }: { estimate: Pick<Estimate, 'status' | 'is_expired'> }) {
  const s = STATE[estimateState(estimate)];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** India numbers get the country code; anything else is passed through as typed. */
function waNumber(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** A WhatsApp chat with the customer, with the estimate's summary and the link to its PDF already typed. */
export function whatsAppLink(e: Estimate, company: string | undefined): string {
  const lines = [
    `Hello ${e.customer?.name ?? ''},`.replace(' ,', ','),
    `Here is your estimate ${e.estimate_number}${e.subject ? ` for ${e.subject}` : ''}${company ? ` from ${company}` : ''}.`,
    `Total: ${money(e.total_amount)}${e.valid_until ? ` (valid until ${date(e.valid_until)})` : ''}`,
    e.share_url ? `View or download: ${e.share_url}` : null,
    'Please reply to approve it or if you have any questions.',
  ].filter(Boolean);
  return `https://wa.me/${waNumber(e.customer?.phone)}?text=${encodeURIComponent(lines.join('\n'))}`;
}
