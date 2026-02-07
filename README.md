# REFLECT APP

A gentle reflection space for exploring your thoughts. Uses a local backend with **Ollama** (e.g. Qwen) for AI reflections.

## Features

- **Thought input**: Share what's on your mind
- **Three-step journey**: Explore → Reflect → See your thoughts from new perspectives
- **Ollama (local LLM)**: Backend calls your Mac’s Ollama model (e.g. Qwen) for reflections—no cloud API keys
- **Cross-platform**: Web app; can be wrapped with Capacitor for iOS/Android (see [CAPACITOR_SETUP.md](./CAPACITOR_SETUP.md))

## Quick start

1. **Ollama (on your Mac)**  
   Make sure Ollama is running and you have a model (e.g. Qwen):
   ```bash
   ollama run qwen
   ```
   Leave it running or run it in the background. The backend will call `http://localhost:11434`.

2. **Backend** (must run from `backend/` so the `server` module is found)
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate   # or `venv\Scripts\activate` on Windows
   pip install -r requirements.txt
   uvicorn server:app --reload --port 8000
   ```
   Or from repo root: `cd backend && uvicorn server:app --reload --port 8000`

3. **Frontend**
   ```bash
   cd frontend
   yarn install
   yarn start
   ```

4. Open **http://localhost:3000**, enter a thought (50–500 chars), and get a reflection from your local Qwen model.

### If you get 404 on reflection

The frontend calls `POST http://localhost:8000/api/reflect`. A 404 means the server on port 8000 doesn’t have that route—often because a different app is running on 8000, or the backend wasn’t started from this project.

1. **Stop anything on port 8000** (other terminals, other apps).
2. **Start the REFLECT backend from this project:**
   ```bash
   cd "REFLECT APP/backend"   # or cd backend from repo root
   source venv/bin/activate   # if you use a venv
   uvicorn server:app --reload --port 8000
   ```
3. **Check the backend:** open **http://localhost:8000/api/reflect** in your browser. You should see: `{"message":"REFLECT API. Use POST with body {\"thought\": \"...\"} to get a reflection."}`. If you see 404 or a different page, the wrong server is on port 8000.
4. Try the app again at http://localhost:3000.

## Backend config (optional)

In `backend/` you can use a `.env` (copy from `.env.example`):

- `OLLAMA_URL` – default `http://localhost:11434`
- `OLLAMA_MODEL` – default `qwen` (use the exact model name you use with `ollama run`)

## Project structure

```
REFLECT APP/
├── backend/          # FastAPI + Ollama client
│   ├── server.py
│   ├── ollama_client.py
│   └── requirements.txt
├── frontend/         # React web app
│   ├── src/
│   └── package.json
├── CAPACITOR_SETUP.md
└── README.md
```

## Tech stack

- React 19
- Tailwind CSS
- Framer Motion
- shadcn/ui-style components (Radix, etc.)

---

Built with care for gentle self-reflection.
