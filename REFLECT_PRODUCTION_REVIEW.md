# REFLECT — Senior Dev Production Review (Master Audit Re-run)

**Reviewed:** 2026-02-05  
**Codebase summary:** REFLECT is a full-stack private journaling app: FastAPI backend (Supabase + LLM provider abstraction), React 19 frontend with Capacitor for iOS. Phase 4 hardening is in place: RLS SQL script exists for all 8 tables, env validation fails fast at startup, root Error Boundary wraps the app, logout clears all session state and shows full-screen login when auth is required, Reflect button is disabled while submitting, and Info.plist sets ITSAppUsesNonExemptEncryption. Auth is JWT-only (no body user id); CORS uses ALLOWED_ORIGINS from env; account deletion covers all user tables. Remaining gaps: RLS script must be run in production Supabase, no error monitoring or LLM metrics, no keep-alive for Railway cold starts, and payment feature-gating is optional.

---

## Score: 7.7/10

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | API Security | 8/10 | Routes protected; rate limits on LLM routes with Request first; CORS env-based; max_length on request bodies; no spoofing. |
| 2 | Data Security | 8/10 | No secrets in code; RLS script covers all 8 tables (must be run in prod); account deletion complete; no sensitive logging. |
| 3 | Authentication | 9/10 | JWT HS256, expiry, audience; auth loading state; logout clears state and redirects to login; service key backend-only. |
| 4 | Performance & Reliability | 6/10 | Sync routes in thread pool (no event-loop block); double-submit prevented; no retry, no keep-alive, no LLM timeout visibility. |
| 5 | React Code Quality | 8/10 | Error Boundary at root; keys on maps; logout clears state; no conditional hooks; refs for one-time callback. |
| 6 | User Experience | 7/10 | Loading states and Reflect disabled while submitting; empty states in history/insights; no offline handling or haptics. |
| 7 | Personalization | 9/10 | Context in reflect/mirror/closing; theme_history capped; refresh after reflection; graceful empty context. |
| 8 | App Store Compliance | 8/10 | Privacy/terms complete; account deletion in-app; Info.plist ITSAppUsesNonExemptEncryption + notifications; no placeholders. |
| 9 | Payment Readiness | 7/10 | RevenueCat integrated; paywall and Customer Center in Settings; no feature gating by isPremium yet. |
| 10 | Deployment Health | 8/10 | Env validation at startup; health check returns DB status; CORS logged; Procfile; no cold-start keep-alive. |
| 11 | Legal & Compliance | 8/10 | Privacy policy covers data, OpenAI, retention, rights, children; terms include not-therapy; crisis line in footer. |
| 12 | Observability | 4/10 | No error tracking, no LLM duration/token logging, no analytics; logs to stdout. |
| | **WEIGHTED TOTAL** | **7.7/10** | (Dims 1–3 weighted 2x: (8+8+9)×2 + 6+8+7+9+8+7+8+8+4 = 115; max 150 → 7.7) |

---

## 🚨 STOP — These Are Dangerous Right Now

**None.** No data leaks, auth bypasses, or body-based user id. Service key is backend-only; RLS script is present (must be applied in production).

---

## 🔴 Fix Before Any Launch

1. **Apply RLS in production** — Run `backend/supabase_rls_setup.sql` in the Supabase SQL Editor for the production project. Until then, direct access with anon key (or a compromised service key) is not constrained by RLS.  
   **Where:** Supabase Dashboard → SQL Editor.  
   **Fix:** Execute the full script; verify all 8 tables show RLS enabled and policies in place.

