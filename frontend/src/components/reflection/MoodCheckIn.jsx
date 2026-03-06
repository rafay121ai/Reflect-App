import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, RotateCcw, ChevronRight } from "lucide-react";
import HapticButton from "../ui/HapticButton";

const FALLBACK_SUGGESTIONS = [
  { phrase: "foggy morning", description: "A sense of things being unclear or slow to lift." },
  { phrase: "paused traffic", description: "Waiting, with nowhere to go yet." },
  { phrase: "open window", description: "Something has shifted; a bit of air." },
  { phrase: "low battery", description: "Running on less than usual." },
  { phrase: "deep water", description: "In the middle of something that asks for patience." },
];

const MoodCheckIn = ({
  originalThought,
  mirrorText,
  reflectionId,
  onSubmitMood,
  onDone,
  onSkip,
  onReflectAnother,
  onStartFresh,
  onFetchMoodSuggestions,
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [selected, setSelected] = useState("");
  const [freeText, setFreeText] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayValue = (freeText.trim() || selected).trim();

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    (async () => {
      try {
        const list = await onFetchMoodSuggestions(originalThought || "", mirrorText || "");
        if (!cancelled) {
          setSuggestions(Array.isArray(list) && list.length > 0 ? list : FALLBACK_SUGGESTIONS);
        }
      } catch (_) {
        if (!cancelled) setSuggestions(FALLBACK_SUGGESTIONS);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [originalThought, mirrorText, onFetchMoodSuggestions]);

  const handleSubmit = async () => {
    const wordOrPhrase = displayValue;
    if (!wordOrPhrase) return;

    // If they picked a suggestion card, include its description for Supabase
    const selectedItem = suggestions.find((s) => s.phrase === selected);
    const description = selectedItem?.description ?? null;

    setIsSubmitting(true);
    try {
      if (onSubmitMood) {
        await onSubmitMood(reflectionId, wordOrPhrase, description);
      }
      setIsSubmitted(true);
      onDone?.(wordOrPhrase);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("Mood submit error:", err);
      setIsSubmitted(true);
      onDone?.(wordOrPhrase);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onDone?.(null);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl mx-auto px-6 flex flex-col items-center"
        data-testid="mood-complete"
      >
        <p 
          className="text-sm text-stone-400 mb-8"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          This reflection is yours
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <HapticButton
            variant="primary"
            onClick={onReflectAnother}
            data-testid="reflect-another-button"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={2} />
            <span>Reflect Again</span>
          </HapticButton>
          <HapticButton
            variant="secondary"
            onClick={onStartFresh}
            data-testid="start-fresh-button"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={2} />
            <span>Start Fresh</span>
          </HapticButton>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-2xl mx-auto px-6 flex flex-col items-center"
      data-testid="mood-checkin"
    >
      {/* Ambient background glow - matching MirrorReflection */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 -right-1/4 w-[800px] h-[800px] rounded-full opacity-[0.07]"
          style={{ 
            background: "radial-gradient(circle, #D4A5A5 0%, transparent 70%)",
            filter: "blur(80px)"
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.07, 0.12, 0.07]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-1/4 -left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ 
            background: "radial-gradient(circle, #C9B8D9 0%, transparent 70%)",
            filter: "blur(100px)"
          }}
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.06, 0.1, 0.06]
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl md:text-3xl text-stone-700 mb-2 text-center"
        style={{ 
          fontFamily: "'Fraunces', serif",
          fontWeight: 400,
          letterSpacing: "-0.02em"
        }}
      >
        If this moment were a scene, what would it be?
      </motion.h2>
      
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm text-stone-400 mb-12 text-center"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Here are some words you could use… or ignore.
      </motion.p>

      {/* Suggestion cards */}
      <div className="w-full max-w-xl mb-8">
        {loadingSuggestions ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="h-[88px] rounded-2xl bg-white border border-stone-200"
                style={{
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)"
                }}
              >
                <div className="h-full p-4 space-y-2">
                  <div className="h-4 bg-stone-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-stone-100 rounded animate-pulse w-full" />
                  <div className="h-3 bg-stone-100 rounded animate-pulse w-4/5" />
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((item, index) => (
              <motion.button
                key={item.phrase}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                onClick={() => {
                  setSelected(item.phrase);
                  setFreeText("");
                }}
                className={`
                  text-left px-4 py-4 rounded-2xl border-2 transition-all duration-200
                  ${selected === item.phrase
                    ? "bg-[#FFE8E4] border-[#FFB4A9] shadow-[0_4px_16px_rgba(255,180,169,0.35)] ring-2 ring-[#FFB4A9]/40"
                    : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                  }
                `}
                whileHover={selected !== item.phrase ? { scale: 1.01 } : {}}
                whileTap={{ scale: 0.99 }}
              >
                <span 
                  className={`block text-[15px] mb-1.5 ${
                    selected === item.phrase ? "text-stone-900 font-semibold" : "text-stone-700"
                  }`}
                  style={{ 
                    fontFamily: "'Fraunces', serif",
                    fontWeight: 500,
                    letterSpacing: "-0.01em"
                  }}
                >
                  {item.phrase}
                </span>
                <span 
                  className="block text-xs text-stone-500 leading-relaxed"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {item.description}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Custom input */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: loadingSuggestions ? 0.1 : 0.4 }}
        className="w-full max-w-xl mb-6"
      >
        <input
          type="text"
          placeholder="Or write your own."
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value);
            if (e.target.value.trim()) setSelected("");
          }}
          className={`w-full px-5 py-4 rounded-2xl border-2 bg-white text-stone-700 placeholder-stone-400 focus:outline-none transition-all duration-200 ${
            freeText.trim()
              ? "border-[#FFB4A9] focus:border-[#FFB4A9] focus:ring-4 focus:ring-[#FFB4A9]/20 bg-[#FFE8E4]/30"
              : "border-stone-200 focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
          }`}
          style={{ 
            fontFamily: "'Inter', sans-serif",
            fontSize: "15px",
            boxShadow: freeText.trim() ? "0 4px 16px rgba(255,180,169,0.2)" : "0 1px 2px rgba(0, 0, 0, 0.02)"
          }}
          maxLength={80}
          data-testid="mood-free-text"
        />
      </motion.div>

      {/* Arrow out of mood container when a selection is made */}
      <AnimatePresence>
        {displayValue && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="flex flex-col items-center gap-4 mb-4"
          >
            <motion.button
              type="button"
              onClick={() => !isSubmitting && handleSubmit()}
              disabled={!displayValue || isSubmitting}
              whileHover={!isSubmitting ? { scale: 1.08 } : {}}
              whileTap={!isSubmitting ? { scale: 0.95 } : {}}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
                boxShadow: "0 8px 24px rgba(255, 180, 169, 0.4)"
              }}
              data-testid="mood-submit"
            >
              <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
            </motion.button>
            <p className="text-xs text-stone-400">Tap to continue</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip option */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: loadingSuggestions ? 0.2 : 0.5 }}
        className="flex justify-center"
      >
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-sm text-stone-400 hover:text-stone-600 transition-colors py-2 disabled:opacity-50"
          data-testid="mood-skip"
        >
          Not right now
        </button>
      </motion.div>
    </motion.div>
  );
};

export default MoodCheckIn;