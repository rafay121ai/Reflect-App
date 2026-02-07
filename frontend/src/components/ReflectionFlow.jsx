import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JourneyCards from "./reflection/JourneyCards";
import InteractiveQuestions from "./reflection/InteractiveQuestions";
import RevisitChoiceScreen from "./reflection/RevisitChoiceScreen";
import MirrorReflection from "./reflection/MirrorReflection";
import MoodCheckIn from "./reflection/MoodCheckIn";

const STEPS = {
  JOURNEY: 0,
  QUESTIONS: 1,
  MIRROR: 2,
  MOOD: 3
};

const ReflectionFlow = ({
  sections,
  originalThought,
  reflectionId,
  onGetPersonalizedMirror,
  onFetchMoodSuggestions,
  onMoodSubmit,
  onSaveHistory,
  onComeBackLater,
  onSetReminder,
  onReflectAnother,
  onStartFresh,
}) => {
  const [currentStep, setCurrentStep] = useState(STEPS.JOURNEY);
  const [personalizedMirror, setPersonalizedMirror] = useState(null);
  const [questionResponses, setQuestionResponses] = useState([]);
  const [isLoadingMirror, setIsLoadingMirror] = useState(false);
  const [userChoseReadNow, setUserChoseReadNow] = useState(false);
  /** 'come_back' | 'remind' | null – used to skip mark-opened and send revisit_type when saving */
  const [userChoseRevisitType, setUserChoseRevisitType] = useState(null);

  // Extract questions from sections
  const findSection = (keyword) => {
    return sections.find(s => s.title.toLowerCase().includes(keyword.toLowerCase())) || { title: "", content: "" };
  };

  const questionsSection = findSection("Notice") || findSection("Questions") || findSection("Some Things to Notice");
  const mirrorSection = findSection("Mirror") || findSection("Here's What I'm Seeing") || findSection("A Mirror");

  // Parse questions
  const parseQuestions = (content) => {
    if (!content) return ["What do you notice right now?", "What feels most important?", "What do you need?"];
    const lines = content.split('\n').filter(line => line.trim());
    const questions = lines
      .map(line => line.replace(/^[-•*\d.]\s*/, '').trim())
      .filter(q => q.length > 5 && q.includes('?'))
      .slice(0, 3);
    return questions.length >= 3 ? questions : ["What do you notice right now?", "What feels most important?", "What do you need?"];
  };

  const questions = parseQuestions(questionsSection.content);

  const handleJourneyComplete = () => {
    setCurrentStep(STEPS.QUESTIONS);
  };

  const handleQuestionsComplete = (responses) => {
    setQuestionResponses(responses || []);
    setCurrentStep(STEPS.MIRROR);
    setIsLoadingMirror(true);
    setUserChoseReadNow(false);

    // Load mirror in background; show options immediately
    onGetPersonalizedMirror(responses).then((personalized) => {
      if (personalized) setPersonalizedMirror(personalized);
      setIsLoadingMirror(false);
    });
  };

  const handleMoodDone = (moodWord) => {
    if (onSaveHistory && originalThought && personalizedMirror != null) {
      const answers = Array.isArray(questionResponses)
        ? questionResponses.map((r) => ({ question: r?.question ?? "", response: r?.response ?? "" }))
        : [];
      const markOpened = userChoseRevisitType == null;
      onSaveHistory(originalThought.trim(), answers, personalizedMirror, moodWord || null, {
        markOpened,
        revisitType: userChoseRevisitType || null,
      });
      setUserChoseRevisitType(null);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col min-h-[80vh] pb-24"
      data-testid="reflection-flow"
    >
      {/* Progress indicator - 4 steps: Explore, Reflect, See, Mood */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center gap-2 sm:gap-4 mb-10 flex-wrap"
        data-testid="progress-indicator"
      >
        {["Begin", "Write", "Sit", "Notice"].map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: index === currentStep ? 1.2 : 1,
                backgroundColor: index <= currentStep ? "#FFB4A9" : "#E2E8F0"
              }}
              transition={{ duration: 0.3 }}
              className={`w-3 h-3 rounded-full ${
                index === currentStep ? "shadow-lg shadow-[#FFB4A9]/40" : ""
              }`}
            />
            <span className={`text-sm transition-colors duration-300 ${
              index === currentStep ? "text-[#4A5568] font-medium" : "text-[#A0AEC0]"
            }`}>
              {label}
            </span>
            {index < 3 && (
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
              questions={questions}
              onComplete={handleQuestionsComplete}
              onBack={handleBackToJourney}
            />
          )}

          {currentStep === STEPS.MIRROR && !userChoseReadNow && (
            <RevisitChoiceScreen
              key="revisit-choice"
              reflectionId={reflectionId}
              onReadNow={() => setUserChoseReadNow(true)}
              onComeBackLater={handleComeBackLaterThenMood}
              onSetReminder={handleSetReminderThenMood}
            />
          )}

          {currentStep === STEPS.MIRROR && userChoseReadNow && isLoadingMirror && (
            <motion.div
              key="mirror-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-xl flex flex-col items-center justify-center py-16"
              data-testid="mirror-loading"
            >
              <motion.div
                className="w-10 h-10 rounded-full border-2 border-[#FFB4A9]/50 border-t-[#FFB4A9]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-[#718096] text-sm mt-4">Loading your mirror…</p>
            </motion.div>
          )}

          {currentStep === STEPS.MIRROR && userChoseReadNow && !isLoadingMirror && (
            <MirrorReflection
              key="mirror"
              content={mirrorSection.content}
              personalizedContent={personalizedMirror}
              isLoading={false}
              reflectionId={reflectionId}
              onContinue={handleContinueToMood}
              onReflectAnother={onReflectAnother}
              onStartFresh={onStartFresh}
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
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ReflectionFlow;
