export type Role = 'super_admin' | 'admin' | 'coordinator' | 'accountant' | 'technician' | 'customer';
export type JobStatus = 'open' | 'in_progress' | 'pending' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';
export type PaymentMethod = 'cash' | 'upi' | 'cheque' | 'bank_transfer' | 'credit' | 'online';

export interface TenantInfo {
  id: number;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  currency: string;
  trial_ends_at: string | null;
  online_payments: boolean;
  portal_enabled: boolean;
  tutorial_mode: boolean;
  require_signature?: boolean;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  role_label: string;
  branch_id: number | null;
  customer_id: number | null;
  punch_status: 'in' | 'out';
  punched_at: string | null;
  two_factor_enabled: boolean;
  abilities: string[];
  impersonating: boolean;
  tenant: TenantInfo | null;
}

export interface Named {
  id: number;
  name: string;
}

export interface Customer {
  id: number;
  crm_id: string | null;
  name: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  branch_id: number | null;
  branch?: Named | null;
  jobs_count?: number;
  products?: CustomerProduct[];
  created_at: string;
}

export interface CustomerProduct {
  id: number;
  customer_id: number;
  product_id: number | null;
  serial_no: string | null;
  outdoor_serial_no: string | null;
  purchase_date: string | null;
  warranty_type: string | null;
  warranty_expiry: string | null;
  dealer_id: number | null;
  under_warranty?: boolean;
  product?: { id: number; model_name: string; brand?: Named | null; category?: Named | null } | null;
  dealer?: Named | null;
}

export interface Visit {
  id: number;
  signer_name?: string | null;
  signed_at?: string | null;
  job_id: number;
  technician_id: number;
  visit_date: string;
  service_type: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status: string;
  action_taken_id: number | null;
  service_summary: string | null;
  labour_charge: number;
  spare_charge: number;
  total_charge: number;
  payment_method: PaymentMethod | null;
  amount_collected: number;
  location_lat: number | null;
  location_lng: number | null;
  technician?: Named;
  action_taken?: Named | null;
  assisted_staff?: Named | null;
  inventory_usage?: Usage[];
  images?: JobImage[];
  job?: { id: number; crm_call_id: string };
}

export interface Usage {
  id: number;
  item_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  item?: { id: number; code: string; name: string; type: string; unit_of_measure: string };
}

export interface JobImage {
  id: number;
  job_visit_id: number | null;
  type: string;
  url: string;
  original_name: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  method: PaymentMethod;
  receipt_number: string | null;
  reference_no: string | null;
  status: string;
  paid_at: string | null;
  remarks: string | null;
  collector?: Named | null;
  cash_close_id: number | null;
}

export interface InvoiceItem {
  id: number;
  type: 'service' | 'part';
  item_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  item?: { id: number; code: string; name: string; unit_of_measure: string } | null;
}

export interface Invoice {
  id: number;
  job_id: number | null;
  source: 'job' | 'walk_in';
  customer_id: number;
  invoice_number: string;
  total_service_charge: number;
  total_spare_charge: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  is_credit: boolean;
  notes: string | null;
  generated_at: string;
  customer?: Customer;
  creator?: Named | null;
  items?: InvoiceItem[];
  job?: { id: number; crm_call_id: string; status?: JobStatus; technician?: Named | null; visits?: Visit[] };
  branch?: Named | null;
  payments?: Payment[];
  pay_link?: string;
  upi?: { account_id: number; name: string; vpa: string; payee_name: string; amount: number; link: string } | null;
}

