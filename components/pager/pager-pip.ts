export type PagerPictureInPicture = { requestWindow: (options: { width: number; height: number }) => Promise<Window> };
export function setPagerWindowLanguage(target: Window, locale: "ar" | "en") {
  target.document.documentElement.lang = locale;
  target.document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  target.document.title = locale === "ar" ? "نداء برندة" : "Branda Pager";
}

// Presentation only: the user agent never grants access to any data or operation.
export function isPagerCompanion() {
  return typeof navigator !== "undefined" && String(navigator.userAgent ?? "").includes("BrandaPagerNative/1.0");
}

export function pagerPictureInPicture(): PagerPictureInPicture | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { documentPictureInPicture?: PagerPictureInPicture }).documentPictureInPicture;
  return api && typeof api.requestWindow === "function" ? api : null;
}

/** Native modal focus handling with bounds that follow the mobile keyboard and rotation. */
export function preparePagerDialog(dialog: HTMLDialogElement) {
  const viewport = window.visualViewport;
  const previousOverflow = document.body.style.overflow;
  const resize = () => {
    dialog.style.setProperty("--pager-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    dialog.style.setProperty("--pager-viewport-top", `${viewport?.offsetTop ?? 0}px`);
  };
  resize();
  dialog.showModal();
  document.body.style.overflow = "hidden";
  // Keep the keyboard closed until the operator chooses an input.
  dialog.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", resize);
  window.addEventListener("resize", resize);
  return () => {
    viewport?.removeEventListener("resize", resize);
    viewport?.removeEventListener("scroll", resize);
    window.removeEventListener("resize", resize);
    document.body.style.overflow = previousOverflow;
    if (dialog.open) dialog.close();
  };
}

/** Copy styles rather than moving nodes so the main application retains its styles */
export function preparePagerWindow(target: Window) {
  const doc = target.document;
  doc.title = "نداء برندة";
  doc.documentElement.lang = "ar";
  doc.documentElement.dir = "rtl";
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.style.cssText = document.documentElement.style.cssText;
  doc.body.className = document.body.className;
  doc.body.style.margin = "0";
  const base = doc.createElement("base");
  base.href = document.baseURI;
  doc.head.append(base);
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      doc.head.append(style);
    } catch {
      if (sheet.href) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        doc.head.append(link);
      }
    }
  }
  const node = doc.createElement("div");
  // next/font is applied by the route layout and must survive moving into PiP
  const fontRoot = document.querySelector<HTMLElement>("[data-pager-font]");
  if (fontRoot) node.className = fontRoot.className;
  const consoleRoot = document.querySelector<HTMLElement>("[data-pager-console]");
  if (consoleRoot) node.style.fontFamily = window.getComputedStyle(consoleRoot).fontFamily;
  doc.body.append(node);
  return node;
}
