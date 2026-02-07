import { motion } from "framer-motion";
import { Heart, ChevronRight } from "lucide-react";

const EmotionalUndercurrent = ({ content, onContinue }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg"
      data-testid="emotional-undercurrent-step"
    >
      {/* Card */}
      <motion.div
        animate={{ scale: [1, 1.005, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[2.5rem] p-10 md:p-14"
        style={{
          background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8F0 100%)",
          boxShadow: "0 20px 60px rgba(255, 180, 169, 0.15), 0 8px 24px rgba(224, 212, 252, 0.1)"
        }}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-16 h-16 rounded-full mb-8 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)" }}
        >
          <Heart className="w-7 h-7 text-white" />
        </motion.div>

        {/* Label */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm uppercase tracking-widest text-[#FFB4A9] mb-4 font-medium"
        >
          Emotional Undercurrent
        </motion.p>

        {/* Content */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-xl md:text-2xl leading-relaxed text-[#4A5568] mb-10"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300 }}
          data-testid="emotional-content"
        >
          {content || "There's something stirring beneath the surface of this thought."}
        </motion.p>

        {/* Continue button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          whileHover={{ scale: 1.03, x: 4 }}
          whileTap={{ scale: 0.97 }}
          onClick={onContinue}
          className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-medium transition-shadow duration-300 hover:shadow-xl"
          style={{ 
            background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
            boxShadow: "0 8px 24px rgba(255, 180, 169, 0.3)"
          }}
          data-testid="continue-button"
        >
          <span>Continue</span>
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </motion.div>

      {/* Hint text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-center text-sm text-[#A0AEC0] mt-6"
      >
        Take a breath. There's no rush.
      </motion.p>
    </motion.div>
  );
};

export default EmotionalUndercurrent;
