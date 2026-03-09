import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JourneyCards from "./reflection/JourneyCards";
import InteractiveQuestions from "./reflection/InteractiveQuestions";
import RevisitChoiceScreen from "./reflection/RevisitChoiceScreen";
import MirrorEntry from "./mirror/MirrorEntry";
import MirrorSlides from "./mirror/MirrorSlides";
import { useMirrorReport } from "./mirror/useMirrorReport";
import MoodCheckIn from "./reflection/MoodCheckIn";
import ClosingScreen from "./reflection/ClosingScreen";
import CrisisScreen from "./CrisisScreen";


function MirrorStepBlock({
  apiBase,
  originalThought,
  questions,
  questionResponses,
  reflectionId,
  reflectionCount,
  accessToken,
  mirrorReportEnabled,
  onMirrorSlidesComplete,
  onComeBackLater,
  onSetReminder,
  onCrisis,
  onBack,
}) {
  const [userChoseReadNow, setUserChoseReadNow] = useState(false);
  const [mirrorOpened, setMirrorOpened] = useState(false);
  const showMirrorReadNow = userChoseReadNow;
  const { report: mirrorReport, loading: reportLoading, error, retry, isSlow } = useMirrorReport({
    apiBase,
    thought: originalThought,
    questions,
    answers: (questionResponses || []).map((r) => r?.response ?? ""),
    reflectionId: null,
    accessToken,
    enabled: mirrorReportEnabled,
  });

  useEffect(() => {
    if (error?.crisis && onCrisis) onCrisis();
  }, [error, onCrisis]);

  const handleSlidesComplete = () => {
    if (mirrorReport) {
      const summary = [
        mirrorReport.archetype?.name,
        mirrorReport.shaped_by,
        mirrorReport.costing_you,
        mirrorReport.question,
      ]
        .filter(Boolean)
        .join("\n\n");
      onMirrorSlidesComplete(summary);
    } else {
      onMirrorSlidesComplete(null);
    }
  };

  return (
    <>
      {!userChoseReadNow ? (
        <motion.div
          key="revisit-choice"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#A0AEC0",
                fontSize: 13,
                padding: 8,
              }}
            >
              ← Back
            </button>
          )}
          <RevisitChoiceScreen
            reflectionId={reflectionId}
            onReadNow={() => setUserChoseReadNow(true)}
            onComeBackLater={onComeBackLater}
            onSetReminder={onSetReminder}
            isLoadingReport={reportLoading}
          />
        </motion.div>
      ) : (
        <div
          key={reflectionId || reflectionCount}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 100,
            background: "#0a0a12",
          }}
        >
          <AnimatePresence mode="wait">
            {error && !error.crisis ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "16px",
                  textAlign: "center",
                  padding: "0 24px",
                }}
              >
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                  {error.timeout
                    ? "This is taking longer than usual."
                    : "Something went wrong loading your mirror."}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    color: "white",
                    textDecoration: "underline",
                    textUnderlineOffset: "4px",
                    fontSize: "14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Try again
                </button>
              </div>
            ) : !mirrorOpened ? (
              <motion.div
                key="entry"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.5 }}
                style={{ width: "100%", height: "100%" }}
              >
                <MirrorEntry
                  archetypeName={mirrorReport?.archetype?.name}
                  isLoading={reportLoading || !mirrorReport}
                  onOpen={() => {
                    if (mirrorReport) setMirrorOpened(true);
                  }}
                  isSlow={isSlow}
                  onRetry={retry}
                  error={error}
                />
              </motion.div>
            ) : (
              <motion.div
                key="slides"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                style={{ width: "100%", height: "100%" }}
              >
                <MirrorSlides
                  report={mirrorReport}
                  onComplete={handleSlidesComplete}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

const CrisisFooter = () => (
  <div style={{ textAlign: "center", padding: "12px 0" }}>
    <a
      href="tel:988"
      style={{
        fontSize: 11,
        color: "#A0AEC0",
        textDecoration: "none",
      }}
    >
      In crisis? Text 988
    </a>
  </div>
);

const ReflectionFlow = ({
  apiBase,
  accessToken,
  sections,
  originalThought,
  reflectionId,
  flowMode = "standard",
  onGetPersonalizedMirror,
  onFetchMoodSuggestions,
  onMoodSubmit,
  onSaveHistory,
  onGetClosing,
  onComeBackLater,
  onSetReminder,
  onReflectAnother,
  onStartFresh,
  saveError,
  onRetrySave,
  onReflectionComplete,
}) => {
  const STEPS = useMemo(() => {
    if (flowMode === "direct") {
      return {
        JOURNEY: 0,
        MIRROR: 1,
        MOOD: 2,
        CLOSING: 3,
      };
    }
    return {
      JOURNEY: 0,
      QUESTIONS: 1,
      MIRROR: 2,
      MOOD: 3,
      CLOSING: 4,
    };
  }, [flowMode]);

  const STEP_LABELS = flowMode === "direct"
    ? ["Begin", "Sit", "Notice", "Carry"]
    : ["Begin", "Write", "Sit", "Notice", "Carry"];

  const STEP_SUBTEXT = flowMode === "direct"
    ? [
        "A gentle landing before we start.",
        "The mirror is ready. No questions needed today.",
        "Name the feel of this moment.",
        "Take a breath before you go.",
      ]
    : [
        "A gentle landing before we start.",
        flowMode === "deep"
          ? "One thing before the mirror."
          : "Put words to what's here.",
        "Let the reflection meet you.",
        "Name the feel of this moment.",
        "Take a breath before you go.",
      ];

  const [currentStep, setCurrentStep] = useState(STEPS.JOURNEY);
  const [showCrisis, setShowCrisis] = useState(false);
  const [personalizedMirror, setPersonalizedMirror] = useState(null);
  const [questionResponses, setQuestionResponses] = useState([]);
  const questionResponsesRef = useRef([]);
  const [closingText, setClosingText] = useState(null);
  const [isLoadingClosing, setIsLoadingClosing] = useState(false);
  const [isSlowClosing, setIsSlowClosing] = useState(false);
  /** 'come_back' | 'remind' | null – used to skip mark-opened and send revisit_type when saving */
  const [userChoseRevisitType, setUserChoseRevisitType] = useState(null);
  const [lastMoodWord, setLastMoodWord] = useState(null);
  const [reflectionCount, setReflectionCount] = useState(0);
  const [mirrorReportEnabled, setMirrorReportEnabled] = useState(false);
  const prevThoughtRef = useRef(originalThought);
  useEffect(() => {
    if (prevThoughtRef.current !== originalThought) {
      prevThoughtRef.current = originalThought;
      setReflectionCount((c) => c + 1);
    }
  }, [originalThought]);

  // Extract questions from sections
  const findSection = (keyword) => {
    return sections.find(s => s.title.toLowerCase().includes(keyword.toLowerCase())) || { title: "", content: "" };
  };

  // Parse questions (backend may return 1–3 depending on reflection mode: quiet=1, direct=2, gentle=3)
  const parseQuestions = (content) => {
    const fallback = ["What do you notice right now?", "What feels most important?", "What do you need?"];
    if (!content) return fallback;
    const lines = content.split('\n').filter(line => line.trim());
    const questions = lines
      .map(line => line.replace(/^[-•*\d.]\s*/, '').trim())
      .filter(q => q.length > 5 && q.includes('?'));
    return questions.length > 0 ? questions : fallback;
  };

  const questionsSection = findSection("Notice") || findSection("Questions") || findSection("Some Things to Notice");
  const questions = parseQuestions(questionsSection.content);

  const handleJourneyComplete = () => {
    if (flowMode === "direct") {
      setMirrorReportEnabled(true);
      setCurrentStep(STEPS.MIRROR);
    } else {
      setCurrentStep(STEPS.QUESTIONS);
    }
  };

  const handleQuestionsComplete = (responses) => {
    const safeResponses = responses || [];
    questionResponsesRef.current = safeResponses;
    setQuestionResponses(safeResponses);
    setMirrorReportEnabled(true);
    setCurrentStep(STEPS.MIRROR);
  };

  const handleMoodDone = (moodWord) => {
    setLastMoodWord(moodWord || null);
    // Do not save to history here — only when user explicitly completes closing (single write at end).
    setCurrentStep(STEPS.CLOSING);
    setIsLoadingClosing(true);

    if (onGetClosing) {
      const answers = Array.isArray(questionResponses)
        ? questionResponses.map((r) => ({ question: r?.question ?? "", response: r?.response ?? "" }))
        : [];

      onGetClosing(moodWord || null, answers, personalizedMirror, { onSlow: () => setIsSlowClosing(true) })
        .then((closing) => {
          if (closing) setClosingText(closing);
          setIsLoadingClosing(false);
          setIsSlowClosing(false);
        })
        .catch(() => {
          setIsLoadingClosing(false);
          setIsSlowClosing(false);
        });
    } else {
      setIsLoadingClosing(false);
    }
  };

  const handleMirrorSlidesComplete = (mirrorSummary) => {
    if (mirrorSummary) setPersonalizedMirror(mirrorSummary);
    handleContinueToMood();
  };

  const handleBackToJourney = () => {
    setCurrentStep(STEPS.JOURNEY);
  };

  const handleContinueToMood = () => {
    setCurrentStep(STEPS.MOOD);
  };

  const handleComeBackLaterThenMood = () => {
    setUserChoseRevisitType("come_back");
    onComeBackLater(reflectionId);
    setCurrentStep(STEPS.MOOD);
  };

  const handleSetReminderThenMood = async (reflectionIdArg, days) => {
    setUserChoseRevisitType("remind");
    await onSetReminder(reflectionIdArg, days);
    setCurrentStep(STEPS.MOOD);
  };

  // Scroll to top when moving to a new step (Journey → Questions → Mirror → Mood → Closing)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [currentStep]);

  if (showCrisis) {
    return (
      <CrisisScreen
        onContinue={() => {
          setShowCrisis(false);
          if (onStartFresh) onStartFresh();
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col min-h-[80vh] pb-24"
      data-testid="reflection-flow"
    >
      {/* Mobile: single step heading */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 text-center md:hidden"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-[#A0AEC0] mb-1">
          {STEP_LABELS[currentStep]}
        </p>
        <p className="text-[11px] text-[#CBD5E0]">
          {STEP_SUBTEXT[currentStep]}
        </p>
      </motion.div>

      {/* Desktop: full progress indicator - 5 steps: Begin, Write, Sit, Notice, Close */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden md:flex items-center justify-center gap-2 sm:gap-4 mb-10 flex-wrap"
        data-testid="progress-indicator"
      >
        {STEP_LABELS.map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: index === currentStep ? 1.2 : 1,
                backgroundColor: index <= currentStep ? "#FFB4A9" : "#E2E8F0",
              }}
              transition={{ duration: 0.3 }}
              className={`w-3 h-3 rounded-full ${
                index === currentStep ? "shadow-lg shadow-[#FFB4A9]/40" : ""
              }`}
            />
            <span
              className={`text-sm transition-colors duration-300 ${
                index === currentStep ? "text-[#4A5568] font-medium" : "text-[#A0AEC0]"
              }`}
            >
              {label}
            </span>
            {index < STEP_LABELS.length - 1 && (
              <div className="w-6 sm:w-8 h-px bg-[#E2E8F0] mx-1 sm:mx-2" />
            )}
          </div>
        ))}
      </motion.div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentStep === STEPS.JOURNEY && (
            <JourneyCards
              key="journey"
              sections={sections}
              onComplete={handleJourneyComplete}
            />
          )}

          {currentStep === STEPS.QUESTIONS && (
            <InteractiveQuestions
              key="questions"
              questions={
                flowMode === "deep"
                  ? [questions[2] ?? questions[questions.length - 1]]
                  : questions
              }
              onComplete={handleQuestionsComplete}
              onBack={handleBackToJourney}
            />
          )}

          {currentStep === STEPS.MIRROR && (
            <MirrorStepBlock
              key={reflectionId || `reflection-${reflectionCount}`}
              apiBase={apiBase}
              originalThought={originalThought}
              questions={questions}
              questionResponses={questionResponsesRef.current}
              reflectionId={reflectionId}
              reflectionCount={reflectionCount}
              accessToken={accessToken}
              mirrorReportEnabled={mirrorReportEnabled}
              onMirrorSlidesComplete={handleMirrorSlidesComplete}
              onComeBackLater={handleComeBackLaterThenMood}
              onSetReminder={handleSetReminderThenMood}
              onCrisis={() => setShowCrisis(true)}
              onBack={
                flowMode === "direct"
                  ? () => setCurrentStep(STEPS.JOURNEY)
                  : () => setCurrentStep(STEPS.QUESTIONS)
              }
            />
          )}

          {currentStep === STEPS.MOOD && (
            <MoodCheckIn
              key="mood"
              originalThought={originalThought}
              mirrorText={personalizedMirror}
              reflectionId={reflectionId}
              onSubmitMood={onMoodSubmit}
              onDone={handleMoodDone}
              onFetchMoodSuggestions={onFetchMoodSuggestions}
              onReflectAnother={onReflectAnother}
              onStartFresh={onStartFresh}
            />
          )}

          {currentStep === STEPS.CLOSING && (
            <>
              <ClosingScreen
                key="closing"
                closingText={closingText}
                isLoading={isLoadingClosing}
                isSlowClosing={isSlowClosing}
                onDone={() => {
                  // Single Supabase write: save to history only when user explicitly completes the flow.
                  if (onSaveHistory && originalThought && personalizedMirror != null) {
                    const answers = Array.isArray(questionResponses)
                      ? questionResponses.map((r) => ({ question: r?.question ?? "", response: r?.response ?? "" }))
                      : [];
                    const markOpened = userChoseRevisitType == null;
                    onSaveHistory(originalThought.trim(), answers, personalizedMirror, lastMoodWord || null, {
                      markOpened,
                      revisitType: userChoseRevisitType || null,
                    });
                    setUserChoseRevisitType(null);
                  }
                  if (onReflectionComplete && originalThought && personalizedMirror != null) {
                    onReflectionComplete({
                      thought: originalThought.trim(),
                      mirror: personalizedMirror,
                      mood: lastMoodWord || null,
                      closing: closingText || "",
                    });
                  }
                  if (onReflectAnother) {
                    onReflectAnother();
                  } else if (onStartFresh) {
                    onStartFresh();
                  }
                }}
              />
              {saveError && onRetrySave && (
                <div
                  style={{
                    marginTop: "16px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  Couldn't save your reflection.{" "}
                  <button
                    type="button"
                    onClick={onRetrySave}
                    style={{
                      color: "white",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      padding: 0,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      <CrisisFooter />
    </motion.div>
  );
};

export default ReflectionFlow;
