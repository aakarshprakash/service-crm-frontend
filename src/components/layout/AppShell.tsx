import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Boxes, Building2, CalendarCheck, ChevronDown, ClipboardList, CreditCard, FileBarChart, Gauge, Hammer, Home, Landmark, LayoutDashboard, LogIn, LogOut,
  Menu, Package, Receipt, Settings, ShieldCheck, UserCircle, Users, UsersRound, Wallet, WifiOff, Wrench, X,
} from 'lucide-react';
import { APP_VERSION, WhatsNew, useWhatsNew } from '@/components/whatsNew';
import { getPosition } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';
import { api, setToken, type Paginated } from '@/lib/api';
import { relative } from '@/lib/format';
import { useOnline } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/lib/types';
import { Avatar, Button, SearchInput, toast } from '@/components/ui';
import { PageGuide } from '@/components/tutorial';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  end?: boolean;
  /** Sub-menu: the item becomes an expandable group heading. */
  children?: { to: string; label: string; show: boolean; end?: boolean }[];
}

function useNav(): NavItem[] {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  if (!user) return [];
  const i = (C: typeof Home) => <C className="h-[18px] w-[18px]" />;

  if (user.role === 'super_admin') {
    return [
      { to: '/admin', label: 'Overview', icon: i(Gauge), show: true, end: true },
      { to: '/admin/tenants', label: t('nav.tenants'), icon: i(Building2), show: true },
      { to: '/admin/plans', label: t('nav.plans'), icon: i(CreditCard), show: true },
    ];
  }
  if (user.role === 'technician') {
    return [
      { to: '/tech', label: t('nav.home'), icon: i(Home), show: true, end: true },
      { to: '/tech/jobs', label: t('nav.myJobs'), icon: i(ClipboardList), show: true },
      { to: '/tech/cash', label: t('nav.myCash'), icon: i(Wallet), show: true },
      { to: '/tech/parts', label: t('nav.parts'), icon: i(Package), show: true },
      { to: '/tech/me', label: t('nav.me'), icon: i(CalendarCheck), show: true },
    ];
  }
  const accounts = can('accounts.view');
  return [
    { to: '/dashboard', label: t('nav.dashboard'), icon: i(LayoutDashboard), show: can('dashboard.view') },
    { to: '/jobs', label: t('nav.jobs'), icon: i(Wrench), show: can('jobs.view') },
    { to: '/customers', label: t('nav.customers'), icon: i(Users), show: can('customers.view') },
    { to: '/invoices', label: t('nav.invoices'), icon: i(Receipt), show: can('invoices.view') },
    {
      to: '/accounts',
      label: t('nav.accounts'),
      icon: i(Landmark),
      show: accounts || can('cash.verify'),
      children: [
        { to: '/accounts', label: 'Overview', show: accounts, end: true },
        { to: '/accounts/receivables', label: 'Receivables', show: accounts },
        { to: '/accounts/receipts', label: 'Receipts', show: can('payments.record') },
        { to: '/accounts/expenses', label: t('nav.expenses'), show: can('expenses.manage') },
        { to: '/accounts/cash-bank', label: 'Cash & bank', show: accounts },
        { to: '/accounts/books', label: 'Day book', show: accounts },
        { to: '/accounts/profit-loss', label: 'Profit & loss', show: accounts },
        { to: '/accounts/cash-close', label: 'Technician cash close', show: can('cash.verify') },
      ],
    },
    { to: '/inventory', label: t('nav.inventory'), icon: i(Boxes), show: can('inventory.view') },
    { to: '/assets', label: t('nav.assets'), icon: i(Hammer), show: can('assets.view') },
    {
      to: '/hr',
      label: t('nav.hr'),
      icon: i(UsersRound),
      show: can('hr.view') || can('leave.approve') || can('payroll.manage'),
      children: [
        { to: '/hr', label: 'Today', show: can('hr.view'), end: true },
        { to: '/hr/attendance', label: 'Attendance register', show: can('hr.view') },
        { to: '/hr/leave', label: 'Leave requests', show: can('leave.approve') },
        { to: '/hr/employees', label: 'Employees & salary', show: can('payroll.manage') },
        { to: '/hr/payroll', label: 'Payroll', show: can('payroll.manage') },
      ],
    },
    { to: '/me', label: t('nav.me'), icon: i(CalendarCheck), show: can('self.service') },
    { to: '/reports', label: t('nav.reports'), icon: i(FileBarChart), show: can('reports.view') },
    { to: '/team', label: t('nav.team'), icon: i(ShieldCheck), show: can('users.view') },
    { to: '/settings', label: t('nav.settings'), icon: i(Settings), show: can('settings.manage') },
  ];
}

const linkClass = (isActive: boolean) =>
  cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white');

