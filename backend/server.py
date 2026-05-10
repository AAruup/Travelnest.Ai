"""TravelNest AI – FastAPI backend.

Endpoints (all prefixed with /api):
- Auth: register, login, me
- Nova AI chat (Claude Sonnet 4.5 via emergentintegrations)
- Bookings, rail food orders, plane plans
- Family contacts, safety messages, GPS pings
- Partner leads, payment queue, music saves
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal

import jwt
import bcrypt
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ----------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 10080))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
OPENVERSE_AUDIO_URL = "https://api.openverse.org/v1/audio/"

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("travelnest")

# --- Mongo -----------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --- FastAPI ---------------------------------------------------------------
app = FastAPI(title="TravelNest AI API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# === Helpers ===============================================================
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def _user_from_session_token(token: str) -> Optional[dict]:
    """Look up a user via an Emergent Google session token."""
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            return None
    return await db.users.find_one(
        {"id": sess["user_id"]}, {"_id": 0, "password_hash": 0}
    )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    token: Optional[str] = None
    if credentials is not None:
        token = credentials.credentials
    else:
        # Fallback: session_token cookie (web flow).
        token = request.cookies.get("session_token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # 1) Try as Emergent Google session token.
    user = await _user_from_session_token(token)
    if user:
        return user

    # 2) Try as JWT.
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await db.users.find_one(
        {"id": payload.get("sub")}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# === Models ================================================================
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: Optional[str] = ""
    mobile: Optional[str] = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str = ""
    mobile: str = ""
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class NovaMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    created_at: datetime


class NovaChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class NovaChatResponse(BaseModel):
    session_id: str
    reply: str


class BookingCreate(BaseModel):
    service: str  # e.g. "Hotel near arrival station"
    location: str = ""
    passenger_need: str = ""


class RailFoodCreate(BaseModel):
    items: List[dict] = []  # [{name, qty, price}]
    coach_seat: str = ""
    station: str = ""
    total: float = 0


class PlanePlanCreate(BaseModel):
    flight_number: str
    airport: str = ""
    passenger_need: str = ""


class ContactCreate(BaseModel):
    name: str
    phone_or_email: str


class SafetyMessageCreate(BaseModel):
    kind: Literal["SAFE", "DLAY", "ETA", "SOS"]
    note: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GpsPingCreate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    note: Optional[str] = ""


class PartnerLeadCreate(BaseModel):
    name: str
    city: str = ""
    contact: str = ""
    partner_type: str


class PaymentCreate(BaseModel):
    purpose: str  # FOOD/HOTL/RIDE/PASS/CUSTOM
    payee: str = ""
    amount: float
    description: str = ""


class MusicSaveCreate(BaseModel):
    title: str
    artist: str = ""
    source: str = ""  # openverse / archive / device
    url: Optional[str] = ""


# === Auth ==================================================================
@api.post("/auth/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": req.email.lower(),
        "password_hash": hash_password(req.password),
        "full_name": req.full_name or "",
        "mobile": req.mobile or "",
        "created_at": utcnow(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, user_doc["email"])
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user_id,
            email=user_doc["email"],
            full_name=user_doc["full_name"],
            mobile=user_doc["mobile"],
            created_at=user_doc["created_at"],
        ),
    )


@api.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["email"])
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user["id"],
            email=user["email"],
            full_name=user.get("full_name", ""),
            mobile=user.get("mobile", ""),
            created_at=user["created_at"],
        ),
    )


@api.get("/auth/me", response_model=UserOut)
async def me(current=Depends(get_current_user)):
    return UserOut(**current)


# === Nova AI chat ==========================================================
def _import_llm_chat():
    """Lazy import to avoid startup crash if the library is missing."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa
    return LlmChat, UserMessage


NOVA_SYSTEM_PROMPT = (
    "You are Nova, the in-app travel and entertainment assistant for the "
    "TravelNest AI mobile super app. Help the passenger plan trips, manage "
    "rail food orders, flight services, hotels, family safety messages, "
    "offline music suggestions, and budget. Be concise, warm, and practical. "
    "Use short, structured replies (max 6 lines). When relevant, suggest "
    "in-app actions like ‘Tap Services > Rail Food’."
)


