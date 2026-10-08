import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeIndianRupee, CalendarCheck, Landmark, Languages, MapPinned, QrCode, Smartphone } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

export const APP_VERSION = __APP_VERSION__;

const SEEN_KEY = 'servon.whatsNew.seen';

const ITEMS = [
  { icon: Languages, key: 'languages' },
  { icon: Landmark, key: 'accounts' },
  { icon: QrCode, key: 'upi' },
  { icon: CalendarCheck, key: 'hr' },
  { icon: MapPinned, key: 'geofence' },
  { icon: BadgeIndianRupee, key: 'payroll' },
  { icon: Smartphone, key: 'mobile' },
] as const;

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
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('news.title', { version: APP_VERSION.replace(/\.0$/, '') })} footer={<Button onClick={onClose}>{t('news.gotIt')}</Button>}>
      <ul className="space-y-4">
        {ITEMS.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{t(`news.${key}.title`)}</p>
              <p className="text-sm text-slate-600">{t(`news.${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
