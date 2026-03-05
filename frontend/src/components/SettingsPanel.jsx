/**
 * Settings Panel for REFLECT
 *
 * Sections:
 * 1. Reflection Experience (Reflection Mode selector)
 * 2. Reminders & Notifications (daily nudge, time, check-ins, pause, insight letter)
 * 3. Privacy (export/delete placeholders)
 * 4. Account
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { X, Check, Download, Trash2, User, ChevronRight, Crown, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";
import { getReflectionMode, setReflectionMode, getAvailableModes, DEFAULT_MODE } from "../lib/reflectionMode";
import { getProfile, updateProfile, getAuthHeaders } from "../lib/api";
import { getBackendUrl } from "../lib/config";
import { supabase } from "../lib/supabase";
import { openCheckout, getLemonVariants } from "../lib/lemonSqueezy";

const DEFAULT_PREFS = {
  daily_reminder_enabled: false,
  daily_reminder_time: "09:00",
  check_ins_enabled: true,
  reminders_paused_until: null,
  insight_letter_notification_enabled: true,
  last_dismissed_letter_date: null,
};

// Section header component
const SectionHeader = ({ title, subtitle }) => (
  <div className="mb-4">
    <h3 className="text-sm font-medium text-[#4A5568]">{title}</h3>
    {subtitle && (
      <p className="text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>
    )}
  </div>
);

// Divider between sections
const SectionDivider = () => (
  <div className="border-t border-[#E2E8F0]/60 my-6" />
);

// Reflection mode selector
const ReflectionModeSelector = ({ currentMode, onChange }) => {
  const modes = getAvailableModes();
  
  return (
    <div className="space-y-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 text-left ${
            currentMode === mode.id
              ? "border-[#FFB4A9]/60 bg-[#FFFDF7]/60"
              : "border-[#E2E8F0]/60 hover:border-[#CBD5E1] bg-white/40"
          }`}
        >
          <div className="flex-1">
            <span className={`text-sm font-medium ${
              currentMode === mode.id ? "text-[#4A5568]" : "text-[#64748B]"
            }`}>
              {mode.label}
            </span>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              {mode.description}
            </p>
          </div>
          {currentMode === mode.id && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-5 h-5 rounded-full bg-[#FFB4A9]/80 flex items-center justify-center ml-3"
            >
              <Check className="w-3 h-3 text-white" />
            </motion.div>
          )}
        </button>
      ))}
    </div>
  );
};

// Toggle switch component
const Toggle = ({ enabled, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    disabled={disabled}
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
      enabled ? "bg-[#FFB4A9]" : "bg-[#E2E8F0]"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
        enabled ? "translate-x-[18px]" : "translate-x-[3px]"
      }`}
    />
  </button>
);

// Setting row with toggle
const ToggleRow = ({ label, sublabel, enabled, onChange, disabled, comingSoon }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1">
      <span className="text-sm text-[#4A5568]">{label}</span>
      {sublabel && (
        <p className="text-xs text-[#94A3B8]">{sublabel}</p>
      )}
      {comingSoon && (
        <span className="text-[10px] text-[#94A3B8] bg-[#F1F5F9] px-1.5 py-0.5 rounded ml-2">
          Coming soon
        </span>
      )}
    </div>
    <Toggle enabled={enabled} onChange={onChange} disabled={disabled || comingSoon} />
  </div>
);

// Action row (for buttons like export, delete)
const ActionRow = ({ icon: Icon, label, sublabel, onClick, danger, disabled, href, to, target }) => {
  const baseClass = `w-full flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0]/60 
    transition-all duration-200 text-left group
    ${danger 
      ? "hover:border-red-200 hover:bg-red-50/30" 
      : "hover:border-[#CBD5E1] hover:bg-[#F8FAFC]/50"
    }
    ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
  `;
  const iconClass = `w-8 h-8 rounded-lg flex items-center justify-center ${
    danger ? "bg-red-50 text-red-400" : "bg-[#F1F5F9] text-[#64748B]"
  }`;
  const content = (
    <>
      <div className={iconClass}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <span className={`text-sm ${danger ? "text-red-600" : "text-[#4A5568]"}`}>
          {label}
        </span>
        {sublabel && (
          <p className="text-xs text-[#94A3B8]">{sublabel}</p>
        )}
      </div>
      <ChevronRight className={`w-4 h-4 ${danger ? "text-red-300" : "text-[#CBD5E1]"} 
        group-hover:translate-x-0.5 transition-transform`} />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={baseClass}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target={target || undefined} rel={target === "_blank" ? "noopener noreferrer" : undefined} className={baseClass}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={baseClass}
    >
      {content}
    </button>
  );
};

// Main Settings Panel
const SettingsPanel = ({ apiBase, onClose, onOpenSignIn }) => {
  const { user, signOut } = useAuth();
  const {
    isSupported: isRevenueCatSupported,
    isPremium,
    loading: revenueCatLoading,
    error: revenueCatError,
    presentPaywall,
    presentCustomerCenter,
    restorePurchases,
  } = useRevenueCat();
  const [mode, setMode] = useState(DEFAULT_MODE);
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isNative = () => {
    try {
      const { Capacitor } = require("@capacitor/core");
      return Capacitor.isNativePlatform();
    } catch (_) {
      return false;
    }
  };
  const lemon = getLemonVariants();
  const showLemonOnWeb = !isNative() && lemon.isConfigured && user?.id;

  useEffect(() => {
    setMode(getReflectionMode());
  }, []);

  useEffect(() => {
    if (!user || !apiBase) {
      setPrefsLoaded(true);
      return;
    }
    getProfile(apiBase)
      .then((p) => {
        const prefsFromProfile = { ...DEFAULT_PREFS, ...(p.preferences || {}) };
        setPrefs(prefsFromProfile);
      })
      .catch(() => setPrefs({ ...DEFAULT_PREFS }))
      .finally(() => setPrefsLoaded(true));
  }, [user, apiBase]);

  const updatePrefs = useCallback(
    (next) => {
      const merged = { ...prefs, ...next };
      setPrefs(merged);
      if (!apiBase || !user) return;
      updateProfile(apiBase, { preferences: merged }).catch(() => {});
    },
    [prefs, apiBase, user]
  );

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setReflectionMode(newMode);
  };

  const handlePauseReminders = () => {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    updatePrefs({ reminders_paused_until: until.toISOString() });
  };

  const handleExportData = () => {
    alert("Export feature coming soon. Your data will be downloadable as JSON.");
  };

  const handleDeleteData = () => {
    alert("Delete feature coming soon. This will permanently remove all your reflections.");
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/user/account`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Delete failed");
      }
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (err) {
      console.error("Failed to delete account:", err);
      alert("Something went wrong. Please try again or contact support.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md max-h-[85vh] bg-[#FDFCFB] rounded-2xl shadow-xl 
          border border-[#E2E8F0]/60 overflow-hidden"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#FDFCFB]/95 backdrop-blur-sm px-5 py-4 
          border-b border-[#E2E8F0]/60 flex items-center justify-between">
          <h2 className="text-base font-medium text-[#4A5568]">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center 
              text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-5 py-5 overflow-y-auto max-h-[calc(85vh-60px)]">
          
          {/* Section 1: Reflection Experience */}
          <section>
            <SectionHeader 
              title="Reflection Experience" 
              subtitle="How I respond to your thoughts"
            />
            <ReflectionModeSelector 
              currentMode={mode} 
              onChange={handleModeChange} 
            />
          </section>

          <SectionDivider />

          {/* Section 2: Reminders & Notifications */}
          <section>
            <SectionHeader
              title="Reminders & Notifications"
              subtitle="Gentle nudges, no guilt"
            />
            {!prefsLoaded && user ? (
              <p className="text-xs text-[#94A3B8] py-2">Loading…</p>
            ) : (
              <div className="space-y-3">
                <ToggleRow
                  label="Daily reflection nudge"
                  sublabel="A quiet moment, if you want"
                  enabled={prefs.daily_reminder_enabled}
                  onChange={(v) => updatePrefs({ daily_reminder_enabled: v })}
                  disabled={!user}
                />
                {prefs.daily_reminder_enabled && (
                  <div className="flex items-center justify-between py-2 pl-1">
                    <span className="text-sm text-[#4A5568]">Reminder time</span>
                    <input
                      type="time"
                      value={prefs.daily_reminder_time || "09:00"}
                      onChange={(e) => updatePrefs({ daily_reminder_time: e.target.value || "09:00" })}
                      className="text-sm border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white"
                    />
                  </div>
                )}
                <ToggleRow
                  label="Warm check-ins"
                  sublabel="Occasional gentle nudges"
                  enabled={prefs.check_ins_enabled}
                  onChange={(v) => updatePrefs({ check_ins_enabled: v })}
                  disabled={!user}
                />
                {user && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handlePauseReminders}
                      className="text-sm text-[#94A3B8] hover:text-[#64748B] underline"
                    >
                      Pause reminders for 7 days
                    </button>
                  </div>
                )}
                <ToggleRow
                  label="Insight letter"
                  sublabel="When a new letter is ready"
                  enabled={prefs.insight_letter_notification_enabled}
                  onChange={(v) => updatePrefs({ insight_letter_notification_enabled: v })}
                  disabled={!user}
                />
              </div>
            )}
          </section>

          <SectionDivider />

          {/* Subscription (RevenueCat on native; Lemon Squeezy on web) */}
          <section>
            <SectionHeader
              title="Subscription"
              subtitle="Premium unlocks the full REFLECT experience"
            />
            {isRevenueCatSupported ? (
              <>
                {revenueCatError && (
                  <p className="text-xs text-amber-600 bg-amber-50/50 rounded-lg px-3 py-2 mb-3">
                    {revenueCatError}
                  </p>
                )}
                <div className="space-y-2">
                  <div className="p-4 rounded-xl bg-[#F8FAFC]/80 border border-[#E2E8F0]/40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#FFB4A9]/20 flex items-center justify-center">
                        <Crown className="w-5 h-5 text-[#FFB4A9]" />
                      </div>
                      <div>
                        {revenueCatLoading ? (
                          <p className="text-sm text-[#94A3B8]">Loading…</p>
                        ) : isPremium ? (
                          <>
                            <p className="text-sm font-medium text-[#4A5568]">Premium</p>
                            <p className="text-xs text-[#94A3B8]">You have full access</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-[#4A5568]">Free</p>
                            <p className="text-xs text-[#94A3B8]">Upgrade for more</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {!isPremium && (
                      <button
                        type="button"
                        onClick={() => presentPaywall().catch(() => {})}
                        className="w-full py-2.5 px-4 text-sm font-medium rounded-xl bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 border border-[#FFB4A9]/40 transition-colors"
                      >
                        Upgrade to Premium
                      </button>
                    )}
                    {isPremium && (
                      <button
                        type="button"
                        onClick={() => presentCustomerCenter().catch(() => {})}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm text-[#4A5568] rounded-xl border border-[#E2E8F0]/60 hover:bg-[#F8FAFC]/80 transition-colors"
                      >
                        Manage subscription
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setRestoring(true);
                        try {
                          await restorePurchases();
                        } finally {
                          setRestoring(false);
                        }
                      }}
                      disabled={restoring || revenueCatLoading}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[#94A3B8] hover:text-[#64748B] disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${restoring ? "animate-spin" : ""}`} />
                      Restore purchases
                    </button>
                  </div>
                </div>
              </>
            ) : showLemonOnWeb ? (
              <div className="space-y-2">
                <div className="p-4 rounded-xl bg-[#F8FAFC]/80 border border-[#E2E8F0]/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FFB4A9]/20 flex items-center justify-center">
                      <Crown className="w-5 h-5 text-[#FFB4A9]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#4A5568]">Free</p>
                      <p className="text-xs text-[#94A3B8]">Upgrade for more reflections</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openCheckout(
                      {
                        variantId: lemon.variantMonthly || lemon.variantYearly,
                        userId: user?.id,
                        userEmail: user?.email || "",
                      },
                      (err) => err && window.alert?.(err)
                    )
                  }
                  className="w-full py-2.5 px-4 text-sm font-medium rounded-xl bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 border border-[#FFB4A9]/40 transition-colors"
                >
                  Upgrade to Premium
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#F8FAFC]/80 border border-[#E2E8F0]/40">
                <p className="text-sm text-[#64748B]">
                  In-app subscriptions are available in the REFLECT app for iOS and Android. Open the app on your device to upgrade or manage your subscription.
                </p>
              </div>
            )}
          </section>

          <SectionDivider />

          {/* Section 3: Privacy */}
          <section>
            <SectionHeader 
              title="Privacy" 
              subtitle="Your data belongs to you"
            />
            <div className="space-y-2">
              <ActionRow
                icon={ChevronRight}
                label="Privacy Policy"
                sublabel="How we use and protect your data"
                href="https://reflect-web-one.vercel.app/privacy.html"
                target="_blank"
              />
              <ActionRow
                icon={ChevronRight}
                label="Terms of Service"
                sublabel="Terms of using REFLECT"
                href="https://reflect-web-one.vercel.app/terms.html"
                target="_blank"
              />
              <ActionRow
                icon={Download}
                label="Export your data"
                sublabel="Download all reflections as JSON"
                onClick={handleExportData}
                disabled
              />
              <ActionRow
                icon={Trash2}
                label="Delete all data"
                sublabel="Permanently remove everything"
                onClick={handleDeleteData}
                danger
                disabled
              />
            </div>
          </section>

          <SectionDivider />

          {/* Section 4: Account */}
          <section>
            <SectionHeader 
              title="Account" 
            />
            <div className="p-4 rounded-xl bg-[#F8FAFC]/80 border border-[#E2E8F0]/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFB4A9]/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-[#FFB4A9]" />
                </div>
                <div className="flex-1">
                  {user ? (
                    <>
                      <p className="text-sm text-[#4A5568]">
                        {user.email || user.user_metadata?.email || "Signed in"}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        Your data is private and stored per account
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[#4A5568]">Local Mode</p>
                      <p className="text-xs text-[#94A3B8]">
                        Your reflections stay on this device
                      </p>
                    </>
                  )}
                </div>
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={() => { signOut(); onClose(); }}
                  className="mt-3 w-full py-2 text-sm text-[#94A3B8] hover:text-[#64748B] rounded-lg hover:bg-[#F1F5F9]/60 transition-colors"
                >
                  Sign out
                </button>
              ) : onOpenSignIn ? (
                <button
                  type="button"
                  onClick={() => { onOpenSignIn(); onClose(); }}
                  className="mt-3 w-full py-2.5 text-sm font-medium text-[#4A5568] bg-[#FFB4A9]/20 hover:bg-[#FFB4A9]/30 rounded-lg transition-colors"
                >
                  Sign in
                </button>
              ) : null}
            </div>
          </section>

          {/* Danger Zone — Delete Account (required by Apple) */}
          {user ? (
            <div className="mt-10 pt-6 border-t border-[#E2E8F0]/60">
              <p className="text-[12px] text-[#94A3B8] mb-3">Danger Zone</p>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="w-full py-2.5 px-4 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50/30 transition-colors"
                >
                  Delete My Account
                </button>
              ) : (
                <div>
                  <p className="text-sm text-red-600/90 mb-3">
                    This will permanently delete your account and all reflections. This cannot be undone.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="py-2 px-4 text-sm rounded-lg bg-red-100 border border-red-300 text-red-700 hover:bg-red-200/80 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Yes, delete everything"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeleting(false); }}
                      className="py-2 px-4 text-sm text-[#64748B] hover:text-[#4A5568]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer note */}
          <p className="text-[10px] text-[#94A3B8] text-center mt-6">
            REFLECT v1.0 — Made with care
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SettingsPanel;
