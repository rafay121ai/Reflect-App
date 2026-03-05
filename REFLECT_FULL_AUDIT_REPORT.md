# REFLECT — Senior Dev Production Review (Full Audit)

**Reviewed:** 2026-02-05  
**Codebase summary:** REFLECT is a coherent React 19 + FastAPI journaling app with Supabase auth, OpenAI/OpenRouter LLM, and clear guest vs authenticated flows. Auth is correctly gated with JWT (`require_user_id`); no `body.user_id` spoofing. CORS is env-based; startup validates required env vars. Mirror report and mood/history routes have `request: Request` first and rate limits. Main gaps: hardcoded backend URL in frontend, no frontend error tracking or LLM timing logs, RLS not covering `beta_feedback`/`user_usage`, and some GET/mutation routes intentionally un-rate-limited. Account deletion covers all user tables used by the app; privacy/terms and in-app disclaimer are present.

---

## Phase 1 — Summary

**Overall health:** The app is in good shape for a pre–paywall launch. Auth and route protection are implemented correctly; rate limiting is applied to all LLM and mutation endpoints that need it. Personalization flows through reflect, mirror, and closing; account deletion hits every user table the backend uses.

**Risky areas:** (1) Frontend `config.js` line 5 hardcodes `RAILWAY_BACKEND_URL` — changing backend requires a frontend deploy unless you move to env. (2) `supabase_rls_setup.sql` does not enable RLS on `beta_feedback` or `user_usage`; backend uses service key so RLS is a backstop only, but worth adding for consistency. (3) No Sentry or LLM timing — you’ll be blind to production errors and cost/latency.

**Solid:** JWT with `algorithms=["HS256"]` and expiry; CORS from `ALLOWED_ORIGINS`; `_do_reflect` returns `{"id", "sections"}`; `delete_user_data` covers mood_checkins, revisit_reminders, reflections, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles, beta_feedback, user_usage; ErrorBoundary wraps App; sign-out clears state and localStorage.

---

## Phase 2 — Audit (A–L)

### A. BACKEND SECURITY

**Route-by-route (summary):** All routes that call the LLM or mutate DB are protected with `Depends(require_user_id)` except the intended guest and webhook routes. No route uses `body.user_id`. Rate-limited routes have `request: Request` as first parameter (verified for `mirror_report`, `mirror_report_guest`, `mood`, `history_save`, `reflect`, `reflect_guest`, `mirror_personalized`, `closing`, `remind`, `mood_suggest`, `beta_feedback_submit`, `cleanup_guest_reflections`). GETs that only read DB (e.g. `get_reflection_route`, `reminders_due`, `history_waiting`, `history_all`, `history_get_one`, `user_profile_get`, `usage_get`, `user_reflected_today`, `beta_feedback_list`, insights) are auth’d but not rate-limited — acceptable for read-heavy endpoints.

**Spoofing:** ✅ None. `user_id` always from `Depends(require_user_id)` or not present (guest paths).

**CORS:** ✅ `server.py` lines 179–206: `allow_origins` = `ALLOWED_ORIGINS` from env (no `["*"]` in production); `allow_credentials=True`; optional `allow_origin_regex` for Vercel.

**Input validation:** ✅ `ReflectRequest.thought` `max_length=5000` (line 250); `MirrorRequest`, `ClosingRequest`, `RemindRequest` have `max_length` on string fields. `MirrorReportRequest`, `MoodRequest`, `SaveHistoryRequest` have limits.

**Dependencies:** ✅ `requirements.txt`: fastapi 0.115.6, PyJWT 2.10.1, httpx >=0.26 — all above minimums cited in audit.

**Timeout:** ⚠️ `openai_client.py` line 45: `httpx.Client(timeout=120.0)` — 120s; no separate frontend timeout or retry documented.

**Async:** ✅ Route handlers are sync `def`; FastAPI runs them in thread pool; no blocking calls inside `async def` (only `webhook_lemon_squeezy` is async and uses `await request.body()`).

**HTTP methods:** ✅ GET for reads, POST/PATCH/DELETE for mutations.

