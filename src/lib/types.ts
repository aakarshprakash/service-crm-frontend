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

export interface Invoice {
  id: number;
  job_id: number;
  customer_id: number;
  invoice_number: string;
  total_service_charge: number;
  total_spare_charge: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  is_credit: boolean;
  generated_at: string;
  customer?: Customer;
  job?: { id: number; crm_call_id: string; status?: JobStatus; technician?: Named | null; visits?: Visit[] };
  branch?: Named | null;
  payments?: Payment[];
  pay_link?: string;
}

export interface Job {
  id: number;
  crm_call_id: string;
  customer_id: number;
  customer_product_id: number | null;
  branch_id: number | null;
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
