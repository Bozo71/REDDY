/* Sve API rute, kao jedna Vercel funkcija.
   Lokalno isto radi — server.mjs ga poziva. */

import { randomInt, randomUUID } from "node:crypto";

import {
  javniKljuc, zapamtiPretplatu, zaboraviPretplatu, javiZaNovPosao, posaljiProbu,
} from "../push.mjs";

import {
  KATEGORIJE, KLJUCEVI_FALE, citaj, citajJedan, upisi, izmijeni, obrisi, pozovi,
  hash, provjeriHash, normalizujTelefon, napraviSesiju, nadjiSesiju,
  obrisiSesiju, stanjeMajstora, cijenaKategorije, otpremiSliku, sada,
} from "../baza-supabase.mjs";

/* ── Sitnice ───────────────────────────────────────────────────────────── */

const posalji = (res, kod, telo) => {
  res.statusCode = kod;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(telo));
};

const greska = (res, kod, poruka) => posalji(res, kod, { greska: poruka });

async function tijelo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const komadi = [];
  for await (const k of req) komadi.push(k);
  if (!komadi.length) return {};
  try { return JSON.parse(Buffer.concat(komadi).toString("utf8")); } catch { return {}; }
}

const tokenIz = (req) => {
  const z = req.headers.authorization ?? "";
  return z.startsWith("Bearer ") ? z.slice(7) : null;
};

async function trazenMajstor(req, res) {
  const s = await nadjiSesiju(tokenIz(req));
  if (!s || s.vrsta !== "majstor") { greska(res, 401, "Niste prijavljeni."); return null; }
  const m = await citajJedan("majstori", `id=eq.${s.ko_id}`);
  if (!m) { greska(res, 401, "Nalog ne postoji."); return null; }
  return m;
}

async function trazenAdmin(req, res) {
  const s = await nadjiSesiju(tokenIz(req));
  if (!s || s.vrsta !== "admin") { greska(res, 401, "Niste prijavljeni."); return null; }
  return s;
}

/* Dok se supabase-firme.sql ne pokrene, tabela firma_nalozi ne postoji.
   Poslovnici ne treba sirova greška iz baze — ona ne zna šta je to. */
const FALI_FIRME = /firme|poslovnice|firma_nalozi|prijave_firmi/;
const PORUKA_FIRME =
  "Dio za firme još nije uključen. Javite se Reddy-ju na 069 600 628.";

/* Nalog firme: poslovnica prijavljuje kvar i vidi svoje, direktor vidi
   cijelu firmu i ništa ne dira. Oba ulaze na /firme. */
async function trazenaFirma(req, res) {
  const s = await nadjiSesiju(tokenIz(req));
  if (!s || s.vrsta !== "firma") { greska(res, 401, "Niste prijavljeni."); return null; }

  let n;
  try {
    n = await citajJedan(
      "firma_nalozi",
      `id=eq.${s.ko_id}&select=*,firme(id,naziv,pauzirana),poslovnice(id,naziv,adresa,lokacija,telefon,pauzirana)`,
    );
  } catch (e) {
    if (FALI_FIRME.test(e.message)) { greska(res, 503, PORUKA_FIRME); return null; }
    throw e;
  }
  if (!n) { greska(res, 401, "Nalog ne postoji."); return null; }
  if (n.pauziran) { greska(res, 403, "Nalog je pauziran. Javite se Reddy-ju."); return null; }
  if (n.firme?.pauzirana) { greska(res, 403, "Nalog firme je pauziran."); return null; }
  return n;
}

const kategorijeMajstora = (m) => (Array.isArray(m.kategorije) ? m.kategorije : []);

/* Naziv zanata → oznaka pod kojom živi u bazi: bez kvačica, mala slova,
   razmaci u donju crtu. „Klima i grijanje" → klima_i_grijanje. */