**Response consistency:** ⚠️ Mix of `detail` (FastAPI default) and `error` (e.g. 429 reflection limit); frontend handles both.

---

### B. DATA SECURITY

**Secret scan:** ✅ No `.supabase.co` URLs with secrets; no `sk_` keys or long `eyJ` tokens in repo; `SUPABASE_SERVICE_KEY` only in backend (server.py, supabase_client.py); not referenced in frontend.

**Env coverage:** ✅ `.env.example` documents ALLOWED_ORIGINS, ALLOWED_HOSTS, Supabase, LLM, RevenueCat, Lemon Squeezy; startup requires SUPABASE_*, JWT, and LLM keys per provider.

**Account deletion:** ✅ `delete_user_data` (supabase_client.py 1017–1090) deletes: mood_checkins, revisit_reminders, reflections, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles, beta_feedback, user_usage; optional auth user. Tables used elsewhere: `webhook_events` (Lemon Squeezy dedup — not user-scoped); guest data in `reflections` (guest_id) cleaned by `delete_orphaned_guest_reflections_older_than`; no user table missing from deletion.

**Data scoping:** ✅ GET routes that return rows filter by `user_id` or ownership (e.g. `get_reflection_route` checks `row["user_id"] == user_id`; `history_get_one` checks `user_identifier`).

**Supabase RLS:** ⚠️ `supabase_rls_setup.sql` covers reflections, mood_checkins, revisit_reminders, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles. Does **not** include `beta_feedback`, `user_usage`, or `webhook_events`. Backend uses service key (bypasses RLS); RLS is for anon-key safety if ever used.

**Logging sensitive data:** ✅ No `logger.info`/`warning` of user `thought` or journal content; `_server_error` logs exception type only.

---

### C. AUTHENTICATION

**Route auth map:** All routes either use `Depends(require_user_id)` or are explicitly unauthenticated (guest, webhook, health, root). No ambiguous routes.

**JWT:** ✅ `auth.py`: `algorithms=["HS256"]`, `audience="authenticated"`, expiry via `ExpiredSignatureError`; signature verified with `SUPABASE_JWT_SECRET`.

**Token refresh:** ⚠️ Not audited in depth; frontend uses Supabase client — typical pattern is session refresh; no explicit “re-login on 401” flow verified in one place.

**Auth init race:** ✅ `App.js` line 636: `if (loading) return (...Loading…);` prevents rendering protected content before auth resolves.

**Sign-out:** ✅ Sign-out clears thought, reflection, viewing ids, history, closing, modals, localStorage key; no in-flight API cancellation (acceptable).

**Service key:** ✅ Only in backend env; frontend uses anon key only.

---

### D. PERFORMANCE & RELIABILITY

**LLM chain:** get_reflection: 3 calls (classify, questions, sections). Mirror report: 2 calls (archetype, report). Sequential; no parallelization of independent steps in same flow.

**Error recovery:** Timeout/429/500: openai_client retries 429/500/503; frontend shows toasts/fallbacks; no generic “hang forever” on parse errors where checked.

**Double-submit:** ✅ `isReflectSubmitting` guards reflect submit; question submit flows through single completion handler.

**Cold start:** ⚠️ No keep-alive for Railway; first request after idle can be 10–30s.

**Retry:** ✅ Backend `_chat` retries 429/500/503; frontend does not retry on 5xx (user sees error).

---

### E. REACT-SPECIFIC

**Keys:** `.map()` usage in App.js, ReflectionFlow, etc. — keys present on list items (e.g. `key={item.id}`, `key="journey"`).

**Error boundary:** ✅ `index.js`: `AppErrorBoundary` and `ErrorBoundary` wrap app/route.

**Stale closures / deps:** Not fully enumerated; no obvious `useEffect` with missing deps that would break core flows.

**Conditional hooks:** None observed.

---

### F. USER EXPERIENCE

**Loading states:** Reflect, mirror, mood, closing have loading indicators or disabled states. Mirror report starts when questions complete (background fetch).

**Empty states:** History empty, no insights — messages present. Offline/accessibility not fully audited.

---

### G. CAPACITOR / iOS

