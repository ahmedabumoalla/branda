export type GoogleMapsCoordinates = {
  lat: number;
  lng: number;
};

const coordinatePattern = "(-?\\d+(?:\\.\\d+)?)";
const pairPattern = new RegExp(`${coordinatePattern}\\s*,\\s*${coordinatePattern}`);
const atPattern = new RegExp(`@${coordinatePattern}\\s*,\\s*${coordinatePattern}`);
const bangPattern = new RegExp(`!3d${coordinatePattern}!4d${coordinatePattern}`, "i");
const escapedSlashPattern = /\\u002f|\\\//gi;
const escapedCommaPattern = /\\u002c/gi;
const escapedAtPattern = /\\u0040/gi;
const htmlEntityPattern = /&(amp|quot|#39|apos|lt|gt|#x2F|#47|#x40|#64|#x2C|#44);/gi;
const coordinateParamNames = ["query", "q", "ll", "center", "destination", "daddr", "saddr"] as const;
const textCoordinateParamPattern = "query|q|ll|center|destination|daddr|saddr";
const strictTextCoordinateParamPattern = "query|q|destination|daddr|saddr";

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

  const decoded = normalizeGoogleMapsText(raw);
  const bangMatch = decoded.match(bangPattern);
  if (bangMatch) return toCoordinates(bangMatch[1], bangMatch[2]);

  const atMatch = decoded.match(atPattern);
  if (atMatch) return toCoordinates(atMatch[1], atMatch[2]);

  const url = readUrl(decoded);
  if (url) {
    for (const name of coordinateParamNames) {
      const value = url.searchParams.get(name);
      if (value) {
        const coordinates = parseCoordinatePair(normalizeGoogleMapsText(value));
        if (coordinates) return coordinates;
      }
    }
  }

  return parseCoordinatePair(decoded);
}

export function parseGoogleMapsCoordinatesFromText(
  text: string,
  options: { includeViewportParams?: boolean } = {}
): GoogleMapsCoordinates | null {
  const normalized = normalizeGoogleMapsText(text);
  if (!normalized) return null;
  const paramPattern = options.includeViewportParams === false
    ? strictTextCoordinateParamPattern
    : textCoordinateParamPattern;

  const url = readUrl(normalized);
  if (url) {
    const direct = parseGoogleMapsCoordinates(url.toString());
    if (direct) return direct;
  }

  const encodedAtMatch = normalized.match(/%40(-?\d+(?:\.\d+)?)%2c(-?\d+(?:\.\d+)?)/i);
  if (encodedAtMatch) return toCoordinates(encodedAtMatch[1], encodedAtMatch[2]);

  const encodedPairMatch = normalized.match(new RegExp(`(?:${paramPattern})=(-?\\d+(?:\\.\\d+)?)%2c(-?\\d+(?:\\.\\d+)?)`, "i"));
  if (encodedPairMatch) return toCoordinates(encodedPairMatch[1], encodedPairMatch[2]);

  const paramPairMatch = normalized.match(new RegExp(`(?:[?&]|&amp;)(?:${paramPattern})=(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
  if (paramPairMatch) return toCoordinates(paramPairMatch[1], paramPairMatch[2]);

  const patterns = [bangPattern, atPattern];
  for (const pattern of patterns) {
    const matches = normalized.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
    for (const match of matches) {
      const coordinates = toCoordinates(match[1], match[2]);
      if (coordinates) return coordinates;
    }
  }

  return null;
}

export function isGoogleMapsShortUrl(input: string) {
  const url = readUrl(input.trim());
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "maps.app.goo.gl";
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

export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value: string) {
  return value.replace(htmlEntityPattern, (entity) => {
    const lower = entity.toLowerCase();
    if (lower === "&amp;") return "&";
    if (lower === "&quot;") return '"';
    if (lower === "&#39;" || lower === "&apos;") return "'";
    if (lower === "&lt;") return "<";
    if (lower === "&gt;") return ">";
    if (lower === "&#x2f;" || lower === "&#47;") return "/";
    if (lower === "&#x40;" || lower === "&#64;") return "@";
    if (lower === "&#x2c;" || lower === "&#44;") return ",";
    return entity;
  });
}

export function normalizeGoogleMapsText(value: string) {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    const decoded = safeDecode(current);
    const withEntities = decodeHtmlEntities(decoded)
      .replace(escapedSlashPattern, "/")
      .replace(escapedCommaPattern, ",")
      .replace(escapedAtPattern, "@");
    if (withEntities === current) break;
    current = withEntities;
  }
  return current;
}
