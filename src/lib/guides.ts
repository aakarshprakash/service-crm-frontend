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
    id: 'invoices',
    pattern: '/invoices',
    title: 'Invoices',
    intro: 'Invoices are created automatically when a technician completes a visit that has charges. You don’t create them by hand.',
    points: [
      'Filter by status to find unpaid or partly paid invoices.',
      'Click an invoice to record a payment, send a reminder or download the PDF.',
    ],
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
    pattern: '/accounts/:id',
    title: 'Verifying a cash close',
    intro: 'Check a technician’s end-of-day cash against what the system expected them to hold.',
    points: [
      'Verify: enter the amount you physically counted. If it differs from what was expected, you must add a remark.',
      'Record deposit: log cash handed to the office or banked. Deposits go against the technician’s latest close only.',
    ],
  },
  {
    id: 'accounts',
    pattern: '/accounts',
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
      'Master data: the dropdown lists used everywhere else, such as complaint types, action taken, products, dealers and branches.',
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
