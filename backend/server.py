"""
REFLECT backend – FastAPI server that uses local Ollama (e.g. Qwen) for reflections.
"""
import logging
import os
import threading
import time
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()  # load .env before other modules read SUPABASE_* etc.
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import require_user_id

from llm_provider import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
from pattern_analyzer import analyze_patterns_deep_sync
from supabase_client import (
    insert_reflection,
    update_reflection,
    insert_reflection_pattern,
    insert_mood_checkin,
    insert_revisit_reminder,
    delete_reminder,
    get_reflection_by_id,
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
    refresh_personalization_context_for_user,
    refresh_personalization_context_all,
)

# So Supabase and Ollama client warnings/errors show in the uvicorn terminal
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logging.getLogger("supabase_client").setLevel(logging.WARNING)
logging.getLogger("ollama_client").setLevel(logging.WARNING)

app = FastAPI(title="REFLECT API", version="0.1.0")

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
            logging.warning("Personalization refresh failed: %s", e)
        time.sleep(interval_sec)


@app.on_event("startup")
def startup():
    from llm_provider import LLM_PROVIDER
    logging.info("LLM provider: %s", LLM_PROVIDER)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReflectRequest(BaseModel):
    thought: str
    reflection_mode: str | None = "gentle"  # "gentle" | "direct" | "quiet"


class MirrorRequest(BaseModel):
    thought: str
    questions: list[str]
    answers: dict | list  # dict keyed by question or index, or list of 3 answers
    reflection_id: str | None = None  # if set, we update this row in Supabase with Q&A + mirror


class MoodRequest(BaseModel):
    reflection_id: str
    word_or_phrase: str  # the word or phrase they chose; no scores, no labels
    description: str | None = None  # optional; from the suggestion card when they picked one


class SaveHistoryRequest(BaseModel):
    user_identifier: str
    raw_text: str
    answers: list[dict]  # e.g. [{"question": "...", "response": "..."}]
    mirror_response: str
    mood_word: str | None = None
    revisit_type: str | None = None  # 'come_back' | 'remind' for "to return" styling


class OpenLaterRequest(BaseModel):
    revisit_at: str | None = None  # ISO timestamp optional


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    preferences: dict | None = None


class MoodSuggestRequest(BaseModel):
    thought: str = ""  # optional; if empty, backend can still use mirror_text
    mirror_text: str | None = None  # optional; personalized mirror from their Q&A


class RemindRequest(BaseModel):
    reflection_id: str
    days: int  # 1, 2, 3, or 7


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


@app.get("/api/reflections/{reflection_id}")
def get_reflection_route(reflection_id: str):
    """Get one reflection by id (for opening from notification or 'come back later')."""
    if not reflection_id or not reflection_id.strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    try:
        row = get_reflection_by_id(reflection_id.strip())
        if not row:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reminders/due")
