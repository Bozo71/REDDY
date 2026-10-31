/* Admin panel — pregled majstora, naplata duga, poslovi, cijene. */

const KLJUC = "reddy-admin-token";
let token = null;
try { token = localStorage.getItem(KLJUC); } catch {}

let kategorije = [];

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

/* ── Prijava ── */

el("forma-prijava").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("greska-prijava").innerHTML = "";
  try {
    const r = await api("/api/admin-prijava", {
      method: "POST",
      body: JSON.stringify({ nadimak: el("a-nadimak").value, sifra: el("a-sifra").value }),
    });
    token = r.token;
    try { localStorage.setItem(KLJUC, token); } catch {}
    el("a-ko").textContent = r.nadimak;
    await uđi();
  } catch (greska) {
    el("greska-prijava").innerHTML = `<div class="poruka lose">${greska.message}</div>`;
  }
});

el("dugme-izlaz").addEventListener("click", () => {
  token = null;
  try { localStorage.removeItem(KLJUC); } catch {}
  el("ekran-app").hidden = true;
  el("ekran-prijava").hidden = false;
});

async function uđi() {
  // Oba poziva uporedo — ne čekaju jedan drugog.
  const [kat, maj] = await Promise.all([
    api("/api/kategorije"),
    api("/api/admin-majstori"),
  ]);
  kategorije = kat.kategorije;

  el("ekran-prijava").hidden = true;
  el("ekran-app").hidden = false;

  prikaziMajstore(maj.majstori);
  pratiDogadjaje();
  osvjeziBrojProblema().catch(() => {});   // ne drži ekran
}

/* ── Majstori ── */

async function ucitajMajstore() {
  prikaziMajstore((await api("/api/admin-majstori")).majstori);
}

function prikaziMajstore(majstori) {
  const ukupnoDug = majstori.reduce((z, m) => z + m.dug, 0);
  const ukupnoPlaceno = majstori.reduce((z, m) => z + m.ukupno_placeno, 0);
  const ukupnoPoslova = majstori.reduce((z, m) => z + m.kupljeno, 0);

  el("u-dug").textContent = novac(ukupnoDug);
  el("u-naplaceno").textContent = novac(ukupnoPlaceno);
  el("u-poslova").textContent = ukupnoPoslova;

  el("red-majstori").innerHTML = majstori.map((m) => `
    <tr${m.pauziran ? ' style="opacity:.5"' : ""}>
      <td style="font-weight:900">
        ${bezHtml(m.ime)}
        ${m.pauziran ? '<span class="znak crvena" style="margin-left:6px">pauziran</span>' : ""}
      </td>
      <td>${formatBroj(m.telefon)}</td>
      <td class="broj">${m.kupljeno}</td>
      <td class="broj ${m.dug >= m.limit_duga ? "crven" : ""}">${novac(m.dug)}</td>
      <td class="broj" style="font-weight:700;opacity:.6">${novac(m.limit_duga)}</td>
      <td class="broj" style="font-weight:700;opacity:.6">${novac(m.ukupno_placeno)}</td>
      <td><button class="dugme mala" data-otvori="${m.id}">Otvori</button></td>
    </tr>`).join("");
}

document.addEventListener("click", (e) => {
  const otvori = e.target.closest("[data-otvori]");
  if (otvori) return otvoriMajstora(otvori.dataset.otvori);

  const ponisti = e.target.closest("[data-ponisti]");
  if (ponisti) return ponistiKupovinu(ponisti.dataset.ponisti);

  const obrisi = e.target.closest("[data-obrisi]");
  if (obrisi) return obrisiPosao(obrisi.dataset.obrisi);

  const rijesen = e.target.closest("[data-rijesen]");
  if (rijesen) return oznaciRijesenim(rijesen.dataset.rijesen);
});

