import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getGuestReflections, clearGuestSession } from "../lib/guestSession";
import { getBackendUrl } from "../lib/config";

const API_BASE = `${getBackendUrl()}/api`;

export default function AuthCallback() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session) {
          navigate("/login", { replace: true });
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const isNewTrialUser = params.get("trial") === "true";

        if (isNewTrialUser) {
          try {
            const guestReflections = getGuestReflections();
            if (guestReflections.length > 0) {
              await fetch(`${API_BASE}/migrate-guest-reflections`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ reflections: guestReflections }),
              }).catch(() => {});
              clearGuestSession();
            }
          } catch {
            // migration is best-effort; proceed regardless
          }
          navigate("/?welcome=trial", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#FFFDF7] flex items-center justify-center">
      <p className="text-sm text-[#718096]">Signing you in…</p>
    </div>
  );
}
