"""
Supabase client for REFLECT – stores reflections (thought, sections, Q&A, mirror), profiles.
"""
import logging
import os

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore
    Client = None  # type: ignore

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")


def _get_client():
    if create_client is None:
        logger.warning("supabase package not installed – pip install supabase. Reflections will not be stored.")
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        if not SUPABASE_URL:
            logger.warning("SUPABASE_URL not set – reflections will not be stored")
        if not SUPABASE_SERVICE_KEY:
            logger.warning("SUPABASE_SERVICE_KEY (or SUPABASE_KEY) not set – reflections will not be stored")
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_supabase_status():
    """Return why DB may not be used: 'ok' | 'package_missing' | 'env_missing'."""
    if create_client is None:
        return "package_missing"
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return "env_missing"
    return "ok"


def insert_reflection_pattern(
    emotional_tone: str | None,
    themes: list[str],
    time_orientation: str | None,
) -> str | None:
    """
    Insert a reflection_pattern row. Returns the new row's id, or None if Supabase not configured.
    Schema: reflection_patterns(id, emotional_tone, themes, time_orientation, timestamp).
    """
    client = _get_client()
    if not client:
        return None
    try:
        row = {
            "emotional_tone": emotional_tone,
            "themes": themes,
            "time_orientation": time_orientation,
        }
        response = client.table("reflection_patterns").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_reflection_pattern failed: %s", e)
    return None


def insert_reflection(
    thought: str,
    sections: list[dict],
    user_id: str | None = None,
    pattern_id: str | None = None,
) -> str | None:
    """
    Insert a new reflection. Returns the new row's id, or None if Supabase not configured.
    Matches schema: reflections(id, user_id, thought, sections, pattern_id, is_favorite, questions, answers, personalized_mirror, created_at).
    """
    client = _get_client()
    if not client:
        return None
    try:
        row = {"thought": thought, "sections": sections}
        if user_id is not None:
            row["user_id"] = user_id
        if pattern_id is not None:
            row["pattern_id"] = pattern_id
        response = client.table("reflections").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_reflection failed: %s", e)
    return None


def insert_revisit_reminder(
    reflection_id: str,
    remind_at_timestamp: str,
    message: str | None = None,
) -> str | None:
    """
    Insert a revisit reminder. remind_at_timestamp is ISO format (e.g. from backend).
    Optional message is LLM-generated wording. Returns the new row's id, or None if Supabase not configured.
    """
    client = _get_client()
    if not client:
        return None
    try:
        row = {"reflection_id": reflection_id, "remind_at": remind_at_timestamp}
        if message is not None and message.strip():
            row["message"] = message.strip()[:500]
        response = client.table("revisit_reminders").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_revisit_reminder failed: %s", e)
    return None


def delete_reminder(reminder_id: str) -> bool:
    """
    Delete a reminder by id (e.g. after user opens the reflection). Returns True if a row was deleted.
    """
    client = _get_client()
    if not client:
        return False
    try:
        response = client.table("revisit_reminders").delete().eq("id", reminder_id).execute()
        return bool(response.data and len(response.data) > 0)
    except Exception as e:
        logger.exception("Supabase delete_reminder failed: %s", e)
    return False


def insert_mood_checkin(
    reflection_id: str,
    word_or_phrase: str,
    description: str | None = None,
) -> str | None:
    """
    Insert a mood check-in. Store word/phrase, optional description, and link to reflection.
    No scores, no labels. Returns the new row's id, or None if Supabase not configured.
    """
    client = _get_client()
    if not client:
        return None
    try:
        row = {
            "reflection_id": reflection_id,
            "word_or_phrase": word_or_phrase.strip(),
        }
        if description is not None and description.strip():
            row["description"] = description.strip()
        response = client.table("mood_checkins").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_mood_checkin failed: %s", e)
    return None


def get_reflection_by_id(reflection_id: str) -> dict | None:
    """
    Fetch one reflection by id. Returns dict with id, thought, sections, questions, answers, personalized_mirror, created_at, or None.
    """
    client = _get_client()
    if not client:
        return None
    try:
        response = client.table("reflections").select("*").eq("id", reflection_id).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase get_reflection_by_id failed: %s", e)
    return None


