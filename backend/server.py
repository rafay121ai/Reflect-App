"""
REFLECT backend – FastAPI server that uses local Ollama (e.g. Qwen) for reflections.

# ============================================================
# PRODUCTION ENVIRONMENT VARIABLES REQUIRED ON RAILWAY:
# SUPABASE_URL
# SUPABASE_SERVICE_KEY
# SUPABASE_JWT_SECRET
# LLM_PROVIDER=openrouter
# OPENROUTER_API_KEY
# OPENROUTER_MODEL=openai/gpt-4.1-mini
# ALLOWED_ORIGINS=https://your-app.vercel.app
# ============================================================
"""
import json
import logging
import os
import random
import threading
import time
from datetime import datetime, timezone, timedelta

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from dotenv import load_dotenv
load_dotenv()  # load .env before other modules read SUPABASE_* etc.
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from auth import require_user_id
from security import sanitize_for_llm

from llm_provider import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, get_closing, convert_moods_to_feelings, llm_chat, generate_return_card
from openai_client import get_mirror_report, contains_crisis_signal
from pattern_analyzer import analyze_patterns_deep_sync
from revenuecat_client import get_subscription_status as get_rc_subscription_status
from usage_limits import enforce_reflection_limit, rollback_reflection_usage
from lemon_squeezy_client import (
    verify_webhook_signature,
    parse_subscription_event,
    is_duplicate_event,
    record_event,
    fetch_subscription_plan_by_email,
)
from supabase_client import (
    get_personalization_context,
    insert_reflection,
    update_reflection,
    update_reflection_closing,
    insert_reflection_pattern,
    update_reflection_pattern_reflection_id,
    get_pattern_history_for_user,
    insert_mood_checkin,
    insert_revisit_reminder,
    get_reminder_by_id,
    delete_reminder,
    get_reflection_by_id,
    list_reflections_by_user,
    get_due_reminders,
    get_supabase_status,
    insert_saved_reflection,
    get_saved_reflection_by_id,
    update_saved_reflection_open_later,
    update_saved_reflection_remove_open_later,
    mark_saved_reflection_opened,
    list_saved_reflections_waiting,
    list_saved_reflections_all,
    list_saved_reflections_since,
    get_weekly_insight_by_week,
    insert_weekly_insight,
    delete_weekly_insight,
    get_profile,
    upsert_profile,
    sync_profile_from_auth,
    delete_user_data,
    refresh_personalization_context_for_user,
    refresh_personalization_context_all,
    get_user_usage,
    ensure_user_usage_row,
    update_user_plan,
    list_user_usage_user_ids,
    update_profile_plan,
    count_guest_reflections_by_guest_id,
    insert_guest_reflection,
    migrate_guest_reflections_to_user,
    delete_orphaned_guest_reflections_older_than,
    cleanup_old_saved_reflections,
    insert_beta_feedback,
    list_beta_feedback_for_user,
    save_mirror_report,
    update_reflection_return_card,
    get_return_card_for_user,
    count_reflections_for_user,
    get_reflections_for_return_card,
)

# So Supabase and Ollama client warnings/errors show in the uvicorn terminal
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("supabase_client").setLevel(logging.WARNING)
logging.getLogger("ollama_client").setLevel(logging.WARNING)

# Route handlers are sync def; FastAPI runs them in a thread pool, so blocking Supabase/LLM calls do not block the event loop.
app = FastAPI(title="REFLECT API", version="0.1.0")

SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

def get_rate_limit_key(request: Request) -> str:
    """Extract user_id from JWT for per-user rate limiting; fall back to IP."""
    try:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1]
            import jwt
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
    except Exception:
        pass
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Personalization refresh: interval in hours (0 = disabled). Default 24.
PERSONALIZATION_REFRESH_INTERVAL_HOURS = float(os.getenv("PERSONALIZATION_REFRESH_INTERVAL_HOURS", "24").strip() or "0")
PERSONALIZATION_REFRESH_INITIAL_DELAY_SEC = 60
CLEANUP_SECRET = os.getenv("CLEANUP_SECRET", "").strip()


def _run_personalization_refresh_all():
    """Background loop: refresh personalization context for all users on an interval."""
    if PERSONALIZATION_REFRESH_INTERVAL_HOURS <= 0:
        return
    interval_sec = max(60, PERSONALIZATION_REFRESH_INTERVAL_HOURS * 3600)
    time.sleep(PERSONALIZATION_REFRESH_INITIAL_DELAY_SEC)
    while True:
        try:
            if get_supabase_status() == "ok":
                n = len(refresh_personalization_context_all(limit_users=200))
                logging.info("Personalization refresh: updated %d users", n)
        except Exception as e:
            logging.warning("Personalization refresh failed: %s", type(e).__name__)
        time.sleep(interval_sec)


def _generate_return_card_background(user_id: str, reflection_id: str):
    """
    Background task: generate a return card after the closing is saved.
    Picks different inputs based on total reflection count.
    """
    try:
        data = get_reflections_for_return_card(user_id)
        total = data.get("total_count", 0)
        reflections = data.get("reflections", [])
        mood_map = data.get("mood_map", {})

        if total < 1 or not reflections:
            return

        current = next((r for r in reflections if r.get("id") == reflection_id), None)
        if not current:
            current = reflections[0] if reflections else None

        def _extract_shaped_by(ref):
            mr = ref.get("mirror_report")
            if isinstance(mr, dict):
                return mr.get("shaped_by", "")
            return ""

        def _extract_archetype_name(ref):
            mr = ref.get("mirror_report")
            if isinstance(mr, dict):
                arch = mr.get("archetype")
                if isinstance(arch, dict):
                    return arch.get("name", "")
            return ""

        context_parts = []

        if total == 1:
            shaped_by = _extract_shaped_by(current) if current else ""
            archetype = _extract_archetype_name(current) if current else ""
            if shaped_by:
                context_parts.append(f"What shaped them: {shaped_by}")
            if archetype:
                context_parts.append(f"Archetype: {archetype}")

        elif total == 2:
            for i, ref in enumerate(reflections[:2]):
                sb = _extract_shaped_by(ref)
                if sb:
                    context_parts.append(f"Reflection {i+1} — what shaped them: {sb}")
            all_moods = [mood_map.get(r.get("id", ""), "") for r in reflections[:2]]
            all_moods = [m for m in all_moods if m]
            if all_moods:
                context_parts.append(f"Mood words: {', '.join(all_moods)}")

        elif total >= 4:
            longest = max(reflections, key=lambda r: len((r.get("thought") or "")))
            longest_thought = (longest.get("thought") or "")[:500]
            current_shaped = _extract_shaped_by(current) if current else ""
            if longest_thought:
                context_parts.append(f"Their most invested reflection: \"{longest_thought}\"")
            if current_shaped:
                context_parts.append(f"Current reflection — what shaped them: {current_shaped}")

        else:
            shaped_by = _extract_shaped_by(current) if current else ""
            archetype = _extract_archetype_name(current) if current else ""
            if shaped_by:
                context_parts.append(f"What shaped them: {shaped_by}")
            if archetype:
                context_parts.append(f"Archetype: {archetype}")

        if not context_parts:
            return

        context = "\n".join(context_parts)
        card_text = generate_return_card(context)
        if card_text:
            update_reflection_return_card(reflection_id, card_text)
            logger.info("return_card_generated user=%s reflection=%s", user_id[:8] + "...", reflection_id)
            # Schedule a reminder 18 hours from now with the card's first line as the notification body
            try:
                remind_at = (datetime.now(timezone.utc) + timedelta(hours=18)).isoformat()
                first_line = card_text.split("\n")[0].strip()[:80]
                insert_revisit_reminder(reflection_id, remind_at, first_line)
            except Exception as re:
                logger.warning("Return card reminder scheduling failed: %s", type(re).__name__)
    except Exception as e:
        logger.warning("Return card background task failed: %s", type(e).__name__)


def _server_error(e: Exception, context: str = "") -> HTTPException:
    """Log the real error server-side, return opaque message to client."""
    logger.exception("Server error%s: %s", f" [{context}]" if context else "", type(e).__name__)
    return HTTPException(
        status_code=500,
        detail="Something went wrong. Please try again later.",
    )


def _require_env(name: str, value: str | None) -> None:
    """Raise RuntimeError if required env var is missing or empty (fail-fast at startup)."""
    if not value or not str(value).strip():
        raise RuntimeError(
            f"REFLECT backend cannot start: required env var {name} is missing or empty. "
            f"Set {name} in backend/.env or your deployment environment."
        )


