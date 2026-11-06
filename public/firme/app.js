/* Aplikacija za firme sa više poslovnica.
   Poslovnica prijavljuje kvar, direktor gleda sve. Bez biblioteka, kao i
   majstorska — otvara se i na slaboj vezi u magacinu. */

const KLJUC = "reddy-firma-token";
let token = null;
try { token = localStorage.getItem(KLJUC); } catch {}

let ja = null;          // ko sam: poslovnica ili direktor
let zanati = [];        // struke iz baze, za izbor i za nazive

const el = (id) => document.getElementById(id);

async function api(putanja, opcije = {}) {
  const odgovor = await fetch(putanja, {
    ...opcije,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcije.headers,
    },
  });

  if (odgovor.status === 401) { naPrijavu(); throw new Error("Prijavite se ponovo."); }

  const telo = await odgovor.json().catch(() => ({}));
  if (!odgovor.ok) throw new Error(telo.greska ?? `Greška ${odgovor.status}.`);
  return telo;
}

function poruka(gdje, tekst, vrsta = "lose") {
  el(gdje).innerHTML = tekst ? `<div class="poruka ${vrsta}">${bezHtml(tekst)}</div>` : "";
}

/* ── Prijava ── */

el("forma-prijava").addEventListener("submit", async (e) => {
  e.preventDefault();
  poruka("greska-prijava", "");
  const dugme = e.target.querySelector("button");
  dugme.disabled = true;
  dugme.textContent = "Provjeravam…";

  try {
    const r = await api("/api/firma-prijava", {
      method: "POST",
      body: JSON.stringify({
        nadimak: el("p-nadimak").value,
        sifra: el("p-sifra").value,
      }),
    });
    token = r.token;
    try { localStorage.setItem(KLJUC, token); } catch {}
    await udji();
  } catch (greska) {
    poruka("greska-prijava", greska.message);
  } finally {
    dugme.disabled = false;
    dugme.textContent = "Uđi";
  }
});

el("dugme-izlaz").addEventListener("click", async () => {
  try { await api("/api/odjava", { method: "POST" }); } catch {}
  naPrijavu();
});

/* Ko je ušao sa početnog ekrana već je prijavljen — aplikacija se pokaže
   odmah, a podaci stignu u nju. Kod svježe prijave je obrnuto. */
async function udji(odmah = false) {
  if (odmah) {
    el("ekran-prijava").hidden = true;
    el("ekran-app").hidden = false;
    el("lista-prijave").innerHTML = '<div class="prazno">Učitavam…</div>';
  }

  const [ko] = await Promise.all([
    api("/api/firma-ja"),
    api("/api/kategorije")
      .then((r) => { zanati = r.kategorije ?? []; })
      .catch(() => {}),
  ]);
  ja = ko;

  el("ekran-prijava").hidden = true;
  el("ekran-app").hidden = false;

  prikaziKo();
  await ucitajPrijave();
}

function naPrijavu() {
  token = null;
  try { localStorage.removeItem(KLJUC); } catch {}
  document.documentElement.classList.remove("vec-prijavljen");
  el("ekran-prijava").hidden = false;
  el("ekran-app").hidden = true;
}

function prikaziKo() {
  const direktor = ja.vrsta === "direktor";

  el("s-naslov").textContent = direktor ? "Direktor" : "Poslovnica";
  el("s-ime").textContent = direktor ? ja.firma : (ja.poslovnica?.naziv ?? ja.ime);
  el("s-adresa").textContent = ja.poslovnica?.adresa ?? ja.firma;
  el("kutija-adresa").hidden = direktor;

  // Direktor samo gleda — dugme za prijavu kvara ne postoji za njega.
  el("dio-prijavi").hidden = direktor;
  el("naslov-spiska").textContent = direktor ? "Sve prijave" : "Moje prijave";
}

/* ── Spisak prijava ── */

const STANJA = {
  slobodan: ["ceka", "Čeka majstora"],
  kupljen: ["uzeo", "Majstor je uzeo"],
  zavrsen: ["gotov", "Završeno"],
};

