# REFLECT — Senior Dev Production Review

**Reviewed:** 2026-02-05  
**Codebase summary:** REFLECT is a coherent React + FastAPI journaling app with Supabase auth, OpenAI/OpenRouter LLM, and a clear separation between guest and authenticated flows. Auth is correctly gated with JWT and `require_user_id`; no `body.user_id` spoofing. CORS and env validation at startup are in place. The main risks are rate limiting on two mirror report routes (request not first param), two un-rate-limited mutation routes (mood, history save), and missing observability (no error tracking, no LLM timing logs). Codebase has some console.logs, TODOs, and a large App.js that would benefit from splitting. Account deletion and privacy policy cover the expected surfaces; paywall is not yet built.

---

## Score: 6.2/10

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | API Security | 7/10 | Route protection and CORS solid; rate limiting broken on 2 routes, 2 routes have no limit |
| 2 | Data Security | 7/10 | No secrets in code; delete_user_data covers main tables; RLS/secret scan assumed OK |
| 3 | Authentication | 8/10 | JWT correct (HS256, expiry); sign-out clears state; auth init has loading |
| 4 | Performance & Reliability | 5/10 | httpx timeout 120s; no frontend retry; cold start not addressed |
| 5 | React Code Quality | 6/10 | Some console.logs; no Error Boundary; large App.js |
| 6 | User Experience | 6/10 | Loading states present; empty/offline/accessibility not fully audited |
| 7 | Personalization | 7/10 | Context flows through; theme_history in schema |
| 8 | App Store Compliance | 6/10 | Privacy/terms present; Info.plist/icon/splash not fully audited |
| 9 | Payment Readiness | 3/10 | RevenueCat installed; no paywall; webhook present |
| 10 | Deployment Health | 6/10 | Startup validation, health endpoint, Vercel rewrites; cold start |
| 11 | Legal & Compliance | 7/10 | Privacy has OpenAI disclosure; mental health disclaimer in-app not confirmed |
| 12 | Observability | 4/10 | No Sentry; no LLM timing/token logs; 500s logged with context |
| | **WEIGHTED TOTAL** | **6.2/10** | (1+2+3 weighted 2x) |

---

## 🚨 STOP — These Are Dangerous Right Now

**None.** No data leaks, auth bypasses, or spoofing found. `user_id` is always from `Depends(require_user_id)`.

---

## 🔴 Fix Before Any Launch

1. **Rate limiting may not apply to mirror report routes**  
   **Where:** `backend/server.py` lines 656–661 and 711–716.  
   **What:** `mirror_report` and `mirror_report_guest` have `body: MirrorReportRequest` as first parameter, then `request: Request`. Slowapi typically uses the first parameter to get the request; if it’s not `Request`, rate limiting can be skipped.  
   **Fix:** Put `request: Request` first, e.g.  
   `def mirror_report(request: Request, body: MirrorReportRequest, user_id: str = Depends(require_user_id)):`  
   Same for `mirror_report_guest`.

2. **Un-rate-limited mutation routes**  
   **Where:** `backend/server.py`: `POST /api/mood` (line 912), `POST /api/history` (line 936).  
   **What:** No `@limiter.limit()` on these routes. Authenticated but no per-IP/per-user cap.  
   **Fix:** Add e.g. `@limiter.limit("30/hour")` and ensure `request: Request` is the first parameter for each.

3. **Hardcoded backend URL in frontend**  
   **Where:** `frontend/src/lib/config.js` line 5:  
   `const RAILWAY_BACKEND_URL = "https://reflect-app-production.up.railway.app";`  
   **What:** Production URL is in source; changing backend URL requires a frontend deploy.  
   **Fix:** Prefer `process.env.REACT_APP_BACKEND_URL` for production too, set in Vercel env; keep hardcoded only as fallback if you accept the tradeoff.

---

## 🟡 Fix Before App Store Submission

4. **Console.log in frontend**  
   **Where:** `useMirrorReport.js`, `MirrorSlide.jsx`, `PaywallLimitModal.jsx`, `SettingsPanel.jsx`, `guestSession.js` (and any others).  
   **Fix:** Remove `console.log`/`console.warn`/`console.debug` from `frontend/src`; keep `console.error` only in catch blocks.

5. **No React Error Boundary**  
   **Where:** `App.js` (or root) — no `<ErrorBoundary>`.  
   **Fix:** Add an error boundary at the app root so unhandled component errors show a fallback UI instead of a blank screen.

6. **vercel.json at repo root**  
   **Where:** Audit asked for `frontend/vercel.json`; actual file is `vercel.json` at project root.  
   **Fix:** If Vercel is set to use “Frontend” or `frontend` as root, ensure `buildCommand`/`outputDirectory` point to the right place, or move `vercel.json` into `frontend/` and set root in Vercel dashboard.

7. **TODOs in code**  
   **Where:** `frontend/src/lib/reflectionMode.js` lines 6 and 56 — “When Supabase Auth is added…”.  
   **Fix:** Remove or update; auth is already in place.

---

