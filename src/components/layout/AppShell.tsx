import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Boxes, Building2, CalendarCheck, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardList, CreditCard, FileBarChart, Gauge, Hammer, Home, Landmark,
  LayoutDashboard, LogIn, LogOut, Menu, Package, Receipt, Settings, ShieldCheck, Sparkles, UserCircle, Users, UsersRound, Wallet, WifiOff, Wrench, X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { api, setToken, type Paginated } from '@/lib/api';
import { relative } from '@/lib/format';
import { useOnline } from '@/lib/hooks';
import { cn, getPosition } from '@/lib/utils';
import type { NotificationItem } from '@/lib/types';
import { Avatar, Button, SearchInput, toast } from '@/components/ui';
import { PageGuide } from '@/components/tutorial';
import { Logo, LogoMark } from '@/components/brand';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { APP_VERSION, WhatsNew, useWhatsNew } from '@/components/whatsNew';

interface NavChild {
  to: string;
  label: string;
  show: boolean;
  end?: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  end?: boolean;
  /** Sub-menu: the item becomes an expandable group. */
  children?: NavChild[];
}

/** A labelled block of the sidebar ("Service", "Finance"…). */
interface NavSection {
  label?: string;
  items: NavItem[];
}

const icon = (C: typeof Home) => <C className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />;

function useNav(): NavSection[] {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  if (!user) return [];

  if (user.role === 'super_admin') {
    return [
      {
        label: t('section.platform'),
        items: [
          { to: '/admin', label: t('nav.overview'), icon: icon(Gauge), show: true, end: true },
          { to: '/admin/tenants', label: t('nav.tenants'), icon: icon(Building2), show: true },
          { to: '/admin/plans', label: t('nav.plans'), icon: icon(CreditCard), show: true },
        ],
      },
    ];
  }
  if (user.role === 'technician') {
    return [
      {
        items: [
          { to: '/tech', label: t('nav.home'), icon: icon(Home), show: true, end: true },
          { to: '/tech/jobs', label: t('nav.myJobs'), icon: icon(ClipboardList), show: true },
          { to: '/tech/cash', label: t('nav.myCash'), icon: icon(Wallet), show: true },
          { to: '/tech/parts', label: t('nav.parts'), icon: icon(Package), show: true },
          { to: '/tech/me', label: t('nav.me'), icon: icon(CalendarCheck), show: true },
        ],
      },
    ];
  }

  const accounts = can('accounts.view');
  return [
    { items: [{ to: '/dashboard', label: t('nav.dashboard'), icon: icon(LayoutDashboard), show: can('dashboard.view') }] },
    {
      label: t('section.service'),
      items: [
        { to: '/jobs', label: t('nav.jobs'), icon: icon(Wrench), show: can('jobs.view') },
        { to: '/customers', label: t('nav.customers'), icon: icon(Users), show: can('customers.view') },
      ],
    },
    {
      label: t('section.finance'),
      items: [
        { to: '/invoices', label: t('nav.invoices'), icon: icon(Receipt), show: can('invoices.view') },
        {
          to: '/accounts',
          label: t('nav.accounts'),
          icon: icon(Landmark),
          show: accounts || can('cash.verify'),
          children: [
            { to: '/accounts', label: t('nav.accountsOverview'), show: accounts, end: true },
            { to: '/accounts/receivables', label: t('nav.receivables'), show: accounts },
            { to: '/accounts/receipts', label: t('nav.receipts'), show: can('payments.record') },
            { to: '/accounts/expenses', label: t('nav.expenses'), show: can('expenses.manage') },
            { to: '/accounts/expense-claims', label: t('nav.expenseClaims'), show: can('expenses.manage') },
            { to: '/accounts/cash-bank', label: t('nav.cashBank'), show: accounts },
            { to: '/accounts/books', label: t('nav.dayBook'), show: accounts },
            { to: '/accounts/profit-loss', label: t('nav.profitLoss'), show: accounts },
            { to: '/accounts/cash-close', label: t('nav.cashClose'), show: can('cash.verify') },
          ],
        },
      ],
    },
    {
      label: t('section.stock'),
      items: [
        { to: '/inventory', label: t('nav.inventory'), icon: icon(Boxes), show: can('inventory.view') },
        { to: '/assets', label: t('nav.assets'), icon: icon(Hammer), show: can('assets.view') },
      ],
    },
    {
      label: t('section.people'),
      items: [
        {
          to: '/hr',
          label: t('nav.hr'),
          icon: icon(UsersRound),
          show: can('hr.view') || can('leave.approve') || can('payroll.manage'),
          children: [
            { to: '/hr', label: t('nav.hrToday'), show: can('hr.view'), end: true },
            { to: '/hr/attendance', label: t('nav.attendance'), show: can('hr.view') },
            { to: '/hr/leave', label: t('nav.leave'), show: can('leave.approve') },
            { to: '/hr/employees', label: t('nav.employees'), show: can('payroll.manage') },
            { to: '/hr/payroll', label: t('nav.payroll'), show: can('payroll.manage') },
          ],
        },
        { to: '/team', label: t('nav.team'), icon: icon(ShieldCheck), show: can('users.view') },
        { to: '/me', label: t('nav.me'), icon: icon(CalendarCheck), show: can('self.service') },
      ],
    },
    {
      label: t('section.insights'),
      items: [{ to: '/reports', label: t('nav.reports'), icon: icon(FileBarChart), show: can('reports.view') }],
    },
    {
      label: t('section.admin'),
      items: [{ to: '/settings', label: t('nav.settings'), icon: icon(Settings), show: can('settings.manage') }],
    },
  ];
}

