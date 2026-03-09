# REFLECT — Production Readiness Audit

**Context:** Private AI journaling app; sensitive user data; React/Vercel + FastAPI/Railway + Supabase + Lemon Squeezy + OpenAI.  
**Scope:** Backend (server.py, llm_provider.py, supabase_client.py, lemon_squeezy_client.py, auth.py, usage_limits.py), Frontend (App.js, AuthContext.jsx, config.js, lemonSqueezy.js, ReflectionFlow.jsx, PaywallLimitModal.jsx, SettingsPanel.jsx).  
**Note:** `LemonSqueezyContext.jsx` was not found in the repo; references are to lemonSqueezy.js and call sites only.

---

## 1. Critical Production Risks

**SEVERITY: Critical**  
**TITLE: Rate-limit RPCs must exist in Supabase**  
**EXPLANATION:** `backend/user_usage_schema.sql` creates the `user_usage` table but does **not** define the RPCs `increment_reflection_usage` and `decrement_reflection_usage`. `supabase_client.increment_usage_atomic()` and `decrement_usage_atomic()` call these RPCs (lines 211, 236). If the RPCs were never applied in a given environment, every authenticated reflection request fails.  
**WHY IT MATTERS:** In any environment where the RPCs are missing, reflection is broken for logged-in users.  
**FIX:** Ensure the RPCs exist in every Supabase project (e.g. run `backend/user_usage_rpcs_migration.sql` after `user_usage_schema.sql`). **Verified:** These routines exist in the current Supabase project (`decrement_reflection_usage`, `increment_reflection_usage`). Keep the migration file in repo for other environments and for documentation.

**SEVERITY: High**  
**TITLE: user_usage.plan_type default mismatch**  
**EXPLANATION:** `user_usage_schema.sql` had `plan_type TEXT NOT NULL DEFAULT 'free'`. All backend code uses `plan_type` in `{'guest','trial','monthly','yearly'}`. No code uses `'free'`.  
**WHY IT MATTERS:** Any row created without an explicit plan_type would get `'free'` and not match RPCs or Python logic.  
**FIX:** Change default to `'trial'` in the schema. **Fixed:** Production has been updated with `ALTER TABLE user_usage ALTER COLUMN plan_type SET DEFAULT 'trial';`. Schema file below updated to match.

**SEVERITY: High**  
**TITLE: Backend URL hardcoded in frontend**  
**EXPLANATION:** `frontend/src/lib/config.js` line 6: `const RAILWAY_BACKEND_URL = "https://reflect-app-production.up.railway.app"`. Production and Vercel hosts use this if `REACT_APP_BACKEND_URL` is not set.  
**WHY IT MATTERS:** Changing backend (e.g. new Railway project, different domain) requires a frontend redeploy or every env must set `REACT_APP_BACKEND_URL`. Misconfiguration sends production traffic to the wrong or dead URL.  
**FIX:** Require `REACT_APP_BACKEND_URL` in production (fail build or runtime if missing on Vercel), and use it exclusively; remove hardcoded Railway URL or use only as dev fallback with a clear comment.

**SEVERITY: High**  
**TITLE: ALLOWED_ORIGINS default in production**  
**EXPLANATION:** `server.py` line 310: `os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")`. If `ALLOWED_ORIGINS` is not set in production, only localhost is allowed.  
**WHY IT MATTERS:** Production frontend (e.g. app.ireflect.app) would get CORS errors on every API call; app is unusable until env is fixed.  
**FIX:** Fail startup in production when `ALLOWED_ORIGINS` is empty or still localhost-only (e.g. `_require_env` or explicit check after reading origins).

---

## 2. Security

