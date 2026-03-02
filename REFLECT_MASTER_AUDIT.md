# REFLECT — Senior Dev Final Review
### Hey Cursor. I need you to be my second pair of eyes on this. We're getting REFLECT ready for production and App Store submission. I've built this mostly with AI assistance and I need you to come in with actual senior-dev judgement — not just syntax checking, but the kind of review that catches the things that only bite you after you ship. Don't be diplomatic. Be useful. A false 9/10 wastes my time. An honest 5/10 with a clear fix list saves the launch.

Four phases. Read first. Audit second. Clean third. Rate and roadmap fourth. Don't collapse them. Don't skip ahead. Phases 1 and 2 are strictly read-only.

---

## THE APP

REFLECT is a private AI journaling app. Stack:
- **Frontend**: React 19, Tailwind, Framer Motion, Capacitor (iOS), hosted on Vercel
- **Backend**: FastAPI (Python 3.12), hosted on Railway
- **Database**: Supabase (PostgreSQL + Auth)
- **LLM**: OpenAI via `openai_client.py`
- **Auth**: Supabase JWT validated in `backend/auth.py`
- **Payments**: RevenueCat SDK installed — paywall not yet built

Recent significant changes:
- Auth + rate limiting added to all LLM routes
- Personalization (`_build_personalization_block`) added to all LLM functions
- Account deletion added
- theme_history tracking in Supabase
- Closing screen redesigned
- Privacy/terms pages added
- Multiple cleanup passes

There is almost certainly dead code, half-implemented features, and things that are broken in ways I don't know about. Find them.

---

## PHASE 1 — READ THE WHOLE THING FIRST

Don't touch anything. Don't form opinions yet. Just read every file listed below completely. I need you to understand how this app actually works before you evaluate it.

**Backend:**
- `backend/server.py` — every route, every middleware, every dependency
- `backend/openai_client.py` — every LLM function
- `backend/supabase_client.py` — every DB operation
- `backend/auth.py` — JWT verification logic
- `backend/llm_provider.py` — provider switching
- `backend/pattern_analyzer.py` — pattern logic
- `backend/requirements.txt`
- `backend/.env.example`

**Frontend — Core:**
- `frontend/src/App.js`
- `frontend/src/components/ReflectionFlow.jsx`
- `frontend/src/components/ClosingScreen.jsx`
- `frontend/src/components/SettingsPanel.jsx`
- `frontend/src/components/InputScreen.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/lib/supabase.js`
- `frontend/src/lib/config.js`
- `frontend/src/lib/api.js` (if it exists)

**Frontend — Public:**
- `frontend/public/index.html`
- `frontend/public/privacy.html`
- `frontend/public/terms.html`

**Config & Root:**
- `frontend/capacitor.config.json`
- `frontend/package.json`
- `backend/package.json` (if it exists)
- `.gitignore` (root, frontend, backend — all three)
- `supabase_rls_setup.sql` (if it exists)
- `personalization_schema_update.sql` (if it exists)
- `Procfile` or `railway.toml` (if they exist)
- `frontend/vercel.json` (if it exists)

After reading everything, write me a 2-3 paragraph honest summary. What's the overall health? What immediately looks risky? What's solid? Then move to Phase 2.

---

## PHASE 2 — FULL AUDIT

Still no changes. Go through every section. For each check:
- ✅ Done and done correctly
- ❌ Missing entirely
- ⚠️ Partial or done wrong

Quote the exact code or line number. "I think this might be an issue" is useless. "Line 47 in server.py shows `allow_origins=['*']`" is useful.

---

### A. BACKEND SECURITY

