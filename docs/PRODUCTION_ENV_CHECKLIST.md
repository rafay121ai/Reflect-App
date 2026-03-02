# Production environment checklist

Use this before going live to ensure all required and recommended environment variables are set correctly. The backend uses **service role** for Supabase; the frontend uses the **anon** key and JWT auth.

---

## Backend (Railway / Render / Fly.io)

| Variable | Required | Notes | If missing |
|----------|----------|--------|------------|
| `LLM_PROVIDER` | Yes | `ollama` \| `openai` \| `openrouter` | LLM calls fail |
| `SUPABASE_URL` | Yes | Project URL, e.g. `https://xxx.supabase.co` | DB and auth fail |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key (secret), not anon | DB and auth fail |
| `SUPABASE_JWT_SECRET` | Yes | From Supabase → Settings → API (JWT secret) | Auth validation fails, 401s |
| `OPENROUTER_API_KEY` | If `LLM_PROVIDER=openrouter` | [openrouter.ai/keys](https://openrouter.ai/keys) | 502 from reflect/mirror/closing |
| `OPENROUTER_MODEL` | No | Default `openai/gpt-4.1-mini` | Uses default |
| `OPENAI_API_KEY` | If `LLM_PROVIDER=openai` | [platform.openai.com](https://platform.openai.com/api-keys) | 502 from LLM routes |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` | Uses default |
| `OLLAMA_URL` | If `LLM_PROVIDER=ollama` | Default `http://localhost:11434` | Local dev only |
| `OLLAMA_MODEL` | No | Default `qwen` | Uses default |
| `ALLOWED_ORIGINS` | **Yes in production** | Comma-separated frontend origins, e.g. `https://your-app.vercel.app` | CORS blocks frontend requests |
| `RATE_LIMIT_LLM_PER_MINUTE` | No | Default `30`; set `0` to disable | Rate limiting off |
| `PERSONALIZATION_CRON_SECRET` | No | For `POST /api/personalization/refresh-all` | Cron endpoint unprotected if public |
| `PERSONALIZATION_REFRESH_INTERVAL_HOURS` | No | Default `24`; `0` disables | Background refresh runs |

**Pre-launch backend checklist**

- [ ] `LLM_PROVIDER` set to `openrouter` (or `openai`) for production; keys set accordingly.
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET` from **production** Supabase project.
- [ ] `ALLOWED_ORIGINS` includes your production frontend URL (and preview URL if needed).
- [ ] `RATE_LIMIT_LLM_PER_MINUTE` &gt; 0 recommended (e.g. `30`).

---

## Frontend (Vercel)

| Variable | Required | Notes | If missing |
|----------|----------|--------|------------|
| `REACT_APP_SUPABASE_URL` | Yes | Same Supabase project URL as backend | Sign-in and data fail |
| `REACT_APP_SUPABASE_ANON_KEY` | Yes | Supabase **anon** (public) key, not service role | Sign-in fails |
| `REACT_APP_BACKEND_URL` | Yes in production | Backend API URL, no trailing slash | App may use hardcoded Railway URL if hostname contains `vercel.app`; set explicitly for custom domain |

**Pre-launch frontend checklist**

- [ ] `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` from **production** Supabase project.
- [ ] `REACT_APP_BACKEND_URL` set to your deployed backend URL (e.g. Railway).

---

## Supabase Dashboard

- [ ] **Authentication → URL configuration**: Site URL and Redirect URLs include your production (and preview) frontend URLs.
- [ ] **Database**: Schema and migrations applied (`supabase_schema.sql`, `supabase_complete_schema.sql`, etc.). Optional: run `supabase_rls.sql` for Row Level Security (see backend folder).

---

## Quick reference

- **Backend** `.env` / host env: see `backend/.env.example`.
- **Frontend** `.env`: see `frontend/.env.example` if present, or Vercel env table above.
- **Deploy flow**: [DEPLOY.md](../DEPLOY.md).
