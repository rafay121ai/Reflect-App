# REFLECT — Pre-Launch Beta Readiness Audit

**Auditor:** Senior product reviewer (brutally honest, pre-launch)  
**Scope:** Everything a beta user touches or sees before and after signup; trust, conversion, and support burden.  
**Context:** Traffic from Reddit + personal Instagram; landing = waitlist; cancellation flow untested; custom domain not confirmed; logo not final; free tier 5 reflections; production + prompt audits completed.

**Note:** The **landing page / waitlist** is not in this repository. Sections 1.1–1.8 are evaluated based on your stated context and on what would be required for the traffic you described. Where the landing lives (e.g. reflect-web-one.vercel.app or a separate site) could not be inspected in code.

---

## SECTION 1 — LANDING PAGE READINESS

### 1.1 VALUE PROPOSITION CLARITY — **CANNOT PASS (out of repo)**

- **Criteria:** Headline communicates what REFLECT does and why it's different in under 5 seconds. Value prop: *"REFLECT reads how you write, not just what you write — and shows you the pattern underneath."*
- **Action:** Confirm this sentence (or a jargon-free equivalent) is above the fold. If the page uses different wording, ensure it’s not jargon-heavy and creates enough curiosity to scroll or sign up.

### 1.2 SOCIAL PROOF — **WARN / FAIL (depends on page)**

- **Criteria:** Reddit/Instagram users need a reason to trust before giving email. Social proof or credible substitute (demo, sample mirror, screenshot).
- **Action:** If the landing has zero proof and only a waitlist CTA, treat as **FAIL** for cold Reddit traffic. Add at least: one screenshot of the mirror report or a one-line “See what REFLECT sees” with a sanitised example.

### 1.3 WHAT HAPPENS AFTER SIGNUP — **WARN**

- **Criteria:** User knows when they get access; waitlist vs immediate; what “beta” means.
- **Action:** State explicitly: “You’re on the waitlist” or “You get access immediately.” Define beta (e.g. “Free during beta,” “Limited features,” “We’re still improving”). Ambiguity kills signups.

### 1.4 WAITLIST CTA FRICTION — **CANNOT ASSESS (out of repo)**

- **Criteria:** Number of fields; email-only vs more; confirmation message and confirmation email.
- **Action:** Minimise to email-only if possible. After submit: show a clear “What happens next” (e.g. “We’ll email you when you’re in” or “Check your inbox for the link”). Send an immediate confirmation email with the same message and a reply-to that works.

### 1.5 MOBILE EXPERIENCE — **CANNOT ASSESS (out of repo)**

- **Criteria:** Renders on mobile; CTA above fold on ~390px; readable without zoom; no layout breaks.
- **Action:** Test on iPhone 14 (or equivalent). Ensure CTA is above the fold and tap targets are large enough.

### 1.6 PAGE LOAD SPEED — **CANNOT ASSESS (out of repo)**

- **Criteria:** Load under ~2s on mobile; no huge uncompressed images; CDN (e.g. Vercel).
- **Action:** Run Lighthouse on the landing URL. Compress images; if on Vercel, confirm project is set up for the landing domain.

### 1.7 DOMAIN AND URL — **FAIL**

- **Criteria:** Custom domain vs vercel.app/platform subdomain; URL shared in post.
- **Finding:** You stated custom domain is not confirmed live and that the current URL is **reflect-app-two.vercel.app**. That URL signals prototype; “two” invites “what happened to one?” Technical Reddit users will downgrade trust. For personal Instagram, linking to a vercel.app URL attaches your reputation to an unfinished-looking product.
- **Action:** **Blocker.** Ship landing (and app link) on a custom domain (e.g. **ireflect.app** or **reflectapp.com**) before posting. Do not drive Reddit/Instagram to reflect-app-two.vercel.app.

### 1.8 TRUST SIGNALS — **WARN**

- **Criteria:** Privacy policy linked near signup; GDPR-style disclosure; “no spam” / “unsubscribe”; human face/name.
- **Finding:** In-app: Privacy and Terms link to `https://app.ireflect.app/privacy` and `https://app.ireflect.app/terms`. Static `privacy.html` / `terms.html` in repo include **support@reflectapp.com**. In-app React pages (PrivacyPolicy.jsx, TermsOfService.jsx) say “contact us through the app or the support channel provided” but do **not** show the support email — so users in the app may not see how to reach you.
- **Action:** On the **landing** signup area: link to privacy policy; one line on how you use their email and “no spam, unsubscribe anytime.” If the landing is your face (personal Instagram), ensure a real name or clear “who’s behind this” is visible. In-app: add support@reflectapp.com (or your chosen address) to the Privacy/Terms in-app copy so the support channel is explicit.

---

## SECTION 2 — POST-SIGNUP FLOW

