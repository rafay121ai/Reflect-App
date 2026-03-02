# REFLECT App — Project Context for AI

**Purpose:** Single reference for any AI (e.g. Claude) to understand what this app is, what’s built, current stage, and what’s left. Use this file to onboard context at the start of a session.

---

## 1. What the app is

**REFLECT** is a **private AI journaling app**: users write a thought, get an LLM-generated reflection (sections, then personalized mirror, mood check-in, closing). It’s built for **iOS** (Capacitor) and **web**, with a focus on privacy and a calm, non-judgmental UX. It is **not** therapy or crisis support; the app and legal copy state this clearly.

- **Core flow:** Input thought → LLM reflection → interactive questions → personalized mirror → mood check-in → closing. Users can save to “My reflections,” set revisit reminders, and view insights (weekly letter, mood over time).
- **Monetization:** Subscription via **RevenueCat** (Premium entitlement). Free trial: 2 reflections/day, 14 total in 7 days; monthly/yearly have higher limits. Paywall is shown when the user hits the limit (429) or after onboarding.

---

## 2. Tech stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 19, Tailwind, Framer Motion, React Router. Capacitor for iOS (and Android if configured). |
| **Backend** | FastAPI (Python 3.12), runs on Railway. |
| **Database / Auth** | Supabase (PostgreSQL + Auth). JWT validated in `backend/auth.py`. |
| **LLM** | Abstracted in `backend/llm_provider.py` — supports Ollama, OpenAI, OpenRouter. |
| **Payments** | RevenueCat (SDK on client; optional server-side subscriber check via Secret API key). |

---

## 3. What’s done

### Auth & security
- All protected API routes use `Depends(require_user_id)`; `user_id` from JWT only (never from body).
- JWT: HS256, audience, expiry checked in `backend/auth.py`.
- Auth loading state in App; no flash of protected content before auth resolves.
- **Logout:** Clears all reflection/mirror/mood/history state and localStorage; shows full-screen login when auth is required.
- **CORS:** From env (`ALLOWED_ORIGINS`); default localhost for dev.
- **Account deletion:** In-app; backend `delete_user_data` removes all user data from Supabase (including `user_usage`) and optionally Auth user.

