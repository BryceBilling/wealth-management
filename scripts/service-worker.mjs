import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = await readdir("dist/assets");
const files = [
  "/",
  "/index.html",
  "/logo.svg",
  "/sql-wasm.wasm",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  ...assets.map((a) => "/assets/" + a),
];
const version = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex")
  .slice(0, 16);
await writeFile(
  "dist/sw.js",
  `
const CACHE = 'tandem-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  for (const path of FILES) {
    const response = await fetch(path, { cache: 'reload' });
    if (!response.ok || response.redirected) throw new Error('App download requires sign-in');
    await cache.put(path, response);
  }
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('tandem-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-transfer') {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const text = ['url', 'text', 'title'].map(key => String(form.get(key) || '')).join(' ');
      for (const candidate of text.match(/https?:\\/\\/[^\\s<>]+/g) || []) {
        try {
          const target = new URL(candidate);
          const token = new URLSearchParams(target.hash.slice(1)).get('transfer');
          if (target.origin === self.location.origin && target.pathname === '/' && token && /^[A-Za-z0-9_-]{43}$/.test(token))
            return Response.redirect(self.location.origin + '/#transfer=' + token, 303);
        } catch {}
      }
      return Response.redirect(self.location.origin + '/#invalid-transfer', 303);
    })());
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.pathname)) || fetch(event.request);
  })());
});
`,
);
