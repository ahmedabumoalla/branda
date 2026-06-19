import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  buildAnalysis,
  decodeHtmlEntities,
  htmlToText,
  parseMenuItemsFromJsonLd,
  parseMenuItemsFromText,
  parsePrice,
} from "@/lib/menu-import/text-extractor";
import type { ExtractedMenuItem, MenuImportAnalysis } from "@/lib/menu-import/types";

const maxRedirects = 4;
const timeoutMs = 9000;
const maxResponseBytes = 2 * 1024 * 1024;
const userAgent = "BarndaksaMenuImport/1.0";

function isPrivateIp(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (isIP(normalized) === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }

  return false;
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https menu URLs are supported");
  }
  if (isPrivateIp(url.hostname)) {
    throw new Error("Private menu URLs are not allowed");
  }

  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new Error("Private menu URLs are not allowed");
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      throw new Error("Menu URL response is too large");
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

async function fetchPublicMenuUrl(input: string) {
  let current = new URL(input);
  const visited: string[] = [];

  for (let index = 0; index <= maxRedirects; index += 1) {
    await assertPublicUrl(current);
    visited.push(current.toString());

    const response = await fetchWithTimeout(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/json;q=0.9,text/plain;q=0.7,*/*;q=0.5",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Menu URL returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/json") &&
      !contentType.includes("text/plain") &&
      contentType.trim() !== ""
    ) {
      throw new Error("Menu URL did not return readable HTML or JSON");
    }

    return {
      finalUrl: current.toString(),
      visited,
      contentType,
      text: await readLimitedText(response),
    };
  }

  throw new Error("Too many redirects while reading menu URL");
}

function extractJsonLd(html: string) {
  const payloads: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = decodeHtmlEntities(match[1] ?? "").trim();
    if (!raw) continue;
    try {
      payloads.push(JSON.parse(raw));
    } catch {}
  }

  return payloads;
}

function extractNextData(html: string) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;

  try {
    return JSON.parse(decodeHtmlEntities(match[1] ?? ""));
  } catch {
    return null;
  }
}

function collectObjectsWithPrices(value: unknown, sourceUrl: string, out: ExtractedMenuItem[], depth = 0) {
  if (depth > 8 || !value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectsWithPrices(item, sourceUrl, out, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.title === "string"
        ? record.title
        : "";
  const priceValue = record.price ?? record.amount ?? record.cost;
  const price =
    typeof priceValue === "number"
      ? priceValue
      : typeof priceValue === "string"
        ? Number(priceValue.replace(/[^\d.]/g, ""))
        : null;

  if (name && price != null && Number.isFinite(price)) {
    out.push({
      productName: name.trim(),
      categoryName: typeof record.category === "string" ? record.category : "غير مصنف",
      description: typeof record.description === "string" ? record.description : null,
      price: Number(price.toFixed(2)),
      imageUrl: typeof record.image === "string" ? record.image : typeof record.imageUrl === "string" ? record.imageUrl : null,
      metadata: { sourceUrl, extraction: "embedded-json" },
      status: "needs_review",
    });
  }

  for (const item of Object.values(record)) {
    collectObjectsWithPrices(item, sourceUrl, out, depth + 1);
  }
}

function absolutizeUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractImages(html: string, baseUrl: string) {
  const images: Array<{ url: string; alt: string }> = [];
  const pattern = /<img\b[^>]*>/gi;
  for (const tagMatch of html.matchAll(pattern)) {
    const tag = tagMatch[0];
    const src =
      tag.match(/\s(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1]?.split(",")[0]?.trim().split(/\s+/)[0] ??
      "";
    const alt = decodeHtmlEntities(tag.match(/\salt=["']([^"']*)["']/i)?.[1] ?? "");
    const url = src ? absolutizeUrl(src, baseUrl) : "";
    if (url) images.push({ url, alt });
  }
  return images;
}

function attachImages(items: ExtractedMenuItem[], images: Array<{ url: string; alt: string }>) {
  return items.map((item) => {
    if (item.imageUrl) return item;
    const normalizedName = item.productName.toLowerCase();
    const match = images.find((image) => {
      const alt = image.alt.toLowerCase();
      return alt && (alt.includes(normalizedName) || normalizedName.includes(alt));
    });
    return match ? { ...item, imageUrl: match.url } : item;
  });
}

function stripTags(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function extractAttribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"))?.[1] ?? "";
}

function extractStructuredHtmlItems(html: string, baseUrl: string) {
  const items: ExtractedMenuItem[] = [];
  const headingPattern = /<h[1-3]\b[^>]*class=["'][^"']*(?:menu-title|category|section-title)[^"']*["'][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const headings = Array.from(html.matchAll(headingPattern));

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const categoryName = stripTags(heading[1] ?? "") || "غير مصنف";
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const segment = html.slice(start, end);
    const itemPattern = /<div\b[^>]*class=["'][^"']*menu-item[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*menu-item|$)/gi;

    for (const itemMatch of segment.matchAll(itemPattern)) {
      const block = itemMatch[1] ?? "";
      const name = stripTags(block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] ?? "");
      const priceText =
        stripTags(block.match(/<[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "") ||
        stripTags(block);
      const price = parsePrice(priceText);
      const imgTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
      const imageUrl = extractAttribute(imgTag, "src") || extractAttribute(imgTag, "data-src") || extractAttribute(imgTag, "data-lazy-src");

      if (!name || price == null) continue;
      items.push({
        categoryName,
        productName: name,
        description: null,
        price,
        imageUrl: imageUrl ? absolutizeUrl(imageUrl, baseUrl) : null,
        metadata: { sourceUrl: baseUrl, extraction: "structured-html" },
        status: imageUrl ? "ready" : "needs_review",
      });
    }
  }

  return items;
}

export async function analyzeMenuUrl(sourceUrl: string): Promise<MenuImportAnalysis> {
  const fetched = await fetchPublicMenuUrl(sourceUrl.trim());
  const jsonLdPayloads = extractJsonLd(fetched.text);
  const jsonLdItems = parseMenuItemsFromJsonLd(jsonLdPayloads, fetched.finalUrl);
  const structuredHtmlItems = fetched.contentType.includes("text/html")
    ? extractStructuredHtmlItems(fetched.text, fetched.finalUrl)
    : [];
  const htmlTextItems = parseMenuItemsFromText(
    fetched.contentType.includes("application/json") ? fetched.text : htmlToText(fetched.text),
    fetched.finalUrl
  );
  const nextDataItems: ExtractedMenuItem[] = [];
  const nextData = extractNextData(fetched.text);
  if (nextData) collectObjectsWithPrices(nextData, fetched.finalUrl, nextDataItems);

  const images = extractImages(fetched.text, fetched.finalUrl);
  const items = attachImages([...structuredHtmlItems, ...jsonLdItems, ...nextDataItems, ...htmlTextItems], images);
  const notes = items.length
    ? []
    : ["لم يتم العثور على منتجات واضحة في الرابط. يمكن إنشاء المسودة يدويًا من جدول المراجعة."];

  return buildAnalysis(
    items,
    {
      sourceUrl,
      finalUrl: fetched.finalUrl,
      visitedUrls: fetched.visited,
      contentType: fetched.contentType,
      jsonLdBlocks: jsonLdPayloads.length,
      imagesFound: images.length,
    },
    notes
  );
}