@app.on_event("startup")
def startup():
    _require_env("SUPABASE_URL", os.getenv("SUPABASE_URL"))
    _require_env("SUPABASE_SERVICE_KEY", os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY"))
    _require_env("SUPABASE_JWT_SECRET", os.getenv("SUPABASE_JWT_SECRET"))
    # ALLOWED_ORIGINS: not required at startup — defaults to http://localhost:3000 for dev; set in production
    llm_provider = (os.getenv("LLM_PROVIDER", "ollama") or "ollama").strip().lower()
    if llm_provider == "openai":
        _require_env("OPENAI_API_KEY", os.getenv("OPENAI_API_KEY"))
    elif llm_provider == "openrouter":
        _require_env("OPENROUTER_API_KEY", os.getenv("OPENROUTER_API_KEY"))

    from llm_provider import LLM_PROVIDER
    logging.info("LLM provider: %s", LLM_PROVIDER)
    # CORS: log allowed origins so production deployers can verify
    logging.info("CORS allowed_origins: %s", ALLOWED_ORIGINS)
    if CORS_ORIGIN_REGEX:
        logging.info("CORS allow_origin_regex: %s", CORS_ORIGIN_REGEX)
    logging.info("ALLOWED_HOSTS: %s", ALLOWED_HOSTS)
    if not os.getenv("ALLOWED_ORIGINS", "").strip():
        logging.warning("ALLOWED_ORIGINS not set; using default http://localhost:3000 — set ALLOWED_ORIGINS in production")
    status = get_supabase_status()
    if status == "ok":
        logging.info("Supabase: configured (reflections will be stored)")
    elif status == "package_missing":
        logging.warning("Supabase: package not installed. Run: pip install supabase (then set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env)")
    else:
        logging.warning("Supabase: NOT configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env to store data")
    if PERSONALIZATION_REFRESH_INTERVAL_HOURS > 0:
        t = threading.Thread(target=_run_personalization_refresh_all, daemon=True)
        t.start()
        logging.info("Personalization auto-refresh: every %.1f hours", PERSONALIZATION_REFRESH_INTERVAL_HOURS)

# CORS: get allowed origins from environment (set ALLOWED_ORIGINS in production)
_origins_raw = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
# Split into exact origins vs wildcard patterns (e.g. https://*.vercel.app)
ALLOWED_ORIGINS = [o for o in _origins_raw if "*" not in o]
# Allow Vercel preview/production: any origin matching https://<anything>.vercel.app
_vercel_pattern = next((o for o in _origins_raw if "*" in o and "vercel.app" in o), None)
CORS_ORIGIN_REGEX = r"https://[a-zA-Z0-9][a-zA-Z0-9-]*\.vercel\.app" if _vercel_pattern else None

# Safety check — never allow wildcard CORS with credentials in production
_env = os.getenv("ENV", "development")
if "*" in ALLOWED_ORIGINS and _env == "production":
    raise RuntimeError(
        "ALLOWED_ORIGINS='*' is not permitted in production. "
        "Set explicit origins in the ALLOWED_ORIGINS env var."
    )
if "*" in ALLOWED_ORIGINS and len(ALLOWED_ORIGINS) > 1:
    raise RuntimeError(
        "Do not mix '*' with specific origins in ALLOWED_ORIGINS."
    )

_cors_kw: dict = {
    "allow_origins": ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if CORS_ORIGIN_REGEX:
    _cors_kw["allow_origin_regex"] = CORS_ORIGIN_REGEX

app.add_middleware(CORSMiddleware, **_cors_kw)

# Trusted hosts — configure via ALLOWED_HOSTS env (required in production: add your backend host, e.g. Railway)
# If the request Host header is not in this list, TrustedHostMiddleware returns 400 (causing OPTIONS to fail).
ALLOWED_HOSTS = [o.strip() for o in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if o.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' https://app.lemonsqueezy.com; "
            "connect-src 'self' https://app.lemonsqueezy.com "
            "https://*.supabase.co https://api.openrouter.ai "
            "https://api.openai.com; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline'; "
            "frame-src https://app.lemonsqueezy.com; "
            "frame-ancestors 'none';",
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)


class ReflectRequest(BaseModel):
    thought: str = Field(..., max_length=5000)
    reflection_mode: str | None = Field(default="gentle", max_length=50)  # "gentle" | "direct" | "quiet"


class MirrorRequest(BaseModel):
    thought: str = Field(..., max_length=5000)
    questions: list[str] = Field(default=[], max_length=10)
    answers: list[str] = Field(default=[], max_length=10)
    reflection_id: str | None = Field(default=None, max_length=100)

    @field_validator("questions")
    @classmethod
    def validate_questions(cls, v: list[str]) -> list[str]:
        for q in v:
            if len(q) > 500:
                raise ValueError("Each question must be under 500 characters")
        return [q.strip() for q in v]

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: list[str]) -> list[str]:
        for a in v:
            if len(a) > 2000:
                raise ValueError("Each answer must be under 2000 characters")
        return [a.strip() for a in v]


class MirrorReportRequest(BaseModel):
    thought: str = Field(..., max_length=5000)
    questions: list[str] = Field(default=[], max_length=10)
    answers: list[str] = Field(default=[], max_length=10)
    reflection_id: str = Field("", max_length=100)
    reflection_mode: str = Field("gentle", max_length=20)

    @field_validator("questions")
    @classmethod
    def validate_questions(cls, v: list[str]) -> list[str]:
        for q in v:
            if len(q) > 500:
                raise ValueError("Each question must be under 500 characters")
        return [q.strip() for q in v]

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: list[str]) -> list[str]:
        for a in v:
            if len(a) > 2000:
                raise ValueError("Each answer must be under 2000 characters")
        return [a.strip() for a in v]


class MoodRequest(BaseModel):
    reflection_id: str = Field(..., max_length=100)
    word_or_phrase: str = Field(..., max_length=200)  # the word or phrase they chose; no scores, no labels
    description: str | None = Field(default=None, max_length=500)  # optional; from the suggestion card when they picked one


class SaveHistoryRequest(BaseModel):
    raw_text: str = Field(..., max_length=50000)
    answers: list[dict] = Field(..., max_length=100)
    mirror_response: str = Field(..., max_length=50000)
    mood_word: str | None = None
    revisit_type: str | None = None


class OpenLaterRequest(BaseModel):
    revisit_at: str | None = None  # ISO timestamp optional


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(None, max_length=200)
    preferences: dict | None = None

    @field_validator("preferences")
    @classmethod
    def preferences_size_limit(cls, v):
        if v is not None:
            import json
            if len(json.dumps(v, default=str)) > 10000:
                raise ValueError("preferences payload too large")
        return v


class MoodSuggestRequest(BaseModel):
    thought: str = Field("", max_length=5000)
    mirror_text: str | None = Field(None, max_length=5000)


class RemindRequest(BaseModel):
    reflection_id: str = Field(..., max_length=100)
    days: int  # 1, 2, 3, or 7


class ClosingRequest(BaseModel):
    thought: str = Field(..., max_length=5000)
    answers: dict | list = Field(..., max_length=100)
    mirror_response: str = Field(..., max_length=3000)
    mood_word: str | None = Field(default=None, max_length=200)
    reflection_id: str | None = Field(default=None, max_length=100)
    reflection_mode: str | None = Field(default="gentle", max_length=50)


class GuestReflection(BaseModel):
    thought: str = Field(max_length=5000)
    mirror: str = Field(default="", max_length=8000)
    mood: str | None = Field(default=None, max_length=200)
    closing: str | None = Field(default=None, max_length=8000)
    created_at: str | None = Field(default=None, max_length=64)


class MigrateGuestRequest(BaseModel):
    guest_id: str = Field("", max_length=100)
    reflections: list[GuestReflection] = Field(default_factory=list, max_items=2)


class GuestSaveRequest(BaseModel):
    guest_id: str = Field(..., min_length=10, max_length=100)
    thought: str = Field(..., max_length=5000)
    sections: list[dict] = Field(..., max_items=10)
    mirror: str = Field("", max_length=3000)
    mood_word: str = Field("", max_length=100)
    closing: str = Field("", max_length=2000)


class BetaFeedbackRequest(BaseModel):
    content: str = Field(..., max_length=10000)


class SyncSubscriptionRequest(BaseModel):
    user_id: str | None = Field(None, max_length=100)


@app.get("/")
def root():
    from llm_provider import LLM_PROVIDER
    return {"app": "REFLECT", "llm_provider": LLM_PROVIDER}


@app.get("/api/health")
def health():
    db_status = get_supabase_status()
    return {
        "status": "ok",
        "database": "ok" if db_status == "ok" else "not_storing",
        "database_reason": (
            "supabase package not installed (pip install supabase)"
            if db_status == "package_missing"
            else "SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env"
            if db_status == "env_missing"
            else None
        ),
    }


