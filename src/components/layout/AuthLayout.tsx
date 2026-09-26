import type { ReactNode } from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';

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
            <h2 className="text-3xl font-semibold leading-tight">Run your entire service operation from one place.</h2>
            <ul className="mt-8 space-y-4 text-slate-300">
              {[
                'Log complaints, assign technicians and track every visit live',
                'Spares & consumables stock that updates as technicians work',
                'Invoices, field cash collection and daily cash close without spreadsheets',
                'Customer portal, SMS / WhatsApp updates and detailed reports',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} ServiceCRM</p>
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
