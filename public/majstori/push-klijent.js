/* Uključivanje obavještenja. Koriste ga i majstorska aplikacija i panel. */

function base64UBajtovi(base64) {
  const dopuna = "=".repeat((4 - (base64.length % 4)) % 4);
  const cisto = (base64 + dopuna).replace(/-/g, "+").replace(/_/g, "/");
  const sirovo = atob(cisto);
  return Uint8Array.from([...sirovo].map((z) => z.charCodeAt(0)));
}

/** Da li su obavještenja već uključena na ovom uređaju. */
async function pushUkljucen() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/**
 * Traži dozvolu, pretplati uređaj i javi serveru.
 * Vraća { ok } ili { ok: false, razlog }.
 */
async function ukljuciPush(api) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, razlog: "Ovaj pregledač ne podržava obavještenja." };
  }

  // Na iPhoneu rade samo kad je aplikacija dodata na početni ekran.
  const naPocetnom = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  const jeIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (jeIOS && !naPocetnom) {
    return {
      ok: false,
      razlog: "Na iPhoneu prvo dodajte stranicu na početni ekran " +
              "(dugme za dijeljenje → Dodaj na početni ekran), pa onda uključite obavještenja.",
    };
  }

  const dozvola = await Notification.requestPermission();
  if (dozvola !== "granted") {
    return { ok: false, razlog: "Niste dozvolili obavještenja u pregledaču." };
  }

  const reg = await navigator.serviceWorker.ready;
  let pretplata = await reg.pushManager.getSubscription();

  if (!pretplata) {
    const { kljuc } = await api("/api/push-kljuc");
    if (!kljuc) return { ok: false, razlog: "Obavještenja još nisu podešena na serveru." };

    pretplata = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UBajtovi(kljuc),
    });
  }

  await api("/api/push-prijava", {
    method: "POST",
    body: JSON.stringify({ pretplata: pretplata.toJSON() }),
  });

  return { ok: true };
}

/** Isključuje na ovom uređaju. */
async function iskljuciPush(api) {
  const reg = await navigator.serviceWorker.getRegistration();
  const p = await reg?.pushManager.getSubscription();
  if (!p) return;

  await api("/api/push-odjava", {
    method: "POST",
    body: JSON.stringify({ endpoint: p.endpoint }),
  }).catch(() => {});
  await p.unsubscribe().catch(() => {});
}
