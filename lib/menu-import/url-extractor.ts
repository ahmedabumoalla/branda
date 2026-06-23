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
const iwaiterTimeoutMs = 8000;
const phpCatalogTimeoutMs = 8000;
const maxPhpCategoryPages = 4;
const maxResponseBytes = 2 * 1024 * 1024;
const userAgent = "BarndaksaMenuImport/1.0";
const phpCatalogFailureMessage = "تعذر استخراج المنيو تلقائيًا، أرسل الرابط للفريق التقني";

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

async function fetchWithTimeoutMs(url: string, init: RequestInit, timeoutMilliseconds: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  return fetchWithTimeoutMs(url, init, timeoutMs);
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

function isYallaQrCodesUrl(url: URL) {
  return url.hostname.toLowerCase().endsWith(".yallaqrcodes.com");
}

function isIWaiterUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "iwaiter.net" || hostname.endsWith(".iwaiter.net");
}

function phpCatalogParam(url: URL) {
  for (const key of ["cat", "category", "menu"]) {
    const value = url.searchParams.get(key);
    if (value?.trim()) return { key, value: value.trim() };
  }
  return null;
}

function isPhpCatalogUrl(url: URL) {
  return /\.php$/i.test(url.pathname) && Boolean(phpCatalogParam(url));
}

async function fetchPhpCatalogUrl(input: URL) {
  let current = new URL(input);
  const visited: string[] = [];

  for (let index = 0; index <= 2; index += 1) {
    await assertPublicUrl(current);
    visited.push(current.toString());

    const response = await fetchWithTimeoutMs(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,text/plain;q=0.7,*/*;q=0.5",
      },
    }, phpCatalogTimeoutMs);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(phpCatalogFailureMessage);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      contentType.trim() !== ""
    ) {
      throw new Error(phpCatalogFailureMessage);
    }

    return {
      finalUrl: current.toString(),
      visited,
      contentType,
      text: await readLimitedText(response),
    };
  }

  throw new Error(phpCatalogFailureMessage);
}

function branchIdFromYallaUrl(url: URL) {
  const branchMatch = url.pathname.match(/\/branch\/([^/]+)/i);
  if (branchMatch?.[1]) return branchMatch[1];
  const queryBranch = url.searchParams.get("branch") ?? url.searchParams.get("branch_id");
  return queryBranch?.trim() || "1";
}

async function fetchYallaJson(baseUrl: URL, path: string, branchId: string) {
  const url = new URL(path, baseUrl.origin);
  await assertPublicUrl(url);
  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json,text/plain;q=0.7,*/*;q=0.5",
      branch: branchId,
    },
  });

  if (!response.ok) {
    throw new Error(`Yalla QR Codes API returned ${response.status}`);
  }

  const text = await readLimitedText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Yalla QR Codes API returned unreadable JSON");
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["results", "data", "items", "categories", "menus"]) {
      const nested = record[key];
      if (Array.isArray(nested)) return asArray(nested);
    }
  }
  return [];
}

function yallaText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return decodeHtmlEntities(value).trim();
  }
  return "";
}

function yallaNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = parsePrice(value);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function absolutizeYallaImage(value: string, baseUrl: URL) {
  if (!value.trim()) return null;
  try {
    return new URL(value, baseUrl.origin).toString();
  } catch {
    return null;
  }
}

