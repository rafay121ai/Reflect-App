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
import threading
import time
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()  # load .env before other modules read SUPABASE_* etc.
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from auth import require_user_id
from security import sanitize_for_llm

from llm_provider import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, get_closing, convert_moods_to_feelings, llm_chat
from openai_client import get_mirror_report
from pattern_analyzer import analyze_patterns_deep_sync
from revenuecat_client import get_subscription_status as get_rc_subscription_status
from usage_limits import enforce_reflection_limit, rollback_reflection_usage
from lemon_squeezy_client import (
    verify_webhook_signature,
    parse_subscription_event,
    is_duplicate_event,
    record_event,
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
    update_profile_plan,
    count_guest_reflections_by_guest_id,
    insert_guest_reflection,
    migrate_guest_reflections_to_user,
    delete_orphaned_guest_reflections_older_than,
    insert_beta_feedback,
    list_beta_feedback_for_user,
    save_mirror_report,
)

# So Supabase and Ollama client warnings/errors show in the uvicorn terminal
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("supabase_client").setLevel(logging.WARNING)
logging.getLogger("ollama_client").setLevel(logging.WARNING)

# Route handlers are sync def; FastAPI runs them in a thread pool, so blocking Supabase/LLM calls do not block the event loop.
app = FastAPI(title="REFLECT API", version="0.1.0")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Personalization refresh: interval in hours (0 = disabled). Default 24.
PERSONALIZATION_REFRESH_INTERVAL_HOURS = float(os.getenv("PERSONALIZATION_REFRESH_INTERVAL_HOURS", "24").strip() or "0")
PERSONALIZATION_REFRESH_INITIAL_DELAY_SEC = 60


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
    questions: list[str] = Field(..., max_length=20)
    answers: dict | list
    reflection_id: str | None = Field(default=None, max_length=100)


class MirrorReportRequest(BaseModel):
    thought: str = Field(..., max_length=5000)
    questions: list[str] = Field(..., max_items=20)
    answers: list[str] = Field(..., max_items=20)
    reflection_id: str = Field("", max_length=100)
    reflection_mode: str = Field("gentle", max_length=20)


class MoodRequest(BaseModel):
    reflection_id: str = Field(..., max_length=100)
    word_or_phrase: str = Field(..., max_length=200)  # the word or phrase they chose; no scores, no labels
    description: str | None = Field(default=None, max_length=500)  # optional; from the suggestion card when they picked one


class SaveHistoryRequest(BaseModel):
    user_identifier: str = Field(..., max_length=256)
    raw_text: str = Field(..., max_length=50000)
    answers: list[dict] = Field(..., max_length=100)
    mirror_response: str = Field(..., max_length=50000)
    mood_word: str | None = None
    revisit_type: str | None = None


class OpenLaterRequest(BaseModel):
    revisit_at: str | None = None  # ISO timestamp optional


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    preferences: dict | None = None


class MoodSuggestRequest(BaseModel):
    thought: str = ""  # optional; if empty, backend can still use mirror_text
    mirror_text: str | None = None  # optional; personalized mirror from their Q&A


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
        all_due = get_due_reminders()
        user_reflection_ids = {r["id"] for r in list_reflections_by_user(user_id, limit=5000) if r.get("id")}
        reminders = [m for m in all_due if (m.get("reflection_id") or "") in user_reflection_ids]
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
    Activate 7-day trial for brand new users. Idempotent.
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


