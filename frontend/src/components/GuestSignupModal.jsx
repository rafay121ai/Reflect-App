import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";

const STAGE_COPY = {
  soft: {
    title: "You just made space for something real.",
    body: "This thought deserves to live somewhere safe. Sign up free — it takes seconds, and your first 14 days are on us.",
    primaryLabel: "Keep this reflection",
    secondaryLabel: "Not yet",
    note: null,
  },
  firm: {
    title: "Two thoughts. Both worth keeping.",
    body: "You've come back twice — that means something. Sign up free and both reflections move with you, along with 14 days of everything.",
    primaryLabel: "Save both and continue",
    secondaryLabel: "Skip for now",
    note: "After this, a free account is needed to continue.",
  },
  hard_block: {
    title: "There's more here for you.",
    body: "Your first two reflections are saved and waiting. Sign up free in seconds — no card, no commitment — and pick up exactly where you left off.",
    primaryLabel: "Continue where I left off",
    secondaryLabel: null,
    note: null,
  },
};

export default function GuestSignupModal({ stage, onSkip }) {
  const { signInWithGoogle } = useAuth();
  const copy = STAGE_COPY[stage] ?? STAGE_COPY.soft;

  const handleSignUp = () => {
    // Redirect through Google with trial=true so AuthCallback can migrate guest reflections
    signInWithGoogle?.({ trial: true });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm mx-4 rounded-3xl bg-[#FFFDF7] border border-[#E2E8F0] shadow-2xl p-6 flex flex-col gap-4"
        >
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-[#2D3748]">
              {copy.title}
            </h2>
            <p className="text-sm text-[#64748B]">
              {copy.body}
            </p>
            {copy.note && (
              <p className="text-xs text-[#94A3B8] mt-1">
                {copy.note}
              </p>
            )}
          </div>

          {stage === "hard_block" && (
            <p
              className="text-center"
              style={{ fontSize: 13, color: "#718096", marginBottom: 16 }}
            >
              Sign in to unlock your full mirror and keep your reflections over time. Free for 14 days.
            </p>
          )}

          <div className="flex flex-col gap-3 mt-3">
            <button
              type="button"
              onClick={handleSignUp}
              className="w-full py-3 rounded-full text-sm font-medium text-white shadow-md transition-colors"
              style={{
                background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
                boxShadow: "0 12px 32px rgba(255, 180, 169, 0.4)",
              }}
            >
              {copy.primaryLabel}
            </button>

            {copy.secondaryLabel && onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-[#718096] hover:text-[#4A5568] underline-offset-2 hover:underline self-center"
              >
                {copy.secondaryLabel}
              </button>
            )}
          </div>

          <p className="text-[10px] text-[#A0AEC0] text-center mt-1">
            No card required. You can cancel any time from Settings.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

