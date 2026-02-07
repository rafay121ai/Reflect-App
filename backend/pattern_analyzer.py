"""
Deep Pattern Analyzer for REFLECT
Multi-stage LLM analysis to find causal insights, not just frequency counts.

Stage 1: Extract discrete situations from reflections
Stage 2: Identify underlying emotional/behavioral patterns
Stage 3: Generate insight letter with specific examples
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================================================
# Stage 1: Extract Situations
# ============================================================================

SITUATION_EXTRACTION_SYSTEM = """You extract discrete situations from journal entries.

For each situation mentioned, identify:
- What happened (the external event)
- How they felt (emotions, not just "bad" - be specific)
- What they did or didn't do (behavior/response)
- Any self-judgment or doubt about their reaction

Return ONLY a valid JSON array. No explanation, no markdown.

Example format:
[
  {
    "situation": "Boss dismissed my proposal in meeting",
    "emotion": "frustrated, then doubting myself",
    "behavior": "stayed quiet, didn't push back",
    "self_judgment": "wondered if I'm overreacting"
  }
]"""


def extract_situations_prompt(reflections_text: str) -> str:
    """Build the prompt for Stage 1: situation extraction."""
    return f"""Extract discrete situations from these journal entries.

For each situation, identify what happened, how they felt, what they did, and any self-doubt.

Return ONLY a JSON array. No other text.

Journal entries:
{reflections_text}"""


def parse_situations_response(raw_response: str) -> list[dict]:
    """Parse LLM response into structured situations list."""
    if not raw_response:
        return []
    
    # Clean up common LLM artifacts
    text = raw_response.strip()
    
    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = text.strip()
    
    # Find JSON array
    try:
        start = text.index("[")
        end = text.rindex("]") + 1
        text = text[start:end]
    except ValueError:
        logger.warning("No JSON array found in situations response")
        return []
    
    try:
        data = json.loads(text)
        if isinstance(data, list):
            # Validate structure
            valid = []
            for item in data:
                if isinstance(item, dict) and item.get("situation"):
                    valid.append({
                        "situation": str(item.get("situation", ""))[:500],
                        "emotion": str(item.get("emotion", item.get("feeling", "")))[:200],
                        "behavior": str(item.get("behavior", ""))[:300],
                        "self_judgment": str(item.get("self_judgment", item.get("self_doubt", "")))[:200],
                    })
            return valid
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse situations JSON: %s", e)
    
    return []


# ============================================================================
# Stage 2: Identify Core Pattern
# ============================================================================

PATTERN_IDENTIFICATION_SYSTEM = """You identify deep emotional/behavioral patterns from journal situations.

Your job is to find the WHY underneath the WHAT. Not just "they wrote about work" but the emotional logic connecting different situations.

Look for:
- What emotional need keeps getting triggered?
- What belief about themselves keeps surfacing?
- What conflict or tension remains unresolved?
- What question are they asking from different angles?

Be specific and insightful. State the pattern in 2-3 clear sentences.
Connect dots between seemingly unrelated situations.

Tone: Observational, not diagnostic. No labels, no fixing."""


def identify_pattern_prompt(situations: list[dict]) -> str:
    """Build the prompt for Stage 2: pattern identification."""
    situations_text = json.dumps(situations, indent=2)
    
    return f"""Look across these situations from someone's journal.

Find the deeper pattern. Not what they wrote about, but:
- What emotional need keeps getting triggered?
- What belief about themselves keeps surfacing?
- What tension or conflict remains unresolved?

State the core pattern in 2-3 clear sentences.
Be specific about the emotional logic, not just themes.

Situations:
{situations_text}

Core pattern:"""


# ============================================================================
# Stage 3: Generate Insight Letter
# ============================================================================

LETTER_GENERATION_SYSTEM = """You write weekly insight letters for someone who journals to understand themselves better.

Rules:
- EXACTLY 100-150 words
- Second-person ("you"), observational, gentle
- NO salutation (no "Dear", no greeting)
- NO sign-off (no signature)
- Start directly with content

Structure:
1. Open with what they kept circling back to
2. Give 2-3 specific examples from their week
3. State the underlying pattern/tension clearly
4. End with what remains unresolved (NO ADVICE)

The letter should feel like: "Holy shit. That's exactly it."
Not: "Yeah, I know. That's what I wrote."