def list_reflections_by_user(user_id: str, limit: int = 100) -> list[dict]:
    """List reflections for this user; returns list of { id, pattern_id, created_at }. For personalization aggregation."""
    if not user_id or not str(user_id).strip():
        return []
    client = _get_client()
    if not client:
        return []
    try:
        response = client.table("reflections").select("id, pattern_id, created_at").eq("user_id", user_id.strip()).order("created_at", desc=True).limit(limit).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase list_reflections_by_user failed: %s", e)
    return []


def get_reflection_patterns_by_ids(pattern_ids: list[str]) -> list[dict]:
    """Fetch reflection_patterns by ids; returns list of { emotional_tone, themes, time_orientation }."""
    if not pattern_ids:
        return []
    client = _get_client()
    if not client:
        return []
    ids = [str(x).strip() for x in pattern_ids if x]
    if not ids:
        return []
    try:
        response = client.table("reflection_patterns").select("emotional_tone, themes, time_orientation").in_("id", ids).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase get_reflection_patterns_by_ids failed: %s", e)
    return []


def get_due_reminders() -> list[dict]:
    """
    Fetch revisit_reminders where remind_at <= now (UTC). Returns list of { id, reflection_id, remind_at, message }.
    """
    client = _get_client()
    if not client:
        return []
    try:
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        response = client.table("revisit_reminders").select("id, reflection_id, remind_at, message").lte("remind_at", now_iso).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase get_due_reminders failed: %s", e)
    return []


def update_reflection(
    reflection_id: str,
    questions: list[str],
    answers: list[str],
    personalized_mirror: str,
) -> bool:
    """
    Update a reflection with Q&A and personalized mirror. Returns True if updated.
    """
    client = _get_client()
    if not client:
        return False
    try:
        client.table("reflections").update({
            "questions": questions,
            "answers": answers,
            "personalized_mirror": personalized_mirror,
        }).eq("id", reflection_id).execute()
        return True
    except Exception as e:
        logger.exception("Supabase update_reflection failed: %s", e)
        return False


# ----- Saved reflections (history + open later) -----

def _cleanup_old_saved_reflections():
    """Delete all saved_reflections older than 7 days (by created_at). Opened or unopened."""
    client = _get_client()
    if not client:
        return
    try:
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        client.table("saved_reflections").delete().lt("created_at", cutoff).execute()
    except Exception as e:
        logger.warning("Supabase cleanup_old_saved_reflections failed: %s", e)


def insert_saved_reflection(
    user_identifier: str,
    raw_text: str,
    answers: list,
    mirror_response: str,
    mood_word: str | None = None,
    revisit_type: str | None = None,
) -> str | None:
    """Insert a completed reflection into history. revisit_type: 'come_back' | 'remind' | None. Returns id or None."""
    client = _get_client()
    if not client:
        return None
    try:
        row = {
            "user_identifier": user_identifier.strip(),
            "raw_text": raw_text,
            "answers": answers if answers is not None else [],
            "mirror_response": mirror_response,
            "status": "normal",
        }
        if mood_word is not None and str(mood_word).strip():
            row["mood_word"] = str(mood_word).strip()
        if revisit_type in ("come_back", "remind"):
            row["revisit_type"] = revisit_type
        response = client.table("saved_reflections").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_saved_reflection failed: %s", e)
    return None


def get_saved_reflection_by_id(saved_id: str) -> dict | None:
    """Fetch one saved reflection by id."""
    client = _get_client()
    if not client:
        return None
    try:
        response = client.table("saved_reflections").select("*").eq("id", saved_id).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase get_saved_reflection_by_id failed: %s", e)
    return None


def update_saved_reflection_open_later(saved_id: str, revisit_at: str | None = None) -> bool:
    """Set status='waiting' and optional revisit_at."""
    client = _get_client()
    if not client:
        return False
    try:
        payload = {"status": "waiting"}
        if revisit_at is not None:
            payload["revisit_at"] = revisit_at
        else:
            payload["revisit_at"] = None
        client.table("saved_reflections").update(payload).eq("id", saved_id).execute()
        return True
    except Exception as e:
        logger.exception("Supabase update_saved_reflection_open_later failed: %s", e)
        return False


def update_saved_reflection_remove_open_later(saved_id: str) -> bool:
    """Set status='normal' and clear revisit_at."""
    client = _get_client()
    if not client:
        return False
    try:
        client.table("saved_reflections").update({"status": "normal", "revisit_at": None}).eq("id", saved_id).execute()
        return True
    except Exception as e:
        logger.exception("Supabase update_saved_reflection_remove_open_later failed: %s", e)
        return False


