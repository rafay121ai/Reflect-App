"""
Ollama client for REFLECT – calls your local Ollama (e.g. Qwen) for reflections.
"""
import json
import logging
import os
import re
import httpx

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen")


def _chat(prompt: str, system: str | None = None) -> str:
    """Send a prompt to Ollama and return the assistant message content."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    with httpx.Client(timeout=120.0) as client:
        r = client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
            },
        )
        r.raise_for_status()
        data = r.json()
        return (data.get("message") or {}).get("content") or ""


def _parse_sections(text: str) -> list[dict]:
    """
    Parse LLM output into sections by ## or ### Header lines.
    Returns list of { "title": str, "content": str }.
    """
    sections = []
    if not text or not text.strip():
        return sections
    # Accept ## or ### headers
    pattern = re.compile(r"^#{2,3}\s*(.+)$", re.MULTILINE)
    parts = pattern.split(text.strip())
    if len(parts) < 3:
        if text.strip():
            sections.append({"title": "A Mirror", "content": text.strip()})
        return sections
    i = 1
    while i + 1 < len(parts):
        title = parts[i].strip()
        content = parts[i + 1].strip()
        if title and content:
            sections.append({"title": title, "content": content})
        i += 2
    return sections


# ============================================================================
# Reflection Mode Configurations
# Each mode affects tone and length, NOT logic or structure.
# ============================================================================

REFLECTION_MODE_CONFIGS = {
    "gentle": {
        "system": """You're helping someone see what they already sense but haven't named. Not fixing, not advising.

Use "you." Simple English only—words a 12-year-old would get. No fancy or complex words. Short sentences. Say less so it lands more.

Aim for the kind of line that goes down the spine: specific, subtle, personal. One true sentence beats three padded ones.""",
        "section_length": {
            "feels_like": "1-2 short sentences",
            "stuck": "1-2 short sentences",
            "believe": "1 sentence",
            "matters": "1-2 short sentences",
            "mirror": "2-3 short sentences max",
        },
        "questions_count": 3,
    },
    "direct": {
        "system": """You're holding up a clear mirror. Say exactly what you see—no padding, no big words.

Use "you." Simple English. One short sentence per idea. Every word earns its place.

Aim for the line that lands like a shiver: true, specific, no fluff.""",
        "section_length": {
            "feels_like": "1 sentence",
            "stuck": "1 sentence",
            "believe": "1 sentence",
            "matters": "1 sentence",
            "mirror": "1-2 sentences max",
        },
        "questions_count": 2,
    },
    "quiet": {
        "system": """Say only what can't be left unsaid. Few words. Simple words.

Use "you." Point to the center of their thought. No explaining, no fancy language.

Like a shiver down the bones—one line that's true.""",
        "section_length": {
            "feels_like": "1 short sentence",
            "stuck": "1 short sentence",
            "believe": "1 short sentence or fragment",
            "matters": "1 short sentence",
            "mirror": "1-2 sentences max",
        },
        "questions_count": 1,
    },
}


