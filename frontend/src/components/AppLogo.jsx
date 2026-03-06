const SIZES = {
  sm: { width: 48, height: 48 },
  md: { width: 64, height: 64 },
  lg: { width: 80, height: 80 },
  input: { width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px auto" },
};

const TEXT_SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

const LOGO_SRC = "/Reflect-logo-png.png";

export default function AppLogo({ size = "md", withText = false }) {
  const dims = SIZES[size];
  const isInputSize = size === "input";
  const imgStyle = isInputSize
    ? {
        width: dims.width,
        height: dims.height,
        borderRadius: dims.borderRadius,
        objectFit: "cover",
        display: "block",
        margin: dims.margin,
      }
    : {
        width: dims.width,
        height: dims.height,
        borderRadius: 16,
        objectFit: "cover",
      };

  return (
    <div className={`flex items-center ${withText ? "gap-3" : ""}`} style={isInputSize ? { display: "block" } : undefined}>
      <img
        src={LOGO_SRC}
        alt="Reflect"
        className={!isInputSize ? "rounded-2xl" : ""}
        style={imgStyle}
        draggable={false}
      />
      {withText && (
        <span
          className={`${TEXT_SIZES[size] || TEXT_SIZES.md} font-light text-[#4A5568] tracking-tight`}
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          REFLECT
        </span>
      )}
    </div>
  );
}
