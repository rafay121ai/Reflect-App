# Cleanup Summary (Phase 1)

## Files Modified

| File | What was removed / changed |
|------|----------------------------|
| `backend/scripts/refresh_personalization_all.py` | Replaced all `print()` with `logging` (logger.info / logger.error / logger.exception). Added `import logging` and `logging.basicConfig`. |
| `.gitignore` (root) | Added `venv/`, `.venv/` at repo root; added commented section for `ios/`, `android/` (user can uncomment if not committing Capacitor native projects). |
| `backend/supabase_client.py` | Added `get_reminder_by_id(reminder_id)` to fetch a reminder by id (for ownership check). |
| `backend/server.py` | **DELETE /api/reminders/{reminder_id}** now requires `require_user_id` and verifies the reminder’s reflection belongs to the current user before deleting. |

## Files Deleted

| File | Reason |
|------|--------|
| `backend/test_llm.py` | Temporary LLM test script; not referenced by the app. Per prompt: remove before App Store submission. |

## Flagged For Review (Not Auto-Deleted)

| Item | Location | Why flagged |
|------|----------|-------------|
| Unused imports | Frontend/backend | Full file-by-file unused-import sweep was not run with an automated linter. Manual spot-check of `App.js`, `server.py`, `auth.py` did not find clearly unused imports. Recommend running `eslint --rule 'no-unused-vars: error'` on frontend and `pyflakes` or `ruff` on backend to catch any remaining. |
| Backend functions | Various | No backend functions were auto-deleted. All current functions are either used by routes or by other modules. |
| `GET /api/reflections/{reflection_id}` | server.py | **FIXED.** Requires `require_user_id`; returns 404 if reflection is not owned by current user. |
| `GET /api/reminders/due` | server.py | **FIXED.** Requires `require_user_id`; returns only reminders for reflections owned by current user. |
| `DELETE /api/reminders/{reminder_id}` | server.py ~359 | **FIXED.** Now uses `require_user_id` and verifies the reminder’s reflection belongs to the current user before deleting. |

## Duplicate Logic Check

- **get_user_context:** Not present. Only `get_personalization_context` (in `supabase_client.py`) is used; `server.py` imports and uses it. No duplicate.
- **_build_personalization_block:** Defined in all three LLM clients (`openai_client.py`, `openrouter_client.py`, `ollama_client.py`) by design — each provider is self-contained. No consolidation needed.
- **API routes:** No duplicate route definitions found in `server.py`.

## Commented-Out Code / TODOs

- No large (5+ line) commented-out blocks were removed; none were found in the key files scanned.
- TODO comments were not removed; none were found that clearly reference already-completed work.

## Approximate Lines Removed

- **test_llm.py:** ~476 lines (file deleted).
- **refresh_personalization_all.py:** ~4 print statements replaced with logging (~2 lines net change).
- **Total:** ~478 lines removed (mostly from deleting test_llm.py).

---

# REFLECT — Production Rating (Phase 2)

## Scores (updated after endpoint lock, placeholder fix, crash UX)

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| API Security | 8.5/10 | All routes that touch data or LLM are protected with `require_user_id` and (where applicable) rate-limited. GET reflection, GET reminders/due, and DELETE reminder now require auth and ownership. CORS env-based; input `max_length` on string fields. |
| Data Security | 9/10 | No hardcoded secrets; `.env` in .gitignore; Supabase service key backend-only. RLS script exists. Delete-account removes all user data. No unauthenticated data exposure — reflection and reminder endpoints scoped to current user. |
| Auth & Authorization | 9/10 | All data/LLM routes use `require_user_id`; `user_id` from JWT only. Frontend sends auth headers; expired token handled. Sign-out and account deletion work. |
| Payment Gateway | 0/10 | No Lemon Squeezy, Stripe, or RevenueCat. No paywall, no subscription enforcement, no pricing page, no webhooks. PRD mentions “subscription not enforced.” |
| App Store Compliance | 7.5/10 | Privacy and Terms with “Not Medical Advice”; account deletion in-app; NSUserNotificationsUsageDescription and real appId. Placeholder contact replaced with support@reflectapp.com. Still need: 1024×1024 icon, screenshots; og-image.png optional for web. |
| Code Quality | 8/10 | Clear separation: routes in server.py, DB in supabase_client, LLM in client files. Error handling consistent. test_llm.py removed. Env documented in .env.example. |
| UX & Production Readiness | 8.5/10 | Full flow works; loading states for reflect, mirror, closing. Reflect, mirror, and closing failures all show “We couldn’t load your reflection. Try again.” — no silent failures. Personalization and closing screen in place. |

## Weighted Total

- API Security (×2): 8.5 → 17  
- Data Security (×2): 9 → 18  
- Auth & Authorization (×2): 9 → 18  
- Payment Gateway: 0  
- App Store Compliance: 7.5  
- Code Quality: 8  
- UX & Production Readiness: 8.5  

**Sum:** 17 + 18 + 18 + 0 + 7.5 + 8 + 8.5 = **77**.  
**Max (with weights):** 20 + 20 + 20 + 10 + 10 + 10 + 10 = **100**.  
**Weighted total out of 10:** **7.7/10**.

---

## Must Fix Before Launch

1. **Add `frontend/public/og-image.png`** (1200×630) if missing, for link previews.

---

## Fix This Week

1. **App icon:** Ensure 1024×1024 PNG (no alpha, no rounded corners) is in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.
2. **Screenshots:** Prepare iPhone 6.9" (e.g. 16 Pro Max) screenshots for App Store Connect (min 3, max 10).

