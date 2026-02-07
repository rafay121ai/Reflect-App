import { motion } from "framer-motion";
import { forwardRef } from "react";

// Haptic-like button with tactile visual feedback
const HapticButton = forwardRef(({ 
  children, 
  onClick, 
  variant = "primary", 
  disabled = false,
  className = "",
  ...props 
}, ref) => {
  
  const variants = {
    primary: {
      base: "text-white font-medium",
      style: { 
        background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
        boxShadow: "0 8px 24px rgba(255, 180, 169, 0.25)"
      },
      hover: { 
        scale: 1.03, 
        boxShadow: "0 12px 32px rgba(255, 180, 169, 0.35)"
      },
      tap: { 
        scale: 0.95,
        boxShadow: "0 4px 12px rgba(255, 180, 169, 0.2)"
      }
    },
    secondary: {
      base: "text-[#718096] bg-white/90 backdrop-blur-sm border border-[#E2E8F0]",
      style: {},
      hover: { 
        scale: 1.03, 
        backgroundColor: "rgba(255,255,255,1)",
        borderColor: "#CBD5E0"
      },
      tap: { 
        scale: 0.95,
        backgroundColor: "rgba(245,245,245,1)"
      }
    },
    ghost: {
      base: "text-[#A0AEC0] hover:text-[#718096]",
      style: {},
      hover: { scale: 1.05 },
      tap: { scale: 0.92 }
    },
    success: {
      base: "text-white font-medium",
      style: { 
        background: "linear-gradient(135deg, #C1D0C6 0%, #A8C0B0 100%)",
        boxShadow: "0 8px 24px rgba(193, 208, 198, 0.3)"
      },
      hover: { 
        scale: 1.03, 
        boxShadow: "0 12px 32px rgba(193, 208, 198, 0.4)"
      },
      tap: { 
        scale: 0.95,
        boxShadow: "0 4px 12px rgba(193, 208, 198, 0.2)"
      }
    }
  };

  const v = variants[variant];

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-full px-8 py-4 
        transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${v.base}
        ${className}
      `}
      style={v.style}
      whileHover={!disabled ? v.hover : {}}
      whileTap={!disabled ? v.tap : {}}
      // Haptic-like ripple effect on tap
      onTapStart={() => {
        // Visual "pulse" feedback
      }}
      {...props}
    >
      {/* Inner content with slight bounce on tap */}
      <motion.span
        className="flex items-center justify-center gap-2"
        whileTap={{ y: 1 }}
        transition={{ duration: 0.1 }}
      >
        {children}
      </motion.span>
    </motion.button>
  );
});

HapticButton.displayName = "HapticButton";

export default HapticButton;
