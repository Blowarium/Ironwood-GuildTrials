"use client";

import { useEffect, useState } from "react";
import { weekNowLeftPercent } from "@/lib/trial-schedule";

const NOW_TICK_MS = 30_000;

export function WeekNowLine({ weekStart }: { weekStart: string }) {
  const [leftPercent, setLeftPercent] = useState<number | null>(() =>
    weekNowLeftPercent(weekStart),
  );

  useEffect(() => {
    const tick = () => setLeftPercent(weekNowLeftPercent(weekStart));
    tick();
    const id = window.setInterval(tick, NOW_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [weekStart]);

  if (leftPercent === null) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 -translate-x-1/2 bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]"
      style={{ left: `${leftPercent}%` }}
      aria-hidden
    />
  );
}
