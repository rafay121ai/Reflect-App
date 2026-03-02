# REFLECT — Technical Requirements Document (TRD)

**Version:** 1.0  
**Last updated:** February 2026

---

## 1. Scope

This document specifies technical requirements for the REFLECT application as implemented: development environment, dependencies, APIs, data models, and integration points.

---

## 2. Development Environment

### 2.1 Prerequisites

| Requirement | Version / Note |
|-------------|----------------|
| Node.js | LTS (e.g. 18+) |
| npm or yarn | For frontend |
| Python | 3.12+ |
| Supabase account | For auth + PostgreSQL |
| (Optional) Ollama | Local LLM when `LLM_PROVIDER=ollama` |

### 2.2 Repository Layout

```
REFLECT APP/
├── frontend/                 # React SPA
│   ├── public/
│   ├── src/
│   │   ├── components/       # UI and reflection flow
│   │   ├── contexts/        # AuthContext
│   │   ├── lib/             # api, config, supabase, notifications, etc.
│   │   └── App.js, index.js
│   ├── package.json
│   └── scripts/
├── backend/                  # FastAPI
│   ├── server.py            # Routes and orchestration
│   ├── auth.py              # JWT verification
│   ├── llm_provider.py      # LLM abstraction
│   ├── ollama_client.py     # Ollama implementation
│   ├── openai_client.py     # OpenAI implementation
│   ├── openrouter_client.py # Present but not used by app
│   ├── supabase_client.py   # DB operations
│   ├── pattern_analyzer.py  # Optional pattern analysis
│   ├── requirements.txt
│   └── .env.example
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── TRD.md
└── FEATURES_PLAN.md
```

---

## 3. Frontend Technical Requirements

### 3.1 Dependencies (Key)

