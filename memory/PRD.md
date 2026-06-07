# TaxTrack AU — Product Requirements Document

## Overview
Australian tax tracking web app for sole traders, contractors and small businesses.

**App URL**: https://quicktax-au.preview.emergentagent.com

---

## Architecture
- **Frontend**: React (port 3000), Tailwind CSS, Shadcn UI, Recharts
- **Backend**: FastAPI (port 8001), Python
- **Database**: MongoDB (`test_database`)
- **Auth**: Emergent Google OAuth (cookie-based sessions)
- **Payments**: Stripe (emergentintegrations, key: sk_test_emergent)
- **AI Parsing**: Gemini 2.5 Flash via emergentintegrations (EMERGENT_LLM_KEY)

---

## User Personas
1. **Sole Trader** — individual running a business, needs ABN tracking, quarterly BAS
2. **Contractor/Freelancer** — provides services, tracks invoices and expenses
3. **Small Business Owner** — GST registered, multiple income sources, may own investment property

---

## Core Requirements (Static)
1. Google OAuth login (Emergent-managed)
2. Onboarding wizard (business type, ABN, GST registration)
3. Income CRUD (date, description, amount, GST included/free, category)
4. Expense CRUD (date, description, amount, GST, category)
5. CSV upload (all major Australian bank formats: ANZ, CBA, Westpac, NAB, Macquarie, St George, Bendigo)
6. PDF bank statement upload with AI parsing (Gemini 2.5 Flash)
7. BAS statement generator (quarterly, ATO-compliant fields G1, G3, G5, 1A, G11, 1B, Net GST)
8. 7-year financial history (FY2020–FY2026)
9. Dark/Light mode toggle (persisted in localStorage)
10. All entries editable and deletable
11. Premium subscription via Stripe ($19.99 AUD/month)
12. Property tracking (premium only): multiple properties, rental income, expenses

---

## What's Been Implemented (as of 2026-06-07)

### Backend (server.py)
- Auth: Google OAuth session exchange, /api/auth/me, /api/auth/logout
- User: profile update, subscription status
- Onboarding: save/get onboarding data
- Income: CRUD + financial year filtering
- Expenses: CRUD + CSV upload + PDF AI parsing + bulk import
- BAS: quarterly calculation with ATO fields
- Properties: CRUD + transactions (premium-gated)
- Payments: Stripe checkout, status polling, webhook
- Dashboard: aggregated summary, chart data, recent transactions

### Frontend
- Landing page with hero (Sydney harbour), features, pricing
- AuthCallback (OAuth session handling)
- Onboarding wizard (3 steps)
- Dashboard (summary cards, line chart, recent transactions)
- Income page (CRUD with modal, search, FY filter)
- Expenses page (CRUD, CSV upload, PDF AI parsing with review step)
- BAS Statement page (quarterly calculator with all ATO fields)
- Properties page (premium gate + property/transaction management)
- Settings page (profile, dark mode, subscription upgrade)
- Sidebar navigation with dark/light toggle
- Responsive design (mobile-ready for future app conversion)

---

## Test Credentials
See /app/memory/test_credentials.md

---

## Prioritized Backlog

### P0 (Critical - should be done next)
- [ ] Recurring Stripe subscription (currently one-time payment)
- [ ] PDF parsing error handling improvements for edge cases
- [ ] Export BAS as PDF for printing/lodgement

### P1 (Important)
- [ ] Income CSV import (not just expenses)
- [ ] Tax agent/accountant sharing feature
- [ ] Budget vs actuals comparison
- [ ] Email reminders for BAS due dates

### P2 (Nice to have)
- [ ] Apple/Android app wrapper (Capacitor or React Native)
- [ ] Multi-currency support
- [ ] Receipt image upload for expense verification
- [ ] Super guarantee calculator
- [ ] PAYG withholding calculator

---

## ATO Compliance Notes
- GST rate: 10%
- GST registration threshold: $75,000 annual turnover
- BAS quarters: Q1 Jul-Sep, Q2 Oct-Dec, Q3 Jan-Mar, Q4 Apr-Jun
- Australian financial year: July 1 – June 30
- Individual tax rates (simplified) used for tax estimates
- All ATO info linked to official ato.gov.au sources