**capacitor.config.json:** ✅ `appId`: "com.reflect.app"; `webDir`: "build"; no `server.url` localhost; `androidScheme`: "https" (under server); plugins present. No `backgroundColor` at top level (StatusBar plugin has backgroundColor).

**Info.plist / icons / splash:** Not read; audit assumes to be confirmed separately.

---

### H. PERSONALIZATION

✅ `_build_personalization_block` in openai_client.py; used in get_reflection, get_personalized_mirror, get_closing, get_mirror_report. Routes pass `user_context`/pattern_history. Refresh after reflection via background task. theme_history in schema/update; first reflection handled (empty block).

---

### I. CODE HEALTH

**App.js:** Large (~1000 lines); many pieces of state; could be split into hooks/components later.

**TODOs/FIXMEs:** None in frontend/src or backend (grep).

**Config:** Backend URL in config.js is hardcoded fallback; rate limits and model names in server/openai_client.

---

### J. DEPLOYMENT

**Railway:** ✅ `backend/Procfile`: `uvicorn server:app --host 0.0.0.0 --port $PORT`.

**Vercel:** ✅ `vercel.json` at repo root: `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]`; `outputDirectory`: "build". If Vercel root is repo root, ensure build runs from `frontend` (e.g. Root Directory = frontend) or adjust.

**Startup validation:** ✅ `startup()` requires SUPABASE_*, JWT, LLM keys; fails fast with clear message.

**Health:** ✅ `GET /api/health` returns status and database reason; `GET /api/health/llm` checks LLM.

**Logging:** ✅ `logging.basicConfig`; logs to stdout; format includes level.

---

### K. LEGAL & COMPLIANCE

**Privacy (privacy.html):** ✅ Collects account, reflection content, mood, usage; OpenAI processing disclosed; storage (Supabase); rights (delete, contact); retention; children under 13; contact support@reflectapp.com; last updated Feb 2026. No placeholders.

**Terms (terms.html):** ✅ Not medical advice; not mental health service; crisis wording; limitation of liability; content ownership; acceptable use; contact. No placeholders.

**In-app disclaimer:** ✅ Footer in App.js: “This is a reflection space, not therapy. If you're in crisis, please reach out to a mental health professional.”

---

### L. OBSERVABILITY

❌ No Sentry or frontend error tracking. ❌ No LLM call duration/token logging. API 500s use `_server_error` (logs exception, returns generic message). No user analytics.

---

## Phase 3 — Cleanup Done

- Removed temporary `console.log('[mirror timing] ...')` from `ReflectionFlow.jsx` and `MirrorEntry.jsx`; removed unused `useEffect` import from `MirrorEntry.jsx`.

---

## Phase 4 — Rating & RoadMAP

## Score: 6.5/10

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | API Security | 8/10 | Routes protected; rate limits and request first param in place; CORS env-based; input limits |
| 2 | Data Security | 7/10 | No secrets in code; delete complete; RLS missing for beta_feedback/user_usage |
| 3 | Authentication | 8/10 | JWT correct; loading state; sign-out clears state; no service key in frontend |
| 4 | Performance & Reliability | 5/10 | 120s timeout; no frontend retry; cold start not addressed |
| 5 | React Code Quality | 7/10 | Error boundaries; keys present; App.js large but functional |
| 6 | User Experience | 6/10 | Loading states; mirror fetch on questions complete; empty states present |
| 7 | Personalization | 8/10 | Context flows; theme_history; graceful first reflection |
| 8 | App Store Compliance | 6/10 | Privacy/terms/disclaimer present; Info.plist/icon/splash to confirm |
| 9 | Payment Readiness | 3/10 | RevenueCat in; no paywall UI; webhook present |
| 10 | Deployment Health | 7/10 | Procfile; health checks; startup validation; Vercel rewrites |
| 11 | Legal & Compliance | 8/10 | Privacy/terms complete; OpenAI disclosure; crisis disclaimer in-app |
| 12 | Observability | 4/10 | No error tracking; no LLM timing/token logs |
| | **WEIGHTED TOTAL** | **6.5/10** | (1+2+3 weighted 2x) |