### 2.1 CONFIRMATION EMAIL — **CANNOT ASSESS (out of repo)**

- **Criteria:** Sent immediately; confirms what they signed up for and when they’ll hear back; reply-to that works.
- **Action:** Implement if not already: immediate confirmation email with “You’re on the list” and “We’ll email you when you have access.” Use a reply-to you actually monitor.

### 2.2 WAITLIST TO ACCESS FLOW — **WARN**

- **Criteria:** When you let someone off the waitlist, they get an email with a direct link; link works on mobile; onboarding is clear for a cold user.
- **Finding:** App entry: `config.js` uses **app.ireflect.app** when hostname is `app.ireflect.app` or `vercel.app`. So the “access” link could be `https://app.ireflect.app` (or your chosen domain). No waitlist-release automation was found in this repo — assumed manual or in another system.
- **Action:** Document or automate: “When I add someone, they get an email with [exact URL].” Test that URL on mobile. Ensure onboarding (next section) is strong enough for someone who has never seen the app.

### 2.3 FIRST REFLECTION EXPERIENCE (COLD USER) — **WARN**

- **Criteria:** Value prop clear before first thought; 3 onboarding slides compelling; first mirror/archetype strong enough that a skeptic says “how did it know that?”
- **Finding:**  
  - **Onboarding** (`Onboarding.jsx`): Slide 1 — “Write one thought.” / “We’ll show you what’s underneath.” (clear). Slide 2 — “Not what you wrote. How you wrote it.” (intriguing). Slide 3 — “The more you reflect, the clearer it gets.” (weak for a cold skeptic; vague payoff).  
  - **Guest path:** Guest can do **2 reflections** without signing in (`guestSession.js`, `save_guest_reflection_route` max 2 per `guest_id`). So they can try before OAuth.  
  - **Risk:** If the first reflection lands poorly (wrong archetype, generic mirror), the user is gone and won’t pay. Prompt and archetype fixes are in place; quality still depends on model and user input.
- **Action:** Consider tightening Slide 3 to a concrete outcome (e.g. “We’ll show you the pattern under this thought — most people are surprised by what it finds”). Treat first reflection quality as the make-or-break moment; monitor feedback and be ready to iterate on first-run prompts if needed.

### 2.4 GUEST VS AUTH DECISION — **PASS**

- **Criteria:** Can user try before Google OAuth? Does guest give enough value before auth? Is OAuth-first too much friction?
- **Finding:** Guest flow exists: 2 guest reflections, then soft → firm → hard_block signup prompts (`GuestSignupModal`, `guestSignupStage`). Guest gets full reflection + mirror report + closing via `/api/reflect/guest`, `/api/mirror/report/guest`, etc. After sign-in, guest reflections can migrate to the account (`migrate_guest_reflections`).
- **Verdict:** **PASS.** Users can try before OAuth; guest experience is substantive. Reddit privacy concerns are partly addressed by “try first, then sign in.”

---

## SECTION 3 — PAYMENT AND TRUST INTEGRITY

### 3.1 CANCELLATION FLOW — **FAIL (UNTESTED)**

- **Criteria:** End-to-end test: user cancels (Lemon Squeezy dashboard or email link) → webhook `subscription_cancelled` → `update_user_plan(user_id, "trial")` → Supabase `user_usage` + profiles show trial → user loses paid access after next session → user is not charged again.
- **Finding:** You stated cancellation has **not** been tested end-to-end. Code path exists: `server.py` handles `subscription_cancelled` with `status in ("cancelled", "expired")` and calls `update_user_plan(user_id, "trial")`. If any step fails (webhook not firing, DB not updated, or LS still charging), you get support burden and trust damage on your personal reputation.
- **Action:** **Blocker.** Before any paying beta user: (a) Cancel a test subscription in Lemon Squeezy (or via customer link). (b) Confirm webhook fires and backend logs show “downgraded user … to trial.” (c) Confirm `user_usage` and profiles show `plan_type` trial. (d) Confirm user cannot access paid features after refresh. (e) Confirm no further charge. Document the steps and outcome.

### 3.2 REFUND POLICY — **FAIL**

- **Criteria:** Refund policy stated somewhere; beta users may ask for refunds; Lemon Squeezy default refund window known and surfaced.
- **Finding:** No refund policy found in repo (no pricing page, no checkout copy, no terms). Privacy/terms live in `privacy.html` / `terms.html` and in-app routes; no “refunds” wording.
- **Action:** **Blocker (or condition).** Add a short refund policy (e.g. “Refunds within 14 days of purchase, no questions asked” or whatever matches Lemon Squeezy and your policy). Surface it on the pricing/upgrade flow or at least in Terms and near checkout. Know LS default refund window and state it if you rely on it.

