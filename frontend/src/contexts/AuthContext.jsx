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
        const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
        const errorFromUrl = hashParams.get("error") || new URLSearchParams(window.location.search).get("error");
        const errorDesc = hashParams.get("error_description") || new URLSearchParams(window.location.search).get("error_description");

        if (errorFromUrl && !cancelled) {
          setError(
            errorDesc
              ? decodeURIComponent(String(errorDesc).replace(/\+/g, " "))
              : "Sign-in failed. Check Google and Supabase settings."
          );
          setLoading(false);
          return;
        }

        let s = (await supabase.auth.getSession()).data?.session ?? null;

        if (!s?.access_token && !cancelled) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          s = refreshed?.session ?? null;
        }

        if (!cancelled) {
          setSession(s);
          setUser(s?.user ?? null);
          setAuthToken(s?.access_token ?? null);
          setLoading(false);
          if (s?.access_token) syncProfile(API_BASE).catch(() => {});
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