function uOznaku(naziv) {
  return String(naziv)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d").replace(/ć|č/gi, "c").replace(/š/gi, "s").replace(/ž/gi, "z")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/* Dok se supabase-zanati.sql ne pokrene, cjenovnik nema kolone naziv,
   redoslijed i aktivna. Umjesto sirove greške iz baze, reci šta da se radi. */
function bazaNijeSpremna(e) {
  return /naziv|redoslijed|aktivna/.test(e.message) && /column|kolon/i.test(e.message);
}

/* Šifra za poslovnicu. Bez slova koja se miješaju (O/0, I/l/1) — čita se
   sa papira i kuca na telefonu, pa greška u prepisu košta poziv. */
function novaSifra() {
  const znaci = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += znaci[randomInt(0, znaci.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Da li zanat postoji u bazi — provjera umjesto spiska iz koda. */
async function zanatPostoji(kategorija) {
  if (!kategorija) return false;
  try {
    const z = await citajJedan("cjenovnik", `kategorija=eq.${encodeURIComponent(kategorija)}`);
    if (z) return true;
  } catch { /* baza zakazala — pada na spisak iz koda */ }
  return KATEGORIJE.some((k) => k.id === kategorija);
}
const razbijSlike = (s) => (Array.isArray(s) ? s : []);

/* Prije kupovine majstor ne smije dobiti tačnu adresu — samo ulicu bez broja. */
function grubaLokacija(p) {
  if (p.lokacija && p.lokacija !== "Podgorica") return p.lokacija;
  if (!p.adresa) return "Podgorica";
  return String(p.adresa).replace(/[\s,]*(bb|\d+.*)$/i, "").trim() || "Podgorica";
}

/* Zaštita javne forme — tri zahtjeva sa istog broja u pola sata.
   Na Vercelu se memorija ne dijeli među pozivima, pa brojimo u bazi. */
async function prebrzo(telefon) {
  const prije = new Date(Date.now() - 30 * 60_000).toISOString();
  const skorasnji = await citaj(
    "poslovi",
    `izvor=eq.sajt&napravljen=gte.${prije}&select=id,kontakti!inner(telefon)` +
    `&kontakti.telefon=eq.${encodeURIComponent(telefon)}`,
  );
  return (skorasnji?.length ?? 0) >= 3;
}

/* ── Rute ──────────────────────────────────────────────────────────────── */

const rute = {
  /* Zanati dolaze iz baze, pa se dodaju iz panela bez diranja koda.

     Čita se bez „order" i slaže ovdje — tako red prolazi i prije nego se
     supabase-zanati.sql pokrene, dok kolona redoslijed još ne postoji.
     Tada naziv i aktivna dođu prazni, pa se uzimaju iz KATEGORIJE, a
     cijena svejedno dolazi iz baze — kao i do sad.
     KATEGORIJE služe kao rezerva samo ako baza sasvim zakaže. */
  "GET /api/kategorije": async (req, res) => {
    try {
      const redovi = await citaj("cjenovnik", "select=*");
      if (redovi.length) {
        const sve = redovi
          .map((c) => {
            const izKoda = KATEGORIJE.find((k) => k.id === c.kategorija);
            const mjesto = KATEGORIJE.indexOf(izKoda);
            return {
              id: c.kategorija,
              naziv: c.naziv || izKoda?.naziv || c.kategorija,
              cijena: Number(c.cijena),
              aktivna: c.aktivna !== false,
              _red: c.redoslijed ?? (izKoda ? mjesto * 10 : 1000),
            };
          })
          .sort((a, b) => a._red - b._red || a.naziv.localeCompare(b.naziv))
          .map(({ _red, ...k }) => k);

        // Ugašeni zanati se ne nude, ali ostaju poznati zbog starih poslova.
        return posalji(res, 200, {
          kategorije: sve.filter((k) => k.aktivna),
          sve,
        });
      }
    } catch (e) {
      console.warn("[kategorije] baza:", e.message);
    }
    posalji(res, 200, { kategorije: KATEGORIJE, sve: KATEGORIJE });
  },

  /* ── Obavještenja ── */

  "GET /api/push-kljuc": async (req, res) => {
    posalji(res, 200, { kljuc: javniKljuc() });
  },

  // Ko se pretplaćuje poznaje se po tokenu — majstor ili admin.
  "POST /api/push-prijava": async (req, res) => {
    const s = await nadjiSesiju(tokenIz(req));
    if (!s) return greska(res, 401, "Niste prijavljeni.");

    const { pretplata } = await tijelo(req);
    try {
      await zapamtiPretplatu(s.vrsta, s.ko_id, pretplata);
      posalji(res, 200, { ok: true });
    } catch (e) {
      greska(res, 400, e.message);
    }
  },

  "POST /api/push-odjava": async (req, res) => {
    const { endpoint } = await tijelo(req);
    if (endpoint) await zaboraviPretplatu(endpoint).catch(() => {});
    posalji(res, 200, { ok: true });
  },

  "POST /api/push-proba": async (req, res) => {
    const s = await nadjiSesiju(tokenIz(req));
    if (!s) return greska(res, 401, "Niste prijavljeni.");
    posalji(res, 200, await posaljiProbu(s.vrsta, s.ko_id));
  },

  /* ── Majstor ── */

  "POST /api/prijava": async (req, res) => {
    const t = await tijelo(req);
    const telefon = normalizujTelefon(t.telefon);
    const m = await citajJedan("majstori", `telefon=eq.${encodeURIComponent(telefon)}`);

    if (!m || !provjeriHash(t.pin, m.pin_hash)) {
      return greska(res, 401, "Pogrešan broj telefona ili PIN.");
    }
    if (m.pauziran) return greska(res, 403, "Nalog je pauziran. Javite se Reddy-ju.");

    posalji(res, 200, { token: await napraviSesiju("majstor", m.id), ime: m.ime });
  },

  "POST /api/odjava": async (req, res) => {
    await obrisiSesiju(tokenIz(req));
    posalji(res, 200, { ok: true });
  },

  "GET /api/ja": async (req, res) => {
    const m = await trazenMajstor(req, res); if (!m) return;
    posalji(res, 200, {
      ime: m.ime,
      telefon: m.telefon,
      kategorije: kategorijeMajstora(m),
      limit_duga: Number(m.limit_duga),
      pauziran: m.pauziran,
      ...(await stanjeMajstora(m.id)),
    });
  },

  "GET /api/poslovi": async (req, res) => {
    const m = await trazenMajstor(req, res); if (!m) return;
    if (m.pauziran) return posalji(res, 200, { poslovi: [], pauziran: true });

    const moje = kategorijeMajstora(m);
    if (!moje.length) return posalji(res, 200, { poslovi: [] });

    const redovi = await citaj(
      "poslovi",
      `status=eq.slobodan&kategorija=in.(${moje.join(",")})` +
      `&select=id,kategorija,opis,lokacija,adresa,fotografije,termin,cijena,napravljen` +
      `&order=napravljen.desc`,
    );

    posalji(res, 200, {
      poslovi: redovi.map((p) => ({
        id: p.id,
        kategorija: p.kategorija,
        opis: p.opis,
        gdje: grubaLokacija(p),
        slike: razbijSlike(p.fotografije),
        termin: p.termin,
        cijena: Number(p.cijena),
        napravljen: p.napravljen,
      })),
    });
  },

  // Sva provjera i upis idu u jednoj operaciji u bazi (funkcija kupi_posao).
  "POST /api/kupi": async (req, res) => {
    const m = await trazenMajstor(req, res); if (!m) return;
    const { posao_id } = await tijelo(req);
    if (!posao_id) return greska(res, 400, "Nedostaje posao.");

    const ishod = await pozovi("kupi_posao", { p_majstor: m.id, p_posao: posao_id });
    if (ishod?.greska) return greska(res, ishod.kod ?? 400, ishod.greska);

    posalji(res, 200, { ...ishod, stanje: await stanjeMajstora(m.id) });
  },

  "GET /api/moji": async (req, res) => {
    const m = await trazenMajstor(req, res); if (!m) return;

    const kupovine = await citaj(
      "kupovine",
      `majstor_id=eq.${m.id}&stanje=neq.prijavljen&order=vrijeme.desc` +
      `&select=cijena,vrijeme,stanje,poslovi(id,kategorija,opis,lokacija,adresa,stan,fotografije,termin,status,` +
      `kontakti(ime,prezime,email,telefon))`,
    );

    posalji(res, 200, {
      poslovi: kupovine.filter((k) => k.poslovi).map((k) => {
        const p = k.poslovi;
        const ko = p.kontakti ?? {};
        return {
          id: p.id, kategorija: p.kategorija, opis: p.opis,
          lokacija: p.lokacija, adresa: p.adresa, stan: p.stan,
          slike: razbijSlike(p.fotografije), termin: p.termin,
          status: p.status,
          cijena: Number(k.cijena), vrijeme: k.vrijeme, stanje: k.stanje,
          klijent_ime: ko.ime, klijent_prezime: ko.prezime,
          klijent_email: ko.email, klijent_telefon: ko.telefon,
        };
      }),
    });
  },

  "POST /api/problem": async (req, res) => {
    const m = await trazenMajstor(req, res); if (!m) return;
    const { posao_id, opis } = await tijelo(req);

    const k = await citajJedan(
      "kupovine",
      `posao_id=eq.${posao_id}&majstor_id=eq.${m.id}&stanje=eq.vazi`,
    );
    if (!k) return greska(res, 404, "Nemate tu kupovinu.");

    await izmijeni("kupovine", `id=eq.${k.id}`, { stanje: "prijavljen" });
    await upisi("problemi", {
      posao_id, majstor_id: m.id,
      opis: String(opis ?? "").slice(0, 500) || "Bez opisa.",
      stanje: "nov", vrijeme: sada(),
    });

    posalji(res, 200, { ok: true });
  },

  /* ── Zahtjev sa sajta ── */

  "POST /api/zahtjev": async (req, res) => {
    const t = await tijelo(req);
    if (t.website) return posalji(res, 200, { ok: true });   // mamac za botove

    const telefon = normalizujTelefon(t.telefon);
    if (!t.kategorija || !t.opis || telefon.length < 11) {
      return greska(res, 400, "Nedostaju kategorija, opis ili ispravan telefon.");
    }
    if (await prebrzo(telefon)) {
      return greska(res, 429, "Previše zahtjeva sa istog broja. Pokušajte kasnije.");
    }

    /* Ako struka ne postoji — stara stranica u kešu, ugašen zanat — zahtjev
       se ne odbija. Ide u kućne popravke, a struka se ispravi u panelu;
       izgubljen klijent je gora greška od pogrešne struke. */
    let kategorija = String(t.kategorija);
    if (!(await zanatPostoji(kategorija))) {
      console.warn("[zahtjev] nepoznata struka:", kategorija);
      kategorija = "kucne_popravke";
    }

    const posao = await upisi("poslovi", {
      kategorija,
      opis: String(t.opis).slice(0, 1000),
      lokacija: t.lokacija || "Podgorica",
      adresa: t.adresa ?? null,
      stan: t.stan ?? null,
      fotografije: Array.isArray(t.fotografije) ? t.fotografije.slice(0, 8) : [],
      termin: t.termin ?? null,
      cijena: await cijenaKategorije(kategorija),
      status: "slobodan",
      izvor: t.izvor || "sajt",
    });

    await upisi("kontakti", {
      posao_id: posao.id,
      ime: t.ime || "Klijent",
      prezime: t.prezime ?? null,
      email: t.email ?? null,
      telefon,
    });

    // Javlja majstorima te struke i tebi. Ako padne, zahtjev svejedno prolazi.
    await javiZaNovPosao(posao).catch(() => {});

    posalji(res, 201, { ok: true, id: posao.id });
  },

  /* ── Firme sa više poslovnica ──────────────────────────────────────────
     Poslovnica prijavi kvar, a posao pada u isti spisak u kojem su i poslovi
     sa sajta — majstori i naplata ostaju nedirnuti. Jedina razlika je što
     posao nosi poslovnicu, pa znamo za koga je rađeno. */

  "POST /api/firma-prijava": async (req, res) => {
    const t = await tijelo(req);
    const nadimak = String(t.nadimak ?? "").trim().toLowerCase();

    let n;
    try {
      n = await citajJedan(
        "firma_nalozi",
        `nadimak=eq.${encodeURIComponent(nadimak)}&select=*,firme(naziv,pauzirana)`,
      );
    } catch (e) {
      if (FALI_FIRME.test(e.message)) return greska(res, 503, PORUKA_FIRME);
      throw e;
    }
    if (!n || !provjeriHash(t.sifra, n.sifra_hash)) {
      return greska(res, 401, "Pogrešno korisničko ime ili šifra.");
    }
    if (n.pauziran) return greska(res, 403, "Nalog je pauziran. Javite se Reddy-ju.");
    if (n.firme?.pauzirana) return greska(res, 403, "Nalog firme je pauziran.");

    posalji(res, 200, { token: await napraviSesiju("firma", n.id), ime: n.ime });
  },

  "GET /api/firma-ja": async (req, res) => {
    const n = await trazenaFirma(req, res); if (!n) return;
    posalji(res, 200, {
      ime: n.ime,
      vrsta: n.vrsta,
      firma: n.firme?.naziv ?? "",
      poslovnica: n.poslovnice
        ? { naziv: n.poslovnice.naziv, adresa: n.poslovnice.adresa, telefon: n.poslovnice.telefon }
        : null,
    });
  },

  /* Slika ide kroz nas, pa aplikacija za firme ne mora da nosi ključ baze.
     Pregledač je prije slanja smanji — ovdje se samo provjeri i spusti. */
  "POST /api/firma-slika": async (req, res) => {
    const n = await trazenaFirma(req, res); if (!n) return;
    const { podaci, tip } = await tijelo(req);

    const cisto = String(podaci ?? "").replace(/^data:[^,]*,/, "");
    if (!cisto) return greska(res, 400, "Nema slike.");

    const bajtovi = Buffer.from(cisto, "base64");
    if (!bajtovi.length) return greska(res, 400, "Slika nije čitljiva.");
    if (bajtovi.length > 4_000_000) {
      return greska(res, 413, "Slika je prevelika. Pokušajte sa manjom.");
    }

    const vrsta = /^image\/(jpeg|png|webp)$/.test(tip ?? "") ? tip : "image/jpeg";
    const kraj = { "image/png": "png", "image/webp": "webp" }[vrsta] ?? "jpg";

    try {
      const adresa = await otpremiSliku(
        `${randomUUID().replace(/-/g, "")}.${kraj}`, bajtovi, vrsta,
      );
      posalji(res, 201, { adresa });
    } catch (e) {
      console.warn("[firma-slika]", e.message);
      greska(res, 502, "Slika nije mogla da se sačuva. Pošaljite prijavu bez nje.");
    }
  },

  "POST /api/firma-zahtjev": async (req, res) => {
    const n = await trazenaFirma(req, res); if (!n) return;
    if (n.vrsta !== "poslovnica" || !n.poslovnice) {
      return greska(res, 403, "Kvar prijavljuje poslovnica, ne direktor.");
    }
    if (n.poslovnice.pauzirana) return greska(res, 403, "Poslovnica je pauzirana.");

    const t = await tijelo(req);
    const opis = String(t.opis ?? "").trim();
    if (opis.length < 5) return greska(res, 400, "Opišite kvar u par riječi.");

    let kategorija = String(t.kategorija ?? "");
    if (!(await zanatPostoji(kategorija))) kategorija = "kucne_popravke";

    const posao = await upisi("poslovi", {
      kategorija,
      opis: opis.slice(0, 1000),
      lokacija: n.poslovnice.lokacija || "Podgorica",
      // Adresa je adresa poslovnice — ne kuca je niko i ne može da pogriješi.
      adresa: n.poslovnice.adresa,
      stan: String(t.gdje ?? "").slice(0, 120) || null,
      fotografije: Array.isArray(t.fotografije) ? t.fotografije.slice(0, 8) : [],
      termin: String(t.termin ?? "").slice(0, 120) || null,
      cijena: await cijenaKategorije(kategorija),
      status: "slobodan",
      izvor: "firma",
      poslovnica_id: n.poslovnice.id,
    });

    /* Kontakt je sama poslovnica — majstor zove njih, ne direktora.
       Telefon poslovnice, ako ga nema onda ime naloga bez broja. */
    await upisi("kontakti", {
      posao_id: posao.id,
      ime: n.firme?.naziv ?? "Firma",
      prezime: n.poslovnice.naziv,
      email: null,
      telefon: normalizujTelefon(n.poslovnice.telefon ?? "") || "—",
    });

    await javiZaNovPosao({
      ...posao,
      firma: n.firme?.naziv,
      poslovnica: n.poslovnice.naziv,
    }).catch(() => {});

    posalji(res, 201, { ok: true, id: posao.id });
  },

  /* Poslovnica vidi svoje prijave, direktor sve iz svoje firme. */
  "GET /api/firma-prijave": async (req, res) => {
    const n = await trazenaFirma(req, res); if (!n) return;

    const filter = n.vrsta === "direktor"
      ? `firma_id=eq.${n.firma_id}`
      : `poslovnica_id=eq.${n.poslovnica_id}`;

    const redovi = await citaj(
      "prijave_firmi", `${filter}&order=napravljen.desc&limit=200`,
    );

    posalji(res, 200, {
      vrsta: n.vrsta,
      prijave: redovi.map((p) => ({
        id: p.id,
        poslovnica: p.poslovnica,
        kategorija: p.kategorija,
        opis: p.opis,
        slike: razbijSlike(p.fotografije),
        status: p.status,
        napravljen: p.napravljen,
        // Ime majstora tek kad neko uzme posao — dotad nema koga prikazati.
        majstor: p.majstor_ime ?? null,
        majstor_telefon: p.majstor_telefon ?? null,
      })),
    });
  },

  /* ── Admin ── */

  "POST /api/admin-prijava": async (req, res) => {
    const t = await tijelo(req);
    const a = await citajJedan(
      "admini", `nadimak=eq.${encodeURIComponent(String(t.nadimak ?? "").trim())}`,
    );
    if (!a || !provjeriHash(t.sifra, a.sifra_hash)) {
      return greska(res, 401, "Pogrešan nadimak ili šifra.");
    }
    posalji(res, 200, { token: await napraviSesiju("admin", a.id), nadimak: a.nadimak });
  },

  "GET /api/admin-majstori": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const redovi = await citaj("stanje_majstora", "select=*&order=ime.asc");
    posalji(res, 200, {
      majstori: redovi.map((m) => ({
        id: m.id, ime: m.ime, telefon: m.telefon,
        kategorije: Array.isArray(m.kategorije) ? m.kategorije : [],
        limit_duga: Number(m.limit_duga), pauziran: m.pauziran,
        kupljeno: Number(m.kupljeno),
        ukupno_kupovina: Number(m.ukupno_kupovina),
        ukupno_placeno: Number(m.ukupno_placeno),
        dug: Number(m.dug),
      })),
    });
  },

  "POST /api/admin-majstor": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);
    const telefon = normalizujTelefon(t.telefon);

    if (!t.ime || telefon.length < 11 || !String(t.pin ?? "").match(/^\d{4,8}$/)) {
      return greska(res, 400, "Treba ime, ispravan telefon i PIN od 4 do 8 cifara.");
    }
    if (await citajJedan("majstori", `telefon=eq.${encodeURIComponent(telefon)}`)) {
      return greska(res, 409, "Taj broj već postoji.");
    }

    const m = await upisi("majstori", {
      ime: t.ime, telefon, pin_hash: hash(t.pin),
      kategorije: t.kategorije ?? [],
      limit_duga: Number(t.limit_duga ?? 30),
      pauziran: false,
    });
    posalji(res, 201, { ok: true, id: m.id });
  },

  "POST /api/admin-majstor-izmjena": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const izmjene = {};
    if (t.limit_duga !== undefined) izmjene.limit_duga = Number(t.limit_duga);
    if (t.pauziran !== undefined) izmjene.pauziran = !!t.pauziran;
    if (t.kategorije !== undefined) izmjene.kategorije = t.kategorije;
    if (!Object.keys(izmjene).length) return greska(res, 400, "Nema šta da se mijenja.");

    await izmijeni("majstori", `id=eq.${t.id}`, izmjene);
    posalji(res, 200, { ok: true });
  },

  /* Nov PIN za majstora. Stari se ne može pročitati — čuva se samo otisak —
     pa kad ga majstor zaboravi, pravi se nov i pokaže jednom. */
  "POST /api/admin-nov-pin": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { id } = await tijelo(req);

    const m = await citajJedan("majstori", `id=eq.${id}`);
    if (!m) return greska(res, 404, "Majstor ne postoji.");

    const pin = String(randomInt(100000, 1000000));   // šest cifara
    await izmijeni("majstori", `id=eq.${id}`, { pin_hash: hash(pin) });
    // Stare prijave se gase, da stari PIN odmah prestane da važi.
    await obrisi("sesije", `vrsta=eq.majstor&ko_id=eq.${id}`);

    posalji(res, 200, { ok: true, pin, ime: m.ime, telefon: m.telefon });
  },

  /* Brisanje majstora. Nezavršeni poslovi koje je kupio vraćaju se u ponudu
     da ne ostanu visiti ni kod koga. Završeni ostaju u evidenciji.
     Ako duguje, traži se izričita potvrda — brisanjem se gubi trag o dugu. */
  "POST /api/admin-obrisi-majstora": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { id, i_dug } = await tijelo(req);

    const m = await citajJedan("stanje_majstora", `id=eq.${id}`);
    if (!m) return greska(res, 404, "Majstor ne postoji.");

    const dug = Number(m.dug);
    if (dug > 0.001 && !i_dug) {
      return greska(res, 409,
        `${m.ime} duguje ${dug.toFixed(2)} €. Brisanjem se gubi trag o tom dugu.`);
    }

    // Poslovi koje nije stigao da završi idu nazad u ponudu.
    await izmijeni(
      "poslovi", `kupac_id=eq.${id}&status=eq.kupljen`,
      { status: "slobodan", kupac_id: null },
    );

    await obrisi("majstori", `id=eq.${id}`);
    posalji(res, 200, { ok: true, vracen_dug: dug });
  },

  "POST /api/admin-uplata": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const stanje = await stanjeMajstora(t.majstor_id);
    const iznos = t.sve ? stanje.dug : Number(t.iznos);
    if (!(iznos > 0)) return greska(res, 400, "Iznos mora biti veći od nule.");

    await upisi("uplate", {
      majstor_id: t.majstor_id,
      iznos: Number(iznos.toFixed(2)),
      napomena: t.sve ? "Izmirio sve" : "Primio keš",
    });
    posalji(res, 200, { ok: true, stanje: await stanjeMajstora(t.majstor_id) });
  },

  "GET /api/admin-poslovi": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const osnovno = `select=*,kontakti(ime,prezime,email,telefon),` +
      `majstori!poslovi_kupac_id_fkey(ime),kupovine(stanje,vrijeme)`;
    const kraj = "&order=napravljen.desc&limit=200";

    /* Poslovnica se traži samo ako tabela postoji. Dok se supabase-firme.sql
       ne pokrene, spisak poslova mora da radi kao i do sad. */
    let redovi;
    try {
      redovi = await citaj("poslovi", `${osnovno},poslovnice(naziv,firme(naziv))${kraj}`);
    } catch {
      redovi = await citaj("poslovi", osnovno + kraj);
    }

    posalji(res, 200, {
      poslovi: redovi.map((p) => {
        const ko = p.kontakti ?? {};
        const zadnja = (p.kupovine ?? []).sort(
          (a, b) => new Date(b.vrijeme) - new Date(a.vrijeme),
        )[0];
        return {
          ...p, cijena: Number(p.cijena), slike: razbijSlike(p.fotografije),
          klijent_ime: ko.ime, klijent_prezime: ko.prezime,
          klijent_email: ko.email, klijent_telefon: ko.telefon,
          kupac_ime: p.majstori?.ime ?? null,
          kupovina_stanje: zadnja?.stanje ?? null,
          firma: p.poslovnice?.firme?.naziv ?? null,
          poslovnica: p.poslovnice?.naziv ?? null,
        };
      }),
    });
  },

  "POST /api/admin-posao": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);
    const telefon = normalizujTelefon(t.telefon);

    if (!t.kategorija || !t.opis || telefon.length < 11) {
      return greska(res, 400, "Treba kategorija, opis i telefon klijenta.");
    }

    const posao = await upisi("poslovi", {
      kategorija: t.kategorija, opis: t.opis,
      lokacija: t.lokacija || "Podgorica",
      adresa: t.adresa ?? null, stan: t.stan ?? null,
      fotografije: Array.isArray(t.fotografije) ? t.fotografije : [],
      termin: t.termin ?? null,
      cijena: t.cijena !== undefined && t.cijena !== ""
        ? Number(t.cijena)
        : await cijenaKategorije(t.kategorija),
      status: "slobodan", izvor: "admin",
    });

    await upisi("kontakti", {
      posao_id: posao.id, ime: t.ime || "Klijent",
      prezime: t.prezime ?? null, email: t.email ?? null, telefon,
    });

    await javiZaNovPosao(posao).catch(() => {});

    posalji(res, 201, { ok: true, id: posao.id });
  },

  // Reklamacija: kupovina se poništi, dug padne, posao se opet nudi.
  "POST /api/admin-ponisti": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { posao_id } = await tijelo(req);

    const kupovine = await citaj(
      "kupovine",
      `posao_id=eq.${posao_id}&stanje=in.(vazi,prijavljen)&order=vrijeme.desc&limit=1`,
    );
    const k = kupovine?.[0];
    if (!k) return greska(res, 404, "Nema važeće kupovine za taj posao.");

    await izmijeni("kupovine", `id=eq.${k.id}`, { stanje: "ponistena" });
    await izmijeni("poslovi", `id=eq.${posao_id}`, { status: "slobodan", kupac_id: null });

    posalji(res, 200, { ok: true, stanje: await stanjeMajstora(k.majstor_id) });
  },

  /* Ispravka struke. Klijent često ne zna razliku pa za utičnicu izabere
     vodoinstalatera. Mijenja se samo dok je posao slobodan — kad ga neko
     kupi, platio je posao svoje struke i to se ne dira ispod ruke.
     Cijena ide po cjenovniku nove struke, a majstori te struke dobiju
     obavještenje kao da je posao tek stigao. */
  "POST /api/admin-promijeni-kategoriju": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { posao_id, kategorija } = await tijelo(req);

    if (!(await zanatPostoji(kategorija))) {
      return greska(res, 400, "Nepoznata struka.");
    }

    const posao = await citajJedan("poslovi", `id=eq.${posao_id}`);
    if (!posao) return greska(res, 404, "Posao ne postoji.");

    if (posao.status !== "slobodan") {
      return greska(res, 409,
        "Posao je već kupljen. Prvo ga vrati u ponudu, pa onda promijeni struku.");
    }
    if (posao.kategorija === kategorija) return posalji(res, 200, { ok: true });

    const cijena = await cijenaKategorije(kategorija);
    await izmijeni("poslovi", `id=eq.${posao_id}`, { kategorija, cijena });

    await javiZaNovPosao({ ...posao, kategorija, cijena }).catch(() => {});
    posalji(res, 200, { ok: true, kategorija, cijena });
  },

  /* Majstor javi da je završio — ti potvrdiš. Dug ostaje, posao je plaćen;
     ovo je samo evidencija šta je odrađeno, a šta još visi. */
  "POST /api/admin-zavrsen": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { posao_id, vrati } = await tijelo(req);

    const posao = await citajJedan("poslovi", `id=eq.${posao_id}`);
    if (!posao) return greska(res, 404, "Posao ne postoji.");

    if (!vrati && posao.status !== "kupljen" && posao.status !== "zavrsen") {
      return greska(res, 409, "Samo kupljen posao može biti označen kao završen.");
    }

    await izmijeni("poslovi", `id=eq.${posao_id}`, {
      status: vrati ? "kupljen" : "zavrsen",
    });
    posalji(res, 200, { ok: true });
  },

  "GET /api/admin-prihvaceni": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const trazi = (new URL(req.url, "http://x").searchParams.get("trazi") ?? "")
      .trim().toLowerCase();

    const redovi = await citaj(
      "kupovine",
      `select=vrijeme,cijena,stanje,majstori(id,ime,telefon),` +
      `poslovi(id,kategorija,opis,adresa,stan,lokacija,status,kontakti(ime,prezime,telefon,email))` +
      `&order=vrijeme.desc&limit=500`,
    );

    let prihvaceni = redovi.filter((r) => r.majstori && r.poslovi).map((r) => {
      const ko = r.poslovi.kontakti ?? {};
      return {
        vrijeme: r.vrijeme, cijena: Number(r.cijena), stanje: r.stanje,
        majstor_id: r.majstori.id, majstor: r.majstori.ime,
        majstor_telefon: r.majstori.telefon,
        posao_id: r.poslovi.id, kategorija: r.poslovi.kategorija,
        opis: r.poslovi.opis, adresa: r.poslovi.adresa,
        stan: r.poslovi.stan, lokacija: r.poslovi.lokacija,
        status: r.poslovi.status,
        klijent_ime: ko.ime, klijent_prezime: ko.prezime,
        klijent_telefon: ko.telefon, klijent_email: ko.email,
      };
    });

    if (trazi) {
      prihvaceni = prihvaceni.filter((r) =>
        [r.majstor, r.majstor_telefon, r.klijent_ime, r.klijent_prezime,
         r.klijent_telefon, r.opis, r.adresa]
          .some((p) => String(p ?? "").toLowerCase().includes(trazi)));
    }

    posalji(res, 200, { prihvaceni });
  },

  "GET /api/admin-problemi": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;

    const redovi = await citaj(
      "problemi",
      `select=id,opis,stanje,vrijeme,majstori(ime,telefon),` +
      `poslovi(id,kategorija,opis,adresa,stan,status,kontakti(ime,prezime,telefon))` +
      `&order=vrijeme.desc&limit=200`,
    );

    const problemi = redovi.filter((r) => r.poslovi && r.majstori).map((r) => {
      const ko = r.poslovi.kontakti ?? {};
      return {
        id: r.id, problem: r.opis, stanje: r.stanje, vrijeme: r.vrijeme,
        majstor: r.majstori.ime, majstor_telefon: r.majstori.telefon,
        posao_id: r.poslovi.id, kategorija: r.poslovi.kategorija,
        opis: r.poslovi.opis, adresa: r.poslovi.adresa, stan: r.poslovi.stan,
        status: r.poslovi.status,
        klijent_ime: ko.ime, klijent_prezime: ko.prezime, klijent_telefon: ko.telefon,
      };
    });

    // Nerješeni na vrh.
    problemi.sort((a, b) =>
      (a.stanje === "nov" ? 0 : 1) - (b.stanje === "nov" ? 0 : 1) ||
      new Date(b.vrijeme) - new Date(a.vrijeme));

    posalji(res, 200, { problemi });
  },

  // Sređeno: majstor nastavlja posao, dug mu ostaje.
  "POST /api/admin-problem-rijesen": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { id } = await tijelo(req);

    const pr = await citajJedan("problemi", `id=eq.${id}`);
    if (!pr) return greska(res, 404, "Problem ne postoji.");

    await izmijeni("problemi", `id=eq.${id}`, { stanje: "rijesen" });
    await izmijeni(
      "kupovine", `posao_id=eq.${pr.posao_id}&stanje=eq.prijavljen`, { stanje: "vazi" },
    );
    posalji(res, 200, { ok: true });
  },

  "POST /api/admin-obrisi-posao": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { posao_id } = await tijelo(req);

    const posao = await citajJedan("poslovi", `id=eq.${posao_id}`);
    if (!posao) return greska(res, 404, "Posao ne postoji.");

    const kupovine = await citaj("kupovine", `posao_id=eq.${posao_id}&select=majstor_id&limit=1`);
    const kupac = kupovine?.[0]?.majstor_id ?? null;

    // Veze su postavljene na kaskadno brisanje, pa odlazi sve odjednom.
    await obrisi("poslovi", `id=eq.${posao_id}`);

    posalji(res, 200, {
      ok: true,
      stanje: kupac ? await stanjeMajstora(kupac) : null,
    });
  },

  /* Nov zanat ili izmjena postojećeg. Oznaka se izvodi iz naziva i poslije
     se ne mijenja — po njoj se vežu poslovi i struke majstora. */
  "POST /api/admin-zanat": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const naziv = String(t.naziv ?? "").trim();
    const cijena = Number(t.cijena);

    if (naziv.length < 2) return greska(res, 400, "Naziv zanata je prekratak.");
    if (!(cijena >= 0)) return greska(res, 400, "Cijena mora biti broj.");

    const oznaka = t.kategorija || uOznaku(naziv);
    if (!oznaka) return greska(res, 400, "Naziv mora imati bar jedno slovo.");

    const postoji = await citajJedan("cjenovnik", `kategorija=eq.${encodeURIComponent(oznaka)}`);

    try {
      if (postoji) {
        await izmijeni("cjenovnik", `kategorija=eq.${encodeURIComponent(oznaka)}`, {
          naziv, cijena,
          ...(t.redoslijed !== undefined ? { redoslijed: Number(t.redoslijed) } : {}),
          ...(t.aktivna !== undefined ? { aktivna: !!t.aktivna } : {}),
        });
        return posalji(res, 200, { ok: true, kategorija: oznaka, nov: false });
      }

      // Novi ide na kraj spiska.
      const svi = await citaj("cjenovnik", "select=redoslijed&order=redoslijed.desc&limit=1");
      const redoslijed = t.redoslijed !== undefined
        ? Number(t.redoslijed)
        : Number(svi?.[0]?.redoslijed ?? 0) + 10;

      await upisi("cjenovnik", { kategorija: oznaka, naziv, cijena, redoslijed, aktivna: true });
      posalji(res, 201, { ok: true, kategorija: oznaka, nov: true });
    } catch (e) {
      if (bazaNijeSpremna(e)) {
        return greska(res, 503,
          "Baza još nije pripremljena za zanate. Otvori Supabase → SQL Editor " +
          "i pokreni supabase-zanati.sql, pa probaj opet.");
      }
      throw e;
    }
  },

  /* Gašenje zanata. Ne briše se: postojeći poslovi i majstori ga i dalje
     pominju, pa bi brisanje ostavilo rupe. Ugašen se samo više ne nudi. */
  "POST /api/admin-zanat-prekidac": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { kategorija, aktivna } = await tijelo(req);

    const z = await citajJedan("cjenovnik", `kategorija=eq.${encodeURIComponent(kategorija)}`);
    if (!z) return greska(res, 404, "Taj zanat ne postoji.");

    if (aktivna === false) {
      const slobodni = await citaj(
        "poslovi",
        `kategorija=eq.${encodeURIComponent(kategorija)}&status=eq.slobodan&select=id`,
      );
      if (slobodni.length) {
        return greska(res, 409,
          `Ima ${slobodni.length} nezauzetih poslova u toj struci. ` +
          `Prvo ih riješi ili prebaci u drugu struku.`);
      }
    }

    try {
      await izmijeni("cjenovnik", `kategorija=eq.${encodeURIComponent(kategorija)}`,
                     { aktivna: !!aktivna });
    } catch (e) {
      if (bazaNijeSpremna(e)) {
        return greska(res, 503,
          "Baza još nije pripremljena za zanate. Otvori Supabase → SQL Editor " +
          "i pokreni supabase-zanati.sql, pa probaj opet.");
      }
      throw e;
    }
    posalji(res, 200, { ok: true });
  },

  "POST /api/admin-cjenovnik": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);
    for (const [kat, cijena] of Object.entries(t.cijene ?? {})) {
      await izmijeni("cjenovnik", `kategorija=eq.${encodeURIComponent(kat)}`,
                     { cijena: Number(cijena) });
    }
    posalji(res, 200, { ok: true });
  },

  /* ── Admin: firme ──────────────────────────────────────────────────────
     Naloge za poslovnice otvara Božo. Direktor ih ne otvara sam — ko ulazi
     u sistem ostaje njegova odluka. */

  "GET /api/admin-firme": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;

    try {
      const [firme, poslovnice, nalozi, prijave] = await Promise.all([
        citaj("firme", "select=*&order=naziv.asc"),
        citaj("poslovnice", "select=*&order=naziv.asc"),
        citaj("firma_nalozi", "select=id,firma_id,poslovnica_id,vrsta,ime,nadimak,pauziran"),
        citaj("prijave_firmi", "select=firma_id,status"),
      ]);

      posalji(res, 200, {
        firme: firme.map((f) => ({
          id: f.id,
          naziv: f.naziv,
          pib: f.pib,
          adresa: f.adresa,
          pdv_stopa: Number(f.pdv_stopa),
          pauzirana: f.pauzirana,
          poslovnice: poslovnice
            .filter((p) => p.firma_id === f.id)
            .map((p) => ({
              ...p,
              nalozi: nalozi.filter((n) => n.poslovnica_id === p.id),
            })),
          direktori: nalozi.filter((n) => n.firma_id === f.id && n.vrsta === "direktor"),
          prijava: prijave.filter((p) => p.firma_id === f.id).length,
          nezauzeto: prijave.filter((p) => p.firma_id === f.id && p.status === "slobodan").length,
        })),
      });
    } catch (e) {
      if (FALI_FIRME.test(e.message)) {
        return greska(res, 503,
          "Baza još nije pripremljena za firme. Otvori Supabase → SQL Editor " +
          "i pokreni supabase-firme.sql, pa probaj opet.");
      }
      throw e;
    }
  },

  "POST /api/admin-firma": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const naziv = String(t.naziv ?? "").trim();
    if (naziv.length < 2) return greska(res, 400, "Naziv firme je prekratak.");

    const polja = {
      naziv,
      pib: String(t.pib ?? "").trim() || null,
      adresa: String(t.adresa ?? "").trim() || null,
      pdv_stopa: t.pdv_stopa === undefined ? 21 : Number(t.pdv_stopa),
      ...(t.pauzirana !== undefined ? { pauzirana: !!t.pauzirana } : {}),
    };
    if (!(polja.pdv_stopa >= 0 && polja.pdv_stopa <= 100)) {
      return greska(res, 400, "PDV mora biti broj između 0 i 100.");
    }

    if (t.id) {
      await izmijeni("firme", `id=eq.${t.id}`, polja);
      return posalji(res, 200, { ok: true, id: t.id, nova: false });
    }
    const f = await upisi("firme", polja);
    posalji(res, 201, { ok: true, id: f.id, nova: true });
  },

  "POST /api/admin-poslovnica": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const naziv = String(t.naziv ?? "").trim();
    const adresa = String(t.adresa ?? "").trim();
    if (naziv.length < 2) return greska(res, 400, "Naziv poslovnice je prekratak.");
    if (adresa.length < 4) return greska(res, 400, "Upiši adresu — po njoj majstor dolazi.");

    const polja = {
      naziv, adresa,
      lokacija: String(t.lokacija ?? "").trim() || "Podgorica",
      telefon: normalizujTelefon(t.telefon ?? "") || null,
      ...(t.pauzirana !== undefined ? { pauzirana: !!t.pauzirana } : {}),
    };

    if (t.id) {
      await izmijeni("poslovnice", `id=eq.${t.id}`, polja);
      return posalji(res, 200, { ok: true, id: t.id, nova: false });
    }
    if (!t.firma_id) return greska(res, 400, "Nedostaje firma.");
    const p = await upisi("poslovnice", { ...polja, firma_id: t.firma_id });
    posalji(res, 201, { ok: true, id: p.id, nova: true });
  },

  /* Nalog za ulaz u /firme. Šifru smišlja server i vraća je jednom —
     poslije se ne može pročitati, samo zamijeniti novom. */
  "POST /api/admin-firma-nalog": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);

    const ime = String(t.ime ?? "").trim();
    if (ime.length < 2) return greska(res, 400, "Upiši ko je — ime naloga.");

    const vrsta = t.vrsta === "direktor" ? "direktor" : "poslovnica";
    if (vrsta === "poslovnica" && !t.poslovnica_id && !t.id) {
      return greska(res, 400, "Nedostaje poslovnica.");
    }

    const sifra = String(t.sifra ?? "").trim() || novaSifra();
    if (sifra.length < 6) return greska(res, 400, "Šifra mora imati bar 6 znakova.");

    // Izmjena postojećeg: mijenja se ime i po potrebi šifra.
    if (t.id) {
      await izmijeni("firma_nalozi", `id=eq.${t.id}`, {
        ime,
        ...(t.sifra || t.nova_sifra ? { sifra_hash: hash(sifra) } : {}),
      });
      return posalji(res, 200, {
        ok: true, id: t.id, nov: false,
        ...(t.sifra || t.nova_sifra ? { sifra } : {}),
      });
    }

    const nadimak = String(t.nadimak ?? "").trim().toLowerCase() || uOznaku(ime).replace(/_/g, "-");
    if (nadimak.length < 3) return greska(res, 400, "Korisničko ime je prekratko.");

    const zauzet = await citajJedan(
      "firma_nalozi", `nadimak=eq.${encodeURIComponent(nadimak)}`,
    );
    if (zauzet) return greska(res, 409, `Korisničko ime „${nadimak}" je zauzeto.`);

    const n = await upisi("firma_nalozi", {
      firma_id: t.firma_id,
      poslovnica_id: vrsta === "direktor" ? null : t.poslovnica_id,
      vrsta, ime, nadimak, sifra_hash: hash(sifra),
    });

    posalji(res, 201, { ok: true, id: n.id, nov: true, nadimak, sifra });
  },

  "POST /api/admin-firma-nalog-prekidac": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { id, pauziran } = await tijelo(req);

    await izmijeni("firma_nalozi", `id=eq.${id}`, { pauziran: !!pauziran });
    // Pauziran nalog ne smije da ostane ulogovan na tuđem telefonu.
    if (pauziran) await obrisi("sesije", `vrsta=eq.firma&ko_id=eq.${id}`).catch(() => {});

    posalji(res, 200, { ok: true });
  },

  "POST /api/admin-obrisi-firma-nalog": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const { id } = await tijelo(req);

    await obrisi("sesije", `vrsta=eq.firma&ko_id=eq.${id}`).catch(() => {});
    await obrisi("firma_nalozi", `id=eq.${id}`);
    posalji(res, 200, { ok: true });
  },

  /* Izvod nosi i podatke majstora, da panel ne mora da ga traži posebnim
     pozivom — na mobilnoj vezi se svaki poziv osjeti. */
  "GET /api/admin-izvod": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const id = new URL(req.url, "http://x").searchParams.get("majstor");

    const kupovine = (await citaj(
      "kupovine",
      `majstor_id=eq.${id}&order=vrijeme.desc&limit=100&select=vrijeme,cijena,stanje,poslovi(opis,kategorija)`,
    )).map((k) => ({
      vrijeme: k.vrijeme, cijena: Number(k.cijena), stanje: k.stanje,
      opis: k.poslovi?.opis ?? "", kategorija: k.poslovi?.kategorija ?? "",
    }));

    const uplate = (await citaj(
      "uplate", `majstor_id=eq.${id}&order=vrijeme.desc&limit=100&select=vrijeme,iznos,napomena`,
    )).map((u) => ({ ...u, iznos: Number(u.iznos) }));

    const m = await citajJedan("stanje_majstora", `id=eq.${id}`);

    posalji(res, 200, {
      kupovine,
      uplate,
      majstor: m ? {
        id: m.id, ime: m.ime, telefon: m.telefon,
        kategorije: Array.isArray(m.kategorije) ? m.kategorije : [],
        limit_duga: Number(m.limit_duga), pauziran: m.pauziran,
        kupljeno: Number(m.kupljeno),
        ukupno_placeno: Number(m.ukupno_placeno),
        dug: Number(m.dug),
      } : null,
    });
  },
};

/* ── Ulaz ──────────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (KLJUCEVI_FALE) {
    return greska(res, 503,
      "Server nije podešen: nedostaje SUPABASE_URL ili SUPABASE_SERVICE_KEY " +
      "u Vercel → Settings → Environment Variables.");
  }

  const putanja = new URL(req.url, "http://x").pathname.replace(/\/+$/, "") || "/api";
  const ruta = rute[`${req.method} ${putanja}`];

  if (!ruta) return greska(res, 404, `Nema rute ${req.method} ${putanja}.`);

  try {
    await ruta(req, res);
  } catch (e) {
    console.error("[greška]", putanja, e);
    greska(res, 500, e.message);
  }
}

export { rute };
