# TravelNest AI – Emergent Auth Testing Playbook

## Authentication implementation
The app supports **two parallel auth flows**:
1. **JWT email/password** — `POST /api/auth/{register,login}` returning `access_token`.
2. **Emergent Google Auth** — frontend opens `https://auth.emergentagent.com/?redirect=<deep-link>`,
   user authenticates, redirect URL receives `#session_id=<token>`. App calls
   `POST /api/auth/google/session` with header `X-Session-ID: <session_id>` and
   the backend exchanges it via Emergent's `auth/v1/env/oauth/session-data`
   endpoint, then upserts the user and stores `session_token` in
   `user_sessions` collection (7 day expiry, timezone-aware).

The backend dependency `get_current_user` accepts EITHER:
- `Authorization: Bearer <jwt>` (legacy email/password)
- `Authorization: Bearer <session_token>` returned by Google Auth
- Cookie `session_token` (HttpOnly, set on web only)

User identity in both flows is keyed by `user_id` (UUID v4 string).
MongoDB queries always exclude `_id`.

## Step 1 — Seed a test user + session

```bash
mongosh --eval '
use("travelnest");
var uid = "user_test_" + Date.now();
var st  = "test_session_" + Date.now();
db.users.insertOne({
  id: uid,
  user_id: uid,
  email: "google.tester+" + Date.now() + "@travelnest.ai",
  full_name: "Google Tester",
  mobile: "",
  picture: "https://via.placeholder.com/64",
  auth_provider: "google",
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: uid,
  session_token: st,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print("USER_ID  = " + uid);
print("SESSION  = " + st);
'
```

## Step 2 — Test backend

```bash
SESSION=...   # from step 1

# /me works for session_token too
curl -s https://<host>/api/auth/me -H "Authorization: Bearer $SESSION"

# CRUD endpoints scope by user_id
curl -s https://<host>/api/bookings -H "Authorization: Bearer $SESSION"
```

## Step 3 — Browser/RN testing

```python
await page.context.add_cookies([{
  "name": "session_token", "value": SESSION,
  "domain": "<host>", "path": "/",
  "httpOnly": True, "secure": True, "sameSite": "None",
}])
await page.goto("https://<host>")
```

## Indicators

| Status   | Indicator                                              |
| -------- | ------------------------------------------------------ |
| Success  | `/api/auth/me` returns user with `id` / `email`        |
| Success  | Bottom tabs visible without redirect to /auth          |
| Failure  | 401 on /api/auth/me                                    |
| Failure  | Infinite redirect into the Emergent Google login page  |

## Test identities tracked

| Account                    | Provider | Notes                                |
| -------------------------- | -------- | ------------------------------------ |
| `demo@travelnest.ai`       | jwt      | password `Pass1234` (seeded by tests)|
| Any Google account allowed | google   | dynamic, persisted on first sign-in  |
