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
  } catch (_) {}
} else {
  // REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set for sign-in
}

export { supabase };
