# Switching to Supabase New API Keys (after Legacy JWT migration)

Your project has **migrated to new JWT Signing Keys**. Use **publishable** and **secret** API keys instead of the old anon/service_role JWT keys. You do **not** need to rotate the Legacy JWT secret.

---

## Step 1 – Get the new keys in Supabase

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project.
2. Go to **Project Settings** (gear) → **API** or **API Keys**.
3. You should see:
   - **Publishable key** (starts with `sb_publishable_...`) – for the **frontend**.
   - **Secret key(s)** (start with `sb_secret_...`) – for the **backend**.
4. If you don’t have a secret key yet:
   - Click **Create new secret key** / **Create new API key**.
   - Name it (e.g. “REFLECT backend”), copy the key and store it safely (it’s shown only once).
5. Copy the **publishable** key and the **secret** key.

---

## Step 2 – Backend: use the new secret key

1. Open **`backend/.env`**.
2. Set **`SUPABASE_SERVICE_KEY`** to the **new secret key** (`sb_secret_...`), not the old `service_role` JWT:
   ```env
   SUPABASE_SERVICE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. **`SUPABASE_JWT_SECRET`** is **optional** for this app. The backend verifies user tokens with **ES256 (JWKS)** from Supabase. You can:
   - Leave it as the placeholder, or
   - Remove the line, or
   - Set it only if you still have old HS256 tokens to support.
4. If the backend is deployed (Railway/Render/Fly), set **`SUPABASE_SERVICE_KEY`** there to the same new secret key and redeploy/restart.

---

## Step 3 – Frontend: use the new publishable key

1. Open **`frontend/.env`**.
2. Set **`REACT_APP_SUPABASE_ANON_KEY`** to the **new publishable key** (`sb_publishable_...`):
   ```env
   REACT_APP_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. If the app is on **Vercel**, go to the project → **Settings** → **Environment Variables**, update **`REACT_APP_SUPABASE_ANON_KEY`** with the new publishable key, then **Redeploy**.

---

## Step 4 – Disable legacy keys (optional)

After everything works with the new keys:

1. In Supabase go to **Project Settings** → **API Keys**.
2. Find the option to **disable** or **deactivate** the legacy `anon` and `service_role` JWT-based keys (so the old leaked keys stop working).

---

## Summary

| Key type   | Old (legacy)     | New              | Where to set it                          |
|-----------|-------------------|------------------|------------------------------------------|
| Backend   | `service_role` JWT | `sb_secret_...`  | `backend/.env` → `SUPABASE_SERVICE_KEY`  |
| Frontend  | `anon` JWT        | `sb_publishable_...` | `frontend/.env` → `REACT_APP_SUPABASE_ANON_KEY` |
| JWT verify| Legacy JWT Secret | Not needed       | Backend uses ES256/JWKS; leave `SUPABASE_JWT_SECRET` unset or as placeholder |

No code changes are required; only env values are updated.
