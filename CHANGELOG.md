# Changelog

## Unreleased

### Added
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
