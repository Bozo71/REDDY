/* Sloj prema Supabase bazi.

   Ide preko njihovog REST API-ja, pa nema nijedne vanjske biblioteke —
   isto kao i do sad. Koristi se service_role ključ, koji zaobilazi RLS;
   zato on smije postojati samo na serveru i nikad u pregledaču. */

import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";

const URL_BAZE = process.env.SUPABASE_URL ?? "";
const KLJUC = process.env.SUPABASE_SERVICE_KEY ?? "";

/* Ako ključevi fale, ne rušimo proces — na serveru bi to dalo praznu
   grešku bez objašnjenja. Umjesto toga svaki poziv jasno kaže šta fali. */
export const KLJUCEVI_FALE = !URL_BAZE || !KLJUC;

if (KLJUCEVI_FALE) {
  console.error(
    "Nedostaje SUPABASE_URL ili SUPABASE_SERVICE_KEY. " +
    "Lokalno: .env.local. Na Vercelu: Settings → Environment Variables.",
  );
}

const OSNOVA = `${URL_BAZE.replace(/\/+$/, "")}/rest/v1`;

const ZAGLAVLJA = {
  apikey: KLJUC,
  Authorization: `Bearer ${KLJUC}`,
  "Content-Type": "application/json",
};

async function zovi(putanja, opcije = {}) {
  const odgovor = await fetch(OSNOVA + putanja, {
    ...opcije,
    headers: { ...ZAGLAVLJA, ...opcije.headers },
  });

  if (!odgovor.ok) {
    const tekst = await odgovor.text();
    throw new Error(`Baza (${odgovor.status}): ${tekst.slice(0, 300)}`);
  }
  if (odgovor.status === 204) return null;

  const tijelo = await odgovor.text();
  return tijelo ? JSON.parse(tijelo) : null;
}

/** Čitanje. Vraća niz redova. */
export const citaj = (tabela, upit = "") => zovi(`/${tabela}?${upit}`);

/** Čitanje jednog reda ili null. */
export async function citajJedan(tabela, upit = "") {
  const redovi = await zovi(`/${tabela}?${upit}&limit=1`);
  return redovi?.[0] ?? null;
}

/** Upis. Vraća upisan red. */
export async function upisi(tabela, podaci) {
  const redovi = await zovi(`/${tabela}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(podaci),
  });
  return Array.isArray(redovi) ? redovi[0] : redovi;
}

/** Izmjena po filteru. */
export const izmijeni = (tabela, upit, podaci) =>
  zovi(`/${tabela}?${upit}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(podaci),
  });

/** Brisanje po filteru. */
export const obrisi = (tabela, upit) =>
  zovi(`/${tabela}?${upit}`, { method: "DELETE" });

/** Poziv funkcije u bazi (kupi_posao). */
export const pozovi = (ime, parametri = {}) =>
  zovi(`/rpc/${ime}`, { method: "POST", body: JSON.stringify(parametri) });

/* ── Cjenovnik ─────────────────────────────────────────────────────────── */

export const KATEGORIJE = [
  { id: "kucne_popravke", naziv: "Kućne popravke", cijena: 6 },
  { id: "klime", naziv: "Klime i grijanje", cijena: 6 },
  { id: "vodoinstalater", naziv: "Vodoinstalater", cijena: 9 },
  { id: "elektricar", naziv: "Električar", cijena: 9 },
  { id: "sigurnost", naziv: "Alarmi, kamere, interfoni", cijena: 9 },
  { id: "bravar", naziv: "Bravar", cijena: 6 },
  { id: "moler", naziv: "Moler", cijena: 12 },
  { id: "fasader", naziv: "Fasader", cijena: 12 },
  { id: "keramicar", naziv: "Keramičar", cijena: 12 },
];

export async function cijenaKategorije(kategorija) {
  const red = await citajJedan("cjenovnik", `kategorija=eq.${encodeURIComponent(kategorija)}`);
  return red ? Number(red.cijena) : 9;
}

/* ── Lozinke ───────────────────────────────────────────────────────────── */

export function hash(tajna) {
  const so = randomBytes(16);
  return `${so.toString("hex")}:${scryptSync(String(tajna), so, 32).toString("hex")}`;
}

export function provjeriHash(tajna, zapis) {
  try {
    const [soHex, izvedenHex] = String(zapis).split(":");
    const izveden = scryptSync(String(tajna), Buffer.from(soHex, "hex"), 32);
    return timingSafeEqual(izveden, Buffer.from(izvedenHex, "hex"));
  } catch {
    return false;
  }
}

/* ── Telefon ───────────────────────────────────────────────────────────── */

export function normalizujTelefon(ulaz) {
  let c = String(ulaz ?? "").replace(/\D/g, "");
  if (c.startsWith("00")) c = c.slice(2);
  if (c.startsWith("382")) return c;
  if (c.startsWith("0")) return "382" + c.slice(1);
  return c.length >= 8 ? "382" + c : c;
}

/* ── Sesije ────────────────────────────────────────────────────────────── */

export async function napraviSesiju(vrsta, koId, danaVazi = 30) {
  const token = randomUUID() + randomUUID().replace(/-/g, "");
  await upisi("sesije", {
    token,
    vrsta,
    ko_id: koId,
    istice: new Date(Date.now() + danaVazi * 864e5).toISOString(),
  });
  return token;
}

export async function nadjiSesiju(token) {
  if (!token) return null;
  const s = await citajJedan("sesije", `token=eq.${encodeURIComponent(token)}`);
  if (!s) return null;

  if (new Date(s.istice) < new Date()) {
    await obrisi("sesije", `token=eq.${encodeURIComponent(token)}`);
    return null;
  }
  return s;
}

export const obrisiSesiju = (token) =>
  token ? obrisi("sesije", `token=eq.${encodeURIComponent(token)}`) : null;

/* ── Novac ─────────────────────────────────────────────────────────────── */

export async function stanjeMajstora(majstorId) {
  const red = await citajJedan("stanje_majstora", `id=eq.${majstorId}`);
  if (!red) return { kupljeno: 0, ukupno_kupovina: 0, ukupno_placeno: 0, dug: 0 };

  return {
    kupljeno: Number(red.kupljeno),
    ukupno_kupovina: Number(red.ukupno_kupovina),
    ukupno_placeno: Number(red.ukupno_placeno),
    dug: Number(red.dug),
  };
}

export const sada = () => new Date().toISOString();