export interface Job {
  id: number;
  crm_call_id: string;
  customer_id: number;
  customer_product_id: number | null;
  branch_id: number | null;
  service_location_id: number | null;
  complaint_type_id: number | null;
  complaint_summary_id: number | null;
  complaint_details: string | null;
  priority: Priority;
  call_type: string;
  status: JobStatus;
  service_type: string | null;
  scheduled_at: string | null;
  assigned_technician_id: number | null;
  parent_job_id: number | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  call_age_days: number | null;
  customer?: Customer;
  customer_product?: CustomerProduct | null;
  branch?: Named | null;
  service_location?: Named | null;
  complaint_type?: Named | null;
  complaint_summary?: Named | null;
  technician?: (Named & { phone?: string }) | null;
  creator?: Named | null;
  visits?: Visit[];
  images?: JobImage[];
  status_history?: { id: number; status: JobStatus; remarks: string | null; changed_at: string; user?: Named | null }[];
  invoice?: Invoice | null;
  review?: { rating: number; comment: string | null } | null;
  parent?: { id: number; crm_call_id: string; status: JobStatus } | null;
  follow_ups?: { id: number; crm_call_id: string; status: JobStatus; scheduled_at: string | null }[];
}

export interface StaffUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: 'active' | 'inactive' | 'invited';
  branch_id: number | null;
  branch?: Named | null;
  service_locations?: Named[];
  punch_status: 'in' | 'out';
  last_login_at: string | null;
}

export interface InventoryItem {
  id: number;
  code: string;
  name: string;
  type: 'spare' | 'consumable';
  category: string | null;
  unit_of_measure: string;
  unit_price: number;
  reorder_level: number;
  is_active: boolean;
  stock_total?: number | string | null;
}

export interface Lookups {
  branches: Named[];
  brands: Named[];
  categories: Named[];
  products: { id: number; model_name: string; brand_id: number | null; category_id: number | null; brand?: Named | null }[];
  dealers: Named[];
  complaint_types: Named[];
  complaint_summaries: { id: number; name: string; complaint_type_id: number | null }[];
  action_taken_options: Named[];
  expense_categories: Named[];
  service_locations: { id: number; name: string; city: string | null; pincodes: string | null }[];
  upi_accounts: UpiAccount[];
  leave_types: LeaveType[];
}

export interface UpiAccount {
  id: number;
  name: string;
  vpa: string;
  payee_name: string;
  branch_id: number | null;
  is_default: boolean;
}

export interface LeaveType {
  id: number;
  name: string;
  code: string | null;
  annual_quota: number;
  is_paid: boolean;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  leave_type_id: number | null;
  from_date: string;
  to_date: string;
  half_day: boolean;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  user?: Named & { role?: Role };
  type?: Named & { code?: string | null };
  decider?: Named | null;
}

export interface LeaveBalance {
  leave_type: { id: number; name: string; code: string | null; is_paid: boolean };
  quota: number;
  used: number;
  pending: number;
  remaining: number | null;
}

export type DayStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'unpaid_leave' | 'holiday' | 'weekly_off' | 'not_joined' | 'future';

export interface AttendanceDay {
  date?: string;
  status: DayStatus;
  code: string;
  in: string | null;
  out: string | null;
  minutes: number;
  outside: boolean;
  leave_type?: string | null;
  holiday?: string | null;
  adjusted: boolean;
  note?: string | null;
}

export interface AttendanceSummary {
  present: number;
  half_days: number;
  absent: number;
  paid_leave: number;
  unpaid_leave: number;
  holidays: number;
  weekly_offs: number;
  not_joined: number;
  minutes: number;
}

export interface SalaryComponent {
  name: string;
  type: 'earning' | 'deduction';
  amount: number;
}

export interface EmployeeProfile {
  id: number;
  user_id: number;
  employee_code: string | null;
  designation: string | null;
  department: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  monthly_salary: number;
  components: SalaryComponent[] | null;
  weekly_offs: number[] | null;
  bank_name: string | null;
  bank_account: string | null;
  ifsc: string | null;
  pan: string | null;
  uan: string | null;
}

export interface Payslip {
  id: number;
  payroll_run_id: number;
  user_id: number;
  days_in_month: number;
  working_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  holidays: number;
  weekly_offs: number;
  lop_days: number;
  gross: number;
  earnings: { name: string; amount: number }[] | null;
  deductions: { name: string; amount: number }[] | null;
  lop_amount: number;
  bonus: number;
  other_deduction: number;
  net_pay: number;
  note: string | null;
  user?: Named & { role?: Role; branch?: Named | null };
  run?: { id: number; month: string; status: string; paid_at: string | null };
}

