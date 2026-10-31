/* Aplikacija za majstore. Namjerno bez biblioteka — brzo se otvara i na slabom signalu. */

const KLJUC = "reddy-majstor-token";
let token = null;
try { token = localStorage.getItem(KLJUC); } catch {}

let jaPodaci = null;
let trenutniJezicak = "poslovi";

const el = (id) => document.getElementById(id);
const novac = (n) => `${Number(n).toFixed(2).replace(/\.00$/, "")} €`;

async function api(putanja, opcije = {}) {
  const odgovor = await fetch(putanja, {
    ...opcije,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcije.headers,
    },
  });
  const telo = await odgovor.json().catch(() => ({}));
  if (!odgovor.ok) throw new Error(telo.greska ?? "Greška u vezi.");
  return telo;
}

function poruka(gdje, tekst, vrsta = "lose") {
  el(gdje).innerHTML = tekst
    ? `<div class="poruka ${vrsta}">${tekst}</div>`
    : "";
}

/* ── Prijava ── */

el("forma-prijava").addEventListener("submit", async (e) => {
  e.preventDefault();
  poruka("greska-prijava", "");
  const dugme = e.target.querySelector("button");
  dugme.disabled = true;
  dugme.textContent = "Provjeravam…";

  try {
    const r = await api("/api/prijava", {
      method: "POST",
      body: JSON.stringify({ telefon: el("p-telefon").value, pin: el("p-pin").value }),
    });
    token = r.token;
    try { localStorage.setItem(KLJUC, token); } catch {}
    await uđi();
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

/* ── Ulazak ── */

/* `odmah` je za otvaranje sa početnog ekrana: tad je čovjek već prijavljen,
   pa se aplikacija prikazuje istog trena, a podaci stižu u nju. Kod svježe
   prijave je obrnuto — čeka se odgovor, da ekran ne odskoči ako PIN ne valja. */
async function uđi(odmah = false) {
  if (odmah) {
    el("ekran-prijava").hidden = true;
    el("ekran-app").hidden = false;
    el("lista-poslovi").innerHTML = '<div class="prazno">Učitavam…</div>';
  }

  jaPodaci = await api("/api/ja");

  el("ekran-prijava").hidden = true;
  el("ekran-app").hidden = false;

  prikaziStanje();
  await ucitajPoslove();
  pratiDogadjaje();
}

/** Vraća na prijavu — kad token istekne ili se čovjek odjavi. */
function naPrijavu() {
  token = null;
  try { localStorage.removeItem(KLJUC); } catch {}
  document.documentElement.classList.remove("vec-prijavljen");
  el("ekran-prijava").hidden = false;
  el("ekran-app").hidden = true;
}

async function osvjeziStanje() {
  jaPodaci = await api("/api/ja");
  prikaziStanje();
}

function prikaziStanje() {
  el("s-ime").textContent = jaPodaci.ime.split(" ")[0];
  el("s-kupljeno").textContent = jaPodaci.kupljeno;
  el("s-limit").textContent = novac(jaPodaci.limit_duga);

  const dug = el("s-dug");
  dug.textContent = novac(jaPodaci.dug);
  dug.classList.toggle("crven", jaPodaci.dug >= jaPodaci.limit_duga);

  if (jaPodaci.dug >= jaPodaci.limit_duga) {
    poruka("obavjestenje",
      `Dostigli ste limit duga (${novac(jaPodaci.dug)}). Izmirite dug pa nastavite da kupujete poslove.`,
      "pazi");
  } else {
    poruka("obavjestenje", "");
  }
}

/* ── Poslovi ── */

function slikeRed(slike) {
  if (!slike?.length) return "";
  return `<div class="slike">${slike.map((s) =>
    `<a href="${bezHtml(s)}" target="_blank" rel="noopener">
       <img src="${bezHtml(s)}" alt="Slika kvara" loading="lazy">
     </a>`).join("")}</div>`;
}

function kartaPosla(p) {
  return `
    <article class="posao">
      <div class="posao-vrh">
        <span class="znak zuta">${nazivKategorije(p.kategorija)}</span>
        <span class="cijena">${novac(p.cijena)}</span>
      </div>
      <p class="posao-opis">${bezHtml(p.opis)}</p>
      ${slikeRed(p.slike)}
      <div class="posao-red">📍 ${bezHtml(p.gdje)}</div>
      ${p.termin ? `<div class="posao-red">🕐 ${bezHtml(p.termin)}</div>` : ""}
      <button class="dugme" style="margin-top:12px" data-kupi="${p.id}" data-cijena="${p.cijena}">
        Kupi posao za ${novac(p.cijena)}
      </button>
    </article>`;
}

async function ucitajPoslove() {
  const { poslovi, pauziran } = await api("/api/poslovi");

  if (pauziran) {
    el("lista-poslovi").innerHTML =
      `<div class="prazno">Vaš nalog je pauziran.<br>Javite se Reddy-ju.</div>`;
    return;
  }
  if (!poslovi.length) {
    el("lista-poslovi").innerHTML =
      `<div class="prazno">Trenutno nema novih poslova za vašu struku.<br>Javićemo vam čim stigne.</div>`;
    return;
  }
  el("lista-poslovi").innerHTML = poslovi.map((p) => kartaPosla(p)).join("");
}

async function ucitajMoje() {
  const { poslovi } = await api("/api/moji");
  if (!poslovi.length) {
    el("lista-moji").innerHTML = `<div class="prazno">Još niste kupili nijedan posao.</div>`;
    return;
  }

  el("lista-moji").innerHTML = poslovi.map((p) => {
    const ponisten = p.stanje === "ponistena";
    return `
      <article class="posao" ${ponisten ? 'style="opacity:.6"' : ""}>
        <div class="posao-vrh">
          <span class="znak ${ponisten ? "crvena" : "zelena"}">
            ${ponisten ? "Vraćen novac" : nazivKategorije(p.kategorija)}
          </span>
          <span class="cijena">${novac(p.cijena)}</span>
        </div>
        <p class="posao-opis">${bezHtml(p.opis)}</p>
        ${slikeRed(p.slike)}
        <div class="posao-red">📍 ${bezHtml(p.adresa ?? p.lokacija)}${p.stan ? ", " + bezHtml(p.stan) : ""}</div>
        ${p.termin ? `<div class="posao-red">🕐 ${bezHtml(p.termin)}</div>` : ""}
        ${ponisten ? "" : `
          <div class="kontakt">
            <div class="kontakt-ime">${bezHtml([p.klijent_ime, p.klijent_prezime].filter(Boolean).join(" ") || "Klijent")}</div>
            <a href="tel:${p.klijent_telefon}">${formatBroj(p.klijent_telefon)}</a>
            ${p.klijent_email ? `<div class="posao-red" style="margin-top:4px">✉️ ${bezHtml(p.klijent_email)}</div>` : ""}
          </div>
          <button class="dugme tiha mala" style="margin-top:10px" data-problem="${p.id}">
            Prijavi problem sa ovim poslom
          </button>`}
      </article>`;
  }).join("");
}

/* ── Kupovina ── */

document.addEventListener("click", async (e) => {
  const kupi = e.target.closest("[data-kupi]");
  if (kupi) return potvrdiKupovinu(kupi.dataset.kupi, Number(kupi.dataset.cijena));

  const problem = e.target.closest("[data-problem]");
  if (problem) return prijaviProblem(problem.dataset.problem);
});

function potvrdiKupovinu(posaoId, cijena) {
  const buduciDug = (jaPodaci?.dug ?? 0) + cijena;
  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Kupujete ovaj posao?</h3>
      <p class="tiho" style="margin-top:0">
        Skida vam se <b>${novac(cijena)}</b> na dug. Poslije toga dobijate ime i broj
        klijenta, a posao nestaje ostalim majstorima.
      </p>
      <div class="poruka pazi" style="margin-bottom:0">
        Vaš dug poslije kupovine: <b>${novac(buduciDug)}</b> od ${novac(jaPodaci?.limit_duga ?? 0)}
      </div>
      <div class="red-dugmadi">
        <button class="dugme tiha" data-ne>Odustani</button>
        <button class="dugme" data-da>Da, kupujem</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelector("[data-ne]").onclick = () => prozor.remove();
  prozor.querySelector("[data-da]").onclick = async () => {
    const dugme = prozor.querySelector("[data-da]");
    dugme.disabled = true;
    dugme.textContent = "Kupujem…";
    try {
      const r = await api("/api/kupi", {
        method: "POST",
        body: JSON.stringify({ posao_id: posaoId }),
      });
      prozor.remove();
      pokaziKontakt(r.kontakt, r.adresa, r.stan, r.slike);
      await osvjeziStanje();
      await ucitajPoslove();
    } catch (greska) {
      prozor.querySelector(".prozor").insertAdjacentHTML(
        "afterbegin", `<div class="poruka lose">${greska.message}</div>`,
      );
      dugme.disabled = false;
      dugme.textContent = "Da, kupujem";
    }
  };
}

function pokaziKontakt(kontakt, adresa, stan, slike) {
  const puno = [kontakt?.ime, kontakt?.prezime].filter(Boolean).join(" ") || "Klijent";
  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Posao je vaš</h3>
      ${slikeRed(slike)}
      <div class="kontakt" style="margin-top:0">
        <div class="kontakt-ime">${bezHtml(puno)}</div>
        <a href="tel:${kontakt?.telefon ?? ""}">${formatBroj(kontakt?.telefon ?? "")}</a>
        ${kontakt?.email ? `<div class="posao-red" style="margin-top:5px">✉️ ${bezHtml(kontakt.email)}</div>` : ""}
      </div>
      ${adresa ? `<p class="posao-red" style="margin-top:10px">📍 ${bezHtml(adresa)}${stan ? ", " + bezHtml(stan) : ""}</p>` : ""}
      <p class="tiho">Pozovite klijenta i dogovorite se. Posao vam stoji u „Moji poslovi".</p>
      <button class="dugme" data-zatvori>U redu</button>
    </div>`;
  document.body.appendChild(prozor);
  prozor.querySelector("[data-zatvori]").onclick = () => prozor.remove();
}

function prijaviProblem(posaoId) {
  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Prijavi problem</h3>
      <p class="tiho" style="margin-top:0">
        Npr. broj ne radi, klijent se predomislio, posao ne postoji.
      </p>
      <div class="poruka pazi">
        Posao vam nestaje iz spiska dok Reddy ne pogleda. Ako je prijava
        opravdana, skidamo vam naplaćeno sa duga.
      </div>
      <label class="polje">
        <span>Šta nije u redu</span>
        <textarea id="tekst-problem" placeholder="Broj ne radi, zvao sam tri puta."></textarea>
      </label>
      <div class="red-dugmadi">
        <button class="dugme tiha" data-ne>Odustani</button>
        <button class="dugme" data-da>Pošalji</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelector("[data-ne]").onclick = () => prozor.remove();
  prozor.querySelector("[data-da]").onclick = async () => {
    try {
      await api("/api/problem", {
        method: "POST",
        body: JSON.stringify({
          posao_id: posaoId,
          opis: prozor.querySelector("#tekst-problem").value,
        }),
      });
      prozor.remove();
      poruka("obavjestenje",
        "Prijava je poslata. Posao je sklonjen iz vašeg spiska dok ne pogledamo.",
        "dobro");
      await ucitajMoje();
    } catch (greska) {
      alert(greska.message);
    }
  };
}

/* ── Jezičci ── */

document.querySelectorAll(".jezicak").forEach((j) => {
  j.addEventListener("click", async () => {
    document.querySelectorAll(".jezicak").forEach((x) => x.classList.remove("izabran"));
    j.classList.add("izabran");
    trenutniJezicak = j.dataset.jezicak;

    const poslovi = trenutniJezicak === "poslovi";
    el("lista-poslovi").hidden = !poslovi;
    el("lista-moji").hidden = poslovi;

    if (poslovi) await ucitajPoslove();
    else await ucitajMoje();
  });
});

/* ── Uživo ── */

/* Provjera na petnaest sekundi. Stalna veza bi bila brža, ali je na
   Vercelu nema — funkcije se gase poslije svakog poziva. */
function pratiDogadjaje() {
  setInterval(async () => {
    if (document.hidden) return;          // ne troši bateriju dok app nije na ekranu
    try {
      await osvjeziStanje();
      if (trenutniJezicak === "poslovi") await ucitajPoslove();
      else await ucitajMoje();
    } catch { /* nema veze, sljedeći put */ }
  }, 15_000);

  // Čim se majstor vrati u aplikaciju, odmah svjež spisak.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      osvjeziStanje().catch(() => {});
      (trenutniJezicak === "poslovi" ? ucitajPoslove() : ucitajMoje()).catch(() => {});
    }
  });
}

/* ── Obavještenja i PWA ── */

el("dugme-zvono").addEventListener("click", async () => {
  const dugme = el("dugme-zvono");
  const staro = dugme.textContent;
  dugme.disabled = true;
  dugme.textContent = "Uključujem…";

  try {
    const r = await ukljuciPush(api);
    if (!r.ok) {
      poruka("obavjestenje", r.razlog, "pazi");
      dugme.textContent = staro;
      return;
    }
    dugme.textContent = "Obavještenja ✓";
    await api("/api/push-proba", { method: "POST" });
    poruka("obavjestenje", "Obavještenja su uključena. Stiže vam probna poruka.", "dobro");
  } catch (greska) {
    poruka("obavjestenje", greska.message, "lose");
    dugme.textContent = staro;
  } finally {
    dugme.disabled = false;
  }
});

// Ako su već uključena, dugme to odmah pokazuje.
pushUkljucen().then((da) => {
  if (da) el("dugme-zvono").textContent = "Obavještenja ✓";
}).catch(() => {});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/majstori/sw.js").catch(() => {});
}

/* ── Sitnice ── */

const NAZIVI = {
  kucne_popravke: "Kućne popravke", klime: "Klime", vodoinstalater: "Vodoinstalater",
  elektricar: "Električar", sigurnost: "Alarmi i kamere", moler: "Moler",
  fasader: "Fasader", keramicar: "Keramičar", bravar: "Bravar",
};
const nazivKategorije = (id) => NAZIVI[id] ?? id;

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

/* ── Start ── */

if (token) {
  uđi(true).catch(naPrijavu);
} else {
  document.documentElement.classList.remove("vec-prijavljen");
}
