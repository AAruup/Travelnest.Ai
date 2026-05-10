"""TravelNest AI – backend pytest suite.

Covers auth, Nova chat, CRUD endpoints, payments sync and stats.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://voyage-compass-11.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "demo@travelnest.ai"
DEMO_PASSWORD = "Pass1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    # Try login first. If 401, register.
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    if r.status_code == 401:
        rr = session.post(f"{BASE_URL}/api/auth/register",
                          json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD,
                                "full_name": "Demo Tester"}, timeout=20)
        assert rr.status_code == 200, f"register failed: {rr.status_code} {rr.text}"
        return rr.json()["access_token"]
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# --- Auth -------------------------------------------------------------------
class TestAuth:
    def test_health(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_register_duplicate_returns_400(self, session, auth_token):
        r = session.post(f"{BASE_URL}/api/auth/register",
                         json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
        assert r.status_code == 400

    def test_login_wrong_password(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": DEMO_EMAIL, "password": "wrong-pass"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_token(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == DEMO_EMAIL
        assert "id" in body and "_id" not in body


# --- Auth scope on resources -----------------------------------------------
class TestAuthScope:
    def test_bookings_requires_auth(self, session):
        r = session.get(f"{BASE_URL}/api/bookings", timeout=15)
        assert r.status_code == 401

    def test_payments_requires_auth(self, session):
        r = session.get(f"{BASE_URL}/api/payments", timeout=15)
        assert r.status_code == 401

    def test_safety_requires_auth(self, session):
        r = session.get(f"{BASE_URL}/api/safety-messages", timeout=15)
        assert r.status_code == 401


# --- Bookings / RailFood / Plane -------------------------------------------
class TestBookingsAndOrders:
    def test_create_and_list_booking(self, session, auth_headers):
        payload = {"service": "TEST_Hotel", "location": "Mumbai", "passenger_need": "Late checkin"}
        r = session.post(f"{BASE_URL}/api/bookings", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200
        doc = r.json()
        assert doc["service"] == "TEST_Hotel"
        assert "id" in doc and "_id" not in doc

        lst = session.get(f"{BASE_URL}/api/bookings", headers=auth_headers, timeout=15).json()
        assert any(d["id"] == doc["id"] for d in lst)

    def test_create_rail_food(self, session, auth_headers):
        payload = {"items": [{"name": "Veg Biryani", "qty": 1, "price": 180}],
                   "coach_seat": "S5/22", "station": "BPL", "total": 180}
        r = session.post(f"{BASE_URL}/api/rail-food", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 180
        assert body["items"][0]["name"] == "Veg Biryani"

    def test_create_plane_plan(self, session, auth_headers):
        payload = {"flight_number": "TEST_AI202", "airport": "DEL", "passenger_need": "Wheelchair"}
        r = session.post(f"{BASE_URL}/api/plane-plans", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["flight_number"] == "TEST_AI202"


# --- Family / Safety / GPS --------------------------------------------------
class TestSafety:
    def test_contact_create_list_delete(self, session, auth_headers):
        c = session.post(f"{BASE_URL}/api/contacts", headers=auth_headers,
                         json={"name": "TEST_Mom", "phone_or_email": "+919999000000"}, timeout=15)
        assert c.status_code == 200
        cid = c.json()["id"]

        lst = session.get(f"{BASE_URL}/api/contacts", headers=auth_headers, timeout=15).json()
        assert any(d["id"] == cid for d in lst)

        d = session.delete(f"{BASE_URL}/api/contacts/{cid}", headers=auth_headers, timeout=15)
        assert d.status_code == 200 and d.json().get("deleted") is True

    def test_safety_message_chips(self, session, auth_headers):
        for kind in ["SAFE", "DLAY", "ETA", "SOS"]:
            r = session.post(f"{BASE_URL}/api/safety-messages", headers=auth_headers,
                             json={"kind": kind, "note": f"TEST_{kind}"}, timeout=15)
            assert r.status_code == 200
            assert r.json()["kind"] == kind

    def test_gps_ping(self, session, auth_headers):
        r = session.post(f"{BASE_URL}/api/gps-pings", headers=auth_headers,
                         json={"latitude": 19.07, "longitude": 72.87, "accuracy": 10.0}, timeout=15)
        assert r.status_code == 200
        assert abs(r.json()["latitude"] - 19.07) < 0.001


# --- Partner / Payment / Music ----------------------------------------------
class TestPartnerPaymentMusic:
    def test_partner_lead(self, session, auth_headers):
        r = session.post(f"{BASE_URL}/api/partners", headers=auth_headers,
                         json={"name": "TEST_Hotel Sun", "city": "Goa", "contact": "owner@test.io",
                               "partner_type": "hotel"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["partner_type"] == "hotel"

    def test_payment_queue_and_sync(self, session, auth_headers):
        r = session.post(f"{BASE_URL}/api/payments", headers=auth_headers,
                         json={"purpose": "FOOD", "payee": "TEST_Vendor", "amount": 250,
                               "description": "TEST_meal"}, timeout=15)
        assert r.status_code == 200
        pay = r.json()
        assert pay["status"] == "pending"
        pid = pay["id"]

        s = session.post(f"{BASE_URL}/api/payments/{pid}/sync", headers=auth_headers, timeout=15)
        assert s.status_code == 200
        assert s.json()["status"] == "synced"

    def test_music_save(self, session, auth_headers):
        r = session.post(f"{BASE_URL}/api/music/saves", headers=auth_headers,
                         json={"title": "TEST_Track", "artist": "TEST_Artist", "source": "device"},
                         timeout=15)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Track"


# --- Nova AI chat -----------------------------------------------------------
class TestNovaChat:
    def test_chat_then_history(self, session, auth_headers):
        r = session.post(f"{BASE_URL}/api/nova/chat", headers=auth_headers,
                         json={"message": "Suggest one snack for an overnight train."},
                         timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_id" in body
        assert isinstance(body["reply"], str) and len(body["reply"]) > 0
        sid = body["session_id"]

        time.sleep(0.5)
        h = session.get(f"{BASE_URL}/api/nova/history?session_id={sid}",
                        headers=auth_headers, timeout=15)
        assert h.status_code == 200
        msgs = h.json()
        assert len(msgs) >= 2
        assert any(m["role"] == "assistant" for m in msgs)


# --- Stats ------------------------------------------------------------------
class TestStats:
    def test_stats_shape(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/stats", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        for key in ["counts", "pending_payments", "journey_health"]:
            assert key in s
        assert 0 <= s["journey_health"] <= 100
        assert "bookings" in s["counts"]
