"""TaxTrack AU - Backend API Tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://quicktax-au.preview.emergentagent.com"

SESSION_TOKEN = "test_session_taxtrack_2026"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}"}


class TestAuth:
    """Authentication tests"""

    def test_auth_me(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == "test-user-taxtrack-001"
        assert data["email"] == "test@taxtrack.au"

    def test_auth_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


class TestIncome:
    """Income CRUD tests"""

    created_id = None

    def test_get_income_list(self):
        r = requests.get(f"{BASE_URL}/api/income", headers=HEADERS)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_income(self):
        payload = {
            "date": "2026-01-15",
            "description": "TEST_ Consulting payment",
            "amount": 5000.0,
            "category": "consulting",
            "gst_included": True
        }
        r = requests.post(f"{BASE_URL}/api/income", json=payload, headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["amount"] == 5000.0
        assert "income_id" in data
        TestIncome.created_id = data["income_id"]

    def test_update_income(self):
        if not TestIncome.created_id:
            pytest.skip("No income created")
        payload = {"description": "TEST_ Updated", "amount": 6000.0}
        r = requests.put(f"{BASE_URL}/api/income/{TestIncome.created_id}", json=payload, headers=HEADERS)
        assert r.status_code == 200

    def test_delete_income(self):
        if not TestIncome.created_id:
            pytest.skip("No income created")
        r = requests.delete(f"{BASE_URL}/api/income/{TestIncome.created_id}", headers=HEADERS)
        assert r.status_code == 200


class TestExpenses:
    """Expenses CRUD tests"""

    created_id = None

    def test_get_expenses_list(self):
        r = requests.get(f"{BASE_URL}/api/expenses", headers=HEADERS)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_expense(self):
        payload = {
            "date": "2026-01-20",
            "description": "TEST_ Office supplies",
            "amount": 200.0,
            "category": "office",
            "gst_included": True
        }
        r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["amount"] == 200.0
        assert "expense_id" in data
        TestExpenses.created_id = data["expense_id"]

    def test_update_expense(self):
        if not TestExpenses.created_id:
            pytest.skip("No expense created")
        payload = {"description": "TEST_ Updated expense", "amount": 250.0}
        r = requests.put(f"{BASE_URL}/api/expenses/{TestExpenses.created_id}", json=payload, headers=HEADERS)
        assert r.status_code == 200

    def test_delete_expense(self):
        if not TestExpenses.created_id:
            pytest.skip("No expense created")
        r = requests.delete(f"{BASE_URL}/api/expenses/{TestExpenses.created_id}", headers=HEADERS)
        assert r.status_code == 200


class TestBAS:
    """BAS statement tests"""

    def test_get_bas(self):
        r = requests.get(f"{BASE_URL}/api/bas/2026/1", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "bas" in data
        bas = data["bas"]
        assert "G1_total_sales" in bas
        assert "field_1A_gst_on_sales" in bas
        assert "net_gst" in bas


class TestDashboard:
    """Dashboard summary tests"""

    def test_get_summary(self):
        r = requests.get(f"{BASE_URL}/api/dashboard", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "total_income" in data
        assert "total_expenses" in data
        assert "net_profit" in data


class TestProperties:
    """Properties tests (premium feature)"""

    def test_get_properties_free_user(self):
        r = requests.get(f"{BASE_URL}/api/properties", headers=HEADERS)
        # Free user should get either 403 or empty list
        assert r.status_code in [200, 403]
