/* Sve API rute, kao jedna Vercel funkcija.
   Lokalno isto radi — server.mjs ga poziva. */

import { randomInt } from "node:crypto";

import {
  KATEGORIJE, KLJUCEVI_FALE, citaj, citajJedan, upisi, izmijeni, obrisi, pozovi,
  hash, provjeriHash, normalizujTelefon, napraviSesiju, nadjiSesiju,
  obrisiSesiju, stanjeMajstora, cijenaKategorije, sada,
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

const kategorijeMajstora = (m) => (Array.isArray(m.kategorije) ? m.kategorije : []);
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
  "GET /api/kategorije": async (req, res) => {
    const cijene = await citaj("cjenovnik", "select=*");
    const mapa = Object.fromEntries(cijene.map((c) => [c.kategorija, Number(c.cijena)]));
    posalji(res, 200, {
      kategorije: KATEGORIJE.map((k) => ({ ...k, cijena: mapa[k.id] ?? k.cijena })),
    });
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
      `&select=cijena,vrijeme,stanje,poslovi(id,kategorija,opis,lokacija,adresa,stan,fotografije,termin,` +
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

    const posao = await upisi("poslovi", {
      kategorija: t.kategorija,
      opis: String(t.opis).slice(0, 1000),
      lokacija: t.lokacija || "Podgorica",
      adresa: t.adresa ?? null,
      stan: t.stan ?? null,
      fotografije: Array.isArray(t.fotografije) ? t.fotografije.slice(0, 8) : [],
      termin: t.termin ?? null,
      cijena: await cijenaKategorije(t.kategorija),
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

    posalji(res, 201, { ok: true, id: posao.id });
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
    const redovi = await citaj(
      "poslovi",
      `select=*,kontakti(ime,prezime,email,telefon),majstori!poslovi_kupac_id_fkey(ime),` +
      `kupovine(stanje,vrijeme)&order=napravljen.desc&limit=200`,
    );

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

  "GET /api/admin-prihvaceni": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const trazi = (new URL(req.url, "http://x").searchParams.get("trazi") ?? "")
      .trim().toLowerCase();

    const redovi = await citaj(
      "kupovine",
      `select=vrijeme,cijena,stanje,majstori(id,ime,telefon),` +
      `poslovi(id,kategorija,opis,adresa,stan,lokacija,kontakti(ime,prezime,telefon,email))` +
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

  "POST /api/admin-cjenovnik": async (req, res) => {
    if (!(await trazenAdmin(req, res))) return;
    const t = await tijelo(req);
    for (const [kat, cijena] of Object.entries(t.cijene ?? {})) {
      await izmijeni("cjenovnik", `kategorija=eq.${encodeURIComponent(kat)}`,
                     { cijena: Number(cijena) });
    }
    posalji(res, 200, { ok: true });
  },

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

    posalji(res, 200, { kupovine, uplate, stanje: await stanjeMajstora(id) });
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
