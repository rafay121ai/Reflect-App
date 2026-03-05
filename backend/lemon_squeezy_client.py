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

LEMON_SQUEEZY_WEBHOOK_SECRET = (
    os.getenv("LEMONSQUEEZY_SIGNING_SECRET") or os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET") or ""
).strip()
LS_VARIANT_MONTHLY = (
    os.getenv("LEMONSQUEEZY_MONTHLY_VARIANT_ID") or os.getenv("LS_VARIANT_MONTHLY") or ""
).strip()
LS_VARIANT_YEARLY = (
    os.getenv("LEMONSQUEEZY_YEARLY_VARIANT_ID") or os.getenv("LS_VARIANT_YEARLY") or ""
).strip()

VARIANT_TO_PLAN: dict[str, str] = {}
if LS_VARIANT_MONTHLY:
    VARIANT_TO_PLAN[LS_VARIANT_MONTHLY] = "monthly"
if LS_VARIANT_YEARLY:
    VARIANT_TO_PLAN[LS_VARIANT_YEARLY] = "yearly"


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Lemon Squeezy webhook signature (HMAC SHA256). Uses LEMONSQUEEZY_SIGNING_SECRET or LEMON_SQUEEZY_WEBHOOK_SECRET."""
    secret = LEMON_SQUEEZY_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    try:
        expected = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature.strip(), expected)
    except Exception as e:
        logger.warning("Lemon Squeezy signature verification failed: %s", e)
        return False


def parse_order_created(body: dict[str, Any]) -> dict[str, Any] | None:
    """
    Parse Lemon Squeezy order_created webhook (sent when a purchase is completed).
    Returns same shape as parse_subscription_event: event_name, user_id, user_email, variant_id, plan_type, status.
    """
    if not isinstance(body, dict):
        return None
    meta = body.get("meta") or {}
    event_name = (meta.get("event_name") or "").strip()
    if event_name != "order_created":
        return None
    custom_data = meta.get("custom_data") or {}
    user_id = (custom_data.get("user_id") or "").strip() or None
    data = body.get("data") or {}
    attrs = data.get("attributes") or {}
    user_email = (attrs.get("user_email") or "").strip() or None
    # variant_id can be in first_order_item or in included order items
    variant_id = None
    first_item = attrs.get("first_order_item")
    if isinstance(first_item, dict):
        variant_id = str(first_item.get("variant_id") or "").strip() or None
    if not variant_id:
        variant_id = str(attrs.get("variant_id") or "").strip() or None
    if not variant_id and isinstance(body.get("included"), list):
        for inc in body.get("included", []):
            if (inc.get("type") or "").strip() == "order-items":
                a = inc.get("attributes") or {}
                variant_id = str(a.get("variant_id") or "").strip() or None
                if variant_id:
                    break
    plan_type = VARIANT_TO_PLAN.get(variant_id or "", "monthly")
    status = (attrs.get("status") or "").strip().lower() or ""
    if not user_id and not user_email:
        logger.warning("Lemon Squeezy order_created webhook missing user_id and user_email")
        return None
    return {
        "event_name": event_name,
        "user_id": user_id,
        "user_email": user_email,
        "variant_id": variant_id,
        "plan_type": plan_type,
        "status": status,
    }


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
    data = body.get("data") or {}
    attrs = data.get("attributes") or {}
    user_email = (attrs.get("user_email") or "").strip() or None
    variant_id = str(attrs.get("variant_id") or "").strip() or None
    plan_type = VARIANT_TO_PLAN.get(variant_id or "", "monthly")
    status = (attrs.get("status") or "").strip().lower() or ""

    if not user_id and not user_email:
        logger.warning("Lemon Squeezy webhook missing meta.custom_data.user_id and data.attributes.user_email")
        return None

    return {
        "event_name": event_name,
        "user_id": user_id or None,
        "user_email": user_email,
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
    """
    Returns True if this event has already been processed.
    Fails CLOSED — if we cannot verify, treat as duplicate
    to prevent replay attacks.
    """
    if not event_id:
        return False
    try:
        client = _get_supabase_client()
        if not client:
            logger.warning("is_duplicate_event: no supabase client — failing closed")
            return True  # fail closed
        result = client.table("webhook_events").select("id").eq("event_id", event_id).limit(1).execute()
        return bool(result.data)
    except Exception as e:
        logger.warning("is_duplicate_event check failed (%s) — failing closed", type(e).__name__)
        return True  # fail closed on any error


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

