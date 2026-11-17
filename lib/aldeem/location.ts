const prefix = "aldeem.";
export const aldeemLocationEvent = "aldeem-location-change";

export function readAldeemLocation(key: string): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(prefix + key);
}

/** Navigation identifiers only; invoice/cart contents and account settings never enter the URL. */
export function writeAldeemLocation(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(prefix + key) === value) return;
  if (key === "section") {
    for (const name of [...url.searchParams.keys()]) if (name.startsWith(prefix)) url.searchParams.delete(name);
  } else if (key === "route") {
    url.searchParams.delete(prefix + "itemPage");
    url.searchParams.delete(prefix + "analysisMode");
  }
  if (value === null) url.searchParams.delete(prefix + key);
  else url.searchParams.set(prefix + key, value);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(aldeemLocationEvent));
}
