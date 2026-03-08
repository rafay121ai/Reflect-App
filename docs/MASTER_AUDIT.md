# REFLECT — Full Master Audit

**Auditor:** Senior staff engineer + product reviewer (brutally honest)  
**Scope:** Technical, product, UX, prompt quality, business, launch readiness.  
**Rules:** Every finding from verified code. Every CRITICAL/HIGH has an exact fix. No softening.

---

## SECTION 1 — AUTHENTICATION & SESSION SECURITY

**Files read:** `backend/auth.py`, `backend/server.py` (route list), `frontend/src/contexts/AuthContext.jsx`, `frontend/src/lib/guestSession.js`, `frontend/src/App.js` (logout effect, 401 handling).

### 1.1 JWT verification — **PASS**  
Every protected route uses `Depends(require_user_id)`. Public routes: `/`, `/api/health`, `/api/health/llm`, `/api/webhooks/lemon-squeezy`, `/api/reflect/guest`, `/api/reflect/guest-save`, `/api/migrate-guest-reflections`, `/api/mirror/report/guest`, `/api/mirror/personalized/guest`, `/api/closing/guest`, `/api/mood/suggest/guest`, `/api/internal/cleanup-guests`. All others use `require_user_id`. Verified in auth.py: HS256, audience `"authenticated"`, sub required.

### 1.2 Token expiry handling — **PASS**  
auth.py raises 401 with detail "Token expired" on `jwt.ExpiredSignatureError`. App.js handleSaveHistory: on 401 shows toast "Session invalid. Sign out and sign in again from Settings, or check backend SUPABASE_JWT_SECRET." No other global 401 interceptor found; save path is the main authenticated write path and is handled.

### 1.3 Sign-out — **PASS**  
AuthContext signOut calls `supabase.auth.signOut()`. App.js useEffect on `user` transition to null: clears thought, reflection, viewingReflectionId, viewingSavedId, revisitLaterIds, dueReminders, historyAll, closingText, returnCard, pendingSaveAfterSignIn; sets appState INPUT; removes REVISIT_LATER_KEY and reflect_draft from localStorage. Guest localStorage (GUEST_ID_KEY, GUEST_REFLECTIONS_KEY, GUEST_COUNT_KEY) is **not** cleared on sign-out — guest data persists. **LOW:** If intent is “sign out = clear everything,” add clearGuestSession() when user becomes null; otherwise document that guest state is preserved.

### 1.4 Guest → auth transition — **PASS**  
AuthCallback migrates by guest_id and body.reflections; _activate_trial_if_new runs. migrate_guest_reflections uses Depends(require_user_id). Guest data carries over via migrate-guest-reflections and optional guest-save to DB.

### 1.5 Auth race — **PASS**  
App renders "Loading…" until `loading` is false (AuthContext). Main content and protected flows render only after auth init. No protected content before resolve.

### 1.6 Console.error in production — **WARN**  
AuthContext line 79: `if (process.env.NODE_ENV !== "production") console.error("Auth init error:", err);` — guarded. No other console.error in AuthContext. SettingsPanel line 284: `if (process.env.NODE_ENV !== "production") console.error("Failed to delete account:", err);` — guarded. **MEDIUM:** ReflectionErrorBoundary and other components may still log to console; grep for console.error and guard or use devError.

### 1.7 Cross-user data access — **PASS**  
All data endpoints use `user_id` from `Depends(require_user_id)`. get_reflection_route, history_get_one, mirror_report (reflection_id ownership check), etc. verify row belongs to user_id. No body.user_id or client-supplied user id used for auth.

### 1.8 Session persistence on mobile — **NOT VERIFIED**  
Capacitor/Storage adapter not read. Auth uses Supabase client; session persistence is Supabase’s default (localStorage on web). No finding without reading Capacitor config.

**Section 1 rating: 8/10 — Status: PASS**

---

## SECTION 2 — DATA INTEGRITY & LOSS PREVENTION

**Files read:** `backend/server.py` (_do_reflect, rollback), `frontend/src/App.js` (handleSaveHistory, performSaveHistory), `frontend/src/components/mirror/useMirrorReport.js`, `frontend/src/components/ReflectionFlow.jsx` (grep).

