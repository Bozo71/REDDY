/* Slanje obavještenja na telefon.

   Radi tiho: ako ključevi fale ili slanje padne, zahtjev svejedno prolazi.
   Obavještenje je dodatak, ne uslov — ne smije oboriti kupovinu posla. */

import webpush from "web-push";
import { citaj, upisi, obrisi } from "./baza-supabase.mjs";

const JAVNI = process.env.VAPID_JAVNI ?? "";
const TAJNI = process.env.VAPID_TAJNI ?? "";
const KONTAKT = process.env.VAPID_KONTAKT ?? "mailto:info@thereddy.me";

export const PUSH_RADI = Boolean(JAVNI && TAJNI);

if (PUSH_RADI) {
  webpush.setVapidDetails(KONTAKT, JAVNI, TAJNI);
} else {
  console.warn("Nema VAPID ključeva — obavještenja se neće slati.");
}

export const javniKljuc = () => JAVNI;

/** Pamti pretplatu uređaja. Isti uređaj dvaput se ne duplira. */
export async function zapamtiPretplatu(vrsta, koId, pretplata) {
  if (!pretplata?.endpoint) throw new Error("Neispravna pretplata.");

  // Isti uređaj je mogao biti prijavljen kao neko drugi — brišemo staro.
  await obrisi("push_pretplate", `endpoint=eq.${encodeURIComponent(pretplata.endpoint)}`);

  await upisi("push_pretplate", {
    vrsta,
    ko_id: koId,
    endpoint: pretplata.endpoint,
    podaci: pretplata,
  });
}

export const zaboraviPretplatu = (endpoint) =>
  obrisi("push_pretplate", `endpoint=eq.${encodeURIComponent(endpoint)}`);

/** Šalje jednom primaocu. Mrtve pretplate briše. */
async function posaljiJednom(red, tijelo) {
  try {
    await webpush.sendNotification(red.podaci, JSON.stringify(tijelo));
    return true;
  } catch (e) {
    // 404/410 znači da je uređaj odjavljen ili aplikacija obrisana.
    if (e.statusCode === 404 || e.statusCode === 410) {
      await zaboraviPretplatu(red.endpoint).catch(() => {});
    } else {
      console.warn("[push]", e.statusCode, String(e.body ?? e.message).slice(0, 120));
    }
    return false;
  }
}

/**
 * Javlja majstorima te struke i svim adminima da je stigao posao.
 * Ne baca grešku — poziv koji je zove ne smije pasti zbog obavještenja.
 */
export async function javiZaNovPosao(posao) {
  if (!PUSH_RADI) return { poslato: 0 };

  try {
    const [majstori, admini] = await Promise.all([
      citaj("majstori", `select=id,kategorije,pauziran`),
      citaj("admini", "select=id"),
    ]);

    const zaStruku = majstori
      .filter((m) => !m.pauziran && (Array.isArray(m.kategorije) ? m.kategorije : [])
        .includes(posao.kategorija))
      .map((m) => m.id);

    if (!zaStruku.length && !admini.length) return { poslato: 0 };

    const sve = await citaj("push_pretplate", "select=endpoint,podaci,vrsta,ko_id");

    const majstorske = sve.filter((p) => p.vrsta === "majstor" && zaStruku.includes(p.ko_id));
    const adminske = sve.filter((p) => p.vrsta === "admin");

    const cijena = Number(posao.cijena).toFixed(2).replace(/\.00$/, "");
    const kratko = String(posao.opis ?? "").slice(0, 90);

    const ishodi = await Promise.allSettled([
      ...majstorske.map((p) => posaljiJednom(p, {
        naslov: `Nov posao — ${NAZIV[posao.kategorija] ?? posao.kategorija}`,
        tekst: `${cijena} € · ${kratko}`,
        putanja: "/majstori",
      })),
      ...adminske.map((p) => posaljiJednom(p, {
        naslov: `Nov zahtjev — ${NAZIV[posao.kategorija] ?? posao.kategorija}`,
        tekst: kratko,
        putanja: "/majstori/admin",
      })),
    ]);

    return { poslato: ishodi.filter((i) => i.status === "fulfilled" && i.value).length };
  } catch (e) {
    console.warn("[push] javiZaNovPosao:", e.message);
    return { poslato: 0, greska: e.message };
  }
}

/** Probno obavještenje — da se provjeri da stvarno stiže na telefon. */
export async function posaljiProbu(vrsta, koId) {
  if (!PUSH_RADI) return { poslato: 0 };

  const sve = await citaj(
    "push_pretplate",
    `vrsta=eq.${vrsta}&ko_id=eq.${koId}&select=endpoint,podaci`,
  );
  if (!sve.length) return { poslato: 0 };

  const ishodi = await Promise.allSettled(sve.map((p) => posaljiJednom(p, {
    naslov: "REDDY",
    tekst: "Obavještenja rade. Ovako ćete dobiti svaki nov posao.",
    putanja: vrsta === "admin" ? "/majstori/admin" : "/majstori",
  })));

  return { poslato: ishodi.filter((i) => i.status === "fulfilled" && i.value).length };
}

const NAZIV = {
  kucne_popravke: "kućne popravke", klime: "klime", vodoinstalater: "vodoinstalater",
  elektricar: "električar", sigurnost: "alarmi i kamere", bravar: "bravar",
  moler: "moler", fasader: "fasader", keramicar: "keramičar",
};
