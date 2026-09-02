from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import json
import io
import tempfile
import logging
from datetime import datetime, timezone, date
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

# ── PDF extraction prompt (adapted from Hector Garcia CPA's Claude artifact) ──
EXTRACTION_PROMPT_AU = """Extract every transaction from this Australian bank or credit card statement. Return ONLY this JSON shape — no prose, no markdown, no code fences:
{
  "statementType": "bank",
  "accountInfo": {
    "bankName": null,
    "accountNumberLast4": null,
    "statementPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
  },
  "balances": {
    "beginningBalance": null,
    "endingBalance": null
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "raw description as printed",
      "cleanedPayee": "just the merchant/payee name, no codes or IDs",
      "amount": 0.0,
      "category": "exact category string from list below",
      "type": "debit"
    }
  ]
}
CRITICAL RULES:
1. SIGNS — bank statements: deposits POSITIVE, withdrawals NEGATIVE. Credit card: charges POSITIVE, payments/refunds NEGATIVE. So that beginningBalance + sum(amounts) = endingBalance.
2. DATES — always YYYY-MM-DD. Infer year from statement period if only DD/MM shown.
3. CLEANED PAYEE — strip bank codes, transaction IDs, city/state codes, dates. "VISAPURCHASE WOOLWORTHS 1234 SYDNEY NSW 06/01" → "Woolworths". "OSKO PAYMENT FROM JOHN SMITH" → "John Smith".
4. CATEGORY — use EXACTLY one of these strings:
   INCOME: Services | Product Sales | Consulting | Commission | Rental Income | Interest Income | Government Payment | Other Business Income | Salary/Wages | Interest (Personal) | Dividends | Gifts Received | Other Personal Income
   EXPENSE: Advertising & Marketing | Bank Charges | Business Travel | Car & Vehicle | Computer & Technology | Insurance | Legal & Professional | Motor Vehicle | Office Supplies | Rent & Utilities | Staff & Contractors | Superannuation | Telephone & Internet | Training & Education | Other Business Expenses | Groceries & Food | Entertainment | Personal Travel | Health & Medical | Clothing & Personal Care | Home & Garden | Personal Insurance | Utilities (Personal) | Other Personal Expenses
5. INCLUDE EVERY transaction — do not skip or summarise.
6. Return ONLY the JSON object."""

def repair_and_parse_json(text: str) -> dict:
    """Robust JSON repair — strip fences, trailing commas, close truncated objects."""
    import re as _re
    t = text.strip()
    t = _re.sub(r'^```(?:json)?\s*', '', t, flags=_re.IGNORECASE)
    t = _re.sub(r'```\s*$', '', t, flags=_re.IGNORECASE).strip()
    first_brace = t.find('{')
    if first_brace > 0:
        t = t[first_brace:]
    try:
        return json.loads(t)
    except Exception:
        pass
    repaired = _re.sub(r',(\s*[}\]])', r'\1', t)
    try:
        return json.loads(repaired)
    except Exception:
        pass
    open_braces = repaired.count('{') - repaired.count('}')
    open_brackets = repaired.count('[') - repaired.count(']')
    last_obj = repaired.rfind('},')
    if last_obj > -1 and (open_braces > 0 or open_brackets > 0):
        repaired = repaired[:last_obj + 1]
    closing = ']' * max(0, open_brackets) + '}' * max(0, open_braces)
    try:
        return json.loads(repaired + closing)
    except Exception as e:
        raise ValueError(f"Could not parse model JSON output: {e}")

# ============================================================
# MODELS
# ============================================================

class OnboardingData(BaseModel):
    business_type: str
    business_name: str
    abn: Optional[str] = None
    gst_registered: bool = False
    industry: Optional[str] = None
    business_start_date: Optional[str] = None

class IncomeCreate(BaseModel):
    date: str
    description: str
    amount: float
    gst_included: bool = False
    gst_free: bool = False
    category: str = "Services"
    is_personal: bool = False
    notes: Optional[str] = None

class IncomeUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    gst_included: Optional[bool] = None
    gst_free: Optional[bool] = None
    category: Optional[str] = None
    is_personal: Optional[bool] = None
    notes: Optional[str] = None

class ExpenseCreate(BaseModel):
    date: str
    description: str
    amount: float
    gst_included: bool = False
    gst_claimable: bool = True
    category: str = "Other Business Expenses"
    is_personal: bool = False
    notes: Optional[str] = None

class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    gst_included: Optional[bool] = None
    gst_claimable: Optional[bool] = None
    category: Optional[str] = None
    is_personal: Optional[bool] = None
    notes: Optional[str] = None

class PropertyCreate(BaseModel):
    address: str
    property_type: str = "residential"
    purchase_date: str
    purchase_price: float
    loan_amount: Optional[float] = None
    weekly_rent: Optional[float] = None
    construction_cost: Optional[float] = None
    construction_date: Optional[str] = None
    plant_equipment_value: Optional[float] = None
    depreciation_method: Optional[str] = "prime_cost"
    current_market_value: Optional[float] = None
    acquisition_costs: Optional[float] = None
    capital_improvements: Optional[float] = None
    notes: Optional[str] = None

class PropertyTransactionCreate(BaseModel):
    date: str
    description: str
    amount: float
    transaction_type: str  # "income" or "expense"
    category: str = "Other"
    gst_included: bool = False

class CheckoutRequest(BaseModel):
    origin_url: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    abn: Optional[str] = None
    business_type: Optional[str] = None
    gst_registered: Optional[bool] = None
    industry: Optional[str] = None

# ============================================================
# HELPERS
# ============================================================

def get_fy(date_str: str) -> int:
    """Get Australian financial year for a date string."""
    try:
        d = date.fromisoformat(str(date_str)[:10])
        return d.year + 1 if d.month >= 7 else d.year
    except Exception:
        return datetime.now(timezone.utc).year

