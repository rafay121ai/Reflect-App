# REFLECT — Production Readiness Audit

**Auditor:** Senior staff engineer (pre-launch review)  
**Scope:** Backend (server.py, openai_client.py, supabase_client.py, lemon_squeezy_client.py, auth.py), Frontend (App.js, AuthContext, lemonSqueezy, config, ReflectionFlow, MirrorSlides, useMirrorReport, PaywallLimitModal, SettingsPanel, guestSession), Config (index.html, vercel.json, Procfile).  
**Rules:** Findings only from actual code. No polite passes. Every CRITICAL has an exact fix.  
**State:** Post-hardening (webhook, mirror retry, reflect logs, devError, get_due_reminders, SaveHistoryRequest, Export/Delete UI).

---

## 1. AUTHENTICATION & SESSION SECURITY

**Rating: 8/10**  
**Status: PASS**

### Findings

- **[LOW] AuthContext logs errors to console in all environments**  
  **Where:** `frontend/src/contexts/AuthContext.jsx` — `console.error("Code exchange failed:", exchangeError)` (line 88) and `console.error("Auth init error:", err)` (line 119).  
  **Impact:** In production, failed code exchange or init can log error objects (and possibly tokens or URLs) to the browser console.  
  **Fix:** Use a dev-only logger, e.g. `if (process.env.NODE_ENV !== "production") console.error(...)`, or a shared `devError` helper as in App.js.

- **Verified:** JWT is verified on every protected route via `require_user_id` (auth.py); audience `"authenticated"`, HS256. Token expiry returns 401 "Token expired"; frontend handles 401 in handleSaveHistory with session-invalid toast.  
- **Verified:** Sign-out: `supabase.auth.signOut()` triggers `onAuthStateChange` with session null; `setAuthToken(null)` is called; App useEffect clears state and REVISIT_LATER_KEY when `user` becomes null.  
- **Verified:** No route uses `user_id` from the request body for authorization; `SaveHistoryRequest` has no `user_identifier`; history_save uses `user_id` from `Depends(require_user_id)` only.  
- **Verified:** Guests cannot access authenticated data; list/get endpoints use `Depends(require_user_id)` and filter by `user_id`. Cross-user access prevented (e.g. get_reflection_route, history_get_one, _check_saved_reflection_owner).  
- **Verified:** Auth race: App shows "Loading…" until `loading` is false; main content renders only after auth init completes.

---

## 2. DATA LOSS RISKS

**Rating: 7/10**  
**Status: PASS (with notes)**

### Findings

- **[MEDIUM] Save-after-sign-in or mid-flow save failure has no in-flow retry**  
  **Where:** App.js — `handleSaveHistory` / `performSaveHistory` on failure shows toast "Could not save reflection. Try again." but there is no "Retry save" button in the reflection flow.  
  **Impact:** If the user hits a transient network/5xx when saving at the end of the flow, they must complete another reflection to trigger save again (or hope My reflections refetch shows it if save partially succeeded).  
  **Fix:** Optionally add a "Retry saving" action when the last save failed (e.g. store lastFailedSave in state and show a small retry CTA on closing or in My reflections).

- **[MEDIUM] Mid-flow refresh loses in-progress reflection state**  
  **Where:** App.js — thought, reflection, questionResponses, etc. are React state only.  
  **Impact:** User in the middle of questions/mirror/closing loses everything on refresh.  
  **Fix:** Document in UX; optionally persist minimal state (e.g. thought + reflectionId) to sessionStorage and offer "Resume reflection?" on mount (product decision).

- **Verified:** If `/api/reflect` fails after LLM but before DB insert, server raises and does not return sections; frontend only sets reflection on success; usage is rolled back on exception. User can retry with same thought.  
- **Verified:** Mirror report fetch failure: useMirrorReport exposes `error` and `retry`; effect depends on `retryCount`; ReflectionFlow shows "Something went wrong loading your mirror." and "Try again" button.  
- **Verified:** Closing fetch failure is caught in handleGetClosing; fallback closing text is set so user always sees something.  
- **Verified:** Guest data: localStorage + optional guest-save to DB; guest_id stable so data persists across tab close/reopen.

