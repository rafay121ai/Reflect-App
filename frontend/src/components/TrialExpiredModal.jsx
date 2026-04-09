import { useEffect } from "react";
import posthog from "posthog-js";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { openCheckout, getLemonVariants } from "../lib/lemonSqueezy";
import { useAuth } from "../contexts/AuthContext";

function isNative() {
  try {
    // eslint-disable-next-line global-require
    const { Capacitor } = require("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export default function TrialExpiredModal({ onFallbackSettings, onDismiss }) {
  const { user, session } = useAuth();
  const variants = getLemonVariants();

  useEffect(() => {
    posthog.capture("trial_expired");
  }, []);

  const handleSeePlans = () => {
    if (!user?.id || isNative() || !variants.isConfigured) {
      onFallbackSettings?.();
      return;
    }
    const variantId = variants.variantMonthly || variants.variantYearly;
    if (!variantId) {
      onFallbackSettings?.();
      return;
    }
    openCheckout(
      {
        variantId,
        userId: user.id,
        userEmail: user.email || "",
        getAuthToken: () => session?.access_token ?? null,
        onCheckoutSuccessMessage: (msg) => toast(msg),
      },
      () => onFallbackSettings?.(),
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm mx-4 rounded-3xl bg-[#0F172A]/95 border border-white/5 shadow-2xl p-6 space-y-4"
        >
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-white">
              Your space is still here.
            </h2>
            <p className="text-sm text-[#E5E7EB]">
              Your reflections are kept for the duration of your beta access. A subscription keeps you reflecting, without limits.
            </p>
          </div>

          <p
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 16,
              color: "#2d3748",
              textAlign: "center",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            Everything you've experienced — unlimited, and getting smarter each session.
          </p>
          <ul className="list-none space-y-1.5 text-left mx-auto" style={{ maxWidth: "280px" }}>
            <li className="text-sm text-[#718096] flex items-start gap-2">
              <span className="text-[#FFB4A9] shrink-0">•</span>
              <span>Unlimited reflections</span>
            </li>
            <li className="text-sm text-[#718096] flex items-start gap-2">
              <span className="text-[#FFB4A9] shrink-0">•</span>
              <span>Your full mirror report every session</span>
            </li>
            <li className="text-sm text-[#718096] flex items-start gap-2">
              <span className="text-[#FFB4A9] shrink-0">•</span>
              <span>Patterns and insights that deepen over time</span>
            </li>
          </ul>

          <button
            type="button"
            onClick={handleSeePlans}
            className="w-full py-3 rounded-full text-sm font-medium text-[#0F172A] bg-white hover:bg-[#E5E7EB] transition-colors"
          >
            Choose a plan
          </button>

          <button
            type="button"
            onClick={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              try { localStorage.setItem("reflect_trial_modal_snoozed", tomorrow.toISOString()); } catch {}
              onDismiss?.();
            }}
            style={{ background: "transparent", color: "#A0AEC0", fontSize: 13, border: "none", cursor: "pointer", width: "100%", padding: "8px 0" }}
          >
            Remind me in 24 hours
          </button>

          <p className="text-[10px] text-[#9CA3AF] text-center mt-1">
            You can manage or cancel any time from Settings.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

