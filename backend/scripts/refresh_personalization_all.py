#!/usr/bin/env python3
"""
Call POST /api/personalization/refresh-all to refresh personalization context for all users.
For use in cron. Requires .env (or env) with PERSONALIZATION_CRON_SECRET and BACKEND_URL (default http://localhost:8000).

Example cron (daily at 2am):
  0 2 * * * cd /path/to/backend && . venv/bin/activate && python scripts/refresh_personalization_all.py
"""
import logging
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def main():
    base = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
    secret = (os.getenv("PERSONALIZATION_CRON_SECRET") or "").strip()
    if not secret:
        logger.error("PERSONALIZATION_CRON_SECRET not set in env")
        sys.exit(1)
    try:
        import httpx
    except ImportError:
        logger.error("httpx required: pip install httpx")
        sys.exit(1)
    url = f"{base}/api/personalization/refresh-all"
    try:
        r = httpx.post(url, headers={"X-Cron-Secret": secret}, timeout=60.0)
        r.raise_for_status()
        data = r.json()
        logger.info("Updated %d users", data.get("updated", 0))
    except Exception as e:
        logger.exception("Error calling refresh-all: %s", e)
        sys.exit(1)

if __name__ == "__main__":
    main()