---

## 3. DATA LEAKS & PRIVACY

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[LOW] AuthContext and SettingsPanel still use console.error in production**  
  **Where:** AuthContext.jsx (code exchange, auth init); SettingsPanel.jsx `console.error("Failed to delete account:", err)` (line 283); AppErrorBoundary.jsx logs caught errors to console.  
  **Impact:** Error objects and stack traces can appear in production console; low risk of PII but not ideal.  
  **Fix:** Guard with `process.env.NODE_ENV !== "production"` or use a shared devError/logger that is no-op in production.

- **Verified:** Server logs use `logger.exception` / `logger.warning` with type(e).__name__ or user prefix; no user thought or journal content logged. reflect_success logs user prefix + reflection_id (or guest_id=anon).  
- **Verified:** Webhook logs only email prefix; no full PII. All list/get APIs scope by `user_id` from JWT. Supabase service key only in backend env. CORS uses ALLOWED_ORIGINS; production blocks `*` with credentials. No endpoint returns enumerable user IDs or emails.

---

## 4. PAYMENT & SUBSCRIPTION INTEGRITY

**Rating: 8/10**  
**Status: PASS**

### Findings

- **[MEDIUM] Guest or unknown user can open checkout URL without session**  
  **Where:** Checkout is only opened when `user?.id` is present (PaywallLimitModal, SettingsPanel). If someone bookmarks or shares a checkout URL built with another user's id, or opens without being signed in, webhook may receive custom_data.user_id; if email doesn't match any profile, we return 200 with `warning: "no_user_match"` and don't update.  
  **Impact:** User pays but no account is linked; no automatic way to attach purchase later.  
  **Fix:** Already mitigated by requiring sign-in before opening checkout in UI. Document: never open checkout without passing the logged-in user's id and email.

- **Verified:** Webhook verifies signature with `hmac.compare_digest`. `record_event(event_id, event_name)` is called only after successful `update_user_plan`; on exception we log `webhook_update_failed` and return 500 so Lemon Squeezy retries.  
- **Verified:** Duplicate events: `is_duplicate_event` before processing; `record_event` only after success. When `user_id` is missing after resolution we log `webhook_no_user_match` and return 200 with warning.  
- **Verified:** Post-checkout: lemonSqueezy.js `waitForPlanUpdate` polls `/api/usage` with `getAuthToken`; toast "Your mirror is ready. Activating your plan…" and if not updated "Your plan is activating — it may take a moment. Refresh if needed."; then reload.  
- **Verified:** plan_type is never taken from frontend; server uses RC + user_usage from DB. Subscription cancelled/expired sets plan to trial.

---

## 5. ERROR HANDLING & RESILIENCE

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[MEDIUM] No frontend error reporting service**  
  **Where:** Errors go to console (or devError in App.js) and toasts; no Sentry or similar.  
  **Impact:** Production JS errors and failed requests are not aggregated or alerted.  
  **Fix:** Add a small frontend error reporter (e.g. Sentry) with PII stripped; or at minimum log to a backend endpoint for last-N errors.

- **[LOW] LLM failures logged without response snippet**  
  **Where:** server.py / openai_client log exception type; no response body or status code.  
  **Impact:** Harder to debug provider/JSON errors in production.  
  **Fix:** Log a short hash or length of last response (not full content) and status code if available.

- **Verified:** OpenAI/Supabase/backend down: server returns 502/500 with generic message; frontend shows toast ("We couldn't load your reflection. Try again." etc.). Critical async paths wrapped in try/catch or .catch().  
- **Verified:** App wrapped in AppErrorBoundary and ErrorBoundary (index.js). Malformed LLM output: mirror report and others have JSON fallbacks; pattern extraction returns None on parse failure. Loading states present for reflect, mirror report, closing.

