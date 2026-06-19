import type { ExtractedMenuItem, MenuImportAnalysis, MenuImportReport } from "@/lib/menu-import/types";

const defaultCategory = "غير مصنف";
const pricePattern = /(?:SAR|SR|ر\.س|ريال|﷼)?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:SAR|SR|ر\.س|ريال|﷼)?/i;

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeSpace(value).toLowerCase();
}

export function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

export function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

export function parsePrice(value: string) {
  const match = value.match(pricePattern);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return null;
  return Number(amount.toFixed(2));
}

function stripPrice(value: string) {
  return normalizeSpace(value.replace(pricePattern, " "));
}

function looksLikeCategory(line: string) {
  const normalized = normalizeSpace(line);
  if (!normalized || normalized.length > 42) return false;
  if (parsePrice(normalized) !== null) return false;
  if (/https?:\/\//i.test(normalized)) return false;
  return /^[\p{L}\p{N}\s&+/.-]+$/u.test(normalized);
}

function looksLikeNoise(line: string) {
  const normalized = normalizeSpace(line);
  if (normalized.length < 2) return true;
  if (/^(menu|home|cart|order|login|instagram|facebook|twitter|whatsapp)$/i.test(normalized)) return true;
  if (/^[\d\s.,:/-]+$/.test(normalized)) return true;
  return false;
}

function inferStatus(item: Omit<ExtractedMenuItem, "status">): ExtractedMenuItem["status"] {
  if (!item.productName.trim()) return "needs_review";
  if (item.price == null || !item.description || !item.imageUrl) return "needs_review";
  return "ready";
}

function finalizeItem(item: Omit<ExtractedMenuItem, "status">): ExtractedMenuItem {
  const productName = normalizeSpace(item.productName);
  const next: Omit<ExtractedMenuItem, "status"> = {
    ...item,
    categoryName: normalizeSpace(item.categoryName || "") || defaultCategory,
    productName,
    description: normalizeSpace(item.description || "") || null,
    price: item.price ?? null,
    calories: item.calories ?? null,
    prepTimeMinutes: item.prepTimeMinutes ?? null,
    chefName: normalizeSpace(item.chefName || "") || null,
    imageUrl: normalizeSpace(item.imageUrl || "") || null,
    galleryUrls: item.galleryUrls?.filter(Boolean) ?? [],
    galleryStoragePaths: item.galleryStoragePaths?.filter(Boolean) ?? [],
    metadata: item.metadata ?? null,
  };

  return {
    ...next,
    status: inferStatus(next),
  };
}

export function parseMenuItemsFromText(text: string, sourceUrl?: string | null) {
  const lines = text
    .split(/\r?\n|[|•]+/g)
    .map((line) => normalizeSpace(line))
    .filter((line) => !looksLikeNoise(line));

  const items: ExtractedMenuItem[] = [];
  let currentCategory = defaultCategory;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const price = parsePrice(line);

    if (price === null) {
      if (looksLikeCategory(line)) currentCategory = line;
      continue;
    }

    const productName = stripPrice(line)
      .replace(/[-–—:]+$/g, "")
      .trim();
    if (!productName || productName.length < 2) continue;

    const nextLine = lines[index + 1] ?? "";
    const description =
      nextLine && parsePrice(nextLine) === null && !looksLikeCategory(nextLine)
        ? nextLine
        : "";

    items.push(
      finalizeItem({
        categoryName: currentCategory,
        productName,
        description,
        price,
        metadata: { sourceUrl: sourceUrl ?? null, extraction: "text-line" },
      })
    );
  }

  return dedupeItems(items);
}

function readString(value: unknown) {
  return typeof value === "string" ? normalizeSpace(value) : "";
}

function readImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readImage(record.url ?? record.contentUrl);
  }
  return null;
}

function readJsonLdPrice(value: Record<string, unknown>) {
  const offers = value.offers;
  if (offers && typeof offers === "object") {
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        if (offer && typeof offer === "object") {
          const price = parsePrice(String((offer as Record<string, unknown>).price ?? ""));
          if (price !== null) return price;
        }
      }
    } else {
      const price = parsePrice(String((offers as Record<string, unknown>).price ?? ""));
      if (price !== null) return price;
    }
  }
  return parsePrice(String(value.price ?? ""));
}

function collectJsonLdItems(node: unknown, categoryName: string, sourceUrl: string | null, out: ExtractedMenuItem[]) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdItems(item, categoryName, sourceUrl, out);
    return;
  }

  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = Array.isArray(record["@type"]) ? record["@type"].join(" ") : String(record["@type"] ?? "");
  const name = readString(record.name);
  const nextCategory =
    /MenuSection|ItemList/i.test(type) && name
      ? name
      : categoryName;

  if (/MenuItem|Product/i.test(type) && name) {
    out.push(
      finalizeItem({
        categoryName,
        productName: name,
        description: readString(record.description) || null,
        price: readJsonLdPrice(record),
        imageUrl: readImage(record.image),
        metadata: { sourceUrl, extraction: "json-ld", jsonLdType: type || null },
      })
    );
  }

  for (const key of ["hasMenuItem", "hasMenuSection", "itemListElement", "offers", "mainEntity", "@graph"]) {
    collectJsonLdItems(record[key], nextCategory, sourceUrl, out);
  }
}

export function parseMenuItemsFromJsonLd(jsonLdPayloads: unknown[], sourceUrl?: string | null) {
  const items: ExtractedMenuItem[] = [];
  for (const payload of jsonLdPayloads) {
    collectJsonLdItems(payload, defaultCategory, sourceUrl ?? null, items);
  }
  return dedupeItems(items);
}

export function dedupeItems(items: ExtractedMenuItem[]) {
  const seen = new Set<string>();
  const deduped: ExtractedMenuItem[] = [];

  for (const item of items) {
    const key = `${normalizeKey(item.categoryName || defaultCategory)}:${normalizeKey(item.productName)}`;
    if (!item.productName.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function buildReport(items: ExtractedMenuItem[], notes: string[] = [], unreadableUrls: string[] = [], imageDownloadFailures: string[] = []): MenuImportReport {
  const missingFields = new Set<string>();
  for (const item of items) {
    if (!item.productName) missingFields.add("product_name");
    if (item.price == null) missingFields.add("price");
    if (!item.imageUrl && !item.imageStoragePath) missingFields.add("image");
    if (!item.categoryName) missingFields.add("category");
  }

  return {
    extractedCount: items.length,
    needsReviewCount: items.filter((item) => item.status === "needs_review").length,
    withoutPriceCount: items.filter((item) => item.price == null).length,
    withoutImageCount: items.filter((item) => !item.imageUrl && !item.imageStoragePath).length,
    imageDownloadFailures,
    missingFields: Array.from(missingFields),
    unreadableUrls,
    notes,
  };
}

export function buildAnalysis(items: ExtractedMenuItem[], rawSummary: Record<string, unknown>, notes: string[] = [], unreadableUrls: string[] = [], imageDownloadFailures: string[] = []): MenuImportAnalysis {
  const deduped = dedupeItems(items);
  return {
    items: deduped,
    report: buildReport(deduped, notes, unreadableUrls, imageDownloadFailures),
    rawSummary: {
      ...rawSummary,
      report: buildReport(deduped, notes, unreadableUrls, imageDownloadFailures),
    },
  };
}