async function obrisiPosao(posaoId) {
  if (!confirm(
    "Obrisati posao zauvijek?\n\n" +
    "Nestaje i iz spiska majstora i iz tvojih pregleda. Ako ga je neko kupio, " +
    "skida mu se naplaćeni iznos sa duga.\n\nOvo se ne može vratiti.",
  )) return;

  await api("/api/admin-obrisi-posao", {
    method: "POST",
    body: JSON.stringify({ posao_id: posaoId }),
  });
  await osvjeziTrenutni();
}

async function oznaciRijesenim(id) {
  await api("/api/admin-problem-rijesen", { method: "POST", body: JSON.stringify({ id }) });
  await osvjeziTrenutni();
}

// Osvježi samo otvoreni dio, i to uporedo sa brojačem problema —
// čekanje jednog pa drugog se na telefonu osjeti.
async function osvjeziTrenutni() {
  const poslovi = [];
  if (!el("dio-majstori").hidden) poslovi.push(ucitajMajstore());
  if (!el("dio-prihvaceni").hidden) poslovi.push(ucitajPrihvacene());
  if (!el("dio-problemi").hidden) poslovi.push(ucitajProbleme());
  if (!el("dio-poslovi").hidden) poslovi.push(ucitajPoslove());
  poslovi.push(osvjeziBrojProblema());

  await Promise.allSettled(poslovi);
}

