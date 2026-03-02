"""
Lemon Squeezy helpers: webhook verification, event parsing, and deduplication.
"""
import hmac
import hashlib
import logging
import os
from typing import Any

from supabase_client import _get_client  # type: ignore

logger = logging.getLogger(__name__)

LEMON_SQUEEZY_WEBHOOK_SECRET = (os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET") or "").strip()
LS_VARIANT_MONTHLY = (os.getenv("LS_VARIANT_MONTHLY") or "").strip()
LS_VARIANT_YEARLY = (os.getenv("LS_VARIANT_YEARLY") or "").strip()

VARIANT_TO_PLAN: dict[str, str] = {}
if LS_VARIANT_MONTHLY:
    VARIANT_TO_PLAN[LS_VARIANT_MONTHLY] = "monthly"
if LS_VARIANT_YEARLY:
    VARIANT_TO_PLAN[LS_VARIANT_YEARLY] = "yearly"


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Lemon Squeezy webhook signature (HMAC SHA256)."""
    if not LEMON_SQUEEZY_WEBHOOK_SECRET or not signature:
        return False
    try:
        expected = hmac.new(
            LEMON_SQUEEZY_WEBHOOK_SECRET.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature.strip(), expected)
    except Exception as e:
        logger.warning("Lemon Squeezy signature verification failed: %s", e)
        return False


def parse_subscription_event(body: dict[str, Any]) -> dict[str, Any] | None:
    """
    Parse a Lemon Squeezy subscription webhook body.
    Returns a dict with: event_name, user_id, variant_id, plan_type, status.
    """
    if not isinstance(body, dict):
        return None

    meta = body.get("meta") or {}
    event_name = (meta.get("event_name") or "").strip()
    if not event_name:
        return None

    if event_name not in {
        "subscription_created",
        "subscription_updated",
        "subscription_cancelled",
        "subscription_expired",
        "subscription_resumed",
    }:
        return None

    custom_data = meta.get("custom_data") or {}
    user_id = (custom_data.get("user_id") or "").strip()
    if not user_id:
        logger.warning("Lemon Squeezy webhook missing meta.custom_data.user_id")
        return None

    data = body.get("data") or {}
    attrs = data.get("attributes") or {}
    variant_id = str(attrs.get("variant_id") or "").strip() or None
    plan_type = VARIANT_TO_PLAN.get(variant_id or "", "monthly")
    status = (attrs.get("status") or "").strip().lower() or ""

    return {
        "event_name": event_name,
        "user_id": user_id,
        "variant_id": variant_id,
        "plan_type": plan_type,
        "status": status,
    }


def _get_supabase_client():
    try:
        return _get_client()
    except Exception:
        return None


def is_duplicate_event(event_id: str) -> bool:
    """Returns True if this event_id has already been processed."""
    if not event_id:
        return False
    client = _get_supabase_client()
    if not client:
        return False
    try:
        result = client.table("webhook_events").select("id").eq("event_id", event_id).limit(1).execute()
        return bool(result.data)
    except Exception:
        # Fail open: if dedup check fails, process event anyway
        return False


def record_event(event_id: str, event_name: str) -> None:
    """Mark this event_id as processed."""
    if not event_id:
        return
    client = _get_supabase_client()
    if not client:
        return
    try:
        client.table("webhook_events").insert(
            {
                "event_id": event_id,
                "event_name": event_name or "",
            }
        ).execute()
    except Exception:
        # Best-effort; ignore failures
        pass

