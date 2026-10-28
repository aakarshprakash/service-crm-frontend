import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, homePath, useAuth } from '@/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ForcePasswordChange } from '@/components/ForcePasswordChange';
import { Spinner, Toaster } from '@/components/ui';
import type { Role } from '@/lib/types';

// Route-level code splitting keeps the first load fast for every role.
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const PayInvoice = lazy(() => import('@/pages/public/PayInvoice'));

const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));
const JobsPage = lazy(() => import('@/pages/jobs/JobsPage'));
const JobCreate = lazy(() => import('@/pages/jobs/JobCreate'));
const JobDetail = lazy(() => import('@/pages/jobs/JobDetail'));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'));
const CustomerDetail = lazy(() => import('@/pages/customers/CustomerDetail'));
const InvoicesPage = lazy(() => import('@/pages/invoices/InvoicesPage'));
const InvoiceDetail = lazy(() => import('@/pages/invoices/InvoiceDetail'));
const WalkInBill = lazy(() => import('@/pages/invoices/WalkInBill'));
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage'));
const ExpenseClaimsPage = lazy(() => import('@/pages/expenses/ExpenseClaimsPage'));
const ShareLocation = lazy(() => import('@/pages/public/ShareLocation'));
const BooksPage = lazy(() => import('@/pages/books/BooksPage'));
const AssetsPage = lazy(() => import('@/pages/assets/AssetsPage'));
const AssetDetail = lazy(() => import('@/pages/assets/AssetDetail'));
const AccountsPage = lazy(() => import('@/pages/accounts/AccountsPage'));
const CashCloseDetail = lazy(() => import('@/pages/accounts/CashCloseDetail'));
const AccountsOverview = lazy(() => import('@/pages/accounts/AccountsOverview'));
const ReceivablesPage = lazy(() => import('@/pages/accounts/ReceivablesPage'));
const ReceiptsPage = lazy(() => import('@/pages/accounts/ReceiptsPage'));
const CashBankPage = lazy(() => import('@/pages/accounts/CashBankPage'));
const ProfitLossPage = lazy(() => import('@/pages/accounts/ProfitLossPage'));
const HrToday = lazy(() => import('@/pages/hr/HrToday'));
const AttendanceRegister = lazy(() => import('@/pages/hr/AttendanceRegister'));
const LeaveRequests = lazy(() => import('@/pages/hr/LeaveRequests'));
const EmployeesPage = lazy(() => import('@/pages/hr/EmployeesPage'));
const PayrollPage = lazy(() => import('@/pages/hr/PayrollPage'));
const PayrollRunDetail = lazy(() => import('@/pages/hr/PayrollRunDetail'));
const MyHr = lazy(() => import('@/pages/hr/MyHr'));
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'));
const TeamPage = lazy(() => import('@/pages/users/TeamPage'));
const TeamMember = lazy(() => import('@/pages/users/TeamMember'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));

const TechHome = lazy(() => import('@/pages/tech/TechHome'));
const TechJobs = lazy(() => import('@/pages/tech/TechJobs'));
const TechJobDetail = lazy(() => import('@/pages/tech/TechJobDetail'));
const TechCash = lazy(() => import('@/pages/tech/TechCash'));
const TechParts = lazy(() => import('@/pages/tech/TechParts'));

const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'));
const TenantsPage = lazy(() => import('@/pages/admin/TenantsPage'));
const PlansPage = lazy(() => import('@/pages/admin/PlansPage'));

