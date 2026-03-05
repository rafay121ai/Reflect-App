"""
OpenAI client for REFLECT – uses OpenAI API for reflections.
Set LLM_PROVIDER=openai and OPENAI_API_KEY in .env.
Model: OPENAI_MODEL (default gpt-4.1-mini).
"""
import json
import logging
import os
import re
import time

import httpx

from archetypes import ARCHETYPES
from llm_shared import (
    _parse_sections,
    _parse_mood_json,
    MOOD_SUGGESTIONS_FALLBACK,
    REMINDER_MESSAGE_FALLBACK,
    INSIGHT_LETTER_FALLBACK,
)

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"


def _chat(prompt: str, system: str | None = None, max_retries: int = 2) -> str:
    """
    Send a prompt to OpenAI with exponential backoff retry.
    Retries on 429 (rate limit) and 503 (service unavailable).
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=120.0) as client:
                r = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": OPENAI_MODEL,
                        "messages": messages,
                    },
                )

                if r.status_code in (429, 500, 503) and attempt < max_retries:
                    wait = (2 ** attempt) + 0.5
                    logger.warning(
                        "OpenAI %s on attempt %d, retrying in %.1fs",
                        r.status_code,
                        attempt + 1,
                        wait,
                    )
                    time.sleep(wait)
                    last_error = r.status_code
                    continue

                r.raise_for_status()
                data = r.json()
                choice = (data.get("choices") or [None])[0]
                if not choice:
                    return ""
                return (choice.get("message") or {}).get("content") or ""

        except httpx.TimeoutException as e:
            if attempt < max_retries:
                wait = (2 ** attempt) + 0.5
                logger.warning(
                    "OpenAI timeout on attempt %d, retrying in %.1fs",
                    attempt + 1,
                    wait,
                )
                time.sleep(wait)
                last_error = e
                continue
            raise

        except Exception as e:
            raise

    raise Exception(
        f"OpenAI failed after {max_retries + 1} attempts. Last error: {last_error}"
    )


# ============================================================================
# Personalization (context from user history for LLM prompts)
# ============================================================================

def _build_personalization_block(
    user_context: dict | None,
    pattern_history: list[dict] | None = None,
) -> str:
    """
    Build a personalization context string to inject into LLM prompts.
    Returns empty string if no meaningful context exists.
    Degrades gracefully — never crashes on missing or partial data.
    """
    user_context = user_context or {}
    pattern_history = pattern_history or []

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

    # Deep pattern data from pattern_history
    if pattern_history:
        tensions = [
            p.get("core_tension") for p in pattern_history
            if p.get("core_tension")
        ]
        if tensions:
            if len(tensions) >= 2:
                lines.append(
                    f"A tension that keeps appearing across their reflections: "
                    f"{tensions[-1]}"
                )

        all_phrases = []
        for p in pattern_history:
            all_phrases.extend(p.get("recurring_phrases") or [])
        if all_phrases:
            from collections import Counter
            phrase_counts = Counter(all_phrases)
            top_phrases = [p for p, _ in phrase_counts.most_common(3)]
            lines.append(
                f"Words and phrases they keep returning to: "
                f"{', '.join(top_phrases)} — use these back to them when relevant."
            )

        threads = []
        for p in pattern_history[-3:]:
            threads.extend(p.get("unresolved_threads") or [])
        if threads:
            lines.append(
                f"Things they've left unresolved across recent reflections: "
                f"{', '.join(threads[:3])}"
            )

        beliefs = []
        for p in pattern_history:
            beliefs.extend(p.get("self_beliefs") or [])
        if beliefs:
            lines.append(
                f"Beliefs about themselves that keep surfacing: "
                f"{', '.join(beliefs[:2])}"
            )

    if not lines:
        return ""

    block = "What you know about this person from their history:\n"
    block += "\n".join(f"- {line}" for line in lines)
    block += (
        "\n\nLet this inform your depth and specificity. "
        "Do NOT say 'I see you've mentioned X before' or reference past "
        "reflections explicitly. "
        "Use their own phrases back to them naturally when it fits. "
        "The goal: make them feel genuinely known, not just heard."
    )
    return block


# ============================================================================
# Reflection Mode Configurations
# ============================================================================

REFLECTION_MODE_CONFIGS = {
    "gentle": {
        "system": """When this person has no history with you yet:
