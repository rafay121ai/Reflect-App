# REFLECT — Master Audit Report (10 Dimensions)

**Audited:** 2026-03-06  
**Scope:** Full codebase — AI soul, UX, auth, frontend, backend, SEO, monetisation, security, branding, exceptional cases.

---

## 1. AI SOUL & PSYCHOLOGICAL DEPTH — 8/10

**What's working:**
- **Mirror report (shaped_by, costing_you, question):** Prompts explicitly require "what FORMED them," "zero exact phrases," "inference not reflection," upside AND cost in costing_you, and questions that "make them go quiet" and are about WHO THEY ARE. Good examples and bad examples (reframe vs revelation) are in the prompt. **1.1: 8/10**
- **Sparse answer handling:** `answer_signal` / `answer_depth` (≤2 words = SPARSE, ≤8 = MODERATE) is implemented in `get_personalized_mirror`, `get_closing`, and `get_mirror_report`. SPARSE instructions: "original thought 80% of material," "deliberate compression," "go deeper into original thought," "never pad." **1.2: 8/10**
- **Descriptive answer handling:** DESCRIPTIVE branch explicitly asks for FRAME, assumption underneath assumption, "rule they are living by that they never consciously chose," contradictions between thought and answers. **1.3: 8/10**
- **Archetype selection:** System prompt stresses "HOW they wrote," "Ignore surface keywords," emotional subtext; archetype list is passed and selection is by pattern. **1.4: 7/10**
- **Journey cards:** Banned therapy language, "match their energy," attune-first tone by conversation type (PRACTICAL/SOCIAL/EMOTIONAL/MIXED). **1.5: 8/10**
- **Closing:** Two movements (uncomfortable truth about who they ARE; watch-for + invitation). Answer-depth block for SPARSE/MODERATE vs DESCRIPTIVE. **1.6: 8/10**
- **Questions generated:** Conversation-type classification (PRACTICAL/EMOTIONAL/SOCIAL/MIXED) drives adaptive questions; "identity question always comes last"; last question "should make them pause." **1.7: 8/10**

**What's broken or missing:**
- Archetype selection can still feel generic if the model defaults to surface keywords; no explicit "slightly uncomfortable / earned" check in the archetype prompt.
- Journey cards are type-specific but don’t explicitly forbid summarisation in one line (they say "don’t summarize" in places but it could be stronger).

**Priority fix (score ≥8; no mandatory fix):** Optional — In `openai_client.py` archetype_system, add one line: "The archetype should feel earned and slightly uncomfortable — it should say something about them they haven't said about themselves."

---

## 2. USER EXPERIENCE & FLOW — 7/10

**What's working:**
- **First 60 seconds:** Guest path exists (no auth to reflect); onboarding has Skip + 3 slides; value prop ("Not what you wrote. How you wrote it") is clear. **2.1: 7/10**
- **Reflection flow:** Journey → Questions → Mirror → Mood → Closing is coherent; flow_mode (standard/deep/direct) varies structure; step labels and subtext are clear. **2.2: 8/10**
- **Return experience:** Closing includes "Next time you open REFLECT, I have something to show you"; reminders and "My Reflections" exist; revisit later and due reminders are shown. **2.3: 7/10**
- **Empty states:** Draft recovery banner; "You have an unsaved reflection"; history empty messaging in dropdown. **2.5: 7/10**
- **Error states:** ReflectionErrorBoundary with "Something went wrong" and "Start fresh"; mirror report fallback slides on parse failure; timeout toasts ("taking longer than usual"). **2.6: 7/10**

**What's broken or missing:**
- **2.4 Mobile:** Not fully verified (iOS Safari, tap targets, keyboard push). Capacitor and StatusBar are used; no explicit viewport/keyboard audit in code.
- **2.6:** No user-visible timeout with retry for every API call (e.g. reflect has 90s abort but no "Retry" on timeout in some paths). Cold start (Railway) can feel like a broken spinner.

**Priority fix (score < 8):** Add a visible "This is taking a while — Retry" control when reflect or mirror request times out (e.g. in LoadingState or after AbortController fires), and ensure the same pattern for closing/mirror report.

---

## 3. AUTHENTICATION & SESSION — 8/10

**What's working:**
- **Session persistence:** Supabase client; `getSession()` then `refreshSession()` on init; `onAuthStateChange` keeps state. **3.1: 7/10** (cookie fallback for localStorage eviction not verified in code; refresh_token in cookie not explicitly set in AuthContext.)
- **Auth flow:** Redirect to `/auth/callback`; error params from hash/query handled in AuthContext; `loading` blocks render until auth resolved. **3.2: 8/10**
- **Guest flow:** Guest reflect and guest mirror/closing; save-after-sign-in with `pendingSaveAfterSignIn`; migrate endpoint exists. **3.3: 8/10**
- **Sign-out:** App.js clears thought, reflection, viewing ids, history, closing, returnCard, modals, localStorage keys on logout. **3.4: 8/10**

