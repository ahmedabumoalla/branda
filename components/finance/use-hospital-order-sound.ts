"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useHospitalOrderSound(noticeId: string | undefined) {
  const context = useRef<AudioContext | null>(null);
  const [status, setStatus] = useState<"needs-gesture" | "on" | "muted" | "unavailable">("needs-gesture");
  const arm = useCallback(async () => {
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) { setStatus("unavailable"); return; }
      context.current ??= new Audio();
      await context.current.resume();
      setStatus(context.current.state === "running" ? "on" : "needs-gesture");
    } catch { setStatus("needs-gesture"); }
  }, []);
  useEffect(() => {
    const unlock = () => { document.removeEventListener("pointerdown", unlock); document.removeEventListener("keydown", unlock); void arm(); };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock); document.removeEventListener("keydown", unlock);
      if (context.current) { void context.current.close().catch(() => {}); context.current = null; }
    };
  }, [arm]);
  useEffect(() => {
    if (!noticeId || status !== "on") return;
    const oscillators = new Set<OscillatorNode>();
    const ring = () => {
      const ctx = context.current;
      if (!ctx || ctx.state !== "running") return;
      [880, 1174, 880, 1568].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + index * .24;
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.38, start + .025); gain.gain.exponentialRampToValueAtTime(.001, start + .2);
        oscillator.connect(gain); gain.connect(ctx.destination); oscillators.add(oscillator);
        oscillator.onended = () => { oscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + .22);
      });
    };
    ring(); const timer = setInterval(ring, 8000);
    return () => { clearInterval(timer); oscillators.forEach(oscillator => { try { oscillator.stop(); } catch { /* Already ended */ } }); };
  }, [noticeId, status]);
  return { status, arm, mute: () => setStatus("muted") };
}