def mark_saved_reflection_opened(saved_id: str) -> bool:
    """Set opened_at to now when the user opens (views) this reflection. Idempotent."""
    client = _get_client()
    if not client:
        return False
    try:
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        client.table("saved_reflections").update({"opened_at": now_iso}).eq("id", saved_id).execute()
        return True
    except Exception as e:
        logger.exception("Supabase mark_saved_reflection_opened failed: %s", e)
        return False


def list_saved_reflections_waiting(user_identifier: str) -> list[dict]:
    """List saved reflections with status='waiting' for this user. Runs cleanup first."""
    _cleanup_old_saved_reflections()
    client = _get_client()
    if not client:
        return []
    try:
        response = client.table("saved_reflections").select("id, raw_text, mirror_response, created_at, revisit_at").eq("user_identifier", user_identifier).eq("status", "waiting").order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase list_saved_reflections_waiting failed: %s", e)
    return []


def list_saved_reflections_all(user_identifier: str) -> list[dict]:
    """List all saved reflections for this user, created_at DESC. Runs cleanup first."""
    _cleanup_old_saved_reflections()
    client = _get_client()
    if not client:
        return []
    try:
        response = client.table("saved_reflections").select("id, raw_text, mirror_response, mood_word, status, created_at, opened_at, revisit_type").eq("user_identifier", user_identifier).order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase list_saved_reflections_all failed: %s", e)
    return []


def list_saved_reflections_since(user_identifier: str, since_iso: str) -> list[dict]:
    """List saved reflections for this user with created_at >= since_iso. No cleanup. For insights."""
    client = _get_client()
    if not client:
        return []
    try:
        response = client.table("saved_reflections").select("id, raw_text, mirror_response, mood_word, created_at").eq("user_identifier", user_identifier).gte("created_at", since_iso).order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        logger.exception("Supabase list_saved_reflections_since failed: %s", e)
    return []


def _validate_week_start(week_start: str) -> bool:
    """Validate week_start is in YYYY-MM-DD format."""
    import re
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", week_start or ""))


def get_weekly_insight_by_week(user_id: str, week_start: str) -> dict | None:
    """Get one weekly_insights row by user_id and week_start (YYYY-MM-DD)."""
    if not user_id or not _validate_week_start(week_start):
        return None
    client = _get_client()
    if not client:
        return None
    try:
        response = client.table("weekly_insights").select("id, content, created_at").eq("user_id", user_id.strip()[:128]).eq("week_start", week_start).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase get_weekly_insight_by_week failed: %s", e)
    return None


def insert_weekly_insight(user_id: str, week_start: str, content: str) -> str | None:
    """Insert a weekly insight. Returns id or None. Uses UNIQUE(user_id, week_start)."""
    if not user_id or not content or not _validate_week_start(week_start):
        return None
    client = _get_client()
    if not client:
        return None
    try:
        row = {"user_id": user_id.strip()[:128], "week_start": week_start, "content": content.strip()[:10000]}
        response = client.table("weekly_insights").insert(row).execute()
        if response.data and len(response.data) > 0:
            return response.data[0].get("id")
    except Exception as e:
        logger.exception("Supabase insert_weekly_insight failed: %s", e)
    return None


def delete_weekly_insight(user_id: str, week_start: str) -> bool:
    """Delete weekly insight for a user/week (to allow regeneration)."""
    if not user_id or not _validate_week_start(week_start):
        return False
    client = _get_client()
    if not client:
        return False
    try:
        client.table("weekly_insights").delete().eq("user_id", user_id.strip()[:128]).eq("week_start", week_start).execute()
        return True
    except Exception as e:
        logger.exception("Supabase delete_weekly_insight failed: %s", e)
        return False


# ----- Profiles (name, email, preferences for personalization) -----

def get_profile(user_id: str) -> dict | None:
    """Fetch profile by user_id. Returns dict with user_id, email, display_name, preferences, updated_at or None."""
    if not user_id or not str(user_id).strip():
        return None
    client = _get_client()
    if not client:
        return None
    try:
        response = client.table("profiles").select("*").eq("user_id", user_id.strip()).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase get_profile failed: %s", e)
    return None