**What's broken or missing:**
- No explicit "re-login on 401" UI in one place (API calls may get 401 and show generic error).
- Cookie storage for refresh_token is Supabase default; not audited in depth.

**Priority fix (score ≥8):** Optional — On 401 from any API, show a single "Your session expired. Sign in again." modal and redirect to sign-in.

---

## 4. FRONTEND QUALITY — 7/10

**What's working:**
- **Performance:** No obvious bundle bloat; images are logo/og. **4.1: 7/10**
- **Code quality:** No console.log in production paths (grep clean); ReflectionErrorBoundary wraps flow; flowMode/STEPS useMemo. **4.2: 7/10**
- **Resilience:** Error boundary present; API errors show toasts/fallbacks; 429 triggers paywall or toast. **4.4: 7/10**
- **Console:** No stray console.log in `frontend/src`. **4.5: 8/10**

**What's broken or missing:**
- **4.3 Accessibility:** Some buttons have aria-label (e.g. Reflect button); not every interactive element audited; contrast uses #FFFDF7 / #4A5568 (generally sufficient).
- **4.4:** No global unhandled rejection handler; Supabase init failure leaves app in loading or fallback — no explicit "Auth unavailable" screen.

**Priority fix (score < 8):** Add a single global `window.onunhandledrejection` (or error-boundary at root) that logs to Sentry if present and shows a generic "Something went wrong" so the app never fails silently. Ensure every critical button has `aria-label` where missing.

---

## 5. BACKEND QUALITY — 8/10

**What's working:**
- **API security:** All authenticated routes use `Depends(require_user_id)`; no `body.user_id`; rate limits on reflect, mirror, closing, mood, history, etc.; `request: Request` first on limited routes. **5.1: 9/10**
- **Input validation:** `thought` max_length=5000; answers/questions lists max_length=10; other fields capped. **5.2: 8/10**
- **OpenAI cost control:** `max_tokens` set on every `_chat` call (10–800); token usage logged in openai_client. **5.3: 8/10**
- **Database:** Indexes on user_id (or equivalent) per table; delete_user_data covers all user tables; RLS script exists for 8 tables; beta_feedback has RLS in its migration; user_usage RLS added in this audit. **5.4: 8/10**
- **Railway:** Procfile present; health check `/api/health` and `/api/health/llm`; retries for 429/500/503 in _chat; logging to stdout. **5.5: 7/10**

**What's broken or missing:**
- Cold start not addressed (no keep-alive).
- No request-id in log format for 500s.

**Priority fix (score ≥8):** Optional — Add RLS for `user_usage` (see applied fix below). Consider keep-alive cron for Railway if cold starts are reported.

---

## 6. SEO & DISCOVERABILITY — 8/10

**What's working:**
- **Technical SEO:** index.html has title, meta description, og:* and twitter:* tags, og:image. **6.1: 8/10**
- **sitemap.xml** and **robots.txt** present; Disallow /auth/callback. **6.1: 8/10**
- **Branding:** "Reflect" and tagline consistent in meta and og. **6.3: 8/10**

**What's broken or missing:**
- **6.2:** App is client-side (CRA); first contentful paint depends on JS; no SSR. Lighthouse and indexing depend on crawler executing JS.

**Priority fix (score ≥8):** None mandatory. For deeper SEO, consider pre-rendering landing or meta for bots.

---

## 7. MONETISATION & VALUE — 6/10

**What's working:**
- Trial and plan_type drive reflection limits; paywall on 429 and post-onboarding; trial welcome and expiry modals. **7.1–7.3: 6/10**

**What's broken or missing:**
- Paywall UI and subscription gating are partially implemented (RevenueCat present; Lemon Squeezy webhook); "what you get with paid" could be clearer before paywall.
- **7.4:** No explicit differentiation of mirror/personalisation by session count in copy; flow_mode (deep/direct) adds variation but isn’t surfaced as "different on session 10."

**Priority fix (score < 8):** Clarify paid value (e.g. one line before paywall: "Unlimited reflections and full pattern history"). Ensure trial expiry modal and banner copy are consistent and non-punishing.

---

## 8. SECURITY & PRIVACY — 8/10

**What's working:**
- **Data sensitivity:** Supabase at rest; no logging of thought content; RLS scopes tables to auth.uid(); delete_user_data covers all user tables. **8.1: 8/10**
- **Frontend:** No API keys in bundle; Supabase anon key only; sensitive data in localStorage is session/draft. **8.2: 8/10**
- **GDPR:** Privacy policy (OpenAI, Supabase, rights, delete, contact); cookie consent component; account deletion in-app. **8.3: 8/10**

