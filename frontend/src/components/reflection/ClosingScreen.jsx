import { motion } from "framer-motion";

const ClosingScreen = ({
  closingText,
  isLoading,
  onDone,
}) => {
  // Fallback text if API fails
  const fallbackText = "You showed up today. That matters. What you're already carrying is worth your attention.";
  const displayText = closingText || fallbackText;

  // Parse the two movements from the closing string (backend returns them separated by blank line)
  const movements = displayText.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  const uncomfortableTruth = movements[0] || displayText;
  const takeaway = movements[1] || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="w-full max-w-xl flex flex-col items-center text-center py-12 px-8 relative"
      data-testid="closing-screen"
    >
      {/* Calm, static "ending" background — warm fade, no motion */}
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
            className="closing-container relative z-10 text-center max-w-lg mx-auto"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 300 }}
            data-testid="closing-content"
          >
            {/* Movement 1 — The Uncomfortable Truth */}
            <motion.div
              className="closing-truth"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p
                className="text-[#4A5568] leading-relaxed"
                style={{ fontSize: "1.5rem", lineHeight: 1.6 }}
              >
                {uncomfortableTruth}
              </p>
            </motion.div>

            {/* Divider */}
            {takeaway && (
              <div
                className="closing-divider h-px w-12 mx-auto my-10 origin-center"
                style={{ backgroundColor: "rgba(74, 85, 104, 0.2)" }}
                aria-hidden
              />
            )}

            {/* Movement 2 — The Takeaway */}
            {takeaway && (
              <motion.div
                className="closing-takeaway"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <span
                  className="closing-takeaway-label block text-xs uppercase tracking-[0.35em] text-[#A0AEC0] mb-3"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  something to sit with
                </span>
                <p
                  className="text-[#718096] leading-relaxed"
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontWeight: 300,
                    fontSize: "1.125rem",
                    lineHeight: 1.7,
                  }}
                >
                  {takeaway}
                </p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Ending flourish + close — feels like "the end" */}
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
