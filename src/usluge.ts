/* ═══════════════════════════════════════════════════════════════════════════
   Stranice po uslugama
   ────────────────────
   Ljudi u pretrazi ne kucaju „Reddy", nego „vodoinstalater Podgorica".
   Svaka usluga zato ima svoju adresu, svoj naslov u pretrazi i svoj H1.

   Izgled je isti kao na početnoj — koristi se ista komponenta, mijenja se
   samo naslov i unaprijed izabrana usluga u formi.

   Ovdje stoje samo podaci, bez ijednog React uvoza, jer i vite.config.ts
   čita ovu listu da bi znao koje stranice da prerenderuje.

   Tekst poštuje ista pravila kao ostatak sajta: bez cijena, bez vremena
   dolaska, bez broja majstora, bez „24/7" i bez ičega o plaćanju.
   ═══════════════════════════════════════════════════════════════════════════ */

const SAJT = "https://thereddy.me";
const TELEFON_PRIKAZ = "069 600 628";

export type Usluga = {
  /** Adresa stranice — ujedno i ključna riječ koju ljudi kucaju. */
  putanja: string;
  /** Mora se poklapati sa stavkom iz PROBLEMI, da forma bude unaprijed izabrana. */
  problem: string;
  naslovGore: string;
  naslovDolje: string;
  podnaslov: string;
  title: string;
  opis: string;
  /** Naziv usluge u JSON-LD zapisu za Google. */
  imeUsluge: string;
};

export const USLUGE_STRANICE: Usluga[] = [
  {
    putanja: "/vodoinstalater-podgorica",
    problem: "Vodoinstalater",
    naslovGore: "Vodoinstalater u Podgorici.",
    naslovDolje: "Javite kvar, dalje vodimo mi.",
    podnaslov:
      "Curi, ne otiče, nema pritiska. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Vodoinstalater Podgorica – curenje, odgušenje, popravke | Reddy",
    opis: `Treba vam vodoinstalater u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Vodoinstalaterski radovi",
  },
  {
    putanja: "/elektricar-podgorica",
    problem: "Električar",
    naslovGore: "Električar u Podgorici.",
    naslovDolje: "Javite kvar, dalje vodimo mi.",
    podnaslov:
      "Nema struje, iskaču osigurači, ne radi utičnica. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Električar Podgorica – kvarovi, osigurači, utičnice | Reddy",
    opis: `Treba vam električar u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Električarski radovi",
  },
  {
    putanja: "/moler-podgorica",
    problem: "Moleraj",
    naslovGore: "Moler u Podgorici.",
    naslovDolje: "Javite šta treba, dalje vodimo mi.",
    podnaslov:
      "Zidovi poslije selidbe, vlaga, krečenje. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Moler Podgorica – krečenje, gletovanje, farbanje | Reddy",
    opis: `Treba vam moler u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Molerski radovi",
  },
  {
    putanja: "/fasade-podgorica",
    problem: "Fasada",
    naslovGore: "Fasade u Podgorici.",
    naslovDolje: "Javite šta treba, dalje vodimo mi.",
    podnaslov:
      "Otpada, puca, prokišnjava. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Fasade Podgorica – sanacija, izolacija, farbanje | Reddy",
    opis: `Radovi na fasadi u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Fasaderski radovi",
  },
  {
    putanja: "/keramicar-podgorica",
    problem: "Keramičar",
    naslovGore: "Keramičar u Podgorici.",
    naslovDolje: "Javite šta treba, dalje vodimo mi.",
    podnaslov:
      "Pločice u kupatilu, kuhinji, na terasi. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Keramičar Podgorica – pločice, kupatilo, terasa | Reddy",
    opis: `Treba vam keramičar u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Keramičarski radovi",
  },
  {
    putanja: "/klima-servis-podgorica",
    problem: "Klima i grijanje",
    naslovGore: "Klima i grijanje u Podgorici.",
    naslovDolje: "Javite kvar, dalje vodimo mi.",
    podnaslov:
      "Ne hladi, ne grije, treba montaža ili čišćenje. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Servis klima Podgorica – montaža, čišćenje, punjenje | Reddy",
    opis: `Servis ili montaža klime u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Klima uređaji i grijanje",
  },
  {
    putanja: "/bravar-podgorica",
    problem: "Bravar",
    naslovGore: "Bravar u Podgorici.",
    naslovDolje: "Javite kvar, dalje vodimo mi.",
    podnaslov:
      "Brava, ključ, vrata koja ne zaključavaju. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Bravar Podgorica – brave, ključevi, otvaranje vrata | Reddy",
    opis: `Treba vam bravar u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Bravarske usluge",
  },
  {
    putanja: "/video-nadzor-podgorica",
    problem: "Kamere i alarmi",
    naslovGore: "Video nadzor i alarmi u Podgorici.",
    naslovDolje: "Javite šta treba, dalje vodimo mi.",
    podnaslov:
      "Kamere, alarm, montaža i podešavanje. Šaljemo svog čovjeka, a za urađeno odgovaramo mi. Ne on.",
    title: "Video nadzor Podgorica – kamere i alarmni sistemi | Reddy",
    opis: `Kamere ili alarm u Podgorici? Reddy šalje provjerenog majstora i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`,
    imeUsluge: "Video nadzor i alarmni sistemi",
  },
];

export const nadjiUslugu = (putanja: string): Usluga => {
  const u = USLUGE_STRANICE.find((x) => x.putanja === putanja);
  if (!u) throw new Error(`Nema definicije usluge za ${putanja}`);
  return u;
};

/** Meta podaci i JSON-LD za jednu uslugu. Nadjačava ono iz root rute. */
export function glavaUsluge(u: Usluga) {
  const adresa = `${SAJT}${u.putanja}`;

  return {
    meta: [
      { title: u.title },
      { name: "description", content: u.opis },
      { property: "og:title", content: u.title },
      { property: "og:description", content: u.opis },
      { property: "og:url", content: adresa },
      { name: "twitter:title", content: u.title },
      { name: "twitter:description", content: u.opis },
    ],
    links: [{ rel: "canonical", href: adresa }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: u.imeUsluge,
          serviceType: u.imeUsluge,
          url: adresa,
          areaServed: { "@type": "City", name: "Podgorica" },
          provider: {
            "@type": "HomeAndConstructionBusiness",
            name: "Reddy",
            url: SAJT,
            telephone: "+38269600628",
          },
        }),
      },
    ],
  };
}
