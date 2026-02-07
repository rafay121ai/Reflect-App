/**
 * Auth token for API requests. Set by AuthContext when session changes.
 * Used to attach Authorization: Bearer <token> to backend requests.
 */
let currentAccessToken = null;

export function setAuthToken(token) {
  currentAccessToken = token;
}

export function getAuthHeaders() {
  if (!currentAccessToken) return {};
  return { Authorization: `Bearer ${currentAccessToken}` };
}

/**
 * Profile API helpers. Pass your API base (e.g. `${BACKEND_URL}/api`).
 */

/** GET /api/user/profile – returns { user_id, email, display_name, preferences, updated_at } or throws on 404/5xx */
export async function getProfile(apiBase) {
  const res = await fetch(`${apiBase}/user/profile`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Profile ${res.status}`);
  }
  return res.json();
}

/** POST /api/user/profile/sync – sync from Auth (email, name), returns profile. Call after login. */
export async function syncProfile(apiBase) {
  const res = await fetch(`${apiBase}/user/profile/sync`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Sync ${res.status}`);
  }
  return res.json();
}

/** PATCH /api/user/profile – update display_name and/or preferences. */
export async function updateProfile(apiBase, { display_name, preferences }) {
  const res = await fetch(`${apiBase}/user/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ display_name, preferences }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Update ${res.status}`);
  }
  return res.json();
}

/** GET /api/user/reflected-today – { reflected_today: boolean } (UTC). */
export async function getReflectedToday(apiBase) {
  const res = await fetch(`${apiBase}/user/reflected-today`, { headers: getAuthHeaders() });
  if (!res.ok) return { reflected_today: false };
  return res.json();
}