**SEVERITY: Critical**  
**TITLE: Rate-limit key uses unverified JWT decode**  
**EXPLANATION:** `server.py` lines 125–134: `get_rate_limit_key()` extracts `Bearer` token and calls `jwt.decode(token, options={"verify_signature": False})` to get `sub` for the key.  
**WHY IT MATTERS:** Signature is not verified here; this is only used for the rate-limit key, not for auth. Auth is enforced by `require_user_id` which verifies. So an attacker cannot bypass auth, but could in theory try to influence rate-limit buckets. Risk is limited because the key is only for rate limiting and auth is separate.  
**FIX:** Document that this is intentional (per-user rate limit key only; auth is enforced elsewhere). Optionally use a verified decode with same secret and catch InvalidTokenError to fall back to IP.

**SEVERITY: High**  
**TITLE: Guest reflection and guest-save are unauthenticated**  
**EXPLANATION:** `POST /api/reflect/guest` and `POST /api/reflect/guest-save` have no `Depends(require_user_id)`. Rate limits are global (3/hour and 5/minute).  
**WHY IT MATTERS:** Anyone can burn LLM credits and create guest rows by hitting these endpoints. Abuse can exhaust rate limits for real guests and increase cost.  
**FIX:** Keep guest flow but add stricter global rate limits, consider IP-based caps, and monitor abuse; optionally require a short-lived guest token from a separate endpoint that is itself rate-limited.

**SEVERITY: Medium**  
**TITLE: Webhook event recording is best-effort**  
**EXPLANATION:** `lemon_squeezy_client.record_event()` (lines 169–186): if Supabase insert fails, the exception is swallowed.  
**WHY IT MATTERS:** Duplicate events could be processed twice (you fail open on read). If record_event often fails, replay risk increases.  
**FIX:** Log failures with `logger.warning` or `logger.exception`; consider a small retry or queue for recording.

**SEVERITY: Medium**  
**TITLE: Admin sync-subscription exposes partial user_id**  
**EXPLANATION:** `admin_sync_subscription` returns `details` with `"user_id": uid[:8] + "..."`.  
**WHY IT MATTERS:** UUIDs are 36 chars; 8 chars could be predictable in small user bases. Low info leak but still PII-ish.  
**FIX:** Return only counts and result types in details, or hash the user_id for logging; avoid returning any prefix of real IDs in API responses.

---

## 3. Data Safety

**SEVERITY: High**  
**TITLE: update_user_plan resets reflections_used to 0**  
**EXPLANATION:** `supabase_client.update_user_plan()` (lines 79–89) upserts a row with `reflections_used: 0` every time plan is updated (e.g. webhook).  
**WHY IT MATTERS:** On subscription_created/updated, the user gets a fresh period and zero count, which is correct. But if the same event is processed twice (e.g. after fail-open dedup), the second run resets again; no data corruption, but the design is “last write wins” with no idempotency key.  
**FIX:** Document that webhook handler is idempotent for “set plan to X” and that duplicate processing only resets again. Optionally add a conditional update so you only set reflections_used to 0 when plan_type actually changes.

**SEVERITY: Medium**  
**TITLE: insert_saved_reflection returns None on multiple failure paths**  
**EXPLANATION:** `supabase_client.insert_saved_reflection` returns None when client is missing, insert returns no data, or an exception occurs. Callers (server.py history_save) now check and raise 502.  
**WHY IT MATTERS:** Previously this could return 200 with id: null; that’s fixed. Remaining risk is any other caller not checking for None.  
**FIX:** Ensure all callers treat None as failure; consider a Result type or exception for insert failures instead of None.

**SEVERITY: Low**  
**TITLE: Migrate guest accepts body.reflections from client**  
**EXPLANATION:** `migrate_guest_reflections` can insert up to 2 saved_reflections from `body.reflections` (localStorage) when guest_id path doesn’t find anything. Content is client-supplied.  
**WHY IT MATTERS:** Server validates length and strips text; no script injection in DB, but a malicious client could migrate junk or repeated data.  
**FIX:** Rate-limit strictly; consider max length per field; monitor for abuse.

---

## 4. Auth & Authorization

