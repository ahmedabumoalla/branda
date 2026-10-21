/** Entry policy for the French menu; refreshes and in-page navigation keep their position. */
export function startMenuAtTop(root: HTMLElement | null) {
  if (!root || root.closest("[inert]")) return;
  const previous = window.history.scrollRestoration;
  window.history.scrollRestoration = "manual";
  if (window.location.hash.startsWith("#french-")) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  const reset = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  reset();
  // Run after the router's layout scroll handling, without waiting on images or timers.
  const frame = window.requestAnimationFrame(reset);
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) reset(); };
  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("pageshow", onPageShow);
    window.history.scrollRestoration = previous;
  };
}

export function menuEntryUrl(origin: string, slug: string) {
  return new URL(`/menu/${encodeURIComponent(slug)}`, origin).href;
}