async function ucitajPrijave() {
  const { prijave } = await api("/api/firma-prijave");
  el("s-broj").textContent = prijave.length;

  if (!prijave.length) {
    el("lista-prijave").innerHTML = ja.vrsta === "direktor"
      ? '<div class="prazno">Još nema nijedne prijave.</div>'
      : '<div class="prazno">Još niste prijavili nijedan kvar.</div>';
    return;
  }

  el("lista-prijave").innerHTML = prijave.map((p) => {
    const [tacka, tekst] = STANJA[p.status] ?? ["ceka", p.status];
    return `
      <article class="posao">
        <div class="posao-vrh">
          <span class="znak zuta">${bezHtml(nazivZanata(p.kategorija))}</span>
          ${ja.vrsta === "direktor"
            ? `<span class="znak">${bezHtml(p.poslovnica)}</span>` : ""}
        </div>
        <p class="posao-opis">${bezHtml(p.opis)}</p>
        ${p.slike?.length ? `<div class="slike">${p.slike.map((s) =>
          `<a href="${bezHtml(s)}" target="_blank" rel="noopener">
             <img src="${bezHtml(s)}" alt="Slika kvara" loading="lazy"></a>`).join("")}</div>` : ""}
        <div class="posao-red status">
          <span class="tacka ${tacka}"></span> ${tekst}
          ${p.majstor ? `— ${bezHtml(p.majstor)}` : ""}
        </div>
        ${p.majstor && p.majstor_telefon
          ? `<div class="posao-red">📞 <a href="tel:${bezHtml(p.majstor_telefon)}"
               style="font-weight:900;color:inherit">${formatBroj(p.majstor_telefon)}</a></div>`
          : ""}
        <div class="posao-red">🕐 ${datumSat(p.napravljen)}</div>
      </article>`;
  }).join("");
}

/* ── Prijava kvara ── */

el("dugme-nov-kvar").addEventListener("click", otvoriPrijavuKvara);

function otvoriPrijavuKvara() {
  let izabrana = zanati[0]?.id ?? "kucne_popravke";
  const slike = [];   // { ime, tip, podaci } — smanjene u pregledaču

  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <div class="korak-traka"><span class="gotov"></span><span></span></div>
      <h3>Šta ne radi?</h3>

      <div id="greska-kvar"></div>

      <div class="struke">
        ${zanati.map((z) => `
          <button type="button" class="struka${z.id === izabrana ? " izabrana" : ""}"
                  data-struka="${z.id}">${bezHtml(z.naziv)}</button>`).join("")}
      </div>

      <label class="polje">
        <span>Opišite kvar</span>
        <textarea id="k-opis" placeholder="Npr. ne hladi vitrina kod kase"></textarea>
      </label>

      <label class="polje">
        <span>Gdje tačno (nije obavezno)</span>
        <input id="k-gdje" placeholder="Npr. magacin, toalet, kuhinja">
      </label>

      <label class="polje">
        <span>Kad vam odgovara (nije obavezno)</span>
        <input id="k-termin" placeholder="Npr. prije 10h, poslije zatvaranja">
      </label>

      <label class="slika-polje">
        📷 Dodajte sliku
        <input id="k-slike" type="file" accept="image/*" multiple>
      </label>
      <div class="izabrane-slike" id="k-pregled"></div>

      <div class="poruka pazi" style="margin-bottom:0">
        Adresa se ne kuca — ide adresa poslovnice:
        <b>${bezHtml(ja.poslovnica?.adresa ?? "")}</b>
      </div>

      <div class="red-dugmadi">
        <button class="dugme tiha" data-ne type="button">Odustani</button>
        <button class="dugme" data-da type="button">Pošalji</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelectorAll("[data-struka]").forEach((b) => {
    b.onclick = () => {
      izabrana = b.dataset.struka;
      prozor.querySelectorAll(".struka").forEach((x) => x.classList.remove("izabrana"));
      b.classList.add("izabrana");
    };
  });

  const pregled = prozor.querySelector("#k-pregled");
  function nacrtajSlike() {
    pregled.innerHTML = slike.map((s, i) => `
      <figure>
        <img src="data:${s.tip};base64,${s.podaci}" alt="">
        <button type="button" data-skloni="${i}" aria-label="Skloni sliku">×</button>
      </figure>`).join("");
    pregled.querySelectorAll("[data-skloni]").forEach((b) => {
      b.onclick = () => { slike.splice(Number(b.dataset.skloni), 1); nacrtajSlike(); };
    });
  }

  prozor.querySelector("#k-slike").onchange = async (e) => {
    const fajlovi = [...e.target.files].slice(0, 4 - slike.length);
    e.target.value = "";
    for (const f of fajlovi) {
      try { slike.push(await smanjiSliku(f)); } catch { /* preskoči lošu sliku */ }
    }
    nacrtajSlike();
  };

  prozor.querySelector("[data-ne]").onclick = () => prozor.remove();

  prozor.querySelector("[data-da]").onclick = async () => {
    const dugme = prozor.querySelector("[data-da]");
    const opis = prozor.querySelector("#k-opis").value.trim();

    if (opis.length < 5) {
      prozor.querySelector("#greska-kvar").innerHTML =
        '<div class="poruka lose">Napišite u par riječi šta ne radi.</div>';
      return;
    }

    dugme.disabled = true;
    dugme.textContent = "Šaljem…";

    try {
      /* Slike prvo — ako neka padne, prijava svejedno ide. Bolje prijava
         bez slike nego majstor koji ne zna da ga neko čeka. */
      const adrese = [];
      for (const s of slike) {
        try {
          const r = await api("/api/firma-slika", {
            method: "POST",
            body: JSON.stringify({ podaci: s.podaci, tip: s.tip }),
          });
          adrese.push(r.adresa);
        } catch { /* ide bez nje */ }
      }

      await api("/api/firma-zahtjev", {
        method: "POST",
        body: JSON.stringify({
          kategorija: izabrana,
          opis,
          gdje: prozor.querySelector("#k-gdje").value,
          termin: prozor.querySelector("#k-termin").value,
          fotografije: adrese,
        }),
      });

      prozor.remove();
      await ucitajPrijave();
      traka(adrese.length < slike.length
        ? "Prijavljeno. Neka slika nije prošla."
        : "Prijavljeno. Majstori su obaviješteni.");
    } catch (greska) {
      prozor.querySelector("#greska-kvar").innerHTML =
        `<div class="poruka lose">${bezHtml(greska.message)}</div>`;
      dugme.disabled = false;
      dugme.textContent = "Pošalji";
    }
  };
}