def get_reflection(thought: str, reflection_mode: str = "gentle") -> list[dict]:
    """
    Call Ollama to generate reflection sections from the user's thought.
    Returns list of { "title": str, "content": str } for JourneyCards, Some Things to Notice, A Mirror.
    
    Args:
        thought: The user's raw thought
        reflection_mode: "gentle" (default), "direct", or "quiet"
    """
    # Get mode config (fallback to gentle if invalid)
    mode = reflection_mode.lower() if reflection_mode else "gentle"
    if mode not in REFLECTION_MODE_CONFIGS:
        mode = "gentle"
    config = REFLECTION_MODE_CONFIGS[mode]
    lengths = config["section_length"]
    q_count = config["questions_count"]
    
    prompt = f'''Thought: "{thought}"

Create exactly 6 reflection sections. Speak TO them using "you." Be SHORT. Use SIMPLE English only—no complex or fancy words. Aim for specific, subtle, personal. The kind of line that lands like a shiver.

CRITICAL: Keep each section brief. One or two short sentences per section (except the mirror: 2-3 max). If you can say it in fewer words, do. No padding.

## What This Feels Like
({lengths["feels_like"]})
The feeling under the thought. Simple words. "You're..." or "This feels like..."
e.g. "You're holding a lot with nowhere to set it down." / "There's a tightness here, like you're bracing for something."

## Where You're Stuck
({lengths["stuck"]})
Where their thinking is circling. One clear line. e.g. "You keep going back to what already happened, looking for a different answer."

## What You Believe Right Now
({lengths["believe"]})
One quiet belief under the thought. "You're believing that..." or "There's an assumption here that..." One sentence.

## Why This Matters to You
({lengths["matters"]})
What this really touches—connection, safety, being enough, time. Simple words. One or two sentences. Use "you."

## Some Things to Notice
(Exactly {q_count} question{"s" if q_count > 1 else ""})
Short questions, specific to THIS thought. No "why." End with ? e.g. "What would it feel like if you stopped trying to figure this out?"

## A Mirror
({lengths["mirror"]})
Reflect back one true thing they didn't quite say. A tension, something unspoken, or what they're really asking. TO them. Specific. No reassurance, no advice. Simple English. Make it land.

CRITICAL: Write the actual reflection content only. No instructions, no examples in your output. Short and simple.'''

    raw = _chat(prompt, system=config["system"])
    sections = _parse_sections(raw)

    # Required section titles the frontend expects (in order)
    required = [
        ("What This Feels Like", "feels like", "Something here is worth noticing. Take a breath."),
        ("Where You're Stuck", "stuck", "There's a place you're circling. No need to fix it yet."),
        ("What You Believe Right Now", "believe", "One quiet belief is sitting in this. You can just notice it."),
        ("Why This Matters to You", "matters", "This touches something that matters to you. That's enough to name."),
        ("Some Things to Notice", "notice", "What do you notice right now?\nWhat feels most important?\nWhat do you need?"),
        ("A Mirror", "mirror", raw.strip() if raw.strip() else "What you shared is worth sitting with. Be gentle with yourself."),
    ]
    # Instruction phrases the model sometimes echoes – treat as invalid content
    instruction_phrases = (
        "1 sentence", "talk to them", "don't describe", "direct address only",
        "use \"you\"", "not \"they\"", "one line each", "do not output",
    )

    def looks_like_instruction(text: str) -> bool:
        if not text or len(text) < 20:
            return False
        lower = text.lower()
        return any(p in lower for p in instruction_phrases)

    result = []
    for title, keyword, default_content in required:
        match = next((s for s in sections if keyword in s["title"].lower()), None)
        if match and not looks_like_instruction(match["content"]):
            result.append({"title": match["title"], "content": match["content"]})
        else:
            result.append({"title": title, "content": default_content})
    return result


def get_personalized_mirror(thought: str, questions: list, answers: dict | list) -> str:
    """
    Call Ollama to generate a short personalized mirror from the thought + Q&A.
    questions: list of 3 strings; answers: either dict { question: answer } or list [a1, a2, a3].
    """
    if isinstance(answers, dict):
        a1 = answers.get(questions[0], answers.get(0, ""))
        a2 = answers.get(questions[1], answers.get(1, ""))
        a3 = answers.get(questions[2], answers.get(2, ""))
    else:
        a1 = answers[0] if len(answers) > 0 else ""
        a2 = answers[1] if len(answers) > 1 else ""
        a3 = answers[2] if len(answers) > 2 else ""
    q1_text = questions[0] if len(questions) > 0 else ""
    q2_text = questions[1] if len(questions) > 1 else ""
    q3_text = questions[2] if len(questions) > 2 else ""

    system = """You're creating a moment of recognition—where someone reads your words and thinks "yes, exactly that."

You're speaking TO the person who just answered questions about their own thought. Use "you." Simple language. Short sentences that land.

Your goal: show them something true about their own experience that they felt but didn't name."""

    prompt = f"""The person shared this thought:
{thought}

They answered these questions:
Q1: {q1_text} → "{a1}"
Q2: {q2_text} → "{a2}"
Q3: {q3_text} → "{a3}"

Write a mirror in 2-3 sentences that creates a moment of recognition.

Your mirror should:
1. Point to something THEY SAID but in a way that reveals more than they realized
2. Notice a gap, contrast, or pattern between their thought and their answers
3. Be specific to what they shared—not generic wisdom

Examples of what to look for:
- If their thought is anxious but their answers are calm, point to that gap
- If they say they don't care but their answers show they care deeply, name that
- If they're seeking one thing but describing another, show them that
- If relief appears in their answers but tension in their thought, point to what brings relief

Say it TO them directly:
✗ "This person seems to be..."
✓ "You're saying X, but what comes through is Y"

Rules:
- Direct address only. "You..." not "they"
- DO NOT summarize what they said
- Point to the MEANING underneath their words
- Focus on tensions, gaps, or unspoken truths
- No advice. No reassurance. No fixing.
- Simple, everyday language
- Let the insight be implied, not explained

What would make them pause and think "how did you know that"? Say that."""

    return _chat(prompt, system=system).strip() or "What you shared matters. Take a moment to be with it."