async function otvoriMajstora(id) {
  // Jedan poziv — izvod nosi i podatke majstora.
  const { kupovine, uplate, majstor: m } = await api(`/api/admin-izvod?majstor=${id}`);
  if (!m) return alert("Majstor nije nađen.");

  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>${bezHtml(m.ime)}</h3>
      <p class="tiho" style="margin-top:-8px">${formatBroj(m.telefon)} · limit ${novac(m.limit_duga)}</p>

      <div class="poruka ${m.dug > 0 ? "pazi" : "dobro"}" style="font-size:17px">
        Duguje: <b>${novac(m.dug)}</b>
        <span style="opacity:.6;font-size:13px"> · kupio ${poslova(m.kupljeno)} · platio ${novac(m.ukupno_placeno)}</span>
      </div>

      <label class="polje">
        <span>Primio sam keš — koliko?</span>
        <input id="iznos-uplate" type="number" step="0.5" min="0" placeholder="npr. 20" inputmode="decimal">
      </label>
      <div class="red-dugmadi" style="margin-top:0">
        <button class="dugme" data-uplati>Upiši uplatu</button>
        <button class="dugme tiha" data-sve ${m.dug <= 0 ? "disabled" : ""}>Izmirio sve</button>
      </div>

      <h2 style="font-size:15px">Šta radi</h2>
      <p class="tiho" style="margin-top:-6px">Označi sve struke — vidjeće poslove iz svake.</p>
      <div class="kutije">
        ${kategorije.map((k) => `
          <label class="kutija">
            <input type="checkbox" value="${k.id}" ${m.kategorije.includes(k.id) ? "checked" : ""}>
            ${k.naziv}
          </label>`).join("")}
      </div>

      <label class="polje" style="margin-top:13px">
        <span>Limit duga (€)</span>
        <input id="novi-limit" type="number" step="1" min="0" value="${m.limit_duga}">
      </label>

      <div class="red-dugmadi" style="margin-top:0">
        <button class="dugme" data-sacuvaj>Sačuvaj izmjene</button>
      </div>
      <div class="red-dugmadi">
        <button class="dugme tiha" data-nov-pin>Novi PIN</button>
        <button class="dugme tiha" data-pauza>${m.pauziran ? "Vrati u rad" : "Pauziraj majstora"}</button>
      </div>

      <h2 style="font-size:15px">Kupovine</h2>
      ${kupovine.length ? kupovine.map((k) => `
        <div class="posao-red" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--beige)">
          <span style="flex:1">${bezHtml(k.opis.slice(0, 44))}${k.opis.length > 44 ? "…" : ""}</span>
          <b style="${k.stanje === "ponistena" ? "text-decoration:line-through;opacity:.5" : ""}">${novac(k.cijena)}</b>
        </div>`).join("") : '<p class="tiho">Nema kupovina.</p>'}

      <h2 style="font-size:15px">Uplate</h2>
      ${uplate.filter((u) => u.iznos > 0).length
        ? uplate.filter((u) => u.iznos > 0).map((u) => `
          <div class="posao-red" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--beige)">
            <span style="flex:1">${datum(u.vrijeme)} · ${bezHtml(u.napomena ?? "")}</span>
            <b style="color:oklch(.38 .12 155)">${novac(u.iznos)}</b>
          </div>`).join("")
        : '<p class="tiho">Još nije ništa platio.</p>'}

      <button class="dugme tiha" style="margin-top:16px" data-zatvori>Zatvori</button>
    </div>`;
  document.body.appendChild(prozor);

  const zatvori = () => prozor.remove();
  prozor.querySelector("[data-zatvori]").onclick = zatvori;

  prozor.querySelector("[data-uplati]").onclick = async () => {
    const iznos = Number(prozor.querySelector("#iznos-uplate").value);
    if (!(iznos > 0)) return alert("Upišite iznos veći od nule.");
    await api("/api/admin-uplata", {
      method: "POST",
      body: JSON.stringify({ majstor_id: id, iznos }),
    });
    zatvori();
    await ucitajMajstore();
  };

  prozor.querySelector("[data-sve]").onclick = async () => {
    await api("/api/admin-uplata", {
      method: "POST",
      body: JSON.stringify({ majstor_id: id, sve: true }),
    });
    zatvori();
    await ucitajMajstore();
  };

  prozor.querySelector("[data-sacuvaj]").onclick = async () => {
    const struke = [...prozor.querySelectorAll(".kutija input:checked")].map((x) => x.value);
    if (!struke.length) return alert("Označite bar jednu struku, inače neće vidjeti nijedan posao.");

    await api("/api/admin-majstor-izmjena", {
      method: "POST",
      body: JSON.stringify({
        id,
        kategorije: struke,
        limit_duga: Number(prozor.querySelector("#novi-limit").value),
      }),
    });
    zatvori();
    await ucitajMajstore();
  };

  prozor.querySelector("[data-nov-pin]").onclick = async () => {
    if (!confirm(
      "Napraviti nov PIN?\n\nStari odmah prestaje da važi i majstor se " +
      "izbacuje iz aplikacije dok mu ne javiš novi.",
    )) return;

    const r = await api("/api/admin-nov-pin", {
      method: "POST", body: JSON.stringify({ id }),
    });
    zatvori();
    pokaziPin(r);
  };

  prozor.querySelector("[data-pauza]").onclick = async () => {
    await api("/api/admin-majstor-izmjena", {
      method: "POST",
      body: JSON.stringify({ id, pauziran: !m.pauziran }),
    });
    zatvori();
    await ucitajMajstore();
  };
}

/* Pokazuje PIN jednom, sa gotovom porukom za majstora. Drugi put se ne
   može vidjeti — pravi se nov. */
function pokaziPin({ pin, ime, telefon }) {
  const poruka =
    `Zdravo ${String(ime ?? "").split(" ")[0]}, ovo su tvoji podaci za REDDY:\n\n` +
    `Adresa: thereddy.me/majstori\n` +
    `Telefon: ${formatBroj(telefon)}\n` +
    `PIN: ${pin}\n\n` +
    `Otvori na telefonu i dodaj na početni ekran da ti stoji kao aplikacija.`;

  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Nov PIN za ${bezHtml(ime ?? "majstora")}</h3>
      <div class="poruka pazi" style="text-align:center">
        <div style="font-size:38px;font-weight:900;letter-spacing:7px;font-variant-numeric:tabular-nums">
          ${bezHtml(pin)}
        </div>
      </div>
      <p class="tiho" style="margin-top:0">
        Zapiši ga ili odmah pošalji — kad zatvoriš ovaj prozor, više se ne može
        vidjeti. Stari PIN je prestao da važi.
      </p>
      <label class="polje">
        <span>Gotova poruka za majstora</span>
        <textarea id="poruka-majstoru" readonly style="min-height:130px">${bezHtml(poruka)}</textarea>
      </label>
      <div class="red-dugmadi">
        <button class="dugme" data-kopiraj>Kopiraj poruku</button>
        <button class="dugme tiha" data-zatvori>Zatvori</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelector("[data-zatvori]").onclick = () => prozor.remove();
  prozor.querySelector("[data-kopiraj]").onclick = async () => {
    const dugme = prozor.querySelector("[data-kopiraj]");
    const polje = prozor.querySelector("#poruka-majstoru");
    try {
      await navigator.clipboard.writeText(polje.value);
      dugme.textContent = "Kopirano";
    } catch {
      polje.select();
      dugme.textContent = "Označeno — pritisni Ctrl+C";
    }
  };
}

/* ── Nov majstor ── */

el("dugme-nov-majstor").addEventListener("click", () => {
  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Nov majstor</h3>
      <div id="greska-majstor"></div>
      <label class="polje"><span>Ime i prezime</span><input id="n-ime" placeholder="Marko Vujović"></label>
      <label class="polje"><span>Telefon</span><input id="n-telefon" type="tel" placeholder="067 111 111"></label>
      <label class="polje"><span>PIN (4–8 cifara)</span><input id="n-pin" inputmode="numeric" placeholder="111111"></label>
      <label class="polje"><span>Limit duga (€)</span><input id="n-limit" type="number" value="30"></label>
      <label class="polje"><span>Struke</span></label>
      <div class="kutije">
        ${kategorije.map((k) => `
          <label class="kutija">
            <input type="checkbox" value="${k.id}"> ${k.naziv}
          </label>`).join("")}
      </div>
      <div class="red-dugmadi">
        <button class="dugme tiha" data-ne>Odustani</button>
        <button class="dugme" data-da>Napravi</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelector("[data-ne]").onclick = () => prozor.remove();
  prozor.querySelector("[data-da]").onclick = async () => {
    const izabrane = [...prozor.querySelectorAll(".kutija input:checked")].map((x) => x.value);
    const ime = prozor.querySelector("#n-ime").value;
    const telefon = prozor.querySelector("#n-telefon").value;
    const pin = prozor.querySelector("#n-pin").value;

    try {
      await api("/api/admin-majstor", {
        method: "POST",
        body: JSON.stringify({
          ime, telefon, pin,
          limit_duga: prozor.querySelector("#n-limit").value,
          kategorije: izabrane,
        }),
      });
      prozor.remove();
      await ucitajMajstore();
      // Odmah gotova poruka za majstora, da se PIN ne izgubi.
      pokaziPin({ pin, ime, telefon });
    } catch (greska) {
      prozor.querySelector("#greska-majstor").innerHTML =
        `<div class="poruka lose">${greska.message}</div>`;
    }
  };
});

/* ── Ko je šta uzeo ── */

let tajmerPretrage = null;

async function ucitajPrihvacene() {
  const trazi = el("trazi").value.trim();
  const { prihvaceni } = await api(`/api/admin-prihvaceni?trazi=${encodeURIComponent(trazi)}`);

  if (!prihvaceni.length) {
    el("lista-prihvaceni").innerHTML = trazi
      ? `<div class="prazno">Nema ništa za „${bezHtml(trazi)}".</div>`
      : '<div class="prazno">Još niko nije uzeo nijedan posao.</div>';
    return;
  }

  // Grupisano po majstoru — da se odmah vidi ko je koliko uzeo.
  const poMajstoru = new Map();
  for (const r of prihvaceni) {
    if (!poMajstoru.has(r.majstor_id)) poMajstoru.set(r.majstor_id, []);
    poMajstoru.get(r.majstor_id).push(r);
  }

  el("lista-prihvaceni").innerHTML = [...poMajstoru.values()].map((redovi) => {
    const m = redovi[0];
    const vaze = redovi.filter((r) => r.stanje !== "ponistena");
    const zbir = vaze.reduce((z, r) => z + r.cijena, 0);

    return `
      <section style="margin-bottom:22px">
        <div style="display:flex;align-items:baseline;gap:10px;padding:0 2px 8px;border-bottom:2px solid var(--plum-deep)">
          <b style="font-size:17px">${bezHtml(m.majstor)}</b>
          <span class="tiho">${formatBroj(m.majstor_telefon)}</span>
          <span style="margin-left:auto;font-weight:900">${poslova(vaze.length)} · ${novac(zbir)}</span>
        </div>
        ${redovi.map((r) => `
          <article class="posao" style="margin-top:10px${r.stanje === "ponistena" ? ";opacity:.55" : ""}">
            <div class="posao-vrh">
              <span class="znak ${r.stanje === "ponistena" ? "crvena" : "zelena"}">
                ${r.stanje === "ponistena" ? "poništeno" : nazivKategorije(r.kategorija)}
              </span>
              ${r.stanje === "prijavljen" ? '<span class="znak crvena">prijavljen problem</span>' : ""}
              <span class="cijena">${novac(r.cijena)}</span>
            </div>
            <p class="posao-opis">${bezHtml(r.opis)}</p>
            <div class="posao-red">
              👤 <b>${bezHtml([r.klijent_ime, r.klijent_prezime].filter(Boolean).join(" "))}</b>
              · ${formatBroj(r.klijent_telefon)}
              ${r.klijent_email ? "· " + bezHtml(r.klijent_email) : ""}
            </div>
            <div class="posao-red">📍 ${bezHtml(r.adresa ?? r.lokacija)}${r.stan ? ", " + bezHtml(r.stan) : ""}</div>
            <div class="posao-red">🕐 uzeo ${datumSat(r.vrijeme)}</div>
            <div class="red-dugmadi">
              ${r.stanje === "ponistena" ? "" : `
                <button class="dugme tiha mala" data-ponisti="${r.posao_id}">
                  Nije se dogovorio — vrati u ponudu
                </button>`}
              <button class="dugme opasna mala" data-obrisi="${r.posao_id}">Obriši</button>
            </div>
          </article>`).join("")}
      </section>`;
  }).join("");
}

