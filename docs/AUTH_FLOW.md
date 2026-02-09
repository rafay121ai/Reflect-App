# Authentication Flow & 401 Fix

## 1. How auth works end-to-end

```
┌─────────────────┐     Supabase Auth      ┌─────────────────┐     Bearer JWT      ┌─────────────────┐
│  Frontend       │  signIn / OAuth /     │  Supabase       │  Authorization:    │  Backend         │
│  (React)        │  getSession()         │  (Auth)         │  Bearer <token>    │  (FastAPI)       │
│                 │ ───────────────────►  │  issues JWT     │ ─────────────────►  │  auth.py         │
│  AuthContext    │                       │  (HS256 or      │                     │  verify token    │
│  stores         │  session.access_token │   ES256)        │                     │  → user_id       │
│  → setAuthToken │ ◄───────────────────  │                 │                     │  → 401 if invalid│
└─────────────────┘                       └─────────────────┘                     └─────────────────┘
```

- **Tokens generated:** Supabase Auth (frontend `supabase.auth.signIn*` or `getSession()`) returns a `session` with `access_token` (JWT).
- **Stored:** In memory only: `AuthContext` calls `setAuthToken(session?.access_token)` → `api.js` stores it in `currentAccessToken`.
- **Attached to requests:** `getAuthHeaders()` in `frontend/src/lib/api.js` returns `{ Authorization: "Bearer " + currentAccessToken }`. Used by all API calls (profile sync, history, etc.).
- **Backend verification:** `backend/auth.py` → `get_current_user_id()` → FastAPI `require_user_id` dependency. It reads `Authorization: Bearer <token>`, decodes the JWT, checks signature and `audience="authenticated"`, returns `sub` (user id) or raises **401 Unauthorized**.

## 2. Where 401 comes from

| Step | Location | What happens |
|------|----------|--------------|
| Request | Frontend `getAuthHeaders()` | Sends `Authorization: Bearer <token>` (or `{}` if no token) |
| Middleware | `backend/auth.py` `get_current_user_id()` | FastAPI runs this before the route handler |
| 401 cases | Same function | Missing/empty token → 401 "Authorization required" |
| | | Token invalid (wrong secret/alg, expired, bad signature) → 401 "Invalid token" |
| | | Token expired → 401 "Token expired" |

Protected routes (all use `require_user_id`):

- `POST /api/user/profile/sync`
- `GET /api/user/profile`
- `GET /api/history`
- …and all other `/api/*` that use `Depends(require_user_id)`.

## 3. Database migration impact

- **User/session tables:** Supabase Auth stores users and sessions in **Supabase’s built-in auth schema** (not your app’s tables). When you “migrated to a new database” you created a **new Supabase project**. So:
  - Users/sessions in the **old** project are not in the new project.
  - The new project has its own Auth config and **JWT signing keys** (HS256 secret and/or ES256 keys).
- **JWT secrets / auth config:**  
  - **Old project:** Backend was verifying with that project’s `SUPABASE_JWT_SECRET` (HS256).  
  - **New project:** May still use HS256 (legacy JWT Secret) or may use **ES256** (new signing keys). If the new project issues **ES256** tokens but the backend only verifies **HS256**, every request → **401 Invalid token**.
- **.env (backend):** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET` must be from the **new** project. If `SUPABASE_JWT_SECRET` is from the old project (or empty), verification will fail.
- **.env (frontend):** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` must be from the **new** project so the frontend logs in and gets tokens from the new project.

## 4. Fix (what was done)

1. **Backend supports both HS256 and ES256**  
   So it works whether the new Supabase project uses:
   - Legacy JWT Secret (HS256), or  
   - New signing keys (ES256).

2. **Correct env for the new project**  
   - Backend: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (and optionally `SUPABASE_JWT_SECRET` for HS256) from **new** project.  
   - Frontend: `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` from **new** project.

3. **Re-login after migration**  
   - Old tokens (from the old project) are invalid in the new project.  
   - User must sign out and sign in again (or sign in with OAuth again) so the frontend gets a **new** JWT from the new project. No need to “migrate” user/session data for auth to work; Supabase Auth in the new project will create new users/sessions on first sign-in.

## 5. Verify

- In browser DevTools → Network: request to e.g. `POST /api/user/profile/sync` should have header `Authorization: Bearer eyJ...`.
- Backend logs: if you see `Auth: invalid token` or `Auth: missing or empty Bearer token`, the fix is correct env + re-login (and backend supporting ES256 if the new project uses it).
