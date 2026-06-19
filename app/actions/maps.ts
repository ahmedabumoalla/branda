"use server";

import { isIP } from "node:net";
import {
  extractGoogleMapsQuery,
  isAllowedGoogleMapsUrl,
  isGoogleMapsShortUrl,
  parseGoogleMapsCoordinates,
  readSafeUrl,
} from "@/lib/maps/google-maps-url";

type ResolveSuccessSource =
  | "google-short-url-explicit"
  | "google-short-url-geocoded-query";

type ResolveSuccess = {
  ok: true;
  coordinates: { lat: number; lng: number };
  source: ResolveSuccessSource;
};

const unsupportedMessage =
  "تعذر استخراج الإحداثيات من الرابط المختصر. جرّب فتح الرابط في Google Maps ثم مشاركة رابط يحتوي على الإحداثيات، أو حدد الموقع يدويًا من الخريطة.";
const maxRedirects = 6;
const redirectTimeoutMs = 4500;
const geocodingTimeoutMs = 4000;

function getMapboxAccessToken() {
  return (
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    ""
  );
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (isIP(host) === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }

  return false;
}

function canRequestGoogleMapsUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (isPrivateHostname(url.hostname)) return false;
  return isAllowedGoogleMapsUrl(url.toString());
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAllowedRedirectUrl(input: string, method: "HEAD" | "GET") {
  const initial = readSafeUrl(input);
  if (!initial || !canRequestGoogleMapsUrl(initial)) return null;
  let current: URL = initial;

  for (let index = 0; index < maxRedirects; index += 1) {
    const response = await fetchWithTimeout(
      current.toString(),
      {
        method,
        redirect: "manual",
        cache: "no-store",
      },
      redirectTimeoutMs
    );

    const coordinates = parseGoogleMapsCoordinates(current.toString());
    if (coordinates) return current.toString();

    if (response.status < 300 || response.status >= 400) {
      return response.url && canRequestGoogleMapsUrl(new URL(response.url))
        ? response.url
        : current.toString();
    }

    const location = response.headers.get("location");
    if (!location) return current.toString();

    const next = new URL(location, current);
    if (!canRequestGoogleMapsUrl(next)) return null;
    current = next;
  }

  return current.toString();
}

async function geocodeQueryWithMapbox(query: string) {
  const token = getMapboxAccessToken();
  if (!token) return null;

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("country", "sa");
  endpoint.searchParams.set("language", "ar");
  endpoint.searchParams.set("limit", "2");
  endpoint.searchParams.set("types", "poi,address,place,locality,neighborhood");

  try {
    const response = await fetchWithTimeout(
      endpoint.toString(),
      { method: "GET", cache: "no-store" },
      geocodingTimeoutMs
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      features?: Array<{
        center?: [number, number];
        relevance?: number;
      }>;
    };
    const features = payload.features ?? [];
    const first = features[0];
    if (!first?.center || first.center.length < 2) return null;

    const firstRelevance = Number(first.relevance ?? 1);
    const secondRelevance = Number(features[1]?.relevance ?? 0);
    const clearEnough = firstRelevance >= 0.8 && (features.length === 1 || firstRelevance - secondRelevance >= 0.15);
    if (!clearEnough) return null;

    const [lng, lat] = first.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return {
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
    };
  } catch {
    return null;
  }
}

export async function resolveGoogleMapsShortUrlAction(input: string) {
  const raw = input.trim();
  if (!isGoogleMapsShortUrl(raw)) {
    return { ok: false as const, message: "الرابط المختصر غير مدعوم" };
  }

  const direct = parseGoogleMapsCoordinates(raw);
  if (direct) {
    return {
      ok: true as const,
      coordinates: direct,
      source: "google-short-url-explicit" as const,
    } satisfies ResolveSuccess;
  }

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const resolvedUrl = await resolveAllowedRedirectUrl(raw, method);
      if (!resolvedUrl) continue;

      const coordinates = parseGoogleMapsCoordinates(resolvedUrl);
      if (coordinates) {
        return {
          ok: true as const,
          coordinates,
          source: "google-short-url-explicit" as const,
        } satisfies ResolveSuccess;
      }

      const googleQuery = extractGoogleMapsQuery(resolvedUrl);
      if (googleQuery) {
        const geocoded = await geocodeQueryWithMapbox(googleQuery.query);
        if (geocoded) {
          return {
            ok: true as const,
            coordinates: geocoded,
            source: "google-short-url-geocoded-query" as const,
          } satisfies ResolveSuccess;
        }
      }
    } catch {}
  }

  return {
    ok: false as const,
    message: unsupportedMessage,
  };
}
