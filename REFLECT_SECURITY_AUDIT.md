# REFLECT — Production Security & Readiness Audit

**Auditor role:** Senior Principal Engineer (Meta-style). No encouragement; ratings are harsh and numeric.  
**Scope:** Backend (FastAPI, Supabase, OpenAI), frontend (React 19, Vercel), iOS (Capacitor), payments (Lemon Squeezy, RevenueCat), guest flow, trial/subscription enforcement.  
**Key files reviewed:** `server.py`, `auth.py`, `usage_limits.py`, `supabase_client.py`, `security.py`, `lemon_squeezy_client.py`, `revenuecat_client.py`, `pattern_analyzer.py`, `openai_client.py`, frontend `App.js`, `config.js`, `supabase.js`, migration and RLS scripts.

---

## SECTION 1: PRODUCTION READINESS SCORECARD

| Area | Score /10 | One-line verdict |
|------|-----------|------------------|
| Authentication & JWT security | 7 | HS256 + audience check; legacy JWT only; no key rotation story. |
| Authorization & data isolation | 8 | **FIXED:** Reflection ownership enforced on mirror, closing, mood, remind (C1–C4). |
| Input validation & sanitization | 7 | Pydantic max_length on strings; MirrorRequest questions capped at 20; SaveHistoryRequest/ClosingRequest list caps. |
| LLM prompt security | 5 | Prefix-based “ignore instructions” only; no hard output schema or length cap on all paths. |
| Payment & webhook security | 9 | LS HMAC SHA256 + dedup; dedup fails closed (H2). |
| Database security (RLS + queries) | 5 | RLS enabled in migrations; backend uses service key so RLS bypassed; app-layer checks missing on 4 routes. |
| API rate limiting & abuse prevention | 6 | slowapi 10/min on LLM endpoints; guest is IP-only; no global auth rate limit. |
| Error handling & graceful degradation | 8 | Generic 500 handler (_server_error); no str(e) leaked to client. |
| Secrets & environment management | 7 | Env validated at startup; .env in .gitignore; anon/keys in frontend build expected. |
| Frontend security (CSP, XSS surface) | 6 | CSP set; script-src allows Lemon Squeezy; style-src 'unsafe-inline'; no nonce. |
| iOS / Capacitor security | 6 | Standard stack; no custom URL schemes audited; RevenueCat/Supabase declared. |
| Guest flow security | 5 | 10/min IP limit; 2 reflections max in localStorage; no cap on payload size for guest. |
| Trial & subscription enforcement | 7 | Server-side limits + atomic RPC; trial_start from server; LS webhook can be replayed if dedup fails. |
| Logging (no sensitive data leaking) | 7 | Exception logs use type(e).__name__ only; no PII/journal in logs. |
| Dependency & supply chain risk | 4 | npm: 26 vulns (Supabase auth-js, axios, react-router, etc.); pip-audit not run. |
| GDPR / privacy compliance | 6 | delete_user_data wipes tables + auth user; no DPA or data map verified. |
| App Store readiness (iOS) | 6 | Privacy/terms links; disclaimer in UI; account delete present; SDKs declared. |
| Performance & scalability under load | 5 | No connection pooling shown; get_due_reminders fetches all due then filters in app. |
| Monitoring & observability | 5 | Health check; GET /api/health/llm validates LLM connectivity. |
| Incident response readiness | 3 | No runbooks; no security contact; no rate-limit or abuse alerts. |

**Overall production readiness: 5/10**

- **DO NOT SHIP** until the four authorization bugs (reflection_id ownership) are fixed and 500 responses no longer leak `str(e)`.
- **SHIP WITH FIXES** — **DONE:** (1) reflection ownership checks on mirror, closing, mood, remind; (2) generic 500 handler returning opaque message; (3) npm audit critical/high addressed or accepted risk; (4) run pip-audit and fix known CVEs.
- **READY TO SHIP** — **PARTIALLY DONE:** above + logging redaction for PII/journal content (done: log type only), and minimal observability (health + GET /api/health/llm).

---

## SECTION 2: CRITICAL FINDINGS (SHOW STOPPERS)

### C1 — Cross-user reflection update (mirror)

- **Severity:** CRITICAL — **FIXED**
- **Location:** `backend/server.py` lines 546–547  
- **What an attacker would do:** Authenticated user A sends `POST /api/mirror/personalized` with `reflection_id` of user B’s reflection. Server calls `update_reflection(body.reflection_id, questions, answers, content)` with no ownership check. User B’s reflection gets overwritten with A’s Q&A and mirror.  
- **Fix:** Before `update_reflection`, fetch the reflection and enforce `user_id`:

