import { useRef } from "react";
import { motion } from "framer-motion";
import html2canvas from "html2canvas";
import InkBackground from "./InkBackground";

const ReflectMark = () => (
  <div
    style={{
      position: "absolute",
      bottom: 20,
      right: 20,
      color: "rgba(255,255,255,0.2)",
      fontSize: 10,
      letterSpacing: "0.15em",
      fontFamily: "inherit",
      zIndex: 2,
    }}
  >
    ◈
  </div>
);

export default function MirrorSlide({
  config,
  content,
  isActive,
  slideIndex,
  totalSlides,
}) {
  const slideRef = useRef(null);

  const handleSave = async (e) => {
    e.stopPropagation();

    if (!slideRef.current) return;

    try {
      const saveBtn = slideRef.current.querySelector("[data-save-btn]");
      if (saveBtn) saveBtn.style.display = "none";

      const canvas = await html2canvas(slideRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      if (saveBtn) saveBtn.style.display = "";

      const link = document.createElement("a");
      link.download = `reflect-mirror-${slideIndex + 1}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    } catch (err) {
      console.warn("Save failed:", err);
    }
  };

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3,
      },
    },
  };

  const lineVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] },
    },
  };

  const contentLines = (typeof content === "string" ? content : "")
    .split("\n")
    .filter(Boolean);

  const isArchetype = config.id === "archetype" && content?.name;
  const descriptionSentences = isArchetype && content?.description
    ? content.description.split(". ").filter(Boolean)
    : [];

  return (
    <div
      ref={slideRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "48px 36px",
        boxSizing: "border-box",
      }}
    >
      <InkBackground
        color1={config.background.color1}
        color2={config.background.color2}
        inkColor={config.background.inkColor}
        isActive={isActive}
      />

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          position: "absolute",
          top: 28,
          left: 36,
          color: config.accentColor,
          fontSize: 10,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          fontFamily: "inherit",
          zIndex: 2,
          opacity: 0.7,
        }}
      >
        {config.label}
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={isActive ? "visible" : "hidden"}
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
        }}
      >
        {isArchetype ? (
          <>
            <motion.div
              variants={lineVariants}
              style={{
                color: config.accentColor,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 16,
                opacity: 0.8,
                fontFamily: "inherit",
              }}
            >
              you are
            </motion.div>
            <motion.div
              variants={lineVariants}
              style={{
                color: config.textColor,
                fontSize: 32,
                fontWeight: 300,
                lineHeight: 1.2,
                marginBottom: 24,
                letterSpacing: "-0.01em",
                fontFamily: "inherit",
              }}
            >
              {content.name}
            </motion.div>
            {descriptionSentences.map((sentence, i) => (
              <motion.div
                key={i}
                variants={lineVariants}
                style={{
                  color: config.textColor,
                  fontSize: 15,
                  lineHeight: 1.65,
                  fontWeight: 300,
                  opacity: 0.8,
                  marginBottom: 6,
                  fontFamily: "inherit",
                }}
              >
                {sentence}
                {i < descriptionSentences.length - 1 ? ". " : ""}
              </motion.div>
            ))}
          </>
        ) : (
          contentLines.map((line, i) => (
            <motion.div
              key={i}
              variants={lineVariants}
              style={{
                color: config.textColor,
                fontSize: config.id === "question" ? 22 : 16,
                lineHeight: config.id === "question" ? 1.4 : 1.65,
                fontWeight: 300,
                marginBottom: config.id === "question" ? 0 : 8,
                fontFamily: "inherit",
                opacity: config.id === "question" ? 1 : 0.9,
                fontStyle: config.id === "question" ? "italic" : "normal",
              }}
            >
              {line}
            </motion.div>
          ))
        )}
      </motion.div>

      <motion.button
        data-save-btn
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: 1.5, duration: 0.4 }}
        onClick={handleSave}
        style={{
          position: "absolute",
          bottom: 24,
          left: 36,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20,
          padding: "6px 14px",
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          letterSpacing: "0.1em",
          cursor: "pointer",
          zIndex: 3,
          fontFamily: "inherit",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ↓ save
      </motion.button>

      <ReflectMark />
    </div>
  );
}
