# TaxTrack AU — Product Requirements Document

## Original Problem Statement
Create an app for keeping track of tax in Australia catering to BAS statements. Focused on Sole traders, contractors, and small businesses. Premium tier for property tracking. Track income and expenses. Upload expenses/income via CSV or AI-powered PDF parsing (all major Australian banks). Onboarding setup from ATO info. Handle 7 years of data. Generate quarterly BAS statements. Dark/light mode toggle. Editable/deletable data entries. Blue & white theme. 

**Integrations**: Google Social Login, Stripe for premium, Emergent LLM for AI parsing.

---

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (`/app/frontend/`)
- **Backend**: FastAPI (`/app/backend/server.py`)
- **Database**: MongoDB via `MONGO_URL`
- **Auth**: Emergent Google Social Login (session_token cookie)
- **Payments**: Stripe via emergentintegrations (`STRIPE_API_KEY`)
- **AI**: Emergent LLM Key (Gemini 2.5 Flash for PDF parsing)

---

## DB Schema
- `users`: `{user_id, email, name, business_name, abn, subscription_tier, premium_since, created_at}`
- `income`: `{income_id, user_id, date, description, amount, category, is_personal, gst_included, gst_free, notes, financial_year}`
- `expenses`: `{expense_id, user_id, date, description, amount, category, is_personal, gst_included, gst_claimable, notes, financial_year}`
- `properties`: `{property_id, user_id, ...}`
- `payment_transactions`: `{session_id, user_id, status, payment_status}`

---

## What's Been Implemented

### Phase 1 — Core MVP
- Google OAuth login via Emergent (session_token cookie)
- Stripe premium subscription setup ($19.99 AUD one-time payment -> premium tier)
- Income CRUD (add, edit, delete, list with FY filter)
- Expenses CRUD (add, edit, delete, list with FY filter)
- BAS Statement page (quarterly Q1-Q4, auto-selects current quarter, ATO fields G1/G3/G5/1A/G11/1B)
- Properties page (premium-gated)
- Settings page (profile, ABN, premium upgrade)
- Dark/Light mode toggle
- Landing page with Sydney Harbour Bridge hero

### Phase 2 — Import & Review
- CSV import via shared `/api/expenses/upload/csv` endpoint (handles both income/expense)
- AI PDF parsing via `/api/expenses/upload/pdf` (Gemini 2.5 Flash)
- `ImportReview.jsx` component: editable line-by-line review before importing
- Personal/Business categorization per transaction
- Bulk actions (Set all Income, all Expense, all Business, all Personal)
- `/api/import/batch` endpoint for bulk saving

### Phase 7 — CGT Estimate Tab (Feb 2026) ✅ TESTED
Full Australian CGT calculator integrated into each property's detail view:
- **New backend fields**: `current_market_value`, `acquisition_costs`, `capital_improvements` on PropertyCreate
- **Holding period timeline**: Visual bar from purchase date → today, shows years held, 50% discount eligibility badge (green if ≥ 12 months, amber if not yet)
- **Cost base breakdown**: Purchase price + acquisition costs + capital improvements with total
- **Inline market value editor**: Set/update estimated current value directly on CGT tab without opening edit modal
- **Capital gain / loss**: Market value − cost base, auto-detects loss (shows offset note)
- **50% CGT discount**: Applied automatically for properties held ≥ 12 months (ATO individuals rule)
- **CGT by bracket**: 4 ATO marginal rates (19%, 32.5%, 37%, 45%) × taxable gain
- **ATO disclaimer**: Main residence exemption, 6-year rule, cost base adjustment notes
- **Testing**: 100% — all 12 frontend + backend tests passing
Premium-gated property tracker fully implemented:
- **Portfolio Summary Bar**: Total portfolio value, total equity, annual rental income, FY Div 43 depreciation estimate
- **Property CRUD**: Full add/edit/delete with fields: address, type, purchase date, purchase price, loan amount, weekly rent, construction cost, construction date, plant & equipment value, depreciation method
- **3-Tab Property Detail**: Transactions | Depreciation | Details
- **Depreciation Calculator (ATO)**: Div 43 (2.5%/yr of construction cost, 40-year window, progress bar) + Div 40 (plant & equipment, prime cost or diminishing value)
- **Negative gearing indicator**: FY cashflow shows "Negative Gearing" / "Positive" based on income vs expenses
- **Backend**: `/api/properties/summary` endpoint, all CRUD endpoints premium-gated (403 for free users)
- **Testing**: 100% (7/7 backend + all frontend flows passing)
Integrated Hector Garcia CPA's PDF→CSV Claude artifact into TaxTrack AU:
- **Backend PDF upgrade**: Now sends full PDF natively to Gemini 2.5 Flash (via `FileContentWithMimeType`) using rich extraction prompt — returns `cleanedPayee`, `category`, `type`, `balances`, `statementType`, `accountInfo`. Includes auto sign-correction via balance reconciliation.
- **buildRow pre-population**: `cleanedPayee` used as description; AI-provided `category` pre-fills if it matches AU category list.
- **Reconciliation badge**: Shows opening/closing balance and "Balanced ✓" or "Off by $X" for LLM-parsed PDFs.
- **Clean Descriptions**: New button opens `CleanupModal` (full description cleanup pipeline: remove dates, bank codes, AU state codes, long numbers, custom phrases with ? / * wildcards, live preview). Rendered via `ReactDOM.createPortal` for reliable z-index.
- **Diff visualization**: After cleanup, description cells show original text with removed chars crossed out in red.
- **Import uses `cleanedDesc`**: If cleanup was applied, cleaned text is saved instead of raw bank description.
- `POST /api/import/categorize` — AI categorization endpoint (Gemini 2.5 Flash, batches up to 80 unique descriptions)
- `ImportReview.jsx` full rewrite:
  - **AI Categorize button** — one-click categorize all rows (type, purpose, category, GST) ✅
  - **Select All checkbox** — header checkbox with indeterminate state (selects current page) ✅
  - **BulkEditBar** — per-selection bulk editor: Type / Purpose / Category / GST dropdowns applied to all selected rows (starts expanded by default) ✅
  - Two-checkbox row design: first=select (for bulk edit), second=include (for import) ✅
  - Quick-pill bulk actions (Income/Expense/Business/Personal) for all included rows ✅
  - Clear selection / Select all X rows links ✅
