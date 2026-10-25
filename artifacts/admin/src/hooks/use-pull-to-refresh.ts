import * as React from "react";

const MAX_PULL_PX = 110;
const TRIGGER_PX = 45; // how far the page has moved (after damping) for letting go to refresh

/**
 * Pull down from the top of the page (touch screens) to refresh. Returns how far the user has pulled
 * and whether a refresh is running, so the page can show a spinner. Does nothing with a mouse.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const start = React.useRef<number | null>(null);
  const pullRef = React.useRef(0);
  const busy = React.useRef(false);
  const refreshRef = React.useRef(onRefresh);
  refreshRef.current = onRefresh;

  const run = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      await refreshRef.current();
    } finally {
      // Keep the spinner visible long enough to be noticed.
      setTimeout(() => {
        busy.current = false;
        setRefreshing(false);
      }, 500);
    }
  }, []);

  React.useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !busy.current && e.touches.length === 1) start.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      pullRef.current = Math.min(dy * 0.5, MAX_PULL_PX);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (start.current === null) return;
      const shouldRefresh = pullRef.current >= TRIGGER_PX;
      start.current = null;
      pullRef.current = 0;
      setPull(0);
      if (shouldRefresh) void run();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [run]);

  return { pull, refreshing, refresh: run, triggerPx: TRIGGER_PX };
}
