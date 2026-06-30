type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const encodedSlug = encodeURIComponent(slug);
  const cacheName = `barndaksa-customer-${encodedSlug}-v2`;
  const cafeScope = `/c/${encodedSlug}`;
  const cafeScopeWithSlash = `/c/${encodedSlug}/`;
  const appScope = `/app/${encodedSlug}`;
  const appScopeWithSlash = `/app/${encodedSlug}/`;
  const fastApiPath = `/api/customer-fast/${encodedSlug}`;

  const body = `
const CACHE_NAME = ${JSON.stringify(cacheName)};
const CAFE_SCOPE = ${JSON.stringify(cafeScope)};
const CAFE_SCOPE_WITH_SLASH = ${JSON.stringify(cafeScopeWithSlash)};
const APP_SCOPE = ${JSON.stringify(appScope)};
const APP_SCOPE_WITH_SLASH = ${JSON.stringify(appScopeWithSlash)};
const FAST_API_PATH = ${JSON.stringify(fastApiPath)};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('barndaksa-customer-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'BARNDAKSA_PWA_REFRESH') {
    event.waitUntil((async () => {
      await caches.delete(CACHE_NAME);
      if (self.registration && self.registration.update) {
        await self.registration.update();
      }
    })());
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const requestPromise = fetch(request).then((response) => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || requestPromise;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCafePage = url.pathname === CAFE_SCOPE || url.pathname.startsWith(CAFE_SCOPE_WITH_SLASH);
  const isAppPage = url.pathname === APP_SCOPE || url.pathname.startsWith(APP_SCOPE_WITH_SLASH);
  const isFastApi = url.pathname === FAST_API_PATH;
  const isBrandAsset = url.pathname.startsWith('/brand/');
  const isCafeIcon = url.pathname === '/api/public/cafe/${encodedSlug}/favicon';

  if (isFastApi) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCafePage || isAppPage || isBrandAsset || isCafeIcon) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