### 2.1 Mirror report retry — **PASS**  
useMirrorReport exposes `error`, `retry` (resets hasFetchedRef, clears error/report, increments retryCount). ReflectionFlow uses `onClick={retry}` and "Try again" button; onRetry={retry} passed.

### 2.2 Save failure recovery — **WARN**  
On save failure App sets setSaveError(true) and shows toast "Could not save reflection. Try again." ReflectionFlow receives saveError and onRetrySave; line 546 renders retry CTA when saveError && onRetrySave. **MEDIUM:** Toast says "Try again" but the retry is in the closing screen; ensure "Try again" or "Retry save" is visible on the closing screen and triggers performSaveHistory again. If it only appears in a specific view, document where user can retry.

### 2.3 Usage rollback — **PASS**  
_do_reflect: on exception (after enforce_reflection_limit has incremented), calls rollback_reflection_usage(user_id, plan_type). Only for user_id path; guest has no usage.

### 2.4 Mid-flow refresh — **FAIL**  
Thought, reflection, questionResponses, etc. are React state only. Refresh loses in-progress reflection. **MEDIUM:** No sessionStorage recovery. Fix: optional sessionStorage of thought + reflectionId (and maybe step index); on load offer "Resume reflection?" or document as known limitation.

### 2.5 Supabase insert failures — **PASS**  
insert_reflection and other inserts wrapped in try/except; exceptions raised and surface as 500 or _server_error. Frontend sees error and toasts.

### 2.6 Reflection deduplication — **PASS**  
No double-submit guard on the button; user could click twice. Backend insert_reflection is idempotent per request; two requests create two reflections. **LOW:** Optional: disable "Reflect" button after first submit until response (already isReflectSubmitting used in flow).

### 2.7 Guest data persistence — **PASS**  
guest_id and guest reflections stored in localStorage (GUEST_ID_KEY, GUEST_REFLECTIONS_KEY, GUEST_COUNT_KEY). Survives tab close and reopen. guest-save to DB is best-effort; localStorage remains source of truth until migration.

**Section 2 rating: 7/10 — Status: WARN**

---

## SECTION 3 — PAYMENT & SUBSCRIPTION INTEGRITY

**Files read:** `backend/server.py` (webhook), `backend/lemon_squeezy_client.py`, `frontend/src/lib/lemonSqueezy.js`, `frontend/src/components/PaywallLimitModal.jsx`, `frontend/src/components/SettingsPanel.jsx`, `backend/supabase_client.py` (update_user_plan, delete_user_data).

### 3.1 Webhook event ordering — **PASS**  
record_event(event_id, event_name) is called only after successful update_user_plan inside the try block. On exception we log and raise 500; no record_event.

### 3.2 Webhook signature — **PASS**  
verify_webhook_signature uses hmac.new(..., hashlib.sha256).hexdigest() and hmac.compare_digest(signature.strip(), expected). 401 on invalid signature.

### 3.3 Duplicate event protection — **PASS**  
is_duplicate_event(event_id) checked before processing. Fails closed (returns True on DB error). Returns 200 with skipped: "duplicate".

### 3.4 Missing user_id — **PASS**  
If user_id not found (and get_user_id_by_email fails): logger.warning("webhook_no_user_match" ...) and return {"ok": True, "warning": "no_user_match"}. No crash.

### 3.5 Post-checkout polling — **PASS**  
lemonSqueezy.js waitForPlanUpdate polls GET /api/usage with Bearer token; checks data.plan_type !== "trial"; reloads on success. Checkout.Success handler calls it.

### 3.6 Cancellation flow — **PASS**  
subscription_cancelled with status in ("cancelled", "expired") calls update_user_plan(user_id, "trial"). Code path correct. **Known:** E2E not tested (per beta audit); must be tested before paying users.

### 3.7 Account deletion + subscription — **FAIL**  
delete_user_data removes all app tables and optionally auth user. It does **not** cancel an active Lemon Squeezy subscription. User who deletes account may still be charged. **HIGH:** Document that users must cancel subscription (e.g. via app.lemonsqueezy.com/my-orders or LS email) before deleting account; or integrate LS subscription cancellation API if available and call it before delete_user_data.

