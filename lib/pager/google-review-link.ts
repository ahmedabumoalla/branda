/** Accept only links that open Google's review form; no arbitrary redirects. */
export function normalizeGoogleReviewLink(value: string): string | null {
  const input = value.trim();
  if (!input) return "";
  if (input.length > 2048) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const shortLink = url.hostname === "g.page" && /^\/(?:r\/)?[a-zA-Z0-9_-]+\/review\/?$/.test(url.pathname);
    const placeLink = url.hostname === "search.google.com" && url.pathname === "/local/writereview" && /^[a-zA-Z0-9_-]{4,300}$/.test(url.searchParams.get("placeid") ?? "");
    if (!shortLink && !placeLink) return null;
    const placeId = url.searchParams.get("placeid");
    url.search = "";
    if (placeLink && placeId) url.searchParams.set("placeid", placeId);
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
