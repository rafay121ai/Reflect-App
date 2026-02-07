import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, BookOpen } from "lucide-react";
import HapticButton from "../ui/HapticButton";

const REMIND_DAYS = [1, 2, 3, 7];

/**
 * Shown while the mirror is loading. User chooses: Read now / Come back later / Remind me in X days.
 * Only if they choose "Read now" do we show the mirror when it's ready.
 */
const RevisitChoiceScreen = ({
  reflectionId,
  onReadNow,
  onComeBackLater,
  onSetReminder,
}) => {
  const [showRemindPicker, setShowRemindPicker] = useState(false);
  const [isSettingReminder, setIsSettingReminder] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg"
      data-testid="revisit-choice-screen"
    >
      {/* Card - same structure as ReflectionDisplay steps (e.g. EmotionalUndercurrent) */}
      <motion.div
        animate={{ scale: [1, 1.005, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[2.5rem] p-10 md:p-14"
        style={{
          background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8F0 100%)",
          boxShadow: "0 20px 60px rgba(255, 180, 169, 0.15), 0 8px 24px rgba(224, 212, 252, 0.1)",
        }}
      >
        {/* Icon - same pattern as ReflectionDisplay */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-16 h-16 rounded-full mb-8 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #FFB4A9 0%, #FFDDD2 100%)" }}
        >
          <BookOpen className="w-7 h-7 text-white" />
        </motion.div>

        {/* Label - same as ReflectionDisplay steps */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm uppercase tracking-widest text-[#FFB4A9] mb-4 font-medium"
        >
          Your reflection is ready
        </motion.p>

        {/* Content */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-xl md:text-2xl leading-relaxed text-[#4A5568] mb-6"
        >
          When do you want to revisit?
        </motion.p>

        {!showRemindPicker ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full flex flex-col gap-3"
          >
            <HapticButton
              variant="primary"
              onClick={onReadNow}
              data-testid="read-now-button"
              className="w-full justify-center"
            >
              <BookOpen className="w-4 h-4" />
              <span>Read now</span>
            </HapticButton>
            <HapticButton
              variant="secondary"
              onClick={() => onComeBackLater?.()}
              data-testid="come-back-later-button"
              className="w-full justify-center"
            >
              <span>Come back later</span>
            </HapticButton>
            {reflectionId && onSetReminder && (
              <HapticButton
                variant="ghost"
                onClick={() => setShowRemindPicker(true)}
                data-testid="remind-me-button"
                className="w-full justify-center text-[#718096] hover:text-[#4A5568]"
              >
                <Clock className="w-4 h-4" />
                <span>Remind me in X days</span>
              </HapticButton>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex flex-col gap-3"
          >
            <p className="text-sm text-[#718096] mb-1">Remind me in…</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {REMIND_DAYS.map((d) => (
                <motion.button
                  key={d}
                  type="button"
                  onClick={async () => {
                    if (!reflectionId || !onSetReminder) return;
                    setIsSettingReminder(true);
                    try {
                      await onSetReminder(reflectionId, d);
                    } finally {
                      setIsSettingReminder(false);
                    }
                  }}
                  disabled={isSettingReminder}
                  className="px-4 py-2.5 rounded-full text-sm font-medium bg-white/90 border border-[#E2E8F0] text-[#4A5568] hover:border-[#FFB4A9]/50 hover:bg-[#FFB4A9]/10 transition-colors disabled:opacity-50"
                  data-testid={`remind-${d}-days`}
                >
                  {d === 1 ? "1 day" : `${d} days`}
                </motion.button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowRemindPicker(false)}
              className="text-xs text-[#A0AEC0] hover:text-[#718096] mt-2"
            >
              Back
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default RevisitChoiceScreen;
