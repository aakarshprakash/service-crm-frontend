import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, QrCode } from 'lucide-react';
import { useLookups } from '@/lib/hooks';
import { money, toMajor, toMinor } from '@/lib/format';
import type { UpiAccount } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Spinner, toast } from '@/components/ui';

/** NPCI UPI deep link — what every UPI app reads from a QR code. Mirrors UpiAccount::link() on the API. */
export function upiLink(account: Pick<UpiAccount, 'vpa' | 'payee_name'>, amountMinor?: number | null, note?: string, currency = 'INR'): string {
  const params: [string, string][] = [
    ['pa', account.vpa],
    ['pn', account.payee_name],
  ];
  if (amountMinor) params.push(['am', (amountMinor / 100).toFixed(2)]);
  params.push(['cu', currency]);
  if (note) params.push(['tn', note.slice(0, 80)]);
  return 'upi://pay?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** The company's UPI account to show for a branch: its own, else the default, else the first. */
export function pickUpiAccount(accounts: UpiAccount[] | undefined, branchId?: number | null): UpiAccount | undefined {
  if (!accounts?.length) return undefined;
  return accounts.find((a) => branchId && a.branch_id === branchId) ?? accounts.find((a) => a.is_default) ?? accounts[0];
}

export function UpiQr({ link, size = 220, className }: { link: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [link, size]);
  if (!src) return <div className="flex items-center justify-center" style={{ width: size, height: size }}><Spinner /></div>;
  return <img src={src} width={size} height={size} alt="UPI payment QR code" className={className} />;
}

/**
 * "Scan to pay" dialog: pick a UPI account, adjust the amount, show the QR big enough to
 * scan from a phone or monitor, copy the link or download the image to send on WhatsApp.
 */
export function UpiQrDialog({ open, onClose, amount, note, branchId, title = 'Collect by UPI' }: { open: boolean; onClose: () => void; amount: number; note?: string; branchId?: number | null; title?: string }) {
  const { data: lookups, isLoading } = useLookups();
  const accounts = lookups?.upi_accounts ?? [];
  const [accountId, setAccountId] = useState<number | null>(null);
  const [value, setValue] = useState(toMajor(amount));
  useEffect(() => setValue(toMajor(amount)), [amount, open]);
  const account = accounts.find((a) => a.id === accountId) ?? pickUpiAccount(accounts, branchId);
  const minor = toMinor(value);
  const link = account ? upiLink(account, minor, note) : '';

  const download = async () => {
    const url = await QRCode.toDataURL(link, { margin: 2, width: 800 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `upi-${(note ?? 'payment').replace(/\W+/g, '-').toLowerCase()}.png`;
    a.click();
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description="The customer scans this with any UPI app (GPay, PhonePe, Paytm, BHIM…). Record the payment once you see it credited." size="md">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !account ? (
        <div className="py-6 text-center text-sm text-slate-600">
          <QrCode className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          No UPI ID is set up yet. An admin can add one in <strong>Settings → Master data → UPI accounts</strong>.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.length > 1 && (
              <Field label="Pay to">
                <Select value={account.id} onChange={(e) => setAccountId(Number(e.target.value))}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.vpa}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Amount">
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4">
            <UpiQr link={link} size={240} />
            <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{minor ? money(minor) : 'Any amount'}</p>
            <p className="text-sm text-slate-600">{account.payee_name}</p>
            <p className="font-mono text-xs text-slate-500">{account.vpa}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard.writeText(account.vpa).then(() => toast.success('UPI ID copied'))}>
              Copy UPI ID
            </Button>
            <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
              Download QR
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
