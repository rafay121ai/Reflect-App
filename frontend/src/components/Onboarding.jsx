import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Feather, Heart, Wind } from "lucide-react";

const slides = [
  {
    icon: Feather,
    title: "We're glad you're here.",
    text: "A space to sit with one thought. No fixing, no judging.",
    gradient: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)"
  },
  {
    icon: Heart,
    title: "No advice. No fixing.",
    text: "We just reflect back what we hear—like a quiet friend.",
    gradient: "linear-gradient(135deg, #E0D4FC 0%, #F0EBFF 100%)"
  },
  {
    icon: Wind,
    title: "Your words stay yours.",
    text: "We're here to listen and help you see it gently.",
    gradient: "linear-gradient(135deg, #C1D0C6 0%, #E0EBE4 100%)"
  }
];

const Onboarding = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[70vh]"
      data-testid="onboarding"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center max-w-md"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-20 h-20 rounded-full mb-8 flex items-center justify-center"
            style={{ background: slide.gradient }}
          >
            <Icon className="w-9 h-9 text-white" />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-3xl md:text-4xl font-light text-[#4A5568] mb-4"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            {slide.title}
          </motion.h1>

          {/* Text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-[#718096] leading-relaxed"
          >
            {slide.text}
          </motion.p>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex gap-2 mt-12">
        {slides.map((_, index) => (
          <motion.div
            key={index}
            animate={{
              width: index === currentSlide ? 24 : 8,
              backgroundColor: index <= currentSlide ? "#FFB4A9" : "#E2E8F0"
            }}
            transition={{ duration: 0.3 }}
            className="h-2 rounded-full"
          />
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-4 mt-10">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onComplete}
          className="px-6 py-3 rounded-full text-[#A0AEC0] hover:text-[#718096] transition-colors"
          data-testid="skip-onboarding"
        >
          Skip
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          className="px-8 py-3 rounded-full text-white font-medium"
          style={{ 
            background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
            boxShadow: "0 8px 24px rgba(255, 180, 169, 0.25)"
          }}
          data-testid="next-onboarding"
        >
          {isLastSlide ? "Begin" : "Next"}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default Onboarding;
