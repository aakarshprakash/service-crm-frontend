import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, homePath, useAuth } from '@/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
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

function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
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

const STAFF: Role[] = ['admin', 'coordinator', 'accountant'];
const ACCOUNTS: Role[] = ['admin', 'accountant'];

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
            <Route path="/portal/:slug/login" element={<PortalLogin />} />
            <Route path="/portal/:slug/*" element={<PortalApp />} />

            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route path="/profile" element={<ProfilePage />} />

              <Route path="/dashboard" element={<RequireAuth roles={STAFF}><Dashboard /></RequireAuth>} />
              <Route path="/jobs" element={<RequireAuth roles={STAFF}><JobsPage /></RequireAuth>} />
              <Route path="/jobs/new" element={<RequireAuth roles={['admin', 'coordinator']}><JobCreate /></RequireAuth>} />
              <Route path="/jobs/:id" element={<RequireAuth roles={STAFF}><JobDetail /></RequireAuth>} />
              <Route path="/customers" element={<RequireAuth roles={STAFF}><CustomersPage /></RequireAuth>} />
              <Route path="/customers/:id" element={<RequireAuth roles={STAFF}><CustomerDetail /></RequireAuth>} />
              <Route path="/invoices" element={<RequireAuth roles={STAFF}><InvoicesPage /></RequireAuth>} />
              <Route path="/invoices/walk-in/new" element={<RequireAuth roles={STAFF}><WalkInBill /></RequireAuth>} />
              <Route path="/invoices/:id" element={<RequireAuth roles={[...STAFF, 'technician']}><InvoiceDetail /></RequireAuth>} />
              {/* Accounts (v2.1) */}
              <Route path="/accounts" element={<RequireAuth roles={ACCOUNTS}><AccountsOverview /></RequireAuth>} />
              <Route path="/accounts/receivables" element={<RequireAuth roles={ACCOUNTS}><ReceivablesPage /></RequireAuth>} />
              <Route path="/accounts/receipts" element={<RequireAuth roles={ACCOUNTS}><ReceiptsPage /></RequireAuth>} />
              <Route path="/accounts/expenses" element={<RequireAuth roles={ACCOUNTS}><ExpensesPage /></RequireAuth>} />
              <Route path="/accounts/cash-bank" element={<RequireAuth roles={ACCOUNTS}><CashBankPage /></RequireAuth>} />
              <Route path="/accounts/books" element={<RequireAuth roles={ACCOUNTS}><BooksPage /></RequireAuth>} />
              <Route path="/accounts/profit-loss" element={<RequireAuth roles={ACCOUNTS}><ProfitLossPage /></RequireAuth>} />
              <Route path="/accounts/cash-close" element={<RequireAuth roles={ACCOUNTS}><AccountsPage /></RequireAuth>} />
              <Route path="/accounts/cash-close/:id" element={<RequireAuth roles={ACCOUNTS}><CashCloseDetail /></RequireAuth>} />
              {/* Pre-2.1 links */}
              <Route path="/accounts/:id" element={<LegacyCashClose />} />
              <Route path="/expenses" element={<Navigate to="/accounts/expenses" replace />} />
              <Route path="/books" element={<Navigate to="/accounts/books" replace />} />

              {/* HR (v2.1) */}
              <Route path="/hr" element={<RequireAuth roles={['admin', 'coordinator']}><HrToday /></RequireAuth>} />
              <Route path="/hr/attendance" element={<RequireAuth roles={['admin', 'coordinator']}><AttendanceRegister /></RequireAuth>} />
              <Route path="/hr/leave" element={<RequireAuth roles={['admin', 'coordinator']}><LeaveRequests /></RequireAuth>} />
              <Route path="/hr/employees" element={<RequireAuth roles={ACCOUNTS}><EmployeesPage /></RequireAuth>} />
              <Route path="/hr/payroll" element={<RequireAuth roles={ACCOUNTS}><PayrollPage /></RequireAuth>} />
              <Route path="/hr/payroll/:id" element={<RequireAuth roles={ACCOUNTS}><PayrollRunDetail /></RequireAuth>} />
              <Route path="/me" element={<RequireAuth roles={STAFF}><MyHr /></RequireAuth>} />
              <Route path="/inventory" element={<RequireAuth roles={STAFF}><InventoryPage /></RequireAuth>} />
              <Route path="/assets" element={<RequireAuth roles={STAFF}><AssetsPage /></RequireAuth>} />
              <Route path="/assets/:id" element={<RequireAuth roles={STAFF}><AssetDetail /></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth roles={STAFF}><ReportsPage /></RequireAuth>} />
              <Route path="/team" element={<RequireAuth roles={['admin', 'coordinator']}><TeamPage /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth roles={['admin']}><SettingsPage /></RequireAuth>} />

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