## 🟢 What's Genuinely Solid

- **Auth:** JWT validated with `algorithms=["HS256"]`, expiry and audience checked; no `user_id` from body.
- **CORS:** `ALLOWED_ORIGINS` from env; production blocks `*`; regex for Vercel if configured.
- **Startup:** Required env vars validated in `startup()`; missing keys fail fast with clear errors.
- **Account deletion:** `delete_user_data` removes mood_checkins, revisit_reminders, reflections, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles, beta_feedback, user_usage; optional auth user deletion.
- **Privacy policy:** Covers collection, OpenAI use, storage (Supabase), rights, deletion, retention, children, contact; last updated and real contact email.

---

## 🐛 Actual Bugs Found

- **Rate limit possibly skipped on mirror report:** As above — `request` not first on `mirror_report` and `mirror_report_guest`. Result: those routes may have no effective rate limit until fixed.
- **No other user-impacting bugs identified** in the paths audited (auth, server routes, config, delete flow, privacy).

---

## ⚡ Performance Issues

- **LLM timeout:** `openai_client._chat` uses `httpx.Client(timeout=120.0)`. Long-running OpenAI calls can hold the request 2 minutes; no separate frontend timeout or retry.
- **Cold start:** No keep-alive for Railway; first request after idle can be 10–30s. Consider a cron ping or accept first-request latency.
- **No parallelization** of independent LLM steps in the reflection flow (e.g. mood + pattern) — sequential only in the code paths checked.

---

## 💰 Payment Gateway — Current State

**Done:** RevenueCat SDK and context; reflection limit checks; Lemon Squeezy webhook and env placeholders in `.env.example`.  
**Missing:** Paywall UI, subscription gating in UI, Lemon Squeezy variant IDs and full webhook wiring, user-facing “upgrade” flow.  
**Rough time to working paywall:** 1–2 days for minimal in-app paywall + webhook + gating.

---

## 🍎 App Store — Missing Items

- Confirm **Info.plist** usage descriptions (notifications, etc.) and **ITSAppUsesNonExemptEncryption**.
- Confirm **AppIcon** assets and **splash** screen (capacitor.config has no `server.url` localhost — good).
- **In-app mental health disclaimer** (“Not therapy / not a crisis resource”) — confirm visibility; Apple often expects this for journaling/wellness apps.
- **Observability:** No error tracking (e.g. Sentry); first line of support will be user reports.

---

## 👁️ Observability Gaps

- No frontend error reporting (e.g. Sentry/LogRocket).
- No LLM timing, model, or token-count logs; cost/slowness will be hard to diagnose.
- API errors use `_server_error()` (logs exception, returns generic message) — good; ensure log format includes route and request id if you add them later.

---

## 📋 Cleanup Summary

**Modified:** None in this pass (Phase 3 not executed).  

**Recommended (Phase 3):**
- Remove all `console.log`/`console.warn`/`console.debug` from `frontend/src` (keep `console.error` in catch only).
- Remove or resolve TODOs in `reflectionMode.js`.
- Add `request: Request` as first parameter to `mirror_report` and `mirror_report_guest`; add rate limits to `mood` and `history_save`.
- Optionally: split `App.js` (e.g. custom hook for auth/state, smaller root component).

**Deleted:** None.  

**Flagged (Need Your Call):**
- Hardcoded Railway URL in `config.js` — accept or move to env.
- `vercel.json` at root vs `frontend/` — confirm Vercel project root and build settings.

**🚨 Secrets Found:** NONE — Clear. Service key only in backend env; frontend uses anon key only.

**TODOs/FIXMEs:**
| Comment | File:Line | Still relevant? |
|---------|-----------|-----------------|
| When Supabase Auth is added... | reflectionMode.js:6, 56 | No — auth is in place; remove or reword. |

---

## 🗺️ Next Steps — Exact Priority Order

**Do right now (today):**
1. Fix `mirror_report` and `mirror_report_guest` so `request: Request` is the first parameter (and confirm rate limiting with a quick test).
2. Add `@limiter.limit("30/hour")` (or similar) to `POST /api/mood` and `POST /api/history`, with `request: Request` first.
3. Remove or replace `console.log`/`console.warn` in `frontend/src` (and any debug logs in production paths).

**Do this week:**
4. Add a React Error Boundary at app root.
5. Resolve or remove TODOs in `reflectionMode.js`.
6. Decide on backend URL: env-only vs hardcoded fallback and document in README or config.

**Before App Store submission:**
7. Confirm Info.plist, AppIcon, splash, and in-app mental health disclaimer.
8. Consider adding Sentry (or similar) for frontend and optional backend.

**After launch:**
9. Add LLM call timing (and optionally token) logging.
10. Consider keep-alive or cron for Railway to reduce cold-start impact.

---

## The One Thing

**Fix the mirror report rate limiting** — put `request: Request` first on both mirror report routes and verify the limiter runs. Those endpoints call the LLM and are exposed to guests; without rate limiting they are the most likely to be abused and to burn budget or overload the provider.