### Backend
- Env validation at startup: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS` required; `OPENAI_API_KEY` / `OPENROUTER_API_KEY` required when `LLM_PROVIDER` is openai/openrouter. App refuses to start if any required var is missing.
- Rate limiting: `@limiter.limit("10/minute")` on reflect, mirror, closing, remind, mood/suggest; `request: Request` is first arg where limiter is used.
- Pydantic request bodies have `max_length` on string fields (e.g. thought 5000).
- Sync route handlers (FastAPI runs them in a thread pool; no event-loop blocking).
- Health: `GET /api/health` returns DB status.

### Reflection rate limiting (subscription tiers)
- **Server-side only.** Plan from RevenueCat (or trial if no Premium).
- **Limits:** Trial: 2/day, 14 total in 7 days. Monthly: 50/cycle. Yearly: 75/cycle.
- **Backend:** `usage_limits.enforce_reflection_limit()` before reflect; on success, atomic increment (RPC or equivalent); on LLM failure, rollback decrement. When over limit → **429** with `{"error": "Reflection limit reached"}`.
- **DB:** Table `user_usage` (see `backend/user_usage_schema.sql`). Current schema in repo: `user_id` UUID PK referencing `auth.users(id)` ON DELETE CASCADE, `plan_type`, `reflections_used`, `trial_total_used`, `period_start`, `trial_start`, `updated_at`; indexes on `plan_type`, `period_start`; trigger to set `updated_at` on update. **Note:** Atomic increment may require RPCs (`increment_reflection_usage`, `decrement_reflection_usage`); if those are not in your Supabase project, see `REFLECTION_RATE_LIMITING.md` for full SQL.
- **RevenueCat server-side:** `backend/revenuecat_client.py` — optional `REVENUECAT_SECRET_API_KEY`; GET subscriber to get `plan_type` and `period_start`. If unset or fail, user is treated as trial.

### Paywall (frontend)
- **When limit hit (429):** App shows native RevenueCat paywall on iOS/Android; on web or if native fails, shows `PaywallLimitModal` (“Reflection limit reached”, Upgrade / Maybe later). Upgrade opens paywall again (native) or Settings (web).
- **After onboarding:** On native, if not Premium, `presentPaywallIfNeeded()` runs once after ~1.2s.
- **Settings:** Subscription block with Premium status, “Upgrade to Premium” (presents paywall), “Manage subscription” (Customer Center), “Restore purchases”.
- **RevenueCat:** Context in `RevenueCatContext.jsx`; wrapper in `lib/revenuecat.js`. Entitlement id: **Premium**.

### Data & DB
- **RLS:** Script `backend/supabase_rls_setup.sql` for tables: reflections, mood_checkins, revisit_reminders, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles. User confirmed RLS is enabled in production for these. `user_usage` has its own schema (and RLS if added).
- **Account delete** covers all user tables including `user_usage`; no sensitive data in logs.

### Frontend hardening & UX
- **Error boundary:** Root `AppErrorBoundary` in `index.js`; fallback “Something went wrong. Please restart Reflect.” and reload; errors logged with `console.error`.
- **Double submit:** Reflect button disabled and shows “Reflecting…” while request in flight (`isReflectSubmitting`); re-enabled in `finally`.
- **iOS:** `Info.plist` includes `ITSAppUsesNonExemptEncryption` = false (export compliance) and notification usage description.

### Legal & compliance
- Privacy policy and terms; in-app disclaimer (not therapy; crisis resources in footer). Account deletion in-app. OpenAI/data processing disclosed.

---

## 4. Current stage

- **Pre–App Store submission.** Core app, auth, rate limiting, and paywall are implemented. Production hardening (env validation, error boundary, logout clear, double-submit guard, export compliance) is in place. RLS has been applied in production for the main 8 tables.
- **Production maturity (last audit):** ~7.7/10. Security and auth are strong; observability and optional polish (rate limits on more routes, cold-start keep-alive) remain.

---

## 5. What’s left

### Before any production launch
- [ ] Ensure **RLS** is applied in production Supabase for all tables that hold user data (including `user_usage` if you use RLS there). Script: `backend/supabase_rls_setup.sql`.
- [ ] Confirm **production env** (Railway or host): all required vars set; backend starts cleanly.

### Before App Store submission
- [ ] **RevenueCat dashboard:** Entitlement **Premium** and products (e.g. monthly, yearly) configured; offerings/paywall built. Optional: set **REVENUECAT_SECRET_API_KEY** on backend for server-side plan detection.
- [ ] **user_usage:** If rate limiting is used, ensure `user_usage` table and any RPCs (`increment_reflection_usage`, `decrement_reflection_usage`) exist in Supabase (see `REFLECTION_RATE_LIMITING.md`).
- [ ] **Export compliance:** In App Store Connect, answer export question consistently with `ITSAppUsesNonExemptEncryption` (false = no custom encryption).
- [ ] **TestFlight:** Full flow on device (auth, reflect, hit limit → paywall, restore, account delete).

### Optional (before or after launch)
- Rate limits on `POST /api/mood` and `POST /api/history`; keep-alive for Railway cold starts; frontend error tracking (e.g. Sentry); LLM duration/token logging; retry once on transient LLM/network errors.

---

## 6. Key files (quick map)

| Area | Files |
|------|--------|
| **App shell** | `frontend/src/App.js`, `frontend/src/index.js` |
| **Auth** | `frontend/src/contexts/AuthContext.jsx`, `backend/auth.py` |
| **Paywall / RevenueCat** | `frontend/src/contexts/RevenueCatContext.jsx`, `frontend/src/lib/revenuecat.js`, `frontend/src/components/PaywallLimitModal.jsx`, `frontend/src/components/SettingsPanel.jsx` (Subscription section) |
| **Reflection flow** | `frontend/src/components/InputScreen.jsx`, `frontend/src/components/ReflectionFlow.jsx`, reflection subcomponents in `frontend/src/components/reflection/` |
| **Backend API** | `backend/server.py` (routes), `backend/llm_provider.py`, `backend/supabase_client.py` |
| **Rate limiting** | `backend/usage_limits.py`, `backend/revenuecat_client.py`, `backend/supabase_client.py` (user_usage + RPCs), `backend/user_usage_schema.sql` |
| **RLS** | `backend/supabase_rls_setup.sql` |
| **Config** | `backend/.env.example`, `frontend/.env.example`, `frontend/src/lib/config.js` |

---

## 7. Env summary

**Backend** (e.g. Railway): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`; `LLM_PROVIDER` (ollama | openai | openrouter) and corresponding API key; optional `REVENUECAT_SECRET_API_KEY`. `ALLOWED_ORIGINS` defaults to localhost if unset (dev).

**Frontend:** `REACT_APP_REVENUECAT_API_KEY` (public key for RevenueCat). Backend URL in `frontend/src/lib/config.js` (e.g. Railway).

---

*Last updated to reflect: production hardening, reflection rate limiting by tier, paywall on 429 and after onboarding, RLS confirmed in prod, user_usage schema (UUID + trigger).*
