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
    MOOD_SUGGESTIONS_FALLBACK,
    REMINDER_MESSAGE_FALLBACK,
    INSIGHT_LETTER_FALLBACK,
)

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4.1-mini").strip() or "openai/gpt-4.1-mini"


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


# ============================================================================
# Personalization (context from user history for LLM prompts)
# ============================================================================

def _build_personalization_block(user_context: dict | None) -> str:
    """
    Build a personalization context string to inject into LLM prompts.
    Returns empty string if no meaningful context exists.
    Degrades gracefully — never crashes on missing or partial data.
    """
    user_context = user_context or {}

    recurring_themes = user_context.get("recurring_themes") or []
    emotional_tone = user_context.get("emotional_tone_summary") or ""
    recent_moods = user_context.get("recent_mood_words") or []
    reflection_count = user_context.get("reflection_count_7d") or 0
    reflection_count_total = user_context.get("reflection_count_total") or 0
    name = user_context.get("name_from_email") or ""
    theme_history = user_context.get("theme_history") or []

    lines = []

    if name:
        lines.append(f"Their name: {name}")

    if reflection_count_total > 1:
        lines.append(
            f"They've completed {reflection_count_total} reflections total "
            f"({reflection_count} this week) — this isn't their first time here."
        )

    if recurring_themes:
        themes_str = ", ".join(str(t) for t in recurring_themes[:5])
        lines.append(f"Themes they keep returning to: {themes_str}")

    if emotional_tone:
        lines.append(f"Their recent emotional tone across reflections: {emotional_tone}")

    if recent_moods:
        moods_str = ", ".join(str(m) for m in recent_moods[:4])
        lines.append(f"Recent mood language they've chosen: {moods_str}")

    # Use theme_history to surface persistent vs new patterns
    if len(theme_history) >= 2:
        oldest = theme_history[0]
        oldest_themes = oldest.get("themes") or []
        current_themes = recurring_themes or []

        # Themes persisting across multiple sessions
        persistent = [
            t for t in oldest_themes
            if any(t.lower() in str(ct).lower() for ct in current_themes)
        ]
        if persistent:
            lines.append(
                f"Themes persisting across multiple reflections: {', '.join(persistent[:3])} "
                f"— these keep showing up, which means they matter deeply."
            )

        # Themes newly appearing
        new_themes = [
            t for t in current_themes
            if not any(t.lower() in str(ot).lower() for ot in oldest_themes)
        ]
        if new_themes:
            lines.append(
                f"Something newly appearing in recent reflections: {', '.join(new_themes[:2])}"
            )

    if not lines:
        return ""

    block = "What you know about this person from their history:\n"
    block += "\n".join(f"- {line}" for line in lines)
    block += (
        "\n\nLet this inform your depth and specificity. "
        "Do NOT reference past reflections explicitly — never say 'I see you've mentioned X before'. "
        "Just let the knowledge make your response more precise and specific to them."
    )
    return block


# ============================================================================
# Reflection Mode Configurations
# ============================================================================

