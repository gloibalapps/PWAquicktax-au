"""
Tests for AI categorize endpoint and import batch endpoint
Focus: /api/import/categorize, /api/import/batch, core income/expense/BAS endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
HEADERS = {
    "Authorization": f"Bearer test_session_taxtrack_2026",
    "Content-Type": "application/json"
}


class TestCoreEndpoints:
    """Core health and auth endpoints"""

    def test_auth_me(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "user_id" in data or "email" in data

    def test_income_list(self):
        r = requests.get(f"{BASE_URL}/api/income", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or "items" in data

    def test_expenses_list(self):
        r = requests.get(f"{BASE_URL}/api/expenses", headers=HEADERS)
        assert r.status_code == 200

    def test_bas_summary(self):
        r = requests.get(f"{BASE_URL}/api/bas/2025/1", headers=HEADERS)
        assert r.status_code == 200


class TestAICategorize:
    """Tests for /api/import/categorize endpoint"""

    def test_categorize_returns_200(self):
        payload = {
            "transactions": [
                {"_key": "row-0", "description": "WOOLWORTHS SUPERMARKET", "type": "expense"},
                {"_key": "row-1", "description": "CLIENT INVOICE PAYMENT", "type": "income"},
                {"_key": "row-2", "description": "AMAZON WEB SERVICES", "type": "expense"},
            ]
        }
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload, headers=HEADERS)
        assert r.status_code == 200

    def test_categorize_response_structure(self):
        payload = {
            "transactions": [
                {"_key": "row-0", "description": "WOOLWORTHS SUPERMARKET", "type": "expense"},
                {"_key": "row-1", "description": "CLIENT INVOICE PAYMENT", "type": "income"},
            ]
        }
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload, headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)

    def test_categorize_fields_present(self):
        payload = {
            "transactions": [
                {"_key": "row-10", "description": "BANK FEES", "type": "expense"},
            ]
        }
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload, headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        cats = data.get("categories", [])
        assert len(cats) > 0
        cat = cats[0]
        # Required fields from spec
        assert "_key" in cat
        assert "type" in cat
        assert "is_personal" in cat
        assert "category" in cat
        assert "gst_included" in cat

    def test_categorize_empty_transactions(self):
        payload = {"transactions": []}
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload, headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data.get("categories") == [] or data.get("categories") is not None

    def test_categorize_requires_auth(self):
        payload = {"transactions": [{"_key": "row-0", "description": "TEST", "type": "expense"}]}
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload,
                          headers={"Content-Type": "application/json"})
        assert r.status_code in [401, 403]

    def test_categorize_multiple_transactions(self):
        payload = {
            "transactions": [
                {"_key": f"row-{i}", "description": f"TRANSACTION {i}", "type": "expense"}
                for i in range(10)
            ]
        }
        r = requests.post(f"{BASE_URL}/api/import/categorize", json=payload, headers=HEADERS,
                          timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        assert "categorized" in data


class TestCSVUpload:
    """Tests for CSV upload endpoint"""

    def test_csv_upload_expenses(self):
        csv_content = b"Date,Description,Amount,Balance\n01/01/2025,TEST PAYMENT,-100.00,900.00\n"
        r = requests.post(
            f"{BASE_URL}/api/expenses/upload/csv",
            headers={"Authorization": "Bearer test_session_taxtrack_2026"},
            files={"file": ("test.csv", csv_content, "text/csv")}
        )
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data or "transactions" in data
