"""TravelNest AI – Iteration 2 backend tests.

Covers:
- Emergent Google Auth session exchange (negative cases + seeded session_token)
- /api/auth/logout deletes the session_token row
- /api/payments/checkout/session creates Stripe session and DB row
- /api/payments/checkout/status/{sid} returns status (and updates row when paid)
- /api/music/search returns Openverse results
"""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://voyage-compass-11.preview.emergentagent.com",
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "travelnest")

DEMO_EMAIL = "demo@travelnest.ai"
DEMO_PASSWORD = "Pass1234"


# --- Shared fixtures --------------------------------------------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def jwt_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    if r.status_code == 401:
        rr = session.post(f"{BASE_URL}/api/auth/register",
                          json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD,
                                "full_name": "Demo Tester"}, timeout=20)
        assert rr.status_code == 200
        return rr.json()["access_token"]
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def jwt_headers(jwt_token):
    return {"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture
def seeded_session(mongo_db):
    """Seed a Google-style user + session_token directly."""
    uid = f"user_test_{uuid.uuid4().hex[:8]}"
    st = f"test_session_{uuid.uuid4().hex}"
    email = f"google.tester+{uid}@travelnest.ai"
    mongo_db.users.insert_one({
        "id": uid,
        "email": email,
        "full_name": "Google Tester",
        "mobile": "",
        "picture": "",
        "auth_provider": "google",
        "password_hash": "",
        "created_at": datetime.now(timezone.utc),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": st,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    yield {"user_id": uid, "session_token": st, "email": email}
    mongo_db.users.delete_one({"id": uid})
    mongo_db.user_sessions.delete_many({"user_id": uid})


# --- Google session exchange -----------------------------------------------
class TestGoogleSession:
    def test_missing_session_id_returns_400(self, session):
        r = session.post(f"{BASE_URL}/api/auth/google/session", timeout=15)
        assert r.status_code == 400
        assert "X-Session-ID" in r.text or "session" in r.text.lower()

    def test_bogus_session_id_returns_401(self, session):
        r = session.post(f"{BASE_URL}/api/auth/google/session",
                         headers={"X-Session-ID": "bogus-not-real"}, timeout=20)
        assert r.status_code == 401

    def test_me_with_seeded_session_token(self, session, seeded_session):
        token = seeded_session["session_token"]
        r = session.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == seeded_session["email"]
        assert body["id"] == seeded_session["user_id"]
        assert "_id" not in body

    def test_seeded_session_can_use_crud(self, session, seeded_session):
        token = seeded_session["session_token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = session.post(f"{BASE_URL}/api/bookings", headers=h,
                         json={"service": "TEST_GoogleScope"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["service"] == "TEST_GoogleScope"


# --- Logout -----------------------------------------------------------------
class TestLogout:
    def test_logout_jwt_returns_ok(self, session, jwt_headers):
        r = session.post(f"{BASE_URL}/api/auth/logout", headers=jwt_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_logout_deletes_session_row(self, session, mongo_db, seeded_session):
        token = seeded_session["session_token"]
        # confirm row exists
        assert mongo_db.user_sessions.find_one({"session_token": token}) is not None
        r = session.post(f"{BASE_URL}/api/auth/logout",
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        # row must be gone
        assert mongo_db.user_sessions.find_one({"session_token": token}) is None
        # subsequent /me must now 401
        r2 = session.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r2.status_code == 401


# --- Stripe Checkout --------------------------------------------------------
class TestStripeCheckout:
    def test_create_checkout_session(self, session, jwt_headers, mongo_db):
        payload = {
            "purpose": "partner_booking",
            "amount": 9.99,
            "currency": "usd",
            "description": "TEST_Partner pay",
            "metadata": {"partner_id": "TEST_p1"},
        }
        r = session.post(f"{BASE_URL}/api/payments/checkout/session",
                         headers=jwt_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body
        assert "session_id" in body
        assert "payment" in body
        assert "stripe.com" in body["checkout_url"]
        pay = body["payment"]
        assert pay["status"] == "initiated"
        assert pay["stripe_session_id"] == body["session_id"]
        assert pay["amount"] == 9.99
        assert "_id" not in pay

        # DB row should exist
        row = mongo_db.payments.find_one({"id": pay["id"]})
        assert row is not None
        assert row["stripe_session_id"] == body["session_id"]
        assert row["status"] == "initiated"

        # Save sid for next tests via class attribute
        TestStripeCheckout._sid = body["session_id"]

    def test_get_checkout_status(self, session, jwt_headers):
        sid = getattr(TestStripeCheckout, "_sid", None)
        if not sid:
            pytest.skip("checkout session not created")
        r = session.get(f"{BASE_URL}/api/payments/checkout/status/{sid}",
                        headers=jwt_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # An unpaid session right after creation should report status open / unpaid
        assert "status" in body
        assert "payment_status" in body
        assert "payment" in body
        # Until paid status remains 'initiated' (or 'cancelled' if expired)
        assert body["payment"]["status"] in ("initiated", "synced", "cancelled")


# --- Music search via Openverse --------------------------------------------
class TestMusicSearch:
    def test_search_jazz(self, session, jwt_headers):
        r = session.get(f"{BASE_URL}/api/music/search",
                        headers=jwt_headers, params={"q": "jazz"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "results" in body
        assert isinstance(body["results"], list)
        assert len(body["results"]) >= 1, "expected at least one Openverse result"
        first = body["results"][0]
        for k in ["id", "title", "creator", "url", "source"]:
            assert k in first

    def test_search_empty_returns_empty(self, session, jwt_headers):
        r = session.get(f"{BASE_URL}/api/music/search",
                        headers=jwt_headers, params={"q": "  "}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["results"] == []
        assert body["total"] == 0

    def test_search_requires_auth(self, session):
        r = session.get(f"{BASE_URL}/api/music/search", params={"q": "jazz"}, timeout=15)
        assert r.status_code == 401