### 3.3 PRICING PAGE / UPGRADE FLOW — **WARN**

- **Criteria:** Pricing clear before paywall; paywall explains what they get; beta discount or early-adopter framing.
- **Finding:** Paywall modal (`PaywallLimitModal.jsx`): “Reflection limit reached”; “Unlimited reflections + your full pattern over time”; “You’ve used your free reflections… Upgrade to Premium for more daily reflections and to unlock the full experience.” Monthly/Yearly buttons or single “Upgrade to Premium.” Settings: “Manage subscription” links to `https://app.lemonsqueezy.com/my-orders` for web. No explicit price on the modal (prices come from Lemon Squeezy checkout). No “beta discount” or “early adopter” copy in code.
- **Action:** If possible, show price (e.g. “$X/month”) before they hit checkout. Add one line of beta framing (e.g. “Early supporter pricing” or “Beta: 50% off first month”) if you want to soften paying for a product with known rough edges.

---

## SECTION 4 — CHANNEL-SPECIFIC READINESS

### 4.1 REDDIT READINESS — **WARN**

- **Criteria:** Target subreddits; rules on self-promotion; account age/activity; post format; URL not spammy.
- **Finding:** Repo doesn’t define which subreddits. reflect-app-two.vercel.app is spammy/unfinished-looking; custom domain is mandatory (see 1.7).
- **Action:** List target subs (e.g. r/Journaling, r/selfimprovement, r/SideProject). Read each sub’s rules; some allow “I built this” with constraints. Use an aged, active account; prefer value-first or “here’s what I learned” over pure promo. Share only a clean custom-domain URL.

### 4.2 PERSONAL INSTAGRAM READINESS — **WARN**

- **Criteria:** Audience knows you; app is visual enough to demo; demo/screen recording ready; link-in-bio vs story; landing optimised for entry.
- **Finding:** App is visual (mirror slides, archetype, closing). No in-repo assets for “demo reel” or “screenshot for story.”
- **Action:** Prepare a short screen recording (e.g. one thought → mirror report) for story/reel. Decide link-in-bio vs story link; ensure landing works for that entry (e.g. single CTA, fast load). Custom domain is non-negotiable for personal credibility.

---

## SECTION 5 — OPERATIONAL READINESS

### 5.1 SUPPORT CHANNEL — **WARN**

- **Criteria:** How does a beta user reach you? Support email, in-app feedback, or community.
- **Finding:** **support@reflectapp.com** appears in `privacy.html` and `terms.html`. In-app: Settings shows “contact support” only in a generic error message. **BetaFeedbackPanel** exists (in-app notepad, saved to DB) — good for structured feedback but not for “I’m stuck” or “I was charged twice.”
- **Action:** Make support email visible in-app (e.g. Settings → “Questions? support@reflectapp.com” or in Privacy/Terms in-app copy). Ensure support@reflectapp.com (or chosen address) is monitored and reply-to works.

### 5.2 FEEDBACK MECHANISM — **PASS**

- **Criteria:** Structured feedback from beta users.
- **Finding:** Beta feedback panel in app; submissions stored and listable. Sufficient for “beta is for learning.”

### 5.3 MONITORING — **WARN**

- **Criteria:** Railway logs monitored in first 48h; know when app is down or critical errors; alert on health-check failure.
- **Finding:** `GET /api/health` exists; frontend does a silent health ping on load to wake Railway. Docs mention cron hitting `/api/health` (e.g. cron-job.org) and alerting on `webhook_update_failed` in logs. No evidence in repo of an actual uptime monitor or log-based alert (e.g. UptimeRobot, Logtail).
- **Action:** Before launch: configure an uptime check (e.g. UptimeRobot) on `https://<backend>/api/health` and ensure you get alerts (email/Slack) on failure. If possible, add a log-based alert for `webhook_update_failed` so paying users stuck on trial are visible.

### 5.4 CAPACITY — **WARN**

- **Criteria:** Expected users; Railway/Supabase limits; behaviour if a post gets large traffic.
- **Finding:** No capacity numbers in repo. Railway free/starter and Supabase have limits; cold starts on Railway can make first request slow.
- **Action:** Document: current Railway plan, Supabase row/bandwidth limits, and what you’ll do if traffic spikes (e.g. 500 concurrent users). At least know your limits and have a “we’re at capacity” or rate-limit message in mind.

---

## SECTION 6 — BRAND AND FIRST IMPRESSION

### 6.1 LOGO AND VISUAL IDENTITY — **WARN**

- **Criteria:** Logo not final; placeholder must not look broken.
- **Finding:** `index.html` references `/Reflect-logo-png.png` for favicon and apple-touch-icon. You said logo is not final.
- **Action:** Minimum: wordmark or clean text “REFLECT” so the landing and app don’t look unfinished. Replace or remove placeholder if it looks broken.