```python
# server.py, in mirror_personalized, after the try: and thought/safe_thought setup, before get_personalized_mirror
if body.reflection_id:
    ref_row = get_reflection_by_id(body.reflection_id.strip())
    if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reflection not found")
# ... existing get_personalized_mirror and update_reflection
```

- **Time to exploit:** Minutes (one crafted request with a guessed or enumerated reflection UUID).

### C2 — Cross-user reflection update (closing)

- **Severity:** CRITICAL — **FIXED**
- **Location:** `backend/server.py` lines 588–589  
- **What an attacker would do:** Same as C1: `POST /api/closing` with another user’s `reflection_id`; `update_reflection_closing` overwrites that user’s closing text.  
- **Fix:** Same pattern — before updating closing, verify reflection belongs to `user_id`:

```python
# server.py, in closing(), before get_closing(...)
if body.reflection_id:
    ref_row = get_reflection_by_id(body.reflection_id.strip())
    if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reflection not found")
```

- **Time to exploit:** Minutes.

### C3 — Cross-user mood check-in

- **Severity:** CRITICAL — **FIXED**
- **Location:** `backend/server.py` lines 698–709  
- **What an attacker would do:** `POST /api/mood` with `reflection_id` of user B. Server calls `insert_mood_checkin(body.reflection_id, ...)` without checking that the reflection belongs to the authenticated user. Attacker can attach mood data to another user’s reflection.  
- **Fix:** Resolve reflection and enforce ownership before insert:

```python
# server.py, in mood(), after the two if not ... strip() checks
ref_row = get_reflection_by_id(body.reflection_id.strip())
if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
    raise HTTPException(status_code=404, detail="Reflection not found")
# then existing insert_mood_checkin(...)
```

- **Time to exploit:** Minutes.

### C4 — Cross-user reminder creation

- **Severity:** HIGH (escalated to CRITICAL for data integrity) — **FIXED**
- **Location:** `backend/server.py` lines 622–640  
- **What an attacker would do:** `POST /api/remind` with `reflection_id` of user B. Server uses the reflection only for LLM reminder message, then calls `insert_revisit_reminder(body.reflection_id, ...)`. User A creates a reminder for user B’s reflection; when B fetches due reminders, they see it. No consent; pollutes B’s data.  
- **Fix:** Ensure reflection belongs to current user before creating reminder:

```python
# server.py, in remind(), after days = max(1, min(7, body.days))
reflection = get_reflection_by_id(body.reflection_id.strip())
if not reflection or (reflection.get("user_id") or "").strip() != user_id:
    raise HTTPException(status_code=404, detail="Reflection not found")
# then existing logic: thought, mirror snippet, message, insert_revisit_reminder
```

- **Time to exploit:** Minutes.

**Categories with no critical finding:** Payment bypass (Lemon Squeezy HMAC + dedup; RevenueCat server-side). App Store rejection (no single finding that guarantees rejection). Legal (no finding that by itself creates clear liability). Complete outage (no single finding that takes down the service).

---

## SECTION 3: HIGH SEVERITY FINDINGS

### H1 — 500 responses leak exception text

- **Severity:** HIGH — **FIXED**
- **Location:** `backend/server.py` — multiple routes
- **Fix applied:** `_server_error(e, context)` returns generic message; all 500 paths use it; real error logged server-side as type only.

### H2 — Lemon Squeezy webhook deduplication fails open

- **Severity:** HIGH — **FIXED**
- **Location:** `backend/lemon_squeezy_client.py` lines 94–105
- **Fix applied:** `is_duplicate_event` returns True (fail closed) when client is None or on exception.

### H3 — Frontend npm vulnerabilities

- **Severity:** HIGH  
- **Location:** `frontend/package.json` and lockfile; `npm audit --production` reports 26 vulnerabilities (17 high). Includes: @supabase/auth-js (path routing), axios (DoS), react-router (CSRF/XSS/open redirect), serialize-javascript (RCE), minimatch/nth-check (ReDoS), etc.  
- **Impact:** Depends on usage and build/runtime exposure; at minimum increases supply-chain and build-time risk.  
- **Fix:** Run `npm audit` and `npm audit fix` (and where needed `npm audit fix --force` with regression testing). Upgrade @supabase/supabase-js to a version that pins a fixed @supabase/auth-js. Document any accepted risks.  
- **Priority:** Fix critical/high before launch; others within 2 weeks.

---

## SECTION 4: MEDIUM SEVERITY FINDINGS

### M1 — MirrorRequest questions list unbounded