def extract_pattern(thought: str, sections: list[dict]) -> dict | None:
    """
    Extract pattern (emotional_tone, themes, time_orientation) from thought + sections for reflection_patterns.
    Returns dict with keys emotional_tone (str), themes (list[str]), time_orientation (str), or None if parse fails.
    """
    sections_text = "\n".join(
        f"{s.get('title', '')}: {s.get('content', '')[:200]}" for s in sections[:6]
    )
    system = """You extract three pattern markers from someone's thought and reflection. Output only valid JSON. No markdown, no explanation.

Keys required:
- emotional_tone: one word describing the feeling quality
- themes: list of concrete topics/concerns (not emotions)
- time_orientation: exactly one word: past, future, present, or mixed"""
    prompt = f"""Thought: "{thought[:500]}"

Reflection summary:
{sections_text[:800]}

Extract patterns:

**emotional_tone** - The underlying feeling quality (one word):
- Not surface emotions (sad, angry, happy)
- The STATE of the thinking (restless, heavy, scattered, tight, open, stuck, spinning, quiet, urgent, numb, etc.)

**themes** - What they're actually thinking about (3-7 concrete topics):
- Not emotions or qualities—actual subjects
- Examples: work, relationship, time, parenting, money, health, identity, belonging, purpose, past decisions, future plans, self-worth, productivity, rest, expectations
- Be specific: not "relationships" → "romantic relationship" or "family dynamics"

**time_orientation** - Where their thinking is located:
- past: replaying what happened, reviewing decisions, stuck in what was
- future: rehearsing what might happen, planning, anticipating, worrying ahead
- present: in the moment, describing what is, immediate experience
- mixed: moving between time periods or unclear

Output valid JSON only:
{{"emotional_tone": "scattered", "themes": ["work deadlines", "self-worth", "rest"], "time_orientation": "future"}}"""

    try:
        raw = _chat(prompt, system=system).strip()
        if not raw:
            logger.warning("Pattern extraction: Ollama returned empty response")
            return None
        # Strip markdown code block if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        # Try to find JSON object in response (in case model wrapped it in text)
        if "{" in raw and "}" in raw:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            raw = raw[start:end]
        # Fix common LLM mistake: model echoes "past" or "future" or "present" or "mixed" -> keep first value only
        raw = re.sub(r'\s+or\s+"[^"]*"\s+or\s+"[^"]*"\s+or\s+"[^"]*"', "", raw)
        data = json.loads(raw)
        emotional_tone = (data.get("emotional_tone") or "").strip() or None
        themes = data.get("themes")
        if not isinstance(themes, list):
            themes = []
        themes = [str(t).strip() for t in themes if t][:10]
        time_orientation = (data.get("time_orientation") or "").strip() or None
        if not emotional_tone and not themes and not time_orientation:
            logger.warning("Pattern extraction: parsed but all fields empty")
            return None
        return {
            "emotional_tone": emotional_tone,
            "themes": themes,
            "time_orientation": time_orientation,
        }
    except json.JSONDecodeError as e:
        logger.warning("Pattern extraction: invalid JSON (%s). Raw: %s", e, raw[:200] if raw else "")
        return None
    except Exception as e:
        logger.warning("Pattern extraction failed: %s", e)
        return None


