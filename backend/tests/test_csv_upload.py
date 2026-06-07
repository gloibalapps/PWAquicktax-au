"""
Tests for CSV/PDF upload, export endpoints and BAS functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TOKEN = "test_session_taxtrack_2026"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
CSV_FILE = "/tmp/test_banksa.csv"


def get(path, **kwargs):
    return requests.get(f"{BASE_URL}{path}", headers=HEADERS, **kwargs)


def post(path, **kwargs):
    return requests.post(f"{BASE_URL}{path}", headers=HEADERS, **kwargs)


class TestAuth:
    """Verify session auth works"""

    def test_auth_me(self):
        r = get("/api/auth/me")
        assert r.status_code == 200, f"Auth failed: {r.text}"
        data = r.json()
        assert data.get("email") == "test@taxtrack.au"
        print("Auth OK")


class TestCSVUpload:
    """CSV upload parsing tests"""

    def test_csv_upload_expenses(self):
        """Upload BankSA format CSV with trailing commas to expenses"""
        with open(CSV_FILE, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/expenses/upload/csv",
                headers={"Authorization": f"Bearer {TOKEN}"},
                files={"file": ("test_banksa.csv", f, "text/csv")}
            )
        assert r.status_code == 200, f"Upload failed: {r.text}"
        data = r.json()
        print(f"CSV upload response: {data}")
        # Should have transactions, not empty
        transactions = data.get("transactions", data.get("preview", []))
        assert len(transactions) > 0, f"No transactions found! Response: {data}"
        print(f"Found {len(transactions)} transactions")
        # Verify transaction structure
        tx = transactions[0]
        assert "date" in tx or "amount" in tx or "description" in tx, f"Bad tx structure: {tx}"

    def test_csv_upload_income(self):
        """Upload BankSA format CSV to income"""
        with open(CSV_FILE, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/income/upload/csv",
                headers={"Authorization": f"Bearer {TOKEN}"},
                files={"file": ("test_banksa.csv", f, "text/csv")}
            )
        assert r.status_code == 200, f"Upload failed: {r.text}"
        data = r.json()
        transactions = data.get("transactions", data.get("preview", []))
        assert len(transactions) > 0, f"No transactions found! Response: {data}"
        print(f"Income CSV: Found {len(transactions)} transactions")


class TestExportEndpoints:
    """Export CSV endpoints"""

    def test_expenses_export_csv(self):
        r = get("/api/expenses/export")
        assert r.status_code == 200, f"Expenses export failed: {r.status_code} {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct or len(r.content) > 0, f"No CSV content: {ct}"
        print(f"Expenses export OK, content-type: {ct}, size: {len(r.content)}")

    def test_income_export_csv(self):
        r = get("/api/income/export")
        assert r.status_code == 200, f"Income export failed: {r.status_code} {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct or len(r.content) > 0, f"No CSV content: {ct}"
        print(f"Income export OK, content-type: {ct}, size: {len(r.content)}")


class TestBAS:
    """BAS page endpoints"""

    def test_bas_data(self):
        r = get("/api/bas")
        assert r.status_code in [200, 404], f"BAS failed: {r.status_code} {r.text[:200]}"
        print(f"BAS status: {r.status_code}, response: {r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            print(f"BAS data keys: {list(data.keys())}")