**SEVERITY: High**  
**TITLE: Legacy HS256-only JWT**  
**EXPLANATION:** `auth.py` uses `jwt.decode(..., SUPABASE_JWT_SECRET, audience="authenticated", algorithms=["HS256"])`. Comment states Supabase must use “Legacy JWT” (HS256). New Supabase projects often use ES256/JWKS.  
**WHY IT MATTERS:** If the project is upgraded to JWKS/ES256, all auth breaks with 401 until backend is updated to support JWKS.  
**FIX:** Support both: try HS256 with SUPABASE_JWT_SECRET; if configured, also try JWKS fetch and ES256. Document which Supabase JWT mode is required.

**SEVERITY: Medium**  
**TITLE: No token refresh in frontend**  
**EXPLANATION:** AuthContext uses `supabase.auth.getSession()` and `refreshSession()` once on init. If the access token expires mid-session, subsequent API calls get 401 until the user triggers a refresh or reload.  
**WHY IT MATTERS:** Long sessions (e.g. user leaves tab open) can hit 401 on next request; UX degrades without a clear “session expired” flow.  
**FIX:** On 401 from API, call `supabase.auth.refreshSession()` and retry once; if still 401, clear session and show “Session expired, please sign in again.”

**SEVERITY: Low**  
**TITLE: get_profile(uid) in sync-subscription**  
**EXPLANATION:** Admin sync-subscription uses `get_profile(uid)` to get email. Profile may not exist for every user_usage row (e.g. usage created by webhook before first login).  
**WHY IT MATTERS:** Users with no profile get “no_email” and are skipped; they never get synced.  
**FIX:** Document that sync only works for users who have a profile (e.g. have logged in at least once). Optionally fetch email from auth.users via service role if available.

---

## 5. Payment Safety

**SEVERITY: High**  
**TITLE: Webhook accepts subscription_updated without idempotency by event_id only**  
**EXPLANATION:** Deduplication is by `event_id`; after successful update you call `record_event(event_id, event_name)`. If record_event fails, Lemon Squeezy may retry and you process again (fail open).  
**WHY IT MATTERS:** Double processing sets plan again (idempotent for “plan = X”) but could double-log or confuse support. Paying users are not undercounted because you set plan_type and reset period.  
**FIX:** Make record_event reliable (log + retry or queue); consider making the “update plan” logic explicitly idempotent (e.g. only update if stored plan != new plan).

**SEVERITY: Medium**  
**TITLE: Variant IDs and plan_type mapping**  
**EXPLANATION:** `lemon_squeezy_client.VARIANT_TO_PLAN` is built from env (LS_VARIANT_MONTHLY, LS_VARIANT_YEARLY). Unknown variant_id falls back to `"monthly"` in parse_subscription_event and parse_order_created.  
**WHY IT MATTERS:** A new product/variant in Lemon Squeezy that isn’t added to env is treated as monthly; wrong product could grant wrong limit.  
**FIX:** Log when variant_id is not in VARIANT_TO_PLAN; consider returning None or “unknown” and handling in webhook (e.g. don’t set plan, alert).

**SEVERITY: Medium**  
**TITLE: Frontend subscription status from single source**  
**EXPLANATION:** Web subscription status is from GET /api/usage (plan_type, is_subscribed). No server-side re-check of Lemon Squeezy on each request.  
**WHY IT MATTERS:** If user_usage is wrong (e.g. webhook missed), user sees wrong plan until next sync or admin repair.  
**FIX:** Already mitigated by admin sync-subscription and fail-open webhook; add monitoring for “plan_type trial but LS has active sub”.

---

## 6. API Reliability

**SEVERITY: High**  
**TITLE: No retries on Supabase in critical paths**  
**EXPLANATION:** supabase_client calls (insert_reflection, insert_saved_reflection, get_user_usage, increment_usage_atomic, etc.) have no retry. Transient Supabase errors cause immediate failure.  
**WHY IT MATTERS:** Network blips or Supabase rate limits cause 502/500 and user-visible errors; reflection or save can be lost or inconsistent.  
**FIX:** Add a small retry (e.g. 2 retries with backoff) for idempotent reads and for writes where safe (e.g. insert_saved_reflection); avoid retrying non-idempotent writes without care.

