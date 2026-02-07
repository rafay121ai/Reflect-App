import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Sparkles, RefreshCw, RotateCcw, Download, Share2, Check, X, Clock, BookOpen } from "lucide-react";
import HapticButton from "../ui/HapticButton";

const REMIND_DAYS = [1, 2, 3, 7];

const MirrorReflection = ({
  content,
  personalizedContent,
  isLoading,
  reflectionId,
  onContinue,
  onComeBackLater,
  onSetReminder,
  onReflectAnother,
  onStartFresh,
}) => {
  const [displayContent, setDisplayContent] = useState(content);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRemindPicker, setShowRemindPicker] = useState(false);
  const [isSettingReminder, setIsSettingReminder] = useState(false);
  const shareCardRef = useRef(null);

  useEffect(() => {
    if (personalizedContent) {
      setDisplayContent(personalizedContent);
    }
  }, [personalizedContent]);

  const handleSaveAsImage = async () => {
    if (!shareCardRef.current) return;
    
    setIsGeneratingImage(true);
    
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#FFFDF7'
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `reflection-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      setShowShareSuccess(true);
      setTimeout(() => setShowShareSuccess(false), 2000);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    
    setIsGeneratingImage(true);
    
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#FFFDF7'
      });
      
      // Convert to blob for sharing
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'reflection.png', { type: 'image/png' });
      
      // Try native share if available
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'A Moment of Reflection',
          text: 'A gentle mirror for my thoughts'
        });
      } else {
        // Fallback to download
        handleSaveAsImage();
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Fallback to download on error
      handleSaveAsImage();
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-xl flex flex-col items-center text-center"
      data-testid="mirror-reflection"
    >
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 -z-10 opacity-20"
        style={{
          background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 25%, #C1D0C6 50%, #FFDDD2 75%, #FFB4A9 100%)",
          backgroundSize: "400% 400%"
        }}
        animate={{
          backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Icon with glow and pulse */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
        className="relative w-20 h-20 rounded-full mb-8 flex items-center justify-center"
        style={{ 
          background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)",
          boxShadow: "0 0 60px rgba(255, 180, 169, 0.3), 0 12px 40px rgba(255, 180, 169, 0.15)"
        }}
      >
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: "2px solid rgba(255, 180, 169, 0.3)" }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <Sparkles className="w-8 h-8 text-[#FFB4A9]" />
      </motion.div>

      {/* Label */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-sm uppercase tracking-widest text-[#FFB4A9] mb-6 font-medium"
      >
        A Mirror
      </motion.p>

      {/* Shareable card - this gets exported as image */}
      <motion.div
        ref={shareCardRef}
        initial={{ opacity: 0, y: 30, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[2.5rem] p-12 md:p-16 mb-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(255,248,240,0.95) 100%)",
          boxShadow: "0 0 80px rgba(255, 180, 169, 0.12), 0 30px 80px rgba(255, 180, 169, 0.1), 0 12px 32px rgba(224, 212, 252, 0.08)"
        }}
      >
        {/* Decorative corner gradient for share card */}
        <div 
          className="absolute top-0 right-0 w-32 h-32 opacity-30"
          style={{
            background: "radial-gradient(circle at top right, #FFB4A9 0%, transparent 70%)"
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-32 h-32 opacity-20"
          style={{
            background: "radial-gradient(circle at bottom left, #E0D4FC 0%, transparent 70%)"
          }}
        />

        {isLoading ? (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xl text-[#A0AEC0]"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            Reflecting on what you shared...
          </motion.div>
        ) : (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-2xl md:text-3xl lg:text-4xl leading-relaxed text-[#4A5568] relative z-10"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, lineHeight: 1.5 }}
            data-testid="mirror-content"
          >
            {displayContent || "What you're holding is yours to hold, in whatever way feels right."}
          </motion.p>
        )}

        {/* Watermark for shared image */}
        <div className="absolute bottom-4 right-6 text-xs text-[#CBD5E0] opacity-60">
          ✦ a gentle mirror
        </div>
      </motion.div>

      {/* Share buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex gap-3 mb-8"
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleSaveAsImage}
          disabled={isGeneratingImage || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm text-[#718096] bg-white/80 backdrop-blur-sm border border-[#E2E8F0] hover:bg-white hover:border-[#FFB4A9]/30 transition-all disabled:opacity-50"
          data-testid="save-image-button"
        >
          {showShareSuccess ? (
            <>
              <Check className="w-4 h-4 text-[#C1D0C6]" />
              <span>Saved!</span>
            </>
          ) : isGeneratingImage ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Download className="w-4 h-4" />
              </motion.div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Save as Image</span>
            </>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleShare}
          disabled={isGeneratingImage || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm text-white disabled:opacity-50"
          style={{ 
            background: "linear-gradient(135deg, #FFB4A9 0%, #E0D4FC 100%)",
            boxShadow: "0 4px 16px rgba(255, 180, 169, 0.2)"
          }}
          data-testid="share-button"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </motion.button>
      </motion.div>

      {/* Completion */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-[#718096] mb-6"
      >
        This reflection is yours
      </motion.p>

      {/* Revisit: Read now / Come back later / Remind me in X days */}
      {onContinue && (onComeBackLater != null || onSetReminder != null) ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="w-full max-w-sm flex flex-col gap-3 mb-8"
          data-testid="revisit-options"
        >
          {!showRemindPicker ? (
            <>
              <p className="text-sm text-[#718096] mb-1">When do you want to revisit?</p>
              <div className="flex flex-col gap-2">
                <HapticButton
                  variant="primary"
                  onClick={onContinue}
                  data-testid="read-now-button"
                  className="w-full justify-center"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Read now</span>
                </HapticButton>
                <HapticButton
                  variant="secondary"
                  onClick={onComeBackLater}
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
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[#718096] mb-1">Remind me in…</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {REMIND_DAYS.map((d) => (
                  <motion.button
                    key={d}
                    type="button"
                    onClick={async () => {
                      if (!reflectionId || !onSetReminder || !onComeBackLater) return;
                      setIsSettingReminder(true);
                      try {
                        await onSetReminder(reflectionId, d);
                        onComeBackLater();
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
            </>
          )}
        </motion.div>
      ) : (
        /* Fallback: single Continue or Reflect again / Start fresh */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex flex-col sm:flex-row gap-4"
          data-testid="action-buttons"
        >
          {onContinue ? (
            <HapticButton
              variant="primary"
              onClick={onContinue}
              data-testid="continue-button"
            >
              <span>Continue</span>
            </HapticButton>
          ) : (
            <>
              <HapticButton
                variant="primary"
                onClick={onReflectAnother}
                data-testid="reflect-another-button"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Reflect Again</span>
              </HapticButton>
              <HapticButton
                variant="secondary"
                onClick={onStartFresh}
                data-testid="start-fresh-button"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Start Fresh</span>
              </HapticButton>
            </>
          )}
        </motion.div>
      )}

      {/* Privacy */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="text-sm text-[#A0AEC0] mt-10"
        data-testid="transparency-note"
      >
        Your words aren't stored — only soft patterns that help notice themes over time.
      </motion.p>
    </motion.div>
  );
};

export default MirrorReflection;
