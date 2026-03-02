import { motion, AnimatePresence } from "framer-motion";
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

export default function TrialExpiredModal({ onFallbackSettings }) {
  const { user } = useAuth();
  const variants = getLemonVariants();

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
              Everything you've written is saved. A subscription keeps it that way — and keeps you reflecting, without limits.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSeePlans}
            className="w-full py-3 rounded-full text-sm font-medium text-[#0F172A] bg-white hover:bg-[#E5E7EB] transition-colors"
          >
            Choose a plan
          </button>

          <p className="text-[10px] text-[#9CA3AF] text-center mt-1">
            You can manage or cancel any time from Settings.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

