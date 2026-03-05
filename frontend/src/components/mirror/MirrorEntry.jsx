import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Frosted glass surface shown before tapping. Shows archetype name barely through frost.
 * On tap — glass clears with ripple, then slides begin.
 */
export default function MirrorEntry({ archetypeName, isLoading, onOpen }) {
  const [tapped, setTapped] = useState(false);
  const [ripple, setRipple] = useState(null);

  const handleTap = (e) => {
    if (isLoading || tapped) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    setTapped(true);
    setTimeout(onOpen, 600);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
        position: "relative",
        overflow: "hidden",
        cursor: isLoading ? "wait" : "pointer",
      }}
      onClick={handleTap}
    >
      <motion.div
        animate={{
          opacity: [0.3, 0.5, 0.3],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute",
          width: 280,
          height: 380,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(100,130,200,0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <AnimatePresence>
        {!tapped && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(20px)" }}
            transition={{ duration: 0.6, exit: { duration: 0.8 } }}
            style={{
              width: 220,
              height: 300,
              borderRadius: "50%",
              background:
                "linear-gradient(145deg, rgba(220,235,255,0.12) 0%, rgba(180,205,240,0.06) 40%, rgba(200,220,255,0.09) 100%)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1.5px solid rgba(200,220,255,0.35)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              position: "relative",
              overflow: "hidden",
              boxShadow: `
                0 0 0 4px rgba(150,180,230,0.06),
                0 0 40px rgba(150,180,255,0.1),
                inset 0 1px 0 rgba(255,255,255,0.12),
                inset 0 -1px 0 rgba(255,255,255,0.04)
              `,
            }}
          >
            {/* Primary glare streak */}
            <div
              style={{
                position: "absolute",
                top: "10%",
                left: "15%",
                width: "3px",
                height: "45%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)",
                borderRadius: "2px",
                transform: "rotate(-20deg)",
                pointerEvents: "none",
              }}
            />
            {/* Secondary glare streak */}
            <div
              style={{
                position: "absolute",
                top: "15%",
                left: "22%",
                width: "1.5px",
                height: "25%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)",
                borderRadius: "1px",
                transform: "rotate(-20deg)",
                pointerEvents: "none",
              }}
            />
            {/* Subtle surface tint — top of mirror is lighter */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "40%",
                background:
                  "linear-gradient(180deg, rgba(200,220,255,0.06) 0%, transparent 100%)",
                borderRadius: "50% 50% 0 0",
                pointerEvents: "none",
              }}
            />
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "40%",
                height: "100%",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                transform: "skewX(-20deg)",
              }}
            />

            {isLoading ? (
              <motion.div
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                reading you
              </motion.div>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.8 }}
                  style={{
                    color: "rgba(255,255,255,0.15)",
                    fontSize: 11,
                    letterSpacing: "0.25em",
                    textTransform: "uppercase",
                    marginBottom: 12,
                    fontFamily: "inherit",
                  }}
                >
                  you are
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, filter: "blur(8px)" }}
                  animate={{ opacity: 1, filter: "blur(3px)" }}
                  transition={{ delay: 0.5, duration: 1 }}
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 18,
                    fontWeight: 300,
                    textAlign: "center",
                    lineHeight: 1.4,
                    letterSpacing: "0.05em",
                    fontFamily: "inherit",
                  }}
                >
                  {archetypeName || "—"}
                </motion.div>

                <motion.div
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                  style={{
                    position: "absolute",
                    bottom: 24,
                    color: "rgba(255,255,255,0.2)",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                  }}
                >
                  tap to see
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ripple && (
          <motion.div
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 20, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: ripple.x - 10,
              top: ripple.y - 10,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