function NavGroup({ item }: { item: NavItem }) {
  const location = useLocation();
  const inside = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const children = item.children!.filter((c) => c.show);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(linkClass(false), 'w-full', inside && 'text-white')}>
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mb-1 ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {children.map((c) => (
            <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => cn('block rounded-md px-3 py-1.5 text-[13px] transition-colors', isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout, setUser } = useAuth();
  const nav = useNav().filter((n) => n.show);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const isTech = user?.role === 'technician';
  const [showNews, setShowNews] = useWhatsNew(user?.role !== 'super_admin' && !!user);

  useEffect(() => setOpen(false), [location.pathname]);

  const stopImpersonating = async () => {
    const res = await api.post<{ data: { user: typeof user; token?: string } }>('/impersonation/stop');
    if (res.data.token) setToken(res.data.token);
    setUser(res.data.user);
    navigate('/admin/tenants');
  };

  const trialDays =
    user?.tenant?.status === 'trial' && user.tenant.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(user.tenant.trial_ends_at).getTime() - Date.now()) / 86400000))
      : null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user?.tenant?.name ?? 'Servon'}</p>
          <p className="truncate text-[11px] text-slate-400">{user?.role_label}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {nav.map((item) =>
          item.children ? (
            <NavGroup key={item.to} item={item} />
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive)}>
              {item.icon}
              {item.label}
            </NavLink>
          ),
        )}
      </nav>
      <button type="button" onClick={() => setShowNews(true)} className="px-5 pb-2 text-left text-[11px] text-slate-500 hover:text-slate-300">
        Servon v{APP_VERSION} · What’s new
      </button>
      <div className="border-t border-white/10 p-3">
        <Link to="/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 text-slate-300 hover:bg-white/5 hover:text-white">
          <Avatar name={user?.name ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-xs text-slate-400">{user?.email ?? user?.phone}</p>
          </div>
          <UserCircle className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-900 lg:block')}>{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-slate-900 shadow-xl animate-fade-in">
            <button className="absolute right-3 top-4 rounded-lg p-1 text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {user?.impersonating && (
          <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
            You are signed in as {user.name} ({user.tenant?.name}) for support.
            <Button size="sm" variant="secondary" onClick={stopImpersonating}>
              Return to Super Admin
            </Button>
          </div>
        )}
        {trialDays !== null && !isTech && (
          <div className="bg-violet-600 px-4 py-2 text-center text-sm text-white">
            Free trial · {trialDays} day{trialDays === 1 ? '' : 's'} left. Contact us to activate your subscription.
          </div>
        )}
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white" role="alert">
            <WifiOff className="h-4 w-4" /> You are offline. Changes can't be saved until your connection is back.
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          {user?.role !== 'super_admin' && (
            <GlobalSearch />
          )}
          <div className="ml-auto flex items-center gap-1">
            {!isTech && user?.role !== 'super_admin' && user?.abilities.includes('punch') && <PunchButton />}
            {user?.role !== 'super_admin' && <NotificationBell />}
            <Button variant="ghost" size="sm" onClick={logout} icon={<LogOut className="h-4 w-4" />} className="hidden sm:inline-flex">
              Sign out
            </Button>
          </div>
        </header>

        <main className={cn('mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8', isTech && 'pb-24 lg:pb-6')}>
          <PageGuide />
          <Outlet />
        </main>
      </div>

      {/* Technician bottom tab bar (mobile) */}
      {isTech && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-slate-500')}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
      <WhatsNew open={showNews} onClose={() => setShowNews(false)} />
    </div>
  );
}

/** Office staff punch in / out from the header (geo-fenced when the company turns it on). */
function PunchButton() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const on = user?.punch_status === 'in';
  const punch = async () => {
    setBusy(true);
    try {
      const pos = await getPosition(8000).catch(() => null); // the server decides whether location is required
      const res = await api.post<{ message?: string }>('/punch', { type: on ? 'out' : 'in', source: 'web', ...(pos ?? {}) });
      toast.success(res.message ?? 'Done.');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={on ? 'secondary' : 'success'} loading={busy} icon={on ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} onClick={punch} className="whitespace-nowrap">
      <span className="hidden sm:inline">{on ? 'Punch out' : 'Punch in'}</span>
    </Button>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const target = user?.role === 'technician' ? '/tech/jobs' : '/jobs';
  return (
    <form
      className="w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) navigate(`${target}?search=${encodeURIComponent(value.trim())}`);
      }}
    >
      <SearchInput value={value} onChange={setValue} delay={0} placeholder="Search Call ID, phone, serial no. or CRM ID" />
    </form>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: () => api.get<Paginated<NotificationItem> & { meta: { unread: number } }>('/notifications', { per_page: 15 }),
    refetchInterval: 60_000,
  });
  const unread = (data?.meta.unread as number) ?? 0;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markAll = async () => {
    await api.post('/notifications/read');
    qc.invalidateQueries({ queryKey: ['my-notifications'] });
  };

  const openItem = (n: NotificationItem) => {
    setOpen(false);
    const jobId = n.data?.job_id as number | undefined;
    if (jobId) navigate(user?.role === 'technician' ? `/tech/jobs/${jobId}` : `/jobs/${jobId}`);
    else if (n.type === 'low_stock') navigate('/inventory?tab=stock&low_stock=1');
    else if (n.type === 'export_ready') navigate('/reports?exports=1');
    else if (n.type === 'asset_issued') navigate(user?.role === 'technician' ? '/tech' : `/assets/${n.data?.asset_id}`);
    api.post('/notifications/read', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['my-notifications'] })).catch(() => toast.error('Could not update notification'));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-medium text-brand-700 hover:underline" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.data.length && <p className="px-4 py-10 text-center text-sm text-slate-500">You're all caught up.</p>}
            {data?.data.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cn('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.read_at && 'bg-brand-50/40')}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{relative(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