@app.get("/api/health/llm")
def health_llm():
    """Optional health check that verifies LLM connectivity. Use for monitoring."""
    try:
        from llm_provider import llm_chat
        response = llm_chat("Say exactly: ok", system="Reply with exactly: ok")
        ok = response and "ok" in (response or "").strip().lower()[:10]
        return {"status": "ok" if ok else "unexpected", "llm": "ok" if ok else "unexpected_response"}
    except Exception as e:
        logging.warning("Health LLM check failed: %s", type(e).__name__)
        return {"status": "unavailable", "llm": "error"}


@app.get("/api/reflections/{reflection_id}")
def get_reflection_route(reflection_id: str, user_id: str = Depends(require_user_id)):
    """Get one reflection by id (for opening from notification or 'come back later'). Returns only if owned by current user."""
    if not reflection_id or not reflection_id.strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    try:
        row = get_reflection_by_id(reflection_id.strip())
        if not row:
            raise HTTPException(status_code=404, detail="Reflection not found")
        if (row.get("user_id") or "").strip() != user_id:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "get_reflection_route")


@app.get("/api/reminders/due")
def reminders_due(user_id: str = Depends(require_user_id)):
    """Get reminders where remind_at <= now, for reflections owned by the current user only."""
    try:
        reminders = get_due_reminders(user_id)
        return {"reminders": reminders}
    except Exception as e:
        raise _server_error(e, "reminders_due")


def _llm_error_message(e: Exception) -> str:
    """Return a user-friendly message for LLM/Ollama errors."""
    err = str(e).lower()
    if "connection" in err or "refused" in err or "connect" in err:
        return "Ollama is not running or not reachable. Start Ollama (e.g. open the app) and run: ollama run qwen"
    if "timeout" in err or "timed out" in err:
        return "Ollama took too long to respond. Try again or check that the model is loaded: ollama run qwen"
    if "not found" in err or "404" in err:
        return "Ollama model not found. Run: ollama run qwen"
    return f"Reflection service error: {e}"


def _activate_trial_if_new(user_id: str) -> None:
    """
    Activate 14-day trial for brand new users. Idempotent.
    Also syncs profiles.plan_type to 'trial'.
    """
    try:
        usage = get_user_usage(user_id)
        if usage:
            current_plan = (usage.get("plan_type") or "trial").strip().lower()
            update_profile_plan(user_id, current_plan)
            return
        now_iso = datetime.now(timezone.utc).isoformat()
        ensure_user_usage_row(user_id, "trial", now_iso, trial_start=now_iso)
        update_profile_plan(user_id, "trial")
    except Exception as e:
        logger.warning("_activate_trial_if_new failed: %s", type(e).__name__)


def get_flow_mode(total_reflections: int, thought_length: int) -> str:
    """Determine flow mode for reflection session based on user history and thought length."""
    # Short thoughts always get questions — mirror needs the Q&A context
    if thought_length < 50:
        return "standard"

    # Sessions 1-2: always standard, no variation yet
    if total_reflections < 3:
        return "standard"

    # Roll first — 65% chance of standard regardless
    # Variation should feel like a surprise, not a pattern
    roll = random.random()
    if roll < 0.65:
        return "standard"

    # Remaining 35% — vary based on session depth
    # Sessions 3-4: deep only, never direct
    if total_reflections < 5:
        return "deep"

    # Sessions 5-9: deep only, not direct yet
    if total_reflections < 10:
        return "deep"

    # Sessions 10+: split remaining 35% between
    # deep (20%) and direct (15%)
    # roll is already between 0.65 and 1.0 here
    if thought_length >= 150:
        if roll < 0.85:   # 0.65–0.85 = 20% of total
            return "deep"
        else:             # 0.85–1.00 = 15% of total
            return "direct"
    else:
        # Thought not long enough for direct —
        # give full 35% to deep
        return "deep"