async function analyzeYallaQrCodesMenu(sourceUrl: string): Promise<MenuImportAnalysis> {
  const baseUrl = new URL(sourceUrl.trim());
  const branchId = branchIdFromYallaUrl(baseUrl);

  const [infoPayload, menuPayload, categoryPayload, itemPayload] = await Promise.all([
    fetchYallaJson(baseUrl, "/api/info/", branchId).catch(() => null),
    fetchYallaJson(baseUrl, "/api/menus/", branchId).catch(() => null),
    fetchYallaJson(baseUrl, "/api/categories/", branchId).catch(() => null),
    fetchYallaJson(baseUrl, "/api/items-light/", branchId),
  ]);

  const categoryMap = new Map<string, string>();
  for (const category of asArray(categoryPayload)) {
    const id = String(category.id ?? category.category_id ?? "");
    const name = yallaText(category, ["name_ar", "name", "name_en", "title_ar", "title"]);
    if (id && name) categoryMap.set(id, name);
  }

  const items: ExtractedMenuItem[] = [];
  for (const item of asArray(itemPayload)) {
    const productName = yallaText(item, ["name_ar", "name", "name_en", "title_ar", "title"]);
    const description = yallaText(item, ["description_ar", "description", "desc_ar", "desc", "description_en"]);
    const categoryId = String(item.category ?? item.category_id ?? item.categoryId ?? "");
    const categoryName =
      categoryMap.get(categoryId) ||
      yallaText(item, ["category_name_ar", "category_name", "categoryName", "category"]);
    const price = yallaNumber(item, ["price", "price_after_discount", "amount", "cost"]);
    const calories = yallaNumber(item, ["calories", "calorie", "kcal"]);
    const image =
      yallaText(item, ["image_full", "image_url", "image", "photo", "photo_url", "thumbnail"]) ||
      "";

    if (!productName) continue;

    items.push({
      productName,
      categoryName: categoryName || "غير مصنف",
      description: description || null,
      price,
      calories,
      imageUrl: absolutizeYallaImage(image, baseUrl),
      metadata: {
        sourceUrl,
        extraction: "yallaqrcodes-api",
        branchId,
        sourceItemId: item.id == null ? null : String(item.id),
      },
      status: price == null ? "needs_review" : "ready",
    });
  }

  const notes = items.length
    ? ["تم استخراج المنتجات من واجهة yallaqrcodes API بدون browser rendering."]
    : ["لم يتم العثور على منتجات في واجهة yallaqrcodes API، ولم يتم اختراع أي منتجات."];

  return buildAnalysis(
    items,
    {
      sourceUrl,
      finalUrl: sourceUrl,
      visitedUrls: [
        new URL("/api/info/", baseUrl.origin).toString(),
        new URL("/api/menus/", baseUrl.origin).toString(),
        new URL("/api/categories/", baseUrl.origin).toString(),
        new URL("/api/items-light/", baseUrl.origin).toString(),
      ],
      contentType: "application/json",
      adapter: "yallaqrcodes",
      branchId,
      infoFound: Boolean(infoPayload),
      menusFound: asArray(menuPayload).length,
      categoriesFound: categoryMap.size,
    },
    notes
  );
}

function iwaiterPathParts(url: URL) {
  const segments = url.pathname.split("/").map((item) => decodeURIComponent(item).trim()).filter(Boolean);
  const slug =
    segments.find((item) => !/^(api|v\d+|restaurants?|menu|view|branch|table|qr|appLink\.html)$/i.test(item) && !/^[0-9a-f]{24}$/i.test(item)) ??
    "";
  const idSegments = segments.filter((item) => /^[0-9a-f]{24}$/i.test(item));
  const branchId =
    url.searchParams.get("branchId") ??
    url.searchParams.get("branch") ??
    url.searchParams.get("branch_id") ??
    idSegments[0] ??
    "";
  const tableOrMenuId =
    url.searchParams.get("tableId") ??
    url.searchParams.get("table") ??
    url.searchParams.get("menuId") ??
    url.searchParams.get("menu_id") ??
    idSegments.find((item) => item !== branchId) ??
    "";

  return {
    slug,
    branchId: branchId.trim(),
    tableOrMenuId: tableOrMenuId.trim(),
    lang: (url.searchParams.get("lang") ?? "").trim().toLowerCase(),
    segments,
  };
}

