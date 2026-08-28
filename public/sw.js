/* K9CLONE service worker — app shell cache so a cold launch works with no network.
 *
 * Strategy, deliberately network-first: every record already lives in IndexedDB, so what the
 * cache is for is the *shell* (HTML, JS bundle, fonts, icons). Network-first means a code change
 * is never masked by a stale cache during development, while an offline launch still finds a
 * complete shell in the cache and boots straight into the signed-in app.
 */
// Bumped to v2 so the incomplete v1 shell (document cached without its bundle) is discarded by the
// activate handler rather than lingering and booting to a white screen.
const VERSION = 'k9clone-v2';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/**
 * Everything here is resolved against the worker's OWN location rather than the domain root, because
 * the app is served from a subpath on GitHub Pages (/k9clone/) and from the root in local dev. A
 * hard-coded '/' would cache the wrong document on Pages and the shell would never assemble.
 */
const ROOT = new URL('./', self.location).href;
const at = (p) => new URL(p, ROOT).href;

/** Requests worth having before the first offline launch. ROOT is the SPA document every route serves. */
const PRECACHE = [
  at('./'),
  at('./manifest.webmanifest'),
  at('./icons/icon-192.png'),
  at('./icons/icon-512.png'),
  at('./icons/icon-maskable-192.png'),
  at('./icons/icon-maskable-512.png'),
  at('./icons/apple-touch-icon.png'),
  at('./icons/favicon-48.png'),
];

/** Marker written only once the shell is genuinely complete — see offlineDocument(). */
const READY_KEY = '__shell_ready'; // resolved against ROOT at use, see at()

/**
 * The shell's own script and stylesheet URLs, read out of the served document.
 *
 * These CANNOT be hard-coded: their names are content-hashed and change on every build. They also
 * cannot be picked up by the fetch handler, because the browser requests them while parsing the very
 * first document — before this worker controls the page. Caching '/' without them stores a document
 * whose every asset is missing, which is why an offline launch rendered a blank white screen.
 */
function shellAssetUrls(html) {
  const urls = new Set();
  const add = (raw) => {
    if (!raw) return;
    try {
      const u = new URL(raw, self.location.origin);
      if (u.origin === self.location.origin) urls.add(u.pathname + u.search);
    } catch { /* a malformed src is not worth failing the install over */ }
  };
  let m;
  const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
  while ((m = scriptRe.exec(html))) add(m[1]);
  const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(html))) { if (/rel=["']?(stylesheet|preload|modulepreload)/i.test(m[0])) add(m[1]); }
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // addAll() is all-or-nothing; one 404 would leave the whole install unusable.
      // Clone into the cache so the original response body stays readable here.
      const put = (url) =>
        fetch(url, { cache: 'reload' })
          .then((res) => (res && res.ok ? cache.put(url, res.clone()).then(() => res) : null))
          .catch(() => null);

      // The document goes first: it is the only place the hashed asset names exist.
      const doc = await put(at('./'));
      let assetsOk = false;
      if (doc) {
        const assets = shellAssetUrls(await doc.text());
        const got = await Promise.all(assets.map(put));
        // A shell without its bundle is worse than no shell — it boots to white instead of saying why.
        assetsOk = assets.length > 0 && got.every(Boolean);
      }
      await Promise.all(PRECACHE.filter((u) => u !== at('./')).map(put));
      if (assetsOk) await cache.put(at(READY_KEY), new Response('ok'));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  // The page tells us what it loaded before we were controlling it — see public/index.html. Without
  // this, a first visit leaves the icon font uncached and the offline app renders with blank glyphs.
  if (event.data && event.data.type === 'WARM_CACHE' && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(RUNTIME).then(async (cache) => {
        await Promise.all(
          event.data.urls.map(async (url) => {
            try {
              if (await cache.match(url)) return;
              const res = await fetch(url, { cache: 'no-cache' });
              if (res && res.ok && res.type === 'basic') await cache.put(url, res);
            } catch { /* a warm-up miss is not worth failing over */ }
          }),
        );
      }),
    );
  }
});

/** The document to fall back on when a navigation cannot reach the network. */
async function offlineDocument(request) {
  const shell = await caches.open(SHELL);
  // Only serve a cached document if its scripts and styles were cached too. Serving '/' without them
  // renders a blank white screen AND masks the explanation below, so the user sees nothing at all
  // and has no idea the app needed one connected visit to store itself.
  const ready = await shell.match(at(READY_KEY));
  const cached = ready
    ? (await shell.match(request, { ignoreSearch: true })) ||
      (await shell.match(at('./'))) ||
      (await caches.open(RUNTIME).then((c) => c.match(at('./'))))
    : null;
  return (
    cached ||
    new Response(
      '<!doctype html><meta charset="utf-8"><title>K9CLONE is offline</title>' +
        '<body style="font:16px system-ui;padding:24px;background:#14524A;color:#fff">' +
        '<h1>K9CLONE is offline</h1><p>Open the app once while connected so it can store itself on this device.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
    )
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles, weather — never our business
  if (url.pathname.startsWith('/_expo/ws') || url.pathname.startsWith('/hot')) return; // dev sockets

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) (await caches.open(SHELL)).put(at('./'), res.clone());
          return res;
        } catch {
          return offlineDocument(request);
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res && res.ok && res.type === 'basic') {
          const cache = await caches.open(RUNTIME);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const hit = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
        if (hit) return hit;
        throw new Error(`offline and not cached: ${url.pathname}`);
      }
    })(),
  );
});