def _do_reflect(body: ReflectRequest, user_id: str | None = None, background_tasks: BackgroundTasks | None = None):
    """Shared logic for POST /api/reflect (with or without trailing slash)."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")

    if contains_crisis_signal(body.thought):
        return {"crisis": True, "sections": []}

    # Server-side rate limit by subscription tier (JWT user_id only; no trust of frontend)
    if user_id:
        rc = get_rc_subscription_status(user_id)
        plan_type = (rc.get("plan_type") or "trial").strip().lower()
        period_start_rc = rc.get("period_start")
        # Web users subscribe via Lemon Squeezy; RC returns trial. Use user_usage when RC is trial.
        if plan_type == "trial":
            usage_row = get_user_usage(user_id)
            if usage_row:
                stored = (usage_row.get("plan_type") or "").strip().lower()
                if stored in ("monthly", "yearly"):
                    plan_type = stored
                    period_start_rc = usage_row.get("period_start")
        usage_row = enforce_reflection_limit(user_id, plan_type, period_start_rc)
        if usage_row is None:
            return JSONResponse(
                status_code=429,
                content={"error": "Reflection limit reached"},
            )

    user_context = (get_personalization_context(user_id) or {}) if user_id else {}
    pattern_history_data = (get_pattern_history_for_user(user_id, 5) or []) if user_id else []
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        # Validate and pass reflection mode to LLM
        mode = (body.reflection_mode or "gentle").lower()
        if mode not in ("gentle", "direct", "quiet"):
            mode = "gentle"
        sections = get_reflection(safe_thought, reflection_mode=mode, user_context=user_context, pattern_history=pattern_history_data)
        pattern_id = None
        pattern = extract_pattern(safe_thought, sections)
        if pattern and user_id:
            pattern_id = insert_reflection_pattern(
                user_id=user_id,
                emotional_tone=pattern.get("emotional_tone"),
                themes=pattern.get("themes") or [],
                time_orientation=pattern.get("time_orientation"),
                recurring_phrases=pattern.get("recurring_phrases"),
                core_tension=pattern.get("core_tension"),
                unresolved_threads=pattern.get("unresolved_threads"),
                self_beliefs=pattern.get("self_beliefs"),
            )
            if not pattern_id:
                logging.warning("Pattern insert returned None (check Supabase reflection_patterns table)")
        reflection_id = insert_reflection(thought, sections, user_id=user_id, pattern_id=pattern_id)
        if pattern_id and reflection_id:
            update_reflection_pattern_reflection_id(pattern_id, reflection_id)
        if not pattern:
            logging.info("Pattern extraction returned None (LLM may have returned non-JSON)")
        if background_tasks and user_id:
            background_tasks.add_task(refresh_personalization_context_for_user, user_id)
        if user_id:
            logger.info(
                "reflect_success user=%s reflection_id=%s",
                user_id[:8] + "...", reflection_id,
            )

        # Count user's existing reflections (includes this one)
        existing_count = count_reflections_for_user(user_id) if user_id else 0
        thought_word_count = len(thought.strip().split())
        flow_mode = get_flow_mode(existing_count, thought_word_count)

        return {"id": reflection_id, "sections": sections, "flow_mode": flow_mode}
    except HTTPException:
        raise
    except Exception as e:
        if user_id:
            rc = get_rc_subscription_status(user_id)
            plan_type = (rc.get("plan_type") or "trial").strip().lower()
            if plan_type == "trial":
                usage_row = get_user_usage(user_id)
                if usage_row:
                    stored = (usage_row.get("plan_type") or "").strip().lower()
                    if stored in ("monthly", "yearly"):
                        plan_type = stored
            rollback_reflection_usage(user_id, plan_type)
        logging.exception("Reflect failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail=_llm_error_message(e))


@app.get("/api/reflect")
def reflect_get():
    """Help verify the REFLECT backend is running. Use POST with body {"thought": "..."} to get a reflection."""
    return {"message": "REFLECT API. Use POST with body {\"thought\": \"...\"} to get a reflection."}


@app.post("/api/reflect")
@app.post("/api/reflect/")
@limiter.limit("10/hour", key_func=get_rate_limit_key)
def reflect(request: Request, body: ReflectRequest, background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)):
    return _do_reflect(body, user_id=user_id, background_tasks=background_tasks)


@app.post("/api/webhooks/lemon-squeezy")
async def webhook_lemon_squeezy(
    request: Request,
    x_signature: str = Header(None, alias="X-Signature"),
):
    import json
    from supabase_client import update_user_plan, get_user_id_by_email
    from lemon_squeezy_client import parse_subscription_event, parse_order_created

    payload = await request.body()

    # 1. Verify signature
    if not verify_webhook_signature(payload, x_signature or ""):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(payload.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = parse_subscription_event(body)
    if not event:
        event = parse_order_created(body)
    if not event:
        return {"ok": True}

    user_id = (event.get("user_id") or "").strip()
    if not user_id and event.get("user_email"):
        user_id = get_user_id_by_email(event["user_email"])
    event_id = (body.get("meta") or {}).get("event_id", "") or ""
    event_name = event.get("event_name", "")

    if not user_id:
        logger.warning(
            "webhook_no_user_match event=%s event_id=%s email_prefix=%s",
            event_name, event_id, (event.get("user_email") or "")[:3] + "...",
        )
        return {"ok": True, "warning": "no_user_match"}

    # 2. Deduplicate — reject replayed events
    if event_id and is_duplicate_event(event_id):
        return {"ok": True, "skipped": "duplicate"}

    # 3. Process subscription/order change
    user_id = user_id.strip()
    status = event.get("status") or ""
    plan_type = event.get("plan_type") or "monthly"

    try:
        if event_name == "order_created":
            if status == "paid":
                update_user_plan(user_id, plan_type)
                logger.info("LS order_created: updated user %s to plan %s", user_id[:8] + "...", plan_type)
        elif event_name in ("subscription_created", "subscription_updated"):
            if status == "active":
                update_user_plan(user_id, plan_type)
                logger.info("LS %s: updated user %s to plan %s", event_name, user_id[:8] + "...", plan_type)
        elif event_name == "subscription_cancelled":
            if status in ("cancelled", "expired"):
                update_user_plan(user_id, "trial")
                logger.info("LS subscription_cancelled: downgraded user %s to trial", user_id[:8] + "...")

        # ONLY record after successful update — if Supabase fails above, LS will retry
        if event_id:
            record_event(event_id, event_name)

    except Exception as e:
        # ALERT: search Railway logs for "webhook_update_failed" to detect paying users
        # whose plan was not updated. Set up a log-based alert in your Railway log drain
        # (Logtail, Papertrail, or Datadog) on this string.
        logger.exception(
            "webhook_update_failed event=%s event_id=%s user=%s error=%s",
            event_name, event_id, user_id[:8] + "..." if user_id else "none", type(e).__name__,
        )
        raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"ok": True}


@app.post("/api/reflect/guest")
@limiter.limit("3/hour")
def reflect_guest(request: Request, body: ReflectRequest, background_tasks: BackgroundTasks):
    """
    Guest reflection endpoint: no auth, no per-user limits. Uses the same LLM flow
    but skips subscription/usage checks because there is no user_id.
    """
    return _do_reflect(body, user_id=None, background_tasks=None)


@app.post("/api/reflect/guest-save")
@limiter.limit("5/minute")
def save_guest_reflection_route(request: Request, body: GuestSaveRequest):
    """
    Save a completed guest reflection to DB using guest_id.
    No auth. Max 2 guest reflections per guest_id enforced here.
    """
    guest_id = body.guest_id.strip()
    if count_guest_reflections_by_guest_id(guest_id) >= 2:
        raise HTTPException(status_code=429, detail="Guest reflection limit reached")
    try:
        rid = insert_guest_reflection(
            guest_id=guest_id,
            thought=body.thought,
            sections=body.sections,
            personalized_mirror=body.mirror or "",
            closing_text=(body.closing or "").strip() or None,
        )
        if not rid:
            raise _server_error(Exception("Insert returned None"), "guest-save-insert")
        return {"id": rid, "guest_id": guest_id}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "guest-save-insert")


@app.post("/api/migrate-guest-reflections")
@limiter.limit("5/minute")
def migrate_guest_reflections(request: Request, body: MigrateGuestRequest, user_id: str = Depends(require_user_id)):
    """
    Migrate guest reflections to authenticated user.
    Path 1: by guest_id from DB. Path 2: fallback to body.reflections (localStorage).
    Idempotent. Activates trial if new user.
    """
    migrated = 0
    if body.guest_id and body.guest_id.strip():
        try:
            migrated = migrate_guest_reflections_to_user(body.guest_id.strip(), user_id)
        except Exception as e:
            logger.warning("Guest DB migration failed: %s", type(e).__name__)
    if migrated == 0 and body.reflections:
        refs = body.reflections[:2]
        for ref in refs:
            try:
                raw_text = (ref.thought or "").strip()
                mirror_text = (ref.mirror or "").strip()
                mood_word = (ref.mood or "").strip() or None
                if not raw_text and not mirror_text:
                    continue
                inserted_id = insert_saved_reflection(
                    user_identifier=user_id,
                    raw_text=raw_text,
                    answers=[],
                    mirror_response=mirror_text,
                    mood_word=mood_word,
                    revisit_type=None,
                )
                if inserted_id:
                    migrated += 1
            except Exception as e:
                logger.warning("migrate_guest_reflections insert failed for %s: %s", user_id, type(e).__name__)
    try:
        _activate_trial_if_new(user_id)
    except Exception as e:
        logger.warning("Trial activation failed: %s", type(e).__name__)
    return {"migrated": migrated}


@app.post("/api/mirror/personalized")
@limiter.limit("20/hour", key_func=get_rate_limit_key)
def mirror_personalized(request: Request, body: MirrorRequest, user_id: str = Depends(require_user_id)):
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if contains_crisis_signal(body.thought):
        return {"crisis": True, "content": ""}
    user_context = get_personalization_context(user_id) or {}
    pattern_history_data = get_pattern_history_for_user(user_id, 5) or []
    if body.reflection_id:
        ref_row = get_reflection_by_id(body.reflection_id.strip())
        if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
            raise HTTPException(status_code=404, detail="Reflection not found")
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        questions = body.questions
        answers = body.answers if isinstance(body.answers, list) else [body.answers.get(q, body.answers.get(str(i), "")) for i, q in enumerate(questions)]
        content = get_personalized_mirror(safe_thought, questions, answers, user_context=user_context, pattern_history=pattern_history_data)
        if body.reflection_id:
            update_reflection(body.reflection_id, questions, answers, content)
        return {"content": content}
    except Exception as e:
        raise _server_error(e, "mirror/personalized")


@app.post("/api/mirror/report")
@limiter.limit("10/hour", key_func=get_rate_limit_key)
def mirror_report(
    request: Request,
    body: MirrorReportRequest,
    user_id: str = Depends(require_user_id),
):
    """
    Generate the 4-slide mirror report.
    Called after user answers questions.
    Replaces the old personalized mirror statement entirely.
    """
    thought = (body.thought or "").strip()
    if not thought:
        raise HTTPException(status_code=400, detail="Thought is required")

    if contains_crisis_signal(thought):
        return {"crisis": True, "sections": [], "content": "", "closing_text": ""}

    safe_thought = sanitize_for_llm(thought)

    try:
        user_context = get_personalization_context(user_id) or {}
    except Exception:
        user_context = {}

    try:
        pattern_history = get_pattern_history_for_user(user_id, limit=5)
    except Exception:
        pattern_history = []

    # Log whether pattern/personalization is being used (for mirror report)
    themes = user_context.get("recurring_themes") or []
    n_patterns = len(pattern_history or [])
    if themes or n_patterns:
        logging.info(
            "Mirror report: using pattern reflection (recurring_themes=%d, pattern_history_entries=%d)",
            len(themes),
            n_patterns,
        )
    else:
        logging.info("Mirror report: no personalization context (new user or no history yet)")

    # Ownership check if reflection_id provided
    if body.reflection_id:
        ref_row = get_reflection_by_id(body.reflection_id.strip())
        if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
            raise HTTPException(status_code=404, detail="Reflection not found")

    try:
        report = get_mirror_report(
            thought=safe_thought,
            questions=body.questions,
            answers=body.answers,
            user_context=user_context,
            pattern_history=pattern_history,
        )

        # Persist questions, answers, and mirror content to the reflection row (so they appear in the table)
        if body.reflection_id and (body.reflection_id or "").strip():
            rid = body.reflection_id.strip()
            # Build a single string for personalized_mirror from the report (existing column)
            mirror_parts = []
            if isinstance(report, dict):
                arch = report.get("archetype") or {}
                if isinstance(arch, dict) and arch.get("name"):
                    mirror_parts.append(f"Archetype: {arch.get('name')}.")
                if report.get("shaped_by"):
                    mirror_parts.append(f"Shaped by: {report['shaped_by']}")
                if report.get("costing_you"):
                    mirror_parts.append(f"Costing you: {report['costing_you']}")
                if report.get("question"):
                    mirror_parts.append(f"Question: {report['question']}")
            personalized_mirror_str = " ".join(mirror_parts) if mirror_parts else ""
            answers_list = body.answers if isinstance(body.answers, list) else list((body.answers or {}).values()) if isinstance(body.answers, dict) else []
            try:
                update_reflection(rid, body.questions or [], answers_list, personalized_mirror_str or "")
            except Exception as e:
                logging.warning("Failed to save questions/answers/mirror to reflection: %s", type(e).__name__)
            # Optionally save full report JSON if mirror_report column exists (see reflections_mirror_report_migration.sql)
            if report:
                try:
                    save_mirror_report(rid, report)
                except Exception as e:
                    logging.warning("Failed to save mirror report: %s", type(e).__name__)

        return report
    except Exception as e:
        raise _server_error(e, "mirror-report")


@app.post("/api/mirror/report/guest")
@limiter.limit("3/hour")
def mirror_report_guest(
    request: Request,
    body: MirrorReportRequest,
):
    """
    Generate the 4-slide mirror report for guest users.
    No auth required. No personalization history.
    Same response shape as /api/mirror/report.
    """
    thought = (body.thought or "").strip()
    if not thought:
        raise HTTPException(status_code=400, detail="Thought is required")

    if contains_crisis_signal(thought):
        return {"crisis": True, "sections": [], "content": "", "closing_text": ""}

    safe_thought = sanitize_for_llm(thought)

    try:
        report = get_mirror_report(
            thought=safe_thought,
            questions=body.questions,
            answers=body.answers,
            user_context=None,
            pattern_history=None,
        )
        return report
    except Exception as e:
        raise _server_error(e, "mirror-report-guest")


@app.post("/api/mirror/personalized/guest")
@limiter.limit("10/minute")
def mirror_personalized_guest(request: Request, body: MirrorRequest):
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if contains_crisis_signal(body.thought):
        return {"crisis": True, "content": ""}
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        questions = body.questions
        answers = body.answers if isinstance(body.answers, list) else [body.answers.get(q, body.answers.get(str(i), "")) for i, q in enumerate(questions)]
        content = get_personalized_mirror(safe_thought, questions, answers, user_context={})
        return {"content": content}
    except Exception as e:
        raise _server_error(e, "mirror/personalized/guest")


@app.post("/api/closing")
@limiter.limit("20/hour", key_func=get_rate_limit_key)
def closing(request: Request, body: ClosingRequest, background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)):
    """Generate closing moment with named truth + open thread. Updates reflection with closing_text if reflection_id provided."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if not (body.mirror_response or "").strip():
        raise HTTPException(status_code=400, detail="mirror_response is required")
    if contains_crisis_signal(body.thought):
        return {"crisis": True, "sections": [], "content": "", "closing_text": ""}
    user_context = get_personalization_context(user_id) or {}
    pattern_history_data = get_pattern_history_for_user(user_id, 5) or []
    # Log whether pattern/personalization is being used (for closing)
    themes = user_context.get("recurring_themes") or []
    n_patterns = len(pattern_history_data)
    if themes or n_patterns:
        logging.info(
            "Closing: using pattern reflection (recurring_themes=%d, pattern_history_entries=%d)",
            len(themes),
            n_patterns,
        )
    else:
        logging.info("Closing: no personalization context (new user or no history yet)")
    mirror_report_context: str | None = None
    if body.reflection_id:
        ref_row = get_reflection_by_id(body.reflection_id.strip())
        if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
            raise HTTPException(status_code=404, detail="Reflection not found")
        mirror_report = ref_row.get("mirror_report")
        if mirror_report:
            try:
                mirror_report_context = json.dumps(mirror_report)
            except TypeError:
                mirror_report_context = str(mirror_report)
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        mirror = body.mirror_response.strip()
        mood_word = (body.mood_word or "").strip() or None
        mode = body.reflection_mode or "gentle"

        closing_text = get_closing(
            safe_thought,
            body.answers,
            mirror,
            mood_word,
            mode,
            user_context=user_context,
            pattern_history=pattern_history_data,
            mirror_report_context=mirror_report_context,
        )
        
        if body.reflection_id:
            update_reflection_closing(body.reflection_id, closing_text)
            background_tasks.add_task(
                _generate_return_card_background, user_id, body.reflection_id
            )
        
        return {"closing_text": closing_text}
    except Exception as e:
        raise _server_error(e, "closing")


