// sw.js — make "you can always just go to the chat" literally true.
//
// The bones are static, so they can live in the cache and boot with no network.
// That matters most in the case this page exists for: you have a brainstem
// burrowed on this device, and the thing that is unreachable is GitHub, not you.
// An installed copy still boots and still hands you through to localhost.

'use strict';

const CACHE = 'rapp-chat-v1';
const SHELL = [
  './',
  './index.html',
  './burrow.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ── Never touch the burrow probe ────────────────────────────────────────────
  // This is the important line in the file. The probe is a cross-origin no-cors
  // GET to http://127.0.0.1:<port>/health, and its ONLY signal is whether the
  // network answered. If a service worker ever answered it from cache, a
  // successful probe would be replayed forever and the page would report a
  // brainstem that is no longer running — turning a live-liveness check into a
  // stale recording. Anything not same-origin goes straight to the network,
  // untouched and uncached.
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.method !== 'GET') return;

  // Network-first so a burrow-detection fix reaches an installed copy on the
  // next online load; cache is the fallback, not the default.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
