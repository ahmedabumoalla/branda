export const menuMotion = {
  duration: { fast: 0.18, normal: 0.35, slow: 0.6 },
  easing: [0.22, 1, 0.36, 1] as [number, number, number, number],
  distance: { small: 8, normal: 16, large: 24 },
  scale: { press: 0.98, photo: 1.045 },
  tilt: 3,
  stagger: 0.08,
};

export const menuSprings = {
  snappy: { type: "spring" as const, stiffness: 360, damping: 32 },
  gentle: { type: "spring" as const, stiffness: 150, damping: 22 },
};

export function shouldAnimateMenu() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return typeof navigator === "undefined" || !navigator.hardwareConcurrency || navigator.hardwareConcurrency > 4;
}
