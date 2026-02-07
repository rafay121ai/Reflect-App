"""
OpenRouter client for REFLECT – uses OpenRouter API for reflections.
Set LLM_PROVIDER=openrouter and OPENROUTER_API_KEY in .env.
"""
import json
import logging
import os
import re
import httpx

from ollama_client import (
    _parse_sections,
    _parse_mood_json,
    REFLECTION_MODE_CONFIGS,
    MOOD_SUGGESTIONS_FALLBACK,
    REMINDER_MESSAGE_FALLBACK,
    INSIGHT_LETTER_FALLBACK,
)

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini"


def _chat(prompt: str, system: str | None = None) -> str:
    """Send a prompt to OpenRouter and return the assistant message content."""
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    with httpx.Client(timeout=120.0) as client:
        r = client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://reflect-app.local",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
            },
        )
        r.raise_for_status()
        data = r.json()
        choice = (data.get("choices") or [None])[0]
        if not choice:
            return ""
        return (choice.get("message") or {}).get("content") or ""


def get_reflection(thought: str, reflection_mode: str = "gentle") -> list[dict]:
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

    required = [
        ("What This Feels Like", "feels like", "Something here is worth noticing. Take a breath."),
        ("Where You're Stuck", "stuck", "There's a place you're circling. No need to fix it yet."),
        ("What You Believe Right Now", "believe", "One quiet belief is sitting in this. You can just notice it."),
        ("Why This Matters to You", "matters", "This touches something that matters to you. That's enough to name."),
        ("Some Things to Notice", "notice", "What do you notice right now?\nWhat feels most important?\nWhat do you need?"),
        ("A Mirror", "mirror", raw.strip() if raw.strip() else "What you shared is worth sitting with. Be gentle with yourself."),
    ]
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
            logger.warning("Pattern extraction: OpenRouter returned empty response")
            return None
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if "{" in raw and "}" in raw:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            raw = raw[start:end]
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


def get_mood_suggestions(thought: str, mirror_text: str | None = None) -> list[dict]:
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


def get_reminder_message(thought: str | None = None, mirror_snippet: str | None = None) -> str:
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


def get_insight_letter(reflections_summary: str) -> str:
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
        lines = out.split('\n')
        if lines and lines[0].strip().lower().startswith(('dear', 'hi ', 'hello', 'hey')):
            out = '\n'.join(lines[1:]).strip()
        if out and 200 < len(out) < 1200:
            return out
    except Exception as e:
        logger.warning("Insight letter generation failed: %s", e)
    return INSIGHT_LETTER_FALLBACK


def get_weekly_insight_letter(reflections_summary: str) -> str:
    return get_insight_letter(reflections_summary)


# In-memory cache for mood-to-feeling conversions
_mood_feeling_cache: dict[str, str] = {}


def convert_moods_to_feelings(mood_metaphors: list[str]) -> list[dict]:
    if not mood_metaphors:
        return []
    unique_moods = list(dict.fromkeys([m.strip() for m in mood_metaphors if m.strip()]))[:12]
    if not unique_moods:
        return []

    result = []
    uncached_moods = []
    for mood in unique_moods:
        if mood.lower() in _mood_feeling_cache:
            result.append({"original": mood, "feeling": _mood_feeling_cache[mood.lower()]})
        else:
            uncached_moods.append(mood)

    if not uncached_moods:
        return result

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
            for m in uncached_moods:
                if m.lower() not in _mood_feeling_cache:
                    _mood_feeling_cache[m.lower()] = m
                    result.append({"original": m, "feeling": m})
            return result if result else [{"original": m, "feeling": m} for m in unique_moods]
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Batch mood conversion failed: %s", e)
    return [{"original": m, "feeling": m} for m in unique_moods]


def llm_chat(prompt: str, system: str | None = None) -> str:
    return _chat(prompt, system)