@api.post("/nova/chat", response_model=NovaChatResponse)
async def nova_chat(req: NovaChatRequest, current=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    session_id = req.session_id or str(uuid.uuid4())
    user_id = current["id"]

    LlmChat, UserMessage = _import_llm_chat()

    # Reconstruct memory: emergentintegrations stores session state separately,
    # but we also persist messages in Mongo and rely on session_id for the lib.
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{user_id}:{session_id}",
            system_message=NOVA_SYSTEM_PROMPT,
        )
        .with_model("anthropic", "claude-sonnet-4-5-20250929")
    )

    try:
        reply = await chat.send_message(UserMessage(text=req.message))
    except Exception as exc:  # pragma: no cover
        logger.exception("Nova chat failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Nova is unavailable: {exc}")

    now = utcnow()
    await db.nova_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user_id, "session_id": session_id,
         "role": "user", "text": req.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": user_id, "session_id": session_id,
         "role": "assistant", "text": reply, "created_at": now},
    ])
    return NovaChatResponse(session_id=session_id, reply=reply)


@api.get("/nova/history")
async def nova_history(session_id: Optional[str] = None, current=Depends(get_current_user)):
    q = {"user_id": current["id"]}
    if session_id:
        q["session_id"] = session_id
    cur = db.nova_messages.find(q, {"_id": 0}).sort("created_at", 1).limit(200)
    return await cur.to_list(length=200)


# === Generic CRUD helpers ==================================================
async def _create_doc(coll_name: str, user_id: str, data: dict) -> dict:
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": utcnow(), **data}
    await db[coll_name].insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _list_docs(coll_name: str, user_id: str) -> list:
    cur = db[coll_name].find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(200)
    return await cur.to_list(length=200)


async def _delete_doc(coll_name: str, user_id: str, doc_id: str) -> bool:
    res = await db[coll_name].delete_one({"id": doc_id, "user_id": user_id})
    return res.deleted_count > 0


# === Bookings ==============================================================
@api.post("/bookings")
async def create_booking(req: BookingCreate, current=Depends(get_current_user)):
    return await _create_doc("bookings", current["id"], req.dict())


@api.get("/bookings")
async def list_bookings(current=Depends(get_current_user)):
    return await _list_docs("bookings", current["id"])


@api.delete("/bookings/{doc_id}")
async def delete_booking(doc_id: str, current=Depends(get_current_user)):
    return {"deleted": await _delete_doc("bookings", current["id"], doc_id)}


# === Rail food =============================================================
@api.post("/rail-food")
async def create_rail_food(req: RailFoodCreate, current=Depends(get_current_user)):
    return await _create_doc("rail_food", current["id"], req.dict())


@api.get("/rail-food")
async def list_rail_food(current=Depends(get_current_user)):
    return await _list_docs("rail_food", current["id"])


# === Plane plans ===========================================================
@api.post("/plane-plans")
async def create_plane(req: PlanePlanCreate, current=Depends(get_current_user)):
    return await _create_doc("plane_plans", current["id"], req.dict())


@api.get("/plane-plans")
async def list_plane(current=Depends(get_current_user)):
    return await _list_docs("plane_plans", current["id"])


# === Family / Safety =======================================================
@api.post("/contacts")
async def create_contact(req: ContactCreate, current=Depends(get_current_user)):
    return await _create_doc("contacts", current["id"], req.dict())


@api.get("/contacts")
async def list_contacts(current=Depends(get_current_user)):
    return await _list_docs("contacts", current["id"])


@api.delete("/contacts/{doc_id}")
async def delete_contact(doc_id: str, current=Depends(get_current_user)):
    return {"deleted": await _delete_doc("contacts", current["id"], doc_id)}


@api.post("/safety-messages")
async def create_safety_msg(req: SafetyMessageCreate, current=Depends(get_current_user)):
    return await _create_doc("safety_messages", current["id"], req.dict())


@api.get("/safety-messages")
async def list_safety_msg(current=Depends(get_current_user)):
    return await _list_docs("safety_messages", current["id"])


@api.post("/gps-pings")
async def create_gps(req: GpsPingCreate, current=Depends(get_current_user)):
    return await _create_doc("gps_pings", current["id"], req.dict())


