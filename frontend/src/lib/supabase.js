/**
 * Supabase client for browser – used for Auth only.
 * API calls go through the FastAPI backend with the user's JWT.
 *
 * Auth session is stored in both localStorage and a cookie so it persists when the user
 * closes the tab and returns later (e.g. Safari on iOS often evicts localStorage;
 * the cookie helps restore the session in a new tab).
 *
 * Requires @supabase/supabase-js (see package.json). Run `yarn install` in frontend.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

const AUTH_COOKIE_NAME = "reflect_sb_auth";
const COOKIE_MAX_AGE_DAYS = 30;
const COOKIE_MAX_BYTES = 3500; // ~4KB limit per cookie; leave headroom

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

// Storage adapter: localStorage + cookie. Cookie restores session when Safari evicts localStorage.
const storageAdapter =
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem(key) {
          let value = window.localStorage.getItem(key);
          if (value) return value;
          if (key.includes("auth-token")) {
            value = getCookie(AUTH_COOKIE_NAME);
            if (value) {
              try {
                window.localStorage.setItem(key, value);
              } catch (_) {}
              return value;
            }
          }
          return null;
        },
        setItem(key, value) {
          try {
            window.localStorage.setItem(key, value);
          } catch (_) {}
          if (key.includes("auth-token") && value && value.length < COOKIE_MAX_BYTES) {
            setCookie(AUTH_COOKIE_NAME, value, COOKIE_MAX_AGE_DAYS);
          }
        },
        removeItem(key) {
          try {
            window.localStorage.removeItem(key);
          } catch (_) {}
          if (key.includes("auth-token")) {
            removeCookie(AUTH_COOKIE_NAME);
          }
        },
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
