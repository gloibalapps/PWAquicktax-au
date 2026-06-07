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
    notes: Optional[str] = None

class IncomeUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    gst_included: Optional[bool] = None
    gst_free: Optional[bool] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class ExpenseCreate(BaseModel):
    date: str
    description: str
    amount: float
    gst_included: bool = False
    gst_claimable: bool = True
    category: str = "Other Business Expenses"
    notes: Optional[str] = None

class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    gst_included: Optional[bool] = None
    gst_claimable: Optional[bool] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class PropertyCreate(BaseModel):
    address: str
    property_type: str = "residential"
    purchase_date: str
    purchase_price: float
    loan_amount: Optional[float] = None
    weekly_rent: Optional[float] = None
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
            df = pd.read_csv(io.BytesIO(content), encoding=enc)
            break
        except Exception:
            continue
    else:
        raise ValueError("Cannot read CSV")

    df.columns = [str(c).strip().lower() for c in df.columns]

    date_col = next((c for c in df.columns if any(x in c for x in ['date', 'posted', 'tran'])), None)
    desc_col = next((c for c in df.columns if any(x in c for x in ['description', 'details', 'narrative', 'payee', 'memo', 'narration', 'reference', 'particulars'])), None)
    amount_col = next((c for c in df.columns if c.strip() == 'amount'), None)
    debit_col = next((c for c in df.columns if any(x in c for x in ['debit', 'withdrawal', 'charge', 'dr '])), None)
    credit_col = next((c for c in df.columns if any(x in c for x in ['credit', 'deposit', 'cr '])), None)

    if not date_col or not desc_col:
        raise ValueError(f"Cannot identify columns. Found: {list(df.columns)}")

    transactions = []
    for _, row in df.iterrows():
        try:
            date_val = str(row[date_col]).strip()
            desc_val = str(row[desc_col]).strip()
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
                if dr and dr not in ['nan', '-', '']:
                    amount = abs(float(dr))
                    trans_type = "debit"
                elif cr and cr not in ['nan', '-', '']:
                    amount = abs(float(cr))
                    trans_type = "credit"
                else:
                    continue
            else:
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

@api_router.post("/expenses/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="You are an expert at parsing Australian bank statements. Extract all transactions and return ONLY a valid JSON array."
        ).with_model("gemini", "gemini-2.5-flash")

        pdf_file = FileContentWithMimeType(file_path=tmp_path, mime_type="application/pdf")
        prompt = (
            "Extract all transactions from this Australian bank statement. "
            "Return ONLY a JSON array (no markdown, no explanation) with this exact format: "
            '[{"date":"YYYY-MM-DD","description":"string","amount":0.00,"type":"debit or credit"}]. '
            "For debits (money out/withdrawals), set type='debit'. "
            "For credits (money in/deposits), set type='credit'. "
            "Amount should always be a positive number. "
            "Use Australian date format (DD/MM/YYYY in the original, convert to YYYY-MM-DD)."
        )
        response = await chat.send_message(UserMessage(text=prompt, file_contents=[pdf_file]))
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        transactions = json.loads(text.strip())
        return {"transactions": transactions, "count": len(transactions)}
    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {str(e)}")
    finally:
        os.unlink(tmp_path)

@api_router.post("/expenses/import")
async def import_expenses(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    transactions = body.get("transactions", [])
    imported = []
    for t in transactions:
        try:
            if t.get("type") == "credit":
                continue
            expense_id = f"exp_{uuid.uuid4().hex[:12]}"
            doc = {
                "expense_id": expense_id,
                "user_id": user["user_id"],
                "date": t["date"],
                "description": t.get("description", "Imported transaction"),
                "amount": float(t["amount"]),
                "gst_included": False,
                "gst_claimable": True,
                "category": "Other Business Expenses",
                "financial_year": get_fy(t["date"]),
                "source": "import",
                "notes": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.expenses.insert_one(doc)
            doc.pop("_id", None)
            imported.append(doc)
        except Exception as e:
            logger.warning(f"Failed to import transaction: {e}")
    return {"imported": len(imported), "entries": imported}

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
            {"$set": {"subscription_tier": "premium", "updated_at": datetime.now(timezone.utc).isoformat()}}
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
                    {"$set": {"subscription_tier": "premium", "updated_at": datetime.now(timezone.utc).isoformat()}}
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
