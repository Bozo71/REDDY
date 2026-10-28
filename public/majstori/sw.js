/* Service worker — bez njega „dodaj na početni ekran" ne radi.
   Namjerno ne kešira podatke: poslovi se mijenjaju u minut, a majstor
   nikad ne smije vidjeti stari spisak. Kešira samo izgled aplikacije. */

const KES = "reddy-majstori-v2";
const OKVIR = [
  "/majstori/", "/majstori/index.html", "/majstori/stil.css", "/majstori/app.js", "/majstori/ikona-192.png", "/majstori/manifest.json",
  "/majstori/admin.html", "/majstori/admin.js", "/majstori/manifest-admin.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KES).then((k) => k.addAll(OKVIR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((imena) => Promise.all(imena.filter((i) => i !== KES).map((i) => caches.delete(i))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const adresa = new URL(e.request.url);

  // Podaci uvijek sa servera, nikad iz keša.
  if (adresa.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((odgovor) => {
        const kopija = odgovor.clone();
        caches.open(KES).then((k) => k.put(e.request, kopija)).catch(() => {});
        return odgovor;
      })
      .catch(() => caches.match(e.request).then((p) => p ?? caches.match("/majstori/index.html"))),
  );
});

// Push obavještenje o novom poslu.
self.addEventListener("push", (e) => {
  let podaci = { naslov: "REDDY", tekst: "Stigao je nov posao." };
  try { podaci = { ...podaci, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(podaci.naslov, {
      body: podaci.tekst,
      icon: "/majstori/ikona-192.png",
      badge: "/majstori/ikona-192.png",
      vibrate: [120, 60, 120],
      tag: "nov-posao",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((lista) => {
      for (const k of lista) if (k.url.includes(self.location.origin)) return k.focus();
      return self.clients.openWindow("/majstori/");
    }),
  );
});