el("trazi").addEventListener("input", () => {
  clearTimeout(tajmerPretrage);
  tajmerPretrage = setTimeout(ucitajPrihvacene, 220);
});

/* ── Problemi ── */

async function ucitajProbleme() {
  const { problemi } = await api("/api/admin-problemi");
  obiljeziNove(problemi);

  if (!problemi.length) {
    el("lista-problemi").innerHTML =
      '<div class="prazno">Nema prijavljenih problema. Dobra vijest.</div>';
    return;
  }

  el("lista-problemi").innerHTML = problemi.map((p) => {
    const rijesen = p.stanje === "rijesen";
    const vracen = p.status === "slobodan";
    return `
      <article class="posao" ${rijesen ? 'style="opacity:.55"' : ""}>
        <div class="posao-vrh">
          <span class="znak ${rijesen ? "zelena" : "crvena"}">
            ${rijesen ? "riješeno" : "čeka tebe"}
          </span>
          <span class="znak">${nazivKategorije(p.kategorija)}</span>
          <span class="tiho" style="margin-left:auto;font-size:12.5px">${datumSat(p.vrijeme)}</span>
        </div>

        <div class="poruka lose" style="margin:8px 0">
          <b>${bezHtml(p.majstor)}</b> javlja: ${bezHtml(p.problem)}
        </div>

        <p class="posao-opis" style="font-size:14.5px">${bezHtml(p.opis)}</p>
        <div class="posao-red">
          👤 ${bezHtml([p.klijent_ime, p.klijent_prezime].filter(Boolean).join(" "))}
          · ${formatBroj(p.klijent_telefon ?? "")}
        </div>
        <div class="posao-red">📍 ${bezHtml(p.adresa ?? "")}${p.stan ? ", " + bezHtml(p.stan) : ""}</div>
        <div class="posao-red">📞 majstor: ${formatBroj(p.majstor_telefon)}</div>
        ${vracen ? '<div class="posao-red">↩️ posao je već vraćen u ponudu</div>' : ""}

        ${rijesen ? "" : `
          <div class="red-dugmadi">
            ${vracen ? "" : `<button class="dugme tiha mala" data-ponisti="${p.posao_id}">Vrati u ponudu</button>`}
            <button class="dugme opasna mala" data-obrisi="${p.posao_id}">Obriši posao</button>
            <button class="dugme tiha mala" data-rijesen="${p.id}">Sređeno — vrati majstoru</button>
          </div>`}
      </article>`;
  }).join("");
}

