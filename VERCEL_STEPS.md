# Deploy REFLECT frontend on Vercel – step by step

## Before you start

- Have your repo pushed to **GitHub**, **GitLab**, or **Bitbucket** (Vercel deploys from git).
- Decide where the **backend** will run (Railway, Render, or Fly.io). You can deploy the frontend first and add the backend URL later.

---

## Step 1: Sign in to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub/GitLab/Bitbucket is easiest).
2. If you’ve never used Vercel, complete the onboarding.

---

## Step 2: Import your project

1. Click **“Add New…”** → **“Project”**.
2. **Import** your REFLECT repo (e.g. from GitHub). Select the repo and click **Import**.

---

## Step 3: Configure the project (root & build)

Vercel should pick this up from your `vercel.json`, but confirm:

| Setting | Value |
|--------|--------|
| **Framework Preset** | Other (or leave as detected) |
| **Root Directory** | `frontend` ← **Important** |
| **Build Command** | `yarn build` |
| **Output Directory** | `build` |
| **Install Command** | `yarn install` |

If any of these are wrong, edit them. Then click **Continue** (don’t deploy yet).

---

## Step 4: Add environment variables

On the same screen (or **Settings → Environment Variables** after the project is created), add:

| Name | Value | Environment |
|------|--------|-------------|
| `REACT_APP_SUPABASE_URL` | `https://yrlawoikeurppwhhvlwy.supabase.co` | Production (and Preview if you want) |
| `REACT_APP_SUPABASE_ANON_KEY` | Your Supabase anon key (same as in `frontend/.env`) | Production (and Preview) |
| `REACT_APP_BACKEND_URL` | See below | Production (and Preview) |

**For `REACT_APP_BACKEND_URL`:**

- If the **backend is not deployed yet**: use a placeholder, e.g. `https://your-backend.railway.app` (you’ll change it in Step 7).
- If the **backend is already deployed**: use its URL with **no trailing slash**, e.g. `https://reflect-api.railway.app`.

Then click **Deploy** (or **Save** and deploy from the Deployments tab).

---

## Step 5: Wait for the build

1. Vercel will clone the repo, run `yarn install` and `yarn build` in the `frontend` folder.
2. If the build fails, open the build logs and fix the error (often a missing env var or a typo in Root Directory).
3. When it succeeds, you’ll get a URL like `https://your-project.vercel.app`.

---

## Step 6: Deploy the backend (if not done yet)

The app needs the backend for history, saving, reminders, and LLM. Deploy it to one of:

- **Railway**: [railway.app](https://railway.app) → New Project → Deploy from GitHub → set **Root Directory** to `backend`, add env vars from `backend/.env`, deploy.
- **Render**: [render.com](https://render.com) → New → Web Service → connect repo, **Root Directory** `backend`, build: `pip install -r requirements.txt`, start: `uvicorn server:app --host 0.0.0.0 --port $PORT`.
- **Fly.io**: From your machine, in `backend/`: `fly launch` and follow prompts, then add env vars.

On the backend host, set **CORS** so the Vercel site can call it:

- `ALLOWED_ORIGINS` = `https://your-project.vercel.app`  
  (or `http://localhost:3000,https://your-project.vercel.app` to allow local too).

---

## Step 7: Point the frontend at the backend

1. Copy your **backend URL** (e.g. `https://reflect-api.railway.app`).
2. In **Vercel** → your project → **Settings** → **Environment Variables**.
3. Edit `REACT_APP_BACKEND_URL` (or add it) and set it to that URL (**no trailing slash**).
4. Go to **Deployments** → open the **⋯** on the latest deployment → **Redeploy** (so the new env is used).

---

## Step 8: Test

1. Open your Vercel URL (e.g. `https://your-project.vercel.app`).
2. Sign in (Supabase), do a reflection, and check that it saves and appears under **My reflections**.
3. If API calls fail, check: `REACT_APP_BACKEND_URL` is correct, backend has `ALLOWED_ORIGINS` including your Vercel URL, and backend env vars (Supabase, OpenRouter/Ollama) are set.

---

## Quick checklist

- [ ] Repo connected to Vercel  
- [ ] Root Directory = `frontend`  
- [ ] `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` set  
- [ ] `REACT_APP_BACKEND_URL` set to live backend URL (and redeploy after changing it)  
- [ ] Backend deployed and `ALLOWED_ORIGINS` includes your Vercel URL  
- [ ] Test sign-in and saving a reflection  

That’s it. Future pushes to your main branch will trigger new Vercel deploys automatically.