**What's broken or missing:**
- Privacy policy link and cookie consent are present; analytics (Vercel) — compliance is policy-level.

**Priority fix (score ≥8):** None mandatory.

---

## 9. BRANDING & PRODUCT IDENTITY — 8/10

**What's working:**
- Voice consistent: "you," no advice, no therapy language; onboarding, journey, mirror, closing all align. **9.1: 8/10**
- Colours (#FFFDF7, #FFB4A9, #4A5568) and Fraunces/Manrope used consistently. **9.2: 8/10**
- Positioning: "reflection space, not therapy"; footer disclaimer; onboarding sets expectations. **9.3: 8/10**

**Priority fix (score ≥8):** None.

---

## 10. EXCEPTIONAL CASES — 7/10

**What's working:**
- **10.2 Vulnerable user:** Crisis detection before LLM; CrisisScreen; footer "In crisis? Text 988" and disclaimer. **10.2: 8/10**
- **10.5 Dropped session:** Draft recovery (localStorage); "Continue" / "Dismiss" for unsaved thought. **10.5: 7/10**
- **10.6 Concurrency:** Single in-flight reflect per submit (isReflectSubmitting); mirror report keyed by reflectionId/reflectionCount. **10.6: 7/10**
- **10.7 Offline/slow:** Timeout (90s) and abort; toast on timeout; retry not everywhere. **10.7: 6/10**

**What's broken or missing:**
- **10.1 Second session:** Personalisation kicks in after first reflection; no explicit "you’re back" or session-2 copy.
- **10.4 Power user:** personalization_block and theme_history improve depth; no explicit "reward" (e.g. streak) beyond closing.
- **10.7:** No offline banner or "Retry" on timeout for every critical call.

**Priority fix (score < 8):** Add a single user-visible timeout + Retry for reflect (and mirror report if possible) so 30+ second waits don’t feel like a dead app. Optionally show "You’re back" or subtle personalisation hint on session 2+.

---

## OUTPUT FORMAT SUMMARY

| Section | Score | Verdict |
|--------|-------|--------|
| 1. AI Soul & Psychological Depth | 8/10 | Prompts are revelation-focused; sparse/descriptive handling and closing are strong. |
| 2. User Experience & Flow | 7/10 | Flow and empty/error states are good; mobile and timeout retry need polish. |
| 3. Authentication & Session | 8/10 | JWT, guest flow, sign-out are solid; 401 handling could be centralised. |
| 4. Frontend Quality | 7/10 | Error boundary and no console.log; accessibility and global error handling can improve. |
| 5. Backend Quality | 8/10 | Security and validation are strong; RLS for user_usage added. |
| 6. SEO & Discoverability | 8/10 | Meta, sitemap, robots present; app is SPA. |
| 7. Monetisation & Value | 6/10 | Limits and trial exist; paid value and session-depth differentiation could be clearer. |
| 8. Security & Privacy | 8/10 | RLS, no secrets in frontend, deletion and privacy policy in place. |
| 9. Branding & Product Identity | 8/10 | Consistent voice and visual identity. |
| 10. Exceptional Cases | 7/10 | Crisis and draft recovery good; timeout retry and offline/return copy need work. |

---

**OVERALL SCORE: 7.5/10**

**Top 3 things that will lose users right now:**
1. **Cold start / long wait with no retry** — First request after Railway sleep or slow OpenAI feels like a broken app; no "Retry" on timeout in some paths.
2. **Unclear paid value** — Users hit the limit or paywall without a clear one-line explanation of what paid unlocks.
3. **Session 2+ doesn’t feel different** — No explicit "you’re back" or visible personalisation hint for returning users.

**Top 3 things that will retain users if fixed:**
1. **Timeout + Retry everywhere** — Reflect, mirror report, and closing should show "This is taking longer than usual — Retry" and a Retry button so slow networks don’t kill trust.
2. **One-line paid value before paywall** — e.g. "Unlimited reflections and your full pattern over time" so the paywall feels like an upgrade, not a block.
3. **Second-session recognition** — Small copy or state change (e.g. "You’re back" or "Your pattern is building") so returners feel the product remembers them.

**The one thing about this app that no competitor does — protect it.**  
The combination of **conversation-type classification (PRACTICAL/EMOTIONAL/SOCIAL)** plus **answer-depth (SPARSE/MODERATE/DESCRIPTIVE)** so the mirror and closing adapt to how much someone wrote — and the explicit "reveal, don’t reflect" / "rule they’re living by they never chose" prompt design — is the core differentiator. Keep refining those prompts and never replace them with generic summarisation or reassurance.
