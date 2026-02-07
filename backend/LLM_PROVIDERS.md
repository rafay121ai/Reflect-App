# LLM provider abstraction

The app uses a single LLM for reflections. The backend is wired so you can switch providers via **`LLM_PROVIDER`** in `.env` (e.g. `ollama` for dev, `openai` or `anthropic` for production).

## Current setup

- **`llm_provider.py`** – Single entry point. Reads `LLM_PROVIDER` and delegates to the right implementation.
- **`ollama_client.py`** – Ollama implementation (local Qwen, etc.). Used when `LLM_PROVIDER=ollama` (default).

The server and Supabase layer only import from `llm_provider`, not from `ollama_client` directly.

## Contract (any new provider must implement)

1. **`get_reflection(thought: str) -> list[dict]`**  
   Returns 6 sections: `[{ "title": str, "content": str }, ...]`  
   Titles the frontend expects: What This Feels Like, Where You're Stuck, What You Believe Right Now, Why This Matters to You, Some Things to Notice, A Mirror.

2. **`get_personalized_mirror(thought: str, questions: list[str], answers: list | dict) -> str`**  
   Returns a short personalized mirror paragraph (2–3 sentences).

3. **`extract_pattern(thought: str, sections: list[dict]) -> dict | None`**  
   Returns `{ "emotional_tone": str, "themes": list[str], "time_orientation": str }` or `None`.

Prompts and tone live inside each provider so you can tune them per LLM (e.g. different system prompts for OpenAI vs Ollama).

## Adding a new provider (e.g. OpenAI)

1. Create **`openai_client.py`** (or `anthropic_client.py`) with the same three functions and signatures above.
2. In **`llm_provider.py`**, add a branch, e.g.:
   ```python
   elif LLM_PROVIDER == "openai":
       from openai_client import get_reflection, get_personalized_mirror, extract_pattern
       return get_reflection, get_personalized_mirror, extract_pattern
   ```
3. In **`.env`**, set `LLM_PROVIDER=openai` and add the provider’s env vars (e.g. `OPENAI_API_KEY`).
4. Restart the backend. No changes needed in `server.py` or the frontend.

## Env summary

| Env var | Used when | Purpose |
|--------|-----------|--------|
| `LLM_PROVIDER` | Always | `ollama` (default), `openai`, `anthropic`, … |
| `OLLAMA_URL`, `OLLAMA_MODEL` | `LLM_PROVIDER=ollama` | Local Ollama |
| `OPENAI_API_KEY` (etc.) | When you add that provider | Provider-specific keys |