---

## Already Good

- All data and LLM routes protected (including GET reflection, GET reminders/due, DELETE reminder) with ownership checks.
- No hardcoded secrets; Supabase service key backend-only; delete account removes data.
- JWT-based auth; user_id from token; sign-out and account deletion work.
- Privacy and Terms with “Not Medical Advice”; placeholder contact replaced; account deletion in-app; NSUserNotificationsUsageDescription set; real appId.
- Clear structure; test script removed; logging used in cron script.
- Full reflection flow, loading states, personalization, closing screen; reflect/mirror/closing failures show unified error message (no silent failure).

---

## Payment Gateway — What Needs To Be Built

No payment code exists. For **Lemon Squeezy** (or similar):

1. **Product:** Create product + variant(s) in Lemon Squeezy dashboard (e.g. monthly/yearly).
2. **Checkout:** Add checkout link or embedded checkout in app (e.g. Settings or after onboarding). Use Lemon Squeezy Checkout API or hosted URL.
3. **Webhook:** Implement `POST /api/webhooks/lemon` (or similar) to receive `order_created` / `subscription_created`; verify signature; store subscription status (e.g. in `profiles.subscription_status` or a `subscriptions` table).
4. **Storage:** Add column(s) to `profiles` (e.g. `subscription_status`, `subscription_expires_at`) or a dedicated table; update from webhook.
5. **Frontend:** After login/sync, read subscription status from backend; gate premium features (e.g. insights, export, or reflection modes) behind a check and show paywall/upgrade when not subscribed.

---

## App Store — Missing Items

- App icon: 1024×1024 in Assets.
- Screenshots: iPhone 6.9" (e.g. 16 Pro Max), 3–10 images.
- Optional: Favicon and og-image.png for web.
- (Done: placeholder contact replaced; reflection/reminder endpoints locked.)

---

## The Single Most Important Thing To Do Next

**Add og-image.png and finalize app icon/screenshots for App Store.** (Endpoints locked; placeholder contact replaced with support@reflectapp.com.)

---

# App Store Submission Checklist (Phase 3)

## BLOCKERS — App Store will reject without these

**Legal**

- [ ] Privacy policy at a live URL with **no placeholders** (contact set to support@reflectapp.com — replace with your real email)
- [ ] Terms of service at a live URL with **no placeholders**
- [ ] Privacy policy linked from inside the app (footer/settings — already done)
- [ ] “Not Medical Advice” disclaimer visible in app (in Terms — already done)

**Account**

- [ ] Account deletion works in-app (Settings → Danger Zone — already done)
- [ ] Account deletion actually removes all data (backend `delete_user_data` — already done)

**Technical**

- [ ] App does not crash on launch on a clean install
- [ ] App does not crash when going through full flow
- [ ] `NSUserNotificationsUsageDescription` in Info.plist (already present)
- [ ] All other required Info.plist privacy strings for device features used
- [ ] App ID (`appId` in capacitor.config) is unique and real (`com.reflect.app` — done)
- [ ] Bundle ID registered in Apple Developer portal

**App Store Connect**

- [ ] Apple Developer account active ($99/yr)
- [ ] App record created in App Store Connect
- [ ] App category selected (e.g. Health & Fitness or Lifestyle)
- [ ] Age rating completed (likely 4+ or 12+)
- [ ] Support URL set (real URL or email)
- [ ] Marketing URL set (optional)

---

## REQUIRED FOR APPROVAL

**Screenshots**

- [ ] iPhone 6.9" (e.g. iPhone 16 Pro Max) — minimum 3, maximum 10
- [ ] Screenshots show app benefits, not just UI
- [ ] No placeholder text in screenshots

**App Icon**

- [ ] 1024×1024 PNG, no alpha, no rounded corners (Apple adds them)
- [ ] Icon in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

**Build**

- [ ] Production build: `npm run build` then `npx cap sync ios`
- [ ] Xcode build succeeds
- [ ] Tested on real iPhone (not only simulator)
- [ ] Tested on iOS 16+ minimum

**App Description**

- [ ] App name finalized (max 30 characters)
- [ ] Subtitle (max 30 characters, include keywords)
- [ ] Description (hook in first 2 lines, max 4000 chars)
- [ ] Keywords (max 100 characters total)
- [ ] What’s New for first version

---

## STRONGLY RECOMMENDED

**Before submitting**

- [ ] Test on at least 2 different iPhone models
- [ ] Test with a brand new account (not dev account)
- [ ] Test account deletion end-to-end on a test account
- [ ] Test with airplane mode for offline behavior
- [ ] Verify all LLM calls work in production (Railway + Vercel)
- [ ] Verify Supabase RLS (run `supabase_rls_setup.sql`)
- [ ] Set all production env vars in Railway and Vercel

**Payment (if charging at launch)**

- [ ] Lemon Squeezy product created
- [ ] Checkout flow working
- [ ] Webhook endpoint live and tested
- [ ] Subscription status stored and checked in app
- [ ] Free trial logic if applicable

---

## Final App Store Submission Steps (in order)

1. Run `npm run build` in `frontend/`
2. Run `npx cap sync ios` in `frontend/`
3. Open Xcode: `npx cap open ios`
4. In Xcode: set signing team and bundle ID
5. Product → Archive
6. Distribute App → App Store Connect → Upload
7. In App Store Connect: select build, fill metadata
8. Submit for Review
