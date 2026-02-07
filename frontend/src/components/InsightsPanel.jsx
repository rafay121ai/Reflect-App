import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import HapticButton from "./ui/HapticButton";
import { useAuth } from "../contexts/AuthContext";
import { getAuthHeaders, getProfile, updateProfile } from "../lib/api";
import { getOrCreateUserIdentifier } from "../lib/userId";

/**
 * Insights panel: Personal letter, reflection frequency, mood feelings over time.
 * User-initiated only. Calm, minimal, non-analytical by design.
 * Letter regenerates every 5 days.
 */

// Skeleton component for loading states
const Skeleton = ({ className = "" }) => (
  <motion.div 
    className={`bg-gradient-to-r from-[#E2E8F0]/30 via-[#E2E8F0]/50 to-[#E2E8F0]/30 rounded ${className}`}
    animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    style={{ backgroundSize: "200% 100%" }}
  />
);

// Format date range for display (e.g., "Jan 27 – Jan 31")
const formatDateRange = (start, end) => {
  if (!start || !end) return "";
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
};

// Animated reflection frequency dots (exactly 7 days - current week)
const FrequencyDots = ({ days = [] }) => {
  // Only show exactly 7 days (Mon-Sun)
  const weekDays = days.slice(0, 7);
  if (!weekDays.length) return null;
  const maxCount = Math.max(1, ...weekDays.map((d) => d.count));
  
  // Format day label (e.g., "Mon", "Tue")
  const getDayLabel = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short" });
  };
  
  return (
    <div className="flex items-center justify-between gap-4 px-4" aria-hidden="true">
      {weekDays.map((day, i) => {
        const hasReflection = day.count > 0;
        const intensity = hasReflection ? Math.max(0.6, day.count / maxCount) : 0;
        const size = hasReflection ? 14 + intensity * 10 : 12;
        
        return (
          <motion.div
            key={day.date || i}
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              delay: i * 0.08, 
              duration: 0.5,
              ease: "easeOut"
            }}
          >
            <motion.div
              className={`rounded-full ${
                hasReflection 
                  ? "bg-gradient-to-t from-[#FFB4A9] to-[#FFD4CC]" 
                  : "bg-[#E2E8F0]/30"
              }`}
              style={{ 
                width: `${size}px`, 
                height: `${size}px`,
              }}
              whileHover={hasReflection ? { 
                scale: 1.4, 
                boxShadow: "0 0 16px rgba(255, 180, 169, 0.6)" 
              } : {}}
              animate={hasReflection ? {
                y: [0, -3, 0],
                boxShadow: [
                  "0 0 0 rgba(255, 180, 169, 0)",
                  "0 0 12px rgba(255, 180, 169, 0.3)",
                  "0 0 0 rgba(255, 180, 169, 0)"
                ],
              } : {}}
              transition={hasReflection ? {
                y: {
                  duration: 2.5 + i * 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15,
                },
                boxShadow: {
                  duration: 2.5 + i * 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15,
                }
              } : {}}
              title={day.date ? `${day.date}${day.count > 0 ? ` • ${day.count}` : ""}` : ""}
            />
            <span className="text-[10px] text-[#A0AEC0]">{getDayLabel(day.date)}</span>
          </motion.div>
        );
      })}
    </div>
  );
};

// Mood over time visualization using FEELINGS (not original metaphors)
const MoodTimeline = ({ moods = [] }) => {
  if (!moods.length) return null;
  // Soft, calm palette
  const colors = [
    "from-[#FFB4A9]/30 to-[#FFB4A9]/10 border-[#FFB4A9]/40",
    "from-[#A7C4E0]/30 to-[#A7C4E0]/10 border-[#A7C4E0]/40",
    "from-[#D4C5A9]/30 to-[#D4C5A9]/10 border-[#D4C5A9]/40",
    "from-[#C5D4A9]/30 to-[#C5D4A9]/10 border-[#C5D4A9]/40",
    "from-[#D4A9C5]/30 to-[#D4A9C5]/10 border-[#D4A9C5]/40",
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {moods.slice(0, 12).map((item, i) => {
        const colorClass = colors[i % colors.length];
        const d = new Date(item.date + "T00:00:00");
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const displayText = item.feeling || item.mood;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className={`px-3 py-1.5 rounded-full text-sm text-[#4A5568] bg-gradient-to-br border ${colorClass}`}
            title={`${dateLabel}`}
          >
            {displayText}
          </motion.span>
        );
      })}
    </div>
  );
};

