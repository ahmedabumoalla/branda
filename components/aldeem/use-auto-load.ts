"use client";

import { useEffect, useRef } from "react";

/** Start only the entered view's read; cancel the discarded Strict Mode setup. */
export function useAldeemAutoLoad(load: () => void | Promise<void>, enabled = true, viewKey = "") {
  const latest = useRef(load);
  useEffect(() => { latest.current = load; }, [load]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    queueMicrotask(() => { if (active) void latest.current(); });
    return () => { active = false; };
  }, [enabled, viewKey]);
}
