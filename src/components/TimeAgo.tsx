"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "@/lib/format";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

// The current time, rounded down to the minute so it is stable between
// ticks. It is null while the page is prerendered, because the server's
// clock is not the reader's.
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => null,
  );
}

// "5 min ago", kept current while the page stays open.
export function TimeAgo({ at }: { at: number }) {
  const now = useNow();
  if (now === null) return null;
  return (
    <time dateTime={new Date(at).toISOString()}>
      {timeAgo(at, Math.max(now, at))}
    </time>
  );
}
