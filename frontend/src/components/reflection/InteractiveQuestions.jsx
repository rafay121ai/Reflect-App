import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, ChevronRight, ChevronLeft } from "lucide-react";
import HapticButton from "../ui/HapticButton";

const InteractiveQuestions = ({ questions, onComplete, onBack }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState(["", "", ""]);

  const handleAnswerChange = (value) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = value;
    setAnswers(newAnswers);
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      const questionResponses = questions.map((q, i) => ({
        question: q,
        response: answers[i]
      }));
      onComplete(questionResponses);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    } else {
      onBack();
    }
  };

  const isLastQuestion = currentQuestion === questions.length - 1;
  
  const getButtonText = () => {
    if (isLastQuestion) return "See Your Mirror";
    if (currentQuestion === 1) return "One More";
    return "Next Question";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-lg flex flex-col items-center"
      data-testid="interactive-questions"
    >
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mb-6"
      >
        <span className="text-sm uppercase tracking-widest text-[#E0D4FC] font-medium">Some Things to Notice</span>
      </motion.div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full rounded-[2.5rem] p-10 md:p-12 bg-white"
          style={{
            boxShadow: "0 24px 64px rgba(224, 212, 252, 0.2), 0 8px 24px rgba(0,0,0,0.04)"
          }}
          data-testid={`question-card-${currentQuestion}`}
        >
          {/* Icon with pulse */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="relative w-12 h-12 rounded-full mb-6 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #E0D4FC 0%, #F0EBFF 100%)" }}
          >
            {/* Subtle pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: "2px solid rgba(224, 212, 252, 0.4)" }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <MessageCircle className="w-5 h-5 text-[#4A5568]" />
          </motion.div>

          {/* Question */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl md:text-3xl leading-relaxed text-[#4A5568] mb-8"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}
            data-testid={`question-text-${currentQuestion}`}
          >
            {questions[currentQuestion]}
          </motion.h2>

          {/* Text input with focus pulse */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="relative"
          >
            <textarea
              value={answers[currentQuestion]}
              onChange={(e) => handleAnswerChange(e.target.value)}
              placeholder="Take your time..."
              className="w-full p-5 rounded-2xl bg-[#FFFDF7] border-2 border-[#E2E8F0] text-[#4A5568] placeholder:text-[#CBD5E0] focus:outline-none focus:border-[#E0D4FC] focus:ring-4 focus:ring-[#E0D4FC]/10 resize-none transition-all duration-300 text-lg"
              style={{ fontFamily: "'Manrope', sans-serif", minHeight: "120px" }}
              data-testid={`question-input-${currentQuestion}`}
            />
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-[#A0AEC0] mt-3 text-center"
            >
              Or just sit with this
            </motion.p>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex items-center gap-2 mt-6">
        {questions.map((_, index) => (
          <motion.div
            key={index}
            animate={{
              width: index === currentQuestion ? 24 : 8,
              backgroundColor: index <= currentQuestion ? "#E0D4FC" : "#E2E8F0"
            }}
            transition={{ duration: 0.3 }}
            className="h-2 rounded-full"
          />
        ))}
      </div>

      {/* Navigation with haptic buttons */}
      <div className="flex gap-4 mt-8">
        <HapticButton
          variant="secondary"
          onClick={prevQuestion}
          className="!px-6 !py-3"
          data-testid="prev-question-button"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </HapticButton>

        <HapticButton
          variant={isLastQuestion ? "success" : "primary"}
          onClick={nextQuestion}
          className="!px-8 !py-3"
          data-testid="next-question-button"
        >
          <span>{getButtonText()}</span>
          <ChevronRight className="w-5 h-5" />
        </HapticButton>
      </div>
    </motion.div>
  );
};

export default InteractiveQuestions;
