/* POS-only offline shell. No API mutations or authenticated HTML are cached. */
const STATIC = "branda-pos-static-v1";
const SHELL = "/finance/offline";
const publicAsset = url => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/"));
const localDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
async function staticAsset(request) {
  const cache = await caches.open(STATIC);
  // Development chunk URLs are reused after edits, unlike production content hashes.
  // Refresh them online while keeping the existing offline fallback and sales data.
  if (localDevelopment && new URL(request.url).pathname.startsWith("/_next/static/")) {
    try {
      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  }
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
async function currentSession() {
  return new Promise(resolve => {
    const request = indexedDB.open("branda-pos-v1");
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta") || !db.objectStoreNames.contains("sessions")) { db.close(); resolve(null); return; }
      const tx = db.transaction(["meta", "sessions"]), active = tx.objectStore("meta").get("active");
      active.onsuccess = () => {
        if (!active.result) { resolve(null); return; }
        const session = tx.objectStore("sessions").get(active.result); session.onsuccess = () => resolve(session.result || null);
      };
      tx.oncomplete = () => db.close(); tx.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}
async function warmShell() {
  const cache = await caches.open(STATIC);
  const response = await fetch(SHELL, { cache: "reload", credentials: "omit" });
  if (!response.ok || response.redirected) throw Error("Offline shell unavailable");
  const html = await response.clone().text();
  // Only a public, data-free shell is stored; fetch its actual build assets before declaring readiness.
  const paths = new Set([...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;", "&"), self.location.origin)).filter(publicAsset).map(url => url.href));
  paths.add(new URL("/fonts/tajawal-regular.ttf", self.location.origin).href);
  paths.add(new URL("/fonts/tajawal-bold.ttf", self.location.origin).href);
  for (const url of paths) { const asset = await fetch(url, { cache: "reload" }); if (!asset.ok) throw Error("Offline asset unavailable"); await cache.put(url, asset); }
  await cache.put(SHELL, response);
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (event.data?.type !== "PREPARE_POS") return;
  event.waitUntil(warmShell().then(() => event.ports[0]?.postMessage({ ok: true })).catch(() => event.ports[0]?.postMessage({ ok: false })));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET") return;
  if (publicAsset(url)) {
    event.respondWith(staticAsset(request));
    return;
  }
  const isPos = /^\/finance\/[^/]+\/pos\/?$/.test(url.pathname) || url.pathname === SHELL;
  if (request.mode === "navigate" && url.origin === self.location.origin && isPos) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch { const cached = await (await caches.open(STATIC)).match(SHELL); return cached || new Response("افتح الكاشير مرة أثناء الاتصال لتجهيزه للعمل دون إنترنت", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
    })());
    return;
  }
  if (request.destination === "image" || (url.origin === self.location.origin && /^\/api\/finance\/[^/]+\/media$/.test(url.pathname))) event.respondWith((async () => {
    const session = await currentSession();
    const permitted = session && session.snapshot.products.some(product => product.imageUrl && new URL(product.imageUrl, self.location.origin).href === url.href);
    try { const response = await fetch(request); if (permitted && (response.ok || response.type === "opaque")) await (await caches.open(`branda-pos-media-${session.scope}`)).put(request, response.clone()); return response; }
    catch { if (permitted) { const cached = await (await caches.open(`branda-pos-media-${session.scope}`)).match(request); if (cached) return cached; } throw Error("Image unavailable"); }
  })());
});