@api.get("/gps-pings")
async def list_gps(current=Depends(get_current_user)):
    return await _list_docs("gps_pings", current["id"])


# === Partner hub ===========================================================
@api.post("/partners")
async def create_partner(req: PartnerLeadCreate, current=Depends(get_current_user)):
    return await _create_doc("partners", current["id"], req.dict())


@api.get("/partners")
async def list_partners(current=Depends(get_current_user)):
    return await _list_docs("partners", current["id"])


# === Payment queue =========================================================
@api.post("/payments")
async def create_payment(req: PaymentCreate, current=Depends(get_current_user)):
    return await _create_doc("payments", current["id"],
                             {**req.dict(), "status": "pending"})


@api.get("/payments")
async def list_payments(current=Depends(get_current_user)):
    return await _list_docs("payments", current["id"])


@api.post("/payments/{doc_id}/sync")
async def sync_payment(doc_id: str, current=Depends(get_current_user)):
    res = await db.payments.update_one(
        {"id": doc_id, "user_id": current["id"]},
        {"$set": {"status": "synced", "synced_at": utcnow()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    doc = await db.payments.find_one({"id": doc_id}, {"_id": 0})
    return doc


# === Music =================================================================
@api.post("/music/saves")
async def save_music(req: MusicSaveCreate, current=Depends(get_current_user)):
    return await _create_doc("music_saves", current["id"], req.dict())


@api.get("/music/saves")
async def list_music(current=Depends(get_current_user)):
    return await _list_docs("music_saves", current["id"])


# === Stats =================================================================
@api.get("/stats")
async def stats(current=Depends(get_current_user)):
    uid = current["id"]
    counts = {}
    for name in ["bookings", "rail_food", "plane_plans", "contacts",
                 "safety_messages", "gps_pings", "partners", "payments",
                 "music_saves"]:
        counts[name] = await db[name].count_documents({"user_id": uid})

    pending_payments = await db.payments.count_documents({"user_id": uid, "status": "pending"})
    journey_health = 60
    if counts["bookings"]: journey_health += 10
    if counts["rail_food"]: journey_health += 5
    if counts["plane_plans"]: journey_health += 5
    if counts["contacts"]: journey_health += 10
    if counts["gps_pings"]: journey_health += 10
    journey_health = min(journey_health, 100)
    return {"counts": counts, "pending_payments": pending_payments,
            "journey_health": journey_health}


# === Health ================================================================
@api.get("/")
async def root():
    return {"app": "TravelNest AI", "status": "ok", "time": utcnow().isoformat()}


# === Google Auth (Emergent) =================================================
class GoogleSessionExchange(BaseModel):
    redirect_url: Optional[str] = None  # informational only


@api.post("/auth/google/session")
async def google_session(
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-ID"),
):
    """Exchange the Emergent Google `session_id` (from the redirect hash)
    for a persistent session_token. Creates/updates the user record."""
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID header")

    async with httpx.AsyncClient(timeout=15.0) as client_http:
        try:
            r = await client_http.get(
                EMERGENT_SESSION_URL,
                headers={"X-Session-ID": x_session_id},
            )
            r.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=401, detail=f"Emergent auth failed: {exc}")
        data = r.json()

    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=502, detail="Emergent auth missing email")

    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(status_code=502, detail="No session_token in Emergent response")

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["id"]
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "auth_provider": "google",
                "picture": picture,
                "full_name": existing.get("full_name") or name,
            }},
        )
    else:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "full_name": name,
            "mobile": "",
            "picture": picture,
            "auth_provider": "google",
            "password_hash": "",
            "created_at": utcnow(),
        })

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": utcnow() + timedelta(days=7),
        "created_at": utcnow(),
    })

    user_doc = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "password_hash": 0}
    )
    return {
        "access_token": session_token,
        "token_type": "bearer",
        "user": user_doc,
    }


