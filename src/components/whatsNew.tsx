import { useEffect, useState } from 'react';
import { BadgeIndianRupee, CalendarCheck, Landmark, MapPinned, QrCode, Smartphone } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

export const APP_VERSION = __APP_VERSION__;

const SEEN_KEY = 'servon.whatsNew.seen';

const ITEMS = [
  { icon: Landmark, title: 'Accounts', text: 'A new Accounts menu: overview, receivables with aging, receipts, cash & bank books with deposits, day book and a profit & loss statement.' },
  { icon: QrCode, title: 'UPI QR payments', text: 'Add your UPI IDs in Settings → Master data. Invoices, walk-in bills and PDFs then show a “scan to pay” QR for the amount due.' },
  { icon: CalendarCheck, title: 'HR: attendance & leave', text: 'Everyone can punch in and out. See who’s in today, the monthly attendance register, and apply for or approve leave.' },
  { icon: MapPinned, title: 'Geo-fenced punching', text: 'Set each branch’s location and radius; punches from outside are flagged or blocked (Settings → Preferences).' },
  { icon: BadgeIndianRupee, title: 'Payroll', text: 'Set salaries, run monthly payroll from attendance with loss of pay, download payslips and record salaries as expenses.' },
  { icon: Smartphone, title: 'Technician mobile app', text: 'The Servon technician app (Android / iOS) works with this release: jobs, visits, UPI collection, punch, leave and payslips.' },
];

/** Opens the "What's new" dialog once per version per browser. */
export function useWhatsNew(enabled: boolean): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(SEEN_KEY) !== APP_VERSION) setOpen(true);
    } catch {
      /* storage blocked: just don't auto-open */
    }
  }, [enabled]);
  const set = (v: boolean) => {
    setOpen(v);
    if (!v) {
      try {
        localStorage.setItem(SEEN_KEY, APP_VERSION);
      } catch {
        /* ignore */
      }
    }
  };
  return [open, set];
}

export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`What’s new in Servon ${APP_VERSION.replace(/\.0$/, '')}`} footer={<Button onClick={onClose}>Got it</Button>}>
      <ul className="space-y-4">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-600">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
