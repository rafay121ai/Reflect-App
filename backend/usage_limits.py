"""
Reflection rate limit logic: plan limits, reset-if-needed, and enforcement helpers.
All plan_type and limits are derived server-side (RevenueCat + user_usage); no trust of frontend.
"""
import logging
from datetime import datetime, timezone, timedelta

from supabase_client import (
    get_user_usage,
    ensure_user_usage_row,
    update_usage_period,
    increment_usage_atomic,
    decrement_usage_atomic,
)

logger = logging.getLogger(__name__)

# Limits per plan (server-side constants only)
TRIAL_PER_DAY = 2
TRIAL_TOTAL = 14
TRIAL_DAYS = 7
MONTHLY_LIMIT = 50
YEARLY_LIMIT = 75


def get_plan_limits(plan_type: str) -> tuple[int, int, int]:
    """Returns (limit_per_period, trial_total_limit, trial_per_day_limit)."""
    if plan_type == "yearly":
        return (YEARLY_LIMIT, TRIAL_TOTAL, TRIAL_PER_DAY)
    if plan_type == "monthly":
        return (MONTHLY_LIMIT, TRIAL_TOTAL, TRIAL_PER_DAY)
    return (MONTHLY_LIMIT, TRIAL_TOTAL, TRIAL_PER_DAY)  # trial uses trial limits in RPC


def reset_usage_if_needed(usage: dict | None, plan_type: str, period_start_from_rc: str | None) -> dict | None:
    """
    Given current usage row and plan_type, determine if period has rolled over and return updated usage state.
    Does NOT write to DB; caller should call update_usage_period and re-fetch if reset is needed.
    Returns the same usage dict if no reset needed; returns a dict with suggested new period_start/reflections_used if reset needed.
    """
    if not usage:
        return None
    now = datetime.now(timezone.utc)
    uid = (usage.get("user_id") or "").strip()
    if not uid:
        return None

    current_plan = (usage.get("plan_type") or "trial").strip().lower()
    if current_plan != plan_type:
        # Plan changed (e.g. trial -> monthly); caller should update row with new plan_type and reset
        return {"user_id": uid, "plan_type": plan_type, "period_start": _period_start_for_plan(plan_type, period_start_from_rc), "reflections_used": 0, "trial_total_used": usage.get("trial_total_used") or 0}

    if plan_type == "trial":
        period_start = usage.get("period_start")
        if not period_start:
            return usage
        try:
            if isinstance(period_start, str):
                ps_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            else:
                ps_dt = period_start
            if ps_dt.tzinfo is None:
                ps_dt = ps_dt.replace(tzinfo=timezone.utc)
            if (ps_dt.date() < now.date()):
                return {"user_id": uid, "plan_type": plan_type, "period_start": now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(), "reflections_used": 0, "trial_total_used": usage.get("trial_total_used") or 0}
        except Exception as e:
            logger.debug("reset_usage_if_needed trial period_start parse: %s", e)
        return None

    if plan_type in ("monthly", "yearly") and period_start_from_rc:
        period_start = usage.get("period_start")
        if not period_start:
            return usage
        try:
            if isinstance(period_start, str):
                ps_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            else:
                ps_dt = period_start
            if ps_dt.tzinfo is None:
                ps_dt = ps_dt.replace(tzinfo=timezone.utc)
            delta = timedelta(days=365) if plan_type == "yearly" else timedelta(days=31)
            if now >= ps_dt + delta:
                # Advance period until we're in current window
                new_start = ps_dt
                while new_start + delta <= now:
                    new_start = new_start + delta
                return {"user_id": uid, "plan_type": plan_type, "period_start": new_start.isoformat(), "reflections_used": 0, "trial_total_used": None}
        except Exception as e:
            logger.debug("reset_usage_if_needed paid period parse: %s", e)
    elif plan_type in ("monthly", "yearly"):
        # No period_start_from_rc: use stored period_start and advance by 1 month/year
        period_start = usage.get("period_start")
        if not period_start:
            return None
        try:
            if isinstance(period_start, str):
                ps_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            else:
                ps_dt = period_start
            if ps_dt.tzinfo is None:
                ps_dt = ps_dt.replace(tzinfo=timezone.utc)
            delta = timedelta(days=365) if plan_type == "yearly" else timedelta(days=31)
            if now >= ps_dt + delta:
                new_start = ps_dt
                while new_start + delta <= now:
                    new_start = new_start + delta
                return {"user_id": uid, "plan_type": plan_type, "period_start": new_start.isoformat(), "reflections_used": 0, "trial_total_used": None}
        except Exception as e:
            logger.debug("reset_usage_if_needed paid period parse: %s", e)
    return None


def _period_start_for_plan(plan_type: str, period_start_from_rc: str | None) -> str:
    """UTC midnight today for trial; else RC period start or now."""
    now = datetime.now(timezone.utc)
    if plan_type == "trial":
        return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if period_start_from_rc:
        return period_start_from_rc
    return now.isoformat()


def enforce_reflection_limit(user_id: str, plan_type: str, period_start_from_rc: str | None) -> dict | None:
    """
    Get or create usage row, reset period if needed, then perform atomic increment with limit check.
    Returns updated usage row if increment succeeded (reflection allowed).
    Returns None if limit exceeded or error; caller should return HTTP 429.
    """
    if not user_id or not str(user_id).strip():
        return None
    uid = user_id.strip()
    limit_per_period, trial_total_limit, trial_per_day_limit = get_plan_limits(plan_type)

    usage = get_user_usage(uid)
    if not usage:
        # First time: create row. Trial starts on first reflection.
        now = datetime.now(timezone.utc)
        period_start = _period_start_for_plan(plan_type, period_start_from_rc)
        trial_start = now.isoformat() if plan_type == "trial" else None
        ensure_user_usage_row(uid, plan_type, period_start, trial_start=trial_start)
        usage = get_user_usage(uid)
        if not usage:
            return None

    # Reset if period rolled over (new day for trial, new cycle for paid)
    reset = reset_usage_if_needed(usage, plan_type, period_start_from_rc)
    if reset:
        update_usage_period(
            uid,
            reset["period_start"],
            reflections_used=reset.get("reflections_used", 0),
            trial_total_used=reset.get("trial_total_used"),
        )
        usage = get_user_usage(uid) or usage

    # Atomic increment with limit in DB (prevents race)
    updated = increment_usage_atomic(
        uid,
        plan_type,
        limit_per_period,
        trial_total_limit=trial_total_limit,
        trial_per_day_limit=trial_per_day_limit,
    )
    return updated


def rollback_reflection_usage(user_id: str, plan_type: str) -> None:
    """Call after LLM fails to undo the prior increment."""
    if user_id and plan_type:
        decrement_usage_atomic(user_id.strip(), plan_type)
