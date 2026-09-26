import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, ShieldCheck, Wrench } from 'lucide-react';
import { api, API_BASE, type Envelope } from '@/lib/api';
import { openCheckout } from '@/lib/checkout';
import { date, money } from '@/lib/format';
import { Button, Card, QueryState, toast } from '@/components/ui';
import { StatusBadge } from '@/components/domain';

interface PublicInvoice {
  company: string;
  currency: string;
  invoice_number: string;
  call_id: string;
  customer: string;
  generated_at: string;
  total_service_charge: number;
  total_spare_charge: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: string;
  online_payments: boolean;
}

/** Public payment-link page (/pay/:token) sent by SMS / WhatsApp. */
export default function PayInvoice() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['pay', token], queryFn: () => api.get<Envelope<PublicInvoice>>(`/pay/${token}`).then((r) => r.data), retry: false });
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const inv = q.data;

  const pay = async () => {
    setPaying(true);
    try {
      const order = await api.post<Envelope<{ order_id: string; amount: number; currency: string; key: string; company: string; invoice_number: string }>>(`/pay/${token}/order`);
      const result = await openCheckout(order.data);
      const res = await api.post<Envelope<{ receipt_number: string }>>(`/pay/${token}/confirm`, result);
      setReceipt(res.data.receipt_number);
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <QueryState loading={q.isLoading} error={q.error}>
          {inv && (
            <Card>
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{inv.company}</p>
                  <p className="text-xs text-slate-500">Invoice {inv.invoice_number}</p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={inv.payment_status} />
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Dear {inv.customer}, here is your invoice for service request {inv.call_id} dated {date(inv.generated_at)}.
              </p>
              <dl className="my-5 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Service charge</dt><dd className="tabular-nums">{money(inv.total_service_charge, inv.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Spare charge</dt><dd className="tabular-nums">{money(inv.total_spare_charge, inv.currency)}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(inv.total_amount, inv.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{money(inv.paid_amount, inv.currency)}</dd></div>
                <div className="flex justify-between text-base font-bold"><dt>Balance due</dt><dd className="tabular-nums">{money(inv.balance_amount, inv.currency)}</dd></div>
              </dl>
              {receipt && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" /> Payment received. Receipt {receipt}.
                </div>
              )}
              {inv.balance_amount > 0 && inv.online_payments && (
                <Button size="lg" className="w-full" loading={paying} onClick={pay}>
                  Pay {money(inv.balance_amount, inv.currency)} securely
                </Button>
              )}
              {inv.balance_amount > 0 && !inv.online_payments && <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-600">Please pay our service agent (cash / UPI / cheque) or at our office.</p>}
              <a href={`${API_BASE}/pay/${token}/pdf`} className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                <Download className="h-4 w-4" /> Download invoice (PDF)
              </a>
              <p className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Payments are processed by Razorpay. Card details never reach us.
              </p>
            </Card>
          )}
        </QueryState>
      </div>
    </div>
  );
}
