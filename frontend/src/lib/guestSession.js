const GUEST_ID_KEY = "reflect_guest_id";
const GUEST_REFLECTIONS_KEY = "reflect_guest_reflections";
const GUEST_COUNT_KEY = "reflect_guest_count";

function safeParse(json, fallback) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function getOrCreateGuestId() {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = "guest_" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      window.localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function getGuestId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(GUEST_ID_KEY);
  } catch {
    return null;
  }
}

export function getGuestReflections() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_REFLECTIONS_KEY);
    if (!raw) return [];
    return safeParse(raw, []);
  } catch {
    return [];
  }
}

export function getGuestCount() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GUEST_COUNT_KEY);
    const n = Number.parseInt(raw ?? "0", 10);
    if (Number.isNaN(n) || n < 0) return 0;
    return Math.min(n, 2);
  } catch {
    return 0;
  }
}

function setGuestState(reflections, count) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_REFLECTIONS_KEY, JSON.stringify(reflections));
    window.localStorage.setItem(GUEST_COUNT_KEY, String(Math.min(Math.max(count, 0), 2)));
  } catch {
    // ignore storage errors
  }
}

export function saveGuestReflection(reflection) {
  if (!reflection) return getGuestCount();
  const list = getGuestReflections();
  const next = [...list];
  const id = reflection.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const createdAt =
    reflection.created_at ||
    new Date().toISOString();
  next.push({
    id,
    thought: reflection.thought ?? "",
    mirror: reflection.mirror ?? "",
    mood: reflection.mood ?? null,
    closing: reflection.closing ?? "",
    created_at: createdAt,
  });
  const count = Math.min(getGuestCount() + 1, 2);
  setGuestState(next, count);
  return count;
}

export function clearGuestSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_ID_KEY);
    window.localStorage.removeItem(GUEST_REFLECTIONS_KEY);
    window.localStorage.removeItem(GUEST_COUNT_KEY);
  } catch {
    // ignore
  }
}

export const GUEST_MAX_REFLECTIONS = 2;

/**
 * Save a completed guest reflection to the backend (in addition to localStorage).
 * Non-fatal on failure — localStorage remains the source of truth until migration.
 * @param {string} apiBaseUrl - e.g. getBackendUrl() + "/api"
 * @param {{ thought: string, sections: Array, mirror: string, mood?: string, closing?: string }} reflectionData
 */
export async function saveGuestReflectionToDb(apiBaseUrl, reflectionData) {
  if (!apiBaseUrl || !reflectionData) return;
  const guestId = getOrCreateGuestId();
  if (!guestId) return;
  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/reflect/guest-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_id: guestId,
        thought: reflectionData.thought || "",
        sections: Array.isArray(reflectionData.sections) ? reflectionData.sections : [],
        mirror: reflectionData.mirror || "",
        mood_word: reflectionData.mood || "",
        closing: reflectionData.closing || "",
      }),
    });
    if (!res.ok) {
      // Non-fatal; fallback to localStorage
    }
  } catch (e) {
    // Non-fatal; using localStorage only
  }
}

