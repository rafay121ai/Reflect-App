# REFLECT — Architecture

**Version:** 1.0  
**Last updated:** February 2026

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  React 19 SPA (Create React App + CRACO)                               │   │
│  │  • Tailwind CSS • Framer Motion • Radix UI • Supabase Auth (client)   │   │
│  │  • Capacitor (iOS/Android) optional                                    │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS / REST (Bearer JWT)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  FastAPI (Python 3.12+) — server.py                                    │   │
│  │  • CORS • JWT auth (require_user_id) • Request/response models        │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                           │
                    │                           │
                    ▼                           ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────────┐
│  LLM LAYER (pluggable)        │    │  DATA LAYER                               │
│  llm_provider.py              │    │  supabase_client.py                       │
│  • ollama_client.py (local)   │    │  • PostgreSQL (Supabase)                  │
│  • openai_client.py           │    │  • reflections, saved_reflections,        │
│  • get_reflection,            │    │    mood_checkins, revisit_reminders,       │
│    get_personalized_mirror,   │    │    profiles, user_personalization_context,│
│    get_closing, etc.          │    │    weekly_insights, reflection_patterns   │
└──────────────────────────────┘    └──────────────────────────────────────────┘
                    │                           ▲
                    │                           │
                    └───────────────────────────┘
                         (e.g. pattern insert, reflection insert)