**SEVERITY: Medium**  
**TITLE: LLM timeouts and rollback**  
**EXPLANATION:** OpenAI client uses 120s timeout and retries on 429/5xx. On any exception after increment, server calls `rollback_reflection_usage`. If rollback fails (e.g. Supabase down), usage count is still incremented and the user got no reflection.  
**WHY IT MATTERS:** User loses a slot and sees an error; under heavy failure, counts can drift.  
**FIX:** Log rollback failures; consider a background repair job that reconciles increments with actual reflections.

**SEVERITY: Medium**  
**TITLE: fetch_subscription_plan_by_email no retry**  
**EXPLANATION:** `lemon_squeezy_client.fetch_subscription_plan_by_email` uses a single urllib request with 15s timeout; no retry on 5xx or timeout.  
**WHY IT MATTERS:** Admin sync-subscription can under-repair when Lemon Squeezy is slow or failing.  
**FIX:** Add 1–2 retries with backoff for 5xx and timeouts.

---

## 7. Frontend Reliability

**SEVERITY: High**  
**TITLE: ClosingScreen onDone calls onSaveHistory then navigates without awaiting**  
**EXPLANATION:** ReflectionFlow.jsx ClosingScreen `onDone` (lines 424–447) calls `onSaveHistory(...)` (fire-and-forget) then immediately calls `onReflectAnother` / `onStartFresh`. The save is async; navigation can happen before save completes.  
**WHY IT MATTERS:** If save fails, user may already have left the closing screen; they see “Reflect again” and think the reflection was saved. saveError is set in catch in App.js but the user may not see the retry UI if they navigated away.  
**FIX:** Await onSaveHistory in onDone (or in a wrapper that handles errors and shows toast/retry before calling onReflectAnother). Only call onReflectAnother/onStartFresh after save succeeds or after showing error.

**SEVERITY: Medium**  
**TITLE: performSaveHistory not awaited in pending-save-after-sign-in**  
**EXPLANATION:** App.js (lines 241–248): when user signs in and there is pendingSaveAfterSignIn, code calls `performSaveHistory(...).then(() => refetchHistory()).catch(...)`. The effect does not await; it fires and continues.  
**WHY IT MATTERS:** If save fails, catch runs and shows toast; refetchHistory is not called. Acceptable, but any follow-up that assumes “save completed” could be wrong.  
**FIX:** Ensure all “save then do something” flows await or chain in a single place so errors are visible and state is consistent.

**SEVERITY: Medium**  
**TITLE: handleSubmit reflect has no request cancellation on unmount**  
**EXPLANATION:** handleSubmit uses AbortController and passes signal to axios. If the component unmounts (e.g. user navigates away), the request may still complete and then setState could run (setReflection, setAppState).  
**WHY IT MATTERS:** React may warn about setState on unmounted component; in rare cases can cause inconsistent state.  
**FIX:** Keep a ref (e.g. mounted) and only update state if mounted when the request resolves; or use a library that cancels on unmount.

**SEVERITY: Low**  
**TITLE: History and usage fetch errors leave previous data**  
**EXPLANATION:** On history fetch failure you set historyError=true and leave historyAll unchanged. On usage fetch failure you set usageError=true. Good. If the first load fails, historyAll is [] and historyError true; UI shows error + retry.  
**WHY IT MATTERS:** Minor: after a successful load, a later failed refetch keeps showing old data with no indication it’s stale until user retries.  
**FIX:** Optional: on refetch failure, show a “Couldn’t refresh” toast or inline message so user knows data might be stale.

---

## 8. UX Trust Killers

