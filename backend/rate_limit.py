"""
Simple in-memory per-user rate limiter for LLM routes.
Use RATE_LIMIT_LLM_PER_MINUTE (default 30) to cap requests per user per minute.
"""
import logging
import os
import threading
import time
from collections import deque

logger = logging.getLogger(__name__)

# Max LLM requests per user per rolling minute. Set to 0 to disable.
RATE_LIMIT_LLM_PER_MINUTE = int(os.getenv("RATE_LIMIT_LLM_PER_MINUTE", "30").strip() or "0")
WINDOW_SEC = 60

_lock = threading.Lock()
# key: user_id, value: deque of timestamps (monotonic)
_timestamps: dict[str, deque[float]] = {}


def _prune_and_count(user_id: str) -> int:
    """Remove timestamps older than WINDOW_SEC and return current count. Caller must hold _lock."""
    now = time.monotonic()
    cutoff = now - WINDOW_SEC
    if user_id not in _timestamps:
        _timestamps[user_id] = deque(maxlen=500)
    q = _timestamps[user_id]
    while q and q[0] < cutoff:
        q.popleft()
    return len(q)


def check_llm_rate_limit(user_id: str) -> None:
    """
    If rate limiting is enabled, raises fastapi.HTTPException(429) when the user
    has exceeded RATE_LIMIT_LLM_PER_MINUTE requests in the last minute.
    """
    if RATE_LIMIT_LLM_PER_MINUTE <= 0:
        return
    if not user_id or not str(user_id).strip():
        return
    uid = str(user_id).strip()
    with _lock:
        n = _prune_and_count(uid)
        if n >= RATE_LIMIT_LLM_PER_MINUTE:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {RATE_LIMIT_LLM_PER_MINUTE} LLM requests per minute.",
            )
        _timestamps[uid].append(time.monotonic())
