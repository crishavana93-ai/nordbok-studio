/* public/sw.js — Nordbök Studio service worker.
 *
 * WHY THIS WAS REWRITTEN 2026-08-22
 *
 * The previous version answered EVERY GET cache-first:
 *
 *     caches.match(req).then((cached) => cached || fetch(req))
 *
 * Once a URL was in the cache it was served forever and never revalidated. Because
 * it also cached HTML, an installed PWA pinned the app shell of whatever build
 * happened to be live the first time it ran — and that HTML referenced hashed JS and
 * CSS filenames which were themselves cached. The installed app could therefore never
 * see a new deploy. Not the next one, not any of them.
 *
 * It compounded: the cache NAME was a constant, so the activate handler's cleanup
 * (delete every cache whose key !== SHELL) never matched anything and never ran.
 *
 * THE RULE NOW
 *   HTML (navigations)  → network first. A deploy must be visible on the next launch.
 *                         Cache is the offline fallback only.
 *   /_next/static/*     → cache first. These filenames contain a content hash, so a
 *                         changed file is a different URL. Safe to keep forever.
 *   icons, manifest     → stale-while-revalidate. Fine slightly old, refreshed quietly.
 *   /api/*              → never touched.
 *
 * BUMP `VERSION` when changing this file. The name change is what purges the old
 * caches on activate.
 */

const VERSION = "2026-08-24e";
const CACHE = `nordbok-${VERSION}`;
const OFFLINE_FALLBACK = "/dashboard";

/* Deliberately NOT pre-caching any HTML. Pre-caching /dashboard is what pinned the
 * old shell in the first place. Only genuinely static assets go in up front. */
const PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}
function isStaticish(url) {
  return PRECACHE.includes(url.pathname) || /\.(png|svg|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch third parties
  if (url.pathname.startsWith("/api/")) return;      // never cache data

  /* 1 — Navigations: network first, so a deploy lands immediately. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () =>
          (await caches.match(req)) ||
          (await caches.match(OFFLINE_FALLBACK)) ||
          new Response(
            "<!doctype html><meta charset='utf-8'><title>Offline</title>" +
            "<body style='font:16px system-ui;padding:2rem'>Du är offline. Öppna appen igen när du har täckning.</body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          )
        )
    );
    return;
  }

  /* 2 — Hashed build output: cache first. A new build is a new URL. */
  if (isImmutableAsset(url)) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  /* 3 — Icons and manifest: serve what we have, refresh in the background. */
  if (isStaticish(url)) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  /* 4 — Everything else goes to the network untouched. */
});

/* ── Push ─────────────────────────────────────────────────────────────────── */
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || "Nordbök Studio";
  const body = data.body || "";
  const url = data.url || "/dashboard";
  e.waitUntil(
    self.registration.showNotification(title, {
      body, data: { url }, badge: "/icon-192.png", icon: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/dashboard";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if (c.url.includes(target) && "focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* Lets the page ask a waiting worker to take over immediately. */
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