const PortalLogin = lazy(() => import('@/pages/portal/PortalLogin'));
const PortalApp = lazy(() => import('@/pages/portal/PortalApp'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

const NOT_OFFICE: Role[] = ['super_admin', 'technician', 'customer'];

/**
 * Pages are opened by permission (`ability`, any of several), so every office role – including ones added later –
 * reaches exactly the screens its permissions allow. `office` limits a page to office staff (not the technician app).
 */
function RequireAuth({ roles, ability, office, children }: { roles?: Role[]; ability?: string | string[]; office?: boolean; children: ReactNode }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.must_change_password) return <ForcePasswordChange />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  if (office && NOT_OFFICE.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  if (ability && !(Array.isArray(ability) ? ability : [ability]).some((a) => can(a))) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

/** Office page guarded by a permission. */
function Office({ ability, children }: { ability: string | string[]; children: ReactNode }) {
  return <RequireAuth office ability={ability}>{children}</RequireAuth>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return <Navigate to={homePath(user)} replace />;
}


/** /accounts/:id used to be a cash close; send old bookmarks to its new address. */
function LegacyCashClose() {
  const { pathname } = useLocation();
  const id = pathname.split('/').pop();
  return <Navigate to={/^\d+$/.test(id ?? '') ? `/accounts/cash-close/${id}` : '/accounts'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster />
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pay/:token" element={<PayInvoice />} />
            <Route path="/share-location/:token" element={<ShareLocation />} />
            <Route path="/portal/:slug/login" element={<PortalLogin />} />
            <Route path="/portal/:slug/*" element={<PortalApp />} />

            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route path="/profile" element={<ProfilePage />} />

              <Route path="/dashboard" element={<Office ability="dashboard.view"><Dashboard /></Office>} />
              <Route path="/jobs" element={<Office ability="jobs.view"><JobsPage /></Office>} />
              <Route path="/jobs/new" element={<Office ability="jobs.manage"><JobCreate /></Office>} />
              <Route path="/jobs/:id" element={<Office ability="jobs.view"><JobDetail /></Office>} />
              <Route path="/customers" element={<Office ability="customers.view"><CustomersPage /></Office>} />
              <Route path="/customers/:id" element={<Office ability="customers.view"><CustomerDetail /></Office>} />
              <Route path="/invoices" element={<Office ability="invoices.view"><InvoicesPage /></Office>} />
              <Route path="/invoices/walk-in/new" element={<Office ability="billing.walkin"><WalkInBill /></Office>} />
              <Route path="/invoices/:id" element={<RequireAuth ability="invoices.view"><InvoiceDetail /></RequireAuth>} />
              {/* Accounts (v2.1) */}
              <Route path="/accounts" element={<Office ability="accounts.view"><AccountsOverview /></Office>} />
              <Route path="/accounts/receivables" element={<Office ability="accounts.view"><ReceivablesPage /></Office>} />
              <Route path="/accounts/receipts" element={<Office ability="payments.record"><ReceiptsPage /></Office>} />
              <Route path="/accounts/expenses" element={<Office ability="expenses.manage"><ExpensesPage /></Office>} />
              <Route path="/accounts/expense-claims" element={<Office ability="expenses.manage"><ExpenseClaimsPage /></Office>} />
              <Route path="/accounts/cash-bank" element={<Office ability="accounts.view"><CashBankPage /></Office>} />
              <Route path="/accounts/books" element={<Office ability="accounts.view"><BooksPage /></Office>} />
              <Route path="/accounts/profit-loss" element={<Office ability="accounts.view"><ProfitLossPage /></Office>} />
              <Route path="/accounts/cash-close" element={<Office ability="cash.verify"><AccountsPage /></Office>} />
              <Route path="/accounts/cash-close/:id" element={<Office ability="cash.verify"><CashCloseDetail /></Office>} />
              {/* Pre-2.1 links */}
              <Route path="/accounts/:id" element={<LegacyCashClose />} />
              <Route path="/expenses" element={<Navigate to="/accounts/expenses" replace />} />
              <Route path="/books" element={<Navigate to="/accounts/books" replace />} />

              {/* HR (v2.1) */}
              <Route path="/hr" element={<Office ability="hr.view"><HrToday /></Office>} />
              <Route path="/hr/attendance" element={<Office ability="hr.view"><AttendanceRegister /></Office>} />
              <Route path="/hr/leave" element={<Office ability="leave.approve"><LeaveRequests /></Office>} />
              <Route path="/hr/employees" element={<Office ability="payroll.manage"><EmployeesPage /></Office>} />
              <Route path="/hr/payroll" element={<Office ability="payroll.manage"><PayrollPage /></Office>} />
              <Route path="/hr/payroll/:id" element={<Office ability="payroll.manage"><PayrollRunDetail /></Office>} />
              <Route path="/me" element={<Office ability="self.service"><MyHr /></Office>} />
              <Route path="/inventory" element={<Office ability="inventory.view"><InventoryPage /></Office>} />
              <Route path="/assets" element={<Office ability="assets.view"><AssetsPage /></Office>} />
              <Route path="/assets/:id" element={<Office ability="assets.view"><AssetDetail /></Office>} />
              <Route path="/reports" element={<Office ability="reports.view"><ReportsPage /></Office>} />
              <Route path="/team" element={<Office ability="users.view"><TeamPage /></Office>} />
              <Route path="/team/:id" element={<Office ability="users.view"><TeamMember /></Office>} />
              <Route path="/settings" element={<Office ability="settings.manage"><SettingsPage /></Office>} />

              <Route path="/tech" element={<RequireAuth roles={['technician']}><TechHome /></RequireAuth>} />
              <Route path="/tech/jobs" element={<RequireAuth roles={['technician']}><TechJobs /></RequireAuth>} />
              <Route path="/tech/jobs/:id" element={<RequireAuth roles={['technician']}><TechJobDetail /></RequireAuth>} />
              <Route path="/tech/cash" element={<RequireAuth roles={['technician']}><TechCash /></RequireAuth>} />
              <Route path="/tech/parts" element={<RequireAuth roles={['technician']}><TechParts /></RequireAuth>} />
              <Route path="/tech/me" element={<RequireAuth roles={['technician']}><MyHr /></RequireAuth>} />

              <Route path="/admin" element={<RequireAuth roles={['super_admin']}><AdminOverview /></RequireAuth>} />
              <Route path="/admin/tenants" element={<RequireAuth roles={['super_admin']}><TenantsPage /></RequireAuth>} />
              <Route path="/admin/plans" element={<RequireAuth roles={['super_admin']}><PlansPage /></RequireAuth>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you are looking for doesn't exist or has moved.</p>
      <a href="/" className="mt-6 text-sm font-medium text-brand-700 hover:underline">
        Go to home
      </a>
    </div>
  );
}
