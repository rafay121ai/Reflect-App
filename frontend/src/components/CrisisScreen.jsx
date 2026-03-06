import { motion } from "framer-motion";

const RESOURCES = [
  {
    label: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988 (US)",
    href: "tel:988",
  },
  {
    label: "Crisis Text Line",
    detail: "Text HOME to 741741",
    href: "sms:741741&body=HOME",
  },
  {
    label: "International resources",
    detail: "findahelpline.com",
    href: "https://findahelpline.com",
  },
];

export default function CrisisScreen({ onContinue }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#FFFDF7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 22,
            color: "#2d3748",
            fontWeight: 400,
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          You don't have to carry this alone.
        </h1>

        <p
          style={{
            fontSize: 14,
            color: "#718096",
            lineHeight: 1.8,
            marginBottom: 32,
          }}
        >
          What you're feeling matters. Before anything else, please reach out to
          someone who can help.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
          {RESOURCES.map((r) => (
            <a
              key={r.label}
              href={r.href}
              target={r.href.startsWith("http") ? "_blank" : undefined}
              rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
              style={{
                display: "block",
                padding: "16px 20px",
                borderRadius: 14,
                border: "1px solid #E2E8F0",
                background: "#fff",
                textDecoration: "none",
                textAlign: "left",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#FFB4A9")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E2E8F0")}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#2d3748",
                  marginBottom: 2,
                }}
              >
                {r.label}
              </span>
              <span style={{ fontSize: 13, color: "#718096" }}>{r.detail}</span>
            </a>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 999,
              background: "#2d3748",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.02em",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Find support now
          </a>

          <button
            type="button"
            onClick={onContinue}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              color: "#A0AEC0",
              padding: "8px 16px",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            I'm okay, continue
          </button>
        </div>
      </div>
    </motion.div>
  );
}
