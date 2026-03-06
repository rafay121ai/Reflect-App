import { useState, useEffect, useRef, useCallback } from "react";

export function useMirrorReport(options) {
  const { enabled, apiBase, thought, questions, answers, reflectionId, accessToken } = options;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSlow, setIsSlow] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const hasFetchedRef = useRef(false);

  const retry = useCallback(() => {
    hasFetchedRef.current = false;
    setError(null);
    setReport(null);
    setRetryCount((c) => c + 1);
  }, []);

  // Reset when reflectionId changes so a new reflection always fetches fresh
  useEffect(() => {
    hasFetchedRef.current = false;
    setReport(null);
    setError(null);
  }, [reflectionId]);

  // Serialize arrays to stable strings so they don't cause referential re-runs
  const answersKey = Array.isArray(answers) ? answers.join("||") : "";
  const questionsKey = Array.isArray(questions) ? questions.join("||") : "";

  useEffect(() => {
    if (!enabled || hasFetchedRef.current) return;
    if (!apiBase || !thought?.trim()) return;

    const answersArr = Array.isArray(answers) ? answers : [];
    hasFetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), 90000);
    const warnTimeout = setTimeout(() => setIsSlow(true), 30000);

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
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          if (data.crisis) {
            setError({ crisis: true });
          } else {
            setReport(data);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          hasFetchedRef.current = false;
          if (err.name === "AbortError") {
            setError({ timeout: true });
          } else {
            setError(err);
          }
        }
      })
      .finally(() => {
        clearTimeout(hardTimeout);
        clearTimeout(warnTimeout);
        setIsSlow(false);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(hardTimeout);
      clearTimeout(warnTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryCount, apiBase, thought, questionsKey, answersKey, reflectionId, accessToken]);

  return { report, loading, error, retry, isSlow };
}