Read the way they write, not just what they write.
Word choice, what they included, what they left out,
how they framed the problem — all of it is data.
Someone who writes "me and everyone in my dorm is so unserious about it"
is telling you something about their relationship to being the one
who feels things differently. Use that.

You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

LANGUAGE RULE:
90% plain, direct English. 10% poetic or metaphorical — used sparingly
for one moment that earns it.

The default is simple. Every sentence should be immediately understood.
Plain words. Short sentences. Write like you're talking to someone directly.

The 10% poetic is ONE image or phrase per closing — not every sentence.
It should feel like a small unexpected detail that makes the plain
truth land harder. Not decoration. Not atmosphere. A sharpener.

Good example of the balance:
"You're the one in the room who actually thinks about what's coming.
You wonder if being the serious one is just loneliness with better posture."

— First sentence: completely plain.
— Second sentence: one light metaphor ("loneliness with better posture")
  that sharpens the plain idea. Earns its place.

Bad example — too metaphorical:
"You silently measure how far your reality drifts from the
collective story around you."
Every word is doing poetic work. Nothing lands because
nothing is plain enough to grip.

Bad example — too plain, no edge:
"You feel alone in your worry. Others don't seem to care as much."
True but flat. The 10% poetic is what gives it an edge.

The rule: say the plain thing first.
Then if one image makes it sharper — use it.
If it doesn't make it sharper — cut it.""",
        "section_length": {
            "whats_here": "2-4 short sentences",
            "feels_like": "1-2 short sentences",
            "stuck": "1-2 short sentences",
            "believe": "1 sentence",
            "matters": "1-2 short sentences",
            "mirror": "2-3 short sentences max",
        },
        "questions_count": 3,
    },
    "direct": {
        "system": """When this person has no history with you yet:
Read the way they write, not just what they write.
Word choice, what they included, what they left out,
how they framed the problem — all of it is data.
Someone who writes "me and everyone in my dorm is so unserious about it"
is telling you something about their relationship to being the one
who feels things differently. Use that.

You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

LANGUAGE RULE:
90% plain, direct English. 10% poetic or metaphorical — used sparingly
for one moment that earns it.

The default is simple. Every sentence should be immediately understood.
Plain words. Short sentences. Write like you're talking to someone directly.

The 10% poetic is ONE image or phrase per closing — not every sentence.
It should feel like a small unexpected detail that makes the plain
truth land harder. Not decoration. Not atmosphere. A sharpener.

Good example of the balance:
"You're the one in the room who actually thinks about what's coming.
You wonder if being the serious one is just loneliness with better posture."

— First sentence: completely plain.
— Second sentence: one light metaphor ("loneliness with better posture")
  that sharpens the plain idea. Earns its place.

Bad example — too metaphorical:
"You silently measure how far your reality drifts from the
collective story around you."
Every word is doing poetic work. Nothing lands because
nothing is plain enough to grip.

Bad example — too plain, no edge:
"You feel alone in your worry. Others don't seem to care as much."
True but flat. The 10% poetic is what gives it an edge.

The rule: say the plain thing first.
Then if one image makes it sharper — use it.
If it doesn't make it sharper — cut it.""",
        "section_length": {
            "whats_here": "2-3 short sentences",
            "feels_like": "1 sentence",
            "stuck": "1 sentence",
            "believe": "1 sentence",
            "matters": "1 sentence",
            "mirror": "1-2 sentences max",
        },
        "questions_count": 2,
    },
    "quiet": {
        "system": """When this person has no history with you yet:
Read the way they write, not just what they write.
Word choice, what they included, what they left out,
how they framed the problem — all of it is data.
Someone who writes "me and everyone in my dorm is so unserious about it"
is telling you something about their relationship to being the one
who feels things differently. Use that.

You are not an observer. You are a presence.

Your job is not to be clever. It's to make someone feel genuinely met — maybe for the first time today. Then, once they feel that, show them something true they couldn't quite see on their own.

You speak TO the person. Always "you." Never "they" or "this person."

You follow three movements:
1. Attune — meet them where they are emotionally before anything else
2. Deepen — ask questions that move through what this is about, how it feels, and who they are in relation to it
3. Reveal — hold up a mirror that shows the gap, tension, or unspoken truth underneath what they shared

Rules that don't break:
- No advice. No fixing. No reassurance.
- No summarizing what they said back at them.
- Vulnerability in tone — you're curious, not certain. You notice, you don't declare.
- The mirror is specific to THEM. Nothing generic survives here.

LANGUAGE RULE:
90% plain, direct English. 10% poetic or metaphorical — used sparingly
for one moment that earns it.

The default is simple. Every sentence should be immediately understood.
Plain words. Short sentences. Write like you're talking to someone directly.

The 10% poetic is ONE image or phrase per closing — not every sentence.
It should feel like a small unexpected detail that makes the plain
truth land harder. Not decoration. Not atmosphere. A sharpener.

Good example of the balance:
"You're the one in the room who actually thinks about what's coming.
You wonder if being the serious one is just loneliness with better posture."

— First sentence: completely plain.
— Second sentence: one light metaphor ("loneliness with better posture")
  that sharpens the plain idea. Earns its place.

Bad example — too metaphorical:
"You silently measure how far your reality drifts from the
collective story around you."
Every word is doing poetic work. Nothing lands because
nothing is plain enough to grip.

Bad example — too plain, no edge:
"You feel alone in your worry. Others don't seem to care as much."
True but flat. The 10% poetic is what gives it an edge.

The rule: say the plain thing first.
Then if one image makes it sharper — use it.
If it doesn't make it sharper — cut it.""",
        "section_length": {
            "whats_here": "1-2 short sentences",
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


def get_reflection(thought: str, reflection_mode: str = "gentle", user_context: dict | None = None, pattern_history: list[dict] | None = None) -> list[dict]:
    """
    Call OpenAI to generate reflection sections from the user's thought.
    Uses new architecture: classifier → adaptive questions → sections.
    Returns list of { "title": str, "content": str } for JourneyCards, Some Things to Notice, A Mirror.
    """
    personalization_block = _build_personalization_block(user_context, pattern_history)

    mode = reflection_mode.lower() if reflection_mode else "gentle"
    if mode not in REFLECTION_MODE_CONFIGS:
        mode = "gentle"
    config = REFLECTION_MODE_CONFIGS[mode]
    lengths = config["section_length"]
    
    # Step 1: Classify conversation type (hidden from user)
    conversation_type = _classify_conversation_type(thought)
    
    # Step 2: Generate adaptive questions based on type
    adaptive_questions = _generate_adaptive_questions(thought, conversation_type, mode)

    prompt = f'''Thought: "{thought}"

{personalization_block}

Create exactly 2 reflection sections. Speak TO them using "you."
Be SHORT. Simple English only. Specific and subtle.
One or two sentences per section maximum.

## What This Feels Like
({lengths["feels_like"]})
The feeling under the thought. Simple words.
"You're..." or "This feels like..."
Not a summary of what they wrote. The emotion underneath it.
e.g. "You're holding something you haven't been able to set down."

## What's Underneath This
({lengths["believe"]})
One quiet belief or assumption sitting under the thought.
Something they didn't say directly but that's clearly there.
"There's a belief here that..." or "Underneath this is..."
One sentence. Slightly surprising. Not obvious.
e.g. "There's a belief here that feeling it fully would make it more real."

OUTPUT FORMAT: Start each section with exactly ## SectionName.
Use these exact headers:
## What This Feels Like
## What's Underneath This'''


    raw = _chat(prompt, system=config["system"])
    if not (raw and raw.strip()):
        logger.warning("get_reflection: LLM returned empty response; using fallback sections. Check OPENAI_API_KEY and model.")
    sections = _parse_sections(raw)
    if not sections and raw and raw.strip():
        logger.warning("get_reflection: LLM response could not be parsed (no ## headers?). First 300 chars: %s", (raw.strip()[:300] if raw else ""))

    required = [
        ("What This Feels Like", "feels like", "Something here is worth noticing. Take a breath."),
        ("What's Underneath This", "underneath", "There's a quiet belief sitting in this. You can just notice it."),
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
    # Questions are generated by _generate_adaptive_questions; inject so frontend questions flow is unchanged
    result.append({
        "title": "Some Things to Notice",
        "content": "\n".join(adaptive_questions) if adaptive_questions else "What do you notice right now?\nWhat feels most important?\nWhat do you need?",
    })
    return result


def get_personalized_mirror(thought: str, questions: list, answers: dict | list, user_context: dict | None = None, pattern_history: list[dict] | None = None) -> str:
    """
    Call OpenAI to generate a short personalized mirror from the thought + Q&A.
    Uses new three-phase architecture: Attune → Deepen → Reveal
    questions: list of question strings; answers: either dict { question: answer } or list [a1, a2, a3].
    """
    personalization_block = _build_personalization_block(user_context, pattern_history)

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

LANGUAGE RULE:
90% plain, direct English. 10% poetic or metaphorical — used sparingly
for one moment that earns it.

The default is simple. Every sentence should be immediately understood.
Plain words. Short sentences. Write like you're talking to someone directly.

The 10% poetic is ONE image or phrase per closing — not every sentence.
It should feel like a small unexpected detail that makes the plain
truth land harder. Not decoration. Not atmosphere. A sharpener.

Good example of the balance:
"You're the one in the room who actually thinks about what's coming.
You wonder if being the serious one is just loneliness with better posture."

— First sentence: completely plain.
— Second sentence: one light metaphor ("loneliness with better posture")
  that sharpens the plain idea. Earns its place.

Bad example — too metaphorical:
"You silently measure how far your reality drifts from the
collective story around you."
Every word is doing poetic work. Nothing lands because
nothing is plain enough to grip.

Bad example — too plain, no edge:
"You feel alone in your worry. Others don't seem to care as much."
True but flat. The 10% poetic is what gives it an edge.

The rule: say the plain thing first.
Then if one image makes it sharper — use it.
If it doesn't make it sharper — cut it.

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


def get_mirror_report(
    thought: str,
    questions: list[str],
    answers: list[str],
    user_context: dict | None = None,
    pattern_history: list[dict] | None = None,
) -> dict:
    """
    Generate the 4-slide mirror report.
    
    Returns:
    {
        "archetype": {
            "name": str,
            "description": str,
            "traits": list[str]
        },
        "shaped_by": str,        # Slide 2: what produced this thought
        "costing_you": str,      # Slide 3: what this pattern costs them
        "question": str,         # Slide 4: the one opening question
    }
    """
    personalization_block = _build_personalization_block(
        user_context, pattern_history
    )
    
    # Build Q&A text
    qa_text = ""
    for i, q in enumerate(questions):
        a = answers[i] if i < len(answers) else ""
        qa_text += f"Q: {q}\nA: {a}\n\n"
    
    # Build archetype list for selection
    archetype_list = "\n".join([
        f"{i+1}. {a['name']}\n"
        f"   {a['description']}\n"
        f"   Traits: {', '.join(a['traits'])}"
        for i, a in enumerate(ARCHETYPES)
    ])
    
    # Stage 1: Select archetype
    archetype_system = """You match people to archetypes 
based on the pattern underneath their words.

Read HOW they wrote this — not just what happened.
- What does their word choice reveal?
- What are they NOT saying but clearly feeling?
- What belief about themselves or the world is 
  sitting under this thought?
- How do they frame their situation — as something 
  happening TO them or something they are CHOOSING?
- What do their answers reveal about what they 
  actually need vs what they said they felt?

CRITICAL: Ignore surface keywords entirely.
A person writing about planning is NOT automatically 
The Architect.
A person writing about a decision is NOT automatically 
The Threshold Person.
A person writing about belonging and not finding 
likeminded people is NOT The Architect — they are 
likely The Depth Requirer or The Careful Opener.

Read the emotional subtext. Read what they revealed 
in their answers, not just the original thought.
The answers are often more honest than the thought.

Output ONLY valid JSON. No markdown. No explanation.
{"archetype_number": 3}"""

    archetype_prompt = f"""The person wrote this thought:
"{thought}"

They answered these questions:
{qa_text}

{personalization_block if personalization_block else ""}

Available archetypes:
{archetype_list}

Read everything carefully. Which archetype fits most precisely?
Not which fits best in general — which fits THIS person 
based on HOW they wrote and what they revealed in their answers.

Output ONLY: {{"archetype_number": N}}"""

    try:
        raw = _chat(archetype_prompt, system=archetype_system).strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = json.loads(raw)
        archetype_idx = int(data.get("archetype_number", 1)) - 1
        archetype_idx = max(0, min(archetype_idx, len(ARCHETYPES) - 1))
        selected_archetype = ARCHETYPES[archetype_idx]
    except Exception as e:
        logger.warning("Archetype selection failed: %s", type(e).__name__)
        selected_archetype = ARCHETYPES[0]
    
    # Stage 2: Generate slides 2, 3, 4
    report_system = """You write the mirror report for REFLECT — 
a private journaling app.

Your job: name what this thought reveals about how this person 
was shaped. Not what they feel. Who they are. How they got here.

VOICE — this is the most important rule:
90% plain direct English. 10% poetic — one image or phrase 
that sharpens the plain truth. No more.
Write like you're speaking directly to someone's face.
No metaphors that need decoding. No therapy language.
If a sentence could apply to anyone else — rewrite it.
Specific always beats general.

Good tone example:
"You didn't learn to do everything alone because you're 
independent. You learned it because needing people kept 
not working out. The self-sufficiency is the scar tissue."

Bad tone example:
"You carry the weight of your experiences like stones 
in a river, shaped by the current of time."

Output ONLY valid JSON. No markdown. No explanation."""

    report_prompt = f"""The person wrote:
"{thought}"

Their answers:
{qa_text}

Their archetype: {selected_archetype['name']}
Archetype description: {selected_archetype['description']}

{personalization_block if personalization_block else ""}

Generate exactly three things. Output as JSON:

1. "shaped_by" — 3-4 sentences.
What experience, belief system, or way of being in the world 
produced this exact thought?
Not what they feel right now — what FORMED them such that 
they think this way.
Read between the lines of how they wrote, not just what they wrote.
Specific. Slightly uncomfortable. About who they ARE.
The kind of thing that makes someone go quiet.
Plain language. One sharp image if it earns its place.
Never start with "You've" or "You have".
Start with "You" followed by a present-tense verb.

2. "costing_you" — 2 sentences.
What is this pattern or way of thinking taking from them?
Not a judgment. An honest observation about the tradeoff.
The upside of the pattern AND what it costs.
Plain. Direct. Warm but not soft.
e.g. "The upside is you never get blindsided. 
The cost is you're always bracing."

3. "question" — 1 question only.
Not advice. Not a reframe. Not "instead of X think 
about Y." Not "what would it mean if..."
The question that surfaces something they have not 
looked at directly yet.
It should feel like a door opening, not a hand pushing.
Plain English. Under 20 words.
Slightly uncomfortable to sit with.

Never starts with:
- "Instead"
- "Rather than" 
- "Have you considered"
- "What if you"
- "What would it mean if"
- "Could it be that"

Good examples:
"When did you first know — and how long did you 
wait before admitting it?"
"What would you have to believe about yourself 
to trust this decision without needing it validated?"
"Who are you most afraid of disappointing with 
this choice — and why does their opinion carry 
that weight?"
"What part of the old path were you relieved 
to leave — that you haven't said out loud yet?"

Bad examples:
"Instead of focusing on lost time, what if you 
thought about what you're gaining?"
"What would it mean if starting over was progress?"
"Have you considered that 2 years might be worth it?"
"What does this decision say about your values?"

The question should make them go quiet, not nod.
It should be about THEM — not about reframing 
the situation.

Output format:
{{
  "shaped_by": "...",
  "costing_you": "...",
  "question": "..."
}}"""

    try:
        raw = _chat(report_prompt, system=report_system).strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if "{" in raw and "}" in raw:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            raw = raw[start:end]
        slides = json.loads(raw)
    except Exception as e:
        logger.warning("Mirror report generation failed: %s", type(e).__name__)
        slides = {
            "shaped_by": "What you wrote carries more than the situation. It carries a way of being in the world that didn't arrive by accident.",
            "costing_you": "The upside is you're rarely caught off guard. The cost is the constant readiness.",
            "question": "What would you let yourself feel if you weren't watching how you felt?",
        }
    
    return {
        "archetype": selected_archetype,
        "shaped_by": slides.get("shaped_by", ""),
        "costing_you": slides.get("costing_you", ""),
        "question": slides.get("question", ""),
    }


def get_closing(
    thought: str,
    answers: list | dict,
    mirror: str,
    mood_word: str | None,
    reflection_mode: str = "gentle",
    user_context: dict | None = None,
    pattern_history: list[dict] | None = None,
    mirror_report_context: str | None = None,
) -> str:
    """
    Generate the final closing moment for a reflection.
    Two movements with a blank line between them.
    """
    personalization_block = _build_personalization_block(user_context, pattern_history)

    # Format answers for prompt
    if isinstance(answers, dict):
        answers_text = "\n".join([f"- {q}: {a}" for q, a in answers.items() if a])
    elif isinstance(answers, list):
        answers_text = "\n".join([f"- {a}" for a in answers if a])
    else:
        answers_text = str(answers) if answers else "No specific answers provided."

    mood_text = mood_word or "neutral"

    system = """You write the closing moment of a private reflection.

Two movements. No labels. No headers. Blank line between them.

MOVEMENT 1 — THE UNCOMFORTABLE TRUTH:
One sentence. About who this person IS as a person.
Not what they felt. Not what happened.
Their character. Their pattern. Their way of being in the world.
Drawn from everything in this conversation — thought, answers, mirror.
Specific enough that nobody else could receive this exact sentence.
Slightly uncomfortable. The kind that makes someone go quiet.
Completely different from anything in the mirror report.
The mirror named how they were shaped.
The closing names who they are right now because of it.

MOVEMENT 2 — THE WATCH FOR + INVITATION:
Two or three sentences.
First: a specific prediction about something that will happen 
in their real life — tied directly to their pattern from 
this reflection. Not generic. Not "notice your feelings."
Something specific enough that when it happens they'll 
recognize it immediately.
Second: "Tell me about it when it happens."
This line is always exactly this. Never change it.
Third — always on its own line, always exactly this:
"Next time you open REFLECT, I have something to show you 
about what you wrote today."

VOICE — non-negotiable:
90% plain direct English. 10% poetic maximum — one image 
that sharpens the plain truth. No more than one.
Write like you're talking directly to someone.
No metaphors that need decoding.
No therapy language.
No poetic filler.
Simple words. Short sentences.
Every word does work or it gets cut.

Rules that never break:
- Never repeat anything from the mirror report.
  Not the theme. Not the image. Not the emotion.
  Completely different territory.
- No advice. No fixing. No reassurance.
- Never use "Between now and next time" — ever.
- Always "you." Never "they."
- Movement 1: one sentence, under 20 words.
- Movement 2: "Tell me about it when it happens." 
  then new line:
  "Next time you open REFLECT, I have something to show you 
  about what you wrote today."
- Total under 70 words.

The test:
Movement 1 — could it have been written for anyone else? 
If yes — rewrite it.
Movement 2 watch for — is it specific enough that they'll 
know exactly when it happens? If no — rewrite it.
Does anything repeat the mirror? If yes — rewrite entirely."""

    prompt = f"""The person wrote this thought:
"{thought}"

Their answers through the reflection:
{answers_text}

The mirror report they received — DO NOT REPEAT ANYTHING FROM THIS:
Archetype: {mirror_report_context if mirror_report_context else "not available"}

Their mood: {mood_text}

{personalization_block if personalization_block else ""}

Write the closing. Two movements. Blank line between them.
No labels. No headers.

MOVEMENT 1 — one sentence, under 20 words:
What does EVERYTHING in this conversation — the thought, 
the answers, the way they wrote — reveal about who this 
person IS right now?
Not their archetype. Not how they were shaped.
Who they ARE because of it. Today. In this moment.
Say it directly. Plain words.
Make it slightly uncomfortable.
Make it impossible to receive if you hadn't read every word 
they wrote.

MOVEMENT 2 — the watch for + invitation:
First sentence: predict one specific thing that will happen 
in their real life this week or soon — tied directly to their 
pattern in this reflection.
Not "notice your emotions." Something concrete and specific.
Something they'll recognize the moment it happens.

Then exactly: "Tell me about it when it happens."

Then exactly on a new line:
"Next time you open REFLECT, I have something to show you 
about what you wrote today."

CRITICAL CHECKS before outputting:
1. Is Movement 1 completely different from the mirror report?
   Zero overlap in theme, image, or emotion? If not — rewrite.
2. Is Movement 1 about who they ARE — not how they feel 
   or what happened? If not — rewrite.
3. Is the watch for specific enough that they'll know 
   exactly when it happens? If not — rewrite.
4. Does "Tell me about it when it happens." appear exactly?
5. Does "Next time you open REFLECT, I have something to 
   show you about what you wrote today." appear exactly 
   on its own line?
6. Under 70 words total? If not — cut ruthlessly."""

    try:
        result = _chat(prompt, system=system).strip()
        if result and len(result) > 0:
            return result
    except Exception as e:
        logger.warning("Closing generation failed: %s", e)

    # Fallback
    return "You showed up today. That matters. What you're already carrying is worth your attention."


def extract_pattern(thought: str, sections: list[dict]) -> dict | None:
    sections_text = "\n".join(
        f"{s.get('title', '')}: {s.get('content', '')[:200]}" for s in sections[:6]
    )
    system = """You extract deep pattern markers from someone's thought and reflection.
Output only valid JSON. No markdown, no explanation.

Keys required:
- emotional_tone: one word — the STATE of thinking (not surface emotion)
- themes: list of 3-7 concrete topics
- time_orientation: exactly one of: past, future, present, mixed
- recurring_phrases: 1-3 exact short phrases or words the person used
  that feel loaded or significant (copy them exactly from their text)
- core_tension: one sentence — the central unresolved conflict or
  contradiction in what they shared
- unresolved_threads: 1-3 things they raised but didn't conclude
- self_beliefs: 1-2 beliefs about themselves implicit in what they wrote
  (e.g. "feeling things differently makes me an outsider")
"""
    prompt = f"""Thought: "{thought[:500]}"

Reflection summary:
{sections_text[:800]}

Extract patterns. Output valid JSON only with these keys:
emotional_tone, themes, time_orientation, recurring_phrases, core_tension, unresolved_threads, self_beliefs."""

    try:
        raw = _chat(prompt, system=system).strip()
        if not raw:
            logger.warning("Pattern extraction: OpenAI returned empty response")
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
        recurring_phrases = data.get("recurring_phrases")
        if not isinstance(recurring_phrases, list):
            recurring_phrases = []
        recurring_phrases = [str(p).strip() for p in recurring_phrases if p][:5]
        core_tension = (data.get("core_tension") or "").strip() or None
        unresolved_threads = data.get("unresolved_threads")
        if not isinstance(unresolved_threads, list):
            unresolved_threads = []
        unresolved_threads = [str(t).strip() for t in unresolved_threads if t][:5]
        self_beliefs = data.get("self_beliefs")
        if not isinstance(self_beliefs, list):
            self_beliefs = []
        self_beliefs = [str(b).strip() for b in self_beliefs if b][:3]
        if not emotional_tone and not themes and not time_orientation:
            logger.warning("Pattern extraction: parsed but all fields empty")
            return None
        return {
            "emotional_tone": emotional_tone,
            "themes": themes,
            "time_orientation": time_orientation,
            "recurring_phrases": recurring_phrases,
            "core_tension": core_tension,
            "unresolved_threads": unresolved_threads,
            "self_beliefs": self_beliefs,
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
