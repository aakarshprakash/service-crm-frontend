import { matchPath } from 'react-router';
import type { Role } from '@/lib/types';

/**
 * Tutorial-mode page guides. The first entry whose pattern matches the current path wins,
 * so more specific paths (/jobs/new) must come before general ones (/jobs/:id).
 *
 * "Customer is notified" always means: if SMS / WhatsApp is switched on in Settings.
 */
export interface Guide {
  id: string;
  title: string;
  intro: string;
  points: string[];
}

const guides: (Guide & { pattern: string; roles?: Role[] })[] = [
  {
    id: 'dashboard',
    pattern: '/dashboard',
    title: 'Dashboard',
    intro: 'A live snapshot of your service operation.',
    points: [
      'The four counters show jobs by status. Click one to open the job list filtered to that status.',
      'Open means logged but not started; Pending means a visit ended waiting for a part or a revisit.',
      'Low stock lists items at or below their reorder level, so you can restock before a technician runs out.',
      'Technician performance ranks this month’s visits, collections and ratings.',
    ],
  },
  {
    id: 'job-new',
    pattern: '/jobs/new',
    title: 'Logging a new job',
    intro: 'Every complaint becomes one job with its own number, tracked until it’s closed.',
    points: [
      'Search for the customer by name or phone. If they’re new, add them here without leaving the form.',
      'Pick the product the complaint is about, so the technician sees its model, serial and warranty.',
      'Assigning a technician now sends them a push notification. You can also leave it unassigned and assign later.',
      'Service location is filled in from the customer’s PIN code when it matches one. Tick Auto-assign to give the job to the least busy technician who covers that location.',
      'When you save, the customer is sent a job confirmation.',
    ],
  },
  {
    id: 'job-detail',
    pattern: '/jobs/:id',
    roles: ['admin', 'coordinator', 'accountant'],
    title: 'Job details',
    intro: 'Everything about one complaint: who is on it, every visit, and what was charged.',
    points: [
      'Assign sends the technician a push notification and tells the customer who is coming. Reassigning also tells the previous technician.',
      'Reschedule moves the visit time and notifies the technician.',
      'Follow-up call opens a new linked job for the same customer and product, e.g. a second visit.',
      'Cancel closes the job for good and stops any visit in progress. It can’t be undone.',
      'Charges and the invoice fill in automatically when the technician completes the visit.',
    ],
  },
  {
    id: 'jobs',
    pattern: '/jobs',
    title: 'Jobs',
    intro: 'Every complaint is a job that moves Open → In progress → Completed (or Pending / Cancelled).',
    points: [
      'New job logs a complaint for a customer.',
      'Switch between List, Board and Calendar views with the buttons at the top.',
      'Use the status tabs and search (job number, customer or phone) to find a job, then click it to open it.',
    ],
  },
  {
    id: 'customer-detail',
    pattern: '/customers/:id',
    title: 'Customer details',
    intro: 'The customer’s contact details, their products, and every job you’ve done for them.',
    points: [
      'Add product registers an appliance with its serial, purchase date, warranty and dealer. Jobs are logged against a product.',
      'Export data downloads everything held about this customer. The export is recorded in the audit trail.',
      'Delete customer data removes their name, phone, email and address and disables their portal login. This can’t be undone.',
    ],
  },
  {
    id: 'customers',
    pattern: '/customers',
    title: 'Customers',
    intro: 'Your customer list, with the products each one owns.',
    points: [
      'Add customer creates a record. You can also add customers while logging a new job.',
      'Search by name, phone or CRM ID, then click a customer to see their products and service history.',
    ],
  },
  {
    id: 'invoice-detail',
    pattern: '/invoices/:id',
    roles: ['admin', 'coordinator', 'accountant'],
    title: 'Invoice',
    intro: 'The bill for one job, and every payment made against it.',
    points: [
      'Record payment is for money received at the office: cash, UPI, cheque or bank transfer. The balance updates straight away.',
      'When online payments are on and something is still unpaid, Send reminder messages the customer a pay link and Copy link lets you share it yourself.',
      'PDF downloads the invoice to print or share.',
    ],
  },
  {
    id: 'walk-in-bill',
    pattern: '/invoices/walk-in/new',
    title: 'Walk-in bill',
    intro: 'For customers who come to your service centre: a repair done at the counter, or parts bought over the counter.',
    points: [
      'Enter the customer’s phone and name. If the phone already belongs to a customer, the bill goes on their record instead of creating a duplicate.',
      'Add a Service line for labour, and a Part line for each spare sold. Parts are taken out of the branch’s stock when you save.',
      'Choose how they paid. Pick Credit (pay later) to leave the whole amount due; collect it later from the invoice.',
      'If anything fails (not enough stock, a missing reference), nothing is saved, so you can fix it and try again.',
    ],
  },
  {
    id: 'invoices',
    pattern: '/invoices',
    title: 'Invoices',
    intro: 'Job invoices are created automatically when a technician completes a visit that has charges. Walk-in bills are made with New walk-in bill.',
    points: [
      'Filter by status to find unpaid or partly paid invoices, or by type to see only walk-in bills.',
      'Click an invoice to record a payment, send a reminder or download the PDF.',
    ],
  },
  {
    id: 'asset-detail',
    pattern: '/assets/:id',
    title: 'An asset',
    intro: 'Everything about one tool, vehicle or device, and everyone who has held it.',
    points: [
      'Issue hands it to a technician; it then shows under My assets in their app.',
      'Take back records the condition it came back in. Choose Send for repair or Lost if that’s what happened.',
      'Change status is for assets nobody holds, e.g. back from repair or retired.',
    ],
  },
  {
    id: 'assets',
    pattern: '/assets',
    title: 'Assets',
    intro: 'Company-owned tools, vehicles and devices: things that are issued and returned, not used up like spare parts.',
    points: [
      'The tabs show how many assets are available, issued, under repair, lost or retired.',
      'Filter by Held by to see everything one technician has, e.g. before they leave the company.',
      'Click an asset to issue it, take it back or see its history.',
    ],
  },
  {
    id: 'expenses',
    pattern: '/accounts/expenses',
    title: 'Expenses',
    intro: 'Record everything the business spends, so Books can show your real profit.',
    points: [
      'Pick a category for each expense. Add or rename categories in Settings → Master data.',
      'Link an expense to a staff member (e.g. their salary or fuel) or a branch if you want to report on it later.',
      'Click a row to edit it.',
    ],
  },
  {
    id: 'books',
    pattern: '/accounts/books',
    title: 'Day book',
    intro: 'Every payment received and every expense paid, in order, for the period you choose.',
    points: [
      'Income is payments actually received, on job invoices and walk-in bills. Unpaid invoices are not counted until they are paid.',
      'Daily income vs expenses charts the same period day by day.',
      'Export it from Reports → Day Book.',
    ],
  },
  {
    id: 'accounts-home',
    pattern: '/accounts',
    title: 'Accounts',
    intro: 'Your business money at a glance. Everything is on a cash basis: income counts when it is received.',
    points: [
      'Cash in hand and Bank & UPI are running balances: set your opening balances once under Cash & bank.',
      'Receivable is what customers still owe; click it to see who and for how long.',
      'Cash with technicians is money collected in the field but not yet handed in at the daily cash close.',
    ],
  },
  {
    id: 'receivables',
    pattern: '/accounts/receivables',
    title: 'Receivables',
    intro: 'Customers who owe you money, oldest debts highlighted.',
    points: [
      'Aging is counted from the invoice date: 0–30, 31–60, 61–90 and over 90 days.',
      'Click a customer to open their unpaid invoices, then record a payment, send a reminder or show a UPI QR.',
    ],
  },
  {
    id: 'receipts',
    pattern: '/accounts/receipts',
    title: 'Receipts',
    intro: 'Every payment received: at the office, by technicians in the field and online.',
    points: ['Filter by method or by who collected it. Export the full register from Reports → Receipts Register.'],
  },
  {
    id: 'cash-bank',
    pattern: '/accounts/cash-bank',
    title: 'Cash & bank',
    intro: 'The cash book and bank book, with a running balance after every entry.',
    points: [
      'Cash receipts and cash expenses post to the cash book; UPI, cheque, bank transfer and online ones post to the bank book.',
      'Deposit / withdraw moves money between them when you bank cash or draw it, without counting as income or expense.',
      'Opening balances: what you had on the day you started keeping books here.',
    ],
  },
  {
    id: 'profit-loss',
    pattern: '/accounts/profit-loss',
    title: 'Profit & loss',
    intro: 'Income less expenses for a period, compared with the period just before it.',
    points: ['Salaries appear once a payroll is marked paid. Use Print to save it as a PDF.'],
  },
  {
    id: 'hr-today',
    pattern: '/hr',
    title: 'Attendance today',
    intro: 'Who is in, on leave or absent today, from punches, approved leave and holidays.',
    points: [
      'Punch locations open in Google Maps. An amber chip means the punch was outside the branch geofence.',
      'Use the pencil to correct a day, e.g. someone forgot to punch.',
    ],
  },
  {
    id: 'hr-attendance',
    pattern: '/hr/attendance',
    title: 'Attendance register',
    intro: 'The month at a glance: one row per person, one column per day.',
    points: [
      'Click a day to mark it present, half day or absent. Manual entries are underlined.',
      'Once payroll for the month is finalized, its attendance is locked.',
    ],
  },
  {
    id: 'hr-leave',
    pattern: '/hr/leave',
    title: 'Leave',
    intro: 'Approve or reject leave requests. Staff are notified either way.',
    points: ['You can’t approve your own leave. Balances shows how much of each type everyone has used this year.'],
  },
  {
    id: 'hr-employees',
    pattern: '/hr/employees',
    title: 'Employees & salary',
    intro: 'The details payroll needs: monthly salary, salary components, joining date and weekly off.',
    points: [
      'Monthly gross is the full-month pay before deductions. Components (HRA, PF, professional tax…) only change how the payslip is itemised.',
      'Staff without a salary are left out of payroll.',
    ],
  },
  {
    id: 'hr-payroll',
    pattern: '/hr/payroll',
    title: 'Payroll',
    intro: 'Run payroll once a month is over: draft → finalize → mark as paid.',
    points: [
      'Loss of pay = gross ÷ days in the month × (absent days + unpaid leave). Weekly offs, holidays and paid leave are paid.',
      'Marking a payroll paid records each salary as an expense, so it shows in Accounts.',
    ],
  },
  {
    id: 'my-hr',
    pattern: '/me',
    title: 'My HR',
    intro: 'Punch in and out, see your attendance, apply for leave and download payslips.',
    points: ['Weekly offs and holidays inside your leave dates aren’t counted against your balance.'],
  },
  {
    id: 'tech-me',
    pattern: '/tech/me',
    title: 'My HR',
    intro: 'Your attendance calendar, leave and payslips.',
    points: ['Apply for leave here; your manager gets a notification.'],
  },
  {
    id: 'profile',
    pattern: '/profile',
    title: 'Your profile',
    intro: 'Your own sign-in details. Changes here only affect you.',
    points: [
      'Update your name and contact details, or change your password.',
      'If you see Two-factor authentication, turn it on: signing in will then also need a code from an authenticator app on your phone.',
    ],
  },
  {
    id: 'cash-close-detail',
    pattern: '/accounts/cash-close/:id',
    title: 'Verifying a cash close',
    intro: 'Check a technician’s end-of-day cash against what the system expected them to hold.',
    points: [
      'Verify: enter the amount you physically counted. If it differs from what was expected, you must add a remark.',
      'Record deposit: log cash handed to the office or banked. Deposits go against the technician’s latest close only.',
    ],
  },
  {
    id: 'accounts',
    pattern: '/accounts/cash-close',
    title: 'Daily cash close',
    intro: 'At the end of each day technicians confirm the cash and cheques they collected; accounts then verifies them.',
    points: [
      'Submitted closes are waiting for you. Open one to verify the amount and record the deposit.',
      'Close cash on behalf of a technician submits a close for them, e.g. when they forgot. It skips the strict-order rule.',
      'Cash in hand shows what each technician is holding right now.',
    ],
  },
  {
    id: 'inventory',
    pattern: '/inventory',
    title: 'Inventory',
    intro: 'Spares and consumables, stocked per branch.',
    points: [
      'Stock in records a purchase from a supplier into a branch.',
      'Transfer moves stock between branches.',
      'Adjust corrects a count after damage, loss or a stock-take. The reason is kept in Movements.',
      'Stock goes down on its own when a technician adds a part to a visit. You don’t need to deduct it.',
    ],
  },
  {
    id: 'reports',
    pattern: '/reports',
    title: 'Reports',
    intro: 'Pick a report, set the date range and branch, then view it or export it.',
    points: [
      'Excel and PDF download the report as shown.',
      'Very large reports are built in the background. You’re notified when they’re ready, and they’re kept in My exports for 7 days.',
    ],
  },
  {
    id: 'team',
    pattern: '/team',
    title: 'Team',
    intro: 'Everyone who can sign in to your company, and the role that decides what they can see and do.',
    points: [
      'Add team member sends them an email invitation to set their own password.',
      'Resend invite sends the invitation again, for anyone who hasn’t accepted it yet.',
      'Deactivate blocks sign-in straight away, including on the technician app. Their past work stays on record.',
    ],
  },
  {
    id: 'settings',
    pattern: '/settings',
    title: 'Settings',
    intro: 'Company-wide settings. Only admins can see this page.',
    points: [
      'Company: your name, address, GSTIN and logo, as printed on invoices.',
      'Preferences: online payments, the daily cash close rule, customer portal, SMS / WhatsApp updates, job and invoice numbering, and this tutorial mode.',
      'Master data: the dropdown lists used everywhere else, such as complaint types, products, branches (with their attendance geofence), UPI accounts, leave types and holidays.',
      'Message templates: the wording of every SMS / WhatsApp message customers receive.',
    ],
  },
  {
    id: 'tech-job',
    pattern: '/tech/jobs/:id',
    title: 'Working a job',
    intro: 'Start the visit when you arrive, record what you did, and complete it before you leave.',
    points: [
      'Start service needs your location for an on-site visit. You can only have one visit running at a time.',
      'Add every part you use. It’s taken off your branch’s stock and added to the customer’s bill.',
      'Take photos of the unit, the serial number and the bill. They’re saved on the job.',
      'Complete: pick the action taken, enter the charges and what the customer paid. The invoice is created and the customer is sent it.',
      'If you need a part, close the visit as Pending so the job can be revisited.',
    ],
  },
  {
    id: 'tech-jobs',
    pattern: '/tech/jobs',
    title: 'My jobs',
    intro: 'Every job assigned to you, grouped by status. Tap one to open it.',
    points: [],
  },
  {
    id: 'tech-cash',
    pattern: '/tech/cash',
    title: 'End-of-day cash',
    intro: 'Before you finish, confirm the cash and cheques you’re holding.',
    points: [
      'The app shows what you should be holding, from today’s collections plus anything not yet handed in.',
      'If what you have is different, explain why. Accounts will check it.',
      'Days must be closed in order. If an earlier day is still open, close that one first.',
    ],
  },
  {
    id: 'tech-parts',
    pattern: '/tech/parts',
    title: 'Parts',
    intro: 'Stock available at your branch. Check here before you promise a customer a part.',
    points: [],
  },
  {
    id: 'tech-home',
    pattern: '/tech',
    title: 'Your day',
    intro: 'Your jobs for today and anything overdue.',
    points: [
      'Punch in when you start work and punch out when you finish. The office sees who is on duty when assigning jobs.',
      'Tap a job to open it and start the service.',
    ],
  },
];

export function guideFor(pathname: string, role: Role): Guide | null {
  const g = guides.find((g) => matchPath(g.pattern, pathname) && (!g.roles || g.roles.includes(role)));
  return g ? { id: g.id, title: g.title, intro: g.intro, points: g.points } : null;
}