def get_quarter_range(quarter: int, fy: int):
    """Get date range for a BAS quarter within a financial year."""
    first_year = fy - 1
    ranges = {
        1: (f"{first_year}-07-01", f"{first_year}-09-30"),
        2: (f"{first_year}-10-01", f"{first_year}-12-31"),
        3: (f"{fy}-01-01", f"{fy}-03-31"),
        4: (f"{fy}-04-01", f"{fy}-06-30"),
    }
    return ranges.get(quarter, ranges[1])

def get_quarter_due_date(quarter: int, fy: int) -> str:
    first_year = fy - 1
    due_dates = {
        1: f"{first_year}-10-28",
        2: f"{fy}-02-28",
        3: f"{fy}-04-28",
        4: f"{fy}-07-28",
    }
    return due_dates.get(quarter, "")

def calculate_bas(income_entries: list, expense_entries: list) -> dict:
    """Calculate BAS fields per ATO guidelines."""
    total_sales = 0
    gst_free_sales = 0
    input_taxed_sales = 0
    taxable_sales = 0
    gst_on_sales = 0

    for e in income_entries:
        amt = e.get("amount", 0)
        total_sales += amt
        if e.get("gst_free"):
            gst_free_sales += amt
        elif e.get("gst_included"):
            taxable_sales += amt
            gst_on_sales += amt / 11
        else:
            gst_free_sales += amt

    total_purchases = 0
    gst_on_purchases = 0
    for e in expense_entries:
        amt = e.get("amount", 0)
        total_purchases += amt
        if e.get("gst_claimable") and e.get("gst_included"):
            gst_on_purchases += amt / 11

    net_gst = gst_on_sales - gst_on_purchases

    return {
        "G1_total_sales": round(total_sales, 2),
        "G3_gst_free_sales": round(gst_free_sales, 2),
        "G4_input_taxed_sales": round(input_taxed_sales, 2),
        "G5_taxable_sales": round(taxable_sales, 2),
        "field_1A_gst_on_sales": round(gst_on_sales, 2),
        "G11_total_purchases": round(total_purchases, 2),
        "field_1B_gst_on_purchases": round(gst_on_purchases, 2),
        "net_gst": round(net_gst, 2),
        "gst_payable": net_gst > 0,
        "gst_refundable": net_gst < 0,
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_premium(user: dict = Depends(get_current_user)):
    if user.get("subscription_tier") != "premium":
        raise HTTPException(status_code=403, detail="Premium subscription required")
    return user

def parse_csv_file(content: bytes) -> list:
    import pandas as pd
    from dateutil import parser as dp

    for enc in ['utf-8', 'latin-1', 'cp1252']:
        try:
            # index_col=False prevents pandas from using Date column as index when trailing comma exists
            df = pd.read_csv(io.BytesIO(content), encoding=enc, index_col=False)
            break
        except Exception:
            continue
    else:
        raise ValueError("Cannot read CSV")

    df.columns = [str(c).strip().lower() for c in df.columns]

    date_col = next((c for c in df.columns if any(x in c for x in ['date', 'posted', 'tran', 'settlement'])), None)
    desc_col = next((c for c in df.columns if any(x in c for x in ['description', 'details', 'narrative', 'payee', 'memo', 'narration', 'reference', 'particulars', 'transaction'])), None)
    amount_col = next((c for c in df.columns if c.strip() == 'amount'), None)
    debit_col = next((c for c in df.columns if any(x in c for x in ['debit', 'withdrawal', 'charge', 'dr '])), None)
    credit_col = next((c for c in df.columns if any(x in c for x in ['credit', 'deposit', 'cr '])), None)

    if not date_col or not desc_col:
        raise ValueError(f"Cannot identify columns. Found: {list(df.columns)}")

    transactions = []
    for _, row in df.iterrows():
        try:
            date_val = str(row[date_col]).strip()
            desc_val = ' '.join(str(row[desc_col]).strip().split())  # Collapse extra whitespace
            if not date_val or date_val == 'nan' or not desc_val or desc_val == 'nan':
                continue
            parsed_date = dp.parse(date_val, dayfirst=True)
            date_str = parsed_date.strftime('%Y-%m-%d')

            if amount_col and amount_col in row:
                raw = str(row[amount_col]).replace(',', '').replace('$', '').strip()
                if raw == 'nan' or raw == '':
                    continue
                amt = float(raw)
                trans_type = "credit" if amt > 0 else "debit"
                amount = abs(amt)
            elif debit_col and credit_col:
                dr = str(row.get(debit_col, '')).replace(',', '').replace('$', '').strip()
                cr = str(row.get(credit_col, '')).replace(',', '').replace('$', '').strip()
                if dr and dr not in ['nan', '-', '', '0.0', '0']:
                    amount = abs(float(dr))
                    trans_type = "debit"
                elif cr and cr not in ['nan', '-', '', '0.0', '0']:
                    amount = abs(float(cr))
                    trans_type = "credit"
                else:
                    continue
            else:
                continue

            # Skip zero-amount transactions
            if amount == 0:
                continue

            transactions.append({
                "date": date_str,
                "description": desc_val,
                "amount": round(amount, 2),
                "type": trans_type,
            })
        except Exception:
            continue

    return transactions

# ============================================================
# AUTH ROUTES
# ============================================================

@api_router.post("/auth/session")
async def process_session(request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    import requests as req
    response = req.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}
    )
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")

    data = response.json()
    email = data["email"]
    name = data["name"]
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "subscription_tier": "free",
            "onboarding_complete": False,
            "business_type": None,
            "business_name": None,
            "abn": None,
            "gst_registered": False,
            "industry": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    expires_at = datetime.now(timezone.utc).replace(microsecond=0)
    from datetime import timedelta
    expires_at = expires_at + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    from fastapi.responses import JSONResponse
    resp = JSONResponse(content={"user": user, "success": True})
    resp.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 3600
    )
    return resp

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    from fastapi.responses import JSONResponse
    resp = JSONResponse(content={"success": True})
    resp.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return resp

