import type { FinanceSnapshot } from "./brand-finance";
import type { ReceiptBrand } from "@/components/finance/finance-receipt-print";
import { posScope } from "./pos-offline";

const brandKey = (scope: string) => new Request(`${location.origin}/__pos-local-brand/${encodeURIComponent(scope)}`);
export async function cachedReceiptBrand(snapshot: FinanceSnapshot): Promise<ReceiptBrand | null> {
  try { const stored = await (await caches.open(`branda-pos-media-${posScope(snapshot)}`)).match(brandKey(posScope(snapshot))); return stored ? stored.json() : null; } catch { return null; }
}
const blobDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
export async function prepareOfflineAssets(snapshot: FinanceSnapshot) {
  if (!("serviceWorker" in navigator) || !("caches" in window)) throw new Error("المتصفح لا يدعم تجهيز الكاشير دون إنترنت");
  const registration = await navigator.serviceWorker.register("/finance-pos-sw.js", { scope: "/finance/" });
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) throw new Error("تعذر تجهيز نسخة الكاشير المحلية");
  if (worker.state !== "activated") await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("تأخر تجهيز الكاشير المحلي")), 20_000); worker.addEventListener("statechange", () => { if (worker.state === "activated") { clearTimeout(timeout); resolve(); } }); });
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel(), timeout = setTimeout(() => reject(new Error("تعذر حفظ ملفات الكاشير محليًا")), 45_000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); if (event.data?.ok) resolve(); else reject(new Error("تعذر حفظ ملفات الكاشير محليًا")); };
    worker.postMessage({ type: "PREPARE_POS" }, [channel.port2]);
  }).catch(async error => {
    // A transport outage must not invalidate a complete shell from an earlier visit.
    if (!await (await caches.open("branda-pos-static-v1")).match("/finance/offline")) throw error;
  });
  const cache = await caches.open(`branda-pos-media-${posScope(snapshot)}`);
  // Bounded concurrency prevents a large menu from blocking the cashier or exhausting connections.
  const urls = [...new Set(snapshot.products.map(product => product.imageUrl).filter((url): url is string => !!url && ["http:", "https:"].includes(new URL(url, location.origin).protocol)))];
  let failed = 0, index = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (index < urls.length) { const url = urls[index++]; try { const old = await cache.match(url); if (old) continue; const external = new URL(url, location.origin).origin !== location.origin; const response = await fetch(url, { mode: external ? "no-cors" : "same-origin", signal: AbortSignal.timeout(15000) }); if (!response.ok && response.type !== "opaque") throw Error(); await cache.put(url, response); } catch { failed++; } }
  }));
  let brand = await cachedReceiptBrand(snapshot);
  try {
    const response = await fetch(`/api/finance/${encodeURIComponent(snapshot.cafe.slug)}/receipt-brand`, { cache: "no-store" });
    if (response.ok) {
      const next = await response.json() as ReceiptBrand;
      if (next.logoUrl) { const logo = await fetch(next.logoUrl); if (!logo.ok) throw Error(); next.logoUrl = await blobDataUrl(await logo.blob()); }
      await cache.put(brandKey(posScope(snapshot)), new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } })); brand = next;
    }
  } catch { /* Existing cached brand stays usable; printing has a named-brand fallback. */ }
  return { failedImages: failed, brand };
}
