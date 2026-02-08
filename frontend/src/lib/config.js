/**
 * Backend URL: on Vercel (production or preview) always use Railway; otherwise use env or localhost.
 * Prioritizing Vercel detection ensures the deployed app always uses Railway even if built with localhost in .env.
 */
const RAILWAY_BACKEND_URL = "https://reflect-app-production.up.railway.app";

export function getBackendUrl() {
  if (typeof window !== "undefined" && window.location?.hostname?.includes("vercel.app")) {
    return RAILWAY_BACKEND_URL;
  }
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL.replace(/\/$/, "");
  }
  return "http://localhost:8000";
}
