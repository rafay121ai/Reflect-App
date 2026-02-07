import { motion } from "framer-motion";
import { Wind } from "lucide-react";

const LoadingState = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="flex flex-col items-center justify-center min-h-[60vh] gap-8"
      data-testid="loading-state"
    >
      {/* Animated icon */}
      <motion.div
        animate={{ 
          opacity: [0.5, 1, 0.5],
          scale: [0.95, 1.05, 0.95]
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)" }}
      >
        <Wind className="w-8 h-8 text-white" />
      </motion.div>

      {/* Loading text */}
      <motion.p
        animate={{ 
          opacity: [0.5, 1, 0.5]
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="text-2xl md:text-3xl font-light text-[#4A5568] tracking-wide"
        style={{ fontFamily: "'Fraunces', serif" }}
        data-testid="loading-text"
        aria-live="polite"
      >
        Sitting with your thought…
      </motion.p>

      {/* Subtle breathing dots */}
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ 
              opacity: [0.3, 0.8, 0.3],
              scale: [0.8, 1.1, 0.8]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut",
              delay: i * 0.3
            }}
            className="w-3 h-3 rounded-full"
            style={{ 
              background: i === 0 ? "#FFB4A9" : i === 1 ? "#E0D4FC" : "#C1D0C6"
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default LoadingState;