function obiljeziNove(problemi) {
  const novi = problemi.filter((p) => p.stanje === "nov").length;
  const znak = el("broj-problema");
  znak.textContent = novi;
  znak.hidden = novi === 0;
}

// Broj novih problema se vidi na jezičku i kad nisi u tom dijelu.
async function osvjeziBrojProblema() {
  try { obiljeziNove((await api("/api/admin-problemi")).problemi); } catch {}
}

/* ── Poslovi ── */

async function ucitajPoslove() {
  const { poslovi } = await api("/api/admin-poslovi");
  if (!poslovi.length) {
    el("lista-poslovi").innerHTML = '<div class="prazno">Još nema poslova.</div>';
    return;
  }

  el("lista-poslovi").innerHTML = poslovi.map((p) => {
    const kupljen = p.status === "kupljen";
    const prijavljen = p.kupovina_stanje === "prijavljen";
    return `
      <article class="posao">
        <div class="posao-vrh">
          <span class="znak ${kupljen ? "zelena" : "zuta"}">
            ${nazivKategorije(p.kategorija)}
          </span>
          ${prijavljen ? '<span class="znak crvena">prijavljen problem</span>' : ""}
          <span class="cijena">${novac(p.cijena)}</span>
        </div>
        <p class="posao-opis">${bezHtml(p.opis)}</p>
        ${p.slike?.length ? `<div class="slike">${p.slike.map((s) =>
          `<a href="${bezHtml(s)}" target="_blank" rel="noopener"><img src="${bezHtml(s)}" alt="" loading="lazy"></a>`).join("")}</div>` : ""}
        <div class="posao-red">📍 ${bezHtml(p.adresa ?? p.lokacija)}${p.stan ? ", " + bezHtml(p.stan) : ""}</div>
        <div class="posao-red">
          👤 ${bezHtml([p.klijent_ime, p.klijent_prezime].filter(Boolean).join(" "))}
          · ${formatBroj(p.klijent_telefon ?? "")}
          ${p.klijent_email ? "· " + bezHtml(p.klijent_email) : ""}
        </div>
        <div class="posao-red">
          ${kupljen ? `✅ Kupio: <b>${bezHtml(p.kupac_ime ?? "")}</b>` : "⏳ Čeka majstora"}
          · izvor: ${bezHtml(p.izvor)}
        </div>
        <div class="red-dugmadi">
          ${kupljen ? `
            <button class="dugme ${prijavljen ? "opasna" : "tiha"} mala" data-ponisti="${p.id}">
              Nije se dogovorio — vrati u ponudu
            </button>` : ""}
          <button class="dugme opasna mala" data-obrisi="${p.id}">Obriši</button>
        </div>
      </article>`;
  }).join("");
}