// Letter card with reflecty aesthetic
const LetterCard = ({ letter, onRegenerate, regenerating, regenerateError }) => {
  const [showPattern, setShowPattern] = useState(false);
  const hasPattern = letter?.core_pattern && letter.core_pattern.length > 20;
  const hasSituations = letter?.situations && letter.situations.length > 0;
  
  return (
    <motion.div 
      className="relative overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle background - reduced contrast */}
      <div className="absolute inset-0 bg-[#FFFDF7]/40 rounded-2xl" />
      
      {/* Decorative elements - more subtle */}
      <motion.div 
        className="absolute top-4 right-4 w-20 h-20 rounded-full bg-[#FFB4A9]/3 blur-2xl"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Card content - reduced padding */}
      <div className="relative rounded-2xl border border-[#E2E8F0]/40 p-5 md:p-6">
        {/* Header with icon */}
        <div className="flex items-center gap-2 mb-2">
          <motion.div
            animate={{ 
              rotate: [0, 5, -5, 0],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="w-4 h-4 text-[#FFB4A9]" />
          </motion.div>
          <h2 className="text-sm font-medium text-[#4A5568] tracking-wide">A letter to you</h2>
        </div>
        
        {/* Date range */}
        {letter?.period_start && letter?.period_end && (
          <p className="text-xs text-[#94A3B8] mb-5 ml-6">
            {formatDateRange(letter.period_start, letter.period_end)}
          </p>
        )}
        
        {/* Letter content */}
        <div className="relative pl-6 border-l-2 border-[#FFB4A9]/20">
          <motion.div 
            className="text-[#4A5568] text-[1.05rem] leading-[1.8] font-[350] whitespace-pre-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {letter?.content || "Nothing to show yet."}
          </motion.div>
        </div>
        
        {/* Core Pattern Callout (optional, expandable) */}
        {hasPattern && (
          <motion.div 
            className="mt-5 pt-4 border-t border-[#E2E8F0]/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <button
              type="button"
              onClick={() => setShowPattern(!showPattern)}
              className="flex items-center gap-2 text-xs text-[#94A3B8] hover:text-[#718096] transition-colors"
            >
              <span className="font-medium">{showPattern ? "Hide" : "See"} what I noticed</span>
              <motion.span
                animate={{ rotate: showPattern ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ↓
              </motion.span>
            </button>
            
            <AnimatePresence>
              {showPattern && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-4 rounded-xl bg-[#F7FAFC]/50 border border-[#E2E8F0]/30">
                    <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-2">
                      The pattern underneath
                    </p>
                    <p className="text-sm text-[#4A5568] leading-relaxed">
                      {letter.core_pattern}
                    </p>
                    
                    {/* Situations that informed this */}
                    {hasSituations && (
                      <div className="mt-4 pt-3 border-t border-[#E2E8F0]/20">
                        <p className="text-[10px] text-[#A0AEC0] uppercase tracking-wider mb-2">
                          This came from
                        </p>
                        <ul className="space-y-1">
                          {letter.situations.slice(0, 3).map((s, i) => (
                            <li key={i} className="text-xs text-[#718096]">
                              • {s.situation?.slice(0, 60)}{s.situation?.length > 60 ? "..." : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
        
        {/* Regenerate button */}
        <div className="mt-6 pt-4 border-t border-[#E2E8F0]/40">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-2 text-xs text-[#94A3B8] hover:text-[#718096] transition-all duration-200 disabled:opacity-50 group"
          >
            <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-300 ${regenerating ? "animate-spin" : "group-hover:rotate-45"}`} />
            <span>{regenerating ? "Writing..." : "Write a new letter"}</span>
          </button>
          {regenerateError && (
            <p className="text-xs text-[#E57373] mt-2">Couldn't write a new letter. Try again later.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const InsightsPanel = ({ apiBase, onClose }) => {
  const [letter, setLetter] = useState(null);
  const [frequency, setFrequency] = useState(null);
  const [moodOverTime, setMoodOverTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);

  const { user } = useAuth();
  const uid = user?.id ?? getOrCreateUserIdentifier();

  const fetchAll = async () => {
    if (!apiBase || !uid) {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ user_identifier: uid });
    const headers = getAuthHeaders();

    // Helper to safely fetch - returns null on any error
    const safeFetch = async (url) => {
      try {
        const r = await fetch(url, { headers });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    
    try {
      const [l, f, mot] = await Promise.all([
        safeFetch(`${apiBase}/insights/letter?${params}`),
        safeFetch(`${apiBase}/insights/reflection-frequency?${params}`),
        safeFetch(`${apiBase}/insights/mood-over-time?${params}&days=7`),
      ]);
      setLetter(l);
      setFrequency(f);
      setMoodOverTime(mot);
      // Only show error if all requests failed
      if (!l && !f && !mot) {
        setError("Couldn't load insights");
      }
    } catch (err) {
      setError("Couldn't load insights");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const letterNotificationDismissedRef = useRef(null);

  useEffect(() => {
    if (!user || !apiBase || loading || !letter?.period_start || letter?.too_early) return;
    const periodStart = letter.period_start;
    if (letterNotificationDismissedRef.current === periodStart) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfile(apiBase);
        const prefs = profile?.preferences || {};
        if (prefs.insight_letter_notification_enabled !== false && periodStart !== prefs.last_dismissed_letter_date) {
          if (!cancelled) toast("A letter is waiting for you.");
        }
        letterNotificationDismissedRef.current = periodStart;
        await updateProfile(apiBase, {
          preferences: { ...prefs, last_dismissed_letter_date: periodStart },
        });
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [user, apiBase, loading, letter?.period_start, letter?.too_early]);

  const [regenerateError, setRegenerateError] = useState(false);
  
  const handleRegenerate = async () => {
    if (!apiBase || !uid || regenerating) return;
    setRegenerating(true);
    setRegenerateError(false);
    try {
      const params = new URLSearchParams({ user_identifier: uid });
      const res = await fetch(`${apiBase}/insights/generate-letter?${params}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLetter(data);
      } else {
        setRegenerateError(true);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
      setRegenerateError(true);
    } finally {
      setRegenerating(false);
    }
  };

  const isTooEarly = letter?.too_early === true;
  const hasLetter = letter?.content && !isTooEarly;
  const daysRemaining = letter?.days_remaining ?? 0;
  const hasMoodData = moodOverTime?.has_data ?? false;

  // Loading state with animated skeletons
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-40 bg-[#FFFDF7] flex flex-col overflow-hidden"
        data-testid="insights-panel"
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]/60">
          <h1 className="text-base font-medium text-[#4A5568]">Insights</h1>
          <HapticButton onClick={onClose} className="p-2 rounded-full text-[#718096] hover:bg-[#E2E8F0]/50" aria-label="Close">
            <X className="w-5 h-5" />
          </HapticButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-xl mx-auto w-full">
          <motion.p 
            className="text-sm text-[#94A3B8] mb-8"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Gathering your reflections...
          </motion.p>
          <Skeleton className="h-48 w-full rounded-3xl mb-8" />
          <Skeleton className="h-6 w-36 mb-4" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[#FFFDF7] flex flex-col overflow-hidden"
      data-testid="insights-panel"
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]/60">
        <h1 className="text-base font-medium text-[#4A5568]">Insights</h1>
        <HapticButton onClick={onClose} className="p-2 rounded-full text-[#718096] hover:bg-[#E2E8F0]/50" aria-label="Close">
          <X className="w-5 h-5" />
        </HapticButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-xl mx-auto w-full [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {error && (
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="text-sm text-[#94A3B8] mb-6"
          >
            Couldn't load right now. You can try again later.
          </motion.p>
        )}

        {/* Too early - waiting for first 5-day period */}
        {isTooEarly && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden mb-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFFDF7] via-[#FFF8F6] to-[#FFF5F0] rounded-3xl" />
            <motion.div 
              className="absolute top-4 right-4 w-20 h-20 rounded-full bg-[#FFB4A9]/5 blur-2xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative rounded-3xl border border-[#E2E8F0]/60 p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-4 h-4 text-[#FFB4A9]" />
                </motion.div>
                <span className="text-sm font-medium text-[#4A5568]">Your letter is on its way</span>
              </div>
              <p className="text-[#4A5568] text-[1rem] leading-relaxed mb-4">
                Every 5 days, I'll write you a letter based on what you've shared — your thoughts, the moments you've sat with, how things have felt.
              </p>
              <p className="text-[#718096] text-sm">
                {daysRemaining > 1 
                  ? `Come back in ${daysRemaining} days.`
                  : daysRemaining === 1 
                    ? "Almost there — just 1 more day."
                    : "Keep reflecting, your first letter is coming soon."}
              </p>
              <p className="text-[10px] text-[#A0AEC0] mt-4">
                In the meantime, each reflection you write becomes part of the letter.
              </p>
            </div>
          </motion.div>
        )}

        {/* === SECTION: Letter === */}
        {hasLetter && (
          <section className="mb-10">
            <LetterCard 
              letter={letter} 
              onRegenerate={handleRegenerate} 
              regenerating={regenerating}
              regenerateError={regenerateError}
            />
          </section>
        )}

        {/* === SECTION: Gentle Patterns === */}
        {(hasLetter || isTooEarly) && (
          <motion.section 
            className="mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-6">Gentle patterns</h2>

            {/* Reflection frequency - current week */}
            <div className="mb-10">
              <h3 className="text-sm text-[#718096] mb-5">Moments you paused to reflect</h3>
              {frequency?.days?.length > 0 ? (
                frequency.days.some(d => d.count > 0) ? (
                  <FrequencyDots days={frequency.days} />
                ) : (
                  <p className="text-sm text-[#94A3B8] py-4">You haven't paused lately — that's okay.</p>
                )
              ) : (
                <p className="text-sm text-[#94A3B8] py-4">Nothing yet this week.</p>
              )}
              <p className="text-[10px] text-[#CBD5E0]/60 mt-4 text-center">This week</p>
            </div>

            {/* Mood over time (using feelings, not metaphors) */}
            <div className="pt-6 border-t border-[#E2E8F0]/30">
              <h3 className="text-sm text-[#718096] mb-5">A feeling that showed up</h3>
              {hasMoodData && moodOverTime?.moods?.length > 0 ? (
                <>
                  <MoodTimeline moods={moodOverTime.moods} />
                  <p className="text-[10px] text-[#A0AEC0] mt-5">
                    This is what patterns look like to me — you know yourself better.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#94A3B8] py-2">Nothing yet this week.</p>
              )}
            </div>
          </motion.section>
        )}

        {/* Privacy note */}
        <motion.div 
          className="pt-6 border-t border-[#E2E8F0]/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs text-[#A0AEC0] text-center">
            All data stays private and is never shared.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default InsightsPanel;
