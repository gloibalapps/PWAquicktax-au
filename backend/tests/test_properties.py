"""Property Tracking backend tests for TaxTrack AU"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TOKEN = "test_session_taxtrack_2026"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
TEST_PROP_ID = "prop_821cccd7105e"


class TestPropertiesAPI:
    """Properties CRUD and summary endpoint tests"""

    def test_list_properties_premium(self):
        r = requests.get(f"{BASE_URL}/api/properties", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p["property_id"] == TEST_PROP_ID for p in data)

    def test_properties_summary(self):
        r = requests.get(f"{BASE_URL}/api/properties/summary", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "property_count" in data
        assert "total_portfolio_value" in data
        assert "total_equity" in data
        assert "annual_rental_income" in data
        assert "total_div43_depreciation" in data
        # 320000 * 0.025 = 8000
        assert data["total_div43_depreciation"] == 8000.0

    def test_create_property(self):
        payload = {
            "address": "TEST_77 Sample Rd, Brisbane QLD 4000",
            "property_type": "residential",
            "purchase_date": "2021-06-01",
            "purchase_price": 600000,
            "loan_amount": 480000,
            "weekly_rent": 600,
            "construction_cost": 200000,
            "construction_date": "2010-01-01",
            "plant_equipment_value": 20000,
            "depreciation_method": "prime_cost"
        }
        r = requests.post(f"{BASE_URL}/api/properties", headers=HEADERS, json=payload)
        assert r.status_code == 200
        data = r.json()
        assert "property_id" in data
        assert data["address"] == payload["address"]
        assert data["construction_cost"] == 200000
        # Cleanup
        pid = data["property_id"]
        requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=HEADERS)

    def test_add_transaction(self):
        payload = {
            "date": "2026-02-01",
            "description": "TEST_Water rates",
            "amount": 300,
            "transaction_type": "expense",
            "category": "Council Rates"
        }
        r = requests.post(
            f"{BASE_URL}/api/properties/{TEST_PROP_ID}/transactions",
            headers=HEADERS, json=payload
        )
        assert r.status_code == 200
        data = r.json()
        assert "transaction_id" in data
        assert data["transaction_type"] == "expense"
        # Cleanup
        tid = data["transaction_id"]
        requests.delete(
            f"{BASE_URL}/api/properties/{TEST_PROP_ID}/transactions/{tid}",
            headers=HEADERS
        )

    def test_non_premium_returns_403(self):
        import subprocess
        subprocess.run([
            "mongosh", "--quiet", "--eval",
            "use('test_database'); db.users.updateOne({user_id:'test-user-taxtrack-001'},{$set:{subscription_tier:'free'}})"
        ], capture_output=True)
        import time
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/properties", headers=HEADERS)
        # Restore premium
        subprocess.run([
            "mongosh", "--quiet", "--eval",
            "use('test_database'); db.users.updateOne({user_id:'test-user-taxtrack-001'},{$set:{subscription_tier:'premium'}})"
        ], capture_output=True)
        assert r.status_code == 403

    def test_get_transactions(self):
        r = requests.get(
            f"{BASE_URL}/api/properties/{TEST_PROP_ID}/transactions",
            headers=HEADERS
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_delete_transaction(self):
        # First create one
        payload = {"date": "2026-03-01", "description": "TEST_Delete me", "amount": 100, "transaction_type": "income", "category": "Rent"}
        r = requests.post(f"{BASE_URL}/api/properties/{TEST_PROP_ID}/transactions", headers=HEADERS, json=payload)
        assert r.status_code == 200
        tid = r.json()["transaction_id"]
        # Delete it
        rd = requests.delete(f"{BASE_URL}/api/properties/{TEST_PROP_ID}/transactions/{tid}", headers=HEADERS)
        assert rd.status_code == 200