def _parse_mood_json(raw: str):
    """Parse JSON array from LLM; tolerate missing commas between objects (e.g. \"}\" \"{\" -> \"},{\")."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Fix missing comma between array elements: "}{" -> "},{"
    fixed = re.sub(r"\}\s*\{", "},{", raw)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    # Remove trailing comma before ] if present
    fixed = re.sub(r",\s*]", "]", fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        raise


# Fallback when LLM is unavailable or thought is empty. Phrase + short description (what that feeling/scene often represents).
MOOD_SUGGESTIONS_FALLBACK = [
    {"phrase": "foggy morning", "description": "A sense of things being unclear or slow to lift."},
    {"phrase": "paused traffic", "description": "Waiting, with nowhere to go yet."},
    {"phrase": "open window", "description": "Something has shifted; a bit of air."},
    {"phrase": "low battery", "description": "Running on less than usual."},
    {"phrase": "deep water", "description": "In the middle of something that asks for patience."},
]


def get_mood_suggestions(thought: str, mirror_text: str | None = None) -> list[dict]:
    """
    Suggest 4–5 metaphor phrases (scenes) with short descriptions based on their thought and (if provided) their reflection mirror.
    Not judging—offering language they might borrow. Returns list of { "phrase": str, "description": str }.
    """
    thought = (thought or "").strip()
    mirror_text = (mirror_text or "").strip()
    if not thought and not mirror_text:
        return MOOD_SUGGESTIONS_FALLBACK

    system = """You're offering language, not diagnosis. The person just reflected on something—now they might want words to describe the internal weather of this moment.

Create 4-5 short metaphor phrases (like "foggy morning" or "low battery") that fit what they shared. Each phrase should feel like it could name something real about their experience—something they might say to a friend.

Not therapy language. Not diagnosis. Just human words for internal states."""

    context_parts = []
    if thought:
        context_parts.append(f'What they wrote: "{thought[:500]}"')
    if mirror_text:
        context_parts.append(f'Their reflection mirror (from their answers): "{mirror_text[:400]}"')
    context = "\n\n".join(context_parts)

    prompt = f"""{context}

Based on what they wrote and how their reflection landed, suggest 4-5 metaphor phrases that might fit this moment.

Each suggestion needs:
- **phrase**: 2-4 words, concrete image or scene (not emotions like "sad" or "anxious")
- **description**: One sentence explaining what this phrase often points to

Quality standards:
- Phrases should be SPECIFIC to the tone/content of their thought and mirror
- Use physical metaphors: weather, objects, locations, states of matter
- Avoid psychology jargon or emotion words
- Each phrase should feel different from the others
- Descriptions are neutral and gentle—"often means" not "you are"

Good examples:
- {{"phrase": "static between stations", "description": "That feeling of being between one thing and the next."}}
- {{"phrase": "waiting room", "description": "Sitting with something while time moves slowly."}}
- {{"phrase": "house with too many tabs open", "description": "Holding more thoughts than there's room for."}}

Avoid:
- Therapy speak: "processing," "healing journey," "inner child"
- Generic emotions: "feeling sad," "kind of anxious"
- Vague imagery: "dark cloud," "stormy seas" (overused)

Return ONLY a JSON array, nothing else:
[{{"phrase": "...", "description": "..."}}, ...]"""

    try:
        raw = _chat(prompt, system=system).strip()
        if not raw:
            return MOOD_SUGGESTIONS_FALLBACK
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if "[" in raw and "]" in raw:
            start = raw.index("[")
            end = raw.rindex("]") + 1
            raw = raw[start:end]
        data = _parse_mood_json(raw)
        if not isinstance(data, list) or len(data) == 0:
            return MOOD_SUGGESTIONS_FALLBACK
        out = []
        for i, item in enumerate(data[:5]):
            if not isinstance(item, dict):
                continue
            phrase = (item.get("phrase") or "").strip()
            desc = (item.get("description") or "").strip()
            if phrase and desc:
                out.append({"phrase": phrase[:60], "description": desc[:120]})
        return out if out else MOOD_SUGGESTIONS_FALLBACK
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Mood suggestions parse failed: %s", e)
        return MOOD_SUGGESTIONS_FALLBACK


REMINDER_MESSAGE_FALLBACK = "You wanted to come back to this reflection."


def get_reminder_message(thought: str | None = None, mirror_snippet: str | None = None) -> str:
    """
    Generate one short, gentle sentence for a revisit reminder. Wording only—no scheduling.
    If thought or mirror_snippet is provided, make it slightly personal; otherwise generic.
    """
    system = """You write one gentle sentence to remind someone to revisit their reflection. Under 15 words. No quotes. Direct and warm.