@app.post("/api/closing/guest")
@limiter.limit("10/minute")
def closing_guest(request: Request, body: ClosingRequest):
    """Guest closing: no auth, no reflection DB updates."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if not (body.mirror_response or "").strip():
        raise HTTPException(status_code=400, detail="mirror_response is required")
    if contains_crisis_signal(body.thought):
        return {"crisis": True, "sections": [], "content": "", "closing_text": ""}
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        mirror = body.mirror_response.strip()
        mood_word = (body.mood_word or "").strip() or None
        mode = body.reflection_mode or "gentle"
        closing_text = get_closing(
            safe_thought,
            body.answers,
            mirror,
            mood_word,
            mode,
            user_context={},
            pattern_history=None,
            mirror_report_context=None,
        )
        return {"closing_text": closing_text}
    except Exception as e:
        raise _server_error(e, "closing/guest")


@app.post("/api/remind")
@limiter.limit("10/minute")
def remind(request: Request, body: RemindRequest, user_id: str = Depends(require_user_id)):
    """Set a gentle reminder to revisit this reflection in X days. Schedule via code; LLM helps with wording only."""
    if not (body.reflection_id or "").strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    days = max(1, min(7, body.days))  # clamp 1–7
    reflection = get_reflection_by_id(body.reflection_id.strip())
    if not reflection or (reflection.get("user_id") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reflection not found")
    remind_at = datetime.now(timezone.utc) + timedelta(days=days)
    remind_at_iso = remind_at.isoformat()
    message = None
    try:
        thought = (reflection.get("thought") or "").strip() if reflection else None
        mirror = (reflection.get("personalized_mirror") or "").strip() if reflection else None
        mirror_snippet = mirror[:200] if mirror else None
        safe_thought = sanitize_for_llm(thought or "")
        safe_mirror = sanitize_for_llm(mirror_snippet or "")
        message = get_reminder_message(thought=safe_thought, mirror_snippet=safe_mirror)
    except Exception as e:
        logging.warning("Reminder message generation failed, using fallback: %s", type(e).__name__)
    try:
        reminder_id = insert_revisit_reminder(body.reflection_id.strip(), remind_at_iso, message=message)
        return {"id": reminder_id, "remind_at": remind_at_iso, "message": message or None}
    except Exception as e:
        raise _server_error(e, "remind")


@app.delete("/api/reminders/{reminder_id}")
def reminder_delete(reminder_id: str, user_id: str = Depends(require_user_id)):
    """Mark a reminder as consumed (e.g. user opened the reflection). Time-based trigger uses DB; delete after open."""
    if not reminder_id or not reminder_id.strip():
        raise HTTPException(status_code=400, detail="reminder_id is required")
    reminder = get_reminder_by_id(reminder_id.strip())
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    reflection = get_reflection_by_id(reminder.get("reflection_id") or "") if reminder.get("reflection_id") else None
    if not reflection or (reflection.get("user_id") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    try:
        ok = delete_reminder(reminder_id.strip())
        if not ok:
            raise HTTPException(status_code=404, detail="Reminder not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "reminder_delete")


@app.post("/api/mood/suggest")
@limiter.limit("20/hour")
def mood_suggest(request: Request, body: MoodSuggestRequest, user_id: str = Depends(require_user_id)):
    """Suggest 4–5 metaphor phrases with descriptions from thought + mirror. Not judging—offering language they might borrow."""
    thought = (body.thought or "").strip()
    mirror_text = (body.mirror_text or "").strip() or None
    try:
        suggestions = get_mood_suggestions(thought, mirror_text)
        return {"suggestions": suggestions}
    except Exception as e:
        raise _server_error(e, "mood/suggest")


@app.post("/api/mood/suggest/guest")
@limiter.limit("10/minute")
def mood_suggest_guest(request: Request, body: MoodSuggestRequest):
    """Guest version of mood suggestions: no auth, no personalization context."""
    thought = (body.thought or "").strip()
    mirror_text = (body.mirror_text or "").strip() or None
    try:
        suggestions = get_mood_suggestions(thought, mirror_text)
        return {"suggestions": suggestions}
    except Exception as e:
        raise _server_error(e, "mood/suggest/guest")


@app.post("/api/mood")
@limiter.limit("30/hour", key_func=get_rate_limit_key)
def mood(request: Request, body: MoodRequest, user_id: str = Depends(require_user_id)):
    """Store a mood check-in: word/phrase, optional description, linked to reflection. No scores, no labels."""
    if not (body.word_or_phrase or "").strip():
        raise HTTPException(status_code=400, detail="word_or_phrase is required")
    if not (body.reflection_id or "").strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    ref_row = get_reflection_by_id(body.reflection_id.strip())
    if not ref_row or (ref_row.get("user_id") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reflection not found")
    try:
        description = (body.description or "").strip() or None
        checkin_id = insert_mood_checkin(
            body.reflection_id.strip(),
            body.word_or_phrase.strip(),
            description=description,
        )
        return {"id": checkin_id}
    except Exception as e:
        raise _server_error(e, "mood")


# ----- Saved reflections (history + open later) -----

@app.post("/api/history")
@limiter.limit("30/hour")
def history_save(request: Request, body: SaveHistoryRequest, background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)):
    """Save a completed reflection to history. status='normal' by default."""
    if not (body.raw_text or "").strip():
        raise HTTPException(status_code=400, detail="raw_text is required")
    if not (body.mirror_response or "").strip():
        raise HTTPException(status_code=400, detail="mirror_response is required")
    try:
        revisit = (body.revisit_type or "").strip() or None
        if revisit not in ("come_back", "remind"):
            revisit = None
        saved_id = insert_saved_reflection(
            user_identifier=user_id,
            raw_text=body.raw_text.strip(),
            answers=body.answers if isinstance(body.answers, list) else [],
            mirror_response=body.mirror_response.strip(),
            mood_word=(body.mood_word or "").strip() or None,
            revisit_type=revisit,
        )
        if not saved_id:
            raise HTTPException(
                status_code=502,
                detail="Could not save reflection. Please try again.",
            )
        background_tasks.add_task(refresh_personalization_context_for_user, user_id)
        return {"id": saved_id}
    except Exception as e:
        raise _server_error(e, "history_save")


@app.get("/api/history/waiting")
def history_waiting(user_id: str = Depends(require_user_id)):
    """List saved reflections with status='waiting' (open later). Cleans up items not revisited in 7 days."""
    try:
        items = list_saved_reflections_waiting(user_id)
        return {"items": items}
    except Exception as e:
        raise _server_error(e, "history_waiting")


@app.get("/api/history")
def history_all(user_id: str = Depends(require_user_id)):
    """List all saved reflections for this user, created_at DESC."""
    try:
        items = list_saved_reflections_all(user_id)
        return {"items": items}
    except Exception as e:
        raise _server_error(e, "history_all")


@app.get("/api/history/{saved_id}")
def history_get_one(saved_id: str, user_id: str = Depends(require_user_id)):
    """Get one saved reflection by id. Must belong to current user."""
    try:
        row = get_saved_reflection_by_id(saved_id)
        if not row:
            raise HTTPException(status_code=404, detail="Reflection not found")
        if (row.get("user_identifier") or "").strip() != user_id:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "history_get_one")


def _check_saved_reflection_owner(saved_id: str, user_id: str) -> None:
    row = get_saved_reflection_by_id(saved_id)
    if not row or (row.get("user_identifier") or "").strip() != user_id:
        raise HTTPException(status_code=404, detail="Reflection not found")


@app.patch("/api/history/{saved_id}/open-later")
def history_open_later(saved_id: str, body: OpenLaterRequest, user_id: str = Depends(require_user_id)):
    """Mark a saved reflection as 'open later' (status='waiting'), optionally set revisit_at."""
    _check_saved_reflection_owner(saved_id, user_id)
    try:
        ok = update_saved_reflection_open_later(saved_id, revisit_at=(body.revisit_at or "").strip() or None)
        if not ok:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "history_open_later")


@app.patch("/api/history/{saved_id}/remove-open-later")
def history_remove_open_later(saved_id: str, user_id: str = Depends(require_user_id)):
    """Remove from open later (status='normal', clear revisit_at)."""
    _check_saved_reflection_owner(saved_id, user_id)
    try:
        ok = update_saved_reflection_remove_open_later(saved_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "history_remove_open_later")


@app.patch("/api/history/{saved_id}/mark-opened")
def history_mark_opened(saved_id: str, user_id: str = Depends(require_user_id)):
    """Mark this saved reflection as opened (viewed) by the user. Sets opened_at to now."""
    _check_saved_reflection_owner(saved_id, user_id)
    try:
        ok = mark_saved_reflection_opened(saved_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "history_mark_opened")


# ----- User profile (name, email, preferences for personalization) -----

@app.get("/api/user/profile")
def user_profile_get(user_id: str = Depends(require_user_id)):
    """Get current user's profile. Returns 404 if no profile row yet (call sync to create from Auth)."""
    profile = get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Call POST /api/user/profile/sync to create from Auth.")
    return profile


