# How pattern reflection is used in Mirror and Closing

## Short answer

**Yes, the LLM uses pattern data for both mirror and closing** when the user is signed in and has history. Pattern data comes from `reflection_patterns` (and aggregated `user_personalization_context`). It is injected into the prompts as a “What you know about this person” block so the model can go one layer deeper.

## Flow

1. **Where patterns come from**
   - After each reflection, the backend extracts **emotional_tone**, **themes**, **time_orientation**, **recurring_phrases**, **core_tension**, **unresolved_threads**, **self_beliefs** and stores them in `reflection_patterns`.
   - A background job (or on-demand) builds **user_personalization_context** per user: **recurring_themes**, **emotional_tone_summary**, **recent_mood_words**, **theme_history**, etc., from `reflections` + `reflection_patterns` + `saved_reflections`.

2. **Mirror report** (`POST /api/mirror/report`)
   - Server loads `user_context = get_personalization_context(user_id)` and `pattern_history = get_pattern_history_for_user(user_id, 5)`.
   - These are passed to `get_mirror_report(..., user_context=user_context, pattern_history=pattern_history)`.
   - In `openai_client` (or your LLM client), `_build_personalization_block(user_context, pattern_history)` turns that into a text block (themes, emotional tone, recurring phrases, tensions, unresolved threads, self-beliefs, etc.).
   - That block is appended to the mirror prompt. The model is instructed to use it to “go one layer deeper” and “reference the pattern without naming it explicitly.”

3. **Closing** (`POST /api/closing`)
   - Same idea: server loads `user_context` and `pattern_history_data`, and passes them to `get_closing(..., user_context=user_context, pattern_history=pattern_history_data)`.
   - The same `_build_personalization_block(...)` is used and appended to the closing prompt so the “uncomfortable truth” and “watch for” can be informed by patterns.

4. **Guest / no history**
   - Guest mirror: `user_context=None`, `pattern_history=None` → no pattern block.
   - New users: `get_personalization_context` and `get_pattern_history_for_user` return empty → personalization block is empty, so the LLM gets no pattern data.

## How to verify in logs

INFO-level logging was added so you can see when pattern reflection is used:

- **Mirror report**
  - When pattern data is used:
    - `Mirror report: using pattern reflection (recurring_themes=N, pattern_history_entries=M)`
  - When it isn’t (new user or no history):
    - `Mirror report: no personalization context (new user or no history yet)`

- **Closing**
  - When pattern data is used:
    - `Closing: using pattern reflection (recurring_themes=N, pattern_history_entries=M)`
  - When it isn’t:
    - `Closing: no personalization context (new user or no history yet)`

**Example (grep):**
```bash
# See when mirror uses patterns
grep "Mirror report: using pattern reflection" your_logs.txt

# See when closing uses patterns
grep "Closing: using pattern reflection" your_logs.txt
```

So: if you see “using pattern reflection” with non-zero counts in your production logs for a given request, that mirror or closing call was generated with pattern/personalization data in the prompt.

## Code references

- **Personalization block (what gets sent to the LLM):**  
  `backend/openai_client.py` → `_build_personalization_block(user_context, pattern_history)`  
  (Same pattern exists in `ollama_client.py` and `openrouter_client.py`.)
- **Mirror report:**  
  `openai_client.get_mirror_report(..., user_context=..., pattern_history=...)`  
  uses that block in the archetype prompt and the slides prompt.
- **Closing:**  
  `openai_client.get_closing(..., user_context=..., pattern_history=...)`  
  uses the same block in the closing prompt.
- **Server wiring:**  
  `server.py`: `mirror_report` and `closing` endpoints load `user_context` and `pattern_history` and pass them into the LLM client; the new INFO logs are right after those loads.
