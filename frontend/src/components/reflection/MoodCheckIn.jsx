import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, RotateCcw } from "lucide-react";
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
      await onSubmitMood(reflectionId, wordOrPhrase, description);
      setIsSubmitted(true);
      onDone?.(wordOrPhrase);
    } catch (err) {
      console.error("Mood submit error:", err);
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
          fontFamily: "'Crimson Pro', serif",
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
        Here are some words you could use.. or ignore.
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
                  text-left px-4 py-4 rounded-2xl border transition-all duration-200
                  ${selected === item.phrase
                    ? "bg-stone-50 border-stone-300 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                    : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                  }
                `}
                whileHover={selected !== item.phrase ? { scale: 1.01 } : {}}
                whileTap={{ scale: 0.99 }}
              >
                <span 
                  className={`block text-[15px] mb-1.5 ${
                    selected === item.phrase ? "text-stone-800" : "text-stone-700"
                  }`}
                  style={{ 
                    fontFamily: "'Crimson Pro', serif",
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
        className="w-full max-w-xl mb-8"
      >
        <input
          type="text"
          placeholder="Or write your own."
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value);
            if (e.target.value.trim()) setSelected("");
          }}
          className="w-full px-5 py-4 rounded-2xl border border-stone-200 bg-white text-stone-700 placeholder-stone-400 focus:outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100 transition-all duration-200"
          style={{ 
            fontFamily: "'Inter', sans-serif",
            fontSize: "15px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)"
          }}
          maxLength={80}
          data-testid="mood-free-text"
        />
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: loadingSuggestions ? 0.2 : 0.5 }}
        className="flex flex-col sm:flex-row gap-3 w-full max-w-sm"
      >
        <HapticButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!displayValue || isSubmitting}
          data-testid="mood-submit"
          className="flex-1"
        >
          {isSubmitting ? "…" : "Done"}
        </HapticButton>
        <HapticButton
          variant="ghost"
          onClick={handleSkip}
          disabled={isSubmitting}
          data-testid="mood-skip"
          className="flex-1"
        >
          Not right now
        </HapticButton>
      </motion.div>
    </motion.div>
  );
};

export default MoodCheckIn;