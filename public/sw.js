// Mizan service worker: makes the app installable, keeps it opening when the
// connection drops, and shows push notifications. Paths are relative to the
// worker's location so the same file works under / and under /<repo>/ (Pages).
const VERSION = "mizan-v1";
const SHELL = new URL("./", self.location).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // never touch API calls, other origins (CDN) or non-GET requests: data must be live
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  // pages: network first, fall back to the cached app shell when offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === SHELL) caches.open(VERSION).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SHELL)))
    );
    return;
  }

  // build assets have content hashes in their names, so cache-first is safe
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "میزان";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      dir: "rtl",
      lang: "fa",
      icon: new URL("./icons/icon-192.png", self.location).href,
      badge: new URL("./icons/icon-192.png", self.location).href,
      data: { url: data.url || SHELL },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const shell = new URL(SHELL, self.location.origin);
  const target = new URL(event.notification.data?.url || "./", shell).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(shell.href));
      if (open) {
        open.navigate(target).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