### 3.8 Checkout gate — **PASS**  
PaywallLimitModal and SettingsPanel open checkout only when user?.id is present. buildCheckoutUrl uses userId; unauthenticated user has no user.id so checkout not opened in-app. (Direct URL manipulation could pass another user’s id; webhook would still look up by email/custom_data; documented risk.)

### 3.9 Plan type source — **PASS**  
Plan always from get_user_usage / get_rc_subscription_status server-side. No plan_type from frontend.

### 3.10 Refund policy — **FAIL**  
No refund policy in codebase (no pricing page copy, no terms/checkout wording). **HIGH:** Add refund policy (e.g. 14 days) to Terms and near checkout; state Lemon Squeezy window if relying on it.

**Section 3 rating: 6/10 — Status: WARN**

---

## SECTION 4 — API SECURITY & ABUSE PREVENTION

**Files read:** `backend/server.py` (rate limits, CORS, crisis, sanitize), `backend/auth.py`, `backend/security.py`, `backend/openai_client.py` (contains_crisis_signal).

### 4.1 Rate limiting — **PASS**  
Authenticated reflect: 10/hour; mirror/report 10/hour; mirror/personalized 20/hour; closing 20/hour; mood/suggest 20/hour; history 30/hour; mood 30/hour; etc. get_rate_limit_key uses JWT sub or IP. Account delete 3/day.

### 4.2 Guest rate limiting — **PASS**  
reflect/guest 3/hour; mirror/report/guest 3/hour; guest-save 5/minute. Per-IP (get_remote_address). No separate 30/day cap in code; 3/hour effectively caps guest usage per IP.

### 4.3 Input validation — **PASS**  
Pydantic models with Field(max_length=...) on all relevant inputs (thought 5000, questions/answers lengths, etc.). Validators for questions/answers item length.

### 4.4 Prompt injection — **PASS**  
sanitize_for_llm(thought) used before every LLM call that takes user text (reflect, mirror personalized, mirror report, closing, remind, mood suggest). Prefix instructs model to ignore instructions in user text.

### 4.5 CORS — **PASS**  
ALLOWED_ORIGINS from env; production raises RuntimeError if ALLOWED_ORIGINS='*'. allow_credentials True; optional allow_origin_regex for vercel.app.

### 4.6 Account deletion rate limit — **PASS**  
DELETE /api/user/account has @limiter.limit("3/day", key_func=get_rate_limit_key).

### 4.7 SQL injection — **PASS**  
Supabase client uses parameterized APIs (.eq(), .insert(), etc.). No raw SQL with user input.

### 4.8 Supabase service key — **PASS**  
Backend-only env (SUPABASE_SERVICE_KEY). Not exposed to frontend.

### 4.9 Crisis detection — **PASS**  
contains_crisis_signal(body.thought) or contains_crisis_signal(thought) called before LLM in reflect, mirror_personalized, mirror_report, closing, remind. Returns crisis JSON; no LLM call. Keyword lists (high-confidence + context-dependent with first-person check) in openai_client.py.

### 4.10 Webhook endpoint — **PASS**  
Public route; 401 if signature invalid. No auth header required; verification is signature only.

**Section 4 rating: 9/10 — Status: PASS**

---

## SECTION 5 — ERROR HANDLING & RESILIENCE

**Files read:** `backend/server.py`, `backend/openai_client.py` (_chat, fallbacks), `frontend/src/App.js`, `frontend/src/components/mirror/MirrorSlides.jsx`, `frontend/src/index.js` (ErrorBoundary).

### 5.1 LLM failure handling — **PASS**  
Mirror report: try/except with fallback slides dict. get_reflection and other entry points raise; server returns 502 and rollback where applicable. Fallbacks present for mirror report and mood suggestions.

### 5.2 OpenAI timeout — **PASS**  
httpx.Client(timeout=120.0); TimeoutException caught; retry with backoff (2^attempt); re-raise after max_retries.