/** Sections with hidden items removed, and empty sections dropped. */
function visible(sections: NavSection[]): NavSection[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show).map((i) => (i.children ? { ...i, children: i.children.filter((c) => c.show) } : i)) }))
    .filter((s) => s.items.length);
}

const COLLAPSE_KEY = 'servon.sidebar.collapsed';

function itemClass(active: boolean, collapsed: boolean) {
  return cn(
    'group relative flex items-center gap-3 rounded-lg py-2 text-[13.5px] font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'px-3',
    active ? 'bg-white/[0.08] text-white' : 'text-slate-300/90 hover:bg-white/[0.05] hover:text-white',
  );
}

/** Left accent on the active item (brand blue → teal, like the logo). */
function ActiveBar({ show }: { show: boolean }) {
  return show ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-brand-500 to-accent-500" /> : null;
}

function NavGroup({ item, collapsed, onExpand }: { item: NavItem; collapsed: boolean; onExpand: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const inside = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const children = item.children ?? [];

  if (collapsed) {
    return (
      <button
        type="button"
        title={item.label}
        aria-label={item.label}
        onClick={() => {
          onExpand();
          setOpen(true);
          if (!inside && children[0]) navigate(children[0].to);
        }}
        className={cn(itemClass(inside, true), 'w-full')}
      >
        <ActiveBar show={inside} />
        {item.icon}
      </button>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(itemClass(false, false), 'w-full', inside && 'text-white')}>
        {item.icon}
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mb-1 ml-[1.32rem] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              end={c.end}
              className={({ isActive }) =>
                cn('block truncate rounded-md px-3 py-1.5 text-[13px] transition-colors', isActive ? 'bg-white/[0.08] font-medium text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ sections, collapsed, onToggle, onExpand, onNews, mobile }: { sections: NavSection[]; collapsed: boolean; onToggle?: () => void; onExpand: () => void; onNews: () => void; mobile?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="flex h-full flex-col bg-navy-900 bg-[radial-gradient(120%_60%_at_0%_0%,rgba(37,99,235,0.18),transparent_60%)]">
      <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'justify-between pl-5 pr-3')}>
        <Link to="/" aria-label="Servon home" className="flex items-center">
          {collapsed ? <LogoMark className="h-8 w-auto" /> : <Logo tone="dark" size="sm" />}
        </Link>
        {!mobile && !collapsed && onToggle && (
          <button type="button" onClick={onToggle} className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={t('shell.collapse')} title={t('shell.collapse')}>
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {user?.tenant && !collapsed && (
        <div className="mx-3 mb-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="truncate text-[13px] font-semibold text-white" title={user.tenant.name}>
            {user.tenant.name}
          </p>
          <p className="truncate text-[11px] text-slate-400">{t(`role.${user.role}`)}</p>
        </div>
      )}

      <nav className={cn('scroll-dark scroll-fade flex-1 overflow-y-auto pb-4 pt-1', collapsed ? 'pl-2 pr-0.5' : 'pl-3 pr-1.5')} aria-label={t('shell.mainNav')}>
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn(i > 0 && 'mt-4')}>
            {section.label &&
              (collapsed ? (
                <div className="mx-2 mb-2 border-t border-white/10" />
              ) : (
                <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">{section.label}</p>
              ))}
            <div className="space-y-0.5">
              {section.items.map((item) =>
                item.children ? (
                  <NavGroup key={item.to} item={item} collapsed={collapsed} onExpand={onExpand} />
                ) : (
                  <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined} className={({ isActive }) => itemClass(isActive, collapsed)}>
                    {({ isActive }) => (
                      <>
                        <ActiveBar show={isActive} />
                        {item.icon}
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t border-white/10', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          onToggle && (
            <button type="button" onClick={onToggle} className="flex w-full justify-center rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={t('shell.expand')} title={t('shell.expand')}>
              <ChevronsRight className="h-4 w-4" />
            </button>
          )
        ) : (
          <button type="button" onClick={onNews} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/[0.05] hover:text-white">
            <Sparkles className="h-3.5 w-3.5 text-accent-400" />
            <span>
              Servon v{APP_VERSION} · {t('shell.whatsNew')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const sections = visible(useNav());
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const isTech = user?.role === 'technician';
  const [showNews, setShowNews] = useWhatsNew(user?.role !== 'super_admin' && !!user);
  const tabs = sections.flatMap((s) => s.items);

  useEffect(() => setOpen(false), [location.pathname]);
  const setCollapse = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block', collapsed ? 'w-[72px]' : 'w-64')}>
        <Sidebar sections={sections} collapsed={collapsed} onToggle={() => setCollapse(!collapsed)} onExpand={() => setCollapse(false)} onNews={() => setShowNews(true)} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl animate-fade-in">
            <button className="absolute right-3 top-4 z-10 rounded-lg p-1 text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label={t('shell.closeMenu')}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar sections={sections} collapsed={false} mobile onExpand={() => undefined} onNews={() => setShowNews(true)} />
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        {user?.impersonating && (
          <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
            {t('shell.impersonating', { name: user.name, company: user.tenant?.name })}
            <Button size="sm" variant="secondary" onClick={stopImpersonating}>
              {t('shell.returnToAdmin')}
            </Button>
          </div>
        )}
        {trialDays !== null && !isTech && <div className="bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white">{t('shell.trial', { count: trialDays })}</div>}
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white" role="alert">
            <WifiOff className="h-4 w-4" /> {t('common.offline')}
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t('shell.openMenu')}>
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="lg:hidden" aria-label="Servon home">
            <LogoMark className="h-7 w-auto" />
          </Link>
          {user?.role !== 'super_admin' && <GlobalSearch />}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {!isTech && user?.role !== 'super_admin' && user?.abilities.includes('punch') && <PunchButton />}
            <LanguageSwitcher className="hidden sm:block" />
            {user?.role !== 'super_admin' && <NotificationBell />}
            <UserMenu onNews={() => setShowNews(true)} />
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
          {tabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}
            >
              {item.icon}
              {/* Two short lines rather than an ellipsis: Malayalam and Hindi labels run longer. */}
              <span className="line-clamp-2 max-w-full px-0.5 text-center leading-tight">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <WhatsNew open={showNews} onClose={() => setShowNews(false)} />
    </div>
  );
}

/** Avatar menu: profile, language (on small screens), what's new, sign out. */
function UserMenu({ onNews }: { onNews: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-label={t('shell.account')}>
        <Avatar name={user.name} />
        <span className="hidden max-w-[9rem] truncate text-sm font-medium text-slate-700 md:block">{user.name}</span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift animate-fade-in">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email ?? user.phone}</p>
            <p className="mt-1 text-xs text-slate-500">{t(`role.${user.role}`)}</p>
          </div>
          <div className="py-1">
            <MenuLink to="/profile" icon={<UserCircle className="h-4 w-4" />} onClick={() => setOpen(false)}>
              {t('shell.profile')}
            </MenuLink>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNews();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4 text-slate-400" /> {t('shell.whatsNew')}
            </button>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 sm:hidden">
            <LanguageSwitcher />
          </div>
          <div className="border-t border-slate-100 py-1">
            <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              <LogOut className="h-4 w-4" /> {t('nav.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon: i, children, onClick }: { to: string; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <Link to={to} role="menuitem" onClick={onClick} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
      <span className="text-slate-400">{i}</span>
      {children}
    </Link>
  );
}

/** Office staff punch in / out from the header (geo-fenced when the company turns it on). */
function PunchButton() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const on = user?.punch_status === 'in';
  const punch = async () => {
    setBusy(true);
    try {
      const pos = await getPosition(8000).catch(() => null); // the server decides whether location is required
      const res = await api.post<{ message?: string }>('/punch', { type: on ? 'out' : 'in', source: 'web', ...(pos ?? {}) });
      toast.success(res.message ?? t('common.done'));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={on ? 'secondary' : 'success'} loading={busy} icon={on ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} onClick={punch} className="whitespace-nowrap" title={on ? t('punch.out') : t('punch.in')}>
      <span className="hidden sm:inline">{on ? t('punch.out') : t('punch.in')}</span>
    </Button>
  );
}

function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const target = user?.role === 'technician' ? '/tech/jobs' : '/jobs';
  return (
    <form
      className="hidden w-full max-w-md sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) navigate(`${target}?search=${encodeURIComponent(value.trim())}`);
      }}
    >
      <SearchInput value={value} onChange={setValue} delay={0} placeholder={t('shell.search')} />
    </form>
  );
}

function NotificationBell() {
  const { t } = useTranslation();
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
    else if (n.type === 'leave_requested') navigate('/hr/leave');
    else if (n.type === 'leave_decided') navigate(user?.role === 'technician' ? '/tech/me' : '/me');
    api.post('/notifications/read', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['my-notifications'] })).catch(() => toast.error(t('notifications.updateFailed')));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t('notifications.label', { count: unread })}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">{t('notifications.title')}</p>
            {unread > 0 && (
              <button className="text-xs font-medium text-brand-600 hover:underline" onClick={markAll}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          <div className="scroll-light max-h-96 overflow-y-auto">
            {!data?.data.length && <p className="px-4 py-10 text-center text-sm text-slate-500">{t('notifications.empty')}</p>}
            {data?.data.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cn('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.read_at && 'bg-brand-50/50')}>
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
