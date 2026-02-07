"""
LLM provider abstraction for REFLECT.

The app uses a single LLM for: reflection sections, personalized mirror, pattern extraction.
Switch providers via LLM_PROVIDER in .env (e.g. ollama, openai, anthropic).

Contract (any provider must implement):
- get_reflection(thought: str) -> list[dict]   # 6 sections: { "title", "content" }
- get_personalized_mirror(thought, questions, answers) -> str
- extract_pattern(thought: str, sections: list[dict]) -> dict | None  # emotional_tone, themes, time_orientation
- get_mood_suggestions(thought: str) -> list[dict]  # 4–5 items: { "phrase", "description" }
- get_reminder_message(thought: str | None, mirror_snippet: str | None) -> str  # wording only for revisit reminder
- get_weekly_insight_letter(reflections_summary: str) -> str  # 2–5 sentences, observational, second-person
- convert_moods_to_feelings(mood_metaphors: list[str]) -> list[dict]  # convert metaphors to human feelings
"""
import logging
import os

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()


def _get_impl():
    if LLM_PROVIDER == "ollama":
        from ollama_client import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
        return get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
    if LLM_PROVIDER == "openrouter":
        from openrouter_client import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
        return get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
    logger.warning("Unknown LLM_PROVIDER=%s, using ollama", LLM_PROVIDER)
    from ollama_client import get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat
    return get_reflection, get_personalized_mirror, extract_pattern, get_mood_suggestions, get_reminder_message, get_insight_letter, convert_moods_to_feelings, llm_chat


_get_reflection, _get_personalized_mirror, _extract_pattern, _get_mood_suggestions, _get_reminder_message, _get_insight_letter, _convert_moods_to_feelings, _llm_chat = _get_impl()


def get_reflection(thought: str, reflection_mode: str = "gentle") -> list[dict]:
    """Generate 6 reflection sections from the user's thought. Mode affects tone/length."""
    return _get_reflection(thought, reflection_mode=reflection_mode)


def get_personalized_mirror(thought: str, questions: list, answers: list | dict) -> str:
    """Generate a short personalized mirror from thought + Q&A. Same signature for all providers."""
    return _get_personalized_mirror(thought, questions, answers)


def extract_pattern(thought: str, sections: list[dict]) -> dict | None:
    """Extract emotional_tone, themes, time_orientation for reflection_patterns. Same signature for all providers."""
    return _extract_pattern(thought, sections)


def get_mood_suggestions(thought: str, mirror_text: str | None = None) -> list[dict]:
    """Suggest 4–5 metaphor phrases with descriptions from thought + optional mirror. Not judging—offering language they might borrow."""
    return _get_mood_suggestions(thought, mirror_text)


def get_reminder_message(thought: str | None = None, mirror_snippet: str | None = None) -> str:
    """Generate one short reminder sentence (wording only). LLM helps with wording only; scheduling is code-based."""
    return _get_reminder_message(thought, mirror_snippet)


def get_insight_letter(reflections_summary: str) -> str:
    """Generate a personal insight letter (3-6 sentences) for the past 5 days."""
    return _get_insight_letter(reflections_summary)


# Backwards compatibility alias
def get_weekly_insight_letter(reflections_summary: str) -> str:
    """Alias for get_insight_letter."""
    return _get_insight_letter(reflections_summary)


def convert_moods_to_feelings(mood_metaphors: list[str]) -> list[dict]:
    """Convert mood metaphors to human-relatable feelings."""
    return _convert_moods_to_feelings(mood_metaphors)


def llm_chat(prompt: str, system: str | None = None) -> str:
    """Direct LLM chat for use by pattern_analyzer and other modules."""
    return _llm_chat(prompt, system)
