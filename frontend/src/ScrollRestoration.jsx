import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_THROTTLE_MS = 150;

/**
 * Global scroll restoration for React Router.
 * - New route / forward nav: scroll to top (smooth).
 * - Back/forward: restore previous scroll position for that pathname.
 * Renders nothing; runs only on location change. No extra deps.
 */
export default function ScrollRestoration() {
  const location = useLocation();
  const scrollPositions = useRef(Object.create(null));
  const throttleRef = useRef(null);
  const lastScrollRef = useRef(0);

  // Throttled scroll listener: save current pathname's scroll position
  useEffect(() => {
    const pathname = location.pathname;

    const saveScroll = () => {
      scrollPositions.current[pathname] = window.scrollY;
    };

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollRef.current >= SCROLL_THROTTLE_MS) {
        lastScrollRef.current = now;
        saveScroll();
      } else if (throttleRef.current == null) {
        throttleRef.current = setTimeout(() => {
          throttleRef.current = null;
          lastScrollRef.current = Date.now();
          saveScroll();
        }, SCROLL_THROTTLE_MS);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (throttleRef.current != null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, [location.pathname]);

  // On route change: restore saved position or scroll to top
  useEffect(() => {
    const pathname = location.pathname;
    const saved = scrollPositions.current[pathname];

    const apply = () => {
      if (typeof saved === "number" && saved > 0) {
        window.scrollTo(0, saved);
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      }
    };

    // Defer so the new route has rendered and layout is ready
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });

    return () => cancelAnimationFrame(id);
  }, [location.key, location.pathname]);

  return null;
}