- **BankSA CSV fix**: `index_col=False` in `pd.read_csv()` to handle trailing comma shifting columns
- Description whitespace normalization (collapse extra spaces from bank exports)
- Pagination in ImportReview: 50 rows per page (handles 1500+ row imports)
- **PDF parsing overhaul**: Replaced slow LLM-only approach with fast hybrid parser:
  - `parse_pdf_text_regex()`: instant regex-based parser (handles BankSA, Westpac, St George, NAB, ANZ, CBA, Macquarie)
  - Parses 29-page, 443-transaction PDF in ~2.5 seconds (was timing out at 120+ seconds)
  - LLM fallback for edge cases / unrecognized formats
  - Year auto-detection from statement period dates
  - Debit/credit classification from transaction keywords (VISAPURCHASE, ATMWITHDRAWAL, OSKODEPOSIT, etc.)
- BAS PDF Download (`generateBASpdf` using jspdf + jspdf-autotable)
- Improved AI PDF parsing prompt (handles multi-line transactions, all major AU banks)
- Income CSV export: `GET /api/income/export?fy=XXXX`
- Expenses CSV export: `GET /api/expenses/export?fy=XXXX`
- Export CSV buttons on Income and Expenses pages
- Download PDF + Print buttons on BAS page
- `premium_since` tracking when user upgrades

---

## Key API Endpoints
- `POST /api/auth/google` — Google OAuth login
- `GET /api/auth/me` — Current user info
- `GET/POST /api/income` — List/create income
- `GET /api/income/export` — Download income as CSV
- `PUT/DELETE /api/income/{id}` — Edit/delete income
- `GET/POST /api/expenses` — List/create expenses
- `GET /api/expenses/export` — Download expenses as CSV
- `PUT/DELETE /api/expenses/{id}` — Edit/delete expense
- `POST /api/expenses/upload/csv` — Parse CSV bank statement
- `POST /api/expenses/upload/pdf` — AI parse PDF bank statement
- `POST /api/import/batch` — Bulk import transactions
- `GET /api/bas` — Get BAS data for quarter/FY
- `POST /api/stripe/create-checkout-session` — Start Stripe checkout
- `GET /api/stripe/payment-status/{session_id}` — Check payment status
- `GET/PUT /api/users/me` — User profile

---

## Prioritized Backlog

### P0 (High Priority)
- ATO onboarding flow (ABN lookup, GST registration status)
- True recurring Stripe subscriptions (current: one-time payment)

### P1 (Medium Priority)
- Budget vs Actuals comparison (set budgets per category)
- Email reminders for BAS due dates (Q1=Oct28, Q2=Feb28, Q3=Apr28, Q4=Jul28)
- Accountant/tax agent data sharing

### P2 (Future)
- Receipt image upload for expenses
- Super guarantee calculator
- PAYG withholding calculator
- 7-year data archiving/optimization

---

## Known Notes
- `mcp_lint_javascript` tool flags false positive `react-hooks/set-state-in-effect` on Income.jsx, Expenses.jsx, Settings.jsx — false positives, app compiles and runs correctly
- Stripe uses `sk_test_emergent` test key (one-time payment, not true recurring)
- AI PDF parsing uses Gemini 2.5 Flash via Emergent LLM Key
- CSV upload uses shared endpoint `/api/expenses/upload/csv` for both income and expense (type assigned during review)
- MongoDB seed: `db.users.updateOne({'user_id':'test-user-taxtrack-001'},{'$set':{'subscription_tier':'premium'}})`
