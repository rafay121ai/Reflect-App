import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmotionalUndercurrent from "./reflection/EmotionalUndercurrent";
import MindJourney from "./reflection/MindJourney";
import InteractiveQuestions from "./reflection/InteractiveQuestions";
import MirrorReflection from "./reflection/MirrorReflection";
import ProgressIndicator from "./reflection/ProgressIndicator";

const STEPS = {
  EMOTIONAL: 0,
  JOURNEY: 1,
  QUESTIONS: 2,
  MIRROR: 3
};

const ReflectionDisplay = ({ sections, onReflectAnother, onStartFresh }) => {
  const [currentStep, setCurrentStep] = useState(STEPS.EMOTIONAL);

  // Extract sections by title
  const findSection = (title) => {
    return sections.find(s => s.title.toLowerCase().includes(title.toLowerCase())) || { title, content: "" };
  };

  const emotionalSection = findSection("Emotional Undercurrent");
  const journeySections = [
    findSection("Where the Mind"),
    findSection("Assuming"),
    findSection("Touches Inside")
  ];
  const questionsSection = findSection("Reflection Questions");
  const mirrorSection = findSection("Mirror");

  // Parse questions from content
  const parseQuestions = (content) => {
    if (!content) return ["What do you notice?", "What feels important?", "What might you need?"];
    const lines = content.split('\n').filter(line => line.trim());
    const questions = lines
      .map(line => line.replace(/^[-•*\d.]\s*/, '').trim())
      .filter(q => q.length > 0)
      .slice(0, 3);
    return questions.length >= 3 ? questions : [...questions, ...["What do you notice?", "What feels important?", "What might you need?"]].slice(0, 3);
  };

  const questions = parseQuestions(questionsSection.content);

  const handleContinue = () => {
    if (currentStep < STEPS.MIRROR) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > STEPS.EMOTIONAL) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    setCurrentStep(STEPS.MIRROR);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col min-h-[80vh] pb-24"
      data-testid="reflection-display"
    >
      {/* Progress Indicator */}
      <ProgressIndicator 
        currentStep={currentStep} 
        totalSteps={4}
        onSkip={handleSkip}
      />

      {/* Step Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <AnimatePresence mode="wait">
          {currentStep === STEPS.EMOTIONAL && (
            <EmotionalUndercurrent
              key="emotional"
              content={emotionalSection.content}
              onContinue={handleContinue}
            />
          )}

          {currentStep === STEPS.JOURNEY && (
            <MindJourney
              key="journey"
              sections={journeySections}
              onContinue={handleContinue}
              onBack={handleBack}
            />
          )}

          {currentStep === STEPS.QUESTIONS && (
            <InteractiveQuestions
              key="questions"
              questions={questions}
              onContinue={handleContinue}
              onBack={handleBack}
            />
          )}

          {currentStep === STEPS.MIRROR && (
            <MirrorReflection
              key="mirror"
              content={mirrorSection.content}
              onReflectAnother={onReflectAnother}
              onStartFresh={onStartFresh}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ReflectionDisplay;