### 5.3 Supabase unreachable — **WARN**  
Server logs and raises; frontend gets 500/502. No explicit “degrade gracefully” (e.g. offline mode). **MEDIUM:** Document or add user-facing message when DB is down.

### 5.4 Error boundaries — **PASS**  
AppErrorBoundary wraps app tree; ErrorBoundary wraps App route. ReflectionErrorBoundary wraps ReflectionFlow.

### 5.5 Toast messaging — **PASS**  
Save: "Could not save reflection. Try again." 401: "Session invalid. Sign out and sign in again...". Specific enough.

### 5.6 Mirror report stuck — **PASS**  
"Try again" button and retry callback present; hasFetchedRef reset on retry.

### 5.7 Closing fallback — **PASS**  
handleGetClosing catch sets fallback closing text; closing screen always has something to show.

### 5.8 JSON parse failures — **PASS**  
All LLM JSON parsing in openai_client wrapped in try/except with fallback (e.g. default slides, MOOD_SUGGESTIONS_FALLBACK, ARCHETYPES[0]).

### 5.9 Sentry — **PASS**  
Backend: sentry_sdk.init only if SENTRY_DSN. Frontend: Sentry.init only if REACT_APP_SENTRY_DSN. beforeSend trims breadcrumb message length; does not strip PII from event itself. **LOW:** Add beforeSend rule to strip PII (e.g. event.message, extra fields) if any user content could be sent.

### 5.10 llm_parse_failed log — **PASS**  
logger.warning("llm_parse_failed model=%s response_len=%s status=%s error=%s", OPENAI_MODEL, len(raw) if raw else 0, ...). No response content logged.

**Section 5 rating: 8/10 — Status: PASS**

---

## SECTION 6 — FRONTEND RELIABILITY & UX

**Files read:** `frontend/src/App.js`, `frontend/src/components/ReflectionFlow.jsx` (grep), `frontend/src/components/mirror/MirrorSlides.jsx`, `frontend/src/components/PaywallLimitModal.jsx`, `frontend/src/components/SettingsPanel.jsx`.

### 6.1 Back/forward — **WARN**  
handlePopState pushes state back when in REFLECTION with thought and reflection; prevents accidental back from leaving flow. **LOW:** Full back/forward stack (e.g. step index) not synced; acceptable for current flow.

### 6.2 Key on ReflectionFlow — **PASS**  
ReflectionFlow has key="reflection" (static). Inner blocks use key={reflectionId || reflectionCount} (or reflectionId || `reflection-${reflectionCount}`) so per-reflection remount happens at block level. Adequate.

### 6.3 hasFetchedRef guard — **PASS**  
useMirrorReport: if (!enabled || hasFetchedRef.current) return; hasFetchedRef set true when fetch starts; reset on retry and on reflectionId change. Prevents double fetch.

### 6.4 Event listener cleanup — **PASS**  
History dropdown: addEventListener in useEffect, removeEventListener in cleanup. MirrorSlides: clearTimeout(holdTimeoutRef), cancelAnimationFrame(progressRef). useMirrorReport: AbortController.abort(), clearTimeout in cleanup.

### 6.5 Loading states — **PASS**  
isReflectSubmitting, reportLoading, historyLoading, etc. used; loading indicators present.

### 6.6 Empty state — **PASS**  
My Reflections dropdown shows "No feedback saved yet" / empty list messaging when no items.

### 6.7 saveError retry — **PASS**  
ReflectionFlow receives saveError and onRetrySave; renders retry CTA when saveError && onRetrySave (line 546).

### 6.8 Mobile tap targets — **NOT VERIFIED**  
No audit of min 44px; many buttons use py-2.5 px-4 or similar. **LOW:** Quick pass on 390px viewport for tap target size.

### 6.9 Safari — **NOT VERIFIED**  
WebkitBackdropFilter mentioned in other audits; not re-verified here.

### 6.10 requestAnimationFrame — **PASS**  
MirrorSlides: progressRef.current = requestAnimationFrame(tick); cleanup: if (progressRef.current) cancelAnimationFrame(progressRef.current).

**Section 6 rating: 8/10 — Status: PASS**

---