def upsert_profile(
    user_id: str,
    email: str | None = None,
    display_name: str | None = None,
    preferences: dict | None = None,
) -> dict | None:
    """
    Insert or update profile. Pass only fields you want to set; None leaves existing value.
    For new rows, email/display_name can be set from Auth; preferences default to {}.
    Returns the row after upsert or None.
    """
    if not user_id or not str(user_id).strip():
        return None
    client = _get_client()
    if not client:
        return None
    try:
        from datetime import datetime, timezone
        row: dict = {"user_id": user_id.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}
        if email is not None:
            row["email"] = str(email).strip() or None
        if display_name is not None:
            row["display_name"] = str(display_name).strip() or None
        if preferences is not None:
            row["preferences"] = preferences if isinstance(preferences, dict) else {}
        response = client.table("profiles").upsert(row, on_conflict="user_id").execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase upsert_profile failed: %s", e)
    return None


def _fetch_auth_user(user_id: str) -> dict | None:
    """
    Fetch user from Supabase Auth Admin API. Returns dict with email, user_metadata (e.g. full_name)
    or None if not configured or user not found.
    """
    if not user_id or not str(user_id).strip():
        return None
    url = (SUPABASE_URL or "").rstrip("/")
    if not url or not SUPABASE_SERVICE_KEY:
        return None
    if not httpx:
        return None
    auth_url = f"{url}/auth/v1/admin/users/{user_id.strip()}"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                auth_url,
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "apikey": SUPABASE_SERVICE_KEY,
                },
            )
            if r.status_code != 200:
                logger.debug("Auth admin get user %s: %s %s", user_id, r.status_code, r.text)
                return None
            data = r.json()
            if isinstance(data, dict):
                return data
    except Exception as e:
        logger.warning("Supabase Auth admin get user failed: %s", e)
    return None


def sync_profile_from_auth(user_id: str) -> dict | None:
    """
    Sync profile from Supabase Auth: fetch user by id, then upsert profile with email and
    display_name from user_metadata (full_name or name). Returns updated profile or None.
    """
    if not user_id or not str(user_id).strip():
        return None
    auth_user = _fetch_auth_user(user_id)
    if not auth_user:
        return get_profile(user_id)
    email = (auth_user.get("email") or "").strip() or None
    meta = auth_user.get("user_metadata") or {}
    display_name = (meta.get("full_name") or meta.get("name") or "").strip() or None
    return upsert_profile(user_id, email=email, display_name=display_name)


# ----- Personalization context (for emails only; no raw thoughts) -----

def get_personalization_context(user_id: str) -> dict | None:
    """
    Fetch derived personalization context for this user (themes, mood words, tone, activity).
    Used to build personalized emails without touching raw thought content.
    """
    if not user_id or not str(user_id).strip():
        return None
    client = _get_client()
    if not client:
        return None
    try:
        response = client.table("user_personalization_context").select("*").eq("user_id", user_id.strip()).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase get_personalization_context failed: %s", e)
    return None


def _name_from_email(email: str | None) -> str | None:
    """
    Derive a display name from email local part (before @). e.g. john.doe@gmail.com -> "John Doe".
    Returns None if email is empty or invalid.
    """
    if not email or not str(email).strip():
        return None
    local = str(email).strip().split("@")[0].strip()
    if not local:
        return None
    name = local.replace(".", " ").replace("_", " ").strip()
    if not name:
        return None
    return name.title()


def upsert_personalization_context(
    user_id: str,
    recurring_themes: list | None = None,
    recent_mood_words: list | None = None,
    emotional_tone_summary: str | None = None,
    last_reflection_at: str | None = None,
    reflection_count_7d: int | None = None,
    name_from_email: str | None = None,
) -> dict | None:
    """
    Insert or update personalization context. Only derived/summary data – no raw thoughts.
    Pass only fields you want to set; None leaves existing value. Returns row or None.
    """
    if not user_id or not str(user_id).strip():
        return None
    client = _get_client()
    if not client:
        return None
    try:
        from datetime import datetime, timezone
        row: dict = {"user_id": user_id.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}
        if recurring_themes is not None:
            row["recurring_themes"] = recurring_themes if isinstance(recurring_themes, list) else []
        if recent_mood_words is not None:
            row["recent_mood_words"] = recent_mood_words if isinstance(recent_mood_words, list) else []
        if emotional_tone_summary is not None:
            row["emotional_tone_summary"] = (str(emotional_tone_summary) or "").strip() or None
        if last_reflection_at is not None:
            row["last_reflection_at"] = (str(last_reflection_at) or "").strip() or None
        if reflection_count_7d is not None:
            row["reflection_count_7d"] = int(reflection_count_7d) if reflection_count_7d is not None else 0
        if name_from_email is not None:
            row["name_from_email"] = (str(name_from_email) or "").strip() or None
        response = client.table("user_personalization_context").upsert(row, on_conflict="user_id").execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.exception("Supabase upsert_personalization_context failed: %s", e)
    return None


