/**
 * Supabase client for browser – used for Auth only.
 * API calls go through the FastAPI backend with the user's JWT.
 *
 * Session persistence strategy:
 *   localStorage  — primary store (Supabase default)
 *   cookie        — backup for the refresh_token only (~60 bytes, always fits)
 *
 * On setItem: parse the session JSON, extract refresh_token, write it to a cookie.
 * On getItem: if localStorage is empty (Safari evicted it), read the refresh_token
 *   from the cookie and return a minimal expired-session JSON. Supabase sees the
 *   expired access_token, uses the refresh_token to get a new session automatically.
 *
 * Requires @supabase/supabase-js (see package.json). Run `yarn install` in frontend.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

const RT_COOKIE_NAME = "reflect_sb_rt";
const COOKIE_MAX_AGE_DAYS = 30;

function getCookie(name) {
  if (typeof document === "undefined" || !document.cookie) return null;
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, maxAgeDays) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(value);
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const secure = window.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function removeCookie(name) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

const storageAdapter =
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem(key) {
          let value = window.localStorage.getItem(key);
          if (value) return value;

          if (key.includes("auth-token")) {
            const rt = getCookie(RT_COOKIE_NAME);
            if (rt) {
              const minimal = JSON.stringify({
                access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.fake",
                refresh_token: rt,
                expires_at: 1,
                expires_in: -1,
                token_type: "bearer",
                user: null,
              });
              try {
                window.localStorage.setItem(key, minimal);
              } catch (_) {}
              return minimal;
            }
          }
          return null;
        },

        setItem(key, value) {
          try {
            window.localStorage.setItem(key, value);
          } catch (_) {}
          if (key.includes("auth-token") && value) {
            try {
              const rt = JSON.parse(value).refresh_token;
              if (rt) setCookie(RT_COOKIE_NAME, rt, COOKIE_MAX_AGE_DAYS);
            } catch (_) {}
          }
        },

        removeItem(key) {
          try {
            window.localStorage.removeItem(key);
          } catch (_) {}
          if (key.includes("auth-token")) {
            removeCookie(RT_COOKIE_NAME);
          }
        },
      }
    : undefined;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        ...(storageAdapter && { storage: storageAdapter }),
      },
    });
  } catch (_) {}
} else {
  // REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set for sign-in
}

export { supabase };