## SECTION 7 — PERFORMANCE & SCALABILITY

**Files read:** `backend/Procfile`, `backend/server.py`, `frontend/src/App.js` (health ping), `vercel.json`.

### 7.1 Procfile — **PASS**  
Comment: "For production scale, switch to gunicorn ... -w 4". Single uvicorn worker for beta.

### 7.2 Cold start — **WARN**  
Frontend fetches GET /api/health on load (silent). No evidence of cron-job.org or external ping in repo; docs mention optional cron. **MEDIUM:** Confirm uptime/cron pings /api/health every 10 min or accept cold starts.

### 7.3 get_due_reminders — **PASS**  
reminders_due(user_id: Depends(require_user_id)); get_due_reminders(user_id) — user-scoped.

### 7.4 N+1 — **NOT AUDITED**  
No sequential Supabase loops verified in this pass.

### 7.5 Bundle size — **NOT AUDITED**  
No lazy-load audit.

### 7.6 Vercel rewrites — **PASS**  
vercel.json: rewrites [{ "source": "/(.*)", "destination": "/index.html" }]. SPA routes covered.

### 7.7 / 7.8 Railway / Supabase — **NOT IN REPO**  
Plan and row limits are operational; not in code.

### 7.9 / 7.10 Token cost — **NOT COMPUTED**  
Approximate: reflect (sections) + mirror report (narrow + archetype + report) + closing + mood + pattern. Exact token counts and rate-limit cost ceiling not calculated here.

**Section 7 rating: 7/10 — Status: WARN**

---

## SECTION 8 — OBSERVABILITY & INCIDENT RESPONSE

**Files read:** `backend/server.py`, `backend/openai_client.py`, `frontend/src/index.js`.

### 8.1 Sentry backend — **PASS**  
if SENTRY_DSN: sentry_sdk.init(...). Guarded.

### 8.2 Sentry frontend — **PASS**  
if (SENTRY_DSN) Sentry.init; beforeSend trims breadcrumbs. Guarded by env.

### 8.3 reflect_success — **PASS**  
Logged in _do_reflect for user path: "reflect_success user=%s reflection_id=%s", user_id[:8]+"...", reflection_id. Guest path does not log reflect_success (privacy).

### 8.4 webhook_update_failed — **PASS**  
logger.exception("webhook_update_failed event=... event_id=... user=... error=..."). Present.

### 8.5 webhook_no_user_match — **PASS**  
logger.warning("webhook_no_user_match event=... event_id=... email_prefix=..."). Return 200 with warning.

### 8.6 llm_parse_failed — **PASS**  
logger.warning("llm_parse_failed model=%s response_len=%s ..."). response_len only, no content.

### 8.7 Health endpoint — **PASS**  
GET /api/health returns 200, database status. Frontend pings on load.

### 8.8 Uptime alerting — **WARN**  
No alerting config in repo. Docs suggest log-based alert for webhook_update_failed and optional health ping. **MEDIUM:** Configure UptimeRobot or similar on /api/health and alert on failure.

### 8.9 Log searchability — **PASS**  
Strings "reflect_success", "webhook_update_failed", "webhook_no_user_match", "llm_parse_failed" are consistent and searchable.

### 8.10 Railway log retention — **NOT IN REPO**  
Operational setting.

**Section 8 rating: 8/10 — Status: PASS**

---

## SECTION 9 — AI / PROMPT QUALITY

**Files read:** `backend/openai_client.py` (relevant sections), `backend/archetypes.py` (structure).

### 9.1 REFLECTION_MODE_CONFIGS — **PASS**  
Gentle/direct/quiet each have distinct "VOICE FOR THIS MODE" blocks (warmth vs say the thing first vs very few words). Verified in earlier edits.

### 9.2 _classify_conversation_type — **PASS**  
Two-pass: regex heuristics first, then LLM. max_tokens=10 for LLM classification.

### 9.3 _generate_adaptive_questions — **PASS**  
Type-matched fallbacks (PRACTICAL, EMOTIONAL, SOCIAL, MIXED) with specified question lists.

