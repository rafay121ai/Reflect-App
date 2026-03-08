import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReturnCard from "./ReturnCard";

const DRAFT_KEY = "reflect_draft";

const InputScreen = ({ thought, setThought, onSubmit, isSubmitting = false, returnCard, onDismissReturnCard, isReturning = false, reflectionCount = 0 }) => {
  const [draftBanner, setDraftBanner] = useState(null);
  const [showReturnCard, setShowReturnCard] = useState(true);
  const debounceRef = useRef(null);

  // On mount, check for a saved draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved && saved.trim()) {
        setDraftBanner(saved.trim());
      }
    } catch (_) {}
  }, []);

  // Debounced save on every keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const trimmed = thought.trim();
        if (trimmed) {
          localStorage.setItem(DRAFT_KEY, trimmed);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch (_) {}
    }, 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [thought]);

  const placeholder = !isReturning
    ? "A thought, unfiltered…"
    : [
        "A thought, unfiltered…",
        "What's sitting with you today?",
        "Start anywhere…",
        "What haven't you said out loud yet?",
      ][reflectionCount % 4];

  const charCount = thought.length;
  const isInRange = charCount >= 50 && charCount <= 500;
  const isEmpty = charCount === 0;
  const disabled = isEmpty || isSubmitting;

  const getCharCountColor = () => {
    if (isEmpty) return "text-[#CBD5E0]";
    if (charCount < 50) return "text-[#A0AEC0]";
    if (charCount > 500) return "text-[#FFB4A9]";
    return "text-[#C1D0C6]";
  };

  const handleTextChange = (e) => {
    setThought(e.target.value);
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isEmpty && !isSubmitting) {
      onSubmit();
    }
  };

  const handleTextareaFocus = () => {
    if (showReturnCard && returnCard) {
      setShowReturnCard(false);
      try {
        localStorage.setItem(`reflect_seen_card_${returnCard.reflection_id}`, "true");
      } catch (_) {}
      if (onDismissReturnCard) onDismissReturnCard();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-8 md:gap-12 pb-24"
      data-testid="input-screen"
    >
      {/* Header */}
      <div className="flex flex-col gap-4" style={{ paddingTop: "72px" }}>
        <h1 
          className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#4A5568]"
          style={{ fontFamily: "'Fraunces', serif" }}
          data-testid="input-header"
        >
          {isReturning ? "What's here today?" : "What's on your mind right now?"}
        </h1>
      </div>

      {/* Return card */}
      <AnimatePresence>
        {showReturnCard && returnCard?.has_card && returnCard.card_text && (
          <ReturnCard
            key="return-card"
            cardText={returnCard.card_text}
          />
        )}
      </AnimatePresence>

      {/* Draft recovery banner */}
      <AnimatePresence>
        {draftBanner && !thought.trim() && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{
              background: "rgba(255, 180, 169, 0.08)",
              border: "1px solid rgba(255, 180, 169, 0.2)",
            }}
          >
            <p className="text-sm text-[#4A5568]">You have an unsaved reflection.</p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setThought(draftBanner);
                  setDraftBanner(null);
                }}
                className="text-sm font-medium text-[#4A5568] hover:underline"
                style={{ textUnderlineOffset: "3px" }}
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftBanner(null);
                  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
                }}
                className="text-sm text-[#A0AEC0] hover:underline"
                style={{ textUnderlineOffset: "3px" }}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card with textarea */}
      <motion.div 
        animate={{ scale: [1, 1.003, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-[2.5rem] p-8 md:p-12"
        style={{
          background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8F0 100%)",
          boxShadow: "0 20px 60px rgba(255, 180, 169, 0.12), 0 8px 24px rgba(224, 212, 252, 0.08)"
        }}
        data-testid="input-card"
      >
        <textarea
          value={thought}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={handleTextareaFocus}
          placeholder={placeholder}
          className="w-full bg-transparent border-none text-xl md:text-2xl text-[#4A5568] placeholder:text-[#CBD5E0] focus:ring-0 focus:outline-none resize-none leading-relaxed min-h-[200px]"
          style={{ fontFamily: "'Manrope', sans-serif" }}
          data-testid="thought-textarea"
          aria-label="Enter your thought"
        />
        
        {/* Character counter */}
        <div className="flex justify-between items-center mt-6 pt-6 border-t border-[#E2E8F0]/50">
          <span className={`text-sm ${getCharCountColor()} transition-colors duration-300`} data-testid="char-counter">
            {charCount === 0 ? (
              "50–500 characters feels right"
            ) : (
              <>
                {charCount} character{charCount !== 1 ? 's' : ''}
                {charCount < 50 && " — a few more words might help"}
                {charCount > 500 && " — that's plenty"}
                {isInRange && " — just right"}
              </>
            )}
          </span>
        </div>
      </motion.div>

      {/* Submit button */}
      <motion.button
        onClick={onSubmit}
        disabled={disabled}
        whileHover={!disabled ? { scale: 1.02, x: 4 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
        className={`
          rounded-full px-10 py-4 text-lg font-medium opacity-100
          transition-all duration-300 ease-out
          ${disabled
            ? "bg-[#E2E8F0] text-[#A0AEC0] cursor-not-allowed"
            : "bg-[#2d3748] text-white"
          }
        `}
        data-testid="reflect-button"
        aria-label={isSubmitting ? "Reflecting…" : "Reflect on your thought"}
      >
        {isSubmitting ? "Reflecting…" : "Reflect"}
      </motion.button>

      {/* Privacy note */}
      <p
        className="text-center mx-auto mt-4"
        style={{
          fontSize: "12px",
          color: "#A0AEC0",
          lineHeight: 1.6,
          maxWidth: "280px",
        }}
        data-testid="privacy-note"
      >
        Your exact words fade after this session.
        <br />
        <span className="text-[#CBD5E0]">Only gentle impressions help the app notice patterns over time.</span>
      </p>
    </motion.div>
  );
};

export default InputScreen;