async function fetchIWaiterJson(slug: string) {
  const url = new URL(`/api/v1/restaurants/${encodeURIComponent(slug)}`, "https://api.iwaiter.net");
  await assertPublicUrl(url);
  const response = await fetchWithTimeoutMs(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json,text/plain;q=0.7,*/*;q=0.5",
    },
  }, iwaiterTimeoutMs);

  if (!response.ok) {
    throw new Error(`iWaiter API returned ${response.status}`);
  }

  const text = await readLimitedText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("iWaiter API returned unreadable JSON");
  }
}

function iwaiterText(record: Record<string, unknown>, keys: string[], lang: string) {
  const preferredKeys =
    lang === "en"
      ? keys.flatMap((key) => [key.endsWith("_en") ? key : `${key}_en`, key])
      : lang === "ar"
        ? keys.flatMap((key) => [key.replace(/_en$/i, ""), key])
        : keys;

  return yallaText(record, Array.from(new Set(preferredKeys)));
}

function iwaiterBranchPrice(record: Record<string, unknown>, branchId: string) {
  const branchPrices = recordArray(record.branchPrices);
  if (branchId && branchPrices.length) {
    const branchPrice = branchPrices.find((item) => {
      const candidate = String(item.branchId ?? item.branch_id ?? item.branch ?? "").trim();
      return candidate === branchId;
    });
    if (branchPrice) {
      const price = yallaNumber(branchPrice, ["price", "amount", "cost", "finalPrice", "newPrice"]);
      if (price != null) return price;
    }
  }

  return yallaNumber(record, ["price", "amount", "cost", "finalPrice", "newPrice"]);
}

function iwaiterImage(record: Record<string, unknown>) {
  const images = recordArray(record.images);
  const firstImage = images.find((item) => typeof item.url === "string" && item.url.trim());
  if (firstImage?.url) return String(firstImage.url).trim();
  return yallaText(record, ["image_url", "imageUrl", "image", "photo", "photo_url", "thumbnail"]);
}

function isIWaiterUnavailable(record: Record<string, unknown>, branchId: string) {
  if (record.isAvailable === false || record.isSoldOut === true) return true;
  if (!branchId) return false;
  const unavailableIds = [...recordArray(record.notAvailableIn), ...recordArray(record.soldOutIn)];
  if (unavailableIds.some((item) => String(item.id ?? item._id ?? item.branchId ?? "").trim() === branchId)) return true;
  const rawUnavailable = [...(Array.isArray(record.notAvailableIn) ? record.notAvailableIn : []), ...(Array.isArray(record.soldOutIn) ? record.soldOutIn : [])];
  return rawUnavailable.some((item) => String(item ?? "").trim() === branchId);
}

async function analyzeIWaiterMenu(sourceUrl: string): Promise<MenuImportAnalysis> {
  const baseUrl = new URL(sourceUrl.trim());
  const hints = iwaiterPathParts(baseUrl);
  if (!hints.slug) {
    return buildAnalysis(
      [],
      {
        sourceUrl,
        finalUrl: sourceUrl,
        visitedUrls: [sourceUrl],
        contentType: "text/html",
        adapter: "iwaiter",
        recognized: true,
        segments: hints.segments,
      },
      ["تم التعرف على رابط iWaiter، لكن لم يتم العثور على slug المطعم داخل الرابط."]
    );
  }

  let payload: unknown;
  try {
    payload = await fetchIWaiterJson(hints.slug);
  } catch {
    throw new Error("تعذر استخراج المنيو تلقائيًا، أرسل الرابط للفريق التقني");
  }
  const restaurant =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).restaurant as Record<string, unknown> | undefined)
      : undefined;
  const categories = recordArray(restaurant?.menu);
  const items: ExtractedMenuItem[] = [];
  const seenItems = new Set<string>();

  for (const category of categories) {
    const categoryUnavailable = isIWaiterUnavailable(category, hints.branchId);
    const categoryName = iwaiterText(category, ["name", "title"], hints.lang) || "غير مصنف";
    for (const food of recordArray(category.foods)) {
      const productName = iwaiterText(food, ["name", "title"], hints.lang);
      if (!productName) continue;
      const price = iwaiterBranchPrice(food, hints.branchId);
      const unavailable = categoryUnavailable || isIWaiterUnavailable(food, hints.branchId);
      const duplicateKey = `${String(category.categoryId ?? categoryName).trim().toLowerCase()}:${String(food.foodId ?? productName).trim().toLowerCase()}`;
      if (seenItems.has(duplicateKey)) continue;
      seenItems.add(duplicateKey);

      items.push({
        productName,
        categoryName,
        description: iwaiterText(food, ["description", "desc"], hints.lang) || null,
        price,
        calories: yallaNumber(food, ["calories", "calorie", "kcal"]),
        imageUrl: iwaiterImage(food) || null,
        metadata: {
          sourceUrl,
          extraction: "iwaiter-api",
          restaurantSlug: hints.slug,
          restaurantId: restaurant?._id == null ? null : String(restaurant._id),
          branchId: hints.branchId || null,
          tableOrMenuId: hints.tableOrMenuId || null,
          sourceCategoryId: category.categoryId == null ? null : String(category.categoryId),
          sourceItemId: food.foodId == null ? null : String(food.foodId),
          unavailable,
        },
        status: price == null || unavailable ? "needs_review" : "ready",
      });
    }
  }

  const notes = items.length
    ? ["تم استخراج المنتجات من واجهة iWaiter العامة بناءً على slug الرابط، مع حفظ معرف الفرع إن وجد."]
    : ["تم التعرف على رابط iWaiter، لكن لم يتم العثور على منتجات واضحة في واجهته العامة."];

  return buildAnalysis(
    items,
    {
      sourceUrl,
      finalUrl: sourceUrl,
      visitedUrls: [new URL(`/api/v1/restaurants/${encodeURIComponent(hints.slug)}`, "https://api.iwaiter.net").toString()],
      contentType: "application/json",
      adapter: "iwaiter",
      restaurantSlug: hints.slug,
      restaurantId: restaurant?._id == null ? null : String(restaurant._id),
      branchId: hints.branchId || null,
      tableOrMenuId: hints.tableOrMenuId || null,
      categoriesFound: categories.length,
    },
    notes
  );
}

function stripTags(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function stripPriceFromText(value: string) {
  return value.replace(/(?:SAR|SR|ر\.س|ريال|﷼)?\s*\d{1,4}(?:[.,]\d{1,2})?\s*(?:SAR|SR|ر\.س|ريال|﷼)?/i, " ").replace(/\s+/g, " ").trim();
}

function extractAttribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"))?.[1] ?? "";
}

function extractMetaContent(html: string, name: string) {
  const pattern = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  return decodeHtmlEntities(html.match(pattern)?.[1] ?? "").trim();
}

function extractPhpPageTitle(html: string, url: URL) {
  const heading =
    stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    stripTags(html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "") ||
    stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    extractMetaContent(html, "og:title");
  const param = phpCatalogParam(url);
  return heading || (param ? `تصنيف ${param.value}` : "غير مصنف");
}

function extractFirstImageFromBlock(block: string, baseUrl: string) {
  const imgTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
  if (!imgTag) return null;
  const src =
    extractAttribute(imgTag, "src") ||
    extractAttribute(imgTag, "data-src") ||
    extractAttribute(imgTag, "data-lazy-src") ||
    extractAttribute(imgTag, "data-original");
  return src ? absolutizeUrl(src, baseUrl) : null;
}

function extractDescriptionFromBlock(block: string, productName: string) {
  const descriptionBlock =
    block.match(/<p\b[^>]*class=["'][^"']*(?:desc|description|details)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
    block.match(/<div\b[^>]*class=["'][^"']*(?:desc|description|details)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    "";
  const description = stripTags(descriptionBlock);
  if (description && description !== productName && parsePrice(description) == null) return description;

  const lines = htmlToText(block)
    .split(/\r?\n/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return (
    lines.find((line) => line !== productName && parsePrice(line) == null && line.length > 8 && line.length < 180) ??
    null
  );
}

function extractProductNameFromBlock(block: string, priceText: string) {
  const explicit =
    stripTags(block.match(/<h[1-5]\b[^>]*>([\s\S]*?)<\/h[1-5]>/i)?.[1] ?? "") ||
    stripTags(block.match(/<[^>]*class=["'][^"']*(?:name|title|product-title|item-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "");
  if (explicit) return stripPriceFromText(explicit);

  const lines = htmlToText(block)
    .split(/\r?\n/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const priceLineIndex = lines.findIndex((line) => line === priceText || parsePrice(line) !== null);
  const candidate =
    priceLineIndex > 0
      ? lines[priceLineIndex - 1]
      : lines.find((line) => parsePrice(line) == null && line.length >= 2 && line.length <= 90) ?? "";
  return stripPriceFromText(candidate);
}

function extractPhpCatalogItemsFromHtml(html: string, pageUrl: string, categoryName: string) {
  const items: ExtractedMenuItem[] = [];
  const blockPattern =
    /<(article|li|tr)\b[^>]*>([\s\S]*?)<\/\1>|<div\b[^>]*class=["'][^"']*(?:product|menu-item|food|dish|meal|item)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[2] ?? match[3] ?? "";
    const text = stripTags(block);
    const price = parsePrice(text);
    if (price == null) continue;

    const priceText = text.match(/(?:SAR|SR|ر\.س|ريال|﷼)?\s*\d{1,4}(?:[.,]\d{1,2})?\s*(?:SAR|SR|ر\.س|ريال|﷼)?/i)?.[0] ?? "";
    const productName = extractProductNameFromBlock(block, priceText);
    if (!productName || productName.length < 2) continue;

    items.push({
      categoryName,
      productName,
      description: extractDescriptionFromBlock(block, productName),
      price,
      imageUrl: extractFirstImageFromBlock(block, pageUrl),
      metadata: { sourceUrl: pageUrl, extraction: "php-catalog-html-block" },
      status: "needs_review",
    });
  }

  const textItems = parseMenuItemsFromText(htmlToText(html), pageUrl).map((item) => ({
    ...item,
    categoryName: item.categoryName && item.categoryName !== "غير مصنف" ? item.categoryName : categoryName,
    metadata: { ...(item.metadata ?? {}), extraction: "php-catalog-text" },
  }));

  const images = extractImages(html, pageUrl);
  return attachImages([...items, ...textItems], images);
}

function extractPhpCategoryLinks(html: string, baseUrl: URL) {
  const links: string[] = [];
  const seen = new Set<string>([baseUrl.toString()]);

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = decodeHtmlEntities(match[1] ?? "").trim();
    if (!href) continue;
    let next: URL;
    try {
      next = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (next.origin !== baseUrl.origin || !isPhpCatalogUrl(next)) continue;
    const normalized = next.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    links.push(normalized);
    if (links.length >= maxPhpCategoryPages) break;
  }

  return links;
}

async function analyzePhpCatalogMenu(sourceUrl: string): Promise<MenuImportAnalysis> {
  const source = new URL(sourceUrl.trim());
  let firstPage: Awaited<ReturnType<typeof fetchPhpCatalogUrl>>;
  try {
    firstPage = await fetchPhpCatalogUrl(source);
  } catch {
    throw new Error(phpCatalogFailureMessage);
  }

  const firstUrl = new URL(firstPage.finalUrl);
  const categoryLinks = extractPhpCategoryLinks(firstPage.text, firstUrl);
  const extraPages = await Promise.all(
    categoryLinks.map(async (link) => {
      try {
        return await fetchPhpCatalogUrl(new URL(link));
      } catch {
        return null;
      }
    })
  );

  const pages = [firstPage, ...extraPages.filter((page): page is typeof firstPage => Boolean(page))];
  const items = pages.flatMap((page) => {
    const pageUrl = new URL(page.finalUrl);
    const categoryName = extractPhpPageTitle(page.text, pageUrl);
    return extractPhpCatalogItemsFromHtml(page.text, page.finalUrl, categoryName);
  });

  if (!items.length) {
    throw new Error(phpCatalogFailureMessage);
  }

  return buildAnalysis(
    items,
    {
      sourceUrl,
      finalUrl: firstPage.finalUrl,
      visitedUrls: pages.flatMap((page) => page.visited),
      contentType: firstPage.contentType,
      adapter: "php-catalog",
      categoryLinksFound: categoryLinks.length,
      pagesRead: pages.length,
    },
    ["تم استخراج المنتجات من صفحة PHP catalog مع قراءة عدد محدود من روابط التصنيفات المتاحة."]
  );
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
  const parsedUrl = new URL(sourceUrl.trim());
  if (isYallaQrCodesUrl(parsedUrl)) {
    return analyzeYallaQrCodesMenu(sourceUrl);
  }
  if (isIWaiterUrl(parsedUrl)) {
    return analyzeIWaiterMenu(sourceUrl);
  }
  if (isPhpCatalogUrl(parsedUrl)) {
    return analyzePhpCatalogMenu(sourceUrl);
  }

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