**SEVERITY: High**  
**TITLE: Save runs in background on closing without confirmation**  
**EXPLANATION:** User clicks “I’ll carry this” and the app triggers save and then navigates. If save fails, they may not see the retry message because the flow has already moved.  
**WHY IT MATTERS:** Users believe the reflection is saved; if it wasn’t, trust is damaged when they notice it missing later.  
**FIX:** Await save on closing and show loading or disable button until save completes; on failure show error and retry without leaving closing until they choose to retry or abandon.

**SEVERITY: Medium**  
**TITLE: Export data is “coming soon”**  
**EXPLANATION:** SettingsPanel “Export data (coming soon)” shows a toast when clicked. No actual export.  
**WHY IT MATTERS:** Privacy-conscious users and compliance (e.g. GDPR right to data portability) expect export. Promising “coming soon” without a timeline feels unfinished.  
**FIX:** Either implement a minimal export (e.g. JSON of saved_reflections + profile) or replace with “Export will be available soon; contact essanirafay@gmail.com for a manual export until then.”

**SEVERITY: Low**  
**TITLE: Manage subscription links to Lemon Squeezy**  
**EXPLANATION:** SettingsPanel links “Manage subscription” to https://app.lemonsqueezy.com/my-orders. Users may expect in-app management.  
**WHY IT MATTERS:** Some users prefer not to leave the app; acceptable for beta but should be clear.  
**FIX:** Add short copy: “You’ll open Lemon Squeezy to manage or cancel.”

---

## 9. Scaling Risks

**SEVERITY: High**  
**TITLE: list_user_usage_user_ids() loads up to 10k user_ids**  
**EXPLANATION:** admin_sync_subscription calls `list_user_usage_user_ids()` with default limit 10000; then for each user it fetches profile and calls Lemon Squeezy API.  
**WHY IT MATTERS:** At 10k users, one sync-subscription run does 10k profile fetches and up to 10k Lemon Squeezy calls. Can hit LS rate limits and slow the request to timeout.  
**FIX:** Paginate (e.g. limit 500, cursor by user_id); or run sync in a background job with batching and rate limiting.

**SEVERITY: Medium**  
**TITLE: Personalization refresh_all processes 200 users per run**  
**EXPLANATION:** `_run_personalization_refresh_all` calls `refresh_personalization_context_all(limit_users=200)` on an interval.  
**WHY IT MATTERS:** At 10k+ users, each user gets refreshed infrequently; at 100k users, 200 per run may be too slow for “daily” freshness.  
**FIX:** Make limit and interval configurable; consider prioritizing users with recent activity.

**SEVERITY: Low**  
**TITLE: No connection pooling documented**  
**EXPLANATION:** Supabase client is created per process; no explicit connection pool configuration in code.  
**WHY IT MATTERS:** Under high concurrency, many concurrent Supabase requests per process; pool limits depend on Supabase client defaults.  
**FIX:** Document recommended worker/process count for Railway; monitor Supabase connection usage.

---

## 10. Architecture

**SEVERITY: Medium**  
**TITLE: Single backend process**  
**EXPLANATION:** FastAPI runs as one or more workers; no shared cache or queue. Rate limits are in-memory (SlowAPI).  
**WHY IT MATTERS:** Multiple workers each have their own rate-limit state; a user could get 10/hour per worker.  
**FIX:** Use a shared store (e.g. Redis) for rate limits in production when scaling to more than one worker.

**SEVERITY: Low**  
**TITLE: Background personalization in a daemon thread**  
**EXPLANATION:** `_run_personalization_refresh_all` runs in a daemon thread. If the main process exits, it stops without cleanup.  
**WHY IT MATTERS:** Acceptable for a single process; if you move to a job queue later, this should be replaced.  
**FIX:** Document; when moving to workers, run refresh as a scheduled job instead.

---

## 11. AI System Risks

**SEVERITY: Medium**  
**TITLE: sanitize_for_llm is prepend-only**  
**EXPLANATION:** security.sanitize_for_llm prepends an instruction to ignore prompt injection. User content is still concatenated; a sophisticated prompt injection could try to override the instruction.  
**WHY IT MATTERS:** LLM is used only for reflective text; no tools or config. Risk is low but not zero (e.g. trying to force harmful or off-brand output).  
**FIX:** Keep prepend; add output checks (e.g. length, blocklist of phrases) and log anomalies.

