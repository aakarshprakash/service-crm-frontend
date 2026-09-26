import type { ReactNode } from 'react';
import { ClipboardList, MapPin, Package, ShieldCheck, Wallet, Wrench } from 'lucide-react';

const modules = [
  { icon: ClipboardList, label: 'Job cards', hint: 'Complaint to closure' },
  { icon: MapPin, label: 'Field visits', hint: 'Live technician status' },
  { icon: Package, label: 'Inventory', hint: 'Spares used per visit' },
  { icon: Wallet, label: 'Collections', hint: 'Daily cash close' },
];

export function AuthLayout({ title, subtitle, children, footer, brand }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; brand?: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,110,246,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.2),transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">{brand ?? 'ServiceCRM'}</span>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight">Service operations, under control.</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              One record per complaint — from the first call through the technician's visit to the payment collected in the field.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7">
              {modules.map(({ icon: Icon, label, hint }) => (
                <div key={label}>
                  <Icon className="h-5 w-5 text-brand-400" />
                  <dt className="mt-3 text-sm font-medium text-white">{label}</dt>
                  <dd className="mt-0.5 text-xs text-slate-400">{hint}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Role-based access, two-factor sign-in and a full audit trail.
            </p>
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} ServiceCRM</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">{brand ?? 'ServiceCRM'}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