@app.patch("/api/user/profile")
def user_profile_update(body: ProfileUpdateRequest, user_id: str = Depends(require_user_id)):
    """Update display_name and/or preferences. Email is synced from Auth only."""
    current = get_profile(user_id)
    if not current:
        raise HTTPException(status_code=404, detail="Profile not found. Call POST /api/user/profile/sync first.")
    display_name = (body.display_name or "").strip() or None if body.display_name is not None else current.get("display_name")
    preferences = body.preferences if body.preferences is not None else (current.get("preferences") or {})
    if not isinstance(preferences, dict):
        preferences = {}
    updated = upsert_profile(user_id, email=current.get("email"), display_name=display_name, preferences=preferences)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    return updated


@app.get("/api/usage")
def usage_get(user_id: str = Depends(require_user_id)):
    """
    Return current usage/plan state for this user.
    plan_type: 'trial' | 'monthly' | 'yearly'
    trial_expires_at: trial_start + 14 days (ISO) for trial users.
    """
    from datetime import timedelta
    from usage_limits import TRIAL_DAYS

    row = get_user_usage(user_id) or {}
    plan_type = (row.get("plan_type") or "trial").strip().lower()
    reflections_used = int(row.get("reflections_used") or 0)

    trial_start_raw = row.get("trial_start") or row.get("period_start")
    trial_start_iso = None
    trial_expires_at = None
    days_remaining = None
    is_expired = False

    if plan_type == "trial" and trial_start_raw:
        try:
            if isinstance(trial_start_raw, str):
                ts = datetime.fromisoformat(str(trial_start_raw).replace("Z", "+00:00"))
            else:
                ts = trial_start_raw
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            trial_start_iso = ts.isoformat()
            expires = ts + timedelta(days=TRIAL_DAYS)
            trial_expires_at = expires.isoformat()
            now = datetime.now(timezone.utc)
            is_expired = now >= expires
            days_remaining = max(0, (expires.date() - now.date()).days)
        except Exception as e:
            logging.debug("usage_get trial parse failed for %s: %s", user_id, e)

    return {
        "plan_type": plan_type,
        "reflections_used": reflections_used,
        "trial_start": trial_start_iso,
        "trial_expires_at": trial_expires_at,
        "days_remaining": days_remaining,
        "is_expired": is_expired,
        "is_subscribed": plan_type in ("monthly", "yearly"),
    }


@app.post("/api/user/profile/sync")
def user_profile_sync(user_id: str = Depends(require_user_id)):
    """Sync profile from Supabase Auth (email, name from user_metadata). Creates or updates profile row."""
    profile = sync_profile_from_auth(user_id)
    if not profile:
        raise HTTPException(status_code=500, detail="Failed to sync profile from Auth")
    try:
        refresh_personalization_context_for_user(user_id)
    except Exception:
        pass
    return profile


@app.get("/api/user/reflected-today")
def user_reflected_today(user_id: str = Depends(require_user_id)):
    """Check if user has saved a reflection today (UTC). For daily reminder nudge logic."""
    today_utc = datetime.now(timezone.utc).date().isoformat()
    since = f"{today_utc}T00:00:00Z"
    items = list_saved_reflections_since(user_id, since)
    return {"reflected_today": len(items) > 0}


@app.get("/api/user/return-card")
def user_return_card(user_id: str = Depends(require_user_id)):
    """
    Get the most recent unseen return card for this user.
    Returns {has_card, card_text, reflection_id, reflection_date, total_reflections}.
    The frontend tracks seen cards via localStorage.
    """
    total = count_reflections_for_user(user_id)
    if total < 2:
        return {"has_card": False}

    card_row = get_return_card_for_user(user_id)
    if not card_row or not card_row.get("return_card"):
        return {"has_card": False}

    return {
        "has_card": True,
        "card_text": card_row["return_card"],
        "reflection_id": card_row["id"],
        "reflection_date": card_row.get("created_at", ""),
        "total_reflections": total,
    }


@app.delete("/api/user/account")
@limiter.limit("3/day", key_func=get_rate_limit_key)
def user_account_delete(request: Request, user_id: str = Depends(require_user_id)):
    """Permanently delete all user data and the auth account (GDPR-style account deletion). Irreversible."""
    ok = delete_user_data(user_id, delete_auth_user=True)
    if not ok:
        raise HTTPException(status_code=500, detail="Account deletion failed. Please try again or contact support.")
    return {"ok": True, "message": "Account and all data have been permanently deleted."}


# ----- Personalization context (for emails; derived from patterns + mood + activity) -----

