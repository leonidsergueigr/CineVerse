"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const SPLASH_SESSION_KEY = "cineverse:splash:v1";
const SPLASH_DURATION_MS = 2_700;
const REDUCED_MOTION_DURATION_MS = 700;
const EXIT_DURATION_MS = 420;

export function CineVerseSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setExiting(true);

    if (removeTimer.current) clearTimeout(removeTimer.current);
    removeTimer.current = setTimeout(() => setVisible(false), EXIT_DURATION_MS);
  }, []);

  useEffect(() => {
    let alreadyShown = false;

    try {
      alreadyShown = window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "shown";
    } catch {
      // The splash remains usable when storage is blocked by the browser.
    }

    if (alreadyShown) {
      const hideTimer = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(hideTimer);
    }

    try {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "shown");
    } catch {
      // A failed write only means the intro may replay after a hard reload.
    }

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    exitTimer.current = setTimeout(
      dismiss,
      reducedMotion ? REDUCED_MOTION_DURATION_MS : SPLASH_DURATION_MS,
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      root.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [dismiss]);

  useEffect(() => {
    if (!visible) document.documentElement.style.overflow = "";
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`cineverse-splash${exiting ? " is-exiting" : ""}`}
      role="status"
      aria-label="CineVerse se lance"
    >
      <button
        type="button"
        className="cineverse-splash__skip"
        onClick={dismiss}
        aria-label="Passer l'introduction"
        title="Passer l'introduction"
      >
        <X aria-hidden="true" size={20} strokeWidth={1.8} />
      </button>

      <div className="cineverse-splash__stage" aria-hidden="true">
        <svg
          className="cineverse-splash__mark"
          viewBox="0 0 300 300"
          focusable="false"
        >
          <path
            className="cineverse-splash__ribbon"
            pathLength="1"
            d="M-32-18C9 1 20 31 39 50 51 63 63 67 82 71"
          />
          <path
            className="cineverse-splash__c"
            pathLength="1"
            d="M213 73A94 94 0 1 0 213 227"
          />
          <circle
            className="cineverse-splash__pulse pulse-one"
            cx="150"
            cy="150"
            r="48"
          />
          <circle
            className="cineverse-splash__pulse pulse-two"
            cx="150"
            cy="150"
            r="48"
          />
          <path
            className="cineverse-splash__play"
            d="M127 105 207 150 127 195Z"
          />
        </svg>

        <div className="cineverse-splash__signature">
          <span className="cineverse-splash__wordmark">
            Cine<span>Verse</span>
          </span>
          <span className="cineverse-splash__tagline">
            Votre cinema. Vos profils. Vos choix.
          </span>
        </div>
      </div>
    </div>
  );
}
