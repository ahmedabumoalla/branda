"use client";

import { motion, useInView, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { menuMotion, menuSprings, shouldAnimateMenu } from "@/lib/menu/motion-foundations";
import s from "./bistro-menu.module.css";

/** A closing signature that keeps its content visible without motion or JavaScript */
export function MenuSignature() {
  const element = useRef<HTMLElement>(null);
  const inView = useInView(element, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || !shouldAnimateMenu()) return;
    const animations = Array.from(element.current?.querySelectorAll<HTMLElement>("[data-signature-part]") ?? []).map((part, index) => part.animate([
      { transform: `translateY(${menuMotion.distance.large}px)`, opacity: 0.35 },
      { transform: "translateY(0)", opacity: 1 },
    ], { duration: menuMotion.duration.slow * 1000, delay: index * menuMotion.stagger * 1000, easing: `cubic-bezier(${menuMotion.easing.join(",")})` }));
    return () => animations.forEach((animation) => animation.cancel());
  }, [inView, reduce]);
  return <section ref={element} className={s.signature} aria-label="Double B Bistro">
    <span className={s.signatureArch} aria-hidden="true" />
    <p className={s.signatureEyebrow} data-signature-part dir="ltr">BREAKFAST &amp; BRUNCH</p>
    <a href="#menu-catalog" className={s.signatureName} aria-label="العودة إلى أصناف دبل بي" data-signature-part dir="ltr">Double <i>B</i></a>
    <p className={s.signatureMessage} data-signature-part>لحظتك أحلى مع دبل بي</p>
    <a href="#menu-catalog" className={s.signatureReturn} data-signature-part><span>نرجع لشي تشتهيه</span><span aria-hidden="true">↑</span></a>
  </section>;
}

/** Static SSR content first; reveal never gates image loading or interaction */
export function DishMotion({ id, children }: { id: string; children: ReactNode }) {
  const element = useRef<HTMLElement>(null);
  const inView = useInView(element, { once: true, amount: 0.1 });
  const reduce = useReducedMotion();
  const rotateX = useSpring(0, menuSprings.gentle);
  const rotateY = useSpring(0, menuSprings.gentle);
  useEffect(() => {
    if (!inView || !shouldAnimateMenu()) return;
    const photo = element.current?.querySelector<HTMLElement>(`[data-dish-photo]`);
    const animation = photo?.animate([
      { transform: `translateY(${menuMotion.distance.normal}px) scale(.97)`, opacity: 0.8 },
      { transform: "translateY(0) scale(1)", opacity: 1 },
    ], { duration: menuMotion.duration.slow * 1000, easing: `cubic-bezier(${menuMotion.easing.join(",")})` });
    return () => animation?.cancel();
  }, [inView, reduce]);
  function move(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || !shouldAnimateMenu()) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    rotateX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * menuMotion.tilt * 2);
    rotateY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * menuMotion.tilt * 2);
  }
  return <motion.article ref={element} className={s.product} data-product-id={id} initial={false}
    style={{ rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY, transformPerspective: 900 }}
    onPointerMove={move} onPointerLeave={() => { rotateX.set(0); rotateY.set(0); }}
    whileTap={reduce ? undefined : { scale: menuMotion.scale.press }} transition={menuSprings.snappy}>
    {children}
  </motion.article>;
}
