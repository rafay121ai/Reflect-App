import { motion } from "framer-motion";
import { Feather } from "lucide-react";

const InputScreen = ({ thought, setThought, onSubmit }) => {
  const charCount = thought.length;
  const isInRange = charCount >= 50 && charCount <= 500;
  const isEmpty = charCount === 0;

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
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isEmpty) {
      onSubmit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-8 md:gap-12"
      data-testid="input-screen"
    >
      {/* Header */}
      <div className="flex flex-col gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)" }}
        >
          <Feather className="w-6 h-6 text-white" />
        </motion.div>
        
        <h1 
          className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#4A5568]"
          style={{ fontFamily: "'Fraunces', serif" }}
          data-testid="input-header"
        >
          What's on your mind right now?
        </h1>
      </div>

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
          placeholder="A thought, unfiltered…"
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
        disabled={isEmpty}
        whileHover={!isEmpty ? { scale: 1.02, x: 4 } : {}}
        whileTap={!isEmpty ? { scale: 0.98 } : {}}
        className={`
          rounded-full px-10 py-4 text-lg font-medium
          transition-all duration-300 ease-out
          ${isEmpty 
            ? 'bg-[#E2E8F0] text-[#A0AEC0] cursor-not-allowed' 
            : 'text-white'
          }
        `}
        style={!isEmpty ? { 
          background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
          boxShadow: "0 12px 32px rgba(255, 180, 169, 0.3)"
        } : {}}
        data-testid="reflect-button"
        aria-label="Reflect on your thought"
      >
        Reflect
      </motion.button>

      {/* Privacy note */}
      <p className="text-sm text-[#A0AEC0] text-center leading-relaxed" data-testid="privacy-note">
        Your exact words fade after this session.
        <br />
        <span className="text-[#CBD5E0]">Only gentle impressions help the app notice patterns over time.</span>
      </p>
    </motion.div>
  );
};

export default InputScreen;
