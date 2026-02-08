/**
 * Supabase client for browser – used for Auth only.
 * API calls go through the FastAPI backend with the user's JWT.
 *
 * Requires @supabase/supabase-js (see package.json). Run `yarn install` in frontend.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
      },
    });
  } catch (_) {
    if (process.env.NODE_ENV === "development") {
      console.warn("REFLECT: Supabase client failed to initialize. Check env vars.");
    }
  }
} else if (process.env.NODE_ENV === "development") {
  console.warn(
    "REFLECT: Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in .env for sign-in."
  );
}

export { supabase };
