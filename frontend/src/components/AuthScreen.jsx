import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { Feather } from "lucide-react";

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function AuthScreen({ compact = false }) {
  const { signIn, signUp, signInWithOAuth, error, clearError } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // "google" | null
  const [successMessage, setSuccessMessage] = useState("");

  const handleOAuth = async (provider) => {
    clearError();
    setOauthLoading(provider);
    await signInWithOAuth(provider);
    setOauthLoading(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    clearError();
    setSuccessMessage("");
    const err = mode === "signin"
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password);
    setSubmitting(false);
    if (!err && mode === "signup") {
      setSuccessMessage("Check your email to confirm your account, then sign in.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={compact ? "flex flex-col items-center px-4 py-2" : "flex flex-col items-center justify-center min-h-[70vh] px-4"}
      data-testid="auth-screen"
    >
      <div className="w-full max-w-sm">
        {!compact && (
          <>
            <div className="flex justify-center mb-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)" }}
              >
                <Feather className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1
              className="text-2xl font-light text-[#4A5568] text-center mb-2"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              REFLECT
            </h1>
            <p className="text-sm text-[#718096] text-center mb-6">
              A private space for your thoughts.
            </p>
          </>
        )}

        {/* OAuth: Google */}
        <div className="space-y-2 mb-6">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#E2E8F0] bg-white text-[#4A5568] hover:bg-[#F8FAFC] disabled:opacity-60 transition-colors font-medium"
          >
            <GoogleIcon />
            {oauthLoading === "google" ? "Opening…" : "Continue with Google"}
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E2E8F0]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-[#FFFDF7] text-[#94A3B8]">or with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-[#4A5568] mb-1">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-white text-[#4A5568] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FFB4A9]/40 focus:border-[#FFB4A9]/50 transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-[#4A5568] mb-1">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-white text-[#4A5568] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FFB4A9]/40 focus:border-[#FFB4A9]/50 transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
            {mode === "signup" && (
              <p className="text-xs text-[#718096] mt-1">At least 6 characters.</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="text-sm text-[#4A5568] bg-[#E0EBE4]/50 rounded-lg px-3 py-2">
              {successMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl font-medium text-white transition-colors disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)" }}
          >
            {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-[#718096] mt-6">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); clearError(); setSuccessMessage(""); }}
                className="text-[#6B7FD7] hover:underline font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); clearError(); setSuccessMessage(""); }}
                className="text-[#6B7FD7] hover:underline font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}