@app.post("/api/personalization/refresh")
def personalization_refresh(user_id: str = Depends(require_user_id)):
    """Refresh this user's personalization context from saved_reflections and reflection patterns. Returns updated context."""
    ctx = refresh_personalization_context_for_user(user_id)
    if not ctx:
        raise HTTPException(status_code=500, detail="Failed to refresh personalization context")
    return ctx


@app.post("/api/personalization/refresh-all")
def personalization_refresh_all(
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """
    Refresh personalization context for all users with saved_reflections. For cron jobs.
    Requires PERSONALIZATION_CRON_SECRET in env; send it in header X-Cron-Secret only (not in query string).
    """
    expected = os.getenv("PERSONALIZATION_CRON_SECRET", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="PERSONALIZATION_CRON_SECRET not configured")
    token = (x_cron_secret or "").strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing secret")
    try:
        updated = refresh_personalization_context_all(limit_users=200)
        return {"updated": len(updated), "user_ids": updated}
    except Exception as e:
        logging.exception("Refresh all personalization failed: %s", type(e).__name__)
        raise _server_error(e, "personalization_refresh_all")


@app.delete("/api/admin/cleanup-guest-reflections")
@limiter.limit("10/minute")
def cleanup_guest_reflections(
    request: Request,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """Remove guest reflections older than 7 days that were never migrated."""
    expected = os.getenv("CRON_SECRET", "")
    if not expected or (x_cron_secret or "") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        deleted = delete_orphaned_guest_reflections_older_than(7)
        logger.info("Cleaned up %d orphaned guest reflections", deleted)
        return {"deleted": deleted}
    except Exception as e:
        raise _server_error(e, "cleanup-guest-reflections")


@app.post("/api/admin/cleanup-old-saved-reflections")
@limiter.limit("10/minute")
def admin_cleanup_old_saved_reflections(
    request: Request,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """Manually run cleanup of saved_reflections older than 7 days. Admin-only (X-Cron-Secret)."""
    expected = os.getenv("CRON_SECRET", "")
    if not expected or (x_cron_secret or "") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        cleanup_old_saved_reflections()
        return {"status": "ok"}
    except Exception as e:
        raise _server_error(e, "cleanup-old-saved-reflections")


@app.post("/api/admin/sync-subscription")
@limiter.limit("10/minute")
def admin_sync_subscription(
    request: Request,
    body: SyncSubscriptionRequest,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """
    Compare Lemon Squeezy subscription status with user_usage.plan_type and repair mismatches.
    Admin-only (X-Cron-Secret). Body: {} for all users, or {"user_id": "..."} for one user.
    """
    expected = os.getenv("CRON_SECRET", "")
    if not expected or (x_cron_secret or "") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        if body.user_id and str(body.user_id).strip():
            user_ids = [str(body.user_id).strip()]
        else:
            user_ids = list_user_usage_user_ids()
        checked = 0
        repaired = 0
        details = []
        for uid in user_ids:
            profile = get_profile(uid) if uid else None
            email = (profile or {}).get("email") if profile else None
            if not email or not str(email).strip():
                details.append({"user_id": uid[:8] + "...", "result": "no_email"})
                continue
            ls_plan, ls_status = fetch_subscription_plan_by_email(str(email).strip())
            usage_row = get_user_usage(uid)
            stored_plan = (usage_row or {}).get("plan_type") or "trial"
            stored_plan = str(stored_plan).strip().lower()
            checked += 1
            if ls_status == "active" and ls_plan:
                expected_plan = ls_plan.strip().lower()
                if stored_plan != expected_plan:
                    update_user_plan(uid, expected_plan)
                    repaired += 1
                    details.append({"user_id": uid[:8] + "...", "result": "repaired", "from": stored_plan, "to": expected_plan})
                else:
                    details.append({"user_id": uid[:8] + "...", "result": "ok"})
            else:
                if stored_plan not in ("trial", "guest"):
                    update_user_plan(uid, "trial")
                    repaired += 1
                    details.append({"user_id": uid[:8] + "...", "result": "repaired", "from": stored_plan, "to": "trial"})
                else:
                    details.append({"user_id": uid[:8] + "...", "result": "ok"})
        return {"checked": checked, "repaired": repaired, "details": details}
    except Exception as e:
        raise _server_error(e, "sync-subscription")


@app.post("/api/internal/cleanup-guests")
async def cleanup_guests(request: Request):
    # Verify a secret token to prevent abuse
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {CLEANUP_SECRET}":
        raise HTTPException(status_code=401)

    deleted = delete_orphaned_guest_reflections_older_than(days=3)
    return {"status": "ok", "deleted": deleted}


# ----- Beta feedback -----

@app.post("/api/beta-feedback")
@limiter.limit("10/minute")
def beta_feedback_submit(request: Request, body: BetaFeedbackRequest, user_id: str = Depends(require_user_id)):
    """Submit beta feedback (notepad-style). Saved per user."""
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    try:
        fid = insert_beta_feedback(user_id, content)
        if not fid:
            raise _server_error(Exception("Insert returned None"), "beta-feedback")
        return {"id": fid}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "beta-feedback")


@app.get("/api/beta-feedback")
def beta_feedback_list(user_id: str = Depends(require_user_id)):
    """List current user's beta feedback entries, newest first."""
    try:
        items = list_beta_feedback_for_user(user_id, limit=50)
        return {"items": items}
    except Exception as e:
        raise _server_error(e, "beta-feedback-list")


# ----- Insights (optional, user-initiated) -----

def _current_5day_period() -> tuple[str, str, bool, int]:
    """
    Current 5-day period info.
    Returns: (period_start, period_end, is_complete, days_remaining)
    - is_complete: True if today is past the period_end
    - days_remaining: days until period ends (0 if complete)
    """
    from datetime import date
    today = date.today()
    # 5-day periods: every 5 days from a fixed anchor (Jan 1)
    days_since_anchor = (today - date(today.year, 1, 1)).days
    period_start_offset = (days_since_anchor // 5) * 5
    period_start = date(today.year, 1, 1) + timedelta(days=period_start_offset)
    period_end = period_start + timedelta(days=4)
    is_complete = today > period_end
    days_remaining = max(0, (period_end - today).days + 1) if not is_complete else 0
    return period_start.isoformat(), period_end.isoformat(), is_complete, days_remaining


def _last_completed_5day_period() -> tuple[str, str]:
    """Get the most recently completed 5-day period."""
    from datetime import date
    today = date.today()
    days_since_anchor = (today - date(today.year, 1, 1)).days
    current_period_start_offset = (days_since_anchor // 5) * 5
    # Go back one period to get the last completed one
    last_period_start_offset = current_period_start_offset - 5
    if last_period_start_offset < 0:
        # Handle start of year - go to previous year's last period
        last_year = today.year - 1
        days_in_last_year = (date(today.year, 1, 1) - date(last_year, 1, 1)).days
        last_period_start_offset = ((days_in_last_year - 1) // 5) * 5
        period_start = date(last_year, 1, 1) + timedelta(days=last_period_start_offset)
    else:
        period_start = date(today.year, 1, 1) + timedelta(days=last_period_start_offset)
    period_end = period_start + timedelta(days=4)
    return period_start.isoformat(), period_end.isoformat()


def _build_reflections_summary(reflections: list[dict], max_items: int = 20) -> str:
    """Build summary text from reflections for LLM input."""
    parts = []
    for r in reflections[:max_items]:
        raw = (r.get("raw_text") or "").strip()
        mirror = (r.get("mirror_response") or "").strip()
        mood = (r.get("mood_word") or "").strip()
        if raw:
            parts.append(f"Thought: {raw[:400]}")
        if mirror:
            parts.append(f"Mirror: {mirror[:400]}")
        if mood:
            parts.append(f"Mood: {mood}")
    return "\n\n".join(parts) if parts else ""


@app.get("/api/insights/letter")
@limiter.limit("5/hour", key_func=get_rate_limit_key)
def insights_letter(request: Request, user_id: str = Depends(require_user_id)):
    """
    Personal insight letter ("A letter to you:"). 
    - Letter generates only after a 5-day period is complete
    - If period not complete, returns too_early=True with days_remaining
    - Uses reflections from that 5-day period (0 to many)
    """
    uid = user_id[:128]  # Limit length for safety
    
    # Check if current period is complete
    current_start, current_end, is_complete, days_remaining = _current_5day_period()
    
    # Check if user has ANY prior letter (meaning they've completed at least one cycle)
    # If not, and current period isn't complete, show "too early" message
    try:
        # Try to get the last completed period's letter
        last_period_start, last_period_end = _last_completed_5day_period()
        existing_last = get_weekly_insight_by_week(uid, last_period_start)
        
        # If we have a letter from the last completed period, return it immediately (fast path)
        if existing_last and (existing_last.get("content") or "").strip():
            return {
                "content": existing_last["content"].strip(),
                "period_start": last_period_start,
                "period_end": last_period_end,
                "too_early": False,
            }
        
        # No existing letter - check if we should generate one or show "too early"
        # Generate a letter for the last completed period
        period_start_dt = datetime.fromisoformat(last_period_start + "T00:00:00").replace(tzinfo=timezone.utc)
        reflections = list_saved_reflections_since(uid, period_start_dt.isoformat())
        # Filter to only those within the last completed period
        period_reflections = [r for r in reflections if r.get("created_at", "")[:10] <= last_period_end]
        reflection_count = len(period_reflections)
        
        # Check if this is user's first time and they have no reflections yet
        # In this case, show "too early" for the current period
        all_reflections = list_saved_reflections_since(uid, (datetime.now(timezone.utc) - timedelta(days=30)).isoformat())
        if not all_reflections:
            # Brand new user with no reflections - tell them to come back
            return {
                "content": None,
                "period_start": current_start,
                "period_end": current_end,
                "reflection_count": 0,
                "too_early": True,
                "days_remaining": days_remaining,
                "message": "Your first letter will be ready after you complete a 5-day reflection period."
            }
        
        # User has some reflections, generate a letter for the last completed period
        # Check again for existing letter (race condition protection)
        existing_check = get_weekly_insight_by_week(uid, last_period_start)
        if existing_check and (existing_check.get("content") or "").strip():
            return {
                "content": existing_check["content"].strip(),
                "period_start": last_period_start,
                "period_end": last_period_end,
                "too_early": False,
            }
        
        # Use deep pattern analysis (3-stage LLM)
        analysis_result = analyze_patterns_deep_sync(
            reflections=period_reflections,
            llm_chat_fn=llm_chat,
            min_reflections=3
        )
        
        content = analysis_result.get("letter", "")
        core_pattern = analysis_result.get("core_pattern")
        situations = analysis_result.get("situations", [])
        analysis_depth = analysis_result.get("analysis_depth", "shallow")
        
        # Try to insert (may fail if another request inserted first - that's okay)
        try:
            insert_weekly_insight(uid, last_period_start, content)
        except Exception:
            pass  # Ignore duplicate insert errors
        
        return {
            "content": content,
            "period_start": last_period_start,
            "period_end": last_period_end,
            "reflection_count": reflection_count,
            "too_early": False,
            "core_pattern": core_pattern,
            "situations": situations[:3] if situations else [],  # Top 3 situations
            "analysis_depth": analysis_depth,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Insights letter failed: %s", type(e).__name__)
        raise _server_error(e, "insights_letter")


# Keep /api/insights/weekly as alias for backwards compatibility
@app.get("/api/insights/weekly")
@limiter.limit("5/hour", key_func=get_rate_limit_key)
def insights_weekly(request: Request, user_id: str = Depends(require_user_id)):
    """Alias for /api/insights/letter for backwards compatibility."""
    return insights_letter(request, user_id)


@app.post("/api/insights/generate-letter")
@limiter.limit("2/hour", key_func=get_rate_limit_key)
def insights_generate_letter(request: Request, user_id: str = Depends(require_user_id)):
    """
    Force regenerate insight letter for the last completed period.
    """
    uid = user_id[:128]  # Limit length for safety
    
    # Use last completed period
    last_period_start, last_period_end = _last_completed_5day_period()
    
    try:
        delete_weekly_insight(uid, last_period_start)
        
        # Get reflections for that period
        period_start_dt = datetime.fromisoformat(last_period_start + "T00:00:00").replace(tzinfo=timezone.utc)
        reflections = list_saved_reflections_since(uid, period_start_dt.isoformat())
        # Filter to only those within the period
        period_reflections = [r for r in reflections if r.get("created_at", "")[:10] <= last_period_end]
        
        # Use deep pattern analysis (3-stage LLM)
        analysis_result = analyze_patterns_deep_sync(
            reflections=period_reflections,
            llm_chat_fn=llm_chat,
            min_reflections=2  # Lower threshold for regenerate
        )
        
        content = analysis_result.get("letter", "")
        core_pattern = analysis_result.get("core_pattern")
        situations = analysis_result.get("situations", [])
        analysis_depth = analysis_result.get("analysis_depth", "shallow")
        
        insert_weekly_insight(uid, last_period_start, content)
        
        return {
            "content": content,
            "period_start": last_period_start,
            "period_end": last_period_end,
            "reflection_count": len(period_reflections),
            "too_early": False,
            "core_pattern": core_pattern,
            "situations": situations[:3] if situations else [],
            "analysis_depth": analysis_depth,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Insights generate-letter failed: %s", type(e).__name__)
        raise _server_error(e, "insights_generate_letter")


@app.get("/api/insights/reflection-frequency")
def insights_reflection_frequency(user_id: str = Depends(require_user_id), week_mode: bool = True):
    """Count of reflections per day for the current week (Mon-Sun). Resets each week."""
    uid = user_id[:128]  # Limit length for safety
    try:
        today = datetime.now(timezone.utc).date()
        # Calculate current week: Monday = 0, Sunday = 6
        # Start of current week (Monday)
        week_start = today - timedelta(days=today.weekday())
        # Fetch reflections since Monday of this week
        since = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc).isoformat()
        reflections = list_saved_reflections_since(uid, since)
        from collections import defaultdict
        by_date = defaultdict(int)
        for r in reflections:
            created = r.get("created_at")
            if created:
                try:
                    if isinstance(created, str):
                        d = created[:10]
                    else:
                        d = getattr(created, "date", lambda: None)()
                        d = d.isoformat() if d and hasattr(d, "isoformat") else d
                    if d:
                        by_date[str(d)] += 1
                except Exception:
                    pass
        # Build exactly 7 days: Monday through Sunday
        out = []
        for i in range(7):
            day = week_start + timedelta(days=i)
            day_iso = day.isoformat()
            out.append({"date": day_iso, "count": by_date.get(day_iso, 0)})
        return {"days": out, "week_start": week_start.isoformat(), "week_end": (week_start + timedelta(days=6)).isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Insights reflection-frequency failed: %s", type(e).__name__)
        raise _server_error(e, "insights_reflection_frequency")


@app.get("/api/insights/mood-language")
def insights_mood_language(user_id: str = Depends(require_user_id), days: int = 30):
    """Unique mood phrases. Max 8 items. No counts, no ordering by frequency."""
    uid = user_id.strip()
    days = max(1, min(days, 90))
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        reflections = list_saved_reflections_since(uid, since)
        seen = set()
        words = []
        for r in reflections:
            mood = (r.get("mood_word") or "").strip()
            if mood and mood.lower() not in seen:
                seen.add(mood.lower())
                words.append(mood)
                if len(words) >= 8:
                    break
        return {"words": words[:8]}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Insights mood-language failed: %s", type(e).__name__)
        raise _server_error(e, "insights_mood_language")


@app.get("/api/insights/mood-over-time")
def insights_mood_over_time(user_id: str = Depends(require_user_id), days: int = 7):
    """
    Mood feelings over time with dates. Converts metaphors to human-relatable feelings.
    Returns list of { date, mood (original), feeling (human synonym) }.
    For visualization. No counts, no ranking.
    """
    uid = user_id[:128]  # Limit length for safety
    days = max(1, min(days, 90))  # Clamp to valid range
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        reflections = list_saved_reflections_since(uid, since)
        raw_moods = []
        mood_dates = {}
        for r in reflections:
            mood = (r.get("mood_word") or "").strip()
            created = r.get("created_at")
            if mood and created:
                try:
                    date_str = created[:10] if isinstance(created, str) else (getattr(created, "date", lambda: None)() or "").isoformat()
                    if date_str:
                        raw_moods.append(mood)
                        if mood not in mood_dates:
                            mood_dates[mood] = []
                        mood_dates[mood].append(date_str)
                except Exception:
                    pass
        
        if not raw_moods:
            return {"moods": [], "has_data": False}
        
        # Convert moods to human feelings
        unique_moods = list(dict.fromkeys(raw_moods))
        mood_feelings = convert_moods_to_feelings(unique_moods)
        feeling_map = {item["original"]: item["feeling"] for item in mood_feelings}
        
        # Build output with feelings
        out = []
        for mood, dates in mood_dates.items():
            feeling = feeling_map.get(mood, mood)
            for date_str in dates:
                out.append({"date": date_str, "mood": mood, "feeling": feeling})
        
        out.sort(key=lambda x: x["date"])
        return {"moods": out, "has_data": len(out) > 0}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Insights mood-over-time failed: %s", type(e).__name__)
        raise _server_error(e, "insights_mood_over_time")