@api.post("/auth/logout")
async def logout(current=Depends(get_current_user),
                 credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if credentials:
        await db.user_sessions.delete_one({"session_token": credentials.credentials})
    return {"ok": True}


# === Stripe Checkout =======================================================
class CheckoutCreate(BaseModel):
    purpose: str  # 'partner_booking' | 'music_pass' | 'rail_food' | 'custom'
    amount: float = Field(..., gt=0)
    currency: str = "usd"
    description: str = ""
    metadata: Optional[dict] = None


def _stripe_client(host_url: str) -> StripeCheckout:
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe key not configured")
    client = StripeCheckout(api_key=STRIPE_API_KEY)
    # The Emergent proxy is required for both create AND retrieve.
    if "sk_test_emergent" in STRIPE_API_KEY:
        import stripe as _stripe
        _stripe.api_base = "https://integrations.emergentagent.com/stripe"
    return client


@api.post("/payments/checkout/session")
async def create_checkout(req: CheckoutCreate, request: Request,
                          current=Depends(get_current_user)):
    """Create a Stripe Checkout Session and persist the local payment record."""
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    success_url = f"{origin}/payment-return?status=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment-return?status=cancel"

    stripe_client = _stripe_client(origin)
    metadata = {
        "user_id": current["id"],
        "purpose": req.purpose,
        **{k: str(v) for k, v in (req.metadata or {}).items()},
    }
    session = await stripe_client.create_checkout_session(
        CheckoutSessionRequest(
            amount=req.amount,
            currency=req.currency,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
    )

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current["id"],
        "purpose": req.purpose.upper(),
        "amount": req.amount,
        "currency": req.currency,
        "description": req.description,
        "status": "initiated",
        "stripe_session_id": session.session_id,
        "stripe_url": session.url,
        "payee": "Stripe",
        "created_at": utcnow(),
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return {"checkout_url": session.url, "session_id": session.session_id, "payment": doc}


@api.get("/payments/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request,
                          current=Depends(get_current_user)):
    stripe_client = _stripe_client(str(request.base_url))
    try:
        status_resp = await stripe_client.get_checkout_status(session_id)
    except Exception as exc:
        # Unknown session, network error, etc.
        payment_doc = await db.payments.find_one(
            {"stripe_session_id": session_id, "user_id": current["id"]},
            {"_id": 0},
        )
        if not payment_doc:
            raise HTTPException(status_code=404, detail=f"Unknown session: {exc}")
        return {
            "status": "unknown",
            "payment_status": "unknown",
            "amount_total": int(payment_doc.get("amount", 0) * 100),
            "currency": payment_doc.get("currency", "usd"),
            "metadata": {},
            "payment": payment_doc,
            "error": str(exc),
        }

    payment_doc = await db.payments.find_one(
        {"stripe_session_id": session_id, "user_id": current["id"]},
        {"_id": 0},
    )

    new_status = payment_doc["status"] if payment_doc else "initiated"
    if status_resp.payment_status == "paid":
        new_status = "synced"
    elif status_resp.status == "expired":
        new_status = "cancelled"

    if payment_doc and payment_doc["status"] != new_status:
        await db.payments.update_one(
            {"stripe_session_id": session_id, "user_id": current["id"]},
            {"$set": {"status": new_status, "synced_at": utcnow() if new_status == "synced" else None}},
        )
        payment_doc["status"] = new_status

    return {
        "status": status_resp.status,
        "payment_status": status_resp.payment_status,
        "amount_total": status_resp.amount_total,
        "currency": status_resp.currency,
        "metadata": status_resp.metadata,
        "payment": payment_doc,
    }


# === Music search via Openverse ============================================
@api.get("/music/search")
async def music_search(q: str = "", page_size: int = 12,
                       current=Depends(get_current_user)):
    if not q.strip():
        return {"results": [], "total": 0}
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        try:
            r = await client_http.get(
                OPENVERSE_AUDIO_URL,
                params={"q": q, "page_size": max(1, min(page_size, 20))},
                headers={"User-Agent": "TravelNestAI/1.0"},
            )
            r.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Openverse error: {exc}")
        data = r.json()

    results = []
    for item in data.get("results", [])[:page_size]:
        results.append({
            "id": item.get("id") or item.get("identifier"),
            "title": item.get("title") or "Untitled",
            "creator": item.get("creator") or "",
            "url": item.get("url") or "",
            "thumbnail": item.get("thumbnail") or "",
            "duration": item.get("duration") or 0,
            "license": item.get("license") or "",
            "source": item.get("source") or item.get("source_name") or "openverse",
        })
    return {"results": results, "total": data.get("result_count") or len(results)}


# === Mount =================================================================
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
