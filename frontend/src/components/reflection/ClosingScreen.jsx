import { motion } from "framer-motion";

// Breathing orbs — placed behind content. Two soft orbs, slow movement, cream palette.
const BreathingBackground = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 0,
    }}
  >
    <motion.div
      animate={{
        scale: [1, 1.15, 1],
        opacity: [0.12, 0.2, 0.12],
        x: [0, 12, 0],
        y: [0, -8, 0],
      }}
      transition={{
        duration: 7,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{
        position: "absolute",
        top: "-10%",
        left: "-15%",
        width: 380,
        height: 380,
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse, rgba(180,160,140,0.25) 0%, transparent 70%)",
        filter: "blur(40px)",
      }}
    />
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
        opacity: [0.1, 0.18, 0.1],
        x: [0, -10, 0],
        y: [0, 10, 0],
      }}
      transition={{
        duration: 9,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 2,
      }}
      style={{
        position: "absolute",
        bottom: "-15%",
        right: "-10%",
        width: 320,
        height: 320,
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse, rgba(160,170,190,0.2) 0%, transparent 70%)",
        filter: "blur(50px)",
      }}
    />
    <motion.div
      animate={{
        scale: [1, 1.08, 1],
        opacity: [0.06, 0.12, 0.06],
      }}
      transition={{
        duration: 11,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 4,
      }}
      style={{
        position: "absolute",
        top: "30%",
        left: "20%",
        width: 280,
        height: 280,
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse, rgba(200,185,165,0.2) 0%, transparent 70%)",
        filter: "blur(60px)",
      }}
    />
  </div>
);

const TELL_ME_LINE = "Tell me about it when it happens.";
const NEXT_TIME_LINE =
  "Next time you open REFLECT, I have something to show you about what you wrote today.";

const ClosingScreen = ({
  closingText,
  isLoading,
  isSlowClosing,
  isSaving = false,
  saveError = false,
  onRetrySave,
  onDone,
}) => {
  // Fallback text if API fails
  const fallbackText = "You showed up today. That matters. What you're already carrying is worth your attention.";
  const displayText = closingText || fallbackText;

  // Parse the two movements from the closing string (backend returns them separated by blank line)
  const movements = displayText.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  const uncomfortableTruth = movements[0] || displayText;
  const takeaway = movements[1] || null;

  // Movement 2: extract watch-for sentence by removing the two fixed lines
  const watchForSentence = takeaway
    ? takeaway
        .replace(TELL_ME_LINE, "")
        .replace(NEXT_TIME_LINE, "")
        .replace(/\n+/g, " ")
        .trim()
    : "";

  const sentenceVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i) => ({
      opacity: i === 2 ? 0.6 : 1,
      y: 0,
      transition: {
        delay: i * 0.4 + 0.3,
        duration: 0.7,
        ease: [0.25, 0.1, 0.25, 1],
      },
    }),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="w-full max-w-xl flex flex-col items-center text-center py-12 px-8"
      style={{ position: "relative" }}
      data-testid="closing-screen"
    >
      <BreathingBackground />

      <div style={{ position: "relative", zIndex: 1 }}>
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
          <>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-xl text-[#A0AEC0]"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              One thing to carry…
            </motion.div>
            {isSlowClosing && (
              <p
                className="mt-4 text-center"
                style={{ fontSize: 12, color: "#A0AEC0" }}
              >
                Still writing your closing…
              </p>
            )}
          </>
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
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-[#4A5568] leading-relaxed"
                style={{ fontSize: "1.5rem", lineHeight: 1.6 }}
              >
                {uncomfortableTruth}
              </motion.p>
            </motion.div>

            {/* Divider */}
            {takeaway && (
              <div
                className="closing-divider h-px w-12 mx-auto my-10 origin-center"
                style={{ backgroundColor: "rgba(74, 85, 104, 0.2)" }}
                aria-hidden
              />
            )}

            {/* Movement 2 — The Takeaway: watch-for sentence, fixed "Tell me...", fixed "Next time..." */}
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
                <div
                  className="text-[#718096]"
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontWeight: 300,
                    fontSize: "1.125rem",
                  }}
                >
                  {/* Watch for sentence */}
                  {watchForSentence && (
                    <motion.p
                      custom={0}
                      variants={sentenceVariants}
                      initial="hidden"
                      animate="visible"
                      style={{
                        fontSize: "inherit",
                        lineHeight: 1.7,
                        margin: 0,
                        marginBottom: 20,
                      }}
                    >
                      {watchForSentence}
                    </motion.p>
                  )}

                  {/* Tell me about it */}
                  <motion.p
                    custom={1}
                    variants={sentenceVariants}
                    initial="hidden"
                    animate="visible"
                    style={{
                      fontSize: "inherit",
                      lineHeight: 1.7,
                      margin: 0,
                      marginTop: 20,
                      fontWeight: 500,
                    }}
                  >
                    {TELL_ME_LINE}
                  </motion.p>

                  {/* Next time hook */}
                  <motion.p
                    custom={2}
                    variants={sentenceVariants}
                    initial="hidden"
                    animate="visible"
                    style={{
                      fontSize: "0.9em",
                      lineHeight: 1.7,
                      margin: 0,
                      marginTop: 12,
                      opacity: 0.6,
                    }}
                  >
                    {NEXT_TIME_LINE}
                  </motion.p>
                </div>
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
            disabled={isSaving}
            data-testid="closing-done-button"
            className="bg-transparent border border-current rounded-full px-8 py-2.5 text-sm opacity-55 hover:opacity-90 transition-opacity duration-200 tracking-wide cursor-pointer text-[#5A5568] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ letterSpacing: "0.05em" }}
          >
            {isSaving ? "Saving…" : "I'll carry this"}
          </button>
          {saveError && onRetrySave && (
            <p className="text-[13px] text-[rgba(255,255,255,0.7)]">
              Couldn&apos;t save your reflection.{" "}
              <button
                type="button"
                onClick={onRetrySave}
                className="text-white underline underline-offset-2 hover:opacity-90 bg-transparent border-none cursor-pointer p-0 text-[13px]"
              >
                Retry
              </button>
            </p>
          )}
        </motion.div>
      )}
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <a
          href="tel:988"
          style={{
            fontSize: 11,
            color: "#A0AEC0",
            textDecoration: "none",
          }}
        >
          In crisis? Text 988
        </a>
      </div>
      </div>
    </motion.div>
  );
};

export default ClosingScreen;
