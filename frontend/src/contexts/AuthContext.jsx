import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { setAuthToken, syncProfile } from "../lib/api";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithOAuth: async () => {},
  signOut: async () => {},
  error: null,
  clearError: () => {},
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
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

        if (errorFromUrl && !cancelled) {
          setError(
            errorDesc
              ? decodeURIComponent(String(errorDesc).replace(/\+/g, " "))
              : "Sign-in failed. Check Google and Supabase settings below."
          );
          setLoading(false);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        const code = params.get("code");

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (!cancelled) {
            if (error) {
              console.error("Code exchange failed:", error);
              setSession(null);
              setUser(null);
              setAuthToken(null);
            } else {
              setSession(data.session);
              setUser(data.session?.user ?? null);
              setAuthToken(data.session?.access_token ?? null);
              syncProfile(API_BASE).catch(() => {}); // sync name/email to backend for personalization
            }

            window.history.replaceState({}, document.title, window.location.pathname);
            setLoading(false);
          }
        } else {
          let { data: { session: s } } = await supabase.auth.getSession();
          if (!s && !cancelled) {
            await new Promise((r) => setTimeout(r, 200));
            const retry = await supabase.auth.getSession();
            s = retry.data?.session ?? null;
          }

          if (!cancelled) {
            setSession(s);
            setUser(s?.user ?? null);
            setAuthToken(s?.access_token ?? null);
            setLoading(false);
            if (s?.access_token) syncProfile(API_BASE).catch(() => {}); // sync on existing session
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthToken(session?.access_token ?? null);
        if (session?.access_token) syncProfile(API_BASE).catch(() => {}); // sync after login
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    if (!supabase) {
      setError("Auth is not configured.");
      return;
    }
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) setError(e.message);
    return e;
  };

  const signUp = async (email, password) => {
    setError(null);
    if (!supabase) {
      setError("Auth is not configured.");
      return;
    }
    const { error: e } = await supabase.auth.signUp({ email, password });
    if (e) setError(e.message);
    return e;
  };

  const signOut = async () => {
    setError(null);
    if (supabase) await supabase.auth.signOut();
  };

  const signInWithOAuth = async (provider) => {
    setError(null);
    if (!supabase) {
      setError("Auth is not configured.");
      return;
    }
    const options = {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    };
    if (provider === "google") {
      options.scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
    }
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });
    if (e) setError(e.message);
    return e;
  };

  const clearError = () => setError(null);

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithOAuth,
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