# ============================================================
# USER / PROFILE ROUTES
# ============================================================

@api_router.put("/users/profile")
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_data})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated

@api_router.get("/users/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    return {
        "tier": user.get("subscription_tier", "free"),
        "is_premium": user.get("subscription_tier") == "premium"
    }

# ============================================================
# ONBOARDING ROUTES
# ============================================================

@api_router.post("/onboarding")
async def save_onboarding(data: OnboardingData, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "business_type": data.business_type,
            "business_name": data.business_name,
            "abn": data.abn,
            "gst_registered": data.gst_registered,
            "industry": data.industry,
            "business_start_date": data.business_start_date,
            "onboarding_complete": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated

@api_router.get("/onboarding/status")
async def get_onboarding_status(user: dict = Depends(get_current_user)):
    return {"onboarding_complete": user.get("onboarding_complete", False)}

# ============================================================
# INCOME ROUTES
# ============================================================

@api_router.get("/income")
async def list_income(fy: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    if fy:
        query["financial_year"] = fy
    items = await db.income.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return items

@api_router.get("/income/export")
async def export_income_csv(fy: Optional[int] = None, user: dict = Depends(get_current_user)):
    import csv
    query = {"user_id": user["user_id"]}
    if fy:
        query["financial_year"] = fy
    items = await db.income.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Amount", "Category", "Purpose", "GST Included", "GST Free", "Notes", "Financial Year"])
    for item in items:
        writer.writerow([
            item.get("date", ""), item.get("description", ""), item.get("amount", 0),
            item.get("category", ""), "Personal" if item.get("is_personal") else "Business",
            "Yes" if item.get("gst_included") else "No", "Yes" if item.get("gst_free") else "No",
            item.get("notes", ""), item.get("financial_year", ""),
        ])
    output.seek(0)
    fname = f"income-FY{fy}.csv" if fy else "income-all.csv"
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})

