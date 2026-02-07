# How API calls work (simple guide)

## What is an "API call"?

Your app has two parts:

- **Frontend** (React in the browser) – what the user sees and taps.
- **Backend** (FastAPI on your server) – where data is stored and things like "save this reflection" or "get this user's profile" happen.

An **API call** is the frontend asking the backend to do something over the internet: "Get my profile", "Save this reflection", etc.

---

## How one call works (step by step)

1. **You (the code)** decide what you want: e.g. "get my profile".
2. **The app** sends an **HTTP request** to a **URL** on your backend, e.g. `GET https://yourserver.com/api/user/profile`.
3. The request includes **headers** – one of them is `Authorization: Bearer <token>` so the backend knows *who* is asking (the logged-in user).
4. **The backend** checks the token, looks up the profile, and sends back a **response** (usually JSON), e.g. `{ "email": "...", "display_name": "Jane", ... }`.
5. **Your frontend** gets that response and uses it (e.g. show "Hi, Jane", or send an email to that address).

So: **API call = frontend sends a request to a URL → backend does work → backend sends a response back.**

You don't "use API calls manually" in daily life – you write code that does step 2 (and 5) when the right thing happens (e.g. user logs in, or opens a screen).

---

## GET vs POST vs PATCH (in plain English)

- **GET** – "Give me this." No body. Example: get my profile, get my history.
- **POST** – "Do this / create this." Can send a body (e.g. save a reflection, or "sync my profile from Auth").
- **PATCH** – "Update this." Send only what changed (e.g. update my display name).

So when we say "call GET /api/user/profile", we mean: **send a GET request to the URL `/api/user/profile`** (with the auth token). The backend then runs the code for that route and returns the profile.

---

## In your REFLECT app

- The **backend** defines the routes: `GET /api/user/profile`, `POST /api/user/profile/sync`, etc.
- The **frontend** uses helpers in `src/lib/api.js` (e.g. `getProfile(API)`, `syncProfile(API)`) that send the right request to that URL with the auth token.
- **Profile sync** runs automatically after login (see `AuthContext`) – you don't have to trigger it yourself. When you need the user's name or email later (e.g. for a notification), you call `getProfile(API)` and use the result.

You don't need to "manually" call the API in a special way – you just use the helpers where your app needs the data (e.g. on a screen that shows "Hi, {name}" or before sending an email).
