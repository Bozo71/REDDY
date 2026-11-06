/* Service worker za aplikaciju firmi. Bez njega „dodaj na početni ekran"
   ne radi. Kešira samo izgled — prijave se mijenjaju u minut i nikad ne
   smiju doći iz keša. */

const KES = "reddy-firme-v1";
const OKVIR = [
  "/firme/", "/firme/index.html", "/firme/stil.css", "/firme/app.js",
  "/firme/manifest.json", "/majstori/stil.css", "/majstori/push-klijent.js",
  "/majstori/ikona-192.png",
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

  if (adresa.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((odgovor) => {
        const kopija = odgovor.clone();
        caches.open(KES).then((k) => k.put(e.request, kopija)).catch(() => {});
        return odgovor;
      })
      .catch(() => caches.match(e.request).then((p) => p ?? caches.match("/firme/index.html"))),
  );
});

self.addEventListener("push", (e) => {
  let podaci = { naslov: "REDDY", tekst: "Nešto novo o vašoj prijavi.", putanja: "/firme" };
  try { podaci = { ...podaci, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(podaci.naslov, {
      body: podaci.tekst,
      icon: "/majstori/ikona-192.png",
      badge: "/majstori/ikona-192.png",
      vibrate: [120, 60, 120],
      data: { putanja: podaci.putanja },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const putanja = e.notification.data?.putanja ?? "/firme";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const k of lista) {
        if (k.url.includes(self.location.origin)) {
          return k.navigate ? k.navigate(putanja).then((x) => x?.focus()) : k.focus();
        }
      }
      return self.clients.openWindow(putanja);
    }),
  );
});
