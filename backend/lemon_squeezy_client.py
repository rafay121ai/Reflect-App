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
    When Supabase is unavailable or the check fails, we fail OPEN (return False)
    so the webhook is processed rather than dropped. Tradeoff: a brief Supabase
    outage could allow a duplicate event to be processed twice; failing closed
    would leave paying users stuck on trial when webhooks are dropped.
    """
    if not event_id:
        return False
    try:
        client = _get_supabase_client()
        if not client:
            logger.warning("is_duplicate_event: no Supabase client — failing open (process event)")
            return False
        result = client.table("webhook_events").select("id").eq("event_id", event_id).limit(1).execute()
        return bool(result.data)
    except Exception as e:
        logger.warning("is_duplicate_event check failed (%s) — failing open (process event)", type(e).__name__)
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


def fetch_subscription_plan_by_email(email: str) -> tuple[str | None, str | None]:
    """
    Call Lemon Squeezy API to get current subscription plan for this email.
    Returns (plan_type, status) e.g. ("monthly", "active") or (None, None) if no active subscription.
    Uses LEMONSQUEEZY_API_KEY or LEMON_SQUEEZY_API_KEY.
    """
    api_key = (os.getenv("LEMONSQUEEZY_API_KEY") or os.getenv("LEMON_SQUEEZY_API_KEY") or "").strip()
    if not api_key or not (email or "").strip():
        return (None, None)
    import urllib.parse
    try:
        import urllib.request
        encoded = urllib.parse.quote(email.strip(), safe="")
        url = f"https://api.lemonsqueezy.com/v1/subscriptions?filter[user_email]={encoded}"
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.api+json",
                "Authorization": f"Bearer {api_key}",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return (None, None)
            data = resp.read().decode("utf-8")
    except Exception as e:
        logger.warning("Lemon Squeezy API fetch_subscription_plan_by_email failed: %s", e)
        return (None, None)
    try:
        import json
        body = json.loads(data)
        items = (body.get("data") or []) if isinstance(body, dict) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            attrs = item.get("attributes") or {}
            status = (attrs.get("status") or "").strip().lower()
            if status == "active":
                variant_id = str(attrs.get("variant_id") or "").strip()
                plan_type = VARIANT_TO_PLAN.get(variant_id, "monthly")
                return (plan_type, status)
        return (None, None)
    except Exception as e:
        logger.warning("Lemon Squeezy API parse response failed: %s", e)
        return (None, None)

