"""
Tests for PDF upload (cleanedPayee, category, balances) and CSV upload endpoints.
New features: Gemini native PDF parsing, reconciliation badge data, CleanupModal flow.
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
AUTH_HEADER = {"Authorization": "Bearer test_session_taxtrack_2026"}


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update(AUTH_HEADER)
    return s


# ── CSV Upload ────────────────────────────────────────────────────────────────

class TestCSVUpload:
    """CSV upload endpoint still works"""

    def test_csv_upload_basic(self, client):
        csv_content = b"Date,Description,Amount\n01/01/2025,WOOLWORTHS SYDNEY,-52.30\n05/01/2025,SALARY CREDIT,3000.00\n10/01/2025,NETFLIX,-15.99\n"
        files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
        resp = client.post(f"{BASE_URL}/api/expenses/upload/csv", files=files)
        assert resp.status_code == 200, f"CSV upload failed: {resp.text}"
        data = resp.json()
        assert "transactions" in data
        assert len(data["transactions"]) >= 2

    def test_csv_upload_has_required_fields(self, client):
        csv_content = b"Date,Description,Amount\n01/01/2025,WOOLWORTHS,-52.30\n"
        files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
        resp = client.post(f"{BASE_URL}/api/expenses/upload/csv", files=files)
        assert resp.status_code == 200
        data = resp.json()
        txns = data["transactions"]
        assert len(txns) >= 1
        t = txns[0]
        assert "date" in t
        assert "description" in t
        assert "amount" in t
        assert "type" in t


# ── PDF Upload ────────────────────────────────────────────────────────────────

class TestPDFUploadEndpoint:
    """PDF upload endpoint returns proper structure"""

    def test_pdf_upload_requires_file(self, client):
        # No file → 422
        resp = client.post(f"{BASE_URL}/api/expenses/upload/pdf")
        assert resp.status_code == 422

    def test_pdf_upload_invalid_file_rejected(self, client):
        # Sending a text file as PDF should return 422 or handle gracefully
        fake_pdf = b"This is not a PDF file"
        files = {"file": ("fake.pdf", io.BytesIO(fake_pdf), "application/pdf")}
        resp = client.post(f"{BASE_URL}/api/expenses/upload/pdf", files=files)
        # Should not crash with 500
        assert resp.status_code in [200, 400, 422, 500]
        # If 500, that's a bug
        assert resp.status_code != 500, f"Server crashed on invalid PDF: {resp.text}"

    def test_pdf_endpoint_returns_expected_structure(self, client):
        """When a minimal valid PDF is uploaded, response must have transactions and balances keys"""
        import struct
        # Minimal valid PDF
        minimal_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
        files = {"file": ("test.pdf", io.BytesIO(minimal_pdf), "application/pdf")}
        resp = client.post(f"{BASE_URL}/api/expenses/upload/pdf", files=files)
        # May succeed with empty transactions or fail with 422 — should not 500
        assert resp.status_code != 500, f"Server crashed: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "transactions" in data
            assert "balances" in data
            assert "method" in data


# ── Import Expenses ────────────────────────────────────────────────────────────

class TestImportExpenses:
    """Import endpoint saves transactions with cleanedDesc"""

    def test_import_with_cleaned_desc(self, client):
        payload = {
            "transactions": [
                {
                    "date": "2025-01-15",
                    "description": "VISAPURCHASE WOOLWORTHS 1234 SYDNEY NSW 06/01",
                    "cleanedDesc": "Woolworths",
                    "amount": 52.30,
                    "type": "debit",
                    "category": "Groceries & Food",
                    "is_personal": True,
                    "gst_included": False
                }
            ]
        }
        resp = client.post(f"{BASE_URL}/api/expenses/import", json=payload)
        assert resp.status_code == 200, f"Import failed: {resp.text}"
        data = resp.json()
        assert "imported" in data or "transactions" in data or "count" in data

    def test_import_without_cleaned_desc(self, client):
        payload = {
            "transactions": [
                {
                    "date": "2025-01-15",
                    "description": "SALARY CREDIT",
                    "amount": 3000.00,
                    "type": "credit",
                    "category": "Salary/Wages",
                    "is_personal": True,
                    "gst_included": False
                }
            ]
        }
        resp = client.post(f"{BASE_URL}/api/expenses/import", json=payload)
        assert resp.status_code == 200, f"Import failed: {resp.text}"


# ── AI Categorize (regression) ─────────────────────────────────────────────────

class TestAICategorize:
    """AI categorize endpoint regression"""

    def test_ai_categorize_returns_categories(self, client):
        payload = {
            "transactions": [
                {"_key": "t1", "description": "WOOLWORTHS SYDNEY", "amount": 52.30, "type": "debit"},
                {"_key": "t2", "description": "AWS CLOUD SERVICES", "amount": 150.00, "type": "debit"}
            ]
        }
        resp = client.post(f"{BASE_URL}/api/import/categorize", json=payload)
        assert resp.status_code == 200, f"Categorize failed: {resp.text}"
        data = resp.json()
        assert "categories" in data
        results = data["categories"]
        assert len(results) >= 1
        r = results[0]
        assert "_key" in r
        assert "category" in r
