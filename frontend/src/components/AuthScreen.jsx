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
  const { signInWithGoogle, error, clearError } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    clearError();
    setLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
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

        <div className="space-y-2 mb-6">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#E2E8F0] bg-white text-[#4A5568] hover:bg-[#F8FAFC] disabled:opacity-60 transition-colors font-medium"
          >
            <GoogleIcon />
            {loading ? "Opening…" : "Continue with Google"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
            {error}
          </p>
        )}

        {!compact && (
          <p className="text-center text-xs text-[#94A3B8] mt-6">
            We only use your email to sign you in. Your reflections stay private.
          </p>
        )}
      </div>
    </motion.div>
  );
}