---

## 6. RATE LIMITING & ABUSE

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[MEDIUM] Guest reflection endpoints are per-IP only**  
  **Where:** server.py — `/api/reflect/guest` 10/minute, `/api/mirror/report/guest` 5/minute, etc. use `get_remote_address`.  
  **Impact:** One IP can burn guest reflections per minute; distributed IPs could exhaust LLM budget.  
  **Fix:** Acceptable for beta; for scale consider stricter guest limits or optional CAPTCHA/token for first guest reflection.

- **Verified:** Authenticated `/api/reflect` is 20/hour with `request: Request` as first parameter; limit applied. Reflection limit enforced server-side via user_usage/RC; direct API calls cannot bypass. No endpoint returns bulk data suitable for large-scale enumeration.

---

## 7. INPUT VALIDATION & INJECTION

**Rating: 8/10**  
**Status: PASS**

### Findings

- **[LOW] Prompt injection mitigation is instruction-only**  
  **Where:** backend/security.py — `sanitize_for_llm` prepends an "ignore instructions" block; does not strip or block tokens.  
  **Impact:** Determined user could still try to inject instructions; impact limited because LLM is used only for reflection text.  
  **Fix:** Optional: blocklist for obvious instruction patterns or max length per segment; keep current approach as baseline.

- **Verified:** Pydantic models enforce max lengths (e.g. thought 5000, mirror_response 50000). Supabase client uses parameterized APIs; no raw SQL with user input. No dangerouslySetInnerHTML or raw HTML from user content in reviewed frontend.

---

## 8. FRONTEND RELIABILITY

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[MEDIUM] Browser back/forward may desync app state**  
  **Where:** SPA with vercel rewrites to index.html; no `popstate` handling to sync state with history.  
  **Impact:** User hits back and may see a previous step with stale or inconsistent state.  
  **Fix:** Optional: use history state (e.g. step index) and sync on popstate; or document that back/forward is not fully supported in the flow.

- **Verified:** Mirror report fetch failure has retry and "Try again" UI. Event listeners (history dropdown click-outside) and timeouts (revisitBannerTimeoutRef) are cleaned up. MirrorSlides uses requestAnimationFrame and cancels on unmount. History/usage refetched when opening dropdown/Settings. Safari: WebkitBackdropFilter used where backdrop blur is needed.

---

## 9. MOBILE & CROSS-BROWSER

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[LOW] Viewport and small screens (e.g. 320px) not explicitly validated**  
  **Where:** Tailwind and max-widths used; no explicit 320px or small-viewport tests in reviewed files.  
  **Impact:** Possible layout or tap-target issues on very small devices.  
  **Fix:** Manual test or add 320px viewport test; ensure touch targets ≥ 44px where required.

- **Verified:** MirrorSlides uses pointer events and changedTouches for tap position. index.html has viewport and viewport-fit=cover. No obvious Safari-incompatible APIs.

---

## 10. PERFORMANCE & RELIABILITY

**Rating: 8/10**  
**Status: PASS**

### Findings

- **[LOW] Single uvicorn worker**  
  **Where:** backend/Procfile: `uvicorn server:app --host 0.0.0.0 --port $PORT`.  
  **Impact:** One process; cold start and no parallelism.  
  **Fix:** For production scale, consider gunicorn with multiple workers (comment in Procfile); document that single-worker is acceptable for current traffic.

- **Verified:** `get_due_reminders(user_id)` is user-scoped: fetches reflection ids for that user then reminders in that set; no server-side filter over all reminders. No N+1 in reviewed Supabase usage. No aggressive polling; waitForPlanUpdate only after checkout.

---

## 11. OBSERVABILITY & INCIDENT RESPONSE

