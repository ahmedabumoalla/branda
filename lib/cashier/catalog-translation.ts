import "server-only";
import { createHash } from "node:crypto";
import type { LocalizedText } from "./language";
export type CashierCatalog = { fields: Record<string, LocalizedText>; unavailable: boolean };
const translations = new Map<string, { value: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
const arabic = /[\u0600-\u06ff]/;
async function translate(text: string, target: "ar" | "en") {
  const key = createHash("sha256").update(target + ":" + text).digest("hex");
  const cached = translations.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    // Existing catalog provider, with bounded latency and caching
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", sl: "auto", tl: target, dt: "t", q: text }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error("CATALOG_TRANSLATION_UNAVAILABLE");
    const body: unknown = await response.json();
    const value = Array.isArray(body) && Array.isArray(body[0]) ? body[0].map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("").trim() : "";
    if (!value || (target === "en" && arabic.test(value))) throw new Error("CATALOG_TRANSLATION_UNAVAILABLE");
    if (translations.size >= 2000) translations.delete(translations.keys().next().value!);
    translations.set(key, { value, expires: Date.now() + 86_400_000 });
    return value;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
/** Only authorized database catalog snapshots, never customer names, phones or codes */
export async function localizeCashierCatalog(input: Record<string, string>): Promise<CashierCatalog> {
  let unavailable = false;
  const entries = await Promise.all(Object.entries(input).slice(0, 4).map(async ([key, source]) => {
    const localized = { ar: source, en: source };
    if (source.trim() && source.length <= 4000) {
      const target = arabic.test(source) ? "en" : "ar";
      try { localized[target] = await translate(source, target); } catch { unavailable = true; }
    } else if (source.length > 4000) unavailable = true;
    return [key, localized] as const;
  }));
  return { fields: Object.fromEntries(entries), unavailable };
}