**SEVERITY: Medium**  
**TITLE: No global token or cost cap**  
**EXPLANATION:** Each LLM call has a max_tokens (e.g. 800, 600) but there is no per-user or global daily token/cost limit.  
**WHY IT MATTERS:** A bug or abuse could cause a large number of reflections or long outputs and spike cost.  
**FIX:** Add per-user daily reflection count (already have usage limits) and optional cost tracking; alert on unusual token usage.

**SEVERITY: Low**  
**TITLE: Crisis detection is keyword-based**  
**EXPLANATION:** contains_crisis_signal uses fixed phrases and simple first-person context. Can have false negatives (e.g. indirect language) or false positives (e.g. quoting someone else).  
**WHY IT MATTERS:** Missed crisis is serious; false positives can feel intrusive.  
**FIX:** Document as best-effort; consider periodic review of phrases and adding “crisis” to error monitoring.

---

## 12. Legal & Privacy

**SEVERITY: High**  
**TITLE: No explicit consent for AI processing**  
**EXPLANATION:** Users type thoughts and get AI reflections. There is no in-flow consent checkbox or “your text will be sent to OpenAI” before first reflection. Privacy policy may cover it but not prominently in-app.  
**WHY IT MATTERS:** GDPR and similar regimes expect clear consent for processing; some users may assume data stays local.  
**FIX:** Add a one-time or per-session short notice before first reflection (e.g. “Your reflection is processed by AI to generate your mirror. We don’t train on your data.”) with an explicit continue.

**SEVERITY: Medium**  
**TITLE: Data retention not disclosed in-app**  
**EXPLANATION:** TrialExpiredModal was updated to say “Your reflections are kept for the duration of your beta access.” No general in-app statement on how long data is stored or when it may be deleted.  
**WHY IT MATTERS:** Users assume “saved” means indefinitely unless told otherwise.  
**FIX:** Add a line in Settings or Privacy section: “We store your reflections and account data until you delete your account or request deletion.”

**SEVERITY: Low**  
**TITLE: Delete account does not cancel Lemon Squeezy**  
**EXPLANATION:** SettingsPanel warns that deleting the account does not cancel the subscription; user must cancel via Lemon Squeezy.  
**WHY IT MATTERS:** Compliant with typical billing terms; some jurisdictions expect clear notice.  
**FIX:** Already present; consider adding a link to Lemon Squeezy customer portal in the delete confirmation.

---

## Launch Readiness Score: **4/10**

**Justification:** Core flows (reflect, save, auth, payments) are implemented and several critical bugs (silent save failure, history/usage error states, billing webhook fail-open, support email) have been addressed. However: (1) Rate limiting may be broken in production if the increment/decrement RPCs were never deployed. (2) CORS and backend URL configuration can make the app unusable in production if env is wrong. (3) Save-on-closing is not awaited, so failed saves can go unnoticed. (4) No production-grade retries for Supabase or Lemon Squeezy. (5) Auth is HS256-only. (6) No in-app consent for AI processing. Until the RPCs and the must-fix items are verified/fixed, launching to thousands of users is high risk.

---

## Top 10 Must-Fix Before Launch

