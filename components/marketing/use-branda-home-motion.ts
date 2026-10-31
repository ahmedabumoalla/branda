"use client";

import { useEffect, type RefObject } from "react";
import { animate } from "motion/react";
import s from "./branda-home.module.css";

// Timings measured from the requested reference; scoped to the marketing page.
export const homeMotion = {
  ease: [0.22, 0.8, 0.3, 1] as const,
  reveal: 0.75,
  revealDistance: 28,
  count: 1.5,
  featureStagger: [0, 0, 0.16, 0.08, 0.16, 0.08, 0.16, 0, 0, 0.08, 0.16, 0, 0.08, 0.16, 0, 0.08],
  resultStagger: 0.06,
};

export function useBrandaHomeMotion(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    let teardown = () => {};

    function setup() {
      teardown();
      if (!page) return;
      document.documentElement.style.scrollBehavior = reduced.matches ? "auto" : "smooth";
      const stops: (() => void)[] = [];
      const elements = [...page.querySelectorAll<HTMLElement>([
        s.sectionHeading, s.feature, s.center, s.without, s.withBranda,
        s.versus, s.appPanel, s.comparison, s.helpChoosing, s.contactPanel, s.faqList,
      ].map(name => `.${name}`).join(",") + `,.${s.outcomes}>article,.${s.faqGrid}>header,.${s.clients} h2,.${s.partnerLogo}`)];
      const clear = (element: HTMLElement) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("transform");
        delete element.dataset.homeReveal;
      };
      if (!reduced.matches) {
        const delays = new Map<Element, number>();
        page.querySelectorAll(`.${s.feature}`).forEach((el, i) => delays.set(el, homeMotion.featureStagger[i] ?? 0));
        page.querySelectorAll(`.${s.outcomes}>article`).forEach((el, i) => delays.set(el, (i % 4) * homeMotion.resultStagger));
        page.querySelectorAll(`.${s.withBranda},.${s.faqList}`).forEach(el => delays.set(el, 0.1));
        const observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;
            observer.unobserve(element);
            element.dataset.homeReveal = "entering";
            const animation = animate(element, { opacity: [0, 1], y: [homeMotion.revealDistance, 0] }, {
              duration: homeMotion.reveal, delay: delays.get(element) ?? 0, ease: homeMotion.ease,
              onComplete: () => { clear(element); element.dataset.homeReveal = "entered"; },
            });
            stops.push(() => animation.stop());
          }
        }, { threshold: 0.12 });
        elements.forEach(element => { element.dataset.homeReveal = "pending"; observer.observe(element); });
        stops.push(() => observer.disconnect());
        page.querySelectorAll<HTMLElement>("[data-count-to]").forEach(element => {
          const target = Number(element.dataset.countTo);
          const animation = animate(0, target, {
            duration: homeMotion.count, ease: value => 1 - (1 - value) ** 3,
            onUpdate: value => { element.textContent = Math.round(value).toLocaleString("en-US"); },
          });
          stops.push(() => { animation.stop(); element.textContent = target.toLocaleString("en-US"); });
        });
      }

      const stage = page.querySelector<HTMLElement>(`.${s.dashboardScene}`);
      const browser = page.querySelector<HTMLElement>(`.${s.browserMock}`);
      let pointerFrame = 0;
      const move = (event: PointerEvent) => {
        if (reduced.matches || !finePointer.matches) return;
        cancelAnimationFrame(pointerFrame);
        pointerFrame = requestAnimationFrame(() => {
          const card = (event.target as Element).closest<HTMLElement>(`.${s.feature}`);
          if (card) {
            const bounds = card.getBoundingClientRect();
            card.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
            card.style.setProperty("--my", `${event.clientY - bounds.top}px`);
          }
          if (stage?.contains(event.target as Node) && browser) {
            const bounds = stage.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            browser.style.transform = `rotateY(${-4 - x * 5}deg) rotateX(${2 + y * 5}deg)`;
          }
        });
      };
      const leave = () => { cancelAnimationFrame(pointerFrame); browser?.style.removeProperty("transform"); };
      page.addEventListener("pointermove", move, { passive: true });
      stage?.addEventListener("pointerleave", leave);

      const links = [...page.querySelectorAll<HTMLAnchorElement>(`.${s.desktopNav} a`)];
      const spy = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !links.some(link => link.hash === `#${entry.target.id}`)) continue;
          for (const link of links) {
            if (link.hash === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          }
        }
      }, { rootMargin: "-35% 0px -55% 0px" });
      page.querySelectorAll("section[id]").forEach(section => spy.observe(section));
      teardown = () => {
        stops.forEach(stop => stop());
        elements.forEach(clear);
        spy.disconnect();
        page.removeEventListener("pointermove", move);
        stage?.removeEventListener("pointerleave", leave);
        leave();
      };
    }

    setup();
    reduced.addEventListener("change", setup);
    return () => {
      reduced.removeEventListener("change", setup);
      teardown();
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, [root]);
}