If you have context about what they wrote, make it personal. If not, keep it simple."""
    context = ""
    if (thought or "").strip():
        context = f"Thought they wrote: {(thought or '').strip()[:300]}"
    if (mirror_snippet or "").strip():
        context += f"\nMirror snippet: {(mirror_snippet or '').strip()[:200]}"
    if context:
        prompt = f"""{context}

Write one short reminder sentence (under 15 words) that would make them want to return to this reflection.

Guidelines:
- Reference something specific if you have context ("that thought about...")
- Keep it gentle—inviting, not demanding
- No generic phrases like "take time for yourself"
- Sound like a caring friend, not a productivity app

Examples:
- "That thing about your work is still worth sitting with"
- "You were noticing something important about rest"
- "Come back to what you said about time"

Write just the sentence. No quotes around it."""
    else:
        prompt = """Write one short generic reminder sentence (under 15 words) to revisit a reflection.

Sound like a caring friend, not a productivity app. No quotes."""
    try:
        out = _chat(prompt, system=system).strip()
        if out and len(out) < 120:
            return out
    except Exception as e:
        logger.warning("Reminder message generation failed: %s", e)
    return REMINDER_MESSAGE_FALLBACK


INSIGHT_LETTER_FALLBACK = "These past few days you showed up to reflect. That's worth noticing."


def get_insight_letter(reflections_summary: str) -> str:
    """
    Generate a personal insight letter (100-150 words) from the user's reflections over the past 5 days.
    Covers their raw thoughts, mirror responses, and mood metaphors in a warm, letter format.
    Second-person, observational only. No advice, no fixing, no diagnosis, no percentages or stats.
    """
    system = """You write a short, warm reflection TO someone about their past few days of thoughts. Like a thoughtful friend who's been paying attention.

STRICT FORMAT:
- EXACTLY 100-150 words (count them)
- NO greeting (no "Dear," "Hi," names)
- NO closing (no "Sincerely," signature)
- Start with a direct observation
- 2-3 short paragraphs
- No repetition

VOICE:
- "You" throughout—speaking TO them
- Observational, not analytical
- Friend who notices things, not therapist
- Simple, grounded language
- Warm but honest

CONTENT:
- What they've been circling
- Threads between their entries
- What you notice about how they're thinking
- Moments that stand out

FORBIDDEN:
- Advice or suggestions
- Questions
- Stats/counts/numbers
- The word "I"
- Any repetition
- Psychology language
- Motivation speak"""

    if not (reflections_summary or "").strip():
        prompt = """They didn't reflect much in the past 5 days.

Write exactly 100-150 words. Be warm and honest.

Acknowledge without guilt that sometimes there isn't space to pause. Notice that they're here now, which means something. Gently wonder (without asking questions) what these past few days have felt like.

No greeting, no closing. Start with a warm, direct observation. Use "you."

Not: "Dear friend, it's okay that..."
Yes: "These past few days didn't leave much room for pausing..."

No advice. No productivity guilt. No "you've got this." Just acknowledgment and gentle presence.

Count your words. 100-150 only."""
    else:
        prompt = f"""Their reflections from the past 5 days:

{reflections_summary[:2500]}

Write EXACTLY 100-150 words reflecting what you noticed across these days.

What to look for:
- Recurring themes (what keeps showing up?)
- Shifts in tone or time orientation
- What they're wrestling with vs. what they're avoiding
- Tensions between entries
- What seems to matter most, even when unspoken

