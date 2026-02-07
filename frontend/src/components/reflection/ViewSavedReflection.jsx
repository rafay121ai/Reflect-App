import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import HapticButton from "../ui/HapticButton";
import { getAuthHeaders } from "../../lib/api";

/**
 * View one saved reflection from history (My reflections).
 * Fetches by saved id, shows mirror_response. Start Fresh + Close.
 */
const ViewSavedReflection = ({
  savedId,
  apiBase,
  onClose,
  onStartFresh,
}) => {
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!savedId || !apiBase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/history/${savedId}`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Reflection not found" : "Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSaved(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [savedId, apiBase]);

  useEffect(() => {
    if (!savedId || !apiBase || loading || error) return;
    fetch(`${apiBase}/history/${savedId}/mark-opened`, { method: "PATCH", headers: getAuthHeaders() }).catch(() => {});
  }, [savedId, apiBase, loading, error]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl flex flex-col items-center justify-center py-16"
      >
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-[#FFB4A9]/50 border-t-[#FFB4A9]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="text-[#718096] text-sm mt-4">Loading…</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl flex flex-col items-center text-center py-8"
      >
        <p className="text-[#718096] mb-4">{error}</p>
        <HapticButton variant="secondary" onClick={onClose}>
          <span>Close</span>
        </HapticButton>
      </motion.div>
    );
  }

  const content = saved?.mirror_response || "This reflection is yours.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-xl flex flex-col items-center text-center"
    >
      <motion.div
        className="absolute inset-0 -z-10 opacity-20"
        style={{
          background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 25%, #C1D0C6 50%, #FFDDD2 75%, #FFB4A9 100%)",
          backgroundSize: "400% 400%",
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm uppercase tracking-widest text-[#FFB4A9] mb-6 font-medium"
      >
        A Mirror
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[2.5rem] p-10 md:p-14 mb-8 w-full text-left"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(255,248,240,0.95) 100%)",
          boxShadow: "0 0 80px rgba(255, 180, 169, 0.12), 0 30px 80px rgba(255, 180, 169, 0.1)",
        }}
      >
        <p
          className="text-2xl md:text-3xl leading-relaxed text-[#4A5568] whitespace-pre-wrap"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, lineHeight: 1.5 }}
        >
          {content}
        </p>
      </motion.div>

      <p className="text-[#718096] mb-6">This reflection is yours</p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4"
      >
        <HapticButton variant="primary" onClick={onStartFresh}>
          <span>Start Fresh</span>
        </HapticButton>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-[#A0AEC0] hover:text-[#718096] transition-colors"
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </button>
      </motion.div>
    </motion.div>
  );
};

export default ViewSavedReflection;