@api_router.post("/income")
async def create_income(data: IncomeCreate, user: dict = Depends(get_current_user)):
    income_id = f"inc_{uuid.uuid4().hex[:12]}"
    doc = {
        "income_id": income_id,
        "user_id": user["user_id"],
        "date": data.date,
        "description": data.description,
        "amount": data.amount,
        "gst_included": data.gst_included,
        "gst_free": data.gst_free,
        "category": data.category,
        "is_personal": data.is_personal,
        "financial_year": get_fy(data.date),
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.income.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/income/{income_id}")
async def update_income(income_id: str, data: IncomeUpdate, user: dict = Depends(get_current_user)):
    item = await db.income.find_one({"income_id": income_id, "user_id": user["user_id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Income entry not found")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if "date" in update_data:
        update_data["financial_year"] = get_fy(update_data["date"])
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.income.update_one({"income_id": income_id}, {"$set": update_data})
    updated = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    return updated

@api_router.delete("/income/{income_id}")
async def delete_income(income_id: str, user: dict = Depends(get_current_user)):
    result = await db.income.delete_one({"income_id": income_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Income entry not found")
    return {"success": True}

# ============================================================
# EXPENSE ROUTES
# ============================================================

@api_router.get("/expenses")
async def list_expenses(fy: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    if fy:
        query["financial_year"] = fy
    items = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return items

@api_router.get("/expenses/export")
async def export_expenses_csv(fy: Optional[int] = None, user: dict = Depends(get_current_user)):
    import csv
    query = {"user_id": user["user_id"]}
    if fy:
        query["financial_year"] = fy
    items = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Amount", "Category", "Purpose", "GST Included", "GST Claimable", "Notes", "Financial Year"])
    for item in items:
        writer.writerow([
            item.get("date", ""), item.get("description", ""), item.get("amount", 0),
            item.get("category", ""), "Personal" if item.get("is_personal") else "Business",
            "Yes" if item.get("gst_included") else "No", "Yes" if item.get("gst_claimable") else "No",
            item.get("notes", ""), item.get("financial_year", ""),
        ])
    output.seek(0)
    fname = f"expenses-FY{fy}.csv" if fy else "expenses-all.csv"
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})

@api_router.post("/expenses")
async def create_expense(data: ExpenseCreate, user: dict = Depends(get_current_user)):
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    doc = {
        "expense_id": expense_id,
        "user_id": user["user_id"],
        "date": data.date,
        "description": data.description,
        "amount": data.amount,
        "gst_included": data.gst_included,
        "gst_claimable": data.gst_claimable,
        "category": data.category,
        "is_personal": data.is_personal,
        "financial_year": get_fy(data.date),
        "source": "manual",
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseUpdate, user: dict = Depends(get_current_user)):
    item = await db.expenses.find_one({"expense_id": expense_id, "user_id": user["user_id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Expense entry not found")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if "date" in update_data:
        update_data["financial_year"] = get_fy(update_data["date"])
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.expenses.update_one({"expense_id": expense_id}, {"$set": update_data})
    updated = await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    return updated

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    result = await db.expenses.delete_one({"expense_id": expense_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense entry not found")
    return {"success": True}

@api_router.post("/expenses/upload/csv")
async def upload_csv(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    transactions = parse_csv_file(content)
    return {"transactions": transactions, "count": len(transactions)}

def parse_pdf_text_regex(pages_text: list, statement_year: int) -> list:
    """
    Fast regex-based parser for Australian bank statement text.
    Works for BankSA, St George, Westpac, ANZ, CBA, NAB, Macquarie etc.
    """
    import re

    MONTH_MAP = {'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,
                 'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}

    # Keywords that indicate debits (money out)
    DEBIT_KEYWORDS = re.compile(
        r'WITHDRAWAL|PURCHASE|EFTPOS|WDL|DEBITCARD|BPAY|'
        r'VISAPURCHASE|MASTERCARD|CHEQUE|INTERNETWITHDRAWAL|OSKOWITHDRAWAL|ATMWITHDRAWAL|'
        r'ATMOPERATORFEE|DIRECTDEBIT|PERIODICTRANSFER|FOREIGNCURRENCYCONVERSN|'
        r'VISA\s*PURCHASE|EFTPOS\s*DEBIT|OSKO\s*WITHDRAW|INTERNET\s*WITHDRAW|ATM\s*WITHDRAW',
        re.IGNORECASE
    )
    CREDIT_KEYWORDS = re.compile(
        r'OSKODEPOSIT|INTERNETDEPOSIT|DIRECTCREDIT|DIRECTDEPOSIT|'
        r'SALARY|REFUND|PAYROLL|PENSION|CENTRELINK|JOBSEEKER|REVERSAL|REBATE|'
        r'CREDITINTEREST|OSKO\s*DEPOSIT|INTERNET\s*DEPOSIT|PAYID\s*CREDIT',
        re.IGNORECASE
    )

    # Skip these rows entirely
    SKIP_LINE = re.compile(
        r'SUBTOTAL|CARRIEDFORWARD|OPENINGBALANCE|CLOSINGBALANCE|BALANCE\s*\$|'
        r'TransactionDetails|Date\s+Transaction|AccountSummary|StatementNo|'
        r'Page \d|StatementPeriod|AccountNumber|BSBNumber|CustomerEnquiries|'
        r'TotalCredits|TotalDebits|OpeningBalance|EFFECTIVEDATE',
        re.IGNORECASE
    )

    # Pattern: line starting with DD+MON (no space) or DD space MON
    DATE_LINE = re.compile(
        r'^(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(.+)',
        re.IGNORECASE
    )
    # DD/MM/YYYY or YYYY-MM-DD format  
    ISO_DATE_LINE = re.compile(r'^(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})\s+(.+)')

    # Money pattern: digits with optional comma thousands sep and 2 decimal places
    MONEY_PAT = re.compile(r'([\d,]+\.\d{2})-?')

    # Inline timestamp to strip: "29APR01:51", "28APR16:07"
    TIMESTAMP = re.compile(r'\d{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}:\d{2}', re.IGNORECASE)
    # Date suffix like "23/05/24"
    DATE_SUFFIX = re.compile(r'\d{2}/\d{2}/\d{2,4}')

    transactions = []
    full_text = '\n'.join(pages_text)
    lines = full_text.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line or SKIP_LINE.search(line):
            i += 1
            continue

        # ── DD+MON format (BankSA, Westpac, NAB, St George) ──────────────────
        m = DATE_LINE.match(line)
        if m:
            day, month_str, rest = int(m.group(1)), m.group(2).upper(), m.group(3).strip()
            month_num = MONTH_MAP.get(month_str, 1)
            date_str = f"{statement_year}-{month_num:02d}-{day:02d}"

            # Collect continuation lines (e.g. second line of description)
            desc_parts = [rest]
            j = i + 1
            while j < len(lines) and j < i + 4:  # max 3 continuation lines
                next_line = lines[j].strip()
                if not next_line or DATE_LINE.match(next_line) or SKIP_LINE.search(next_line):
                    break
                if ISO_DATE_LINE.match(next_line):
                    break
                desc_parts.append(next_line)
                j += 1

            full_desc = ' '.join(desc_parts)

            # Extract all money amounts
            numbers = MONEY_PAT.findall(full_desc)
            if not numbers:
                i += 1
                continue

            # Transaction amount = last-but-one if 2+ numbers, else only number
            # Last number = running balance
            amount_str = numbers[-2] if len(numbers) >= 2 else numbers[-1]
            try:
                amount = round(float(amount_str.replace(',', '')), 2)
            except ValueError:
                i += 1
                continue
            if amount <= 0:
                i += 1
                continue

            # Clean the description
            clean = TIMESTAMP.sub('', full_desc)        # strip inline timestamps
            clean = DATE_SUFFIX.sub('', clean)           # strip date refs
            clean = MONEY_PAT.sub('', clean)             # strip all amounts
            clean = re.sub(r'\s+', ' ', clean).strip()  # normalize spaces
            if not clean or len(clean) < 2:
                clean = full_desc.split()[0]

            # Debit vs credit from keywords
            if CREDIT_KEYWORDS.search(clean) or CREDIT_KEYWORDS.search(full_desc):
                trans_type = 'credit'
            elif DEBIT_KEYWORDS.search(clean) or DEBIT_KEYWORDS.search(full_desc):
                trans_type = 'debit'
            else:
                # Check balance sign: if the balance number ends in '-', previous balance was negative → likely debit
                has_neg_balance = bool(re.search(r'[\d,]+\.\d{2}-', full_desc))
                trans_type = 'debit' if has_neg_balance else 'credit'

            transactions.append({"date": date_str, "description": clean, "amount": amount, "type": trans_type})
            i = j
            continue

        # ── DD/MM/YYYY format (CBA, ANZ, Macquarie) ──────────────────────────
        m2 = ISO_DATE_LINE.match(line)
        if m2:
            date_raw, rest = m2.group(1), m2.group(2)
            try:
                from dateutil import parser as dp
                parsed_date = dp.parse(date_raw, dayfirst=True)
                date_str = parsed_date.strftime('%Y-%m-%d')
            except Exception:
                i += 1
                continue

            desc_parts = [rest.strip()]
            j = i + 1
            while j < len(lines) and j < i + 4:
                next_line = lines[j].strip()
                if not next_line or ISO_DATE_LINE.match(next_line) or DATE_LINE.match(next_line):
                    break
                if SKIP_LINE.search(next_line):
                    break
                desc_parts.append(next_line)
                j += 1

            full_desc = ' '.join(desc_parts)
            numbers = MONEY_PAT.findall(full_desc)
            if not numbers:
                i += 1
                continue

            amount_str = numbers[-2] if len(numbers) >= 2 else numbers[-1]
            try:
                amount = round(float(amount_str.replace(',', '')), 2)
            except ValueError:
                i += 1
                continue
            if amount <= 0:
                i += 1
                continue

            clean = MONEY_PAT.sub('', full_desc)
            clean = re.sub(r'\s+', ' ', clean).strip()

            if re.search(r'\bCR\b', full_desc) or CREDIT_KEYWORDS.search(full_desc):
                trans_type = 'credit'
            elif re.search(r'\bDR\b', full_desc) or DEBIT_KEYWORDS.search(full_desc):
                trans_type = 'debit'
            else:
                trans_type = 'debit'

            transactions.append({"date": date_str, "description": clean, "amount": amount, "type": trans_type})
            i = j
            continue

        i += 1

    return transactions


@api_router.post("/expenses/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    import pdfplumber, re

    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # ── Step 1: Extract text from PDF (fast) ───────────────────────────────
        pages_text = []
        statement_year = 2025  # default
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ''
                pages_text.append(t)
            # Detect year from statement period (e.g. "25/04/2024 to 24/10/2024")
            first_text = pages_text[0] if pages_text else ''
            # Look for 4-digit year in a date pattern (prefer statement period dates)
            yr_matches = re.findall(r'(?:StatementPeriod|Period|Statement)\s*\S*?(20\d{2})', first_text, re.IGNORECASE)
            if not yr_matches:
                # Look for year in date patterns like "25/04/2024"
                yr_matches = re.findall(r'\d{2}/\d{2}/(20\d{2})', first_text)
            if not yr_matches:
                # Look for year in "to 24/10/2024" type patterns
                yr_matches = re.findall(r'to\s*\d{2}/\d{2}/(20\d{2})', first_text, re.IGNORECASE)
            if yr_matches:
                statement_year = int(yr_matches[-1])  # use most recent year found

        # ── Step 2: Try fast regex parsing ─────────────────────────────────────
        transactions = parse_pdf_text_regex(pages_text, statement_year)

        # Step 3: If regex found enough transactions, return immediately
        if len(transactions) >= 5:
            seen = set()
            unique = []
            for t in transactions:
                key = (t["date"], t["amount"], t["type"])
                if key not in seen:
                    seen.add(key)
                    unique.append(t)
            unique.sort(key=lambda x: x["date"])
            for t in unique:
                t.setdefault("cleanedPayee", "")
                t.setdefault("category", "")
            return {
                "transactions": unique, "count": len(unique), "method": "regex",
                "balances": None, "statementType": "bank", "accountInfo": {}
            }

        # Step 4: LLM fallback — send full PDF natively to Gemini (no page limit)
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

        pdf_attachment = FileContentWithMimeType(file_path=tmp_path, mime_type="application/pdf")
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="You are a forensic accountant extracting transactions from an Australian bank statement PDF. Return ONLY valid JSON. No prose, no markdown, no code fences."
        ).with_model("gemini", "gemini-2.5-flash")

        response = await chat.send_message(UserMessage(
            text=EXTRACTION_PROMPT_AU,
            file_contents=[pdf_attachment]
        ))

        parsed = repair_and_parse_json(response.strip())

        raw_txns = parsed.get("transactions", [])
        balances = parsed.get("balances") or {}
        statement_type = parsed.get("statementType", "bank")
        account_info = parsed.get("accountInfo") or {}

        # Auto-correct sign convention using balance reconciliation
        begin = float(balances.get("beginningBalance") or 0)
        end = float(balances.get("endingBalance") or 0)
        if begin != 0 or end != 0:
            total = sum(float(t.get("amount", 0)) for t in raw_txns)
            err_as_is = abs(begin + total - end)
            err_flipped = abs(begin - total - end)
            if err_flipped < err_as_is - 0.01:
                for t in raw_txns:
                    t["amount"] = -float(t.get("amount", 0))

        valid = []
        for t in raw_txns:
            try:
                raw_amt = float(t.get("amount", 0))
                amt = round(abs(raw_amt), 2)
                if amt <= 0:
                    continue
                tx_type = "credit" if str(t.get("type", "debit")).lower() == "credit" else "debit"
                valid.append({
                    "date": str(t.get("date", "")),
                    "description": str(t.get("description", "Transaction")),
                    "cleanedPayee": str(t.get("cleanedPayee", "") or ""),
                    "amount": amt,
                    "type": tx_type,
                    "category": str(t.get("category", "") or ""),
                })
            except Exception:
                continue

        return {
            "transactions": valid, "count": len(valid), "method": "llm_native",
            "balances": balances, "statementType": statement_type, "accountInfo": account_info
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

@api_router.post("/expenses/import")
async def import_expenses(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    transactions = body.get("transactions", [])
    imported = []
    for t in transactions:
        try:
            expense_id = f"exp_{uuid.uuid4().hex[:12]}"
            is_personal = t.get("is_personal", False)
            doc = {
                "expense_id": expense_id,
                "user_id": user["user_id"],
                "date": t["date"],
                "description": t.get("description", "Imported transaction"),
                "amount": float(t["amount"]),
                "gst_included": t.get("gst_included", False),
                "gst_claimable": t.get("gst_claimable", not is_personal),
                "category": t.get("category", "Other Business Expenses"),
                "is_personal": is_personal,
                "financial_year": get_fy(t["date"]),
                "source": "import",
                "notes": t.get("notes"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.expenses.insert_one(doc)
            doc.pop("_id", None)
            imported.append(doc)
        except Exception as e:
            logger.warning(f"Failed to import expense: {e}")
    return {"imported": len(imported), "entries": imported}

@api_router.post("/income/import")
async def import_income(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    transactions = body.get("transactions", [])
    imported = []
    for t in transactions:
        try:
            income_id = f"inc_{uuid.uuid4().hex[:12]}"
            doc = {
                "income_id": income_id,
                "user_id": user["user_id"],
                "date": t["date"],
                "description": t.get("description", "Imported transaction"),
                "amount": float(t["amount"]),
                "gst_included": t.get("gst_included", False),
                "gst_free": t.get("gst_free", False),
                "category": t.get("category", "Other Income"),
                "is_personal": t.get("is_personal", False),
                "financial_year": get_fy(t["date"]),
                "source": "import",
                "notes": t.get("notes"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.income.insert_one(doc)
            doc.pop("_id", None)
            imported.append(doc)
        except Exception as e:
            logger.warning(f"Failed to import income: {e}")
    return {"imported": len(imported), "entries": imported}

@api_router.post("/import/batch")
async def batch_import(request: Request, user: dict = Depends(get_current_user)):
    """Unified import: handles both income and expense transactions in one call."""
    body = await request.json()
    transactions = body.get("transactions", [])
    income_imported = 0
    expense_imported = 0

    for t in transactions:
        try:
            import_type = t.get("import_type", "expense")
            is_personal = t.get("is_personal", False)
            d = t["date"]
            desc = t.get("description", "Imported")
            amt = float(t["amount"])

            if import_type == "income":
                doc = {
                    "income_id": f"inc_{uuid.uuid4().hex[:12]}",
                    "user_id": user["user_id"],
                    "date": d, "description": desc, "amount": amt,
                    "gst_included": t.get("gst_included", False),
                    "gst_free": t.get("gst_free", False),
                    "category": t.get("category", "Other Business Income"),
                    "is_personal": is_personal,
                    "financial_year": get_fy(d),
                    "source": "import",
                    "notes": t.get("notes"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.income.insert_one(doc)
                income_imported += 1
            else:
                doc = {
                    "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
                    "user_id": user["user_id"],
                    "date": d, "description": desc, "amount": amt,
                    "gst_included": t.get("gst_included", False),
                    "gst_claimable": t.get("gst_claimable", not is_personal),
                    "category": t.get("category", "Other Business Expenses"),
                    "is_personal": is_personal,
                    "financial_year": get_fy(d),
                    "source": "import",
                    "notes": t.get("notes"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.expenses.insert_one(doc)
                expense_imported += 1
        except Exception as e:
            logger.warning(f"Batch import error: {e}")


@api_router.post("/import/categorize")
async def categorize_transactions(request: Request, user: dict = Depends(get_current_user)):
    """
    AI-powered batch categorization.
    Takes up to 200 transactions, deduplicates by description, calls LLM once,
    then maps results back to all transactions.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    body = await request.json()
    transactions = body.get("transactions", [])  # [{_key, description, type}]
    if not transactions:
        return {"categories": []}

    # ── Build unique description list (max 80 to keep prompt small + fast) ──────
    seen_descs: dict[str, dict] = {}
    for t in transactions:
        desc_key = (t.get("description", "")[:60]).strip().upper()
        if desc_key and desc_key not in seen_descs:
            seen_descs[desc_key] = t

    unique = list(seen_descs.values())[:80]

    lines = "\n".join(
        f'{i+1}. [{t.get("type","expense").upper()}] {t.get("description","")[:60]}'
        for i, t in enumerate(unique)
    )

    categories_list = (
        "EXPENSE BUSINESS: Advertising & Marketing | Bank Charges | Business Travel | Car & Vehicle | "
        "Computer & Technology | Insurance | Legal & Professional | Motor Vehicle | Office Supplies | "
        "Rent & Utilities | Staff & Contractors | Superannuation | Telephone & Internet | "
        "Training & Education | Other Business Expenses\n"
        "EXPENSE PERSONAL: Groceries & Food | Entertainment | Personal Travel | Health & Medical | "
        "Clothing & Personal Care | Home & Garden | Personal Insurance | Utilities (Personal) | Other Personal Expenses\n"
        "INCOME BUSINESS: Services | Product Sales | Consulting | Commission | Rental Income | "
        "Interest Income | Government Payment | Other Business Income\n"
        "INCOME PERSONAL: Salary/Wages | Interest (Personal) | Dividends | Gifts Received | Other Personal Income"
    )

    prompt = (
        "You are an Australian tax accountant. Categorize these bank transactions for BAS/tax purposes.\n\n"
        f"Available categories:\n{categories_list}\n\n"
        "For each numbered transaction return a JSON array with one object per line:\n"
        '[{"idx":1,"type":"expense","is_personal":false,"category":"Bank Charges","gst_included":false}]\n\n'
        "Rules:\n"
        "- type: 'income' or 'expense' (INCOME prefix → income, EXPENSE prefix → expense; use your judgment)\n"
        "- is_personal: true only if clearly personal (groceries, entertainment, clothing, etc.)\n"
        "- category: EXACT string from the category list above\n"
        "- gst_included: true if GST likely applies (most business purchases/sales in AU)\n"
        "- Bank fees/charges → Bank Charges, is_personal=false, gst_included=true\n"
        "- ATM withdrawals → Other Personal Expenses, is_personal=true, gst_included=false\n"
        "- OSKO/Internet deposits → classify by amount & description\n"
        "- Salary/wages/jobseeker → Salary/Wages income, is_personal=true\n\n"
        f"Transactions:\n{lines}\n\n"
        "Return ONLY the JSON array, no markdown, no explanation."
    )

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Australian tax transaction categorizer. Return ONLY valid JSON array."
        ).with_model("gemini", "gemini-2.5-flash")

        response = await chat.send_message(UserMessage(text=prompt))
        text = response.strip()
        if "```" in text:
            import re as _re
            m = _re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
            text = m.group(1).strip() if m else text
        if not text.startswith('['):
            start, end = text.find('['), text.rfind(']') + 1
            if start >= 0 and end > start:
                text = text[start:end]

        ai_results = json.loads(text)  # [{idx, type, is_personal, category, gst_included}]

        # Build mapping: description_key → ai result
        desc_map: dict[str, dict] = {}
        for res in ai_results:
            try:
                idx = int(res.get("idx", 0)) - 1
                if 0 <= idx < len(unique):
                    desc_key = (unique[idx].get("description", "")[:60]).strip().upper()
                    desc_map[desc_key] = res
            except Exception:
                continue

        # Map back to all transactions using description key
        output = []
        for t in transactions:
            desc_key = (t.get("description", "")[:60]).strip().upper()
            ai = desc_map.get(desc_key, {})
            output.append({
                "_key": t.get("_key"),
                "type": ai.get("type", t.get("type", "expense")),
                "is_personal": bool(ai.get("is_personal", False)),
                "category": ai.get("category", "Other Business Expenses"),
                "gst_included": bool(ai.get("gst_included", False)),
            })

        return {"categories": output, "categorized": len(desc_map)}

    except Exception as e:
        logger.error(f"Categorize error: {e}")
        raise HTTPException(status_code=422, detail=f"AI categorization failed: {str(e)}")

# ============================================================
# BAS ROUTES
# ============================================================

@api_router.get("/bas/{fy}/{quarter}")
async def get_bas(fy: int, quarter: int, user: dict = Depends(get_current_user)):
    if quarter not in [1, 2, 3, 4]:
        raise HTTPException(status_code=400, detail="Quarter must be 1-4")

    start_date, end_date = get_quarter_range(quarter, fy)
    income_entries = await db.income.find(
        {"user_id": user["user_id"], "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0}
    ).to_list(10000)

    expense_entries = await db.expenses.find(
        {"user_id": user["user_id"], "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0}
    ).to_list(10000)

    bas = calculate_bas(income_entries, expense_entries)
    due_date = get_quarter_due_date(quarter, fy)

    quarter_names = {1: "Jul-Sep", 2: "Oct-Dec", 3: "Jan-Mar", 4: "Apr-Jun"}
    return {
        "financial_year": fy,
        "quarter": quarter,
        "quarter_name": quarter_names[quarter],
        "period_start": start_date,
        "period_end": end_date,
        "due_date": due_date,
        "gst_registered": user.get("gst_registered", False),
        "bas": bas,
        "income_count": len(income_entries),
        "expense_count": len(expense_entries),
        "total_income": sum(e.get("amount", 0) for e in income_entries),
        "total_expenses": sum(e.get("amount", 0) for e in expense_entries),
    }

# ============================================================
# PROPERTY ROUTES (PREMIUM)
# ============================================================

@api_router.get("/properties")
async def list_properties(user: dict = Depends(require_premium)):
    items = await db.properties.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return items

@api_router.get("/properties/summary")
async def get_portfolio_summary(user: dict = Depends(require_premium)):
    """Aggregated portfolio stats across all properties."""
    props = await db.properties.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    fy = get_fy(datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    fy_start = f"{fy - 1}-07-01"
    fy_end = f"{fy}-06-30"
    
    total_value = sum(p.get("purchase_price", 0) or 0 for p in props)
    total_loans = sum(p.get("loan_amount", 0) or 0 for p in props)
    total_equity = total_value - total_loans
    annual_rent = sum((p.get("weekly_rent", 0) or 0) * 52 for p in props)
    
    # Div 43 depreciation: 2.5%/yr of construction cost
    total_div43 = 0.0
    for p in props:
        cc = p.get("construction_cost") or 0
        cd = p.get("construction_date") or p.get("purchase_date") or ""
        if cc and cd:
            try:
                from datetime import date as _date
                build_date = _date.fromisoformat(cd)
                today = _date.today()
                years_held = (today - build_date).days / 365.25
                if years_held < 40:
                    total_div43 += cc * 0.025
            except Exception:
                pass
    
    # FY transactions summary
    txns = await db.property_transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": fy_start, "$lte": fy_end}}, {"_id": 0}
    ).to_list(100000)
    fy_income = sum(t.get("amount", 0) for t in txns if t.get("transaction_type") == "income")
    fy_expenses = sum(t.get("amount", 0) for t in txns if t.get("transaction_type") == "expense")
    
    return {
        "property_count": len(props),
        "total_portfolio_value": total_value,
        "total_loans": total_loans,
        "total_equity": total_equity,
        "annual_rental_income": annual_rent,
        "total_div43_depreciation": total_div43,
        "fy": fy,
        "fy_income": fy_income,
        "fy_expenses": fy_expenses,
        "fy_net": fy_income - fy_expenses,
    }

@api_router.post("/properties")
async def create_property(data: PropertyCreate, user: dict = Depends(require_premium)):
    property_id = f"prop_{uuid.uuid4().hex[:12]}"
    doc = {
        "property_id": property_id,
        "user_id": user["user_id"],
        "address": data.address,
        "property_type": data.property_type,
        "purchase_date": data.purchase_date,
        "purchase_price": data.purchase_price,
        "loan_amount": data.loan_amount,
        "weekly_rent": data.weekly_rent,
        "construction_cost": data.construction_cost,
        "construction_date": data.construction_date,
        "plant_equipment_value": data.plant_equipment_value,
        "depreciation_method": data.depreciation_method or "prime_cost",
        "current_market_value": data.current_market_value,
        "acquisition_costs": data.acquisition_costs,
        "capital_improvements": data.capital_improvements,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.properties.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/properties/{property_id}")
async def update_property(property_id: str, data: PropertyCreate, user: dict = Depends(require_premium)):
    result = await db.properties.update_one(
        {"property_id": property_id, "user_id": user["user_id"]},
        {"$set": {**data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    return await db.properties.find_one({"property_id": property_id}, {"_id": 0})

@api_router.delete("/properties/{property_id}")
async def delete_property(property_id: str, user: dict = Depends(require_premium)):
    result = await db.properties.delete_one({"property_id": property_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    await db.property_transactions.delete_many({"property_id": property_id})
    return {"success": True}

@api_router.get("/properties/{property_id}/transactions")
async def get_property_transactions(property_id: str, user: dict = Depends(require_premium)):
    await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]})
    txns = await db.property_transactions.find(
        {"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0}
    ).sort("date", -1).to_list(10000)
    return txns

@api_router.post("/properties/{property_id}/transactions")
async def add_property_transaction(property_id: str, data: PropertyTransactionCreate, user: dict = Depends(require_premium)):
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    txn_id = f"ptxn_{uuid.uuid4().hex[:12]}"
    doc = {
        "transaction_id": txn_id,
        "property_id": property_id,
        "user_id": user["user_id"],
        "date": data.date,
        "description": data.description,
        "amount": data.amount,
        "transaction_type": data.transaction_type,
        "category": data.category,
        "gst_included": data.gst_included,
        "financial_year": get_fy(data.date),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.property_transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/properties/{property_id}/transactions/{txn_id}")
async def delete_property_transaction(property_id: str, txn_id: str, user: dict = Depends(require_premium)):
    result = await db.property_transactions.delete_one(
        {"transaction_id": txn_id, "property_id": property_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True}

# ============================================================
# PAYMENT ROUTES (STRIPE)
# ============================================================

@api_router.post("/payments/checkout")
async def create_checkout(data: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    success_url = f"{data.origin_url}/settings?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{data.origin_url}/settings"

    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=19.99,
        currency="aud",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["user_id"], "plan": "premium"}
    ))

    await db.payment_transactions.insert_one({
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "session_id": session.session_id,
        "amount": 19.99,
        "currency": "aud",
        "status": "pending",
        "payment_status": "unpaid",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    status = await stripe.get_checkout_status(session_id)

    existing = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["user_id"]})
    if existing and existing.get("payment_status") != "paid" and status.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": status.status, "payment_status": status.payment_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "subscription_tier": "premium",
                "premium_since": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "is_paid": status.payment_status == "paid"
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = await stripe.handle_webhook(body, sig)
        if event.payment_status == "paid":
            meta = event.metadata or {}
            user_id = meta.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "subscription_tier": "premium",
                        "premium_since": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"status": event.event_type, "payment_status": event.payment_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
    except Exception as e:
        logger.warning(f"Webhook error: {e}")
    return {"received": True}

# ============================================================
# DASHBOARD ROUTE
# ============================================================

@api_router.get("/dashboard")
async def get_dashboard(fy: Optional[int] = None, user: dict = Depends(get_current_user)):
    if not fy:
        now = datetime.now(timezone.utc)
        fy = now.year + 1 if now.month >= 7 else now.year

    income_entries = await db.income.find(
        {"user_id": user["user_id"], "financial_year": fy}, {"_id": 0}
    ).to_list(10000)
    expense_entries = await db.expenses.find(
        {"user_id": user["user_id"], "financial_year": fy}, {"_id": 0}
    ).to_list(10000)

    total_income = sum(e.get("amount", 0) for e in income_entries)
    total_expenses = sum(e.get("amount", 0) for e in expense_entries)
    net_profit = total_income - total_expenses

    # Estimate tax (simplified ATO individual tax rates for sole traders)
    taxable_income = net_profit
    if taxable_income <= 0:
        est_tax = 0
    elif taxable_income <= 18200:
        est_tax = 0
    elif taxable_income <= 45000:
        est_tax = (taxable_income - 18200) * 0.19
    elif taxable_income <= 120000:
        est_tax = 5092 + (taxable_income - 45000) * 0.325
    elif taxable_income <= 180000:
        est_tax = 29467 + (taxable_income - 120000) * 0.37
    else:
        est_tax = 51667 + (taxable_income - 180000) * 0.45

    # GST estimate
    gst_on_sales = sum(e.get("amount", 0) / 11 for e in income_entries if e.get("gst_included") and not e.get("gst_free"))
    gst_on_purchases = sum(e.get("amount", 0) / 11 for e in expense_entries if e.get("gst_included") and e.get("gst_claimable"))
    net_gst = gst_on_sales - gst_on_purchases

    # Recent transactions combined
    recent_income = sorted(income_entries, key=lambda x: x.get("date", ""), reverse=True)[:5]
    recent_expenses = sorted(expense_entries, key=lambda x: x.get("date", ""), reverse=True)[:5]

    # Monthly totals for chart
    monthly = {}
    for e in income_entries:
        m = e.get("date", "")[:7]
        if m:
            monthly.setdefault(m, {"income": 0, "expenses": 0})
            monthly[m]["income"] += e.get("amount", 0)
    for e in expense_entries:
        m = e.get("date", "")[:7]
        if m:
            monthly.setdefault(m, {"income": 0, "expenses": 0})
            monthly[m]["expenses"] += e.get("amount", 0)

    chart_data = [{"month": k, "income": round(v["income"], 2), "expenses": round(v["expenses"], 2)}
                  for k, v in sorted(monthly.items())]

    # Next BAS due date
    now = datetime.now(timezone.utc)
    current_month = now.month
    if 7 <= current_month <= 9:
        next_bas = f"Q1 FY{fy} - Due {fy - 1}-10-28"
    elif 10 <= current_month <= 12:
        next_bas = f"Q2 FY{fy} - Due {fy}-02-28"
    elif 1 <= current_month <= 3:
        next_bas = f"Q3 FY{fy} - Due {fy}-04-28"
    else:
        next_bas = f"Q4 FY{fy} - Due {fy}-07-28"

    return {
        "financial_year": fy,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(net_profit, 2),
        "estimated_tax": round(est_tax, 2),
        "net_gst": round(net_gst, 2),
        "next_bas_due": next_bas,
        "income_count": len(income_entries),
        "expense_count": len(expense_entries),
        "recent_income": recent_income,
        "recent_expenses": recent_expenses,
        "chart_data": chart_data,
    }

# ============================================================
# APP SETUP
# ============================================================

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
