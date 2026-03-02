"""
Server-side RevenueCat subscriber lookup for reflection rate limiting.
Uses Secret API key only; do not send X-Platform (RevenueCat requirement).
Entitlement "Premium" matches frontend REVENUECAT_ENTITLEMENT_PREMIUM.
"""
import logging
import os
from datetime import datetime, timezone

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)

REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"
REVENUECAT_ENTITLEMENT_PREMIUM = "Premium"

# Product identifiers that indicate yearly (configurable via env if needed)
YEARLY_PRODUCT_HINTS = ("year", "annual", "yearly")


def get_secret_key() -> str | None:
    """RevenueCat Secret API key (sk_...). Must be set for server-side checks."""
    key = (os.getenv("REVENUECAT_SECRET_API_KEY") or os.getenv("REVENUECAT_SECRET_KEY") or "").strip()
    return key or None


def get_subscription_status(app_user_id: str) -> dict:
    """
    Fetch subscriber info from RevenueCat. Returns dict:
      - plan_type: "trial" | "monthly" | "yearly"
      - period_start: ISO timestamp for current billing period start (for monthly/yearly); None for trial
      - entitlement_active: bool
    If API key missing or request fails, returns plan_type="trial", period_start=None (safe default).
    """
    result = {"plan_type": "trial", "period_start": None, "entitlement_active": False}
    if not app_user_id or not str(app_user_id).strip():
        return result
    key = get_secret_key()
    if not key:
        logger.debug("RevenueCat: REVENUECAT_SECRET_API_KEY not set; treating as trial")
        return result
    if not httpx:
        logger.warning("RevenueCat: httpx not available; treating as trial")
        return result

    url = f"{REVENUECAT_API_BASE}/subscribers/{app_user_id.strip()}"
    try:
        with httpx.Client(timeout=10.0) as client:
            # Do NOT send X-Platform when using secret key
            r = client.get(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
            )
            if r.status_code != 200:
                logger.warning("RevenueCat subscriber fetch %s: %s %s", app_user_id[:8], r.status_code, r.text[:200])
                return result

            data = r.json()
            # Response may be { "subscriber": ... } or { "value": { "subscriber": ... } }
            raw = data or {}
            subscriber = raw.get("subscriber") or (raw.get("value") or {}).get("subscriber") or {}
            entitlements = subscriber.get("entitlements") or {}
            premium = entitlements.get(REVENUECAT_ENTITLEMENT_PREMIUM) or {}

            expires = premium.get("expires_date")
            if expires:
                try:
                    if isinstance(expires, str):
                        exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                    else:
                        exp_dt = datetime.fromtimestamp(expires / 1000.0, tz=timezone.utc)
                    if exp_dt > datetime.now(timezone.utc):
                        result["entitlement_active"] = True
                except Exception as e:
                    logger.debug("RevenueCat expires_date parse: %s", e)

            if not result["entitlement_active"]:
                return result

            product_id = (premium.get("product_identifier") or "").lower()
            period_type = (premium.get("period_type") or "").lower()
            # Determine monthly vs yearly from product identifier
            is_yearly = any(hint in product_id for hint in YEARLY_PRODUCT_HINTS)
            if is_yearly:
                result["plan_type"] = "yearly"
            else:
                result["plan_type"] = "monthly"

            # Period start: use purchase_date or original_purchase_date for billing period
            purchase_date = premium.get("purchase_date") or premium.get("original_purchase_date")
            if purchase_date:
                try:
                    if isinstance(purchase_date, str):
                        result["period_start"] = purchase_date
                    else:
                        result["period_start"] = datetime.fromtimestamp(purchase_date / 1000.0, tz=timezone.utc).isoformat()
                except Exception:
                    pass

    except Exception as e:
        logger.warning("RevenueCat get_subscription_status failed: %s", e)
    return result
