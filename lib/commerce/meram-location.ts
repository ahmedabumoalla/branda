/** A delivery location is display-only. Only recognized map providers may be opened by the shop. */
export function meramMapLink(raw: string): string | null {
  const input = raw.trim();
  if (!input || input.length > 1000) return null;
  const coordinates = /^(-?\d{1,2}(?:\.\d{1,12})?)\s*[,،]\s*(-?\d{1,3}(?:\.\d{1,12})?)$/.exec(input);
  if (coordinates) {
    const latitude = Number(coordinates[1]), longitude = Number(coordinates[2]);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash.startsWith("#javascript:")) return null;
    const hasPlace = url.pathname.length > 1 || url.search.length > 1;
    if (url.hostname === "maps.app.goo.gl" && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return url.href;
    if (url.hostname === "goo.gl" && /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return url.href;
    if (["maps.google.com","maps.google.com.sa","maps.apple.com"].includes(url.hostname) && hasPlace) return url.href;
    if (["google.com","www.google.com","google.com.sa","www.google.com.sa"].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname) && (url.pathname.length > 6 || url.search.length > 1)) return url.href;
  } catch { return null; }
  return null;
}
