import { loadScript } from './utils';

interface Order {
  order_id: string;
  amount: number;
  currency: string;
  key: string;
  company?: string;
  invoice_number?: string;
}

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

/** Opens Razorpay hosted checkout; card / UPI data never touches our servers. */
export async function openCheckout(order: Order, prefill: { name?: string; contact?: string } = {}): Promise<CheckoutResult> {
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  if (!window.Razorpay) throw new Error('Payment window could not be opened. Please try again.');
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.key,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: order.company ?? 'Service payment',
      description: order.invoice_number ? `Invoice ${order.invoice_number}` : undefined,
      prefill,
      theme: { color: '#1d40d8' },
      handler: (resp: CheckoutResult) => resolve(resp),
      modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
    });
    rzp.on('payment.failed', () => reject(new Error('Payment failed. No money was deducted, or it will be refunded automatically.')));
    rzp.open();
  });
}