2. **Set production env vars** — Backend now fails fast if `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, or `ALLOWED_ORIGINS` is missing (and LLM keys when provider is openai/openrouter). Ensure Railway (or your host) has every required variable set.  
   **Where:** `backend/server.py` startup `_require_env()`.  
   **Fix:** Configure env in deployment; otherwise the app will not start (intended).

---

## 🟡 Fix Before App Store Submission

1. **Rate limiting on `mood` and `history_save`** — `POST /api/mood` and `POST /api/history` do not use `@limiter.limit()`. If you add limits, add `request: Request` as first parameter so slowapi can identify the client.  
   **Where:** `server.py` lines 420–422 (mood), 441–442 (history_save).  
   **Fix:** Optional: `@limiter.limit("30/minute")` and `def mood(request: Request, body: MoodRequest, ...)` (and same for history_save).

2. **Railway cold start** — First request after idle can take 10–30s. No keep-alive.  
   **Where:** No cron or ping to backend.  
   **Fix:** Optional: external cron hitting `GET /api/health` every 10–15 minutes, or Railway paid tier that doesn’t spin down.

3. **Vercel routing** — If you use client-side routes beyond `/`, `/privacy`, `/terms`, ensure `vercel.json` has a catch-all rewrite so refresh doesn’t 404.  
   **Where:** `frontend/vercel.json`.  
   **Fix:** Already has rewrites for /privacy and /terms; add any other SPA paths if needed.

4. **Capacitor config JSON** — `capacitor.config.json` has a trailing `}},` that may be invalid (double `}` before `"ios"`).  
   **Where:** `frontend/capacitor.config.json`.  
   **Fix:** Confirm valid JSON; if build fails, fix nesting.

---

## 🟢 What's Genuinely Solid

1. **Auth and authorization** — Every protected route uses `Depends(require_user_id)`; `user_id` never comes from the request body. `auth.py` uses `algorithms=["HS256"]`, audience, and expiry. Ownership checks on by-id reads (reflection, saved_reflection, reminder).

2. **Logout and session isolation** — On sign-out, App clears thought, reflection, viewingReflectionId, viewingSavedId, revisitLaterIds, dueReminders, historyAll, closingText, pendingSaveAfterSignIn, and localStorage REVISIT_LATER_KEY; when auth is required, full-screen AuthScreen is shown so no prior user data is visible.

3. **Production hardening in code** — Env validation at startup; root Error Boundary with fallback and reload; Reflect button disabled and “Reflecting…” while the LLM request is in flight; Info.plist export compliance; RLS script covering all 8 user-data tables.

4. **Personalization pipeline** — Single place for context building; theme_history capped; refresh after reflection via background task; empty context handled without KeyError.

5. **Legal and in-app safety** — Privacy policy covers collection, OpenAI use, retention, rights, children; terms state not therapy; footer disclaimer and crisis line; account deletion in-app with full table coverage.

---

## 🐛 Actual Bugs Found

1. **capacitor.config.json syntax** — Possible extra `}` making the JSON invalid.  
   **Trigger:** Opening or building the Capacitor app.  
   **Fix:** Validate JSON and fix brace nesting (e.g. `"server":{"androidScheme":"https"},"plugins":{...},"ios":{...}}`).

No other confirmed bugs in the flows audited (reflect → mirror → mood → closing, history, profile, logout, auth gate).

---

## ⚡ Performance Issues

- **Cold start:** First request after Railway idle is slow; no mitigation in code.
- **Reminders due:** `GET /api/reminders/due` fetches all due reminders then filters by user’s reflection IDs in Python — correct but will not scale to very large reminder tables; consider filtering in DB.
- **No retry:** Transient LLM or network failures show a single error; no automatic retry.

---

## 💰 Payment Gateway — Current State

**Done:** RevenueCat SDK integrated; configure on native; logIn/logOut on auth change; `presentPaywall`, `presentPaywallIfNeeded`, `presentCustomerCenter`, `restorePurchases`; Settings exposes paywall and Customer Center; `isPremium` available from context.

**Missing (ordered):** (1) Define products/entitlements in RevenueCat dashboard; (2) optional feature gating (e.g. limit insights or reflections by isPremium); (3) optional webhook for server-side receipt validation.  
**Estimated time to working paywall:** ~1–2 hours (products + test); feature gating extra.

---

## 🍎 App Store — Missing Items

- Run RLS script in production Supabase.
- Confirm export compliance answer in App Store Connect matches `ITSAppUsesNonExemptEncryption` (false = no custom encryption).
- Ensure all required Info.plist usage descriptions are present (notifications already set).
- Optional: `limitsNavigationsToAppBoundDomains` if you want to restrict in-app links.

**Realistic time to submission:** 1–2 days after RLS applied and env confirmed (assuming no new findings during TestFlight).

---

## 👁️ Observability Gaps

- No frontend error reporting (e.g. Sentry).
- No LLM call logging (duration, model, token count).
- No backend error tracking or alerting on 5xx.
- No product analytics (aggregate usage only).
- Logging is to stdout with level and message only (no structured fields).

---

## 📋 Cleanup Summary (From Previous Audit + Phase 4)

**Modified (Phase 4 / this run):**  
- `backend/server.py` — Startup env validation; comment on sync handlers and thread pool.  
- `frontend/src/components/AppErrorBoundary.jsx` — New. Root Error Boundary.  
- `frontend/src/index.js` — Wrap app in AppErrorBoundary.  
- `frontend/src/App.js` — Clear state on logout (effect + prevUserRef); full-screen Auth when authRequired && !user; isReflectSubmitting + guard in handleSubmit; pass isSubmitting to InputScreen.  
- `frontend/src/components/InputScreen.jsx` — isSubmitting prop; button disabled and “Reflecting…” while submitting.  
- `frontend/ios/App/App/Info.plist` — ITSAppUsesNonExemptEncryption = false.  
- `backend/supabase_rls_setup.sql` — Already added earlier; covers all 8 tables.

**Deleted:** None this run.

**Flagged (Need Your Call):**  
- Rate limit on `/api/mood` and `/api/history` (optional).  
- Keep-alive for Railway (optional).  
- Capacitor config JSON validity (confirm by building).

**🚨 Secrets Found:** NONE — Clear. No `.supabase.co` URLs, no `sk-` keys, no JWT blobs, no service key in frontend.

**TODOs/FIXMEs:** Not re-scanned this run; recommend a quick grep for TODO/FIXME/HACK and resolve or document.

---

## 🗺️ Next Steps — Exact Priority Order

**Do right now (today):**  
1. Run `backend/supabase_rls_setup.sql` in production Supabase SQL Editor.  
2. Confirm production env vars (SUPABASE_*, ALLOWED_ORIGINS, LLM keys as needed).  
3. Validate `frontend/capacitor.config.json` (run build and `npx cap sync`).

**Do this week:**  
4. Optionally add rate limits to `POST /api/mood` and `POST /api/history` with `request: Request` first.  
5. Optionally set up a simple keep-alive (cron hitting `/api/health`) if on Railway free tier.  
6. Answer export compliance in App Store Connect and do a TestFlight build.

**Before App Store submission:**  
7. Final pass on privacy/terms and in-app disclaimer.  
8. Test full flow on device: auth, reflect, logout, sign back in, account delete.

**After launch:**  
9. Add error tracking (e.g. Sentry) and basic LLM metrics (duration/tokens).  
10. Consider retry once for transient LLM/network errors.

---

## The One Thing

**Apply RLS in production.** The script is in the repo and correctly scopes all eight tables to `auth.uid()`. Until it’s run in the live Supabase project, a leaked or misused key could bypass app-level checks and access all user data. Everything else in this audit improves safety or polish; RLS is the one change that locks the database to the intended security model.
