"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export const homeMotion = {
  duration: { fast: .18, normal: .4, slow: .8 },
  ease: [.22, 1, .36, 1] as [number, number, number, number],
  distance: 28,
  tilt: 5,
  stagger: .09,
};

export const homeSprings = {
  perspective: { stiffness: 120, damping: 24, mass: .8 },
};

export function useHomeMotion(paused: boolean) {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [available, setAvailable] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setAvailable(!navigator.hardwareConcurrency || navigator.hardwareConcurrency > 4);
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const active = available && visible && !reduced && !paused;
  useEffect(() => {
    if (!active || !root.current || !("IntersectionObserver" in window)) return;
    const elements = [...root.current.querySelectorAll<HTMLElement>("[data-reveal]")];
    const animations: ReturnType<typeof animate>[] = [];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (!entry.isIntersecting || element.dataset.revealed) continue;
        element.dataset.revealed = "true";
        animations.push(animate(element, { opacity: [0, 1], y: [homeMotion.distance, 0] }, {
          duration: homeMotion.duration.slow,
          ease: homeMotion.ease,
          delay: Math.min(Number(element.dataset.delay) || 0, 4) * homeMotion.stagger,
        }));
        observer.unobserve(element);
      }
    }, { threshold: .12 });
    elements.forEach(element => observer.observe(element));
    return () => {
      observer.disconnect();
      animations.forEach(animation => animation.stop());
      elements.forEach(element => { element.style.removeProperty("opacity"); element.style.removeProperty("transform"); });
    };
  }, [active]);

  return { root, active, reduced: Boolean(reduced) };
}
