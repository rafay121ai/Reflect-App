/**
 * Supabase client for browser – used for Auth only.
 * API calls go through the FastAPI backend with the user's JWT.
 *
 * Auth session is stored explicitly in localStorage so it persists when the user
 * closes the tab and returns later (e.g. on mobile).
 *
 * Requires @supabase/supabase-js (see package.json). Run `yarn install` in frontend.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

// Explicit localStorage adapter so session always persists across tab close (mobile-friendly).
const storageAdapter =
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: (key) => window.localStorage.removeItem(key),
      }
    : undefined;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        ...(storageAdapter && { storage: storageAdapter }),
      },
    });
  } catch (_) {}
} else {
  // REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set for sign-in
}

export { supabase };
