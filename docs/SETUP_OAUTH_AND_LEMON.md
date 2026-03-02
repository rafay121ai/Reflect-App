# Supabase Google OAuth & Lemon Squeezy Setup

## Supabase: Google OAuth only

1. **Supabase Dashboard** → Your project → **Authentication** → **Providers**.
2. **Google:** Enable, add your OAuth Client ID and Client Secret (from Google Cloud Console). Add authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Email:** Disable the Email provider if you want sign-in to be Google-only.
4. **URL Configuration:** Under Authentication → URL Configuration, set Site URL to your web app origin (e.g. `https://your-app.vercel.app`) and add Redirect URLs:  
   - Web: `https://your-app.vercel.app/auth/callback`  
   - iOS (Capacitor): `com.reflect.app://auth/callback`  
   (Use the same scheme as `server.iosScheme` in `capacitor.config.json` and `CFBundleURLSchemes` in Info.plist.)

## Lemon Squeezy (web subscriptions)

1. **Dashboard** → Products → create product with Monthly and Yearly variants. Note the **Variant IDs**.
2. **Settings** → Webhooks: add a webhook URL pointing to your backend: `https://your-api.railway.app/api/webhooks/lemon-squeezy`. Copy the **Signing Secret** → set as `LEMON_SQUEEZY_WEBHOOK_SECRET` on the backend.
3. **Backend env:** Set `LEMON_SQUEEZY_WEBHOOK_SECRET`, and optionally `LS_VARIANT_MONTHLY`, `LS_VARIANT_YEARLY` (variant IDs for plan mapping).
4. **Frontend env:** Set `REACT_APP_LS_STORE_URL` (e.g. `https://yourstore.lemonsqueezy.com`), `REACT_APP_LS_VARIANT_MONTHLY`, `REACT_APP_LS_VARIANT_YEARLY` so the web app can open checkout with `checkout[custom][user_id]` and `checkout[email]`.

After a successful payment, Lemon Squeezy sends a webhook; the backend verifies the signature, parses the event, and calls `update_user_plan(user_id, plan_type)` (or sets `trial` on cancel/expire). The frontend reloads after checkout success so the next API call uses the updated plan.
