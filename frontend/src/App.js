import { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";
import { AnimatePresence } from "framer-motion";
import InputScreen from "./components/InputScreen";
import LoadingState from "./components/LoadingState";
import ReflectionFlow from "./components/ReflectionFlow";
import Onboarding from "./components/Onboarding";
import ViewReflection from "./components/reflection/ViewReflection";
import ViewSavedReflection from "./components/reflection/ViewSavedReflection";
import InsightsPanel from "./components/InsightsPanel";
import SettingsPanel from "./components/SettingsPanel";
import { Toaster, toast } from "sonner";
import { requestNotificationPermission, scheduleRevisitNotification, setOpenReflectionHandler } from "./lib/notifications";
import { useAuth } from "./contexts/AuthContext";
import { useRevenueCat } from "./contexts/RevenueCatContext";
import { getAuthHeaders, getProfile, getReflectedToday } from "./lib/api";
import { getOrCreateUserIdentifier } from "./lib/userId";
import { getReflectionMode } from "./lib/reflectionMode";
import AuthScreen from "./components/AuthScreen";
import PaywallLimitModal from "./components/PaywallLimitModal";
import { BookOpen, Settings } from "lucide-react";
import { supabase } from "./lib/supabase";
import { getBackendUrl } from "./lib/config";

const BACKEND_URL = getBackendUrl();
const API = `${BACKEND_URL}/api`;

const REVISIT_LATER_KEY = "revisit_later";
const SIGNIN_PROMPT_COUNT_KEY = "reflect_signin_prompt_count";
const SIGNIN_PROMPT_MAX = 2;
const ONBOARDING_DONE_KEY = "reflect_onboarding_done";

const STATES = {
  ONBOARDING: 'onboarding',
  INPUT: 'input',
  LOADING: 'loading',
  REFLECTION: 'reflection',
  VIEWING_REFLECTION: 'viewing_reflection',
  VIEWING_SAVED: 'viewing_saved'
};

function App() {
  const { user, session, loading } = useAuth();
  const { isSupported: isRevenueCatSupported, presentPaywall, presentPaywallIfNeeded, isPremium } = useRevenueCat();
  const [appState, setAppState] = useState(STATES.ONBOARDING);
  const [thought, setThought] = useState('');
  const [reflection, setReflection] = useState(null);
  const [viewingReflectionId, setViewingReflectionId] = useState(null);
  const [revisitLaterIds, setRevisitLaterIds] = useState([]);
  const [dueReminders, setDueReminders] = useState([]);
  const [viewingSavedId, setViewingSavedId] = useState(null);
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false);
  const [insightsPanelOpen, setInsightsPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAll, setHistoryAll] = useState([]);
  const [revisitBannerHidden, setRevisitBannerHidden] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingSaveAfterSignIn, setPendingSaveAfterSignIn] = useState(null);
  const [closingText, setClosingText] = useState(null);
  const [isReflectSubmitting, setIsReflectSubmitting] = useState(false);
  const [showPaywallLimitModal, setShowPaywallLimitModal] = useState(false);
  const revisitBannerTimeoutRef = useRef(null);
  const dailyNudgeShownThisSession = useRef(false);
  const openReflectionRef = useRef((id) => {
    setViewingReflectionId(id);
    setAppState(STATES.VIEWING_REFLECTION);
  });
  const historyDropdownRef = useRef(null);

  const authRequired = !!supabase;
  const userId = user?.id ?? getOrCreateUserIdentifier();
  const prevUserRef = useRef(user);

  // Clear all reflection, mirror, mood, and personalization state on logout so no previous session data remains visible.
  useEffect(() => {
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;
    if (prevUser == null || user != null) return;
    setThought("");
    setReflection(null);
    setViewingReflectionId(null);
    setViewingSavedId(null);
    setRevisitLaterIds([]);
    setDueReminders([]);
    setHistoryAll([]);
    setClosingText(null);
    setPendingSaveAfterSignIn(null);
    setAppState(STATES.INPUT);
    setHistoryDropdownOpen(false);
    setInsightsPanelOpen(false);
    setSettingsPanelOpen(false);
    setShowSignInModal(false);
    try {
      localStorage.removeItem(REVISIT_LATER_KEY);
    } catch (_) {}
    if (dailyNudgeShownThisSession.current) dailyNudgeShownThisSession.current = false;
  }, [user]);

  // After sign-in: show onboarding for first-time users; skip only if this user has completed it (per-user persistence).
  useEffect(() => {
    if (!user?.id || !authRequired) return;
    try {
      const doneForUser = localStorage.getItem(ONBOARDING_DONE_KEY);
      if (doneForUser === user.id) {
        setAppState(STATES.INPUT);
      } else {
        setAppState(STATES.ONBOARDING);
      }
    } catch (_) {
      setAppState(STATES.ONBOARDING);
    }
  }, [user?.id, authRequired]);

  useEffect(() => {
    openReflectionRef.current = (id) => {
      setViewingReflectionId(id);
      setAppState(STATES.VIEWING_REFLECTION);
    };
    setOpenReflectionHandler((reflectionId) => openReflectionRef.current?.(reflectionId));
  }, []);

  useEffect(() => {
    import("@capacitor/core").then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
          StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
          // setBackgroundColor is only implemented on Android; iOS returns UNIMPLEMENTED
          if (Capacitor.getPlatform() === "android") {
            StatusBar.setBackgroundColor({ color: "#FFFDF7" }).catch(() => {});
          }
        });
      }
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REVISIT_LATER_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setRevisitLaterIds(Array.isArray(list) ? list : []);
    } catch (_) {
      setRevisitLaterIds([]);
    }
  }, []);

  useEffect(() => {
    axios.get(`${API}/reminders/due`, { headers: getAuthHeaders() }).then((res) => {
      const list = res.data?.reminders ?? [];
      setDueReminders(Array.isArray(list) ? list : []);
    }).catch(() => setDueReminders([]));
  }, []);

  useEffect(() => {
    if (!historyDropdownOpen) return;
    const onOutside = (e) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target)) {
        setHistoryDropdownOpen(false);
      }
    };
    document.addEventListener("click", onOutside, true);
    return () => document.removeEventListener("click", onOutside, true);
  }, [historyDropdownOpen]);

  // After sign-in, save any reflection that was pending (from end of first reflection). Intentionally only depend on user so we run once when user becomes available.
  useEffect(() => {
    if (!user || !pendingSaveAfterSignIn) return;
    const { rawText, answers, mirrorResponse, moodWord, options = {} } = pendingSaveAfterSignIn;
    setPendingSaveAfterSignIn(null);
    setShowSignInModal(false);
    performSaveHistory(rawText, answers, mirrorResponse, moodWord, user.id, options)
      .then(() => refetchHistory())
      .catch((err) => {
        console.error("Save after sign-in failed:", err);
        toast.error("Could not save reflection. Try again from My reflections.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when user is set; pendingSaveAfterSignIn/refetchHistory are intentionally omitted to avoid re-runs.
  }, [user]);

  // When user signs in from My reflections (no pending save), close the modal and show affirmation.
  useEffect(() => {
    if (!user || !showSignInModal) return;
    if (pendingSaveAfterSignIn) return; // save-after-sign-in effect above handles that flow
    setShowSignInModal(false);
    toast.success("You're signed in.");
  }, [user, showSignInModal, pendingSaveAfterSignIn]);

  // When user signs in, load history so My reflections and Settings show correct state
  useEffect(() => {
    if (!user?.id || !authRequired) return;
    axios
      .get(`${API}/history`, { headers: getAuthHeaders() })
      .then((res) => setHistoryAll(Array.isArray(res.data?.items) ? res.data.items : []))
      .catch(() => setHistoryAll([]));
  }, [user?.id, authRequired]);

  // Daily reminder nudge: when on main screen (and Settings closed), past reminder time, not reflected today. Re-runs when Settings closes so turning the nudge on there triggers a check.
  useEffect(() => {
    if (!user || appState !== STATES.INPUT || settingsPanelOpen) return;
    if (dailyNudgeShownThisSession.current) return;
    const t = setTimeout(async () => {
      try {
        const profile = await getProfile(API);
        const prefs = profile?.preferences || {};
        if (!prefs.daily_reminder_enabled) return;
        const pausedUntil = prefs.reminders_paused_until;
        if (pausedUntil && new Date(pausedUntil) > new Date()) return;
        const timeStr = prefs.daily_reminder_time || "09:00";
        const [h, m] = timeStr.split(":").map(Number);
        const now = new Date();
        const reminderToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m || 0, 0);
        if (now < reminderToday) return;
        const { reflected_today } = await getReflectedToday(API);
        if (reflected_today) return;
        dailyNudgeShownThisSession.current = true;
        toast("A quiet moment, if you want.");
      } catch (_) {}
    }, 1500);
    return () => clearTimeout(t);
  }, [user, appState, settingsPanelOpen]);

  const handleOnboardingComplete = () => {
    if (user?.id) {
      try {
        localStorage.setItem(ONBOARDING_DONE_KEY, user.id);
      } catch (_) {}
    }
    setAppState(STATES.INPUT);
    if (isRevenueCatSupported && !isPremium) {
      setTimeout(() => presentPaywallIfNeeded().catch(() => {}), 1200);
    }
  };

  const handleSubmit = async () => {
    if (!thought.trim()) return;
    if (isReflectSubmitting) return;

    setIsReflectSubmitting(true);
    setAppState(STATES.LOADING);

    try {
      // Include reflection mode in request - affects LLM tone/length
      const reflectionMode = getReflectionMode();
      const response = await axios.post(`${API}/reflect`, {
        thought: thought.trim(),
        reflection_mode: reflectionMode,
      }, { headers: getAuthHeaders() });
      setReflection({ id: response.data.id ?? null, sections: response.data.sections });
      setAppState(STATES.REFLECTION);
    } catch (error) {
      console.error("Reflection error:", error);
      const isLimitReached = error.response?.status === 429
        && (error.response?.data?.error === "Reflection limit reached" || error.response?.data?.detail === "Reflection limit reached");
      if (isLimitReached) {
        if (isRevenueCatSupported) {
          try {
            await presentPaywall();
          } catch (_) {
            setShowPaywallLimitModal(true);
          }
          toast("Upgrade to Premium for more reflections.");
        } else {
          setShowPaywallLimitModal(true);
          toast("Reflection limit reached. Upgrade in Settings.");
        }
      } else {
        toast.error("We couldn't load your reflection. Try again.");
      }
      setAppState(STATES.INPUT);
    } finally {
      setIsReflectSubmitting(false);
    }
  };

  const handleGetPersonalizedMirror = async (questionResponses) => {
    try {
      const response = await axios.post(`${API}/mirror/personalized`, {
        thought: thought.trim(),
        questions: questionResponses.map((r) => r.question),
        answers: questionResponses.map((r) => r.response),
        ...(reflection?.id && { reflection_id: reflection.id }),
      }, { headers: getAuthHeaders() });
      return response.data.content;
    } catch (error) {
      console.error("Personalized mirror error:", error);
      toast.error("We couldn't load your reflection. Try again.");
      return null;
    }
  };

  const handleFetchMoodSuggestions = async (thought, mirrorText) => {
    try {
      const response = await axios.post(`${API}/mood/suggest`, {
        thought: (thought || "").trim(),
        mirror_text: (mirrorText || "").trim() || undefined,
      }, { headers: getAuthHeaders() });
      return response.data.suggestions ?? [];
    } catch (error) {
      console.error("Mood suggestions error:", error);
      return [];
    }
  };

  const handleGetClosing = async (moodWord, answers, personalizedMirror) => {
    try {
      const response = await axios.post(`${API}/closing`, {
        thought: thought.trim(),
        answers: Array.isArray(answers) ? answers.map(a => a.response || a) : answers,
        mirror_response: personalizedMirror || "",
        mood_word: moodWord || null,
        ...(reflection?.id && { reflection_id: reflection.id }),
        reflection_mode: getReflectionMode(),
      }, { headers: getAuthHeaders() });
      
      const closing = response.data.closing_text;
      setClosingText(closing);
      return closing;
    } catch (error) {
      console.error("Closing generation error:", error);
      toast.error("We couldn't load your reflection. Try again.");
      const fallback = "You showed up today. That matters. Between now and next time — notice what you're already carrying. It's worth your attention.";
      setClosingText(fallback);
      return fallback;
    }
  };

  const handleMoodSubmit = async (reflectionId, wordOrPhrase, description) => {
    if (!reflectionId || !wordOrPhrase?.trim()) return;
    try {
      await axios.post(`${API}/mood`, {
        reflection_id: reflectionId,
        word_or_phrase: wordOrPhrase.trim(),
        ...(description?.trim() && { description: description.trim() }),
      }, { headers: getAuthHeaders() });
    } catch (error) {
      console.error("Mood submit error:", error);
      throw error; // MoodCheckIn will still show done state
    }
  };

  const handleReflectAnother = () => {
    setAppState(STATES.INPUT);
  };

  const handleComeBackLater = (reflectionId) => {
    if (reflectionId) {
      try {
        const raw = localStorage.getItem(REVISIT_LATER_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? [...list, { reflection_id: reflectionId, saved_at: new Date().toISOString() }] : [{ reflection_id: reflectionId, saved_at: new Date().toISOString() }];
        localStorage.setItem(REVISIT_LATER_KEY, JSON.stringify(next));
        setRevisitLaterIds(next);
      } catch (_) {}
    }
    // Navigation to mood page is handled inside ReflectionFlow
  };

  const performSaveHistory = async (rawText, answers, mirrorResponse, moodWord, uid, options = {}) => {
    const { markOpened = true, revisitType = null } = options;
    const body = {
      user_identifier: uid,
      raw_text: rawText,
      answers: Array.isArray(answers) ? answers : [],
      mirror_response: mirrorResponse,
      mood_word: moodWord || null,
    };
    if (revisitType === "come_back" || revisitType === "remind") body.revisit_type = revisitType;
    const res = await axios.post(`${API}/history`, body, { headers: getAuthHeaders() });
    const savedId = res.data?.id;
    if (savedId && markOpened) {
      await axios.patch(`${API}/history/${savedId}/mark-opened`, {}, { headers: getAuthHeaders() }).catch(() => {});
    }
  };

  const refetchHistory = () => {
    if (!user) return;
    axios
      .get(`${API}/history`, { headers: getAuthHeaders() })
      .then((res) => setHistoryAll(Array.isArray(res.data?.items) ? res.data.items : []))
      .catch(() => setHistoryAll([]));
  };

  const handleSaveHistory = async (rawText, answers, mirrorResponse, moodWord, options = {}) => {
    if (!user) {
      const count = parseInt(localStorage.getItem(SIGNIN_PROMPT_COUNT_KEY) || "0", 10);
      if (count >= SIGNIN_PROMPT_MAX) {
        toast("Sign in from Settings or My reflections to save.");
        return;
      }
      setPendingSaveAfterSignIn({ rawText, answers, mirrorResponse, moodWord, options });
      setShowSignInModal(true);
      return;
    }
    try {
      await performSaveHistory(rawText, answers, mirrorResponse, moodWord, user.id, options);
      refetchHistory();
    } catch (err) {
      console.error("Save history error:", err);
      if (err.response?.status === 401) {
        toast.error("Session invalid. Sign out and sign in again from Settings, or check backend SUPABASE_JWT_SECRET.");
      } else {
        toast.error("Could not save reflection. Try again.");
      }
    }
  };

  const handleSetReminder = async (reflectionId, days) => {
    try {
      const res = await axios.post(`${API}/remind`, {
        reflection_id: reflectionId,
        days,
      }, { headers: getAuthHeaders() });
      const remindAt = res.data?.remind_at;
      const message = res.data?.message ?? null;
      toast.success(`We'll remind you in ${days === 1 ? "1 day" : `${days} days`}.`);
      if (remindAt) {
        const granted = await requestNotificationPermission();
        if (granted) {
          scheduleRevisitNotification(reflectionId, remindAt, (id) => openReflectionRef.current?.(id), message);
        }
      }
    } catch (error) {
      console.error("Set reminder error:", error);
      toast.error("Could not set reminder. Try again later.");
    }
  };

  const openReflectionFromBanner = (reflectionId, fromRevisitLater, reminderId) => {
    if (!reflectionId) return;
    setViewingReflectionId(reflectionId);
    setAppState(STATES.VIEWING_REFLECTION);
    if (fromRevisitLater) {
      try {
        const raw = localStorage.getItem(REVISIT_LATER_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.filter((r) => r.reflection_id !== reflectionId) : [];
        localStorage.setItem(REVISIT_LATER_KEY, JSON.stringify(next));
        setRevisitLaterIds(next);
      } catch (_) {}
    } else {
      if (reminderId) {
        axios.delete(`${API}/reminders/${reminderId}`, { headers: getAuthHeaders() }).catch(() => {});
      }
      setDueReminders((prev) => prev.filter((r) => r.reflection_id !== reflectionId));
    }
  };

  const handleCloseViewReflection = () => {
    setViewingReflectionId(null);
    setAppState(STATES.INPUT);
  };

  const handleOpenHistoryDropdown = () => {
    const next = !historyDropdownOpen;
    setHistoryDropdownOpen(next);
    if (next && user) {
      setHistoryLoading(true);
      axios
        .get(`${API}/history`, { headers: getAuthHeaders() })
        .then((res) => setHistoryAll(Array.isArray(res.data?.items) ? res.data.items : []))
        .catch(() => setHistoryAll([]))
        .finally(() => setHistoryLoading(false));
    }
  };

  const handleOpenSavedReflection = (savedId) => {
    setViewingSavedId(savedId);
    setAppState(STATES.VIEWING_SAVED);
    setHistoryDropdownOpen(false);
  };

  const handleCloseViewSavedReflection = () => {
    setViewingSavedId(null);
    setAppState(STATES.INPUT);
  };

  const handleStartFresh = () => {
    setThought('');
    setReflection(null);
    setViewingReflectionId(null);
    setViewingSavedId(null);
    setAppState(STATES.INPUT);
  };

  const hasRevisitItems = revisitLaterIds.length > 0 || dueReminders.length > 0;
  const hasRevisitBanner = hasRevisitItems && appState !== STATES.VIEWING_REFLECTION && !viewingReflectionId && !revisitBannerHidden;

  useEffect(() => {
    if (!hasRevisitItems) {
      setRevisitBannerHidden(false);
      if (revisitBannerTimeoutRef.current) {
        clearTimeout(revisitBannerTimeoutRef.current);
        revisitBannerTimeoutRef.current = null;
      }
      return;
    }
    if (revisitBannerHidden) return;
    revisitBannerTimeoutRef.current = setTimeout(() => {
      setRevisitBannerHidden(true);
      revisitBannerTimeoutRef.current = null;
    }, 3000);
    return () => {
      if (revisitBannerTimeoutRef.current) {
        clearTimeout(revisitBannerTimeoutRef.current);
      }
    };
  }, [hasRevisitItems, revisitBannerHidden]);

  const firstDueReminder = dueReminders.length > 0 ? dueReminders[0] : null;
  const firstDueReflectionId = firstDueReminder?.reflection_id ?? null;
  const firstRevisitLaterId = revisitLaterIds.length > 0 ? revisitLaterIds[0].reflection_id : null;
  const bannerText = firstDueReflectionId
    ? (firstDueReminder?.message || "You wanted to come back to this.")
    : "You have a reflection waiting.";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFDF7] flex items-center justify-center">
        <p className="text-sm text-[#718096]">Loading…</p>
      </div>
    );
  }

  if (authRequired && !user) {
    return (
      <div className="min-h-screen bg-[#FFFDF7]" data-testid="app-container">
        <Toaster position="top-center" richColors />
        <AuthScreen />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDF7]" data-testid="app-container">
      <Toaster position="top-center" richColors />

      {/* Paywall limit modal: when user hits 429 (reflection limit) — native paywall or this fallback */}
      <AnimatePresence>
        {showPaywallLimitModal && (
          <PaywallLimitModal
            onDismiss={() => setShowPaywallLimitModal(false)}
            onUpgrade={() => {
              setShowPaywallLimitModal(false);
              if (isRevenueCatSupported) {
                presentPaywall().catch(() => {});
              } else {
                setSettingsPanelOpen(true);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Sign-in modal: shown at end of first reflection when user tries to save */}
      {showSignInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-[#FFFDF7] rounded-2xl shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 pt-5 pb-2 text-center">
              <p className="text-sm font-medium text-[#4A5568]">
                Sign in to save this reflection
              </p>
              <p className="text-xs text-[#718096] mt-1">
                Your words stay private and sync across devices.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <AuthScreen compact />
            </div>
            <div className="px-5 pb-5 pt-2 text-center border-t border-[#E2E8F0]/60">
              <button
                type="button"
                onClick={() => {
                  try {
                    const count = parseInt(localStorage.getItem(SIGNIN_PROMPT_COUNT_KEY) || "0", 10);
                    localStorage.setItem(SIGNIN_PROMPT_COUNT_KEY, String(count + 1));
                  } catch (_) {}
                  setShowSignInModal(false);
                  setPendingSaveAfterSignIn(null);
                  toast("Sign in later from Settings or My reflections to save.");
                }}
                className="text-sm text-[#718096] hover:text-[#4A5568] underline"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My reflections – top-left dropdown (hidden on onboarding) */}
      {appState !== STATES.ONBOARDING && (
      <div ref={historyDropdownRef} className="fixed top-4 left-4 z-30">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleOpenHistoryDropdown(); }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-[#E2E8F0] text-[#4A5568] hover:border-[#FFB4A9]/50 hover:bg-[#FFB4A9]/10 transition-colors shadow-sm"
          data-testid="my-reflections-button"
          aria-label="My reflections"
        >
          <BookOpen className="w-5 h-5" />
        </button>
        {historyDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-2 w-72 max-h-[min(85vh,32rem)] flex flex-col rounded-2xl bg-white border border-[#E2E8F0] shadow-lg overflow-hidden"
            data-testid="my-reflections-dropdown"
          >
            {/* ZONE A: Scrollable – shows ~5 recent reflections, scroll down for past reflections */}
            <div className="flex flex-col min-h-0 shrink-0">
              <div className="px-4 py-3 border-b border-[#E2E8F0] shrink-0">
                <h2 className="text-sm font-medium text-[#4A5568]">My reflections</h2>
              </div>
              <div className="min-h-0 max-h-[12rem] overflow-y-auto py-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                {historyLoading ? (
                  <p className="text-sm text-[#718096] py-4 px-4 text-center">Loading…</p>
                ) : !user ? (
                  <div className="py-4 px-4 flex flex-col items-center gap-3">
                    <p className="text-sm text-[#718096] text-center">
                      Sign in to see your reflections.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setHistoryDropdownOpen(false); setShowSignInModal(true); }}
                      className="py-2 px-4 text-sm font-medium text-[#4A5568] bg-[#FFB4A9]/20 hover:bg-[#FFB4A9]/30 rounded-lg transition-colors"
                    >
                      Sign in
                    </button>
                  </div>
                ) : historyAll.length === 0 ? (
                  <p className="text-sm text-[#718096] py-4 px-4 text-center">
                    None yet. Complete a reflection to save it here.
                  </p>
                ) : (
                  <ul className="space-y-0.5 px-2">
                    {historyAll.map((item) => {
                      const label = (item.raw_text || item.mirror_response || "Reflection").slice(0, 50);
                      const hasMore = (item.raw_text || item.mirror_response || "").length > 50;
                      const hasBeenOpened = !!(item.opened_at != null && String(item.opened_at).trim() !== "");
                      const showNotOpened = !hasBeenOpened;
                      const subtleStyle = "border-l-4 border-[#E2E8F0] bg-[#F8FAFC]/80 hover:bg-[#F1F5F9]/90";
                      const rowStyle = showNotOpened ? subtleStyle : "";
                      const badgeText = showNotOpened ? "To return" : null;
                      const badgeClass = showNotOpened
                        ? "text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]"
                        : "";
                      const dotColor = showNotOpened ? "bg-[#94A3B8]" : null;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleOpenSavedReflection(item.id)}
                            className={`w-full text-left text-sm text-[#4A5568] rounded-lg px-3 py-2 flex items-center gap-2 min-w-0 ${rowStyle || "hover:bg-[#FFB4A9]/10"}`}
                          >
                            {showNotOpened && dotColor && (
                              <span
                                className={`shrink-0 w-2 h-2 rounded-full ${dotColor}`}
                                title={badgeText}
                                aria-hidden
                              />
                            )}
                            <span className="truncate flex-1">{label}{hasMore ? "…" : ""}</span>
                            {badgeText && (
                              <span className={`shrink-0 ${badgeClass}`} title={badgeText}>
                                {badgeText}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* ZONE B: Fixed – Insights & Settings (always visible, never scroll) */}
            <div className="shrink-0 border-t border-[#E2E8F0] bg-[#FAFAFA]/50 px-4 py-3 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => { setInsightsPanelOpen(true); setHistoryDropdownOpen(false); }}
                className="w-full text-left text-sm text-[#4A5568] hover:bg-[#FFB4A9]/10 rounded-lg px-3 py-2 transition-colors"
              >
                Insights
              </button>
              <button
                type="button"
                onClick={() => { setSettingsPanelOpen(true); setHistoryDropdownOpen(false); }}
                className="w-full text-left text-sm text-[#4A5568] hover:bg-[#FFB4A9]/10 rounded-lg px-3 py-2 transition-colors"
              >
                Settings
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {insightsPanelOpen && (
        <AnimatePresence>
          <InsightsPanel apiBase={API} onClose={() => setInsightsPanelOpen(false)} />
        </AnimatePresence>
      )}

      {/* Settings panel */}
      <AnimatePresence>
        {settingsPanelOpen && (
          <SettingsPanel
              apiBase={API}
              onClose={() => setSettingsPanelOpen(false)}
              onOpenSignIn={() => { setSettingsPanelOpen(false); setShowSignInModal(true); }}
            />
        )}
      </AnimatePresence>

      {hasRevisitBanner && (
        <div className="sticky top-0 z-20 mx-auto max-w-2xl px-6 py-3 flex items-center justify-between gap-3 bg-[#FFB4A9]/15 border-b border-[#FFB4A9]/20">
          <p className="text-sm text-[#4A5568]">
            {bannerText}
          </p>
          <button
            type="button"
            onClick={() => openReflectionFromBanner(firstDueReflectionId || firstRevisitLaterId, !firstDueReflectionId, firstDueReminder?.id)}
            className="shrink-0 px-4 py-2 rounded-full text-sm font-medium bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 transition-colors"
          >
            Open
          </button>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-6 md:px-8 py-12 md:py-16">
        <AnimatePresence mode="wait">
          {appState === STATES.VIEWING_REFLECTION && viewingReflectionId && (
            <ViewReflection
              key="view-reflection"
              reflectionId={viewingReflectionId}
              apiBase={API}
              onClose={handleCloseViewReflection}
              onReflectAnother={() => { setViewingReflectionId(null); setAppState(STATES.INPUT); }}
              onStartFresh={handleStartFresh}
            />
          )}

          {appState === STATES.VIEWING_SAVED && viewingSavedId && (
            <ViewSavedReflection
              key="view-saved"
              savedId={viewingSavedId}
              apiBase={API}
              onClose={handleCloseViewSavedReflection}
              onStartFresh={handleStartFresh}
            />
          )}

          {appState === STATES.ONBOARDING && (
            <Onboarding key="onboarding" onComplete={handleOnboardingComplete} />
          )}

          {appState === STATES.INPUT && !viewingReflectionId && !viewingSavedId && (
            <InputScreen
              key="input"
              thought={thought}
              setThought={setThought}
              onSubmit={handleSubmit}
              isSubmitting={isReflectSubmitting}
            />
          )}

          {appState === STATES.LOADING && (
            <LoadingState key="loading" />
          )}

          {appState === STATES.REFLECTION && reflection && !viewingReflectionId && (
            <ReflectionFlow
              key="reflection"
              sections={reflection.sections}
              originalThought={thought}
              reflectionId={reflection.id ?? null}
              onGetPersonalizedMirror={handleGetPersonalizedMirror}
              onFetchMoodSuggestions={handleFetchMoodSuggestions}
              onMoodSubmit={handleMoodSubmit}
              onSaveHistory={handleSaveHistory}
              onGetClosing={handleGetClosing}
              onComeBackLater={handleComeBackLater}
              onSetReminder={handleSetReminder}
              onReflectAnother={handleReflectAnother}
              onStartFresh={handleStartFresh}
            />
          )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 py-4 px-6 text-center bg-gradient-to-t from-[#FFFDF7] to-transparent">
        <p className="text-xs text-[#A0AEC0] tracking-wide" data-testid="footer-disclaimer">
          This is a reflection space, not therapy. If you're in crisis, please reach out to a mental health professional.
        </p>
        <p className="text-xs text-[#A0AEC0] mt-2">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-[#FFB4A9] transition-colors">Privacy Policy</a>
          <span className="mx-2">·</span>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-[#FFB4A9] transition-colors">Terms of Service</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