def _do_reflect(body: ReflectRequest, user_id: str | None = None, background_tasks: BackgroundTasks | None = None):
    """Shared logic for POST /api/reflect (with or without trailing slash)."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")

    # Server-side rate limit by subscription tier (JWT user_id only; no trust of frontend)
    if user_id:
        rc = get_rc_subscription_status(user_id)
        plan_type = (rc.get("plan_type") or "trial").strip().lower()
        period_start_rc = rc.get("period_start")
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
        return {"id": reflection_id, "sections": sections}
    except HTTPException:
        raise
    except Exception as e:
        if user_id:
            rc = get_rc_subscription_status(user_id)
            plan_type = (rc.get("plan_type") or "trial").strip().lower()
            rollback_reflection_usage(user_id, plan_type)
        logging.exception("Reflect failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail=_llm_error_message(e))


@app.get("/api/reflect")
def reflect_get():
    """Help verify the REFLECT backend is running. Use POST with body {"thought": "..."} to get a reflection."""
    return {"message": "REFLECT API. Use POST with body {\"thought\": \"...\"} to get a reflection."}


@app.post("/api/reflect")
@app.post("/api/reflect/")
@limiter.limit("20/hour")
def reflect(request: Request, body: ReflectRequest, background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)):
    return _do_reflect(body, user_id=user_id, background_tasks=background_tasks)


@app.post("/api/webhooks/lemon-squeezy")
async def webhook_lemon_squeezy(
    request: Request,
    x_signature: str = Header(None, alias="X-Signature"),
):
    import json
    from supabase_client import update_user_plan

    payload = await request.body()

    # 1. Verify signature
    if not verify_webhook_signature(payload, x_signature or ""):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(payload.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = parse_subscription_event(body)
    if not event or not event.get("user_id"):
        return {"ok": True}

    # 2. Deduplicate — reject replayed events
    event_id = (body.get("meta") or {}).get("event_id", "") or ""
    event_name = event.get("event_name", "")

    if is_duplicate_event(event_id):
        return {"ok": True, "skipped": "duplicate"}

    # 3. Process subscription change
    user_id = event["user_id"]
    status = event.get("status") or ""
    plan_type = event.get("plan_type") or "monthly"

    try:
        if status == "active":
            update_user_plan(user_id, plan_type)
        elif status in ("cancelled", "expired"):
            update_user_plan(user_id, "trial")
    finally:
        # 4. Mark as processed (best-effort)
        record_event(event_id, event_name)

    return {"ok": True}


@app.post("/api/reflect/guest")
@limiter.limit("10/minute")
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
@limiter.limit("20/hour")
def mirror_personalized(request: Request, body: MirrorRequest, user_id: str = Depends(require_user_id)):
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
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
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")


@app.post("/api/mirror/report")
@limiter.limit("20/hour")
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

        # Save report to reflection if reflection_id provided
        if body.reflection_id and report:
            try:
                save_mirror_report(body.reflection_id, report)
            except Exception as e:
                logger.warning("Failed to save mirror report: %s", type(e).__name__)

        return report
    except Exception as e:
        raise _server_error(e, "mirror-report")


@app.post("/api/mirror/report/guest")
@limiter.limit("5/minute")
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
    try:
        thought = body.thought.strip()
        safe_thought = sanitize_for_llm(thought)
        questions = body.questions
        answers = body.answers if isinstance(body.answers, list) else [body.answers.get(q, body.answers.get(str(i), "")) for i, q in enumerate(questions)]
        content = get_personalized_mirror(safe_thought, questions, answers, user_context={})
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")


@app.post("/api/closing")
@limiter.limit("20/hour")
def closing(request: Request, body: ClosingRequest, user_id: str = Depends(require_user_id)):
    """Generate closing moment with named truth + open thread. Updates reflection with closing_text if reflection_id provided."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if not (body.mirror_response or "").strip():
        raise HTTPException(status_code=400, detail="mirror_response is required")
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
        
        return {"closing_text": closing_text}
    except Exception as e:
        logging.exception("Closing generation failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail=f"Closing generation error: {e}")


@app.post("/api/closing/guest")
@limiter.limit("10/minute")
def closing_guest(request: Request, body: ClosingRequest):
    """Guest closing: no auth, no reflection DB updates."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    if not (body.mirror_response or "").strip():
        raise HTTPException(status_code=400, detail="mirror_response is required")
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
        logging.exception("Closing generation failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail=f"Closing generation error: {e}")


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
        raise HTTPException(status_code=502, detail=str(e))


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
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/mood")
@limiter.limit("30/hour")
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
    trial_expires_at: trial_start + 7 days (ISO) for trial users.
    """
    from datetime import timedelta

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
            expires = ts + timedelta(days=7)
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


@app.delete("/api/user/account")
def user_account_delete(user_id: str = Depends(require_user_id)):
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
def insights_letter(user_id: str = Depends(require_user_id)):
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
def insights_weekly(user_id: str = Depends(require_user_id)):
    """Alias for /api/insights/letter for backwards compatibility."""
    return insights_letter(user_id)


@app.post("/api/insights/generate-letter")
def insights_generate_letter(user_id: str = Depends(require_user_id)):
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
