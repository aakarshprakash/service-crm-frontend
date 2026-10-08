import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ClipboardList, PackageSearch, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/** Split-screen sign-in layout in the Servon brand: navy story panel + clean form. */
export function AuthLayout({ title, subtitle, children, footer, brand }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; brand?: string }) {
  const { t } = useTranslation();
  const modules = [
    { icon: ClipboardList, label: t('auth.module.jobs'), hint: t('auth.module.jobsHint') },
    { icon: Users, label: t('auth.module.field'), hint: t('auth.module.fieldHint') },
    { icon: PackageSearch, label: t('auth.module.stock'), hint: t('auth.module.stockHint') },
    { icon: Wallet, label: t('auth.module.money'), hint: t('auth.module.moneyHint') },
  ];

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        {/* Brand elements from the styleboard: blue/green glow, dot grid and a large faded mark. */}
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_0%_0%,rgba(37,99,235,0.45),transparent_70%),radial-gradient(60%_50%_at_100%_100%,rgba(16,185,129,0.28),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
        <LogoMark className="absolute -bottom-24 -right-20 h-[460px] w-auto opacity-[0.12]" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo tone="dark" tagline size="md" />
          <div className="max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-400">{t('auth.eyebrow')}</p>
            <h2 className="mt-3 text-[34px] font-extrabold leading-[1.1] tracking-tight">
              {t('auth.headline1')}
              <br />
              <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">{t('auth.headline2')}</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{t('auth.pitch')}</p>
            <dl className="mt-10 grid grid-cols-2 gap-3">
              {modules.map(({ icon: Icon, label, hint }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                  <Icon className="h-5 w-5 text-brand-400" strokeWidth={1.8} />
                  <dt className="mt-3 text-sm font-semibold text-white">{label}</dt>
                  <dd className="mt-0.5 text-xs text-slate-400">{hint}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent-400" />
              {t('auth.security')}
            </p>
            <p className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />© {new Date().getFullYear()} Servon
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo size="sm" />
          </span>
          <LanguageSwitcher className="ml-auto" />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            {brand && <p className="mb-2 text-sm font-medium text-brand-600">{brand}</p>}
            <h1 className="text-[28px] font-bold tracking-tight text-navy-900">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
