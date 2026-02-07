import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { Compass, Lightbulb, Fingerprint, ChevronLeft, ChevronRight } from "lucide-react";

const cardIcons = [Compass, Lightbulb, Fingerprint];
const cardColors = [
  { bg: "linear-gradient(145deg, #E0D4FC 0%, #F0EBFF 100%)", accent: "#E0D4FC", shadow: "rgba(224, 212, 252, 0.4)" },
  { bg: "linear-gradient(145deg, #C1D0C6 0%, #E0EBE4 100%)", accent: "#C1D0C6", shadow: "rgba(193, 208, 198, 0.4)" },
  { bg: "linear-gradient(145deg, #FFDDD2 0%, #FFF0EB 100%)", accent: "#FFDDD2", shadow: "rgba(255, 221, 210, 0.4)" }
];

const MindJourney = ({ sections, onContinue, onBack }) => {
  const [currentCard, setCurrentCard] = useState(0);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (currentCard < sections.length - 1) {
        setCurrentCard(prev => prev + 1);
      }
    },
    onSwipedRight: () => {
      if (currentCard > 0) {
        setCurrentCard(prev => prev - 1);
      }
    },
    trackMouse: true,
    trackTouch: true
  });

  const goToCard = (index) => {
    setCurrentCard(index);
  };

  const nextCard = () => {
    if (currentCard < sections.length - 1) {
      setCurrentCard(prev => prev + 1);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setCurrentCard(prev => prev - 1);
    }
  };

  const Icon = cardIcons[currentCard];
  const colors = cardColors[currentCard];

  const cardTitles = [
    "Where the Mind Is Going",
    "What This Assumes",
    "What This Touches"
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-lg flex flex-col items-center"
      data-testid="mind-journey-step"
    >
      {/* Swipeable card area */}
      <div 
        {...handlers}
        className="w-full relative"
        style={{ touchAction: "pan-y" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -50, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[2.5rem] p-10 md:p-12"
            style={{
              background: colors.bg,
              boxShadow: `0 20px 60px ${colors.shadow}, 0 8px 24px rgba(0,0,0,0.05)`
            }}
            data-testid={`journey-card-${currentCard}`}
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="w-14 h-14 rounded-full mb-6 flex items-center justify-center bg-white/60 backdrop-blur-sm"
            >
              <Icon className="w-6 h-6 text-[#4A5568]" />
            </motion.div>

            {/* Title */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-sm uppercase tracking-widest text-[#4A5568]/70 mb-4 font-medium"
            >
              {cardTitles[currentCard]}
            </motion.p>

            {/* Content - limited to 2-3 sentences */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-lg md:text-xl leading-relaxed text-[#4A5568]"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 300 }}
              data-testid={`journey-content-${currentCard}`}
            >
              {sections[currentCard]?.content?.split('.').slice(0, 2).join('.') + '.' || "This aspect of your thought holds something worth noticing."}
            </motion.p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none px-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={prevCard}
            className={`w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center pointer-events-auto transition-opacity ${
              currentCard === 0 ? "opacity-30 cursor-not-allowed" : "opacity-100"
            }`}
            disabled={currentCard === 0}
            data-testid="prev-card-button"
          >
            <ChevronLeft className="w-5 h-5 text-[#4A5568]" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextCard}
            className={`w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center pointer-events-auto transition-opacity ${
              currentCard === sections.length - 1 ? "opacity-30 cursor-not-allowed" : "opacity-100"
            }`}
            disabled={currentCard === sections.length - 1}
            data-testid="next-card-button"
          >
            <ChevronRight className="w-5 h-5 text-[#4A5568]" />
          </motion.button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-3 mt-8" data-testid="card-dots">
        {sections.map((_, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => goToCard(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              index === currentCard 
                ? "w-8 bg-[#FFB4A9]" 
                : "bg-[#E2E8F0] hover:bg-[#CBD5E0]"
            }`}
            data-testid={`card-dot-${index}`}
          />
        ))}
      </div>

      {/* Swipe hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-[#A0AEC0] mt-4"
      >
        Swipe or tap arrows to explore
      </motion.p>

      {/* Navigation buttons */}
      <div className="flex gap-4 mt-8">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onBack}
          className="px-6 py-3 rounded-full text-[#718096] bg-white/60 backdrop-blur-sm border border-[#E2E8F0] hover:bg-white/80 transition-colors"
          data-testid="back-button"
        >
          Back
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03, x: 4 }}
          whileTap={{ scale: 0.97 }}
          onClick={onContinue}
          className="flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium"
          style={{ 
            background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
            boxShadow: "0 8px 24px rgba(255, 180, 169, 0.3)"
          }}
          data-testid="continue-to-questions"
        >
          <span>Continue</span>
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>
    </motion.div>
  );
};

export default MindJourney;
