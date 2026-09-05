const CACHE = "finanzas-en-pareja-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    "/Finanzas-en-pareja/",
    "/Finanzas-en-pareja/manifest.json",
    "/Finanzas-en-pareja/icon.png"
  ])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/Finanzas-en-pareja/")));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title ?? "Finanzas en Pareja", {
    body: data.body ?? "Hay un nuevo movimiento en la cuenta.",
    icon: "/Finanzas-en-pareja/icon.png",
    badge: "/Finanzas-en-pareja/icon.png",
    tag: data.transactionId ?? "nuevo-movimiento",
    data: { url: "/Finanzas-en-pareja/", transactionId: data.transactionId }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.includes("/Finanzas-en-pareja/"));
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url ?? "/Finanzas-en-pareja/");
  }));
});
