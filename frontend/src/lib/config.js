/**
 * Backend URL: use env if set; on Vercel (production or preview) fall back to Railway so
 * requests don't go to localhost when REACT_APP_BACKEND_URL wasn't set for that build.
 */
const RAILWAY_BACKEND_URL = "https://reflect-app-production.up.railway.app";

export function getBackendUrl() {
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.hostname?.includes("vercel.app")) {
    return RAILWAY_BACKEND_URL;
  }
  return "http://localhost:8000";
}
