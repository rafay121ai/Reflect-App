"""
Shared LLM helpers used by openai_client (and optionally ollama_client).
Keeps openai_client independent of ollama_client so Ollama is not loaded when using OpenAI.
"""
import json
import re


def _parse_sections(text: str) -> list[dict]:
    """
    Parse LLM output into sections by ## / ### headers or **Bold** headers.
    Returns list of { "title": str, "content": str }.
    """
    sections = []
    if not text or not text.strip():
        return sections
    t = text.strip()
    pattern = re.compile(r"^#{2,3}\s*(.+)$", re.MULTILINE)
    parts = pattern.split(t)
    if len(parts) >= 3:
        i = 1
        while i + 1 < len(parts):
            title = parts[i].strip()
            content = parts[i + 1].strip()
            if title and content:
                sections.append({"title": title, "content": content})
            i += 2
        if sections:
            return sections
    bold_pattern = re.compile(r"^\*\*(.+?)\*\*\s*$", re.MULTILINE)
    parts = bold_pattern.split(t)
    if len(parts) >= 3:
        i = 1
        while i + 1 < len(parts):
            title = parts[i].strip()
            content = parts[i + 1].strip()
            if title and content and len(content) > 10:
                sections.append({"title": title, "content": content})
            i += 2
        if sections:
            return sections
    if t:
        sections.append({"title": "A Mirror", "content": t})
    return sections


def _parse_mood_json(raw: str):
    """Parse JSON array from LLM; tolerate missing commas between objects."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    fixed = re.sub(r"\}\s*\{", "},{", raw)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    fixed = re.sub(r",\s*]", "]", fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        raise


MOOD_SUGGESTIONS_FALLBACK = [
    {"phrase": "foggy morning", "description": "A sense of things being unclear or slow to lift."},
    {"phrase": "paused traffic", "description": "Waiting, with nowhere to go yet."},
    {"phrase": "open window", "description": "Something has shifted; a bit of air."},
    {"phrase": "low battery", "description": "Running on less than usual."},
    {"phrase": "deep water", "description": "In the middle of something that asks for patience."},
]

REMINDER_MESSAGE_FALLBACK = "You wanted to come back to this reflection."

INSIGHT_LETTER_FALLBACK = "These past few days you showed up to reflect. That's worth noticing."
