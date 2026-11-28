import type { Named } from '@/lib/types';

export type EnquiryType = 'service' | 'sales';
export type EnquiryStatus = 'new' | 'follow_up' | 'converted' | 'lost';

export interface EnquiryNote {
  id: number;
  kind: 'note' | 'status';
  note: string;
  created_at: string;
  user?: Named | null;
}

export interface Enquiry {
  id: number;
  enquiry_number: string;
  type: EnquiryType;
  status: EnquiryStatus;
  source: string;
  customer_id: number | null;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  brand_id: number | null;
  product: string | null;
  details: string | null;
  expected_value: number | null;
  follow_up_at: string | null;
  assigned_to: number | null;
  branch_id: number | null;
  job_id: number | null;
  estimate_id: number | null;
  lost_reason: string | null;
  closed_at: string | null;
  created_at: string;
  customer?: (Named & { phone?: string }) | null;
  assignee?: Named | null;
  brand?: Named | null;
  branch?: Named | null;
  creator?: Named | null;
  job?: { id: number; crm_call_id: string; status?: string } | null;
  estimate?: { id: number; estimate_number: string; status: string; total_amount?: number } | null;
  notes?: EnquiryNote[];
}

export interface EnquirySummary {
  new: number;
  follow_up: number;
  open: number;
  due_today: number;
  overdue: number;
  converted_this_month: number;
  lost_this_month: number;
  received_this_month: number;
  open_value: number;
}

export const TYPES: { value: EnquiryType; label: string; hint: string }[] = [
  { value: 'service', label: 'Service', hint: 'A repair, installation or service visit' },
  { value: 'sales', label: 'Sales', hint: 'Wants to buy a product or an AMC' },
];

export const SOURCES: { value: string; label: string }[] = [
  { value: 'phone', label: 'Phone call' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'social_media', label: 'Social media' },
  { value: 'other', label: 'Other' },
];

export const STATUS: Record<EnquiryStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'slate' }> = {
  new: { label: 'New', tone: 'blue' },
  follow_up: { label: 'Following up', tone: 'amber' },
  converted: { label: 'Converted', tone: 'green' },
  lost: { label: 'Lost', tone: 'slate' },
};

export const sourceLabel = (v: string) => SOURCES.find((s) => s.value === v)?.label ?? v;

/** When the next call is due, in words, and whether it is late. */
export function followUpState(e: Pick<Enquiry, 'follow_up_at' | 'status'>): { text: string; late: boolean; today: boolean } | null {
  if (!e.follow_up_at || (e.status !== 'new' && e.status !== 'follow_up')) return null;
  const at = new Date(e.follow_up_at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (at < startOfToday) {
    const days = Math.max(1, Math.round((startOfToday.getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / 86400000));
    return { text: days === 1 ? 'Overdue since yesterday' : `Overdue by ${days} days`, late: true, today: false };
  }
  if (at < startOfTomorrow) return { text: `Today, ${time}`, late: at < now, today: true };
  if (at < new Date(startOfTomorrow.getTime() + 86400000)) return { text: `Tomorrow, ${time}`, late: false, today: false };
  return { text: at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + `, ${time}`, late: false, today: false };
}
