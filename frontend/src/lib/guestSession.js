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
    window.localStorage.removeItem(GUEST_REFLECTIONS_KEY);
    window.localStorage.removeItem(GUEST_COUNT_KEY);
  } catch {
    // ignore
  }
}

export const GUEST_MAX_REFLECTIONS = 2;