**Rating: 6/10**  
**Status: WARN**

### Findings

- **[MEDIUM] No frontend error tracking**  
  **Where:** Production relies on toasts and devError (no-op in production); no Sentry or backend error log.  
  **Impact:** Production JS errors and failed requests are not aggregated or alerted.  
  **Fix:** Add frontend error reporter (e.g. Sentry) with PII stripped; or backend endpoint for last-N errors.

- **[LOW] Webhook failure alerting**  
  **Where:** On webhook update failure we log `webhook_update_failed` and return 500; no metric or alert configured.  
  **Impact:** If logging is not monitored, paying users stuck on trial may go unnoticed.  
  **Fix:** Add alerting on `webhook_update_failed` (e.g. log-based metric or structured log consumer).

- **Verified:** reflect_success logged with user prefix + reflection_id (or guest_id=anon). Server uses logger.exception for unhandled errors. Webhook only records event after successful update; failures return 500 and are retried by LS.

---

## 12. LEGAL & COMPLIANCE

**Rating: 7/10**  
**Status: PASS**

### Findings

- **[LOW] Export is "coming soon" only**  
  **Where:** SettingsPanel — "Export data (coming soon)" with sublabel and toast on click.  
  **Impact:** GDPR right to data portability (export) not yet fulfilled.  
  **Fix:** Implement export (e.g. JSON of saved_reflections + profile) or keep as coming soon and document timeline.

- **[LOW] localStorage/cookies not clearly disclosed in audited code**  
  **Where:** Privacy policy link goes to reflect-web-one.vercel.app/privacy.html; content not audited here.  
  **Impact:** If policy doesn't mention localStorage (guest id, reflections cache, onboarding), disclosure is incomplete.  
  **Fix:** Ensure privacy policy mentions localStorage and what keys are used.

- **Verified:** Mental health disclaimer in footer ("This is a reflection space, not therapy..."). Account deletion implemented (DELETE /api/user/account, delete_user_data); Settings has "Delete My Account" with confirm in Danger Zone. No obvious violation of typical OpenAI usage policies in prompts.

---

## FINAL SCORECARD

| Category                      | Rating | Status |
|-------------------------------|--------|--------|
| Auth & Session Security       | 8/10   | PASS   |
| Data Loss Risks               | 7/10   | PASS   |
| Data Leaks & Privacy          | 7/10   | PASS   |
| Payment & Subscription        | 8/10   | PASS   |
| Error Handling                | 7/10   | PASS   |
| Rate Limiting & Abuse         | 7/10   | PASS   |
| Input Validation              | 8/10   | PASS   |
| Frontend Reliability          | 7/10   | PASS   |
| Mobile & Cross-Browser        | 7/10   | PASS   |
| Performance                   | 8/10   | PASS   |
| Observability                 | 6/10   | WARN   |
| Legal & Compliance            | 7/10   | PASS   |
| **OVERALL**                   | **7/10** | **PASS** |

---

## LAUNCH VERDICT

**Ready for a controlled beta** provided the remaining low/medium items are accepted or scheduled. The critical webhook bug (recording event before successful update) is fixed; mirror report failure is recoverable with "Try again"; reflect success is logged; and plan state is polled after checkout with clear messaging.

**Top 3 fixes before or shortly after beta invites:**  
1. **Observability:** Add frontend error tracking (e.g. Sentry) and optional alerting on webhook_update_failed so paying users stuck on trial are visible.  
2. **Console logging:** Guard or remove `console.error` in AuthContext, SettingsPanel, and AppErrorBoundary in production to avoid leaking errors (and any accidental PII) in the console.  
3. **Save retry:** Consider a "Retry saving" path when the final save fails so the user doesn’t have to complete another reflection to persist.

**Single biggest risk right now:** No frontend error aggregation or webhook-failure alerting—if something breaks in production (e.g. a new regression or provider issue), you may not notice until users report it.
