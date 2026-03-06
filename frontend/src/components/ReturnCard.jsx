import { motion } from "framer-motion";

const ReturnCard = ({ cardText }) => {
  return (
    <motion.div
      initial={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        background: "#FFFDF7",
        borderLeft: "3px solid #FFB4A9",
        padding: "20px 24px",
        marginBottom: 32,
        borderRadius: "0 12px 12px 0",
        overflow: "hidden",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "#A0AEC0",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: 10,
          lineHeight: 1,
        }}
      >
        BEFORE YOU WRITE TODAY —
      </p>

      <p
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 16,
          color: "#2d3748",
          lineHeight: 1.75,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {cardText}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 12,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#CBD5E0",
          }}
        >
          from your last reflection
        </span>
      </div>
    </motion.div>
  );
};

export default ReturnCard;
