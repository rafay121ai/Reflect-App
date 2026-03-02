/**
 * Shown when user hits reflection limit (429).
 * On native: can be shown after native paywall is dismissed without purchasing, or as fallback.
 * On web: primary way to explain limit and direct to Lemon Squeezy checkout.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";
import { openCheckout, getLemonVariants } from "../lib/lemonSqueezy";

function isNative() {
  try {
    const { Capacitor } = require("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch (_) {
    return false;
  }
}

export default function PaywallLimitModal({ onUpgrade, onDismiss }) {
  const { user } = useAuth();
  const { isSupported: isRevenueCatSupported, presentPaywall } = useRevenueCat();
  const [lemonReady, setLemonReady] = useState(false);
  const variants = getLemonVariants();

  useEffect(() => {
    if (!isNative() && variants.isConfigured) setLemonReady(true);
  }, [variants.isConfigured]);

  const handleUpgrade = () => {
    if (isNative() && isRevenueCatSupported) {
      presentPaywall().catch(() => {});
      onUpgrade?.();
      return;
    }
    if (lemonReady && user?.id) {
      const variantId = variants.variantMonthly || variants.variantYearly;
      openCheckout(
        { variantId, userId: user.id, userEmail: user.email || "" },
        (err) => err && (window.alert?.(err) || console.warn(err))
      );
      onUpgrade?.();
      return;
    }
    onUpgrade?.();
  };

  const showLemonOptions = lemonReady && user?.id && (variants.variantMonthly || variants.variantYearly);
  const hasBothVariants = variants.variantMonthly && variants.variantYearly;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl bg-[#FFFDF7] border border-[#E2E8F0] shadow-xl overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#FFB4A9]/20 flex items-center justify-center mx-auto mb-4">
            <Crown className="w-6 h-6 text-[#FFB4A9]" />
          </div>
          <h2 className="text-lg font-medium text-[#4A5568] mb-2">
            Reflection limit reached
          </h2>
          <p className="text-sm text-[#64748B] mb-6">
            You've used your free reflections for now. Upgrade to Premium for more daily reflections and to unlock the full experience.
          </p>
          <div className="flex flex-col gap-2">
            {showLemonOptions && hasBothVariants ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    openCheckout(
                      { variantId: variants.variantMonthly, userId: user?.id, userEmail: user?.email || "" },
                      (e) => e && (window.alert?.(e) || console.warn(e))
                    );
                    onUpgrade?.();
                  }}
                  className="w-full py-2.5 px-4 text-sm font-medium rounded-xl bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 border border-[#FFB4A9]/40 transition-colors"
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openCheckout(
                      { variantId: variants.variantYearly, userId: user?.id, userEmail: user?.email || "" },
                      (e) => e && (window.alert?.(e) || console.warn(e))
                    );
                    onUpgrade?.();
                  }}
                  className="w-full py-2.5 px-4 text-sm font-medium rounded-xl bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 border border-[#FFB4A9]/40 transition-colors"
                >
                  Yearly (best value)
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleUpgrade}
                className="w-full py-3 px-4 text-sm font-medium rounded-xl text-white transition-colors"
                style={{
                  background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
                  boxShadow: "0 4px 14px rgba(255, 180, 169, 0.35)",
                }}
              >
                Upgrade to Premium
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-2.5 text-sm text-[#94A3B8] hover:text-[#64748B] transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