/* Slika sa telefona ume da bude 5 MB. Smanjuje se ovdje, da ne čeka
   ni veza ni server. Vraća base64 bez zaglavlja. */
async function smanjiSliku(fajl, maxStranica = 1600, cilj = 900_000) {
  const adresa = URL.createObjectURL(fajl);
  try {
    const slika = await new Promise((ok, ne) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ne;
      i.src = adresa;
    });

    const skala = Math.min(1, maxStranica / Math.max(slika.width, slika.height));
    const platno = document.createElement("canvas");
    platno.width = Math.round(slika.width * skala);
    platno.height = Math.round(slika.height * skala);
    platno.getContext("2d").drawImage(slika, 0, 0, platno.width, platno.height);

    // Spušta se kvalitet dok slika ne stane. Zadnji korak se prihvata kakav je.
    for (const kvalitet of [0.8, 0.65, 0.5, 0.4]) {
      const dataUrl = platno.toDataURL("image/jpeg", kvalitet);
      const podaci = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (podaci.length * 0.75 <= cilj || kvalitet === 0.4) {
        return { tip: "image/jpeg", podaci };
      }
    }
    throw new Error("nečitljiva slika");
  } finally {
    URL.revokeObjectURL(adresa);
  }
}

/* ── Obavještenja ── */

el("dugme-zvono").addEventListener("click", async () => {
  const dugme = el("dugme-zvono");
  dugme.disabled = true;
  try {
    if (await pushUkljucen()) {
      await iskljuciPush(api);
      traka("Obavještenja su isključena.");
    } else {
      const r = await ukljuciPush(api);
      traka(r.ok ? "Obavještenja su uključena." : r.razlog);
    }
  } catch (greska) {
    traka(greska.message);
  } finally {
    dugme.disabled = false;
    osvjeziZvono();
  }
});

async function osvjeziZvono() {
  try {
    el("dugme-zvono").textContent =
      (await pushUkljucen()) ? "Obavještenja ✓" : "Obavještenja";
  } catch { /* nije važno */ }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/firme/sw.js").catch(() => {});
}

/* ── Sitnice ── */

const nazivZanata = (id) =>
  zanati.find((z) => z.id === id)?.naziv ?? String(id ?? "").replace(/_/g, " ");

function bezHtml(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

function formatBroj(b) {
  const c = String(b ?? "").replace(/\D/g, "");
  if (c.startsWith("382")) return "0" + c.slice(3).replace(/(\d{2})(\d{3})(\d+)/, "$1 $2 $3");
  return b;
}

const datumSat = (iso) => new Date(iso).toLocaleString("sr-Latn-ME", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Kratka potvrda na dnu ekrana, nestane sama. */
function traka(tekst) {
  document.getElementById("poruka-traka")?.remove();
  const t = document.createElement("div");
  t.id = "poruka-traka";
  t.className = "poruka-traka";
  t.textContent = tekst;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ── Start ── */

if (token) {
  udji(true).catch(() => naPrijavu());
} else {
  naPrijavu();
}
osvjeziZvono();
