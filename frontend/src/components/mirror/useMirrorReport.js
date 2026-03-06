import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Fetches the 4-slide mirror report from POST /api/mirror/report (auth) or /api/mirror/report/guest (guest).
 * Call when user has finished answering questions; report is ready by the time they tap the mirror.
 * Exposes error and retry so the UI can show "Try again" on failure.
 */
export function useMirrorReport(options) {
  const { enabled, apiBase, thought, questions, answers, reflectionId, accessToken } = options;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const hasFetchedRef = useRef(false);

  const retry = useCallback(() => {
    hasFetchedRef.current = false;
    setError(null);
    setReport(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!enabled || hasFetchedRef.current) return;
    if (!apiBase || !thought?.trim()) return;

    const answersArr = Array.isArray(answers) ? answers : [];
    if (answersArr.length === 0) return;

    hasFetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const isGuest = !accessToken;
    const base = apiBase.replace(/\/$/, "").replace(/\/api$/, "");
    const url = isGuest ? `${base}/api/mirror/report/guest` : `${base}/api/mirror/report`;
    const headers = { "Content-Type": "application/json" };
    if (!isGuest) headers["Authorization"] = `Bearer ${accessToken}`;

    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        thought: thought.trim(),
        questions: Array.isArray(questions) ? questions : [],
        answers: answersArr,
        reflection_id: reflectionId || "",
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          hasFetchedRef.current = false;
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, retryCount, apiBase, thought, questions, answers, reflectionId, accessToken]);

  return { report, loading, error, retry };
}