```

---

## 2. Frontend Architecture

### 2.1 Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build | Create React App + CRACO |
| Styling | Tailwind CSS, tailwindcss-animate |
| UI primitives | Radix UI |
| Motion | Framer Motion |
| HTTP | Axios |
| Auth | Supabase Auth (@supabase/supabase-js) |
| Mobile | Capacitor (iOS/Android) |
| Routing | React Router DOM v7 |

### 2.2 App State & Flow

- **App.js**: Root state (appState, thought, reflection, history, panels). Orchestrates API calls and passes handlers to children.
- **States**: `ONBOARDING` → `INPUT` → `LOADING` → `REFLECTION` → (optional) `VIEWING_REFLECTION` / `VIEWING_SAVED`.
- **ReflectionFlow.jsx**: Multi-step flow (JOURNEY → QUESTIONS → MIRROR → MOOD → CLOSING). Owns step index, question responses, personalized mirror, closing text.
- **Auth**: AuthContext + Supabase; `getAuthHeaders()` for backend calls.

### 2.3 Key Components

| Component | Role |
|-----------|------|
| InputScreen | Thought input; triggers POST /api/reflect |
| ReflectionFlow | Steps: JourneyCards → InteractiveQuestions → RevisitChoiceScreen / MirrorReflection → MoodCheckIn → ClosingScreen |
| JourneyCards | Displays reflection sections (What This Feels Like, etc.) |
| InteractiveQuestions | Renders questions from "Some Things to Notice"; collects answers |
| MirrorReflection | Shows mirror; options: Read now / Come back later / Remind me |
| MoodCheckIn | Mood metaphor selection; calls mood suggest + submit |
| ClosingScreen | Shows closing (named truth + open thread); "Close" completes flow |
| InsightsPanel | Weekly letter, reflection frequency, mood language / over time |
| SettingsPanel | Profile, reminder time, reflection mode |

### 2.4 Config

- **lib/config.js**: `getBackendUrl()` — localhost in dev; Railway URL when hostname contains `vercel.app`; else `REACT_APP_BACKEND_URL`.

---

## 3. Backend Architecture

### 3.1 Stack

| Layer | Technology |
|-------|------------|
| Runtime | Python 3.12+ |
| Framework | FastAPI |
| Server | Uvicorn |
| HTTP client | httpx |
| Database client | Supabase Python client (REST) |
| Auth | PyJWT (HS256, Supabase legacy JWT secret) |
| Env | python-dotenv |

### 3.2 Request Flow

1. **Auth**: Protected routes use `require_user_id` (from `auth.py`), which validates Bearer JWT and returns `user_id` (sub).
2. **Routes**: Defined in `server.py`; Pydantic models for body/query.
3. **LLM**: All LLM calls go through `llm_provider.py`, which delegates to `ollama_client` or `openai_client` based on `LLM_PROVIDER`.
4. **Data**: All persistence via `supabase_client.py` (Supabase service role).

### 3.3 LLM Architecture

- **Provider switch**: `LLM_PROVIDER` = `ollama` | `openai`. (openrouter_client.py exists in repo but is not wired in.)
- **Contract** (each client implements):  
  `get_reflection`, `get_personalized_mirror`, `extract_pattern`, `get_mood_suggestions`, `get_reminder_message`, `get_insight_letter`, `get_closing`, `convert_moods_to_feelings`, `llm_chat`.
- **Reflection flow**: Classifier (PRACTICAL/EMOTIONAL/SOCIAL/MIXED) → adaptive questions → sections (incl. "Some Things to Notice") → mirror (Attune → Deepen → Reveal).
- **Closing**: `get_closing(thought, answers, mirror, mood_word, mode)` → named truth + open thread, &lt;80 words.

### 3.4 API Surface (Summary)

| Group | Methods | Auth |
|-------|---------|------|
| Health | GET /, GET /api/health | No |
| Reflect | GET/POST /api/reflect | No (POST); GET reflection by id no auth in current code |
| Mirror | POST /api/mirror/personalized | No |
| Closing | POST /api/closing | No |
| Remind | POST /api/remind, GET /api/reminders/due, DELETE /api/reminders/:id | No (remind); due/delete may vary |
| Mood | POST /api/mood/suggest, POST /api/mood | No |
| History | POST/GET /api/history, GET /api/history/waiting, GET/PATCH /api/history/:id (open-later, remove-open-later, mark-opened) | Yes (Bearer) |
| User | GET/PATCH /api/user/profile, POST /api/user/profile/sync, GET /api/user/reflected-today | Yes |
| Personalization | POST /api/personalization/refresh, /refresh-all | Yes (refresh) |
| Insights | GET /api/insights/letter, /weekly, /reflection-frequency, /mood-language, /mood-over-time, POST /api/insights/generate-letter | Yes |

---

## 4. Data Architecture

### 4.1 Database (Supabase PostgreSQL)

| Table | Purpose |
|-------|---------|
| reflection_patterns | emotional_tone, themes, time_orientation per reflection run |
| reflections | thought, sections (JSONB), pattern_id, questions, answers, personalized_mirror, closing_text (nullable) |
| mood_checkins | reflection_id, word_or_phrase, description |
| revisit_reminders | reflection_id, remind_at, message |
| saved_reflections | user_identifier, raw_text, answers, mirror_response, mood_word, status (normal/waiting), revisit_at, revisit_type (come_back/remind) |
| profiles | user_id, email, display_name, preferences (JSONB) |
| user_personalization_context | user_id, recurring_themes, recent_mood_words, etc. |
| weekly_insights | user_id, week_start, content (5-day cycle) |

### 4.2 Auth & Identity

- **Supabase Auth**: Sign-in; JWT issued by Supabase.
- **Backend**: Validates JWT with `SUPABASE_JWT_SECRET` (HS256). `user_id` = token `sub`.
- **Frontend**: Stores session; sends `Authorization: Bearer <token>` on API calls.

---

## 5. Deployment

| Environment | Frontend | Backend | DB |
|-------------|----------|---------|-----|
| Local | npm/yarn start (localhost:3000) | uvicorn (localhost:8000) | Supabase cloud or local |
| Production | Vercel | Railway | Supabase |

- Backend URL: `getBackendUrl()` in frontend points to Railway when on Vercel.
- Env: Backend uses `.env` (e.g. `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `LLM_PROVIDER`, OpenAI or Ollama vars).

---

## 6. Security Considerations

- All user data scoped by `user_id` (from JWT) or `user_identifier` (saved_reflections).
- No public read of other users’ data.
- Service role key used only on backend; never exposed to client.
- CORS configured for frontend origin(s).