export interface PayrollRun {
  id: number;
  month: string;
  status: 'draft' | 'finalized' | 'paid';
  total_gross: number;
  total_deductions: number;
  total_net: number;
  finalized_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  payslips_count?: number;
  creator?: Named | null;
  payslips?: Payslip[];
}

export type AssetStatus = 'available' | 'assigned' | 'under_repair' | 'lost' | 'retired';
export type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';

export interface Asset {
  id: number;
  asset_code: string;
  name: string;
  category: 'tool' | 'vehicle' | 'device' | 'equipment' | 'other';
  brand: string | null;
  model: string | null;
  serial_no: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  warranty_expiry: string | null;
  branch_id: number | null;
  status: AssetStatus;
  condition: AssetCondition;
  assigned_to: number | null;
  notes: string | null;
  holder?: (Named & { phone?: string | null }) | null;
  branch?: Named | null;
  assignments?: {
    id: number;
    user?: Named;
    issuer?: Named | null;
    receiver?: Named | null;
    issued_at: string;
    issue_condition: string | null;
    issue_notes: string | null;
    returned_at: string | null;
    return_condition: string | null;
    return_notes: string | null;
  }[];
}

export type ExpenseMethod = 'cash' | 'upi' | 'cheque' | 'bank_transfer';

export interface Expense {
  id: number;
  expense_date: string;
  expense_category_id: number | null;
  amount: number;
  payment_method: ExpenseMethod;
  paid_to: string | null;
  reference_no: string | null;
  description: string | null;
  branch_id: number | null;
  user_id: number | null;
  created_at: string;
  category?: Named | null;
  branch?: Named | null;
  user?: Named | null;
  creator?: Named | null;
}

export interface BooksSummary {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  income_by_method: Record<string, number>;
  income_by_source: { job: number; walk_in: number };
  expense_by_method: Record<string, number>;
  expense_by_category: Record<string, number>;
  cash: { in: number; out: number; net: number };
  series: { date: string; income: number; expense: number }[];
}

export interface DayBookRow {
  at: string;
  kind: string;
  ref: string | null;
  party: string | null;
  details: string | null;
  method: string;
  in: number;
  out: number;
}

export interface CashClose {
  id: number;
  technician_id: number;
  branch_id: number | null;
  close_date: string;
  opening_balance: number;
  total_cash_collected: number;
  total_cheque_collected: number;
  total_digital_collected: number;
  expected_in_hand: number;
  amount_confirmed: number;
  technician_remarks: string | null;
  amount_verified: number | null;
  discrepancy_amount: number;
  discrepancy_remarks: string | null;
  total_deposited: number;
  closing_balance: number;
  status: 'submitted' | 'verified' | 'closed';
  force_closed: boolean;
  submitted_at: string;
  verified_at: string | null;
  technician?: Named & { phone?: string };
  branch?: Named | null;
  verifier?: Named | null;
  deposits?: { id: number; amount: number; deposited_to: string; reference_no: string | null; deposit_date: string; remarks: string | null; recorder?: Named }[];
}

export interface CashSummary {
  date: string;
  technician: Named;
  close: CashClose | null;
  opening_balance: number;
  cash: number;
  cheque: number;
  digital: number;
  credit: number;
  expected_in_hand: number;
  pending_dates: string[];
  payments: {
    id: number;
    receipt_number: string | null;
    method: PaymentMethod;
    amount: number;
    reference_no: string | null;
    paid_at: string;
    invoice_number: string | null;
    call_id: string | null;
    customer: string | null;
  }[];
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string | null;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'quantity' | 'money' | 'date' | 'datetime';
}

export interface ReportData {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, string | number>;
  truncated: boolean;
}