async function ponistiKupovinu(posaoId) {
  if (!confirm(
    "Vratiti posao u ponudu?\n\n" +
    "Majstoru se skida naplaćeni iznos sa duga, a posao se opet nudi svim " +
    "majstorima te struke.",
  )) return;

  await api("/api/admin-ponisti", { method: "POST", body: JSON.stringify({ posao_id: posaoId }) });
  await osvjeziTrenutni();
}

el("dugme-nov-posao").addEventListener("click", () => {
  const prozor = document.createElement("div");
  prozor.className = "prekrivac";
  prozor.innerHTML = `
    <div class="prozor">
      <h3>Nov posao</h3>
      <div id="greska-posao"></div>
      <label class="polje"><span>Kategorija</span>
        <select id="np-kat">
          ${kategorije.map((k) => `<option value="${k.id}">${k.naziv} — ${novac(k.cijena)}</option>`).join("")}
        </select>
      </label>
      <label class="polje"><span>Šta treba uraditi</span>
        <textarea id="np-opis" placeholder="Curi ispod sudopere, voda se skuplja na podu."></textarea>
      </label>
      <label class="polje"><span>Adresa, ulica i broj</span><input id="np-adresa" placeholder="Vasa Raičkovića 14"></label>
      <label class="polje"><span>Sprat i stan</span><input id="np-stan" placeholder="III sprat, stan 7"></label>
      <label class="polje"><span>Kvart (nije obavezno)</span><input id="np-lokacija" placeholder="Zabjelo"></label>
      <label class="polje"><span>Kad (nije obavezno)</span><input id="np-termin" placeholder="Danas poslije 16h"></label>
      <label class="polje"><span>Ime klijenta</span><input id="np-ime" placeholder="Ana"></label>
      <label class="polje"><span>Prezime</span><input id="np-prezime" placeholder="Popović"></label>
      <label class="polje"><span>Email</span><input id="np-email" type="email" placeholder="ana.popovic@email.com"></label>
      <label class="polje"><span>Telefon klijenta</span><input id="np-telefon" type="tel" placeholder="069 123 456"></label>
      <label class="polje"><span>Cijena (prazno = po cjenovniku)</span>
        <input id="np-cijena" type="number" step="0.5" placeholder="">
      </label>
      <div class="red-dugmadi">
        <button class="dugme tiha" data-ne>Odustani</button>
        <button class="dugme" data-da>Objavi majstorima</button>
      </div>
    </div>`;
  document.body.appendChild(prozor);

  prozor.querySelector("[data-ne]").onclick = () => prozor.remove();
  prozor.querySelector("[data-da]").onclick = async () => {
    const uzmi = (id) => prozor.querySelector(id).value;
    try {
      await api("/api/admin-posao", {
        method: "POST",
        body: JSON.stringify({
          kategorija: uzmi("#np-kat"), opis: uzmi("#np-opis"),
          lokacija: uzmi("#np-lokacija") || "Podgorica",
          adresa: uzmi("#np-adresa"), stan: uzmi("#np-stan"),
          termin: uzmi("#np-termin"),
          ime: uzmi("#np-ime"), prezime: uzmi("#np-prezime"),
          email: uzmi("#np-email"), telefon: uzmi("#np-telefon"),
          cijena: uzmi("#np-cijena"),
        }),
      });
      prozor.remove();
      await ucitajPoslove();
    } catch (greska) {
      prozor.querySelector("#greska-posao").innerHTML =
        `<div class="poruka lose">${greska.message}</div>`;
    }
  };
});

