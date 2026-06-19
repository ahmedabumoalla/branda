"use server";

import { isIP } from "node:net";
import {
  isAllowedGoogleMapsUrl,
  isGoogleMapsShortUrl,
  parseGoogleMapsCoordinatesFromText,
  readSafeUrl,
} from "@/lib/maps/google-maps-url";

type ResolveSuccess = {
  ok: true;
  coordinates: { lat: number; lng: number };
  source: "google-short-url-explicit";
};

const unsupportedMessage =
  "هذا الرابط المختصر لا يحتوي إحداثيات واضحة. افتح Google Maps واضغط مطولًا على نقطة الموقع نفسها ثم شارك رابط الدبوس، أو حدّد الموقع يدويًا من الخريطة.";
const maxRedirects = 5;
const requestTimeoutMs = 9000;
const browserLikeUserAgent = "Mozilla/5.0 BarndaksaBot/1.0";

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

type ResolvedGoogleMapsPage = {
  finalUrl: string;
  visitedUrls: string[];
  html: string;
};

async function resolveAllowedGoogleMapsPage(input: string): Promise<ResolvedGoogleMapsPage | null> {
  const initial = readSafeUrl(input);
  if (!initial || !canRequestGoogleMapsUrl(initial)) return null;
  let current: URL = initial;
  const visitedUrls: string[] = [];

  for (let index = 0; index < maxRedirects; index += 1) {
    visitedUrls.push(current.toString());
    const response = await fetchWithTimeout(
      current.toString(),
      {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent": browserLikeUserAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      requestTimeoutMs
    );

    if (response.status < 300 || response.status >= 400) {
      const contentType = response.headers.get("content-type") ?? "";
      const html = contentType.includes("text") || contentType.includes("html")
        ? await response.text()
        : "";
      return {
        finalUrl: current.toString(),
        visitedUrls,
        html,
      };
    }

    const location = response.headers.get("location");
    if (!location) {
      const html = await response.text().catch(() => "");
      return {
        finalUrl: current.toString(),
        visitedUrls,
        html,
      };
    }

    const next = new URL(location, current);
    if (!canRequestGoogleMapsUrl(next)) return null;
    current = next;
  }

  return {
    finalUrl: current.toString(),
    visitedUrls,
    html: "",
  };
}

function resolveSuccess(coordinates: { lat: number; lng: number }) {
  return {
    ok: true as const,
    coordinates,
    source: "google-short-url-explicit" as const,
  } satisfies ResolveSuccess;
}

export async function resolveGoogleMapsShortUrlAction(input: string) {
  const raw = input.trim();
  if (!isGoogleMapsShortUrl(raw)) {
    return { ok: false as const, message: "الرابط المختصر غير مدعوم" };
  }

  const direct = parseGoogleMapsCoordinatesFromText(raw);
  if (direct) return resolveSuccess(direct);

  try {
    const resolved = await resolveAllowedGoogleMapsPage(raw);
    if (resolved) {
      for (const url of [...resolved.visitedUrls, resolved.finalUrl]) {
        const coordinates = parseGoogleMapsCoordinatesFromText(url);
        if (coordinates) return resolveSuccess(coordinates);
      }

      const htmlCoordinates = parseGoogleMapsCoordinatesFromText(resolved.html, {
        includeViewportParams: false,
      });
      if (htmlCoordinates) return resolveSuccess(htmlCoordinates);
    }
  } catch {}

  return {
    ok: false as const,
    message: unsupportedMessage,
  };
}
