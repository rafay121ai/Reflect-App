import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { Sparkles, RefreshCw, RotateCcw, X, Download, Share2, Check } from "lucide-react";
import HapticButton from "../ui/HapticButton";
import { getAuthHeaders } from "../../lib/api";

/**
 * Read-only view of a reflection (opened from "come back later" banner or reminder notification).
 * Fetches reflection by id and shows the mirror with the same UI as MirrorReflection.
 */
const ViewReflection = ({ reflectionId, onClose, onReflectAnother, onStartFresh, apiBase }) => {
  const [reflection, setReflection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const shareCardRef = useRef(null);

  useEffect(() => {
    if (!reflectionId || !apiBase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/reflections/${reflectionId}`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Reflection not found" : "Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setReflection(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reflectionId, apiBase]);

  const mirrorContent = reflection?.personalized_mirror || reflection?.thought || "This reflection is yours to revisit.";

  const handleSaveAsImage = async () => {
    if (!shareCardRef.current) return;
    setIsGeneratingImage(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#FFFDF7",
      });
      const link = document.createElement("a");
      link.download = `reflection-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setShowShareSuccess(true);
      setTimeout(() => setShowShareSuccess(false), 2000);
    } catch (err) {
      console.error("Error generating image:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    setIsGeneratingImage(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#FFFDF7",
      });
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "reflection.png", { type: "image/png" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "A Moment of Reflection",
          text: "A gentle mirror for my thoughts",
        });
      } else {
        handleSaveAsImage();
      }
    } catch (err) {
      console.error("Error sharing:", err);
      handleSaveAsImage();
    } finally {
      setIsGeneratingImage(false);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl flex flex-col items-center justify-center py-16"
        data-testid="view-reflection-loading"
      >
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-[#FFB4A9]/50 border-t-[#FFB4A9]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="text-[#718096] text-sm mt-4">Loading your reflection…</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl flex flex-col items-center text-center py-8"
        data-testid="view-reflection-error"
      >
        <p className="text-[#718096] mb-4">{error}</p>
        <HapticButton variant="secondary" onClick={onClose}>
          <span>Back</span>
        </HapticButton>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-xl flex flex-col items-center text-center"
      data-testid="view-reflection"
    >
      {/* Animated gradient background - matches MirrorReflection */}
      <motion.div
        className="absolute inset-0 -z-10 opacity-20"
        style={{
          background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 25%, #C1D0C6 50%, #FFDDD2 75%, #FFB4A9 100%)",
          backgroundSize: "400% 400%",
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Icon with glow and pulse - matches MirrorReflection */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
        className="relative w-20 h-20 rounded-full mb-8 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)",
          boxShadow: "0 0 60px rgba(255, 180, 169, 0.3), 0 12px 40px rgba(255, 180, 169, 0.15)",
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: "2px solid rgba(255, 180, 169, 0.3)" }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <Sparkles className="w-8 h-8 text-[#FFB4A9]" />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-sm uppercase tracking-widest text-[#FFB4A9] mb-6 font-medium"
      >
        A Mirror
      </motion.p>

      {/* Shareable card - same styling as MirrorReflection */}
      <motion.div
        ref={shareCardRef}
        initial={{ opacity: 0, y: 30, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[2.5rem] p-12 md:p-16 mb-6 w-full text-left relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(255,248,240,0.95) 100%)",
          boxShadow: "0 0 80px rgba(255, 180, 169, 0.12), 0 30px 80px rgba(255, 180, 169, 0.1), 0 12px 32px rgba(224, 212, 252, 0.08)",
        }}
      >
        <div
          className="absolute top-0 right-0 w-32 h-32 opacity-30"
          style={{ background: "radial-gradient(circle at top right, #FFB4A9 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-32 h-32 opacity-20"
          style={{ background: "radial-gradient(circle at bottom left, #E0D4FC 0%, transparent 70%)" }}
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-2xl md:text-3xl lg:text-4xl leading-relaxed text-[#4A5568] relative z-10 whitespace-pre-wrap"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, lineHeight: 1.5 }}
        >
          {mirrorContent}
        </motion.p>
        <div className="absolute bottom-4 right-6 text-xs text-[#CBD5E0] opacity-60">
          ✦ a gentle mirror
        </div>
      </motion.div>

      {/* Save as Image & Share - matches MirrorReflection */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex gap-3 mb-8"
      >
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleSaveAsImage}
          disabled={isGeneratingImage}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm text-[#718096] bg-white/80 backdrop-blur-sm border border-[#E2E8F0] hover:bg-white hover:border-[#FFB4A9]/30 transition-all disabled:opacity-50"
          data-testid="save-image-button"
        >
          {showShareSuccess ? (
            <>
              <Check className="w-4 h-4 text-[#C1D0C6]" />
              <span>Saved!</span>
            </>
          ) : isGeneratingImage ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Download className="w-4 h-4" />
              </motion.div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Save as Image</span>
            </>
          )}
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleShare}
          disabled={isGeneratingImage}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm text-white disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
            boxShadow: "0 4px 16px rgba(255, 180, 169, 0.2)",
          }}
          data-testid="share-button"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </motion.button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-[#718096] mb-6"
      >
        This reflection is yours
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="flex flex-col items-center gap-4"
        data-testid="view-reflection-actions"
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <HapticButton variant="primary" onClick={onReflectAnother} data-testid="reflect-another-button">
            <RefreshCw className="w-5 h-5" />
            <span>Reflect Again</span>
          </HapticButton>
          <HapticButton variant="secondary" onClick={onStartFresh} data-testid="start-fresh-button">
            <RotateCcw className="w-5 h-5" />
            <span>Start Fresh</span>
          </HapticButton>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-[#A0AEC0] hover:text-[#718096] transition-colors"
          data-testid="close-button"
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="text-sm text-[#A0AEC0] mt-10"
      >
        Your words aren't stored — only soft patterns that help notice themes over time.
      </motion.p>
    </motion.div>
  );
};

export default ViewReflection;