/* ── Cijene ── */

function prikaziCijene() {
  el("lista-cijena").innerHTML = kategorije.map((k) => `
    <label class="polje" style="display:flex;align-items:center;gap:12px">
      <span style="flex:1;margin:0;text-transform:none;font-size:15px;letter-spacing:0;opacity:1;font-weight:700">
        ${k.naziv}
      </span>
      <input type="number" step="0.5" min="0" value="${k.cijena}" data-cijena="${k.id}"
             style="width:110px">
    </label>`).join("");
}

el("dugme-sacuvaj-cijene").addEventListener("click", async () => {
  const cijene = {};
  document.querySelectorAll("[data-cijena]").forEach((i) => {
    cijene[i.dataset.cijena] = Number(i.value);
  });
  await api("/api/admin-cjenovnik", { method: "POST", body: JSON.stringify({ cijene }) });
  kategorije = (await api("/api/kategorije")).kategorije;
  el("poruka-cijene").innerHTML = '<div class="poruka dobro">Cijene su sačuvane.</div>';
  setTimeout(() => { el("poruka-cijene").innerHTML = ""; }, 2500);
});

/* ── Jezičci ── */

document.querySelectorAll(".jezicak").forEach((j) => {
  j.addEventListener("click", async () => {
    document.querySelectorAll(".jezicak").forEach((x) => x.classList.remove("izabran"));
    j.classList.add("izabran");
    const koji = j.dataset.jezicak;

    el("dio-majstori").hidden = koji !== "majstori";
    el("dio-prihvaceni").hidden = koji !== "prihvaceni";
    el("dio-problemi").hidden = koji !== "problemi";
    el("dio-poslovi").hidden = koji !== "poslovi";
    el("dio-cijene").hidden = koji !== "cijene";

    if (koji === "majstori") await ucitajMajstore();
    if (koji === "prihvaceni") await ucitajPrihvacene();
    if (koji === "problemi") await ucitajProbleme();
    if (koji === "poslovi") await ucitajPoslove();
    if (koji === "cijene") prikaziCijene();
  });
});

