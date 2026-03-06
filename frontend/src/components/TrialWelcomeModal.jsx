import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const WELCOME_KEY = "reflect_trial_welcomed";

export function markTrialWelcomed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_KEY, "true");
  } catch {
    // ignore
  }
}

export function hasSeenTrialWelcome() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "true";
  } catch {
    return true;
  }
}

export default function TrialWelcomeModal({ onClose }) {
  useEffect(() => {
    markTrialWelcomed();
    const t = setTimeout(() => {
      onClose?.();
    }, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm mx-4 rounded-3xl bg-[#FFFDF7] border border-[#E2E8F0] shadow-2xl p-6 space-y-4"
        >
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-[#2D3748]">
              You're in. Two weeks, all yours.
            </h2>
            <p className="text-sm text-[#64748B]">
              Your reflections are here, private and waiting. There's no right way to use this — just come back when something's on your mind.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full py-2.5 rounded-full text-sm font-medium text-white transition-colors"
            style={{
              background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
              boxShadow: "0 12px 32px rgba(255, 180, 169, 0.4)",
            }}
          >
            Begin reflecting
          </button>

          <div className="mt-2 h-1 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 6, ease: "linear" }}
              className="h-full bg-gradient-to-r from-[#FFB4A9] via-[#FDE68A] to-[#E0D4FC]"
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

