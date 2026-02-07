import { motion } from "framer-motion";
import { SkipForward } from "lucide-react";

const ProgressIndicator = ({ currentStep, totalSteps, onSkip, stepLabels: stepLabelsProp }) => {
  const stepLabels = stepLabelsProp ?? ["Feel", "Explore", "Reflect", "See"];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-between px-6 py-4 mb-8"
      data-testid="progress-indicator"
    >
      {/* Progress dots and labels */}
      <div className="flex items-center gap-3">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <motion.div
              animate={{
                scale: index === currentStep ? 1.2 : 1,
                backgroundColor: index <= currentStep ? "#FFB4A9" : "#E2E8F0"
              }}
              transition={{ duration: 0.3 }}
              className={`w-3 h-3 rounded-full ${
                index === currentStep ? "shadow-lg shadow-[#FFB4A9]/40" : ""
              }`}
              data-testid={`progress-dot-${index}`}
            />
            <span 
              className={`text-xs hidden sm:block transition-colors duration-300 ${
                index === currentStep ? "text-[#4A5568] font-medium" : "text-[#A0AEC0]"
              }`}
            >
              {stepLabels[index]}
            </span>
          </div>
        ))}
      </div>

      {/* Skip button */}
      {currentStep < totalSteps - 1 && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onSkip}
          className="flex items-center gap-1 text-sm text-[#A0AEC0] hover:text-[#718096] transition-colors duration-200"
          data-testid="skip-button"
        >
          <span>Skip to end</span>
          <SkipForward className="w-4 h-4" />
        </motion.button>
      )}
    </motion.div>
  );
};

export default ProgressIndicator;
