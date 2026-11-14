"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { menuMotion, shouldAnimateMenu } from "@/lib/menu/motion-foundations";

/** Content remains visible during SSR, with JavaScript disabled, and on slow devices */
export function useFawaselMotion() {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!root.current || !shouldAnimateMenu() || !('IntersectionObserver' in window)) return;
    const active = new Set<AnimationPlaybackControls>();
    const elements = Array.from(root.current.querySelectorAll<HTMLElement>('[data-fawasel-reveal]'));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        if (!shouldAnimateMenu()) continue;
        const control = animate(element, { opacity: [0.6, 1], y: [menuMotion.distance.normal, 0] }, { duration: menuMotion.duration.slow, ease: menuMotion.easing });
        active.add(control);
        void control.then(() => active.delete(control));
      }
    }, { threshold: 0.08 });
    elements.forEach(element => observer.observe(element));
    return () => { observer.disconnect(); active.forEach(control => control.stop()); elements.forEach(element => { element.style.removeProperty('transform'); element.style.removeProperty('opacity'); }); };
  }, [reduce]);
  return root;
}