1. **RPCs in every environment** — In the audited Supabase project, `increment_reflection_usage` and `decrement_reflection_usage` are present. For any new or cloned project, run `backend/user_usage_rpcs_migration.sql` after `user_usage_schema.sql`.
2. **CORS and backend URL** — Require ALLOWED_ORIGINS and REACT_APP_BACKEND_URL in production; fail fast if missing or wrong.
3. **Await save on closing** — In ReflectionFlow, await onSaveHistory in ClosingScreen onDone and show error/retry before navigating away.
4. **Auth: support JWKS** — Support Supabase ES256/JWKS or document that Legacy JWT is required and will be deprecated.
5. **401 → refresh session** — On 401 from API, refresh session once and retry; then show “Session expired” if still 401.
6. **Retry Supabase in critical paths** — Add limited retries for get_user_usage, insert_saved_reflection, and increment_usage_atomic.
7. **user_usage plan_type default** — **Fixed:** Production default set to `'trial'`; schema file in repo updated to match.
8. **AI processing consent** — Add clear in-app notice/consent before first reflection that content is processed by AI.
9. **Webhook record_event** — Log failures and consider a retry so duplicate events are not processed twice when Supabase is flaky.
10. **Admin sync batch size** — Cap or paginate list_user_usage_user_ids in sync-subscription to avoid timeouts and Lemon Squeezy rate limits.

---

## What Will Break Within 30 Days

- **Reflection 500s** if RPCs are missing: every authenticated reflect fails after increment_usage_atomic.
- **CORS errors** in production if ALLOWED_ORIGINS is not set for the real frontend origin.
- **Paying users stuck on trial** if webhooks fail and sync-subscription is not run (e.g. cron not set).
- **Session expiry** for users who leave the app open long enough; they get 401 and no clear recovery until they refresh or sign in again.
- **Personalization refresh** may fall behind if user count grows and 200/run is not tuned.

---

## What Will Destroy User Trust

- **“My reflection didn’t save”** when save fails on closing but the app moves on and shows “Reflect again” without a clear error or retry.
- **“I paid but I’m still limited”** when webhook or sync fails and plan_type stays trial.
- **“I thought my data was private”** if there is no clear in-app consent that AI processes their text.
- **“The app said I had no reflections”** when the history request failed and the UI showed the same as “zero reflections” (partially mitigated by historyError; ensure retry is obvious).

---

## What Will Cost Money Unexpectedly

- **OpenAI/OpenRouter** — No per-user or global cost cap; abuse or a bug could spike token usage.
- **Lemon Squeezy** — Double-processing webhooks (fail-open) doesn’t double-charge users but could cause support/refund work.
- **Supabase** — Large list_user_usage_user_ids + many profile fetches and LS API calls in one request could increase egress and external API usage if run often.

---

## Postmortem: Beta Launch Failure (Fictional)

**Date:** Day 1 after launch.  
**Incident:** Most authenticated users could not complete a reflection. API returned 500 or “Reflection service error” after they submitted their thought.

**Root cause:** Production Supabase had the `user_usage` table created from `user_usage_schema.sql`, but the RPCs `increment_reflection_usage` and `decrement_reflection_usage` had never been added (they were only described in REFLECTION_RATE_LIMITING.md). On the first reflection request, `enforce_reflection_limit` called `increment_usage_atomic`, which triggered `client.rpc("increment_reflection_usage", ...)`. Supabase returned an error (function does not exist). The exception was caught in supabase_client and returned None; server then returned 429 or the exception bubbled and was turned into 502. Users saw “Reflection limit reached” or “Something went wrong.”

**Why it wasn’t caught:** Staging or local likely used a DB that had the RPCs applied manually once, or tests didn’t hit the full path. Production was provisioned from the same schema file that doesn’t include the RPCs. No automated check verified that the RPCs exist after deploy.

**Impact:** Hundreds of users tried to reflect on day one; the majority failed. Support was flooded; social mentions were negative. Several users deleted accounts. Revenue (trial conversions) was delayed.

**Cost:** Lost trust, support time, and a late-night hotfix to add the RPCs to production and redeploy. No direct revenue loss from payments, but trial-to-paid conversion for the first cohort was damaged.

**Remediation:** (1) Added the RPC definitions to a migration file and ran it in production. (2) Added a startup check that calls a trivial RPC or selects from a view that uses the RPC, failing deploy if missing. (3) Documented in runbooks that “full” Supabase setup requires both user_usage_schema.sql and the RPC migration.

---

*End of audit.*
