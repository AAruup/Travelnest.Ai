# TravelNest AI – PRD (v1 mobile super app)

## Overview
TravelNest AI is an Expo React Native mobile super app that helps a traveller
end-to-end: tickets, hotels, food, route, music, family-safety, and budget.
The app provides Nova AI as a multi-turn assistant (Claude Sonnet 4.5) and
saves all data per-user in MongoDB via a FastAPI backend.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native 0.81, expo-router, expo-location,
  @react-native-async-storage/async-storage, axios, @expo/vector-icons.
- **Backend**: FastAPI, MongoDB (Motor), JWT (PyJWT) + bcrypt, Pydantic v2.
- **AI**: emergentintegrations LlmChat with `anthropic/claude-sonnet-4-5-20250929`
  using `EMERGENT_LLM_KEY`.

## Architecture
- 5 bottom tabs: Home, Nova AI, Services, Safety, Profile.
- Auth gated via context (`/src/auth.tsx`); unauthenticated users land on
  `/auth`. JWT stored in AsyncStorage.
- Backend exposes `/api/auth/{register,login,me}`, `/api/nova/{chat,history}`,
  plus CRUD endpoints for bookings, rail-food, plane-plans, contacts,
  safety-messages, gps-pings, partners, payments, music/saves and `/api/stats`.

## Key User Flows
1. **Sign in / Sign up** – email + password (Google placeholder).
2. **Home dashboard** – journey-health %, quick actions, featured trip card,
   service tiles.
3. **Nova AI chat** – multi-turn Claude Sonnet 4.5 with travel persona.
4. **Services** – hotel/service booking, rail food cart, plane plan, partner
   hub leads.
5. **Safety** – GPS detect (expo-location), SAFE/DLAY/ETA/SOS quick messages,
   loved-one contacts, message history.
6. **Profile** – payment queue (quick chips + custom), offline music saves,
   logout.

## Smart Business Enhancement
Partner lead capture + Nova AI suggestions create a marketplace funnel: the
app prepares travellers to spend on hotels, food, and music passes, which
hands TravelNest revenue-share opportunities with onboarded vendors.

## Non-Goals (this iteration)
- SMS / Email push notifications (still DB-only)

## Open Items
- Real per-product Stripe pricing tiers (currently fixed $9.99 partner deposit).
- Audio streaming player UI for saved Openverse tracks.
