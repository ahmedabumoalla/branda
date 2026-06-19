export type GoogleMapsCoordinates = {
  lat: number;
  lng: number;
};

export type GoogleMapsQuery = {
  query: string;
  sourceUrl: string;
};

const coordinatePattern = "(-?\\d+(?:\\.\\d+)?)";
const pairPattern = new RegExp(`${coordinatePattern}\\s*,\\s*${coordinatePattern}`);
const atPattern = new RegExp(`@${coordinatePattern}\\s*,\\s*${coordinatePattern}`);
const bangPattern = new RegExp(`!3d${coordinatePattern}!4d${coordinatePattern}`, "i");

function normalizeCoordinate(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Number(value.toFixed(7));
}

function toCoordinates(latValue: string, lngValue: string): GoogleMapsCoordinates | null {
  const lat = normalizeCoordinate(Number(latValue), -90, 90);
  const lng = normalizeCoordinate(Number(lngValue), -180, 180);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function parseCoordinatePair(value: string) {
  const match = value.match(pairPattern);
  if (!match) return null;
  return toCoordinates(match[1], match[2]);
}

function readUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

export function readSafeUrl(input: string) {
  return readUrl(input);
}

export function parseGoogleMapsCoordinates(input: string): GoogleMapsCoordinates | null {
  const raw = input.trim();
  if (!raw) return null;

  const decoded = safeDecode(raw);
  const bangMatch = decoded.match(bangPattern);
  if (bangMatch) return toCoordinates(bangMatch[1], bangMatch[2]);

  const atMatch = decoded.match(atPattern);
  if (atMatch) return toCoordinates(atMatch[1], atMatch[2]);

  const url = readUrl(decoded);
  if (url) {
    const query = url.searchParams.get("query") ?? url.searchParams.get("q");
    if (query) {
      const queryCoordinates = parseCoordinatePair(safeDecode(query));
      if (queryCoordinates) return queryCoordinates;
    }
  }

  return parseCoordinatePair(decoded);
}

export function isGoogleMapsShortUrl(input: string) {
  const url = readUrl(input.trim());
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "maps.app.goo.gl" || (host === "goo.gl" && url.pathname.startsWith("/maps"));
}

export function isAllowedGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return (
    host === "maps.app.goo.gl" ||
    (host === "goo.gl") ||
    host === "google.com" ||
    host === "maps.google.com"
  );
}

export function isAllowedGoogleMapsUrl(input: string) {
  const url = readUrl(input.trim());
  if (!url) return false;
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (!isAllowedGoogleMapsHost(url.hostname)) return false;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host === "google.com") return url.pathname.startsWith("/maps");
  return true;
}

export function extractGoogleMapsQuery(input: string): GoogleMapsQuery | null {
  const raw = input.trim();
  if (!raw) return null;

  const url = readUrl(safeDecode(raw));
  if (!url || !isAllowedGoogleMapsUrl(url.toString())) return null;

  const query = url.searchParams.get("query") ?? url.searchParams.get("q");
  if (!query) return null;

  const decoded = safeDecode(query).trim();
  if (!decoded || parseCoordinatePair(decoded)) return null;

  return { query: decoded, sourceUrl: url.toString() };
}

export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
