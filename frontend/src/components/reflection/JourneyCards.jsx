import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { Heart, Compass, Lightbulb, Fingerprint, ChevronLeft, ChevronRight } from "lucide-react";

const cardConfig = [
  { 
    key: "feels", 
    title: "What This Feels Like", 
    icon: Heart,
    gradient: "linear-gradient(145deg, #FFDDD2 0%, #FFF0EB 100%)",
    shadow: "rgba(255, 180, 169, 0.3)"
  },
  { 
    key: "stuck", 
    title: "Where You're Stuck", 
    icon: Compass,
    gradient: "linear-gradient(145deg, #E0D4FC 0%, #F0EBFF 100%)",
    shadow: "rgba(224, 212, 252, 0.3)"
  },
  { 
    key: "believe", 
    title: "What You Believe Right Now", 
    icon: Lightbulb,
    gradient: "linear-gradient(145deg, #C1D0C6 0%, #E0EBE4 100%)",
    shadow: "rgba(193, 208, 198, 0.3)"
  },
  { 
    key: "matters", 
    title: "Why This Matters to You", 
    icon: Fingerprint,
    gradient: "linear-gradient(145deg, #FFE4D6 0%, #FFF5F0 100%)",
    shadow: "rgba(255, 200, 180, 0.3)"
  }
];

const JourneyCards = ({ sections, onComplete }) => {
  const [currentCard, setCurrentCard] = useState(0);
  const autoAdvanceRef = useRef(null);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [tapPulse, setTapPulse] = useState(false);

  const getSectionContent = (key) => {
    const mapping = {
      "feels": "Feels Like",
      "stuck": "Stuck",
      "believe": "Believe",
      "matters": "Matters"
    };
    const section = sections.find(s => s.title.toLowerCase().includes(mapping[key]?.toLowerCase() || ""));
    return section?.content || "Something here is worth noticing.";
  };

  useEffect(() => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    
    autoAdvanceRef.current = setTimeout(() => {
      if (currentCard < cardConfig.length - 1) {
        setCurrentCard(prev => prev + 1);
      }
    }, 10000);

    return () => clearTimeout(autoAdvanceRef.current);
  }, [currentCard]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSwipeHint(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Haptic-like visual pulse on card change
  const triggerPulse = () => {
    setTapPulse(true);
    setTimeout(() => setTapPulse(false), 200);
  };

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      setShowSwipeHint(false);
      triggerPulse();
      if (currentCard < cardConfig.length - 1) {
        setCurrentCard(prev => prev + 1);
      } else {
        onComplete();
      }
    },
    onSwipedRight: () => {
      setShowSwipeHint(false);
      triggerPulse();
      if (currentCard > 0) {
        setCurrentCard(prev => prev - 1);
      }
    },
    trackMouse: true,
    trackTouch: true
  });

  const goToCard = (index) => {
    setShowSwipeHint(false);
    triggerPulse();
    setCurrentCard(index);
  };

  const config = cardConfig[currentCard];
  const Icon = config.icon;
  const isLastCard = currentCard === cardConfig.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-lg flex flex-col items-center"
      data-testid="journey-cards"
    >
      {/* Card container */}
      <div 
        {...handlers}
        className="w-full relative"
        style={{ touchAction: "pan-y" }}
      >
        {/* Haptic pulse overlay */}
        <AnimatePresence>
          {tapPulse && (
            <motion.div
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 1.1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 rounded-[2.5rem] border-2 border-[#FFB4A9] z-20 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard}
            initial={{ opacity: 0, x: 60, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -60, scale: 0.92 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[2.5rem] p-10 md:p-12 min-h-[320px] flex flex-col"
            style={{
              background: config.gradient,
              boxShadow: `0 24px 64px ${config.shadow}, 0 8px 24px rgba(0,0,0,0.04)`
            }}
            data-testid={`journey-card-${currentCard}`}
          >
            {/* Icon with subtle pulse */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="relative w-14 h-14 rounded-full mb-5 flex items-center justify-center bg-white/50 backdrop-blur-sm"
            >
              {/* Pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-full bg-white/30"
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <Icon className="w-6 h-6 text-[#4A5568]" />
            </motion.div>

            {/* Title */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="text-sm uppercase tracking-widest text-[#4A5568]/60 mb-3 font-medium"
            >
              {config.title}
            </motion.p>

            {/* Content */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.35 }}
              className="text-xl md:text-2xl leading-relaxed text-[#4A5568] flex-1"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 300 }}
              data-testid={`journey-content-${currentCard}`}
            >
              {getSectionContent(config.key)}
            </motion.p>

            {/* Last card hint */}
            {isLastCard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-4 flex items-center justify-end gap-2 text-[#4A5568]/50"
              >
                <span className="text-sm">Swipe for questions</span>
                <ChevronRight className="w-4 h-4" />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Swipe hint */}
        {showSwipeHint && currentCard === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <motion.div
              animate={{ x: [0, -20, 0] }}
              transition={{ duration: 1.5, repeat: 2, ease: "easeInOut" }}
              className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg"
            >
              <span className="text-sm text-[#4A5568]">← Swipe to explore</span>
            </motion.div>
          </motion.div>
        )}

        {/* Navigation arrows with haptic feedback */}
        <div className="absolute inset-y-0 -left-4 -right-4 flex items-center justify-between pointer-events-none">
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              if (currentCard > 0) {
                triggerPulse();
                goToCard(currentCard - 1);
              }
            }}
            className={`w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center pointer-events-auto transition-all ${
              currentCard === 0 ? "opacity-0" : "opacity-100 hover:shadow-xl"
            }`}
            data-testid="prev-card-button"
          >
            <ChevronLeft className="w-5 h-5 text-[#4A5568]" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              triggerPulse();
              if (isLastCard) {
                onComplete();
              } else {
                goToCard(currentCard + 1);
              }
            }}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center pointer-events-auto hover:shadow-xl transition-all"
            data-testid="next-card-button"
          >
            <ChevronRight className="w-5 h-5 text-[#4A5568]" />
          </motion.button>
        </div>
      </div>

      {/* Progress dots with haptic tap */}
      <div className="flex items-center gap-2 mt-8" data-testid="card-dots">
        {cardConfig.map((_, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 0.8 }}
            onClick={() => goToCard(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentCard 
                ? "w-6 bg-[#FFB4A9]" 
                : index < currentCard
                  ? "w-2 bg-[#FFB4A9]/50"
                  : "w-2 bg-[#E2E8F0]"
            }`}
            data-testid={`card-dot-${index}`}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default JourneyCards;