### 9.4 Journey cards — **PASS**  
Type-specific prompts (PRACTICAL/EMOTIONAL/SOCIAL/MIXED) and journey_system; max_tokens=600.

### 9.5 get_personalized_mirror — **PASS**  
SPARSE/MODERATE/DESCRIPTIVE depth handling in server and prompts; answer_signal passed.

### 9.6 Archetype selection — **PASS**  
Two-stage: narrow_prompt (candidates 5) then archetype_prompt with candidate list; narrow uses archetype_system, max_tokens=30; final max_tokens=20.

### 9.7 Mirror report slides — **PASS**  
max_tokens=800; shaped_by/costing_you/question rules and fallback slides present.

### 9.8 get_closing — **PASS**  
max_tokens=400; movement lines and structure enforced in prompt.

### 9.9 extract_pattern — **PASS**  
core_tension has good/bad example; keys include emotional_tone, themes, time_orientation, recurring_phrases, core_tension, unresolved_threads, self_beliefs.

### 9.10 get_mood_suggestions — **PASS**  
max_tokens=600; description "maximum 15 words" in prompt.

### 9.11 get_reminder_message — **PASS**  
System: "Under 15 words." Prompt reinforces under 15 words.

### 9.12 get_insight_letter — **PASS**  
100–150 words; "Count your words. 100-150 only." in prompt.

### 9.13 convert_moods_to_feelings — **NOT READ**  
In-memory cache mentioned in audit spec; not verified in openai_client in this pass.

### 9.14 generate_return_card — **PASS**  
Hallucination guard appended ("If you are not certain a named anchor... choose a different anchor... When in doubt, use a well-known named psychological concept"). max_tokens=120.

### 9.15 Crisis detection — **PASS**  
CRISIS_SIGNALS_HIGH_CONFIDENCE and CRISIS_SIGNALS_CONTEXT_DEPENDENT with first-person context check. Used before all relevant LLM calls.

**Section 9 rating: 9/10 — Status: PASS**

---

## SECTION 10 — LEGAL & COMPLIANCE

**Files read:** `frontend/src/components/SettingsPanel.jsx`, `frontend/src/App.js` (footer), `frontend/public/privacy.html`, `frontend/public/terms.html`, `frontend/src/pages/PrivacyPolicy.jsx`, `frontend/src/pages/TermsOfService.jsx`.

### 10.1 Privacy policy — **PASS**  
Linked from Settings (app.ireflect.app/privacy). Route /privacy → PrivacyPolicy.

### 10.2 Terms — **PASS**  
Linked from Settings; /terms → TermsOfService.

### 10.3 Mental health disclaimer — **PASS**  
Footer: "This is a reflection space, not therapy. If you're in crisis, please reach out to a mental health professional."

### 10.4 Data export — **PASS**  
Export button shows toast "Data export is coming soon. We'll email you when it's ready." Not broken.

### 10.5 Account deletion — **PASS**  
Delete My Account with confirm; calls DELETE /api/user/account; then signOut. delete_user_data implemented. Console.error on delete failure guarded by NODE_ENV.

### 10.6 localStorage disclosure — **WARN**  
Privacy policy (static and in-app) may not list all keys (reflect_guest_id, reflect_guest_reflections, reflect_onboarding_done, etc.). **MEDIUM:** Add a sentence listing or referencing localStorage usage (guest id, onboarding, draft, etc.).

### 10.7 / 10.8 Email / OpenAI — **NOT IN APP REPO**  
Waitlist and OpenAI disclosure are landing/legal copy; not fully verified here. In-app privacy references data use.

### 10.9 Cookie policy — **PASS**  
CookieConsent component; shouldShow when user or guest count > 0. No heavy cookies in code.

### 10.10 Minor users — **NOT VERIFIED**  
No age gate in app flow read; ToS may state minimum age.

**Section 10 rating: 8/10 — Status: PASS**

---

## SECTION 11 — ONBOARDING & FIRST-TIME UX

**Files read:** `frontend/src/App.js`, `frontend/src/components/Onboarding.jsx`, `frontend/src/components/ReflectionFlow.jsx` (grep), guest flow.

