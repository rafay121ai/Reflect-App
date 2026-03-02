import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
        if (session) {
          navigate("/", { replace: true });
        } else {
          navigate("/login", { replace: true });
        }
      } catch (_) {
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