def _distinct_user_identifiers_from_saved_reflections(limit: int = 500) -> list[str]:
    """Return distinct user_identifier values from saved_reflections (for batch refresh)."""
    client = _get_client()
    if not client:
        return []
    try:
        response = client.table("saved_reflections").select("user_identifier").limit(limit * 2).execute()
        seen = set()
        out = []
        for row in (response.data or []):
            uid = (row.get("user_identifier") or "").strip()
            if uid and uid not in seen:
                seen.add(uid)
                out.append(uid)
                if len(out) >= limit:
                    break
        return out
    except Exception as e:
        logger.exception("Supabase distinct user_identifiers failed: %s", e)
    return []


def refresh_personalization_context_for_user(user_id: str) -> dict | None:
    """
    Derive personalization context from saved_reflections (mood, activity) and reflections+patterns (themes, tone).
    Updates user_personalization_context and returns the new row. No raw thought content is read or stored.
    """
    from datetime import datetime, timezone, timedelta
    uid = (user_id or "").strip()
    if not uid:
        return None

    recent_mood_words: list[str] = []
    last_reflection_at: str | None = None
    reflection_count_7d = 0
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    saved_all = list_saved_reflections_all(uid)
    saved_7d = list_saved_reflections_since(uid, seven_days_ago)
    reflection_count_7d = len(saved_7d)
    for r in saved_all:
        m = (r.get("mood_word") or "").strip()
        if m:
            recent_mood_words.append(m)
    if saved_all:
        ct = saved_all[0].get("created_at")
        if ct:
            last_reflection_at = ct.isoformat() if hasattr(ct, "isoformat") else str(ct)
    recent_mood_words = recent_mood_words[:10]

    recurring_themes: list[str] = []
    emotional_tone_parts: list[str] = []
    reflections = list_reflections_by_user(uid)
    pattern_ids = [r["pattern_id"] for r in reflections if r.get("pattern_id")]
    if pattern_ids:
        patterns = get_reflection_patterns_by_ids(pattern_ids)
        for p in patterns:
            themes = p.get("themes")
            if isinstance(themes, list):
                recurring_themes.extend(t for t in themes if isinstance(t, str) and t.strip())
            tone = (p.get("emotional_tone") or "").strip()
            if tone:
                emotional_tone_parts.append(tone)
    theme_counts: dict[str, int] = {}
    for t in recurring_themes:
        t = t.strip().lower()
        if t:
            theme_counts[t] = theme_counts.get(t, 0) + 1
    recurring_themes = [k for k, _ in sorted(theme_counts.items(), key=lambda x: -x[1])][:10]
    emotional_tone_summary = None
    if emotional_tone_parts:
        emotional_tone_summary = ", ".join(list(dict.fromkeys(emotional_tone_parts[:3])))

    name_from_email = None
    profile = get_profile(uid)
    if profile and profile.get("email"):
        name_from_email = _name_from_email(profile.get("email"))

    return upsert_personalization_context(
        user_id=uid,
        recurring_themes=recurring_themes,
        recent_mood_words=recent_mood_words,
        emotional_tone_summary=emotional_tone_summary,
        last_reflection_at=last_reflection_at,
        reflection_count_7d=reflection_count_7d,
        name_from_email=name_from_email,
    )


def refresh_personalization_context_all(limit_users: int = 200) -> list[str]:
    """
    Refresh personalization context for all users that have saved_reflections.
    Returns list of user_ids that were updated.
    """
    user_ids = _distinct_user_identifiers_from_saved_reflections(limit=limit_users)
    updated = []
    for uid in user_ids:
        try:
            if refresh_personalization_context_for_user(uid):
                updated.append(uid)
        except Exception as e:
            logger.warning("Refresh personalization for %s failed: %s", uid, e)
    return updated
