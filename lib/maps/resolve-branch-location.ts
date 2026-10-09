import "server-only";
import { normalizeGoogleMapsText } from "./google-maps-url";

type BranchLocation = { latitude: number | null; longitude: number | null };
const maxUrlLength = 2048;
const maxBodyBytes = 256 * 1024;
const mapHosts = new Set(["google.com", "maps.google.com", "google.com.sa", "maps.google.com.sa"]);
const numberPattern = "(-?\\d+(?:\\.\\d+)?)";
const pairPattern = new RegExp(`^${numberPattern}\\s*,\\s*${numberPattern}$`);
const pinPattern = new RegExp(`!3d${numberPattern}!4d${numberPattern}(?=!|/|$)`, "g");
const unsupported = "تعذر تحديد نقطة الفرع من الرابط افتح موقع الفرع في قوقل ماب وشارك رابط المكان أو دبوس الموقع نفسه";

export class GoogleMapsLocationError extends Error {}

function readAllowedUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new GoogleMapsLocationError("أدخل رابط قوقل ماب كاملًا يبدأ بـ https://"); }
  const host = url.hostname.replace(/^www\./, "");
  const short = host === "maps.app.goo.gl" || (host === "goo.gl" && /^\/maps\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname));
  const maps = mapHosts.has(host) && (/^\/maps(?:\/|$)/.test(url.pathname) || (host.startsWith("maps.") && url.pathname === "/"));
  if (value.length > maxUrlLength || url.protocol !== "https:" || url.username || url.password || url.port
    || /[\u0000-\u0020\u007f]/.test(value) || (!short && !maps)) {
    throw new GoogleMapsLocationError("استخدم رابط موقع من قوقل ماب أو رابط المشاركة المختصر فقط");
  }
  if (/^\/maps\/(?:dir|d|embed)(?:\/|$)/.test(normalizeGoogleMapsText(url.pathname)) || url.searchParams.get("map_action")) {
    throw new GoogleMapsLocationError(unsupported);
  }
  url.hash = "";
  return url;
}

function coordinates(lat: string, lng: string): BranchLocation {
  const latitude = Number(lat), longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new GoogleMapsLocationError(unsupported);
  }
  return { latitude, longitude };
}

function explicitLocation(url: URL): BranchLocation | null {
  if (!mapHosts.has(url.hostname.replace(/^www\./, ""))) return null;
  const path = normalizeGoogleMapsText(url.pathname);
  // Place-pin coordinates take priority over the camera/viewport center (@lat,lng).
  const pins = [...`${path}!${url.searchParams.get("data") ?? ""}`.matchAll(pinPattern)];
  if (pins.length) {
    const unique = new Set(pins.map((match) => `${Number(match[1])},${Number(match[2])}`));
    if (unique.size !== 1) throw new GoogleMapsLocationError(unsupported);
    return coordinates(pins[0][1], pins[0][2]);
  }
  // A Place ID takes precedence over query in Google Maps; do not use its fallback as the branch.
  if (url.searchParams.has("query_place_id")) return null;
  const candidates = [url.searchParams.get("query"), url.searchParams.get("q"), path.match(/^\/maps\/place\/([^/]+)(?:\/|$)/)?.[1]];
  for (const candidate of candidates) {
    const match = candidate?.trim().match(pairPattern);
    if (match) return coordinates(match[1], match[2]);
  }
  return null;
}

async function readBoundedHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "", size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBodyBytes) throw new GoogleMapsLocationError(unsupported);
      html += decoder.decode(part.value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

function locationFromMetadata(html: string) {
  // Only inspect the page's canonical location, never unrelated coordinates in scripts or images.
  const markup = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  for (const match of markup.matchAll(/<(?:link|meta)\b[^>]{0,8192}>/gi)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([a-z:-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)]
      .map((attribute) => [attribute[1].toLowerCase(), attribute[3]]));
    const candidate = attributes.rel?.toLowerCase() === "canonical" ? attributes.href
      : attributes.property?.toLowerCase() === "og:url" ? attributes.content : undefined;
    if (!candidate) continue;
    try {
      const location = explicitLocation(readAllowedUrl(normalizeGoogleMapsText(candidate)));
      if (location) return location;
    } catch { /* Unusable metadata is not a branch location. */ }
  }
  return null;
}

/** Called after owner/tenant authorization; an empty link explicitly clears proximity relevance. */
export async function resolveBranchGoogleMapsUrl(input: string): Promise<BranchLocation> {
  const raw = input.trim();
  if (!raw) return { latitude: null, longitude: null };
  let current = readAllowedUrl(raw);
  const signal = AbortSignal.timeout(8000);
  const visited = new Set<string>();
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const direct = explicitLocation(current);
      if (direct) return direct;
      if (visited.has(current.href)) break;
      visited.add(current.href);
      const response = await fetch(current, {
        redirect: "manual", cache: "no-store", signal,
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 BarndaksaBot/1.0" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get("location");
        await response.body?.cancel();
        if (!next || redirects === 5) break;
        current = readAllowedUrl(new URL(next, current).href);
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        await response.body?.cancel();
        break;
      }
      const location = locationFromMetadata(await readBoundedHtml(response));
      if (location) return location;
      break;
    }
  } catch (error) {
    if (error instanceof GoogleMapsLocationError) throw error;
    throw new GoogleMapsLocationError("تعذر التحقق من رابط قوقل ماب الآن حاول مرة أخرى؛ لم يتغير موقع الفرع المحفوظ");
  }
  throw new GoogleMapsLocationError(unsupported);
}
