import { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";
import axios from "axios";
import { AnimatePresence } from "framer-motion";
import InputScreen from "./components/InputScreen";
import LoadingState from "./components/LoadingState";
import ReflectionFlow from "./components/ReflectionFlow";
import ReflectionErrorBoundary from "./components/ReflectionErrorBoundary";
import CrisisScreen from "./components/CrisisScreen";
import ReturnCard from "./components/ReturnCard";
import Onboarding from "./components/Onboarding";
import ViewReflection from "./components/reflection/ViewReflection";
import ViewSavedReflection from "./components/reflection/ViewSavedReflection";
import InsightsPanel from "./components/InsightsPanel";
import SettingsPanel from "./components/SettingsPanel";
import BetaFeedbackPanel from "./components/BetaFeedbackPanel";
import { Toaster, toast } from "sonner";
import { requestNotificationPermission, scheduleRevisitNotification, setOpenReflectionHandler } from "./lib/notifications";
import { useAuth } from "./contexts/AuthContext";
import { useRevenueCat } from "./contexts/RevenueCatContext";
import { getAuthHeaders, getProfile, getReflectedToday } from "./lib/api";
import { getOrCreateUserIdentifier } from "./lib/userId";
import { getReflectionMode } from "./lib/reflectionMode";
import PaywallLimitModal from "./components/PaywallLimitModal";
import GuestSignupModal from "./components/GuestSignupModal";
import TrialWelcomeModal, { hasSeenTrialWelcome } from "./components/TrialWelcomeModal";
import TrialExpiredModal from "./components/TrialExpiredModal";
import CookieConsent from "./components/CookieConsent";
import { BookOpen, Settings } from "lucide-react";
import AppLogo from "./components/AppLogo";
import { supabase } from "./lib/supabase";
import { getBackendUrl } from "./lib/config";
import { getGuestCount, saveGuestReflection, saveGuestReflectionToDb, getOrCreateGuestId, getGuestId, GUEST_MAX_REFLECTIONS } from "./lib/guestSession";
import { Analytics } from "@vercel/analytics/react";

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

const devError = (...args) => {
  if (process.env.NODE_ENV !== "production") console.error(...args);
};

function App() {
  const { user, session, loading, signInWithGoogle, error: authError, clearError: clearAuthError } = useAuth();
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
  const [betaFeedbackPanelOpen, setBetaFeedbackPanelOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAll, setHistoryAll] = useState([]);
  const [revisitBannerHidden, setRevisitBannerHidden] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [pendingSaveAfterSignIn, setPendingSaveAfterSignIn] = useState(null);
  const [closingText, setClosingText] = useState(null);
  const [isReflectSubmitting, setIsReflectSubmitting] = useState(false);
  const [showPaywallLimitModal, setShowPaywallLimitModal] = useState(false);
  const [guestSignupStage, setGuestSignupStage] = useState(null); // "soft" | "firm" | "hard_block" | null
  const [showGuestSignupModal, setShowGuestSignupModal] = useState(false);
  const [usage, setUsage] = useState(null);
  const [showTrialWelcome, setShowTrialWelcome] = useState(false);
  const [showTrialBanner, setShowTrialBanner] = useState(false);
  const [trialBannerMessage, setTrialBannerMessage] = useState("");
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [signInModalLoading, setSignInModalLoading] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showCrisisScreen, setShowCrisisScreen] = useState(false);
  const [returnCard, setReturnCard] = useState(null);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const [reflectTimeoutError, setReflectTimeoutError] = useState(false);
  const revisitBannerTimeoutRef = useRef(null);
  const dailyNudgeShownThisSession = useRef(false);
  const savePayloadRef = useRef(null);
  const openReflectionRef = useRef((id) => {
    setViewingReflectionId(id);
    setAppState(STATES.VIEWING_REFLECTION);
  });
  const historyDropdownRef = useRef(null);

  const authRequired = !!supabase;
  const userId = user?.id ?? getOrCreateUserIdentifier();
  const prevUserRef = useRef(user);

  // Silent health ping on load to wake Railway (cold start)
  useEffect(() => {
    fetch(`${API}/health`, { method: "GET" }).catch(() => {});
  }, []);

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
    setReturnCard(null);
    setPendingSaveAfterSignIn(null);
    setAppState(STATES.INPUT);
    setHistoryDropdownOpen(false);
    setInsightsPanelOpen(false);
    setSettingsPanelOpen(false);
    setBetaFeedbackPanelOpen(false);
    setShowSignInModal(false);
    try {
      localStorage.removeItem(REVISIT_LATER_KEY);
      localStorage.removeItem("reflect_draft");
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
    if (!user?.id) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/user/return-card`, { headers: getAuthHeaders() });
        if (res.data?.has_card) {
          const rid = res.data.reflection_id;
          try {
            if (localStorage.getItem(`reflect_seen_card_${rid}`) === "true") return;
          } catch (_) {}
          setReturnCard(res.data);
        }
      } catch (_) {}
    })();
  }, [user?.id]);

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
    if (!user || !authRequired) {
      setDueReminders([]);
      return;
    }
    axios
      .get(`${API}/reminders/due`, { headers: getAuthHeaders() })
      .then((res) => {
        const list = res.data?.reminders ?? [];
        setDueReminders(Array.isArray(list) ? list : []);
      })
      .catch(() => setDueReminders([]));
  }, [user, authRequired]);

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

  useEffect(() => {
    const handlePopState = () => {
      if (thought && reflection && appState === STATES.REFLECTION) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [thought, reflection, appState]);

  // After sign-in, save any reflection that was pending (from end of first reflection). Intentionally only depend on user so we run once when user becomes available.
  useEffect(() => {
    if (!user || !pendingSaveAfterSignIn) return;
    const { rawText, answers, mirrorResponse, moodWord, options = {} } = pendingSaveAfterSignIn;
    setPendingSaveAfterSignIn(null);
    setShowSignInModal(false);
    performSaveHistory(rawText, answers, mirrorResponse, moodWord, user.id, options)
      .then(() => refetchHistory())
      .catch((err) => {
        devError("Save after sign-in failed:", err);
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

  // When user signs in, fetch usage (plan / trial info)
  useEffect(() => {
    if (!user?.id || !authRequired) return;
    axios
      .get(`${API}/usage`, { headers: getAuthHeaders() })
      .then((res) => setUsage(res.data || null))
      .catch(() => setUsage(null));
  }, [user?.id, authRequired]);

  // Refetch usage when opening Settings so web LS subscription state is up to date
  const refetchUsage = () => {
    if (!user?.id || !authRequired) return;
    axios
      .get(`${API}/usage`, { headers: getAuthHeaders() })
      .then((res) => setUsage(res.data || null))
      .catch(() => setUsage(null));
  };

  // Show trial welcome modal once when coming from ?welcome=trial
  useEffect(() => {
    if (!user || !authRequired) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const welcome = params.get("welcome");
    if (welcome === "trial" && !hasSeenTrialWelcome()) {
      setShowTrialWelcome(true);
    }
    if (welcome) {
      params.delete("welcome");
      const search = params.toString();
      const nextUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      window.history.replaceState({}, document.title, nextUrl);
    }
  }, [user, authRequired]);

  // Trial warning banners and expired modal (web only, uses /api/usage)
  useEffect(() => {
    if (!usage || !user || !authRequired) return;
    const { plan_type: planType, days_remaining: daysRemaining, is_expired: isExpired, reflections_used: used } = usage;
    if (planType !== "trial") {
      setShowTrialBanner(false);
      setShowTrialExpiredModal(false);
      return;
    }
    let isNative = false;
    try {
      // eslint-disable-next-line global-require
      const { Capacitor } = require("@capacitor/core");
      isNative = Capacitor.isNativePlatform();
    } catch {
      isNative = false;
    }
    if (isNative) {
      setShowTrialBanner(false);
      setShowTrialExpiredModal(false);
      return;
    }
    if (isExpired) {
      let snoozed = false;
      try {
        const snoozeUntil = window.localStorage.getItem("reflect_trial_modal_snoozed");
        if (snoozeUntil && new Date(snoozeUntil) > new Date()) snoozed = true;
      } catch {}
      setShowTrialExpiredModal(!snoozed);
      setShowTrialBanner(false);
      return;
    }
    let bannerMsg = null;
    if (typeof daysRemaining === "number") {
      if (daysRemaining === 1) {
        bannerMsg = "Last day. Your reflections don't disappear — but new ones will need an upgrade.";
      } else if (daysRemaining === 2) {
        bannerMsg = "2 days left on your trial.";
      } else if (daysRemaining === 7) {
        const count = typeof used === "number" ? used : 0;
        bannerMsg = `You're halfway through your trial. ${count} reflection${count === 1 ? "" : "s"} in. Keep going — the mirror gets sharper.`;
      }
    }
    if (bannerMsg) {
      if (typeof window === "undefined") return;
      const todayKey = new Date().toISOString().slice(0, 10);
      const storageKey = `reflect_trial_banner_dismissed_${todayKey}`;
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(storageKey) === "true";
      } catch {
        dismissed = false;
      }
      if (!dismissed) {
        setTrialBannerMessage(bannerMsg);
        setShowTrialBanner(true);
      }
    } else {
      setShowTrialBanner(false);
    }
  }, [usage, user, authRequired]);

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

    // Guest gating: after 2 guest reflections, require sign-up before allowing another
    if (!user && getGuestCount() >= GUEST_MAX_REFLECTIONS) {
      setGuestSignupStage("hard_block");
      setShowGuestSignupModal(true);
      return;
    }

    setReflectTimeoutError(false);
    setIsReflectSubmitting(true);
    setAppState(STATES.LOADING);

    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), 90000);
    const warnTimeout = setTimeout(() => setIsSlowNetwork(true), 30000);

    try {
      const reflectionMode = getReflectionMode();
      const url = user ? `${API}/reflect` : `${API}/reflect/guest`;
      const config = user ? { headers: getAuthHeaders(), signal: controller.signal } : { signal: controller.signal };
      const response = await axios.post(url, {
        thought: thought.trim(),
        reflection_mode: reflectionMode,
      }, config);
      if (response.data.crisis) {
        setShowCrisisScreen(true);
        setAppState(STATES.INPUT);
        return;
      }
      try { localStorage.removeItem("reflect_draft"); } catch (_) {}
      setReflection({
        id: response.data.id ?? null,
        sections: response.data.sections,
        flowMode: response.data.flow_mode || "standard",
      });
      setAppState(STATES.REFLECTION);
    } catch (error) {
      if (axios.isCancel(error) || error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
        setReflectTimeoutError(true);
        setAppState(STATES.LOADING);
        return;
      }
      devError("Reflection error:", error);
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
      clearTimeout(hardTimeout);
      clearTimeout(warnTimeout);
      setIsSlowNetwork(false);
      setIsReflectSubmitting(false);
    }
  };

  const handleGetPersonalizedMirror = async (questionResponses, callbacks = {}) => {
    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), 90000);
    const warnTimeout = setTimeout(() => callbacks.onSlow?.(), 30000);
    try {
      const url = user ? `${API}/mirror/personalized` : `${API}/mirror/personalized/guest`;
      const config = user
        ? { headers: getAuthHeaders(), signal: controller.signal }
        : { signal: controller.signal };
      const response = await axios.post(url, {
        thought: thought.trim(),
        questions: questionResponses.map((r) => r.question),
        answers: questionResponses.map((r) => r.response),
        ...(user && reflection?.id && { reflection_id: reflection.id }),
      }, config);
      return response.data.content;
    } catch (error) {
      devError("Personalized mirror error:", error);
      if (axios.isCancel(error) || error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
        toast.error("This is taking longer than usual. Please try again.");
      } else {
        toast.error("We couldn't load your reflection. Try again.");
      }
      return null;
    } finally {
      clearTimeout(hardTimeout);
      clearTimeout(warnTimeout);
    }
  };

  const handleFetchMoodSuggestions = async (thought, mirrorText) => {
    try {
      const url = user ? `${API}/mood/suggest` : `${API}/mood/suggest/guest`;
      const config = user ? { headers: getAuthHeaders() } : {};
      const response = await axios.post(url, {
        thought: (thought || "").trim(),
        mirror_text: (mirrorText || "").trim() || undefined,
      }, config);
      return response.data.suggestions ?? [];
    } catch (error) {
      devError("Mood suggestions error:", error);
      return [];
    }
  };

  const handleGetClosing = async (moodWord, answers, personalizedMirror, callbacks = {}) => {
    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), 90000);
    const warnTimeout = setTimeout(() => callbacks.onSlow?.(), 30000);

    try {
      const url = user ? `${API}/closing` : `${API}/closing/guest`;
      const config = user ? { headers: getAuthHeaders(), signal: controller.signal } : { signal: controller.signal };
      const response = await axios.post(url, {
        thought: thought.trim(),
        answers: Array.isArray(answers) ? answers.map(a => a.response || a) : answers,
        mirror_response: personalizedMirror || "",
        mood_word: moodWord || null,
        ...(user && reflection?.id && { reflection_id: reflection.id }),
        reflection_mode: getReflectionMode(),
      }, config);

      if (response.data.crisis) {
        setShowCrisisScreen(true);
        return null;
      }
      const closing = response.data.closing_text;
      setClosingText(closing);
      return closing;
    } catch (error) {
      if (axios.isCancel(error) || error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
        toast.error("This is taking longer than usual. Please try again.");
      } else {
        devError("Closing generation error:", error);
        toast.error("We couldn't load your reflection. Try again.");
      }
      const fallback = "You showed up today. That matters. Between now and next time — notice what you're already carrying. It's worth your attention.";
      setClosingText(fallback);
      return fallback;
    } finally {
      clearTimeout(hardTimeout);
      clearTimeout(warnTimeout);
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
      devError("Mood submit error:", error);
      throw error; // MoodCheckIn will still show done state
    }
  };

  const handleReflectAnother = () => {
    setSaveError(false);
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
    savePayloadRef.current = { rawText, answers, mirrorResponse, moodWord, options };
    try {
      await performSaveHistory(rawText, answers, mirrorResponse, moodWord, user.id, options);
      setSaveError(false);
      refetchHistory();
    } catch (err) {
      devError("Save history error:", err);
      setSaveError(true);
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
      devError("Set reminder error:", error);
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
    setSaveError(false);
    setThought('');
    setReflection(null);
    setViewingReflectionId(null);
    setViewingSavedId(null);
    setAppState(STATES.INPUT);
  };

  const reflectionInsight = useMemo(() => {
    if (!historyAll || historyAll.length === 0) return null;
    const total = historyAll.length;

    const timeBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const item of historyAll) {
      if (!item.created_at) continue;
      const d = new Date(item.created_at);
      if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      if (h >= 5 && h <= 11) timeBuckets.morning++;
      else if (h >= 12 && h <= 16) timeBuckets.afternoon++;
      else if (h >= 17 && h <= 21) timeBuckets.evening++;
      else timeBuckets.night++;
      dayCounts[d.getDay()]++;
    }

    const timeOfDay = Object.entries(timeBuckets).sort((a, b) => b[1] - a[1])[0][0];
    const mostCommonDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const mostCommonDay = dayNames[mostCommonDayIdx];

    const POSITIVE = new Set(["calm", "grateful", "hopeful", "clear", "lighter", "proud", "relieved", "excited", "peaceful", "good"]);
    const HEAVY = new Set(["anxious", "tired", "sad", "frustrated", "overwhelmed", "stuck", "heavy", "lost", "numb", "scared", "angry"]);

    const classifyMood = (raw) => {
      const w = (raw || "").trim().toLowerCase();
      if (POSITIVE.has(w)) return "positive";
      if (HEAVY.has(w)) return "heavy";
      const words = w.split(/\s+/);
      for (const word of words) {
        if (POSITIVE.has(word)) return "positive";
        if (HEAVY.has(word)) return "heavy";
      }
      return "neutral";
    };
    const MOOD_COLORS = { positive: "#86EFAC", heavy: "#FCA5A5", neutral: "#FCD34D" };

    const withMood = historyAll.filter(i => (i.mood_word || "").trim()).slice(0, 5);
    const moodDots = withMood.map(i => {
      const cat = classifyMood(i.mood_word);
      return { color: MOOD_COLORS[cat], word: i.mood_word };
    });
    while (moodDots.length < 5) moodDots.push({ color: "#E2E8F0", word: null });

    let moodTrend = null;
    if (withMood.length >= 5) {
      const toScore = (w) => {
        const cat = classifyMood(w);
        return cat === "positive" ? 1 : cat === "heavy" ? -1 : 0;
      };
      const recent3 = withMood.slice(0, 3).map(i => toScore(i.mood_word));
      const prev2 = withMood.slice(3, 5).map(i => toScore(i.mood_word));
      const recentAvg = recent3.reduce((a, b) => a + b, 0) / 3;
      const prevAvg = prev2.reduce((a, b) => a + b, 0) / 2;
      if (recentAvg > prevAvg && recentAvg > 0) moodTrend = "lifting";
      else if (recentAvg < prevAvg && recentAvg < 0) moodTrend = "heavier lately";
      else moodTrend = "moving through it";
    }

    let observation;
    if (total >= 10 && moodTrend === "lifting") {
      observation = `${total} reflections. You show up most on ${mostCommonDay}s. The last few have been lighter.`;
    } else if (total >= 10 && moodTrend === "heavier lately") {
      observation = `${total} reflections. Something has been heavy lately. You keep showing up anyway.`;
    } else if (total >= 5 && timeOfDay === "evening") {
      observation = `${total} reflections. You tend to come here in the evening — when the day has had time to settle.`;
    } else if (total >= 5 && timeOfDay === "morning") {
      observation = `${total} reflections. You process things before the day starts. Most people wait until they have no choice.`;
    } else if (total >= 5) {
      observation = `${total} reflections. You're ${["a", "e", "i", "o", "u"].includes(timeOfDay[0]) ? "an" : "a"} ${timeOfDay} person.`;
    } else if (total === 4) {
      observation = "4 reflections. The mirror is getting sharper.";
    } else if (total === 3) {
      observation = "3 reflections. Something is starting to emerge.";
    } else if (total === 2) {
      observation = "2 reflections. Your pattern is just starting to take shape.";
    } else {
      observation = "1 reflection. Everyone starts somewhere.";
    }

    return { observation, moodDots, hasMoodData: withMood.length > 0 };
  }, [historyAll]);

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

  const dismissTrialBannerForToday = () => {
    if (typeof window === "undefined") return;
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const storageKey = `reflect_trial_banner_dismissed_${todayKey}`;
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
    setShowTrialBanner(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFDF7] flex items-center justify-center">
        <p className="text-sm text-[#718096]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDF7]" data-testid="app-container">
      <Analytics />
      <Toaster position="top-center" richColors />

      {/* Crisis screen: shown when crisis signals detected in user input */}
      <AnimatePresence>
        {showCrisisScreen && (
          <CrisisScreen
            onContinue={() => {
              setShowCrisisScreen(false);
              setThought("");
              setAppState(STATES.INPUT);
            }}
          />
        )}
      </AnimatePresence>

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

      {/* Guest sign-up modal for unauthenticated reflections */}
      <AnimatePresence>
        {showGuestSignupModal && guestSignupStage && (
          <GuestSignupModal
            stage={guestSignupStage}
            onSkip={
              guestSignupStage === "hard_block"
                ? undefined
                : () => {
                    setShowGuestSignupModal(false);
                    setGuestSignupStage(null);
                  }
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrialWelcome && (
          <TrialWelcomeModal onClose={() => setShowTrialWelcome(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrialExpiredModal && (
          <TrialExpiredModal
            onFallbackSettings={() => setSettingsPanelOpen(true)}
            onDismiss={() => setShowTrialExpiredModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Sign-in modal: shown at end of first reflection when user tries to save */}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        >
          <div
            className="relative w-full max-w-[380px] rounded-[24px] overflow-hidden"
            style={{ background: "#FDFAF6", padding: "40px 32px" }}
          >
            <div className="flex justify-center mx-auto">
              <AppLogo size="sm" />
            </div>
            <h2
              className="text-center mt-4"
              style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", color: "#2d3748" }}
            >
              Want to see your pattern over time?
            </h2>
            <p
              className="text-center mt-2"
              style={{ fontSize: "14px", color: "#718096", lineHeight: 1.6 }}
            >
              Sign in to unlock your full mirror and track how you think across reflections.
            </p>
            <p
              className="text-center"
              style={{ fontSize: 11, color: "#A0AEC0", marginBottom: 16 }}
            >
              Free for 14 days. No card required.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={async () => {
                  clearAuthError();
                  setSignInModalLoading(true);
                  try {
                    await signInWithGoogle();
                  } finally {
                    setSignInModalLoading(false);
                  }
                }}
                disabled={signInModalLoading}
                className="w-full h-[52px] flex items-center justify-center gap-3 rounded-[14px] border bg-white text-[#2d3748] font-medium transition-shadow disabled:opacity-60 hover:shadow-md"
                style={{
                  borderWidth: "1.5px",
                  borderColor: "#e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  fontSize: "15px",
                }}
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {signInModalLoading ? "Opening…" : "Continue with Google"}
              </button>
            </div>
            {authError && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center" role="alert">
                {authError}
              </p>
            )}
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
              className="block w-full mt-4 text-center text-[13px] text-[#a0aec0] hover:underline no-underline"
            >
              Maybe later
            </button>
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
              {reflectionInsight && historyAll.length > 0 && (
                <div style={{ padding: "12px 16px 8px 16px" }}>
                  <p style={{ fontSize: 11, color: "#718096", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
                    {reflectionInsight.observation}
                  </p>
                  {reflectionInsight.hasMoodData && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 8 }}>
                      {reflectionInsight.moodDots.map((dot, i) => (
                        <span
                          key={i}
                          title={dot.word || undefined}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: dot.color,
                            display: "inline-block",
                            cursor: dot.word ? "default" : undefined,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="min-h-0 max-h-[12rem] overflow-y-auto py-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                {historyLoading ? (
                  <p className="text-sm text-[#718096] py-4 px-4 text-center">Loading…</p>
                ) : !user ? (
                  <div className="py-4 px-4 flex flex-col items-center gap-3">
                    <p className="text-center" style={{ fontSize: 13, color: "#718096" }}>
                      Sign in to see your reflections and unlock your full mirror. Free for 14 days.
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
              {user && (
                <button
                  type="button"
                  onClick={() => { setBetaFeedbackPanelOpen(true); setHistoryDropdownOpen(false); }}
                  className="w-full text-left text-sm text-[#4A5568] hover:bg-[#FFB4A9]/10 rounded-lg px-3 py-2 transition-colors"
                >
                  Beta Feedback
                </button>
              )}
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
              usage={usage}
              onClose={() => setSettingsPanelOpen(false)}
              onOpenSignIn={() => { setSettingsPanelOpen(false); setShowSignInModal(true); }}
              onRefetchUsage={refetchUsage}
            />
        )}
      </AnimatePresence>

      {/* Beta Feedback panel */}
      <AnimatePresence>
        {betaFeedbackPanelOpen && (
          <BetaFeedbackPanel apiBase={API} onClose={() => setBetaFeedbackPanelOpen(false)} />
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

      {showTrialBanner && (
        <div className="sticky top-0 z-30 mx-auto max-w-2xl px-6 py-3 flex items-center justify-between gap-3 bg-[#FFB4A9]/20 text-[#4A5568] border-b border-[#FFB4A9]/30">
          <p className="text-sm">
            {trialBannerMessage}
          </p>
          <button
            type="button"
            onClick={dismissTrialBannerForToday}
            className="text-xs text-[#64748B] hover:text-[#2D3748]"
            aria-label="Dismiss trial banner"
          >
            Close
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
              returnCard={returnCard}
              onDismissReturnCard={() => setReturnCard(null)}
              isReturning={historyAll.length > 0}
              reflectionCount={historyAll.length}
            />
          )}

          {appState === STATES.LOADING && (
            <div
              className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
              style={{ background: "#FFFDF7" }}
              data-testid="loading-area"
            >
              {reflectTimeoutError ? (
                <>
                  <p className="text-center text-[#718096] text-sm" style={{ fontSize: 14 }}>
                    This is taking longer than usual.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReflectTimeoutError(false);
                      handleSubmit();
                    }}
                    className="text-[#2d3748] font-medium text-sm bg-transparent border-none cursor-pointer underline underline-offset-2 hover:opacity-80"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <>
                  {isSlowNetwork && (
                    <p
                      className="text-center text-[#718096]"
                      style={{ fontSize: 14 }}
                      data-testid="slow-network-banner"
                    >
                      This is taking a moment — still working on it.
                    </p>
                  )}
                  <LoadingState key="loading" />
                </>
              )}
            </div>
          )}

          {appState === STATES.REFLECTION && reflection && !viewingReflectionId && (
            <ReflectionErrorBoundary key="reflection-boundary" onReset={handleStartFresh}>
              <ReflectionFlow
                key="reflection"
                apiBase={API}
                accessToken={session?.access_token ?? null}
                sections={reflection.sections}
                originalThought={thought}
                reflectionId={reflection.id ?? null}
                flowMode={reflection?.flowMode || "standard"}
                onGetPersonalizedMirror={handleGetPersonalizedMirror}
                onFetchMoodSuggestions={handleFetchMoodSuggestions}
                onMoodSubmit={user ? handleMoodSubmit : undefined}
                onSaveHistory={user ? handleSaveHistory : undefined}
                onGetClosing={handleGetClosing}
                onComeBackLater={handleComeBackLater}
                onSetReminder={handleSetReminder}
                onReflectAnother={handleReflectAnother}
                onStartFresh={handleStartFresh}
                saveError={saveError}
                onRetrySave={() => {
                  setSaveError(false);
                  const p = savePayloadRef.current;
                  if (p) handleSaveHistory(p.rawText, p.answers, p.mirrorResponse, p.moodWord, p.options);
                }}
                onReflectionComplete={
                  user
                    ? undefined
                    : (data) => {
                        const payload = {
                          thought: data.thought,
                          mirror: data.mirror,
                          mood: data.mood,
                          closing: data.closing,
                          sections: reflection?.sections ?? [],
                        };
                        saveGuestReflectionToDb(API, payload).catch(() => {});
                        const count = saveGuestReflection({
                          thought: data.thought,
                          mirror: data.mirror,
                          mood: data.mood,
                          closing: data.closing,
                          created_at: new Date().toISOString(),
                        });
                        if (count === 1) {
                          setGuestSignupStage("soft");
                          setShowGuestSignupModal(true);
                        } else if (count === 2) {
                          setGuestSignupStage("firm");
                          setShowGuestSignupModal(true);
                        }
                      }
                }
              />
            </ReflectionErrorBoundary>
          )}
        </AnimatePresence>
      </main>

      <footer
        className="fixed bottom-0 left-0 right-0 px-6 text-center"
        style={{ background: "#FFFDF7", paddingTop: "12px", paddingBottom: "16px" }}
      >
        <p className="text-xs text-[#A0AEC0] tracking-wide" data-testid="footer-disclaimer">
          This is a reflection space, not therapy. If you're in crisis, please reach out to a mental health professional.
        </p>
      </footer>

      <CookieConsent />
    </div>
  );
}

export default App;
