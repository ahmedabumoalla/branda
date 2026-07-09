export async function GET() {
  const body = `
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (!request || request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (request.mode === 'navigate' && /^\/c\/[^/]+\/play\/table-wars\/?$/.test(url.pathname)) {
    return;
  }

  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === 'navigate') {
        return new Response('', {
          status: 504,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response('', {
        status: 504,
        statusText: 'Offline',
      });
    })
  );
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