Structure (weave naturally, don't label):
- Opening: What stands out across these days
- Middle: Specific observations from their entries
- Closing: Where they seem to be now

Write TO them. Make it specific to THEIR entries, not generic wisdom. No salutation, no sign-off. Start directly with what you noticed.

Count your words. 100-150 only."""

    try:
        out = _chat(prompt, system=system).strip()
        # Remove any accidental salutation
        lines = out.split('\n')
        if lines and lines[0].strip().lower().startswith(('dear', 'hi ', 'hello', 'hey')):
            out = '\n'.join(lines[1:]).strip()
        # Check reasonable length (100-150 words is roughly 500-900 chars)
        if out and 200 < len(out) < 1200:
            return out
    except Exception as e:
        logger.warning("Insight letter generation failed: %s", e)
    return INSIGHT_LETTER_FALLBACK


# Backwards compatibility alias
def get_weekly_insight_letter(reflections_summary: str) -> str:
    """Alias for get_insight_letter for backwards compatibility."""
    return get_insight_letter(reflections_summary)


# In-memory cache for mood-to-feeling conversions (avoids repeated LLM calls)
_mood_feeling_cache: dict[str, str] = {}


def convert_moods_to_feelings(mood_metaphors: list[str]) -> list[dict]:
    """
    Convert a list of mood metaphors to human-relatable feelings.
    Uses in-memory cache to avoid repeated LLM calls.
    Returns list of { "original": str, "feeling": str }.
    """
    if not mood_metaphors:
        return []
    unique_moods = list(dict.fromkeys([m.strip() for m in mood_metaphors if m.strip()]))[:12]
    if not unique_moods:
        return []
    
    # Check cache first - find which moods need LLM conversion
    result = []
    uncached_moods = []
    for mood in unique_moods:
        if mood.lower() in _mood_feeling_cache:
            result.append({"original": mood, "feeling": _mood_feeling_cache[mood.lower()]})
        else:
            uncached_moods.append(mood)
    
    # If all moods are cached, return immediately
    if not uncached_moods:
        return result
    
    # Convert uncached moods via LLM
    system = """Convert mood metaphors to human-relatable feelings. The kind of words someone would actually use to describe how they feel to a friend.

Return JSON array only.
Each item: {"original": "the metaphor", "feeling": "1-4 word feeling description"}

Examples:
- {"original": "foggy morning", "feeling": "a bit unclear"}
- {"original": "open window", "feeling": "quietly hopeful"}
- {"original": "deep water", "feeling": "in the thick of it"}"""

    prompt = f"""Convert these mood metaphors to simple human feelings (how someone would actually describe this state):

{json.dumps(uncached_moods)}

For each metaphor, provide:
- **original**: the exact metaphor (copy it exactly)
- **feeling**: 1-4 words describing how someone in this state might describe it

Guidelines:
- Use everyday language people actually say
- Not clinical: ✗ "experiencing anxiety" → ✓ "on edge"
- Not poetic: ✗ "adrift in uncertainty" → ✓ "not sure where to go"
- Capture the essence simply

Examples of good conversions:
- "waiting room" → "in between things"
- "low battery" → "running on empty"
- "static between stations" → "can't quite focus"
- "house with windows open" → "a little lighter"

Return JSON array only:
[{{"original": "...", "feeling": "..."}}, ...]"""
    
    try:
        raw = _chat(prompt, system=system).strip()
        if not raw:
            for m in uncached_moods:
                _mood_feeling_cache[m.lower()] = m
                result.append({"original": m, "feeling": m})
            return result
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if "[" in raw and "]" in raw:
            start = raw.index("[")
            end = raw.rindex("]") + 1
            raw = raw[start:end]
        data = json.loads(raw)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    orig = (item.get("original") or "").strip()
                    feel = (item.get("feeling") or orig).strip()[:50]
                    if orig:
                        _mood_feeling_cache[orig.lower()] = feel
                        result.append({"original": orig, "feeling": feel})
            # Handle any uncached moods that weren't in the LLM response
            for m in uncached_moods:
                if m.lower() not in _mood_feeling_cache:
                    _mood_feeling_cache[m.lower()] = m
                    result.append({"original": m, "feeling": m})
            return result if result else [{"original": m, "feeling": m} for m in unique_moods]
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Batch mood conversion failed: %s", e)
    return [{"original": m, "feeling": m} for m in unique_moods]


# ============================================================================
# Public API for Pattern Analyzer
# ============================================================================

def llm_chat(prompt: str, system: str | None = None) -> str:
    """
    Public chat function for use by pattern_analyzer.py and other modules.
    Same as internal _chat but exposed for external use.
    """
    return _chat(prompt, system)


def _build_reflections_summary_simple(reflections: list[dict]) -> str:
    """
    Simple summary builder for shallow fallback analysis.
    Used by pattern_analyzer.py when deep analysis fails.
    """
    parts = []
    for r in reflections[:20]:
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