def reminders_due():
    """Get reminders where remind_at <= now (for in-app 'you wanted to come back' and opening reflection)."""
    try:
        reminders = get_due_reminders()
        return {"reminders": reminders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


def _do_reflect(body: ReflectRequest):
    """Shared logic for POST /api/reflect (with or without trailing slash)."""
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    try:
        thought = body.thought.strip()
        # Validate and pass reflection mode to LLM
        mode = (body.reflection_mode or "gentle").lower()
        if mode not in ("gentle", "direct", "quiet"):
            mode = "gentle"
        sections = get_reflection(thought, reflection_mode=mode)
        pattern_id = None
        pattern = extract_pattern(thought, sections)
        if pattern:
            pattern_id = insert_reflection_pattern(
                pattern.get("emotional_tone"),
                pattern.get("themes") or [],
                pattern.get("time_orientation"),
            )
            if not pattern_id:
                logging.warning("Pattern insert returned None (check Supabase reflection_patterns table)")
        else:
            logging.info("Pattern extraction returned None (LLM may have returned non-JSON)")
        reflection_id = insert_reflection(thought, sections, pattern_id=pattern_id)
        return {"id": reflection_id, "sections": sections}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Reflect failed: %s", e)
        raise HTTPException(status_code=502, detail=_llm_error_message(e))


@app.get("/api/reflect")
def reflect_get():
    """Help verify the REFLECT backend is running. Use POST with body {"thought": "..."} to get a reflection."""
    return {"message": "REFLECT API. Use POST with body {\"thought\": \"...\"} to get a reflection."}


@app.post("/api/reflect")
@app.post("/api/reflect/")
def reflect(body: ReflectRequest):
    return _do_reflect(body)


@app.post("/api/mirror/personalized")
def mirror_personalized(body: MirrorRequest):
    if not (body.thought or "").strip():
        raise HTTPException(status_code=400, detail="thought is required")
    try:
        thought = body.thought.strip()
        questions = body.questions
        answers = body.answers if isinstance(body.answers, list) else [body.answers.get(q, body.answers.get(str(i), "")) for i, q in enumerate(questions)]
        content = get_personalized_mirror(thought, questions, answers)
        if body.reflection_id:
            update_reflection(body.reflection_id, questions, answers, content)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")


@app.post("/api/remind")
def remind(body: RemindRequest):
    """Set a gentle reminder to revisit this reflection in X days. Schedule via code; LLM helps with wording only."""
    if not (body.reflection_id or "").strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    days = max(1, min(7, body.days))  # clamp 1–7
    remind_at = datetime.now(timezone.utc) + timedelta(days=days)
    remind_at_iso = remind_at.isoformat()
    message = None
    try:
        reflection = get_reflection_by_id(body.reflection_id.strip())
        thought = (reflection.get("thought") or "").strip() if reflection else None
        mirror = (reflection.get("personalized_mirror") or "").strip() if reflection else None
        mirror_snippet = mirror[:200] if mirror else None
        message = get_reminder_message(thought=thought, mirror_snippet=mirror_snippet)
    except Exception as e:
        logging.warning("Reminder message generation failed, using fallback: %s", e)
    try:
        reminder_id = insert_revisit_reminder(body.reflection_id.strip(), remind_at_iso, message=message)
        return {"id": reminder_id, "remind_at": remind_at_iso, "message": message or None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/reminders/{reminder_id}")
def reminder_delete(reminder_id: str):
    """Mark a reminder as consumed (e.g. user opened the reflection). Time-based trigger uses DB; delete after open."""
    try:
        ok = delete_reminder(reminder_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Reminder not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mood/suggest")
def mood_suggest(body: MoodSuggestRequest):
    """Suggest 4–5 metaphor phrases with descriptions from thought + mirror. Not judging—offering language they might borrow."""
    thought = (body.thought or "").strip()
    mirror_text = (body.mirror_text or "").strip() or None
    try:
        suggestions = get_mood_suggestions(thought, mirror_text)
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/mood")
def mood(body: MoodRequest):
    """Store a mood check-in: word/phrase, optional description, linked to reflection. No scores, no labels."""
    if not (body.word_or_phrase or "").strip():
        raise HTTPException(status_code=400, detail="word_or_phrase is required")
    if not (body.reflection_id or "").strip():
        raise HTTPException(status_code=400, detail="reflection_id is required")
    try:
        description = (body.description or "").strip() or None
        checkin_id = insert_mood_checkin(
            body.reflection_id.strip(),
            body.word_or_phrase.strip(),
            description=description,
        )
        return {"id": checkin_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----- Saved reflections (history + open later) -----

@app.post("/api/history")
def history_save(body: SaveHistoryRequest, user_id: str = Depends(require_user_id)):
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
        try:
            refresh_personalization_context_for_user(user_id)
        except Exception:
            pass
        return {"id": saved_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/waiting")
def history_waiting(user_id: str = Depends(require_user_id)):
    """List saved reflections with status='waiting' (open later). Cleans up items not revisited in 7 days."""
    try:
        items = list_saved_reflections_waiting(user_id)
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
def history_all(user_id: str = Depends(require_user_id)):
    """List all saved reflections for this user, created_at DESC."""
    try:
        items = list_saved_reflections_all(user_id)
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    secret: str | None = None,
):
    """
    Refresh personalization context for all users with saved_reflections. For cron jobs.
    Requires PERSONALIZATION_CRON_SECRET in env; send it in header X-Cron-Secret or query ?secret=.
    """
    expected = os.getenv("PERSONALIZATION_CRON_SECRET", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="PERSONALIZATION_CRON_SECRET not configured")
    token = (x_cron_secret or secret or "").strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing secret")
    try:
        updated = refresh_personalization_context_all(limit_users=200)
        return {"updated": len(updated), "user_ids": updated}
    except Exception as e:
        logging.exception("Refresh all personalization failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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
        logging.exception("Insights letter failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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
        logging.exception("Insights generate-letter failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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
        logging.exception("Insights reflection-frequency failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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
        logging.exception("Insights mood-language failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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
        logging.exception("Insights mood-over-time failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