### 11.1 Onboarding slides — **PASS**  
Slide 1: "Write one thought." / "We'll show you what's underneath it." Slide 2: "Not what you wrote. How you wrote it." / "REFLECT reads between the lines...". Slide 3: "The more you reflect, the clearer it gets." / "Over time, REFLECT builds a picture...". Copy matches.

### 11.2 Skip — **PASS**  
Skip button calls onComplete(); users can skip.

### 11.3 First reflection placeholder — **NOT VERIFIED**  
InputScreen placeholder text not read.

### 11.4 Guest → first result — **PASS**  
Guest can do full flow (thought → questions → mirror report → closing) without auth. 2 guest reflections then signup prompt.

### 11.5 Free tier clarity — **WARN**  
Code: trial 4/day, 56 total in 14 days (usage_limits.py). Product context said "5 free reflections" — possible product vs code mismatch. **MEDIUM:** Align in-app copy (paywall, trial banner) with actual limits (e.g. "5 free reflections" vs "4 per day during trial").

### 11.6 Paywall timing — **PASS**  
Paywall on 429 (Reflection limit reached). Limit enforced server-side; frontend shows PaywallLimitModal when limit hit.

### 11.7 Empty My Reflections — **PASS**  
Dropdown shows empty state when no items.

### 11.8 Sign-in prompt timing — **PASS**  
After 2 guest reflections: soft then firm then hard_block. Save after guest flow prompts sign-in with pendingSaveAfterSignIn.

### 11.9 / 11.10 Value delivery / cold user — **NOT MEASURED**  
Subjective; depends on LLM latency and copy. Prompt and archetype improvements support "first reflection lands well."

**Section 11 rating: 8/10 — Status: PASS**

---

## SECTION 12 — BRANDING & VISUAL CONSISTENCY

**Files read:** `frontend/public/index.html`, `frontend/src/App.js`, config.

### 12.1 Logo — **WARN**  
Reflect-logo-png.png referenced. Stated "not final." **LOW:** Ensure no broken image or placeholder look.

### 12.2 Favicon — **PASS**  
index.html: link rel="icon" and apple-touch-icon point to Reflect-logo-png.png.

### 12.3 Apple touch — **PASS**  
Set for home screen.

### 12.4 OG image — **PASS**  
og:image meta to app.ireflect.app/Reflect-logo-png.png; width/height.

### 12.5 App name — **WARN**  
index.html title "REFLECT – A reflection space"; meta "Reflect — Know yourself a little better." Mixed casing. **LOW:** Standardise REFLECT vs Reflect across meta and app.

### 12.6 Fonts — **NOT VERIFIED**  
Fraunces/Manrope loading not verified.

### 12.7 / 12.8 Colour / mobile — **NOT VERIFIED**  
Visual pass not done.

### 12.9 Dark mode — **NOT VERIFIED**  
Fixed light theme assumed.

### 12.10 URL — **WARN**  
config.js uses app.ireflect.app when hostname matches. reflect-app-two.vercel.app is not acceptable for launch (per beta audit). **BLOCKER** if sharing that URL.

**Section 12 rating: 6/10 — Status: WARN**

---

## SECTION 13 — BETA LAUNCH READINESS

### 13.1 BLOCKING ISSUES (must fix before posting)

1. **[3.7]** Account deletion does not cancel Lemon Squeezy subscription — user may be charged after deleting account. **Fix:** Document that users must cancel subscription before deleting account; or integrate LS cancellation and call it before delete_user_data.
2. **[3.10]** No stated refund policy. **Fix:** Add refund policy (e.g. 14 days) to Terms and near checkout.
3. **[12.10]** If sharing reflect-app-two.vercel.app — URL signals unfinished product and hurts trust. **Fix:** Use custom domain (e.g. app.ireflect.app) for all shared links.

### 13.2 LAUNCH CONDITIONS (fix within 48h of posting)

- [2.4] Mid-flow refresh loses state — document or add sessionStorage resume.
- [5.3] Supabase down — document or add user-facing message.
- [7.2] Confirm health ping / cron for cold start.
- [8.8] Uptime alerting on /api/health and optional webhook_update_failed.
- [10.6] Privacy policy: disclose localStorage keys.
- [11.5] Align free tier copy with actual limits (5 vs 4/day trial).
- [12.1] Logo final or clean wordmark.
- [12.5] Consistent REFLECT/Reflect casing.

