/**
 * User identifier for saved reflections. localStorage until Supabase Auth is added.
 */

const USER_ID_KEY = "reflect_user_id";

function randomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateUserIdentifier() {
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id || !id.trim()) {
      id = randomId();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id.trim();
  } catch (_) {
    return randomId();
  }
}
