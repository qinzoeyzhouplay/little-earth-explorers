/* Offline support. The list of files to keep is read from the data files themselves,
   so a new chapter or a swapped picture needs no change here.
   Files are served from the saved copy first and refreshed in the background:
   after you replace a file, open the game twice while online to see the new one. */
const CACHE = 'lee-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'js/core.js', 'js/levels.js', 'js/app.js', 'manifest.webmanifest',
  'data/game.json', 'data/chapters.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
  const game = await (await fetch('data/game.json')).json();
  const texts = [JSON.stringify(game), await (await fetch('data/chapters.json')).text()];
  const langs = (game.languages || ['en']).map(l => 'lang/' + l + '.json');
  for (const l of langs) { try { const r = await fetch(l); if (r.ok) { texts.push(await r.clone().text()); await cache.put(l, r); } } catch (e) {} }
  const paths = new Set();
  for (const t of texts) for (const m of t.matchAll(/"(assets\/[^"]+)"/g)) paths.add(m[1]);
  // Missing files (for example voice recordings not made yet) are simply skipped.
  await Promise.all([...paths].map(p => fetch(p).then(r => { if (r.ok) return cache.put(p, r); }).catch(() => {})));
}
self.addEventListener('install', e => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit || new Response('', { status: 404 }));
    return hit || fresh;
  }));
});
