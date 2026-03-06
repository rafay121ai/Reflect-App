import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "reflect_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    try {
      const val = window.localStorage.getItem(STORAGE_KEY);
      return val !== "accepted" && val !== "declined";
    } catch {
      return true;
    }
  });

  const handleAccept = () => {
    try { window.localStorage.setItem(STORAGE_KEY, "accepted"); } catch {}
    setVisible(false);
  };

  const handleDecline = () => {
    // Auth cookie remains for functional sign-in purposes regardless of consent choice
    try { window.localStorage.setItem(STORAGE_KEY, "declined"); } catch {}
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "#FFFDF7",
            borderTop: "1px solid #E2E8F0",
            padding: "16px 24px",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, color: "#718096", lineHeight: 1.6, margin: 0 }}>
                We use a single cookie to keep you signed in. No tracking. No ads. No third-party data sharing.
              </p>
              <a
                href="/privacy"
                style={{ fontSize: 12, color: "#A0AEC0", textDecoration: "underline", marginTop: 4, display: "inline-block" }}
              >
                Privacy policy
              </a>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={handleAccept}
                style={{
                  background: "#2d3748",
                  color: "white",
                  borderRadius: 10,
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Got it
              </button>
              <button
                type="button"
                onClick={handleDecline}
                style={{
                  background: "transparent",
                  color: "#A0AEC0",
                  border: "none",
                  padding: "10px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
