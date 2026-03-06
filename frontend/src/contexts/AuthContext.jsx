import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { setAuthToken, syncProfile } from "../lib/api";
import { getBackendUrl } from "../lib/config";

const API_BASE = `${getBackendUrl()}/api`;

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  error: null,
  clearError: () => {},
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function getRedirectTo() {
  if (typeof window === "undefined") return undefined;
  try {
    const { Capacitor } = require("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      return "com.reflect.app://auth/callback";
    }
  } catch (_) {}
  return window.location.origin + "/auth/callback";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setAuthToken(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const initAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
        const errorFromUrl = params.get("error") || hashParams.get("error");
        const errorDesc = params.get("error_description") || hashParams.get("error_description");

        const clearAuthQuery = () => {
          try {
            const current = new URLSearchParams(window.location.search);
            current.delete("code");
            current.delete("error");
            current.delete("error_description");
            const search = current.toString();
            const nextUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
            window.history.replaceState({}, document.title, nextUrl);
          } catch {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        };

        if (errorFromUrl && !cancelled) {
          setError(
            errorDesc
              ? decodeURIComponent(String(errorDesc).replace(/\+/g, " "))
              : "Sign-in failed. Check Google and Supabase settings."
          );
          setLoading(false);
          clearAuthQuery();
          return;
        }

        const code = params.get("code");

          if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (!cancelled) {
            if (exchangeError) {
              if (process.env.NODE_ENV !== "production") console.error("Code exchange failed:", exchangeError);
              setSession(null);
              setUser(null);
              setAuthToken(null);
              } else {
              setSession(data.session);
              setUser(data.session?.user ?? null);
              setAuthToken(data.session?.access_token ?? null);
              syncProfile(API_BASE).catch(() => {});
            }
            clearAuthQuery();
            setLoading(false);
          }
        } else {
          // Restore session from storage (e.g. after user reopens tab on mobile).
          // Retry a few times so we don't give up if storage isn't ready on first read.
          let s = (await supabase.auth.getSession()).data?.session ?? null;
          const delays = [200, 600];
          for (const ms of delays) {
            if (s || cancelled) break;
            await new Promise((r) => setTimeout(r, ms));
            s = (await supabase.auth.getSession()).data?.session ?? null;
          }
          if (!cancelled) {
            setSession(s);
            setUser(s?.user ?? null);
            setAuthToken(s?.access_token ?? null);
            setLoading(false);
            if (s?.access_token) syncProfile(API_BASE).catch(() => {});
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("Auth init error:", err);
        if (!cancelled) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthToken(session?.access_token ?? null);
        if (session?.access_token) syncProfile(API_BASE).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (opts = {}) => {
    setError(null);
    if (!supabase) {
      setError("Auth is not configured.");
      return;
    }
    let redirectTo = getRedirectTo();
    if (opts.trial && redirectTo) {
      redirectTo = redirectTo.includes("?")
        ? `${redirectTo}&trial=true`
        : `${redirectTo}?trial=true`;
    }
    const authOptions = {
      redirectTo: redirectTo || window.location.origin + "/auth/callback",
      scopes: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
    };
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: authOptions,
    });
    if (e) setError(e.message);
    return e;
  };

  const signOut = async () => {
    setError(null);
    if (supabase) await supabase.auth.signOut();
  };

  const clearError = () => setError(null);

  const value = {
    user,
    session,
    loading,
    signInWithGoogle,
    signOut,
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