Connect the dots. Show them the pattern they can't see."""


def generate_letter_prompt(
    core_pattern: str,
    situations: list[dict],
    reflections_summary: str
) -> str:
    """Build the prompt for Stage 3: letter generation."""
    # Pick 2-3 most illustrative situations
    key_situations = situations[:3]
    situations_text = json.dumps(key_situations, indent=2)
    
    return f"""Write a weekly insight letter (100-150 words exactly).

1. Open with what they kept circling back to
2. Name 2-3 specific examples from their week
3. State the underlying pattern clearly
4. End with what tension remains unresolved

NO greeting. Start directly. NO advice.

Core pattern identified:
{core_pattern}

Key situations from their week:
{situations_text}

Full reflections for context:
{reflections_summary[:3000]}

Write the letter now:"""


# ============================================================================
# Main Analysis Pipeline
# ============================================================================

async def analyze_patterns_deep(
    reflections: list[dict],
    llm_chat_fn,
    min_reflections: int = 3
) -> dict:
    """
    Multi-stage deep pattern analysis.
    
    Args:
        reflections: List of reflection dicts with 'raw_text', 'mirror_response', 'mood_word', 'created_at'
        llm_chat_fn: Function to call LLM - signature: fn(prompt, system) -> str
        min_reflections: Minimum reflections needed for deep analysis
    
    Returns:
        {
            "letter": str,
            "core_pattern": str,
            "situations": list[dict],
            "analysis_depth": "deep" | "shallow" | "insufficient"
        }
    """
    if len(reflections) < min_reflections:
        return {
            "letter": _gentle_insufficient_data_message(len(reflections)),
            "core_pattern": None,
            "situations": [],
            "analysis_depth": "insufficient"
        }
    
    # Build combined reflection text
    reflections_text = _build_reflections_text(reflections)
    
    # Stage 1: Extract situations
    try:
        situations_prompt = extract_situations_prompt(reflections_text)
        situations_raw = llm_chat_fn(situations_prompt, SITUATION_EXTRACTION_SYSTEM)
        situations = parse_situations_response(situations_raw)
        
        if len(situations) < 2:
            logger.info("Not enough situations extracted (%d), falling back to shallow", len(situations))
            return _shallow_fallback(reflections, llm_chat_fn)
    except Exception as e:
        logger.warning("Stage 1 (situation extraction) failed: %s", e)
        return _shallow_fallback(reflections, llm_chat_fn)
    
    # Stage 2: Identify core pattern
    try:
        pattern_prompt = identify_pattern_prompt(situations)
        core_pattern = llm_chat_fn(pattern_prompt, PATTERN_IDENTIFICATION_SYSTEM)
        core_pattern = (core_pattern or "").strip()
        
        if not core_pattern or len(core_pattern) < 50:
            logger.info("Pattern identification returned too little, falling back")
            return _shallow_fallback(reflections, llm_chat_fn)
    except Exception as e:
        logger.warning("Stage 2 (pattern identification) failed: %s", e)
        return _shallow_fallback(reflections, llm_chat_fn)
    
    # Stage 3: Generate insight letter
    try:
        letter_prompt = generate_letter_prompt(core_pattern, situations, reflections_text)
        letter = llm_chat_fn(letter_prompt, LETTER_GENERATION_SYSTEM)
        letter = _clean_letter(letter)
        
        if not letter or len(letter) < 100:
            logger.info("Letter generation returned too little, using pattern as fallback")
            letter = core_pattern
    except Exception as e:
        logger.warning("Stage 3 (letter generation) failed: %s", e)
        letter = core_pattern if core_pattern else _gentle_insufficient_data_message(len(reflections))
    
    return {
        "letter": letter,
        "core_pattern": core_pattern,
        "situations": situations,
        "analysis_depth": "deep"
    }


