import { useState, useEffect, useRef } from "react";

/**
 * Fetches the 4-slide mirror report from POST /api/mirror/report (auth) or /api/mirror/report/guest (guest).
 * Call when user has finished answering questions; report is ready by the time they tap the mirror.
 * Uses a ref guard so the fetch runs only once per reflection, regardless of re-renders.
 */
export function useMirrorReport({
  apiBase,
  thought,
  questions,
  answers,
  reflectionId,
  accessToken,
  enabled = false,
}) {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasFetchedRef.current) return;
    if (!apiBase || !thought?.trim()) return;

    const answersArr = Array.isArray(answers) ? answers : [];
    if (answersArr.length === 0) return;

    hasFetchedRef.current = true;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const isGuest = !accessToken;
    const base = apiBase
      .replace(/\/$/, "")
      .replace(/\/api$/, "");
    const url = isGuest
      ? `${base}/api/mirror/report/guest`
      : `${base}/api/mirror/report`;

    const headers = { "Content-Type": "application/json" };
    if (!isGuest) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

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
          setError(err);
          hasFetchedRef.current = false;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { report, isLoading, error };
}
