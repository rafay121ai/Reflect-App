import { useState, useEffect, useRef, useCallback } from "react";

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
    console.log("[mirror] effect ran", {
      enabled,
      hasFetched: hasFetchedRef.current,
      answersKey,
      thought: thought?.slice(0, 30),
    });

    if (!enabled || hasFetchedRef.current) {
      console.log("[mirror] bailed — enabled:", enabled, "hasFetched:", hasFetchedRef.current);
      return;
    }
    if (!apiBase || !thought?.trim()) {
      console.log("[mirror] bailed — missing apiBase or thought");
      return;
    }

    console.log("[mirror] FIRING FETCH, answers:", answersKey);

    const answersArr = Array.isArray(answers) ? answers : [];
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
        console.log("[mirror] fetch succeeded", data);
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        console.error("[mirror] fetch failed", err);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryCount, apiBase, thought, questionsKey, answersKey, reflectionId, accessToken]);

  return { report, loading, error, retry };
}