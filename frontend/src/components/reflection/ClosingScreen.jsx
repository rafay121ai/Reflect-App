import { motion } from "framer-motion";

const ClosingScreen = ({
  closingText,
  isLoading,
  onDone,
}) => {
  // Fallback text if API fails
  const displayText = closingText || "You showed up today. That matters. Between now and next time — notice what you're already carrying. It's worth your attention.";

  // Split text to highlight "Between now and next time —" part
  const openThreadMarker = "Between now and next time —";
  const openThreadIndex = displayText.indexOf(openThreadMarker);
  const hasOpenThread = openThreadIndex >= 0;
  const beforeOpenThread = hasOpenThread ? displayText.substring(0, openThreadIndex).trim() : null;
  const openThreadPart = hasOpenThread ? displayText.substring(openThreadIndex).trim() : displayText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="w-full max-w-xl flex flex-col items-center text-center py-12 px-8 relative"
      data-testid="closing-screen"
    >
      {/* Calm, static “ending” background — warm fade, no motion */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 40%, rgba(255, 248, 240, 0.6) 0%, rgba(255, 235, 220, 0.25) 40%, rgba(252, 248, 245, 0.1) 100%)",
        }}
      />

      {/* Content card — warmer, soft glow like last page */}
      <div
        className="rounded-[2.5rem] p-12 md:p-16 mb-8 relative overflow-hidden w-full"
        style={{
          background: "linear-gradient(165deg, rgba(255, 252, 248, 0.98) 0%, rgba(255, 245, 238, 0.96) 50%, rgba(255, 250, 245, 0.98) 100%)",
          boxShadow: "0 0 80px rgba(255, 200, 180, 0.12), 0 24px 64px rgba(255, 180, 169, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {isLoading ? (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xl text-[#A0AEC0]"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            One thing to carry…
          </motion.div>
        ) : (
          <div
            className="relative z-10 text-center max-w-lg mx-auto"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 300 }}
            data-testid="closing-content"
          >
            {/* Named Truth — appears first */}
            {beforeOpenThread && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-[#4A5568] leading-relaxed"
                style={{ fontSize: "1.5rem", lineHeight: 1.6 }}
              >
                {beforeOpenThread}
              </motion.p>
            )}
            {/* Divider between Named Truth and Open Thread */}
            {hasOpenThread && beforeOpenThread && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0.5 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
                className="w-12 h-px bg-current mx-auto my-8 origin-center"
                style={{ color: "#4A5568", opacity: 0.25 }}
                aria-hidden
              />
            )}
            {/* Open Thread — second movement, like “and finally…” */}
            {hasOpenThread ? (
              <>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                  className="text-[#A0AEC0] text-sm italic mb-2 tracking-wide"
                  style={{ fontFamily: "'Fraunces', serif", opacity: 0.6 }}
                >
                  {openThreadMarker}
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65, duration: 0.65, ease: "easeOut" }}
                  className="text-[#718096] leading-relaxed"
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontWeight: 300,
                    fontSize: "1.1rem",
                    lineHeight: 1.7,
                    opacity: 0.75,
                  }}
                >
                  {openThreadPart.replace(openThreadMarker, "").trim()}
                </motion.p>
              </>
            ) : (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-[#4A5568] leading-relaxed"
                style={{ fontSize: "1.5rem", lineHeight: 1.6 }}
              >
                {openThreadPart}
              </motion.p>
            )}
          </div>
        )}
      </div>

      {/* Ending flourish + close — feels like “the end” */}
      {!isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-12 pb-12 flex flex-col items-center gap-6"
        >
          <span
            className="text-[#B8A9A0] text-xs tracking-[0.35em] uppercase"
            style={{ fontFamily: "'Fraunces', serif", letterSpacing: "0.35em" }}
          >
            Until next time
          </span>
          <button
            type="button"
            onClick={onDone}
            data-testid="closing-done-button"
            className="bg-transparent border border-current rounded-full px-8 py-2.5 text-sm opacity-55 hover:opacity-90 transition-opacity duration-200 tracking-wide cursor-pointer text-[#5A5568]"
            style={{ letterSpacing: "0.05em" }}
          >
            I'll carry this
          </button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ClosingScreen;