def analyze_patterns_deep_sync(
    reflections: list[dict],
    llm_chat_fn,
    min_reflections: int = 3
) -> dict:
    """Synchronous version of analyze_patterns_deep."""
    if len(reflections) < min_reflections:
        return {
            "letter": _gentle_insufficient_data_message(len(reflections)),
            "core_pattern": None,
            "situations": [],
            "analysis_depth": "insufficient"
        }
    
    reflections_text = _build_reflections_text(reflections)
    
    # Stage 1
    try:
        situations_prompt = extract_situations_prompt(reflections_text)
        situations_raw = llm_chat_fn(situations_prompt, SITUATION_EXTRACTION_SYSTEM)
        situations = parse_situations_response(situations_raw)
        
        if len(situations) < 2:
            return _shallow_fallback_sync(reflections, llm_chat_fn)
    except Exception as e:
        logger.warning("Stage 1 failed: %s", e)
        return _shallow_fallback_sync(reflections, llm_chat_fn)
    
    # Stage 2
    try:
        pattern_prompt = identify_pattern_prompt(situations)
        core_pattern = llm_chat_fn(pattern_prompt, PATTERN_IDENTIFICATION_SYSTEM)
        core_pattern = (core_pattern or "").strip()
        
        if not core_pattern or len(core_pattern) < 50:
            return _shallow_fallback_sync(reflections, llm_chat_fn)
    except Exception as e:
        logger.warning("Stage 2 failed: %s", e)
        return _shallow_fallback_sync(reflections, llm_chat_fn)
    
    # Stage 3
    try:
        letter_prompt = generate_letter_prompt(core_pattern, situations, reflections_text)
        letter = llm_chat_fn(letter_prompt, LETTER_GENERATION_SYSTEM)
        letter = _clean_letter(letter)
        
        if not letter or len(letter) < 100:
            letter = core_pattern
    except Exception as e:
        logger.warning("Stage 3 failed: %s", e)
        letter = core_pattern if core_pattern else _gentle_insufficient_data_message(len(reflections))
    
    return {
        "letter": letter,
        "core_pattern": core_pattern,
        "situations": situations,
        "analysis_depth": "deep"
    }


# ============================================================================
# Helper Functions
# ============================================================================

def _build_reflections_text(reflections: list[dict]) -> str:
    """Combine reflections into text for LLM input."""
    parts = []
    for i, r in enumerate(reflections[:10], 1):  # Max 10 reflections
        raw = (r.get("raw_text") or "").strip()
        mirror = (r.get("mirror_response") or "").strip()
        mood = (r.get("mood_word") or "").strip()
        created = (r.get("created_at") or "")[:10]
        
        entry = f"--- Entry {i}"
        if created:
            entry += f" ({created})"
        entry += " ---\n"
        
        if raw:
            entry += f"Their thought: {raw[:600]}\n"
        if mirror:
            entry += f"Mirror response: {mirror[:400]}\n"
        if mood:
            entry += f"Mood: {mood}\n"
        
        parts.append(entry)
    
    return "\n\n".join(parts)


def _clean_letter(letter: str) -> str:
    """Remove accidental salutations and clean up letter."""
    if not letter:
        return ""
    
    letter = letter.strip()
    
    # Remove markdown code blocks
    if letter.startswith("```"):
        lines = letter.split("\n")
        letter = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        letter = letter.strip()
    
    # Remove accidental salutations
    lines = letter.split('\n')
    if lines and lines[0].strip().lower().startswith(('dear', 'hi ', 'hello', 'hey')):
        letter = '\n'.join(lines[1:]).strip()
    
    return letter


def _gentle_insufficient_data_message(count: int) -> str:
    """Message when not enough reflections for deep analysis."""
    if count == 0:
        return "You haven't reflected yet this period. When you do, I'll be here — noticing what shows up."
    elif count == 1:
        return "You reflected once recently. A few more entries will help me see what's underneath."
    else:
        return "You've started to show up. Keep reflecting — patterns emerge with a bit more."


def _shallow_fallback(reflections: list[dict], llm_chat_fn) -> dict:
    """Fallback to simpler analysis when deep analysis fails."""
    return _shallow_fallback_sync(reflections, llm_chat_fn)


def _shallow_fallback_sync(reflections: list[dict], llm_chat_fn) -> dict:
    """Synchronous shallow fallback."""
    from ollama_client import get_insight_letter, _build_reflections_summary_simple
    
    try:
        summary = _build_reflections_summary_simple(reflections)
        letter = get_insight_letter(summary)
    except Exception:
        letter = _gentle_insufficient_data_message(len(reflections))
    
    return {
        "letter": letter,
        "core_pattern": None,
        "situations": [],
        "analysis_depth": "shallow"
    }


def _build_reflections_summary_simple(reflections: list[dict]) -> str:
    """Simple summary for shallow fallback - matches existing format."""
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