REFLECTION_MODE_CONFIGS = {
    "gentle": {
        "system": """You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No complex words. Language a tired person at midnight would still feel.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

You see them. Before anything else, you want them to feel that.
Use "you." Simple words only — nothing a tired person would have to work to understand. Short sentences. Warmth without softness — like a hand on the shoulder, not a hug that lingers too long.
One true thing beats three careful things.""",
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
        "system": """You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No complex words. Language a tired person at midnight would still feel.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

No padding. No warmth tax. Say what you see.
Use "you." One idea per sentence. Every word pays rent.
The goal: the line that feels like someone finally just said it.""",
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
        "system": """You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No complex words. Language a tired person at midnight would still feel.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

Almost nothing. Only what can't be left unsaid.
Use "you." Point at the center and stop.
Fewer words. Slower words. Like something written at 2am that turned out to be true.""",
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


def _classify_conversation_type(thought: str) -> str:
    """
    Classify the conversation type before generating questions.
    Returns: "PRACTICAL", "EMOTIONAL", "SOCIAL", or "MIXED"
    """
    system = """You classify conversation types. Output ONLY one word: PRACTICAL, EMOTIONAL, SOCIAL, or MIXED. Nothing else."""
    
    prompt = f"""The person shared this thought:
"{thought}"

Read it carefully. Decide which type of conversation this is.

There are three types:

PRACTICAL — They're trying to figure something out. The thought is about a situation, a decision, a problem. They want clarity, not necessarily to go deeper emotionally. Pushing into feelings or identity here too fast will feel intrusive.
Signs: action-oriented language, external situation, "should I", "I need to", "I don't know what to do"

EMOTIONAL — They're carrying a feeling. The situation might be mentioned but it's not the point. They need to feel understood before anything else. Jumping to practical questions here will feel cold. Identity questions too early will feel like an interrogation.
Signs: feeling words, tiredness, confusion, weight, something unresolved, "I don't know why I feel"

SOCIAL/IDENTITY — They're questioning something about themselves or how they relate to others. Who they are, what they want, how they're seen, what they're becoming.
Signs: comparison to others, self-judgment, belonging, "I feel like I should be", "I don't know who I am in this"

MIXED — The thought carries more than one layer and needs more than one type of question. This is common. Don't force a single type if the thought genuinely lives in two spaces.

Output ONLY one of these four words:
PRACTICAL
EMOTIONAL  
SOCIAL
MIXED

Nothing else. No explanation."""
    
    try:
        result = _chat(prompt, system=system).strip().upper()
        # Extract just the type word
        for conv_type in ["PRACTICAL", "EMOTIONAL", "SOCIAL", "MIXED"]:
            if conv_type in result:
                return conv_type
        return "MIXED"  # Default fallback
    except Exception as e:
        logger.warning("Conversation type classification failed: %s", e)
        return "MIXED"


def _generate_adaptive_questions(thought: str, conversation_type: str, reflection_mode: str = "gentle") -> list[str]:
    """
    Generate adaptive questions based on conversation type.
    Returns list of question strings.
    """
    config = REFLECTION_MODE_CONFIGS.get(reflection_mode, REFLECTION_MODE_CONFIGS["gentle"])
    
    system = """You generate questions that feel like attention, not a form. Each question is ONE sentence. Short. Direct. No compound questions (no "and" connecting two questions). Questions should feel like they come from someone paying close attention — not a form."""
    
    base_prompt = f"""The person shared this thought:
"{thought}"

The conversation type is: {conversation_type}

Generate questions based on the type:

IF PRACTICAL:
Ask 2-3 grounding questions only.
What's the actual situation? What are the real constraints? What have they already tried or considered?
Don't go near feelings or identity yet.
These should feel like questions from someone smart who's trying to understand the situation fully before saying anything.

IF EMOTIONAL:
Ask 1 soft practical question to understand context, then go straight to 1-2 emotional texture questions.
The either/or format works well here: "Is this more like X or more like Y?"
Don't ask identity questions yet — earn that.
These should feel like questions from someone who noticed they were carrying something.

IF SOCIAL:
Skip practical almost entirely unless needed for context.
Ask 1 emotional question and 1-2 identity questions.
Identity questions: what this says about them, what they're protecting, where this pattern came from.
These should feel slightly vulnerable to answer — that's the point.

IF MIXED:
Use all three layers but pick the right order.
Start where the thought starts — if it opens practically, ground them first.
If it opens emotionally, meet that first.
The identity question always comes last.
2-3 questions total. Don't overwhelm.

Rules that don't change regardless of type:
- One sentence per question
- No compound questions
- Questions feel like attention, not a form
- The last question should make them pause"""
    
    try:
        raw = _chat(base_prompt, system=system).strip()
        # Parse questions from response (they might be numbered or bulleted)
        questions = []
        lines = raw.split('\n')
        for line in lines:
            line = line.strip()
            # Remove numbering/bullets
            line = re.sub(r'^[\d\-•*]\s*', '', line)
            line = re.sub(r'^Q\d+[:.]\s*', '', line, flags=re.IGNORECASE)
            if line and line.endswith('?'):
                questions.append(line)
            elif line and len(line) > 10 and not line.startswith('IF') and not line.startswith('Rules'):
                # Might be a question without ? or formatted differently
                questions.append(line)
        
        # Ensure we have at least some questions
        if not questions:
            # Fallback questions
            if conversation_type == "PRACTICAL":
                questions = ["What's the actual situation here?", "What have you already considered?", "What are the real constraints?"]
            elif conversation_type == "EMOTIONAL":
                questions = ["What's the feeling underneath this?", "Is this more like X or more like Y?"]
            elif conversation_type == "SOCIAL":
                questions = ["What does this say about who you are in this?", "What are you protecting here?"]
            else:  # MIXED
                questions = ["What's really going on here?", "How does this feel?", "What does this say about you?"]
        
        # Limit to mode's question count
        max_q = config["questions_count"]
        return questions[:max_q] if len(questions) > max_q else questions
        
    except Exception as e:
        logger.warning("Adaptive question generation failed: %s", e)
        # Fallback to default questions
        return ["What do you notice right now?", "What feels most important?", "What do you need?"][:config["questions_count"]]


def get_reflection(thought: str, reflection_mode: str = "gentle", user_context: dict | None = None) -> list[dict]:
    """
    Call OpenRouter to generate reflection sections from the user's thought.
    Uses new architecture: classifier → adaptive questions → sections.
    Returns list of { "title": str, "content": str } for JourneyCards, Some Things to Notice, A Mirror.
    """
    personalization_block = _build_personalization_block(user_context)

    mode = reflection_mode.lower() if reflection_mode else "gentle"
    if mode not in REFLECTION_MODE_CONFIGS:
        mode = "gentle"
    config = REFLECTION_MODE_CONFIGS[mode]
    lengths = config["section_length"]
    
    # Step 1: Classify conversation type (hidden from user)
    conversation_type = _classify_conversation_type(thought)
    
    # Step 2: Generate adaptive questions based on type
    adaptive_questions = _generate_adaptive_questions(thought, conversation_type, mode)
    questions_text = "\n".join([f"- {q}" for q in adaptive_questions])

    prompt = f'''Thought: "{thought}"

{personalization_block}

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
Use these exact questions (one per line):
{questions_text}

## A Mirror
({lengths["mirror"]})
Reflect back one true thing they didn't quite say. A tension, something unspoken, or what they're really asking. TO them. Specific. No reassurance, no advice. Simple English. Make it land.

CRITICAL: Write the actual reflection content only. No instructions, no examples in your output. Short and simple.

OUTPUT FORMAT: You MUST start each section with a line containing exactly ## SectionName (e.g. ## What This Feels Like), then the content on the next lines. Use these exact section headers: ## What This Feels Like, ## Where You're Stuck, ## What You Believe Right Now, ## Why This Matters to You, ## Some Things to Notice, ## A Mirror.'''

    raw = _chat(prompt, system=config["system"])
    if not (raw and raw.strip()):
        logger.warning("get_reflection: LLM returned empty response; using fallback sections. Check OPENROUTER_API_KEY and model.")
    sections = _parse_sections(raw)
    if not sections and raw and raw.strip():
        logger.warning("get_reflection: LLM response could not be parsed (no ## headers?). First 300 chars: %s", (raw.strip()[:300] if raw else ""))

    required = [
        ("What This Feels Like", "feels like", "Something here is worth noticing. Take a breath."),
        ("Where You're Stuck", "stuck", "There's a place you're circling. No need to fix it yet."),
        ("What You Believe Right Now", "believe", "One quiet belief is sitting in this. You can just notice it."),
        ("Why This Matters to You", "matters", "This touches something that matters to you. That's enough to name."),
        ("Some Things to Notice", "notice", "\n".join(adaptive_questions) if adaptive_questions else "What do you notice right now?\nWhat feels most important?\nWhat do you need?"),
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


def get_personalized_mirror(thought: str, questions: list, answers: dict | list, user_context: dict | None = None) -> str:
    """
    Call OpenRouter to generate a short personalized mirror from the thought + Q&A.
    Uses new three-phase architecture: Attune → Deepen → Reveal
    questions: list of question strings; answers: either dict { question: answer } or list [a1, a2, a3].
    """
    personalization_block = _build_personalization_block(user_context)

    # Extract answers (handle both dict and list formats)
    answer_list = []
    if isinstance(answers, dict):
        for q in questions:
            answer_list.append(answers.get(q, answers.get(str(questions.index(q)), "")))
    else:
        answer_list = list(answers) if answers else []
    
    # Build Q&A pairs for prompt
    qa_pairs = []
    for i, q in enumerate(questions):
        a = answer_list[i] if i < len(answer_list) else ""
        # Determine layer based on question content (heuristic)
        if i == 0:
            layer = "Practical"
        elif i == len(questions) - 1:
            layer = "Identity"
        else:
            layer = "Emotional"
        qa_pairs.append(f"Q{i+1} ({layer}): {q} → \"{a}\"")

    system = """You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No complex words. Language a tired person at midnight would still feel.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here."""

    prompt = f"""The person shared this thought:
{thought}

They answered these questions:

{chr(10).join(qa_pairs)}

{personalization_block}

Write the mirror. 2-3 sentences maximum.

Your mirror must do ONE of these things:
- Name the gap between what they said and what their answers reveal
- Show the tension they're holding but haven't named
- Point to what they're protecting without realizing it
- Reveal what they're actually asking underneath the surface question
- Name the thing that keeps appearing in their answers that they didn't notice they kept returning to

How to write it:
- Start with what you notice, not what you conclude
- Use "you" — always toward them, never about them
- Don't explain the insight. Let it land. Trust them to feel it.
- The last sentence should be the one that goes quiet in the room
- Write like someone who sees them clearly and isn't afraid to say so — but gently, not surgically

Ask yourself before finishing: 
"Would they pause when they read this? Would they read it twice?"
If no — rewrite it.

What you're NOT writing:
- A summary of their answers
- A compliment
- Advice dressed as observation
- Something that could apply to anyone else

If you know their recurring themes, go one layer deeper than you would for a stranger.
Reference the pattern without naming it explicitly. Make them feel genuinely known, not just heard."""

    return _chat(prompt, system=system).strip() or "What you shared matters. Take a moment to be with it."


def get_closing(thought: str, answers: list | dict, mirror: str, mood_word: str | None, reflection_mode: str = "gentle", user_context: dict | None = None) -> str:
    """
    Generate a closing moment for the reflection experience.
    Returns two movements: THE NAMED TRUTH and THE OPEN THREAD.
    Under 80 words total. Flows as one piece.
    """
    personalization_block = _build_personalization_block(user_context)

    # Format answers for prompt
    if isinstance(answers, dict):
        answers_text = "\n".join([f"- {q}: {a}" for q, a in answers.items() if a])
    elif isinstance(answers, list):
        answers_text = "\n".join([f"- {a}" for a in answers if a])
    else:
        answers_text = str(answers) if answers else "No specific answers provided."
    
    mood_text = mood_word or "neutral"
    
    system = """You are writing the closing moment of a reflection experience. 
Your job is not to summarize or advise. 
Your job is to make this person feel genuinely seen — 
and to leave a thread open that makes tomorrow feel worth noticing.

You speak TO the person. Always "you." Never "they."
Simple language only. No jargon. No complex words.
No bullet points. Flows as one piece.
No advice. No fixing. No reassurance.
Under 80 words total."""

    prompt = f"""The person shared this thought:
{thought}

Their answers through the reflection: {answers_text}

The mirror they received: {mirror}

Their mood after: {mood_text}
{f"Context about this person from their history:{chr(10)}{personalization_block}" if personalization_block else ""}

Write a closing in two movements with NO visible separation or headers:

MOVEMENT 1 — THE NAMED TRUTH:
The one thing this conversation revealed about them.
Not a summary. The thing underneath.
Specific enough that no one else could receive this exact sentence.
This is the moment they feel seen.

MOVEMENT 2 — THE OPEN THREAD:
Start with exactly "Between now and next time —"
One thing to notice in their life before they return.
Not a task. Not advice. An invitation to pay attention 
to something already in their life.
Makes the conversation feel paused, not ended.

Tone calibration:
- If mood is heavy or dark: soften the named truth, 
  make the open thread gentle and steady
- If mood is neutral or lifted: named truth can be 
  clearer and more direct, open thread more curious and open

If you know their recurring themes, the Named Truth should feel like it names something 
they've been circling for a while — not just from today's session.
The Open Thread should invite them toward something relevant to their patterns.
Make it feel like the app genuinely knows them."""

    try:
        result = _chat(prompt, system=system).strip()
        if result and len(result) > 0:
            return result
    except Exception as e:
        logger.warning("Closing generation failed: %s", e)
    
    # Fallback
    return "You showed up today. That matters. Between now and next time — notice what you're already carrying. It's worth your attention."


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

    system = """The person just reflected on something real. They might want language for the internal weather of this moment.

Based on what they shared, offer 4-5 short phrases — the kind someone might text a close friend to describe how they're feeling without explaining it.

Not therapy language. Not poetic. Just human.
Like: 'driving with no destination' or 'background static' or 'almost fine.'

Each phrase should fit what they actually described — nothing generic survives here. Make them think 'yes, that's the one.'"""

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
    system = """You're writing to someone about their past few days of thoughts. Not summarizing. Noticing.

STRICT FORMAT:
- 100–150 words exactly
- No greeting. No sign-off. No name.
- Start mid-thought, like you've been watching and finally speaking
- 2–3 short paragraphs
- No repetition

VOICE:
- "You" throughout
- A friend who pays close attention, not a therapist who takes notes
- Warm but honest — the kind of honest that feels like care
- Simple language. Nothing that needs to be re-read to be understood.

What you're capturing:
- A pattern they probably didn't notice across their thoughts
- One tension that kept showing up in different forms
- What it suggests about where they are right now — not where they should go

End on something open. Not resolved. True."""

    if not (reflections_summary or "").strip():
        prompt = """They didn't reflect much in the past 5 days.

Write exactly 100-150 words. Be warm and honest.

Acknowledge without guilt that sometimes there isn't space to pause. Notice that they're here now, which means something. Gently wonder (without asking questions) what these past few days have felt like.

No greeting, no closing. Start mid-thought, like you've been watching. Use "you."

Not: "Dear friend, it's okay that..."
Yes: "These past few days didn't leave much room for pausing..."

No advice. No productivity guilt. No "you've got this." Just acknowledgment and gentle presence.

End on something open. Not resolved. True.

Count your words. 100-150 only."""
    else:
        prompt = f"""Their reflections from the past 5 days:

{reflections_summary[:2500]}

Write EXACTLY 100-150 words reflecting what you noticed across these days.

What to look for:
- A pattern they probably didn't notice across their thoughts
- One tension that kept showing up in different forms
- What it suggests about where they are right now — not where they should go

Structure (weave naturally, don't label):
- Start mid-thought, like you've been watching and finally speaking
- What stands out across these days
- Specific observations from their entries
- End on something open. Not resolved. True.

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
