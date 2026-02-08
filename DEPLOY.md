# Deploying REFLECT

## 1. Deploy the frontend on Vercel

Your repo is already connected. Vercel will use `vercel.json` (root → `frontend/`, build → `yarn build`, output → `build`).

### In Vercel Dashboard → your project → Settings → Environment Variables

Add these (for **Production**, and optionally Preview):

| Name | Value | Notes |
|------|--------|--------|
| `REACT_APP_BACKEND_URL` | `https://your-backend-url.com` | **Required.** URL of your deployed backend (no trailing slash). |
| `REACT_APP_SUPABASE_URL` | `https://xxx.supabase.co` | Your Supabase project URL. |
| `REACT_APP_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon (public) key, not the service role key. |

Save, then trigger a new deploy (Deployments → … → Redeploy).

---

## 2. Deploy the backend (required for the app to work)

The backend is a **Python FastAPI** app in `backend/`. It does not run on Vercel. Deploy it to one of:

- **Railway** – [railway.app](https://railway.app): connect repo, set root to `backend/`, add env vars, deploy.
- **Render** – [render.com](https://render.com): new Web Service, connect repo, root `backend/`, build `pip install -r requirements.txt`, start `uvicorn server:app --host 0.0.0.0 --port $PORT`.
- **Fly.io** – [fly.io](https://fly.io): use a Dockerfile or `fly launch` in `backend/`.

### Backend env vars (on Railway/Render/Fly)

Set the same variables you have in `backend/.env`:

- `LLM_PROVIDER`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`
- (Optional) `OLLAMA_*` if you use Ollama

Use the **production** Supabase URL and keys.

### After the backend is live

1. Copy the backend URL (e.g. `https://your-app.railway.app`).
2. In **Vercel** → Environment Variables, set `REACT_APP_BACKEND_URL` to that URL (no trailing slash).
3. Redeploy the frontend so the new env is baked in.

---

## 3. CORS

On your **backend** host (Railway/Render/Fly), set:

- `ALLOWED_ORIGINS` = your Vercel URL, e.g. `https://your-project.vercel.app`  
  (to allow both local and production: `http://localhost:3000,https://your-project.vercel.app`)

---

## Summary

1. **Vercel**: Import repo → env vars (`REACT_APP_BACKEND_URL`, Supabase) → deploy (uses `vercel.json`).
2. **Backend**: Deploy `backend/` on Railway, Render, or Fly.io with the same env as in `backend/.env`.
3. Set `REACT_APP_BACKEND_URL` in Vercel to the backend URL and redeploy.
