"use client";

import { useEffect, useMemo, useState } from "react";

export function AnimatedStatValue({ value }: { value: string }) {
  const parsed = useMemo(() => parseCountValue(value), [value]);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!parsed) return;
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = window.requestAnimationFrame(() => setDisplay(parsed.target));
      return () => window.cancelAnimationFrame(frame);
    }

    const duration = 600;
    const startedAt = performance.now();

    function tick(now: number) {
      if (!parsed) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(parsed.target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [parsed]);

  if (!parsed) return value;

  return (
    <>
      <span aria-hidden="true">
        {display}
        {parsed.suffix}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}

function parseCountValue(value: string) {
  const match = value.match(/^(\d+)(\s*%)?$/);
  if (!match) return null;
  return {
    target: Number(match[1]),
    suffix: match[2] ?? "",
  };
}
