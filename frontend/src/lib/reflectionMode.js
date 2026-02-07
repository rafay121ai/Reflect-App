/**
 * Reflection Mode persistence and utilities.
 * 
 * Currently uses localStorage for persistence.
 * 
 * TODO: When Supabase Auth is added, replace localStorage calls with:
 *   - Read: fetch from user_settings table
 *   - Write: PATCH /api/user/settings { reflection_mode: value }
 */

const REFLECTION_MODE_KEY = "reflect_mode";

// Available modes with their characteristics
export const REFLECTION_MODES = {
  gentle: {
    id: "gentle",
    label: "Gentle",
    description: "Softer language, more breathing room",
    // Prompt modifiers applied in backend
  },
  direct: {
    id: "direct",
    label: "Direct",
    description: "Clearer mirroring, fewer words",
  },
  quiet: {
    id: "quiet",
    label: "Quiet",
    description: "Minimal response, more silence",
  },
};

export const DEFAULT_MODE = "gentle";

/**
 * Get the current reflection mode from storage.
 * @returns {string} Mode ID ("gentle" | "direct" | "quiet")
 */
export function getReflectionMode() {
  try {
    const stored = localStorage.getItem(REFLECTION_MODE_KEY);
    if (stored && REFLECTION_MODES[stored]) {
      return stored;
    }
  } catch (_) {
    // localStorage unavailable
  }
  return DEFAULT_MODE;
}

/**
 * Set the reflection mode in storage.
 * @param {string} mode - Mode ID ("gentle" | "direct" | "quiet")
 * @returns {boolean} Success
 * 
 * TODO: When auth is added, also call:
 *   await fetch(`${API}/user/settings`, {
 *     method: 'PATCH',
 *     body: JSON.stringify({ reflection_mode: mode })
 *   });
 */
export function setReflectionMode(mode) {
  if (!REFLECTION_MODES[mode]) {
    console.warn(`Invalid reflection mode: ${mode}`);
    return false;
  }
  try {
    localStorage.setItem(REFLECTION_MODE_KEY, mode);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Get all available modes as an array for UI rendering.
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export function getAvailableModes() {
  return Object.values(REFLECTION_MODES);
}
