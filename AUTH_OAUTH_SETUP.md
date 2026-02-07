# Google Sign-In Setup (Step by Step)

The app has "Continue with Google" on the auth screen. To make it work, configure as below.

---

## Part 1: Supabase Dashboard (do this first)

1. Open [Supabase Dashboard](https://app.supabase.com) → your project.
2. Go to **Authentication** → **Providers**.
3. **URL Configuration** (Auth → URL Configuration):
   - **Site URL**: Your app’s origin, e.g. `http://localhost:3000` (dev) or `https://yourapp.com` (prod).
   - **Redirect URLs**: Add every URL where users can land after sign-in:
     - `http://localhost:3000`
     - `http://127.0.0.1:3000`
     - Your production URL, e.g. `https://yourapp.com`
   - Save. Supabase will only redirect back to URLs in this list.

You’ll add the Google provider settings in Part 2.

---

## Part 2: Google Sign-In

### 2.1 Create OAuth credentials (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (e.g. "REFLECT").
3. Open **APIs & Services** → **Credentials**.
4. Click **+ Create Credentials** → **OAuth client ID**.
5. If asked to configure the OAuth consent screen:
   - **User Type**: External (or Internal if only for your org).
   - **App name**: REFLECT (or your app name).
   - **User support email**: your email.
   - **Developer contact**: your email.
   - Save. You can add more (logo, scopes) later.
6. Back in **Create OAuth client ID**:
   - **Application type**: **Web application**.
   - **Name**: e.g. "REFLECT Web".
   - **Authorized JavaScript origins**:
     - `http://localhost:3000`
     - `https://yourapp.com` (when you have one).
   - **Authorized redirect URIs** (must match exactly):
     - `https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback`
     - Example: `https://abcdefghijk.supabase.co/auth/v1/callback`
   - Find your Supabase project ref in Dashboard → **Project Settings** → **General** → **Reference ID**, or use the host of your Supabase URL (e.g. `https://xyzcompany.supabase.co` → ref is `xyzcompany`).
7. Click **Create**. Copy the **Client ID** and **Client Secret**.

### 2.2 Enable Google in Supabase

1. Supabase Dashboard → **Authentication** → **Providers**.
2. Find **Google** and turn it **Enabled**.
3. Paste **Client ID** and **Client Secret** from step 2.1.
4. Save.

After this, "Continue with Google" should work (user is sent to Google, then back to your app).

---

## Part 3: Checklist

- [ ] Supabase **Redirect URLs** include your app origin(s) (e.g. `http://localhost:3000`, production URL).
- [ ] **Google**: OAuth client type "Web application", redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`, credentials in Supabase Google provider.
- [ ] For production, **Site URL** and **Redirect URLs** in Supabase include your real domain.

---

## After setup

- Sign-in screen has **Continue with Google** and email/password.
- User clicks Google → redirects to Google → then back to your app; session is set automatically.
- If something fails, check browser console and Supabase **Authentication** → **Users** (and **Logs**) for errors.

---

## Part 4: When you wrap the app in Capacitor (later)

Right now auth is **web-only**: user is sent to Google in the browser and redirected back to your site. When you add Capacitor you extend it.

### What changes with Capacitor

1. **Redirect URLs**  
   The app will open in a WebView. You need a URL that lands back inside the app:
   - **Option A – Same origin**: If the Capacitor app loads your site (e.g. `https://yourapp.com`), add that URL to Supabase **Redirect URLs** and use it as `redirectTo`. Same flow as web; no code change.
   - **Option B – Custom scheme**: If you use a custom scheme (e.g. `com.yourapp.reflect://`), add that to Supabase **Redirect URLs** and set `redirectTo` to it when running in Capacitor. You’ll add a small check (e.g. `Capacitor.isNativePlatform()`) and set `redirectTo` accordingly.

2. **Google on mobile**  
   You can either:
   - Keep the current **web redirect** flow in the WebView (add the Capacitor redirect URL as above), or
   - Use a **native** Google Sign-In plugin and pass the ID token to Supabase for a more native feel.

### Practical plan

- **Now (web app)**: Set up Google as in Parts 1–2. Everything works in the browser.
- **When you add Capacitor**:
  1. Add your app’s redirect URL(s) to Supabase and Google (same as Part 1–2).
  2. In the app, if `Capacitor.isNativePlatform()` is true, set `redirectTo` to that URL (or use a custom scheme and handle the open URL in the app).
  3. Optionally add native Google Sign-In for mobile; the rest of your auth (Supabase session, JWT, backend) stays the same.

So you’re not "switching" auth—you’re adding redirect URLs and optionally native sign-in for the native build. The same Supabase project and backend keep working for both web and app.
