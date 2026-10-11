export type PagerPictureInPicture = { requestWindow: (options: { width: number; height: number }) => Promise<Window> };

export function pagerPictureInPicture(): PagerPictureInPicture | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { documentPictureInPicture?: PagerPictureInPicture }).documentPictureInPicture;
  return api && typeof api.requestWindow === "function" ? api : null;
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