---

## 🚨 STOP — These Are Dangerous Right Now

**None.** No auth bypass, no `body.user_id`, no secrets in frontend.

---

## 🔴 Fix Before Any Launch

1. **Backend URL in frontend** — `frontend/src/lib/config.js` line 5: `RAILWAY_BACKEND_URL` hardcoded. Prefer `process.env.REACT_APP_BACKEND_URL` for production and set in Vercel; keep hardcode only as fallback if desired.
2. **RLS for user tables** — Add RLS policies for `beta_feedback` and `user_usage` in Supabase (or document that backend-only access is acceptable).

---

## 🟡 Fix Before App Store Submission

3. Confirm **Info.plist** usage descriptions, **AppIcon** assets, **splash** screen.  
4. Add **frontend error tracking** (e.g. Sentry).  
5. Optional: **LLM timing/token** logs for cost and latency.

---

## 🟢 What's Genuinely Solid

- **Auth:** JWT with HS256 and expiry; no spoofing; loading state before render.  
- **CORS & startup:** Env-based origins; production blocks `*`; required env validated at startup.  
- **Account deletion:** All user tables deleted; optional auth user removal; privacy/terms and in-app crisis disclaimer.

---

## 🐛 Actual Bugs Found

- None that break core flows. Rate limiting and request-order issues from earlier audit are fixed.

---

## ⚡ Performance Issues

- **Cold start:** No keep-alive; first request after idle can be 10–30s.  
- **LLM timeout:** 120s backend; no separate frontend timeout or retry.

---

## 💰 Payment Gateway — Current State

**Done:** RevenueCat SDK/context; reflection limit checks; Lemon Squeezy webhook and env placeholders.  
**Missing:** Paywall UI; subscription gating in UI; Lemon Squeezy variant IDs and full webhook wiring.  
**Rough time to working paywall:** 1–2 days for minimal in-app paywall + webhook + gating.

---

## 🍎 App Store — Missing Items

- Confirm Info.plist, AppIcon, splash.  
- Confirm in-app mental health disclaimer visibility (footer present).  
- Error tracking recommended before launch.

**Realistic time to submission:** 1–2 weeks including paywall and final compliance check.

---

## 👁️ Observability Gaps

- No frontend error reporting.  
- No LLM call duration/model/token logs.  
- 500s logged with exception type only (no request id in log format).

---

## 📋 Cleanup Summary

**Modified:**
| File | What changed |
|------|---------------|
| ReflectionFlow.jsx | Removed `console.log('[mirror timing] fetch started at:', Date.now())` |
| MirrorEntry.jsx | Removed timing `useEffect` and `console.log`; removed unused `useEffect` import |

**Deleted:** None.

**Flagged (Need Your Call):**
| What | Where | Question |
|------|-------|----------|
| Backend URL | frontend/src/lib/config.js | Env-only vs hardcoded fallback? |
| Vercel root | vercel.json at repo root | Is Root Directory set to `frontend` in Vercel? |

**🚨 Secrets Found:** NONE — Clear.

**TODOs/FIXMEs:** None in frontend/src or backend.

---

## 🗺️ Next Steps — Exact Priority Order

**Do right now (today):**
1. Decide backend URL: env-only or keep hardcoded fallback; document in README/config.
2. Add RLS for `beta_feedback` and `user_usage` in Supabase (or accept backend-only).

**Do this week:**
3. Add Sentry (or similar) for frontend errors.
4. Confirm Vercel Root Directory and build output (frontend vs root).
5. Optional: LLM timing/token logging in backend.

**Before App Store submission:**
6. Confirm Info.plist, AppIcon, splash.
7. Build minimal paywall + webhook + gating.

**After launch:**
8. Keep-alive or cron for Railway to reduce cold-start impact.
9. Structured logs with request id for 500s.

---

## The One Thing

**Add frontend error tracking (e.g. Sentry).** Without it, production errors show up as user complaints and uninstalls instead of alerts; one integration gives you a clear next improvement path (LLM logs, RLS, cold start) once you can see what’s actually failing.