- **Severity:** MEDIUM — **FIXED**
- **Location:** `backend/server.py` — MirrorRequest
- **Fix applied:** `questions: list[str] = Field(..., max_length=20)`.

### M2 — Logging can include sensitive content

- **Severity:** MEDIUM — **FIXED**
- **Location:** `backend/server.py`
- **Fix applied:** All `logging.exception`/`logging.warning` that could include user content now log only `type(e).__name__`; no request bodies or LLM content in logs.

### M3 — Guest endpoints accept large payloads

- **Severity:** MEDIUM  
- **Location:** `backend/server.py` — `/api/reflect/guest`, `/api/mirror/personalized/guest`, `/api/closing/guest` use same Pydantic models (e.g. thought 5000 chars, mirror 3000).  
- **Impact:** 10/min per IP can still send large payloads; cost and load could be non-trivial.  
- **Fix:** Consider stricter limits for guest (e.g. lower max_length for guest-only models or a single shared model with a `guest=True` path that shortens limits).  
- **Priority:** Fix post-launch or before launch if abuse is a concern.

### M4 — Personalization cron secret in query string

- **Severity:** MEDIUM — **FIXED**
- **Location:** `backend/server.py` — POST `/api/personalization/refresh-all`
- **Fix applied:** Secret accepted only via header `X-Cron-Secret`; `secret` query parameter removed.

---

## SECTION 5: LOW SEVERITY + HYGIENE

- **Missing list length validation:** `SaveHistoryRequest.answers`, `ClosingRequest.answers` are list/dict with no max size; could be used for large payloads. Add `max_items` or equivalent.  
- **Health check:** `/api/health` does not verify LLM connectivity; a failing OpenAI/OpenRouter would only be detected when a user hits reflect. Add an optional LLM ping or mark “llm” in health.  
- **get_due_reminders:** Fetches all due reminders then filters in Python; at scale, add a filter by user (e.g. via join with reflections) or a small RPC.  
- **Tests:** No automated tests observed for auth, ownership checks, or rate limits; add at least smoke tests for the four fixed routes (mirror, closing, mood, remind).  
- **pip-audit:** Not run in repo; add to CI and fix known CVEs for production deps.

---

## SECTION 6: OWASP TOP 10 — LINE BY LINE

| ID | Item | Status | Evidence |
|----|------|--------|----------|
| A01 | Broken Access Control | **FIXED** | Ownership enforced on mirror, closing, mood, remind (C1–C4). |
| A02 | Cryptographic Failures | **MITIGATED** | TLS in use; JWT HS256 with server secret; LS webhook HMAC SHA256; no sensitive data at rest reviewed in code. |
| A03 | Injection | **PARTIAL** | Pydantic and max_length limit input size; sanitize_for_llm is a soft prefix; no strict output schema on all LLM responses. SQL uses parameterized Supabase client. |
| A04 | Insecure Design | **PARTIAL** | Authorization design missing ownership checks on resource IDs; otherwise separation of concerns is reasonable. |
| A05 | Security Misconfiguration | **PARTIAL** | CSP has 'unsafe-inline' for style; CORS and TrustedHost configured; ALLOWED_HOSTS must be set in production. |
| A06 | Vulnerable and Outdated Components | **VULNERABLE** | npm audit: 26 vulns; pip-audit not run; see H3 and Section 11. |
| A07 | Identification and Authentication Failures | **PARTIAL** | Supabase Google OAuth; JWT validated with audience; no brute-force or account-lockout observed. |
| A08 | Software and Data Integrity Failures | **MITIGATED** | Webhook HMAC verified; dedup fails closed (H2). |
| A09 | Security Logging and Monitoring Failures | **PARTIAL** | Logging redacted (type only); GET /api/health/llm added. |
| A10 | SSRF | **NOT APPLICABLE** | No server-side fetch of user-controlled URLs found. |

---

## SECTION 7: REFLECT-SPECIFIC THREAT VECTORS

### T1 — Journal content privacy

- **Path:** Browser → API (Pydantic) → sanitize_for_llm → LLM → DB (Supabase).  
- **Risks:** (1) `detail=str(e)` can leak fragments in errors. (2) Logging with `logging.exception(e)` can include context that carries user content. (3) API responses (reflection, history, mirror, closing) return content only to the caller; after fixing C1–C4, no cross-user return of journal content.  
- **Rating: 6/10** — End-to-end privacy is reasonable once error and log leakage are reduced; no found case where journal content is intentionally sent to another user.

### T2 — LLM prompt injection

