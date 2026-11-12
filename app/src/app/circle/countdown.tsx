"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarStarIcon } from "@phosphor-icons/react";
import { ProgressBar } from "@/components/ui/progress-bar";

/** Current time in ms, updated every `everyMs`. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function formatLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/**
 * Time left in the current round and how far through it we are. `onEnd` fires
 * once when the round closes, so the page can refetch the new round.
 */
export function RoundCountdown({
  startMs,
  endMs,
  onEnd,
}: {
  startMs: number | null;
  endMs: number | null;
  onEnd?: () => void;
}) {
  const now = useNow();
  const fired = useRef<number | null>(null);
  const live = startMs !== null && endMs !== null;
  const left = live ? endMs - now : 0;

  useEffect(() => {
    if (live && left <= 0 && fired.current !== endMs) {
      fired.current = endMs;
      // Chain time lags the device clock a little; give the block a moment.
      const t = setTimeout(() => onEnd?.(), 3000);
      return () => clearTimeout(t);
    }
  }, [live, left, endMs, onEnd]);

  const pct = live ? ((now - startMs) / (endMs - startMs)) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 flex items-center gap-2">
        <CalendarStarIcon size={24} className="text-primary-blue" aria-hidden />
        Time left in this round
      </p>
      <p className="m-0 font-breadDisplay text-3xl font-black" aria-live="polite">
        {live ? (left > 0 ? formatLeft(left) : "Round closed") : "–"}
      </p>
      <ProgressBar value={pct} label="Round progress" />
    </div>
  );
}