| Package | Purpose |
|---------|---------|
| react, react-dom | 19.x |
| react-router-dom | 7.x |
| axios | HTTP client |
| @supabase/supabase-js | Auth and optional direct Supabase |
| framer-motion | Animations |
| tailwindcss, tailwindcss-animate | Styling |
| @radix-ui/* | Accessible UI primitives |
| lucide-react | Icons |
| sonner | Toasts |
| recharts | Charts (insights) |
| @capacitor/* | iOS/Android (optional) |
| react-hook-form, zod, @hookform/resolvers | Forms/validation |

### 3.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| REACT_APP_BACKEND_URL | No (dev default localhost:8000) | Backend base URL |
| REACT_APP_SUPABASE_URL | Yes (if using auth) | Supabase project URL |
| REACT_APP_SUPABASE_ANON_KEY | Yes (if using auth) | Supabase anon key |

### 3.3 Key Technical Behaviors

- **Backend URL**: `getBackendUrl()` (lib/config.js) — production backend used when hostname contains `vercel.app`.
- **Auth headers**: All authenticated requests use `getAuthHeaders()` (Bearer token from Supabase session).
- **Reflection flow**: State in ReflectionFlow; no global store (e.g. no Redux). Parent (App.js) holds reflection, thought, and passes callbacks.

---

## 4. Backend Technical Requirements

### 4.1 Dependencies

```
fastapi==0.115.6
uvicorn[standard]==0.32.1
httpx>=0.26,<0.28
supabase==2.10.0
python-dotenv==1.0.1
PyJWT[crypto]==2.10.1
```

### 4.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SUPABASE_URL | Yes | Supabase project URL |
| SUPABASE_SERVICE_KEY or SUPABASE_KEY | Yes | Service role key |
| SUPABASE_JWT_SECRET | Yes (for protected routes) | Legacy JWT secret (HS256) |
| LLM_PROVIDER | No (default: ollama) | `ollama` \| `openai` |
| OLLAMA_URL | If ollama | Default http://localhost:11434 |
| OLLAMA_MODEL | If ollama | Default qwen |
| OPENAI_API_KEY | If openai | API key |
| OPENAI_MODEL | If openai | e.g. gpt-4o-mini |

### 4.3 API Contract (Detailed)

#### 4.3.1 Reflection & Mirror

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | /api/reflect | `{ thought, reflection_mode? }` | `{ id, sections }` | sections: 6 items { title, content } |
| POST | /api/mirror/personalized | `{ thought, questions[], answers, reflection_id? }` | `{ content }` | Updates reflection if reflection_id |
| POST | /api/closing | `{ thought, answers, mirror_response, mood_word?, reflection_id?, reflection_mode? }` | `{ closing_text }` | Updates reflection.closing_text if reflection_id |

#### 4.3.2 Mood & Reminders

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | /api/mood/suggest | `{ thought?, mirror_text? }` | `{ suggestions: [{ phrase, description }] }` |
| POST | /api/mood | `{ reflection_id, word_or_phrase, description? }` | — |
| POST | /api/remind | `{ reflection_id, days }` | `{ remind_at?, message? }` |
| GET | /api/reminders/due | — | List of due reminders |
| DELETE | /api/reminders/{id} | — | — |

#### 4.3.3 History (Auth Required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | /api/history | `{ user_identifier, raw_text, answers, mirror_response, mood_word?, revisit_type? }` | `{ id? }` |
| GET | /api/history | — | `{ items[] }` |
| GET | /api/history/waiting | — | `{ items[] }` |
| GET | /api/history/{saved_id} | — | One saved reflection |
| PATCH | /api/history/{saved_id}/open-later | `{ revisit_at? }` | — |
| PATCH | /api/history/{saved_id}/remove-open-later | — | — |
| PATCH | /api/history/{saved_id}/mark-opened | — | — |

#### 4.3.4 User & Insights (Auth Required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /api/user/profile | — | Profile object |
| PATCH | /api/user/profile | `{ display_name?, preferences? }` | — |
| POST | /api/user/profile/sync | — | — |
| GET | /api/user/reflected-today | — | `{ reflected_today }` |
| POST | /api/personalization/refresh | — | — |
| GET | /api/insights/letter | — | `{ content?, period?, ... }` |
| GET | /api/insights/weekly | — | Alias / letter semantics |
| POST | /api/insights/generate-letter | — | — |
| GET | /api/insights/reflection-frequency | Query: week_mode? | — |
| GET | /api/insights/mood-language | Query: days? | — |
| GET | /api/insights/mood-over-time | Query: days? | — |

### 4.4 Auth

- **Mechanism**: Bearer token in `Authorization` header.
- **Validation**: HS256 with `SUPABASE_JWT_SECRET`; audience `authenticated`.
- **Identity**: `user_id` = JWT `sub` (Supabase user UUID).

---

## 5. Data Model Requirements

### 5.1 Supabase Tables

- **reflection_patterns**: id, emotional_tone, themes (array), time_orientation, timestamp.
- **reflections**: id, user_id, thought, sections (JSONB), pattern_id, is_favorite, created_at, questions (JSONB), answers (JSONB), personalized_mirror, **closing_text (TEXT, nullable)**.
- **mood_checkins**: id, reflection_id, word_or_phrase, description, created_at.
- **revisit_reminders**: id, reflection_id, remind_at, message, created_at.
- **saved_reflections**: id, user_identifier, raw_text, answers (JSONB), mirror_response, mood_word, status (normal|waiting), revisit_at, created_at, opened_at, revisit_type (come_back|remind|null).
- **profiles**: user_id (PK), email, display_name, preferences (JSONB), updated_at.
- **user_personalization_context**: user_id (PK), recurring_themes, recent_mood_words, emotional_tone_summary, last_reflection_at, reflection_count_7d, updated_at, name_from_email.
- **weekly_insights**: id, user_id, week_start, content, created_at; UNIQUE(user_id, week_start).

### 5.2 Schema Migration Note

If `reflections.closing_text` does not exist:

```sql
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS closing_text TEXT;
```

---

## 6. LLM Contract (Provider-Agnostic)

Each provider (Ollama, OpenAI) must implement:

| Function | Signature | Returns |
|----------|-----------|---------|
| get_reflection | (thought, reflection_mode) | list[{ title, content }] — 6 sections |
| get_personalized_mirror | (thought, questions, answers) | str |
| get_closing | (thought, answers, mirror, mood_word, reflection_mode) | str (≤80 words) |
| extract_pattern | (thought, sections) | { emotional_tone, themes, time_orientation } or None |
| get_mood_suggestions | (thought, mirror_text?) | list[{ phrase, description }] |
| get_reminder_message | (thought?, mirror_snippet?) | str |
| get_insight_letter | (reflections_summary) | str (100–150 words) |
| convert_moods_to_feelings | (mood_metaphors) | list[{ original, feeling }] |
| llm_chat | (prompt, system?) | str |

---

## 7. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| **Availability** | Backend and DB should be available during use; graceful handling of LLM timeouts/errors (e.g. 502 with message, fallback closing text). |
| **Performance** | Reflection + mirror + closing involve multiple LLM calls; avoid blocking UI (e.g. closing fetch in background after mood). |
| **Security** | No PII in logs; secrets only in env; HTTPS in production. |
| **Compatibility** | Modern browsers; iOS/Android via Capacitor where used. |

---

## 8. Testing & Quality

- **Backend**: Manual or automated tests for critical routes (reflect, mirror, closing, history, auth).
- **Frontend**: Key flows (input → reflection → mirror → mood → closing) testable via component tests or E2E.
- **Linting**: ESLint (frontend), Python linting/formatting as per project setup.

---

## 9. References

- FEATURES_PLAN.md — Product identity and feature list  
- docs/PRD.md — Product requirements  
- docs/ARCHITECTURE.md — System and deployment architecture  
- backend/.env.example — Backend env template  
- backend/supabase_complete_schema.sql — Full DB schema
