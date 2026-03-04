import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MirrorSlide from "./MirrorSlide";
import { SLIDE_CONFIGS } from "./mirrorSlides.config";

/**
 * Main mirror slides container: auto-advance, hold to pause, tap left/right to navigate,
 * progress bars, slide transitions, onComplete to next flow step.
 */
export default function MirrorSlides({ report, onComplete }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(1);

  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const startTimeRef = useRef(null);
  const holdTimeoutRef = useRef(null);
  const isHoldingRef = useRef(false);

  const config = SLIDE_CONFIGS[currentSlide];
  const duration = config?.duration ?? 6000;

  const getSlideContent = (slideId) => {
    if (!report) return "";
    switch (slideId) {
      case "archetype":
        return report.archetype ?? null;
      case "shaped_by":
        return report.shaped_by ?? "";
      case "costing_you":
        return report.costing_you ?? "";
      case "question":
        return report.question ?? "";
      default:
        return "";
    }
  };

  const goToNext = useCallback(() => {
    if (currentSlide < SLIDE_CONFIGS.length - 1) {
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    } else {
      onComplete?.();
    }
  }, [currentSlide, onComplete]);

  const goToPrev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    }
  }, [currentSlide]);

  useEffect(() => {
    if (isPaused || !config) return;

    startTimeRef.current = startTimeRef.current || Date.now();

    const tick = () => {
      if (isPaused || isHoldingRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);

      if (pct >= 1) {
        goToNext();
      } else {
        progressRef.current = requestAnimationFrame(tick);
      }
    };

    progressRef.current = requestAnimationFrame(tick);

    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [currentSlide, isPaused, duration, goToNext, config]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setProgress(0);
  }, [currentSlide]);

  const handlePointerDown = () => {
    holdTimeoutRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      setIsPaused(true);
    }, 200);
  };

  const handlePointerUp = (e) => {
    clearTimeout(holdTimeoutRef.current);

    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsPaused(false);
      startTimeRef.current = Date.now() - progress * duration;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tapX = (e.changedTouches?.[0]?.clientX ?? e.clientX) - rect.left;
    const threshold = rect.width * 0.35;

    if (tapX < threshold) {
      goToPrev();
    } else {
      goToNext();
    }
  };

  const slideVariants = {
    enter: (dir) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: {
        x: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.3 },
      },
    },
    exit: (dir) => ({
      x: dir > 0 ? "-15%" : "15%",
      opacity: 0,
      transition: {
        x: { duration: 0.2, ease: "easeIn" },
        opacity: { duration: 0.15 },
      },
    }),
  };

  if (!report) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f1f3d 0%, #1a3a6b 100%)",
          color: "rgba(255,255,255,0.5)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
        background: "#0a0a12",
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        clearTimeout(holdTimeoutRef.current);
        if (isHoldingRef.current) {
          isHoldingRef.current = false;
          setIsPaused(false);
          startTimeRef.current = Date.now() - progress * duration;
        }
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          right: 16,
          display: "flex",
          gap: 4,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {SLIDE_CONFIGS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 2,
              borderRadius: 1,
              background: "rgba(255,255,255,0.2)",
              overflow: "hidden",
            }}
          >
            <motion.div
              style={{
                height: "100%",
                background: "rgba(255,255,255,0.7)",
                borderRadius: 1,
                width:
                  i < currentSlide
                    ? "100%"
                    : i === currentSlide
                    ? `${progress * 100}%`
                    : "0%",
              }}
              transition={{ duration: 0.05 }}
            />
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              color: "rgba(255,255,255,0.3)",
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            ⏸
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence custom={direction} mode="sync">
        <motion.div
          key={currentSlide}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
        >
          <MirrorSlide
            config={config}
            content={getSlideContent(config.id)}
            isActive
            slideIndex={currentSlide}
            totalSlides={SLIDE_CONFIGS.length}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