/* ── Uživo ── */

/* Provjera na petnaest sekundi — na Vercelu nema stalne veze. */
function pratiDogadjaje() {
  setInterval(() => {
    if (!document.hidden) osvjeziTrenutni().catch(() => {});
  }, 15_000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) osvjeziTrenutni().catch(() => {});
  });
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

const datum = (iso) => new Date(iso).toLocaleDateString("sr-Latn-ME", { day: "2-digit", month: "2-digit" });

const datumSat = (iso) => new Date(iso).toLocaleString("sr-Latn-ME", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

// 1 posao · 2 posla · 5 poslova — da ne piše „1 poslova".
function poslova(n) {
  const zadnja = n % 10;
  const zadnje_dvije = n % 100;
  if (zadnje_dvije >= 11 && zadnje_dvije <= 14) return `${n} poslova`;
  if (zadnja === 1) return `${n} posao`;
  if (zadnja >= 2 && zadnja <= 4) return `${n} posla`;
  return `${n} poslova`;
}

/* ── Obavještenja ── */

el("dugme-zvono").addEventListener("click", async () => {
  const dugme = el("dugme-zvono");
  const staro = dugme.textContent;
  dugme.disabled = true;
  dugme.textContent = "Uključujem…";

  try {
    const r = await ukljuciPush(api);
    if (!r.ok) {
      alert(r.razlog);
      dugme.textContent = staro;
      return;
    }
    dugme.textContent = "Obavještenja ✓";
    await api("/api/push-proba", { method: "POST" });
  } catch (greska) {
    alert(greska.message);
    dugme.textContent = staro;
  } finally {
    dugme.disabled = false;
  }
});

pushUkljucen().then((da) => {
  if (da) el("dugme-zvono").textContent = "Obavještenja ✓";
}).catch(() => {});

/* Bez service workera nema „dodaj na početni ekran". */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/majstori/sw.js").catch(() => {});
}

/* ── Start ── */

if (token) {
  uđi().catch(() => {
    token = null;
    try { localStorage.removeItem(KLJUC); } catch {}
    el("ekran-prijava").hidden = false;
    el("ekran-app").hidden = true;
  });
}
