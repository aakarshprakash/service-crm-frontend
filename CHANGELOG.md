# Changelog

## Unreleased

### Added
- **Security in Employees & salary:** open an employee and the dialog now ends with a Security section: Set temporary password and Email a reset link, with a link to their devices and sessions. Shown to people who can manage users (never for your own account). It is the same component the Team page's Access & security tab uses.
- **Estimates** (Finance → Estimates): make an estimate for a customer with service and part lines, discount and GST, optionally linked to a job and product. Download the PDF, share it on WhatsApp or copy a link the customer can open, then mark it approved or rejected. Open estimates past their last valid day show as expired. A job page lists its estimates and can start one.
- **Warranty on the Jobs list:** a green "Under warranty till …" badge on covered jobs (list and board), and a Warranty filter (under / out of warranty).
- **Customer feedback on jobs:** a completed job shows "Feedback not taken yet" until the Customer Satisfaction Code is entered, the customer rates it on the portal, or the office marks feedback as taken. New quick filter "Feedback pending" on the Jobs list.
- **Download all photos (ZIP)** on the job page, in a folder per photo section.
- **Workforce → Trips:** each technician's day on the road, stop by stop (punches and visits), with the distance between stops, time at each customer and a Google Maps route. Totals per technician for a period.
- **Daily register:** the day in three figures (received, paid, left over), a total line per person, a note when a technician handed cash to the office, "How to read this", and, for today, where the cash is: in the office and with each technician.
- **Permanent delete of test entries** (Settings → Preferences): switched on with the admin's password and off again by itself after 24 hours. While on, an admin can delete a job, a customer, a walk-in bill, a receipt, an expense or an income entry for good, after seeing what will go and typing its number.
- Settings → Technician app: "Keep completed jobs until feedback is taken" and "Leave in the technician app".

### Changed
- **HR is now Workforce** in the menu and across the app; "My HR" is "My attendance & pay". Addresses (`/hr/...`) are unchanged.
- A unit marked in warranty no longer needs a purchase date in the office forms.
- A unit marked in warranty, extended warranty or AMC with no expiry date now counts as covered.
- Requests give up after 30 seconds (45 for saving, 2 minutes for uploads) with a clear message, instead of loading for ever.
- Opening a page for the first time keeps the menu and header in place; a thin line under the header shows when the app is loading or saving.

### Fixed
- A dialog no longer moves the cursor back to its first field while you type in another.
- **Languages:** English, हिन्दी (Hindi) and മലയാളം (Malayalam), switchable from the header, the account menu or the sign-in page; the choice is remembered per browser. Dates and "5 min ago" follow the language; money keeps ₹ Indian grouping. Translated so far: navigation, header, sign-in / password pages, dashboard, all technician screens, My HR, shared controls (tables, pagination, dialogs, search, dropdowns), statuses, payment methods and roles. Other pages fall back to English.
- **Customer signature:** technicians can take the customer's signature on the Summary tab (finger, pen or mouse); shown on the job page and printed on the invoice. Settings → Preferences → **Require customer signature** makes it mandatory before a visit is completed.
- **Expense claims** (Accounts → Expense claims): approve with receipt preview (choose how own-money claims were reimbursed) or reject with a reason; the Expenses page shows how many are waiting.
- **Customer location** card on the job page: paste the location the customer sent on WhatsApp / Google Maps, or "Ask customer" to send a share-location link (SMS / WhatsApp / copy). Public page `/share-location/:token` for the customer.
- **Voice notes** recorded by technicians play on the job page.
- UPI reference marked optional when recording payments and walk-in bills.
- **Searchable dropdown** (`Combobox`) for product model, dealer and action taken; new jobs can add a product the customer owns that isn't on their record yet.

### Changed
- **Servon brand styleboard applied:** Electric Blue `#2563EB` primary, Deep Navy `#0B2545` sidebar, Teal Green `#10B981` accents, Inter + Noto Sans Devanagari / Malayalam, new logo mark, favicon and sign-in page.
- **Sidebar** grouped into Service, Finance, Stock & assets, People, Insights and Administration; collapses to an icon rail on desktop (remembered); new account menu in the header.

## 2.1.0 — 2026-10-06

### Added
- **Accounts menu** with sub-pages: Overview, Receivables (aging), Receipts, Expenses, Cash & bank (cash book, bank book, deposits / withdrawals, opening balances), Day book, Profit & loss, Technician cash close.
- **UPI QR**: “UPI QR” on invoices, on walk-in bills paid by UPI and in the technician’s collect step; QR on the public pay page. UPI accounts, leave types and holidays in Settings → Master data; branch geofence (with “Use my location”).
- **HR menu**: Attendance today, Attendance register (click a day to correct it), Leave requests & balances, Employees & salary, Payroll (run → adjust → finalize → mark paid, payslip PDFs).
- **My HR** for every staff member (technicians under Me): punch in/out, attendance calendar, apply / cancel leave, payslips. Office staff can punch from the header.
- Settings → Preferences: attendance geofence (off / flag / block), technicians exempt by default, require location.
- Earlier missing screens restored: walk-in bills, expenses, books, assets, service locations & auto-assign.
- Version shown in the sidebar, with a “What’s new” dialog once per release.

### Changed
- Sidebar groups (Accounts, HR) expand into sub-menus. Old links (`/expenses`, `/books`, `/accounts/:id`) redirect to their new addresses.
- Visible product name is “Servon”.
