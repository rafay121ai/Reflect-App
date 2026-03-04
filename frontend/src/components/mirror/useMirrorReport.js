import { useState, useEffect } from "react";

/**
 * Fetches the 4-slide mirror report from POST /api/mirror/report (auth) or /api/mirror/report/guest (guest).
 * Call when user has finished answering questions; report is ready by the time they tap the mirror.
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

  useEffect(() => {
    if (!enabled || !apiBase || !thought?.trim()) return;
    const answersArr = Array.isArray(answers) ? answers : [];
    if (answersArr.length === 0) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const isGuest = !accessToken;
    const base = apiBase.replace(/\/$/, "").replace(/\/api$/, "");
    const url = isGuest
      ? `${base}/api/mirror/report/guest`
      : `${base}/api/mirror/report`;

    console.log("[useMirrorReport] fetching:", url, "isGuest:", isGuest);

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
        console.log("[useMirrorReport] response:", data);
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        console.warn("[useMirrorReport] failed:", err);
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { report, isLoading, error };
}