**Route-by-route protection audit:**
Go through every route in `server.py`. For each one tell me:
- Route path and method
- Does it call the LLM? Protected with `require_user_id`?
- Does it read/write the database? Protected?
- Rate limited with `@limiter.limit()`?
- `request: Request` first parameter? (slowapi silently skips rate limiting if it's not first)

Don't group them. List every route individually.

**Spoofing check — this is critical:**
Is there any route where `user_id` comes from `body.user_id` or anywhere in the request body instead of `Depends(require_user_id)`? Flag this as CRITICAL immediately. It means any logged-in user can impersonate any other user.

**CORS:**
Paste the exact CORS configuration from `server.py`. Is `allow_origins` locked to a specific env-based origin or is it `["*"]`?

**Input validation:**
Do `ReflectRequest`, `MirrorRequest`, `ClosingRequest`, `RemindRequest` have `max_length` on string fields? No max_length on `thought` means someone sends a 200,000-token prompt and destroys the OpenAI budget in one request.

**Dependency versions:**
Check `requirements.txt` for outdated packages with known issues:
- `fastapi` below 0.100 — has security issues
- `pyjwt` below 2.4 — has CVEs
- `httpx` below 0.23 — has issues
- `starlette` (used by fastapi) — check version
Flag anything outdated with the current safe version.

**Timeout handling:**
What is the httpx client timeout set to for LLM calls? If OpenAI hangs for 90 seconds, does the request hang forever? What does the frontend show during this time? There should be a timeout set AND a frontend error state that fires after N seconds.

**Async correctness:**
Are there blocking synchronous calls inside `async def` route handlers? Look for:
- `supabase.table(...).execute()` called directly in async routes without `run_in_threadpool`
- Any `time.sleep()` in async code
- Any synchronous file I/O in async handlers
These block the event loop and cause all concurrent requests to queue behind them.

**HTTP method correctness:**
Are routes using the right HTTP verbs? GET requests should never modify data. POST/PUT/DELETE should be used for mutations. A GET that modifies state is both a security issue and a caching bug.

**Response consistency:**
Do all error responses use the same format? A mix of `{"detail": "..."}` and `{"error": "..."}` means the frontend error handling is probably fragile. Pick one format and stick to it.

---

### B. DATA SECURITY

**Secret scan — do this first:**
Search every `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.html`, `.json` file (not `.env`) for:
- Any string containing `.supabase.co`
- Any string starting with `sk-` longer than 20 chars
- Any string starting with `eyJ` longer than 50 chars
- Anything named `service_key`, `service_role`, `jwt_secret` with an actual value
- `SUPABASE_SERVICE_KEY` referenced anywhere in frontend code

If you find anything: put it at the absolute top of your entire response before anything else. This is job one.

**Environment variable coverage:**
List every `os.getenv()` call in the backend. Cross-reference with `backend/.env.example`. Are all of them documented? Are there any documented in `.env.example` that the code never actually reads?

**Account deletion completeness:**
Find `DELETE /api/user/account`. List every single table it deletes from. Then grep the codebase for every table name used anywhere (in queries, in SQL, in comments). Compare the two lists. Any table with user data that isn't deleted is a GDPR and App Store compliance violation.

**Data scoping:**
For every GET route that returns rows from the database — is the query filtered by the authenticated `user_id`? Is there any route where knowing someone's `reflection_id` or `user_id` lets you read their data without being them?

**Supabase RLS:**
Is `supabase_rls_setup.sql` present? Read it. Does it cover every table that stores user data? A table without RLS policies means your backend service key being compromised exposes every user's data.

**Logging sensitive data:**
Are there any `logger.info()` or `logger.warning()` calls that log user content? (e.g. logging the `thought` string for debugging). User journaling content should never appear in server logs.

---

### C. AUTHENTICATION

**Full route authentication map:**
List every route. Authenticated or not. This should be a complete table — no exceptions.

**JWT validation correctness:**
Read `auth.py` carefully. Is the algorithm explicitly specified (should be `algorithms=["HS256"]`)? An unspecified algorithm can be exploited. Is the token expiry checked? Is the signature actually verified against the Supabase JWT secret?

**Token refresh:**
Supabase tokens expire after 1 hour. Does the frontend handle this? What happens when a user is mid-reflection and their token expires — does the API call fail silently, crash, or show a re-login prompt?

**Auth initialization race:**
In `App.js` — is there a loading state that prevents the app from rendering protected content before auth state is resolved? This is a very common React bug. The auth check is async, so on first load there's a moment where `user` is `null` before Supabase responds. If the app renders based on `user !== null` without a loading state, there's a flash of unauthenticated content.

**Sign-out completeness:**
Does sign-out clear local storage? Does it cancel any in-flight API calls? Does it clear sensitive data from React state (reflection content, mirror text, etc.)? A sign-out that leaves reflection content in memory is a privacy issue on shared devices.

**Service key exposure:**
The Supabase anon key in frontend is expected and fine. The service role key in frontend is a catastrophic security hole — it bypasses all RLS. Confirm the service key is ONLY in backend env vars.

---

### D. PERFORMANCE & RELIABILITY

**LLM call chain timing:**
Map every OpenAI API call in a single reflection flow. Are any of them sequential when they could be parallel? For example, if mood suggestions and pattern extraction are both called after the mirror, could they run concurrently with `Promise.all()` or `asyncio.gather()`? Give me an estimated minimum time for the full flow end-to-end.

**Error recovery per LLM step:**
For each LLM step (reflect, mirror, mood, closing), answer:
- What happens if the API call times out?
- What happens if OpenAI returns a 429 (rate limit)?
- What happens if the response is unparseable?
- Does the UI show an error state or hang on the spinner forever?

**Double-tap / double-submit protection:**
Is there a loading guard on the "Reflect" button? On the question submit? If a user taps twice fast, do two API calls fire? Two LLM calls = double the cost and potentially two saved reflections with duplicate data.

**Race conditions:**
In `App.js` and `ReflectionFlow.jsx` — are there async operations that could complete out of order? Specifically: if `get_reflection` and a subsequent `get_mirror` call both return, could they set state in the wrong order if the user navigated back and forward quickly?

**Memory leaks:**
Check every `useEffect` that uses `setInterval`, `setTimeout`, event listeners, or Supabase subscriptions. Does each one have a cleanup return function? Missing cleanup = memory leaks and state updates on unmounted components.

**Backend cold starts:**
Railway spins down free tier services after inactivity. Is there any mechanism to keep the backend warm? A sleeping backend means the first user request after idle period takes 10-30 seconds. This will feel like the app is broken to users.

**Retry logic:**
If an API call fails with a 500 or network error, does the frontend retry? Or does the user see a permanent error state? For LLM calls specifically, a transient OpenAI error that auto-retries once would save a lot of failed sessions.

**Payload size:**
What is the typical request payload size for `POST /api/reflect`? What's the maximum possible size given the Pydantic field limits? Large payloads slow network transfers, especially on mobile connections. Anything over 50KB for a single API request is worth questioning.

---

### E. REACT-SPECIFIC ISSUES

**Missing key props:**
Find every `.map()` in every JSX file. Does each one have a `key` prop on the outermost rendered element? A missing key causes React to re-render entire lists instead of updating individual items — creates visual bugs and performance issues.

**Stale closures in useEffect:**
Find every `useEffect` that references state variables or props inside the callback. Are those variables in the dependency array? A missing dependency means the effect runs with stale data. This is silent — no error, just wrong behaviour.

**useEffect with no deps array vs empty deps array:**
`useEffect(fn)` runs after every render. `useEffect(fn, [])` runs once. `useEffect(fn, [dep])` runs when dep changes. Are these used correctly? A useEffect with no deps array that makes an API call is making that API call on every single re-render.

**Prop drilling depth:**
Trace the component tree from `App.js` down. How many levels deep does prop drilling go for the most commonly used callbacks (like `onReflectionComplete` or `user`)? Anything beyond 3 levels is fragile and should use context.

**Direct DOM manipulation:**
Any `document.getElementById`, `document.querySelector`, or `ref.current.style =` assignments in React components? These bypass the virtual DOM and cause bugs when React re-renders.

**Conditional hook calls:**
Are there any hooks called inside if statements, loops, or after early returns? This violates Rules of Hooks and causes runtime crashes that are hard to debug.

**State mutation:**
Is state ever mutated directly? (`state.push(item)` instead of `setState([...state, item])`). Direct mutation doesn't trigger re-renders and causes subtle bugs.

**Unnecessary re-renders:**
Are there objects or arrays created inline in JSX props or useEffect deps arrays? (`style={{ color: 'red' }}` creates a new object every render — causes infinite loops in useEffect). Look for these patterns.

**Error boundaries:**
Is there a React Error Boundary anywhere in the component tree? Without one, any unhandled JavaScript error in a component will crash the entire app and show a blank screen. This is critical for production.

---

### F. USER EXPERIENCE GAPS — The things that feel broken even when they technically work

**Loading states completeness:**
For every async operation in the reflect flow — is there a visible loading indicator? List each async operation and whether it has: a loading spinner, disabled input, and something that prevents user interaction during the wait.

**Empty states:**
What does the user see when:
- They have no reflections yet (history is empty)?
- The mood suggestions fail to load?
- The weekly insights haven't generated yet?
- Their personalization context is empty?
Each of these should show something intentional, not a blank space or a JavaScript error.

**Offline behaviour:**
What happens if the user loses network connection mid-reflection? Does it crash? Show an error? Hang indefinitely? On iOS, network conditions vary. The app should handle offline gracefully.

**Keyboard behaviour on iOS:**
In Capacitor apps, the iOS keyboard pushing up the viewport is a notorious issue. Does the text input area stay visible when the keyboard appears? Is there a `ScrollView` or equivalent wrapping input areas?

**Text overflow:**
For the closing screen and mirror text — what happens if the LLM returns an unusually long response? Does text overflow its container, clip, or scroll correctly?

**Accessibility basics:**
Are interactive elements (buttons, inputs) accessible? Do buttons have descriptive labels (not just icons with no `aria-label`)? Is there sufficient colour contrast? This affects App Store review — Apple checks basic accessibility.

**First-time user experience:**
What does a brand new user see the moment they open the app for the first time after signing up? Is there any onboarding, empty state, or guidance? Or do they land on a blank screen and have to figure it out?

**Haptic feedback:**
Capacitor has a Haptics plugin. Are there haptic responses on key interactions (completing a reflection, tapping the close button)? This makes the iOS app feel native instead of like a website.

---

### G. CAPACITOR / iOS SPECIFICS

**capacitor.config.json audit:**
- `appId` — is it real and unique? (not `com.example.app`)
- `appName` — set correctly?
- `webDir` — set to `"build"`?
- Is there a `server.url` pointing to localhost? If yes, the production app crashes because localhost doesn't exist on device
- `androidScheme` — set to `"https"`?
- `backgroundColor` — set? An unset background causes a white flash on app launch

**Info.plist audit:**
Read every key in `ios/App/App/Info.plist`. Check for:
- `NSUserNotificationsUsageDescription` — required if local or push notifications used
- `NSCameraUsageDescription` — required if camera used
- `NSPhotoLibraryUsageDescription` — required if photos used
- `NSMicrophoneUsageDescription` — required if audio used
- `NSFaceIDUsageDescription` — required if biometric used
- Any localhost URLs in `LSApplicationQueriesSchemes`
- `ITSAppUsesNonExemptEncryption` — should be set to NO if app doesn't use custom encryption (avoids export compliance questions)

**App icon completeness:**
Check `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json`. Does it reference all required sizes? Are the actual image files present for every referenced size? A single missing size causes Xcode to fail the build silently.

**Capacitor plugin native sync:**
For every `@capacitor/` package in `package.json`, confirm that `npx cap sync` has been run and the native code is up to date. Stale native code causes crashes that don't appear in web testing.

**WKWebView content security:**
Is `limitsNavigationsToAppBoundDomains` set in `Info.plist`? Without it, links in the web content can open external sites inside the app, which is a security issue Apple flags.

**Splash screen:**
Is there a splash screen configured? A missing splash screen shows a white flash on launch. Check `@capacitor/splash-screen` is installed and configured.

---

### H. PERSONALIZATION

- Does `_build_personalization_block()` exist? In exactly one file?
- Is it called in `get_reflection()`, `get_personalized_mirror()`, and `get_closing()`?
- Does each of those functions have `user_context: dict = None` in its signature?
- Do the `/api/reflect`, `/api/mirror/personalized`, and `/api/closing` routes in `server.py` fetch `user_context` and pass it through?
- Does personalization refresh run automatically after a reflection? As a background task (non-blocking)?
- Does the supabase update function write `theme_history`? Cap at 8 entries?
- What happens on the very first reflection — does `_build_personalization_block` return an empty string gracefully without crashing?
- Is there any point where missing context data causes a KeyError instead of a graceful fallback?

---

### I. CODE HEALTH & MAINTAINABILITY

**Function length:**
Are there any functions over 150 lines? These are doing too many things and are maintenance nightmares. List them with their approximate line count.

**God components:**
Is `App.js` over 400 lines? Components that own routing, state management, API calls, AND rendering are fragile. How many pieces of state does `App.js` manage? If it's over 10, it needs to be split.

**Magic strings and numbers:**
Are there hardcoded strings scattered through the code that should be constants? Examples:
- `"gentle"` as a default reflection mode appearing in 6 different files
- Table names like `"reflections"` or `"saved_reflections"` appearing inline in queries instead of as constants
- `10` as a rate limit appearing multiple places instead of a named constant
These cause bugs when you change something in one place but forget another.

**TODOs and FIXMEs:**
List every `TODO`, `FIXME`, `HACK`, `XXX`, or `NOTE:` comment in the entire codebase. For each one, tell me: is this still relevant, already done, or forgotten? Some of these are features that got started and abandoned.

**Naming consistency:**
Is there a consistent naming convention? Mixed `camelCase` and `snake_case` in JavaScript, or inconsistent Python function naming, signals code written by multiple people (or AI) without a style guide. Not critical but flag it.

**Test coverage:**
Are there any tests at all? Unit tests, integration tests, anything? An app with zero tests is fine for an early launch but it means every refactor is a risk. Just tell me the current state.

**Configuration management:**
Is there a single source of truth for configuration values? Or are constants like the backend URL, rate limits, and model names scattered across multiple files?

---

### J. DEPLOYMENT & DEVOPS

**Railway startup command:**
Is there a `Procfile`, `railway.toml`, or `nixpacks.toml` in the backend directory? Without an explicit start command, Railway guesses — and gets it wrong sometimes. What does Railway use to start the uvicorn server?

**Vercel routing:**
Does `frontend/vercel.json` exist? If the app uses client-side routing (React Router or hash routing), does it have a catch-all rewrite so that refreshing any URL doesn't 404? Without this, users who navigate to a deep link or refresh get a 404.

**Environment variable validation at startup:**
Does the backend check on startup that required env vars are set? Or does it start successfully and then crash on the first request that tries to use a missing API key? A `startup` event that validates env vars and fails fast with a clear error message is much better than a cryptic `KeyError` at runtime.

**Health check endpoint:**
Does `GET /api/health` exist? What does it return? Railway and monitoring tools need this. A good health check returns: current time, database connection status, LLM provider status, and version. A bad health check just returns `{"status": "ok"}` without actually checking anything.

**Logging configuration:**
Is Python's `logging` module configured with a format that includes timestamps and log levels? Or is it just default? In production on Railway, structured logs are essential for debugging. Are logs going to stdout (correct for Railway) or to a file (wrong)?

**Backend cold start:**
Railway free tier spins down after 15 minutes of inactivity. What happens when the first user hits the app after it's been idle? Is there a keep-alive mechanism? If not, the first request every time the backend wakes up takes 10-30 seconds — this will look like the app is broken.

**Vercel function timeouts:**
Vercel has a 10-second timeout on API routes (free tier). But REFLECT's backend is on Railway, not Vercel — so this doesn't apply. Confirm the frontend isn't using Vercel API routes for anything that needs longer timeouts.

**Database connection pooling:**
Is the Supabase client initialized once at startup and reused, or is it initialized per-request? Creating a new database connection per request is slow and will exhaust connection limits under real traffic.

**Error monitoring:**
Is there any error tracking set up? Sentry, LogRocket, Bugsnag — anything? Without it, you find out about production errors from user complaints instead of alerts. This is optional for launch but flag if missing.

---

### K. LEGAL & COMPLIANCE

**Privacy policy completeness:**
Read `privacy.html` completely. Does it cover:
- What personal data is collected (email, reflection content, mood data, usage patterns)
- That reflection content is sent to OpenAI for processing (this is legally required disclosure)
- Who hosts the data (Supabase, Railway, Vercel) and where their servers are
- User rights: access, deletion, portability, correction
- How long data is retained
- Children's policy — does the app accept users under 13? If not, is this stated?
- GDPR compliance (if serving EU users) — lawful basis for processing, right to erasure
- How to contact for data requests
- Last updated date
- Any remaining placeholder text (`[YOUR_...]`, `support@example.com`)

**Terms of service completeness:**
Read `terms.html` completely. Does it cover:
- "Not medical advice" and "Not therapy" — explicit, visible, not buried
- Limitation of liability
- User content ownership (who owns the reflection content?)
- Acceptable use policy
- Account termination conditions
- Governing law and jurisdiction
- Any remaining placeholder text

**Mental health disclaimer in the UI:**
Is there a visible in-app disclaimer that REFLECT is not therapy and not a crisis resource? Apple specifically reviews mental health adjacent apps for this. It needs to be visible in the app UI, not just buried in the terms. Where exactly does it appear?

**OpenAI data processing disclosure:**
Users must be told their content is processed by OpenAI. Is this in the privacy policy? Is it visible during onboarding or first use? "Your reflections are processed by AI to generate responses" or similar.

**Crisis resources:**
For an app dealing with emotional content — is there any reference to crisis resources (e.g. "If you're in crisis, please reach out to a mental health professional")? Apple looks for this in mental health-adjacent apps. Where does it appear currently?

---

### L. OBSERVABILITY — The stuff you need after launch

**Frontend error tracking:**
Is there any mechanism to know when a user hits a JavaScript error? Without this, you're flying blind. Users don't report bugs — they just delete the app.

**API error logging:**
When a route returns a 500, does it log enough context to debug the issue? (Which route, what was the request payload, what was the exception?) Or just `logger.error("Something went wrong")`?

**LLM response logging:**
Is there any logging of LLM call duration, model used, and token count? Without this, you can't diagnose why the app feels slow or why costs are higher than expected.

**User analytics:**
Is there any way to know which features users are actually using? (Not personal journaling content — aggregate usage patterns.) Without this, you make product decisions based on guesses.

**Database query performance:**
Are there any Supabase queries without indexes on the filtered columns? A query like `.eq("user_id", user_id).order("created_at", desc=True)` on a table with 100,000 rows is fast with an index and catastrophically slow without one. Check if there are indexes on `user_id` and `created_at` on the main tables.

---

## PHASE 3 — CLEANUP

Now make changes. Work methodically. Don't rush.

**3.1 — console.log / print cleanup:**
Frontend: Remove `console.log`, `console.warn`, `console.debug` everywhere in `frontend/src/`. Keep `console.error` only inside catch blocks.
Backend: Remove every `print()`. Keep all `logger.*` calls.

**3.2 — Unused imports:**
Frontend: Every file in `frontend/src/` — remove unused imports.
Backend: Every `.py` file — remove unused Python imports.
If you're not 100% sure something is unused, flag it.

**3.3 — Dead code:**
Declared-but-never-used variables.
Defined-but-never-called functions — flag backend ones, remove frontend ones if clearly unused.
Commented-out blocks of 5+ lines — remove them.
Completed TODOs — remove the comment.

**3.4 — Stale files:**
`backend/test_llm.py` — remove (temp test file).
Any `*_old.*`, `*_backup.*`, `*_v2.*`, `*_copy.*`.
Any empty files.
Any `*.log` files committed to the repo.

**3.5 — Duplicate logic:**
If `get_user_context` exists in more than one file — consolidate.
If `_build_personalization_block` exists in more than one file — keep one, remove the rest.
If any route is defined twice in `server.py` — remove the duplicate.

**3.6 — Complete .gitignore:**
Ensure these are covered across root, frontend, and backend `.gitignore` files:
```
.env
.env.*
.env.local
.env.production
node_modules/
frontend/build/
__pycache__/
*.pyc
*.pyo
.DS_Store
Thumbs.db
*.log
logs/
venv/
.venv/
ios/
android/
.idea/
.vscode/
*.swp
*.swo
coverage/
htmlcov/
.coverage
dist/
.next/
```

**3.7 — Fix obvious issues from audit:**
Fix these if found during audit — they're high confidence and unambiguous:
- Any route using `body.user_id` instead of JWT `Depends(require_user_id)` — fix immediately
- `request: Request` missing as first parameter on rate-limited routes — add it
- `max_length` missing on Pydantic string fields — add `Field(..., max_length=5000)` to `thought` fields
- `allow_origins=["*"]` in CORS — replace with env variable
- `server.url` pointing to localhost in `capacitor.config.json` — remove it

For anything else you're not confident about — flag it, explain the issue, and leave it for my decision.

---

## PHASE 4 — RATING & ROADMAP

After cleanup, give me the complete honest picture.

Score each dimension 1-10. Write one honest sentence per dimension explaining the score. Then the full prioritized roadmap.

**12 dimensions:**

1. **API Security** — Route protection, rate limiting, CORS, input validation, no spoofing
2. **Data Security** — No secrets in code, RLS in place, complete deletion, no data leaks, no sensitive logging
3. **Authentication** — JWT validation correctness, token expiry handling, auth initialization race, sign-out completeness
4. **Performance & Reliability** — LLM timeouts, error recovery, no blocking async calls, no race conditions, cold starts
5. **React Code Quality** — Memory leaks, stale closures, key props, error boundaries, state mutation
6. **User Experience** — Loading states, empty states, offline handling, iOS keyboard, accessibility basics
7. **Personalization** — Context flowing correctly, theme_history writing, graceful fallbacks, no KeyErrors
8. **App Store Compliance** — Privacy/terms complete, account deletion in-app, Info.plist, icons, no placeholders
9. **Payment Readiness** — RevenueCat current state, paywall existence, webhook, subscription gating
10. **Deployment Health** — Startup validation, health check, logging, Railway cold start, Vercel routing, DB connection pooling
11. **Legal & Compliance** — Privacy policy complete, OpenAI disclosure, mental health disclaimer, crisis resources
12. **Observability** — Error tracking, LLM logging, query performance, analytics

Security dimensions (1, 2, 3) weighted 2x in the overall score.

---

## OUTPUT FORMAT

Write the report exactly like this:

---

# REFLECT — Senior Dev Production Review

**Reviewed:** [today's date]
**Codebase summary:** [2-3 sentences, honest, no padding]

---

## Score: [X.X]/10

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | API Security | /10 | |
| 2 | Data Security | /10 | |
| 3 | Authentication | /10 | |
| 4 | Performance & Reliability | /10 | |
| 5 | React Code Quality | /10 | |
| 6 | User Experience | /10 | |
| 7 | Personalization | /10 | |
| 8 | App Store Compliance | /10 | |
| 9 | Payment Readiness | /10 | |
| 10 | Deployment Health | /10 | |
| 11 | Legal & Compliance | /10 | |
| 12 | Observability | /10 | |
| | **WEIGHTED TOTAL** | **/10** | Security dims weighted 2x |

---

## 🚨 STOP — These Are Dangerous Right Now
[Data leaks, auth bypasses, crashes under real use]
Each item: What → Where (exact file + line) → Fix

---

## 🔴 Fix Before Any Launch
[User-facing failures, compliance violations, App Store rejection risks]
Each item: What → Where → Fix

---

## 🟡 Fix Before App Store Submission
[Quality, polish, compliance gaps]
Each item: What → Where → Fix

---

## 🟢 What's Genuinely Solid
[Be specific. 3 real things beats 10 vague ones]

---

## 🐛 Actual Bugs Found
[Things that are broken or will break under real conditions]
Each: What breaks → Trigger condition → Fix

---

## ⚡ Performance Issues
[Bottlenecks with estimated user impact]

---

## 💰 Payment Gateway — Current State
Exactly what's done: [list]
Exactly what's missing: [ordered list to working paywall]
Estimated build time: [honest]

---

## 🍎 App Store — Missing Items
[Every gap, ordered by importance]
Realistic time to submission: [honest]

---

## 👁️ Observability Gaps
[What you're flying blind on right now]

---

## 📋 Cleanup Summary

**Modified:**
| File | What changed |
|------|-------------|

**Deleted:**
| File | Why |
|------|-----|

**Flagged (Need Your Call):**
| What | Where | Question |
|------|-------|---------|

**🚨 Secrets Found:**
[NONE — Clear] OR [describe exactly what and where — this goes first if anything found]

**TODOs/FIXMEs in Codebase:**
| Comment | File:Line | Still relevant? |
|---------|-----------|----------------|

---

## 🗺️ Next Steps — Exact Priority Order

**Do right now (today):**
1.
2.
3.

**Do this week:**
4.
5.
6.

**Before App Store submission:**
7.
8.

**After launch:**
9.
10.

---

## The One Thing
One sentence. If I could only fix one thing before shipping, what is it and why does it matter most?

---

## GROUND RULES — Read These Before You Start

Cursor, I need you to approach this like a senior engineer who's going to be on call when this goes live — not like an assistant validating the developer's work.

That means:

**Actually read the files.** Don't assume something exists because I said we worked on it. I may think a feature is implemented when it's half-done. Verify everything.

**Show your work.** Every issue you flag needs the exact file, the exact line, and the exact code. "I noticed a potential issue with CORS" is useless. "`allow_origins=['*']` on line 47 of server.py means any website can call your API — change it to `[os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000')]`" is useful.

**Distinguish severity correctly.** A missing `console.log` cleanup is not the same severity as a route that lets any user read any other user's data. Don't group them together.

**The bugs section is the most important part.** Real bugs that break real user flows are more valuable to find than theoretical security issues. Look for things that actually happen during normal use.

**Flag secrets and stop.** If you find a real API key or secret in source code, put it at the absolute top of your entire response in a red box before anything else. Don't bury it.

**Be honest about what you can't determine.** "I can't tell from the code whether this is an issue without running it" is a valid answer. Confidently wrong is worse than uncertain.

**One phase at a time.** Phase 1 summary → Phase 2 audit → Phase 3 cleanup → Phase 4 rating. Do not combine them or jump ahead.

**Don't pad the good list.** Three things that are genuinely well-built is better than ten things that are "fine." I need to know what to be proud of, not what to feel okay about.