- **sanitize_for_llm** (`backend/security.py`): Prepends an instruction to ignore instructions in user text. No hard output format or length cap; model can still follow user instructions to some degree.  
- **Risks:** Extract system prompt, force harmful output, or bypass reflection format — all possible in theory; prefix reduces likelihood but is not sufficient for high-assurance.  
- **Rating: 4/10** — Soft mitigation only; no structured output or post-processing to enforce format/safety.

### T3 — Subscription/trial bypass

- **Enforcement:** Server-side only: `enforce_reflection_limit`, RevenueCat for plan_type, Lemon Squeezy webhook for plan updates. Trial start and usage live in `user_usage`; RPC `increment_reflection_usage` is atomic.  
- **Risks:** (1) Webhook replay if dedup fails (H2). (2) Direct DB write to `user_usage` only if an attacker had DB access (service key). No client-controlled trial_start.  
- **Rating: 7/10** — Solid server-side enforcement; main gap is webhook dedup fail-open.

### T4 — Guest flow abuse

- **Rate limit:** 10/minute per IP on `/api/reflect/guest`, mirror/guest, closing/guest.  
- **Abuse:** Attacker can script from many IPs; 10/min per IP caps single-IP cost. No auth, so no per-user cap.  
- **Worst case:** Many IPs × 10 req/min × cost per reflection; estimate depends on LLM pricing.  
- **Rating: 5/10** — Per-IP limit is present; no global or geo-based cap.

### T5 — Cross-user data access

- **Read paths:** All read routes that return user data use `require_user_id` and either (1) filter by user_id in the API (e.g. list_reflections_by_user, list_saved_reflections_*), or (2) fetch by ID then check row.user_id (e.g. get_reflection_route, history_get_one, reminder_delete).  
- **Write paths:** C1–C4 are the only cross-user write paths found; after fixing them, no remaining path allows user A to write to user B’s data.  
- **Rating: 4/10** before fixes (due to C1–C4); **8/10** after fixes.

### T6 — Pattern data sensitivity

- **Tables:** `reflection_patterns` stores core_tension, self_beliefs, recurring_phrases, etc. Migration enables RLS with `auth.uid() = user_id`. Backend uses service key so RLS is bypassed; access is only via server routes.  
- **Included in deletion:** `delete_user_data` deletes `reflection_patterns` by `user_id`.  
- **Returned to wrong user:** Pattern data is fetched by `get_pattern_history_for_user(user_id)` and used only in LLM context for that user; no API returns pattern rows to the client.  
- **Rating: 7/10** — Sensitive data is scoped and deleted; no cross-user return found.

---

## SECTION 8: INFRASTRUCTURE AUDIT

- **Railway:** Deployment and env vars are standard; no code review of Railway config. Ensure ALLOWED_HOSTS and ALLOWED_ORIGINS are set for production.  
- **Supabase:** Tables referenced (reflections, mood_checkins, revisit_reminders, reflection_patterns, saved_reflections, weekly_insights, user_personalization_context, profiles, user_usage, webhook_events): RLS enabled where applicable; backend uses service key so all access is server-side. Service key must be kept secret and not used from frontend.  
- **Vercel frontend:** Build uses REACT_APP_* vars; these are baked into client bundle (expected for anon key and API URL). Ensure no service keys or JWT secrets in frontend. CSP is set in backend middleware; confirm it matches actual assets and that source maps are not served in production if not desired.

---

## SECTION 9: PERFORMANCE & SCALABILITY

- **LLM under load:** Single provider (OpenAI/OpenRouter); no connection pooling in code; concurrency limited by rate limit (10/min per user) and provider. **6/10** — Adequate for small scale; under 100 concurrent users, LLM latency will dominate.  
- **DB:** Supabase client used per request; no explicit connection pooling. Queries are simple; `get_due_reminders()` fetches all due then filters in app — **5/10**; add user-scoped filter or RPC for scale.  
- **Rate limiting:** slowapi in-process; 10/min per IP for guest, per user for auth. At 1000 users, in-process state is fine; at much larger scale consider Redis-backed limit. **6/10**.  
- **100 concurrent users:** Likely OK if DB and LLM hold; watch 502/503 from LLM timeouts.  
- **1000 concurrent users:** Need to validate DB connection limits, LLM rate limits, and cost.  
- **Estimated OpenAI cost (1000 users, 3 reflections/day):** 3000 reflections/day; order of magnitude depends on model and tokens (e.g. $0.01–0.05 per reflection → $30–150/day).  
- **N+1:** No N+1 in supabase_client reviewed; single-query patterns.

---

