# Reflection rate limiting — implementation summary

Production-grade reflection rate limiting by subscription tier (FastAPI + Supabase + RevenueCat). Server-side only; no trust of frontend.

---

## 1. New files

| File | Purpose |
|------|--------|
| **backend/user_usage_schema.sql** | Table `user_usage` (user_id, plan_type, reflections_used, period_start, trial_start, trial_total_used, updated_at), indexes, RLS policies, and two RPCs: `increment_reflection_usage` (atomic increment with limit in WHERE) and `decrement_reflection_usage` (rollback on LLM failure). |
| **backend/revenuecat_client.py** | Server-side RevenueCat subscriber lookup via `GET /v1/subscribers/{app_user_id}` with Secret API key. Returns `plan_type` ("trial" \| "monthly" \| "yearly"), `period_start`, and `entitlement_active`. If key is missing or request fails, defaults to trial. |
| **backend/usage_limits.py** | Plan limits (trial 2/day + 14 total in 7d; monthly 50; yearly 75), `reset_usage_if_needed()`, and `enforce_reflection_limit()` which gets/creates usage row, resets period if needed, then calls atomic increment RPC. `rollback_reflection_usage()` for LLM failure. |
| **REFLECTION_RATE_LIMITING.md** | This file. |

---

## 2. Modified files

| File | Changes |
|------|--------|
| **backend/supabase_client.py** | Added: `get_user_usage`, `ensure_user_usage_row`, `update_usage_period`, `increment_usage_atomic` (RPC), `decrement_usage_atomic` (RPC). In `delete_user_data`, added delete of `user_usage` rows for the user. |
| **backend/server.py** | In `_do_reflect`: (1) get subscription from RevenueCat, (2) call `enforce_reflection_limit`; if `None` return 429 with `{"error": "Reflection limit reached"}`, (3) run LLM/DB as before, (4) on any exception call `rollback_reflection_usage` then re-raise. Imports: `revenuecat_client.get_subscription_status`, `usage_limits.enforce_reflection_limit`, `rollback_reflection_usage`, `JSONResponse`. |
| **backend/.env.example** | Documented optional `REVENUECAT_SECRET_API_KEY` for server-side RevenueCat checks. |

---

## 3. How usage resets

- **Trial**  
  - `period_start` is the start of the **current UTC day**.  
  - Each UTC day, we reset: set `period_start` to today (UTC midnight) and `reflections_used` to 0.  
  - `trial_total_used` is never reset during the trial; it only counts total reflections in the 7-day window.  
  - Trial is valid only while `trial_start >= now() - 7 days`.  

- **Monthly / yearly**  
  - `period_start` is the start of the current billing period.  
  - When `now >= period_start + 1 month` (or + 1 year), we advance `period_start` by one period (repeated until we are in the current window) and set `reflections_used` to 0.  
  - RevenueCat’s `purchase_date` / `original_purchase_date` can be used to seed `period_start` when the user first becomes paid; after that we advance by calendar month/year.  

Resets are applied in Python (`reset_usage_if_needed` + `update_usage_period`) before calling the atomic increment RPC. The RPC for trial also resets the daily counter inside the same transaction if the UTC day has changed (so the “2 per day” limit is correct even at day boundary).

---

## 4. How race conditions are prevented

- **Single atomic increment with limit in DB**  
  The increment is done in PostgreSQL with:

  - **Trial:**  
    `UPDATE user_usage SET reflections_used = reflections_used + 1, trial_total_used = trial_total_used + 1 WHERE user_id = $1 AND plan_type = 'trial' AND reflections_used < 2 AND trial_total_used < 14 AND trial_start >= now() - interval '7 days' RETURNING *`

  - **Monthly/yearly:**  
    `UPDATE user_usage SET reflections_used = reflections_used + 1 WHERE user_id = $1 AND plan_type = $2 AND reflections_used < $limit RETURNING *`

  Only one request can “win” the slot when at the limit; the other gets 0 rows and we return 429. No read-modify-write in application code.

- **Rollback on LLM failure**  
  We increment first, then run the LLM. If the LLM (or any step after increment) fails, we call `decrement_reflection_usage` so the slot is not consumed. The decrement RPC uses `greatest(0, ... - 1)` so counts never go negative.

- **No trust of frontend**  
  `plan_type` and limits come only from RevenueCat (server-side) and server-side constants. `user_id` comes only from JWT (`require_user_id`). Request body is not used for plan or identity.

---

## 5. Safe for ~10,000 users

- **Atomicity:** Limit check and increment are one UPDATE in the database; no double-count under concurrency.  
- **Indexing:** `user_id` is primary key; lookups and updates are by primary key.  
- **No N+1:** One usage row per user; one RevenueCat GET per reflection request; one RPC per reflection.  
- **RevenueCat:** Single GET per request; if key is unset or API fails, we treat user as trial (conservative).  
- **Supabase:** Service role is used for `user_usage`; RLS is in place for direct client access.  
- **Rollback:** Failed LLM calls release the slot via decrement, so limits stay accurate and no permanent “consumed but not used” counts.

Run `backend/user_usage_schema.sql` in the Supabase SQL Editor once to create the table, indexes, RLS, and RPCs. Set `REVENUECAT_SECRET_API_KEY` in production if you want server-side subscription detection; otherwise everyone is treated as trial with 2/day and 14 total in 7 days.