### 6.2 APP NAME CONSISTENCY — **WARN**

- **Criteria:** “REFLECT” consistent across landing, app, tab title, confirmation email, Lemon Squeezy, receipt.
- **Finding:** In repo: `index.html` title “REFLECT – A reflection space for your thoughts”; meta “Reflect — Know yourself a little better.” (mixed casing). OG/Twitter “Reflect”. In-app title and branding not fully audited; Lemon Squeezy store name and receipt copy are outside repo.
- **Action:** Standardise: either “REFLECT” or “Reflect” everywhere (tab, meta, in-app, emails, LS store and receipt). Fix meta/title inconsistency in index.html.

### 6.3 THE URL IN THE POST — **FAIL**

- **Criteria:** Exact URL shared; custom domain for credibility.
- **Finding:** You stated current URL is **reflect-app-two.vercel.app**. “Two” raises questions; vercel.app signals prototype. For personal Instagram and Reddit, this is a credibility fail.
- **Action:** **Blocker.** Do not post with reflect-app-two.vercel.app. Use a custom domain (e.g. app.ireflect.app or reflectapp.com) for both landing and app, and share that.

---

## FINAL VERDICT

**LAUNCH VERDICT: NOT READY**

---

### BLOCKERS (must fix before posting)

| Section | What | Why it blocks launch | Exact fix |
|--------|------|----------------------|------------|
| **1.7 / 6.3** | Landing/app on reflect-app-two.vercel.app | Technical and non-technical users will distrust the product; “two” and vercel.app signal unfinished work. Personal reputation is tied to the link. | Ship on a custom domain (e.g. ireflect.app or reflectapp.com). Use that URL in all posts and in waitlist emails. |
| **3.1** | Cancellation flow untested | A single mis-charge or “I cancelled but still charged” destroys trust and creates support and chargeback risk. | Run full E2E: cancel test subscription → verify webhook, DB update, access revocation, no further charge. Document steps. |
| **3.2** | No stated refund policy | Beta users will ask for refunds; ambiguity increases chargebacks and support. | Add a short refund policy (and Lemon Squeezy window if relevant). Show it in Terms and near checkout (or pricing). |

---

### CONDITIONS (fix within 48 hours of posting if you launch anyway)

| Section | What | Quick fix |
|--------|------|-----------|
| **1.2** | No social proof on landing | Add one screenshot or sanitised “sample mirror” so cold traffic has something to judge. |
| **1.3** | What happens after signup unclear | On landing and in confirmation email: “You’re on the waitlist” or “Access now,” plus one line on what “beta” means. |
| **1.8** | Support channel not visible in-app | Add support@reflectapp.com (or your email) to in-app Privacy/Terms and optionally in Settings. |
| **3.3** | Pricing/beta framing | Show price before checkout if possible; add one line of beta/early-adopter framing. |
| **5.1** | Support channel discoverable | Same as 1.8: surface support email in-app. |
| **5.3** | No uptime/alerting | Add UptimeRobot (or similar) on `/api/health`; optional alert on `webhook_update_failed`. |
| **6.1** | Logo not final | Use at least a clean wordmark so the product doesn’t look broken. |
| **6.2** | REFLECT vs Reflect | Standardise casing in index.html meta/title and across app/emails/LS. |

---

### ACCEPTABLE RISKS (known gaps fine for beta at this scale)

- **Landing page not in this repo:** Audit cannot verify copy, layout, or confirmation email; you carry the responsibility to run 1.1–1.6 and 2.1 yourself.
- **First reflection quality variable:** Prompt work is done; some users may still get a generic or off archetype. Acceptable at beta scale if you have feedback and iterate.
- **No frontend error tracking (e.g. Sentry):** You’ll learn from user reports and logs; acceptable for small beta if you monitor health and webhook failures.
- **Railway cold starts:** First request after idle can be slow; health ping and optional cron reduce but don’t eliminate; acceptable if you set expectations or add a short “Loading…” for first load.
- **RLS on beta_feedback / user_usage:** Documented in other audits; backend uses service key; acceptable for beta with documented risk.
- **Export data “coming soon”:** Clearly labelled; acceptable for beta.

---

**Summary:** The product itself (guest flow, auth, payment wiring, prompts) is in good shape for a small beta. The **blockers** are: (1) **domain/URL** — do not drive Reddit/Instagram to reflect-app-two.vercel.app; (2) **cancellation E2E** — test before anyone pays; (3) **refund policy** — state it and surface it. Fix those three, then address conditions so the first wave of users knows what they signed up for, how to get support, and what happens when they cancel or ask for a refund. A false “READY” would cost real users, trust, and money — this verdict is intentionally strict so you can launch with confidence.
