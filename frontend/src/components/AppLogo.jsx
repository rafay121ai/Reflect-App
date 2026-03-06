const SIZES = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-20 w-20",
};

const TEXT_SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export default function AppLogo({ size = "md", withText = false }) {
  return (
    <div className={`flex items-center ${withText ? "gap-3" : ""}`}>
      <img
        src="/logo.png"
        alt="Reflect"
        className={`${SIZES[size]} rounded-2xl`}
        draggable={false}
      />
      {withText && (
        <span
          className={`${TEXT_SIZES[size]} font-light text-[#4A5568] tracking-tight`}
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          REFLECT
        </span>
      )}
    </div>
  );
}