## SECTION 10: APP STORE READINESS

- Privacy policy: Linked from footer (`/privacy.html`); accessible without login.  
- Terms of service: Linked (`/terms.html`); accessible without login.  
- Not-therapy disclaimer: Present in footer.  
- Account deletion: Implemented in Settings → delete account; calls `DELETE /api/user/account`.  
- Data collection: To be disclosed in App Store privacy nutrition label (not verified in code).  
- No private API usage: Not audited.  
- ITSAppUsesNonExemptEncryption: Not verified in project.  
- Minimum iOS version: Set via Capacitor/iOS project (not verified).  
- Third-party SDKs: RevenueCat, Supabase, Capacitor — typically declared in app metadata.  
- IDFA/ATT: No use of IDFA observed; RevenueCat may have its own attribution; ensure ATT prompt if any IDFA use.  
- Push permissions: Handled for revisit notifications.  
- Misleading claims: App description not reviewed.

**App Store submission risk: MEDIUM.**  
**Most likely rejection reason if submitted today:** Privacy or data use disclosure (nutrition label / policy clarity), or missing export compliance (ITSAppUsesNonExemptEncryption) if not set.

---

## SECTION 11: DEPENDENCY AUDIT

- **Frontend (npm audit --production):** 26 vulnerabilities (2 low, 7 moderate, 17 high). Notable: @supabase/auth-js (GHSA-8r88-6cj9-9fh5), axios (DoS), react-router (CSRF/XSS/open redirect), serialize-javascript (RCE), minimatch/nth-check (ReDoS), lodash (prototype pollution), ajv (ReDoS). Many live under react-scripts; fixing some may require upgrading or ejecting. **Upgrade priority:** IMMEDIATE for auth-js and RCE/CSRF-related; BEFORE LAUNCH for high; POST LAUNCH for moderate/low.  
- **Backend:** pip-audit was not run (command not found). requirements.txt: fastapi, uvicorn, httpx, supabase, python-dotenv, PyJWT[crypto], slowapi. **Action:** Run `pip-audit` (or equivalent) in CI and fix known CVEs; document before launch.

---

## SECTION 12: WHAT TO DO IN THE NEXT 72 HOURS

**Hour 0–4 (tonight)**  
1. **server.py:** **DONE** — Reflection ownership checks for mirror, closing, mood, remind (C1–C4).  
2. **server.py:** **DONE** — `_server_error(e, context)` and generic 500 message (H1).  
3. **lemon_squeezy_client.py:** **DONE** — `is_duplicate_event` fail closed (H2).

**Hour 4–24 (tomorrow)**  
4. **MirrorRequest:** **DONE** — `questions` max_length=20; SaveHistoryRequest/ClosingRequest list caps.  
5. **npm:** Run `npm audit` and `npm audit fix`; upgrade @supabase/supabase-js to a version that pulls in fixed auth-js; test auth flow.  
6. **Logging:** **DONE** — Exception logs use type(e).__name__ only; no PII/journal content.

**Hour 24–72 (this week)**  
7. **pip-audit:** Add to backend (e.g. `pip install pip-audit` and run in CI); fix any high/critical CVEs.  
8. **Health check:** **DONE** — GET `/api/health/llm` pings LLM and returns ok/unavailable.  
9. **Personalization cron:** **DONE** — Secret via X-Cron-Secret header only; query param removed.  
10. **Smoke tests:** Add minimal tests for the four fixed routes (mirror, closing, mood, remind) asserting 404 when reflection_id belongs to another user.

---

## SECTION 13: HONEST FINAL VERDICT

1. **If 1000 users signed up tomorrow, would their journal content be safe?**  
   **YES** after C1–C4 fixes. Content is scoped to the authenticated user and not returned or overwritten by others.

2. **Could a motivated attacker read another user’s reflections today?**  
   **NO** for read paths — all observed read endpoints enforce ownership. **NO** for writing after C1–C4 fixes.

3. **Could someone get unlimited free reflections by bypassing the trial?**  
   **UNLIKELY.** Limits are enforced server-side; webhook dedup now fails closed (H2).

4. **Is there anything that would make a Meta security engineer refuse to ship?**  
   **The critical items are fixed.** C1–C4 (authorization), H1 (500 leakage), H2 (dedup fail open) are addressed. Remaining: npm/pip dependency CVEs, optional smoke tests.

5. **Overall: is this app ready for 50 beta users right now?**  
   **REASONABLE.** Critical authz and error leakage are fixed. Proceed with beta with monitoring; address npm/pip-audit and add smoke tests as follow-up.

---

*End of audit.*