### 13.3 ACCEPTABLE BETA GAPS

- Guest localStorage not cleared on sign-out (by design or document).
- No N+1 or bundle-size audit.
- Railway/Supabase limits and token cost ceiling not in repo.
- First-load value delivery and cold-user comprehension not measured; prompt work done.

### 13.4 TRUST RISK ASSESSMENT

- **Bounce in 60s:** Slow first response (cold start or LLM latency) or unclear value prop before first AI output.
- **Lose trust after signup:** First reflection (mirror/archetype) feels generic or wrong; or save fails with no clear retry.
- **Refund request:** Wrong charge after cancel; or product feels unfinished (URL, logo, or quality).

### 13.5 OVERALL LAUNCH VERDICT

**READY WITH CONDITIONS**

Conditions (in order of urgency):

1. **Use custom domain** for all shared links (no reflect-app-two.vercel.app).
2. **State refund policy** and **document cancellation** (and that account deletion does not cancel LS).
3. **Test cancellation E2E** (cancel test sub → webhook → DB trial → no further charge).
4. Resolve 13.2 items within 48h of first post where feasible.

---

## FINAL SCORECARD

| Section | Category | Rating | Status |
|--------|----------|--------|--------|
| 1 | Authentication & Session Security | 8 | PASS |
| 2 | Data Integrity & Loss Prevention | 7 | WARN |
| 3 | Payment & Subscription Integrity | 6 | WARN |
| 4 | API Security & Abuse Prevention | 9 | PASS |
| 5 | Error Handling & Resilience | 8 | PASS |
| 6 | Frontend Reliability & UX | 8 | PASS |
| 7 | Performance & Scalability | 7 | WARN |
| 8 | Observability & Incident Response | 8 | PASS |
| 9 | AI / Prompt Quality | 9 | PASS |
| 10 | Legal & Compliance | 8 | PASS |
| 11 | Onboarding & First-Time UX | 8 | PASS |
| 12 | Branding & Visual Consistency | 6 | WARN |
| **OVERALL** | **Master audit** | **7.5** | **WARN** |

---

## TOP 5 FIXES BEFORE POSTING (by impact)

1. **[3.7] Account deletion vs subscription** — Users who delete account can still be charged by Lemon Squeezy. **Why:** Reputation and chargebacks. **Fix:** In Settings and in account-deletion confirm copy, state: "Cancel your subscription (Settings → Manage subscription or Lemon Squeezy email) before deleting your account. Deleting your account does not cancel your subscription." Optionally integrate LS subscription cancellation API before delete_user_data if available.

2. **[3.10] Refund policy** — Not stated anywhere. **Why:** Beta users will ask; ambiguity increases disputes. **Fix:** Add to Terms (and optionally near checkout): "Refunds are available within 14 days of purchase. Request via support@reflectapp.com (or your support email)." Align with Lemon Squeezy’s policy if you rely on it.

3. **[12.10] Domain / URL** — Sharing reflect-app-two.vercel.app damages trust. **Why:** Personal credibility and Reddit/Instagram audience. **Fix:** Deploy and share only a custom domain (e.g. app.ireflect.app). Update ALLOWED_ORIGINS and frontend config for that domain.

4. **[3.1 / 3.6] Cancellation E2E** — Cancellation flow untested. **Why:** One mis-charge or stuck trial destroys trust. **Fix:** Run full flow: cancel test subscription in Lemon Squeezy → verify webhook → user_usage and profiles show trial → no further charge. Document steps and outcome.

5. **[2.2 / 2.4] Save failure and mid-flow loss** — Retry CTA exists but mid-flow refresh loses everything. **Why:** Frustration and lost reflections. **Fix:** Ensure "Retry save" is visible and works on closing screen when saveError is true. Optionally add sessionStorage for thought + reflectionId and "Resume?" on load.

---

*End of master audit. No softening. Founder reputation is on the line; fix blockers and conditions before posting.*
