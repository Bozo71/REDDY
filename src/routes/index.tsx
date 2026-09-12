import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Droplets,
  Home,
  Instagram,
  KeyRound,
  Mail,
  MapPin,
  PaintBucket,
  Phone,
  ShieldCheck,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: PrototypePage,
});

/* ═══════════════════════════════════════════════════════════════════════════
   REDDY — Podgorica
   ─────────────────
   Tekst je finalna verzija i prepisan je doslovno. Ne mijenjati formulacije.

   Zabranjeno bilo gdje na sajtu:
   • „platforma”, „povezujemo”, „posredujemo”, „spajamo vas sa”, „baza majstora”
   • bilo šta o tome kome se i kako plaća
   • vrijeme dolaska, u bilo kom obliku
   • cijene, cjenovnik, broj majstora, godine iskustva
   • „24/7”, „dostupno non-stop”
   • materijal, popust na materijal, račun iz radnje

   Jedina rečenica o plaćanju na cijelom sajtu: „Plaćate kad je posao završen.”
   ═══════════════════════════════════════════════════════════════════════════ */

const TELEFON = "069 600 628";
// Puni međunarodni oblik — radi i kad neko zove iz inostranstva.
const TELEFON_LINK = "tel:+38269600628";
const EMAIL = "info@thereddy.me";

/* ── Problemi: četiri stavke plus „Nešto drugo” ─────────────────────────── */

const PROBLEMI = [
  "Vodoinstalater",
  "Električar",
  "Moleraj",
  "Fasada",
  "Keramičar",
  "Klima i grijanje",
  "Bravar",
  "Kamere i alarmi",
  "Nešto drugo",
] as const;

const USLUGE: { naziv: string; opis: string; ikona: typeof Wrench }[] = [
  { naziv: "Vodoinstalater", opis: "Curi, ne otiče, nema pritiska", ikona: Droplets },
  { naziv: "Električar", opis: "Nema struje, iskaču osigurači, ne radi utičnica", ikona: Zap },
  { naziv: "Moleraj", opis: "Zidovi poslije selidbe, vlaga, krečenje", ikona: PaintBucket },
  { naziv: "Fasada", opis: "Otpada, puca, prokišnjava", ikona: Home },
];

/* ── Adrese za predloge dok korisnik kuca (Podgorica) ────────────────────── */

const ADRESE = [
  // Naselja
  "Zagorič", "Park šuma Zagorič", "Zlatica", "Stara Zlatica", "Masline",
  "Vranići", "Rogami", "Preko Morače", "Stari Aerodrom", "Novi Aerodrom",
  "Zabjelo", "Konik", "City Kvart", "Momišići", "Tološi", "Drač", "Ljubović",
  "Nova Varoš", "Stara Varoš", "Gornja Gorica", "Donja Gorica", "Gorica C",
  "Dajbabe", "Dahna", "Murtovina", "Pobrežje", "Kruševac", "Vrela Ribnička",
  "Kakaricka Gora", "Vranjske Njive", "Ćemovsko Polje", "Lješkopolje",
  "Mareza", "Doljani", "Botun", "Beri", "Farmaci", "Sadine", "Piperi", "Kuči",
  "Golubovci", "Zeta", "Berislavci", "Mahala", "Balabani", "Vukovci",
  "Blok V", "Blok VI", "Blok IX",
  // Bulevari i ulice
  "Bulevar Svetog Petra Cetinjskog", "Bulevar Revolucije",
  "Bulevar Džordža Vašingtona", "Bulevar Ivana Crnojevića",
  "Bulevar Save Kovačevića", "Bulevar Mihaila Lalića",
  "Bulevar Josipa Broza Tita", "Bulevar Pera Ćetkovića",
  "Bulevar Veljka Vlahovića", "Njegoševa", "Kralja Nikole", "Slobode",
  "Hercegovačka", "Moskovska", "Vasa Raičkovića", "Cetinjski put",
  "Serdara Jola Piletića", "Bratstva i jedinstva", "Marka Miljanova",
  "Novaka Miloševa", "Stanka Dragojevića", "Vučedolska", "Balšića",
  "Trg Republike", "Mitra Bakića", "Đoka Miraševića", "Radosava Burića",
  "Milana Vukotića", "Nikole Đurkovića", "Miljana Vukova",
  "Svetlane Kane Radević", "Vaka Đurovića", "Piperska", "Zetska",
  "Dalmatinska", "Beogradska", "Bokeška", "Sarajevska", "Studentska",
  "Oktobarske revolucije", "Iva Andrića", "Meše Selimovića", "Karađorđeva",
  "Miloša Obilića", "Blaža Jovanovića", "Save Burića", "Vojislavljevića",
  "Ivana Vujoševića", "Golootočkih žrtava", "4. jula", "13. jula", "19. decembra",
];

// Poređenje bez kvačica — „njegoseva” pronalazi „Njegoševa”.
const bezKvacica = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

/* ── Slanje prijave na mail ────────────────────────────────────────────────

   👉 DA TI PRIJAVE POČNU STIZATI NA MAIL — treba ti samo ključ, traje 2 minuta:

   1. Otvori web3forms.com
   2. Upiši svoj mail (info@thereddy.me) i klikni „Create Access Key”
   3. Ključ ti stigne na taj mail — nalijepi ga dolje u WEB3FORMS_KLJUC

   To je sve. Nema servera, nema registracije, besplatno je.
   Od tog trenutka svaka prijava stiže na tvoj mail već složena tako da je
   možeš odmah kopirati i proslijediti majstoru na WhatsApp ili Viber.

   Dok je ključ prazan, prijava se ispisuje u konzoli (F12) i čuva u
   localStorage — ništa se ne gubi.                                          */

// Prijave stižu na adresu koju upišeš pri pravljenju ključa (info@thereddy.me).
const WEB3FORMS_KLJUC = "7d98c57c-5c56-46c3-9e59-21c71d9da1dd";

interface Prijava {
  problem: string;
  opis: string;
  fotografije: string[];
  ime: string;
  prezime: string;
  email: string;
  telefon: string;
  adresa: string;
  stan: string;
  poslato: string;
}

/* Slike se otpremaju u Supabase Storage, a u mail ide link.
   (Web3Forms naplaćuje priloge, a Supabase već imamo i besplatan je.)

   👉 JEDNOKRATNO PODEŠAVANJE — Supabase → Storage → New bucket:
      ime: prijave   ·   Public bucket: UKLJUČENO

   Zatim u SQL Editoru pokreni:

      create policy "svako moze da salje sliku"
        on storage.objects for insert to anon
        with check (bucket_id = 'prijave');

   Dok bucket ne postoji, prijava svejedno stiže — samo bez linka na sliku. */
const BUCKET_SLIKE = "prijave";

async function otpremiSlike(fajlovi: File[]): Promise<string[]> {
  const linkovi: string[] = [];
  for (const [i, fajl] of fajlovi.entries()) {
    try {
      const cistoIme = fajl.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9.]/g, "-");
      const putanja = `${Date.now()}-${i + 1}-${cistoIme}`;
      const { error } = await supabase.storage
        .from(BUCKET_SLIKE)
        .upload(putanja, fajl, { contentType: fajl.type, upsert: false });
      if (error) {
        console.warn("[REDDY] Slika nije otpremljena:", error.message);
        continue;
      }
      const { data } = supabase.storage.from(BUCKET_SLIKE).getPublicUrl(putanja);
      if (data?.publicUrl) linkovi.push(data.publicUrl);
    } catch (e) {
      console.warn("[REDDY] Greška pri otpremanju slike:", e);
    }
  }
  return linkovi;
}

// Prijava složena tako da se može odmah kopirati i proslijediti majstoru
// na WhatsApp ili Viber — bez ijedne izmjene.
function formatirajPrijavu(p: Prijava, linkovi: string[] = []): string {
  const d = new Date(p.poslato);
  const dva = (n: number) => String(n).padStart(2, "0");
  const datum = `${dva(d.getDate())}.${dva(d.getMonth() + 1)}.${d.getFullYear()}. u ${dva(d.getHours())}:${dva(d.getMinutes())}`;

  const redovi = [
    `🔧 NOVA PRIJAVA — ${p.problem.toUpperCase()}`,
    "",
    "── PROBLEM ──",
    p.opis,
    "",
    "── ADRESA ──",
    `📍 ${p.adresa}`,
  ];

  if (p.stan) redovi.push(`   ${p.stan}`);

  redovi.push(
    "",
    "── KLIJENT ──",
    `👤 ${p.ime} ${p.prezime}`,
    `📞 ${p.telefon}`,
    `✉️ ${p.email}`,
  );

  if (linkovi.length) {
    redovi.push(
      "",
      linkovi.length === 1 ? "── FOTOGRAFIJA ──" : "── FOTOGRAFIJE ──",
      linkovi.join("\n"),
    );
  } else if (p.fotografije.length) {
    redovi.push("", "── FOTOGRAFIJE ──", p.fotografije.map((f) => `📷 ${f}`).join("\n"));
  }

  redovi.push("", `Prijavljeno: ${datum}`);
  return redovi.join("\n");
}

// Slike sa telefona znaju biti i po 5 MB, a mail ih ne prima toliko.
// Smanjujemo ih prije slanja — majstor i dalje savršeno vidi u čemu je problem.
async function smanjiSliku(fajl: File, maxStranica = 1600, kvalitet = 0.8): Promise<File> {
  if (!fajl.type.startsWith("image/")) return fajl;
  try {
    const url = URL.createObjectURL(fajl);
    const slika = await new Promise<HTMLImageElement>((rijesi, odbij) => {
      const img = new window.Image();
      img.onload = () => rijesi(img);
      img.onerror = odbij;
      img.src = url;
    });

    const skala = Math.min(1, maxStranica / Math.max(slika.width, slika.height));
    // Već je mala — nema šta da se dira.
    if (skala === 1 && fajl.size < 900_000) {
      URL.revokeObjectURL(url);
      return fajl;
    }

    const platno = document.createElement("canvas");
    platno.width = Math.round(slika.width * skala);
    platno.height = Math.round(slika.height * skala);
    platno.getContext("2d")?.drawImage(slika, 0, 0, platno.width, platno.height);
    URL.revokeObjectURL(url);

    const blob = await new Promise<Blob | null>((r) => platno.toBlob(r, "image/jpeg", kvalitet));
    if (!blob) return fajl;
    return new File([blob], fajl.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return fajl;
  }
}

async function posaljiPrijavu(p: Prijava, fajlovi: File[] = []): Promise<void> {
  // Prvo smanji pa otpremi slike — u mail ide link, ne sam fajl.
  let linkovi: string[] = [];
  if (fajlovi.length) {
    const smanjene = await Promise.all(fajlovi.map((f) => smanjiSliku(f)));
    linkovi = await otpremiSlike(smanjene);
  }

  const poruka = formatirajPrijavu(p, linkovi);

  // Uvijek sačuvaj lokalno — ništa se ne gubi ni ako slanje padne.
  try {
    const stare = JSON.parse(localStorage.getItem("reddy-prijave") ?? "[]") as Prijava[];
    localStorage.setItem(
      "reddy-prijave",
      JSON.stringify([{ ...p, linkovi }, ...stare].slice(0, 50)),
    );
  } catch { /* localStorage nedostupan */ }

  console.log(`[REDDY] Nova prijava:\n\n${poruka}`);

  if (!WEB3FORMS_KLJUC) {
    console.warn("[REDDY] WEB3FORMS_KLJUC je prazan — prijava nije poslata na mail.");
    return;
  }

  try {
    const odgovor = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KLJUC,
        subject: `REDDY — ${p.problem} — ${p.adresa}`,
        from_name: "REDDY sajt",
        // Klijentov mail ide kao „reply-to”, pa možeš odgovoriti jednim klikom.
        replyto: p.email,
        message: poruka,
      }),
    });
    const rezultat = await odgovor.json();
    if (!rezultat.success) console.warn("[REDDY] Web3Forms:", rezultat);
  } catch (e) {
    console.warn("[REDDY] Slanje nije uspjelo:", e);
  }
}

/* ── Zajedničke sitnice ──────────────────────────────────────────────────── */

function ReddyLogo({
  velicina = 34,
  saIkonom = true,
}: {
  velicina?: number;
  saIkonom?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 select-none">
      {saIkonom && (
        <div
          className="sunshine-gradient rounded-xl flex items-center justify-center shadow-glow"
          style={{ width: velicina, height: velicina }}
        >
          <span className="font-black text-[var(--plum-deep)]" style={{ fontSize: velicina * 0.55 }}>
            R
          </span>
        </div>
      )}
      <span className="font-black tracking-tight text-[20px]">REDDY</span>
    </div>
  );
}

function DugmeJaviteKvar({
  onClick,
  klasa = "",
}: {
  onClick: () => void;
  klasa?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`sunshine-gradient rounded-2xl font-black text-black shadow-glow hover:brightness-105 active:scale-[0.98] transition ${klasa}`}
    >
      Javite kvar
    </button>
  );
}

/* ── 1. HEADER ───────────────────────────────────────────────────────────── */

function Zaglavlje({ otvoriFormu }: { otvoriFormu: () => void }) {
  return (
    <header className="plum-gradient text-white sticky top-0 z-40 shadow-soft">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <ReddyLogo saIkonom={false} />

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[12px] font-extrabold text-white/85">
            <ShieldCheck className="w-4 h-4 text-[var(--sunshine)]" /> Garancija 30 dana
          </span>

          <a
            href={TELEFON_LINK}
            className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-black text-white hover:text-[var(--sunshine)] transition"
          >
            <Phone className="w-4 h-4 text-[var(--sunshine)]" /> {TELEFON}
          </a>

          <DugmeJaviteKvar onClick={otvoriFormu} klasa="h-10 px-4 text-[13px]" />
        </div>
      </div>

      {/* Badge ide u drugi red na malim ekranima */}
      <div className="sm:hidden pb-3 px-4 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[12px] font-extrabold text-white/85">
          <ShieldCheck className="w-4 h-4 text-[var(--sunshine)]" /> Garancija 30 dana
        </span>
      </div>
    </header>
  );
}

/* ── Traka sa brojem, zakačena pri dnu na mobilnom ───────────────────────── */

function MobilniPoziv() {
  return (
    <a
      href={TELEFON_LINK}
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 plum-gradient border-t border-white/10 px-4 py-3 flex items-center justify-center gap-2 text-white"
    >
      <Phone className="w-4.5 h-4.5 text-[var(--sunshine)]" />
      <span className="text-[15px] font-black">{TELEFON}</span>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NASLOVNA
   ═══════════════════════════════════════════════════════════════════════════ */

function Naslovna() {
  const [adresa, setAdresa] = useState("");
  const [predlozi, setPredlozi] = useState<string[]>([]);
  const [predloziOtvoreni, setPredloziOtvoreni] = useState(false);
  const [problem, setProblem] = useState<string>(PROBLEMI[0]);
  const [padajuciOtvoren, setPadajuciOtvoren] = useState(false);
  const [formaOtvorena, setFormaOtvorena] = useState(false);
  const [istakni, setIstakni] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const adresaRef = useRef<HTMLInputElement>(null);

  const naUnosAdrese = (v: string) => {
    setAdresa(v);
    const upit = bezKvacica(v.trim());
    if (upit.length < 2) {
      setPredlozi([]);
      setPredloziOtvoreni(false);
      return;
    }
    const nadjeno = ADRESE.filter((a) => bezKvacica(a).includes(upit)).slice(0, 6);
    setPredlozi(nadjeno);
    setPredloziOtvoreni(nadjeno.length > 0);
  };

  const izaberiPredlog = (a: string) => {
    setAdresa(`${a} `);
    setPredloziOtvoreni(false);
    adresaRef.current?.focus();
  };

  const otvoriFormu = () => {
    setPredloziOtvoreni(false);
    setFormaOtvorena(true);
  };

  // Kartica usluge selektuje problem i vraća korisnika gore na polje za adresu.
  const izaberiUsluguIVratiGore = (naziv: string) => {
    setProblem(naziv);
    setPadajuciOtvoren(false);
    const cilj = heroRef.current ? Math.max(0, heroRef.current.offsetTop - 80) : 0;
    window.scrollTo({ top: cilj, behavior: "smooth" });
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - cilj) > 4) window.scrollTo(0, cilj);
    }, 120);
    setIstakni(true);
    window.setTimeout(() => {
      adresaRef.current?.focus({ preventScroll: true });
      setIstakni(false);
    }, 700);
  };

  return (
    <div className="app-gradient min-h-screen pb-24 sm:pb-16">

      {/* ── 2. HERO ── */}
      <section ref={heroRef} className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 text-center scroll-mt-24">
        <h1 className="text-[28px] sm:text-[44px] leading-[1.08] font-black tracking-tight">
          Javite šta ne radi.
          <br />
          <span className="text-[var(--sunshine-deep)]">Dalje vodimo mi.</span>
        </h1>
        <p className="mt-3 text-[14px] sm:text-[16px] font-semibold text-[var(--plum-deep)]/65 max-w-xl mx-auto leading-relaxed">
          Voda, struja, moleraj, fasada. Cijela Podgorica. Šaljemo svog čovjeka,
          a za urađeno odgovaramo mi. Ne on.
        </p>

        <div className="mt-7 max-w-3xl mx-auto rounded-3xl bg-white border border-[var(--beige-border)] shadow-soft p-2.5 flex flex-col sm:flex-row gap-2">
          {/* Adresa */}
          <div className="relative flex-1">
            <div
              className={`flex items-center gap-2 rounded-2xl bg-[var(--cream)] border px-4 h-12 focus-within:border-[var(--sunshine-deep)] transition ${
                istakni ? "border-[var(--sunshine-deep)] shadow-glow" : "border-[var(--beige-border)]"
              }`}
            >
              <MapPin className="w-4.5 h-4.5 text-[var(--plum-deep)]/45 shrink-0" />
              <input
                ref={adresaRef}
                value={adresa}
                onChange={(e) => naUnosAdrese(e.target.value)}
                onFocus={() => { if (predlozi.length > 0) setPredloziOtvoreni(true); }}
                onBlur={() => window.setTimeout(() => setPredloziOtvoreni(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setPredloziOtvoreni(false); otvoriFormu(); }
                  if (e.key === "Escape") setPredloziOtvoreni(false);
                }}
                placeholder="Ulica i broj"
                autoComplete="off"
                className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35"
              />
            </div>

            {predloziOtvoreni && (
              <div className="absolute z-40 top-14 left-0 right-0 rounded-2xl bg-white border border-[var(--beige-border)] shadow-soft overflow-hidden drop-down text-left">
                {predlozi.map((a) => (
                  <button
                    key={a}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => izaberiPredlog(a)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--cream)] transition"
                  >
                    <MapPin className="w-4 h-4 text-[var(--sunshine-deep)] shrink-0" />
                    <span className="text-[13px] font-bold truncate">{a}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Šta ne radi? */}
          <div className="relative sm:w-56">
            <button
              onClick={() => setPadajuciOtvoren((v) => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-4 h-12 text-[13px] font-extrabold"
            >
              <span className="flex items-center gap-2 truncate">
                <Wrench className="w-4 h-4 text-[var(--plum-deep)]/45 shrink-0" /> {problem}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition ${padajuciOtvoren ? "rotate-180" : ""}`} />
            </button>
            {padajuciOtvoren && (
              <div className="absolute z-30 top-14 left-0 right-0 rounded-2xl bg-white border border-[var(--beige-border)] shadow-soft overflow-hidden drop-down">
                {PROBLEMI.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setProblem(p); setPadajuciOtvoren(false); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-bold hover:bg-[var(--cream)] transition ${
                      p === problem ? "bg-[var(--sunshine)]/15 text-[var(--sunshine-deep)]" : ""
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DugmeJaviteKvar onClick={otvoriFormu} klasa="h-12 px-7 text-[14px] shrink-0" />
        </div>

        <p className="mt-3 text-[12.5px] font-bold text-[var(--plum-deep)]/55">
          Hitno je?{" "}
          <a href={TELEFON_LINK} className="font-black text-[var(--sunshine-deep)] hover:underline">
            Zovite {TELEFON}
          </a>
        </p>
      </section>

      {/* ── 3. BLOK PUNE ŠIRINE ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-10">
        <div className="plum-gradient rounded-3xl p-6 sm:p-10 shadow-soft text-white">
          <div className="max-w-2xl">
            <h2 className="text-[22px] sm:text-[30px] font-black leading-tight">
              Kad vas nema kod kuće, tu je naš čovjek.
            </h2>
            <p className="mt-3 text-[14px] sm:text-[15px] font-semibold text-white/75 leading-relaxed">
              Ne morate uzimati slobodan dan. Ako niste u stanu, sa majstorom dolazi
              nadzornik iz Reddyja.
            </p>
            <p className="mt-2.5 text-[14px] sm:text-[15px] font-semibold text-white/75 leading-relaxed">
              On otvara, ostaje dok se radi, gleda kako je urađeno i zaključava za sobom.
            </p>
            <p className="mt-6 text-[15px] sm:text-[17px] font-black text-white leading-relaxed">
              Vi ste na poslu. Telefon zavibrira. Fotografija, i ispod nje: gotovo je.
            </p>
            <DugmeJaviteKvar onClick={otvoriFormu} klasa="mt-6 h-12 px-7 text-[14px]" />
          </div>
        </div>
      </section>

      {/* ── 4. TRI KARTICE ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              strah: "„Ne znate koga puštate u stan”",
              odgovor: "Majstor koji dolazi radi za Reddy. Ime dobijate prije nego krene.",
              ikona: User,
            },
            {
              strah: "„Ne radi opet, a njega više nema”",
              odgovor: "Trideset dana garancije na urađeno. Vrati se isti kvar, vraćamo se i mi.",
              ikona: ShieldCheck,
            },
            {
              strah: "„Nemate kome da se žalite”",
              odgovor: "Imate. Ako nešto krene naopako, zovete nas, ne majstora. Odatle je to naš problem.",
              ikona: Phone,
            },
          ].map((k) => (
            <div key={k.strah} className="rounded-3xl bg-white border border-[var(--beige-border)] p-5 shadow-soft">
              <div className="w-11 h-11 rounded-2xl plum-gradient flex items-center justify-center">
                <k.ikona className="w-5.5 h-5.5 text-[var(--sunshine)]" />
              </div>
              <div className="mt-3.5 font-black text-[15px] leading-snug">{k.strah}</div>
              <p className="mt-2 text-[13px] font-semibold text-[var(--plum-deep)]/65 leading-relaxed">
                {k.odgovor}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. USLUGE ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
        <h2 className="text-[22px] sm:text-[28px] font-black text-center">
          Šta najčešće radimo
        </h2>
        <p className="mt-1.5 text-[13px] font-bold text-[var(--plum-deep)]/55 text-center">
          Nađite svoj problem. Ako ga nema na spisku, opišite ga svojim riječima.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {USLUGE.map((u) => {
            const izabran = problem === u.naziv;
            return (
              <button
                key={u.naziv}
                onClick={() => izaberiUsluguIVratiGore(u.naziv)}
                className={`group rounded-3xl p-5 shadow-soft active:scale-[0.98] transition text-left border ${
                  izabran
                    ? "bg-[var(--sunshine)]/12 border-[var(--sunshine-deep)] shadow-glow"
                    : "bg-white border-[var(--beige-border)] hover:shadow-glow hover:border-[var(--sunshine-deep)]/50"
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition ${
                  izabran ? "sunshine-gradient" : "bg-[var(--cream)] border border-[var(--beige-border)] group-hover:sunshine-gradient"
                }`}>
                  <u.ikona className={`w-5.5 h-5.5 transition ${izabran ? "text-black" : "text-[var(--sunshine-deep)] group-hover:text-black"}`} />
                </div>
                <div className="mt-3 text-[15px] font-black">{u.naziv}</div>
                <div className="mt-1 text-[12.5px] font-semibold text-[var(--plum-deep)]/60 leading-snug">
                  {u.opis}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 6. KAKO OVO IDE ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
        <div className="rounded-3xl plum-gradient p-6 sm:p-10 shadow-soft">
          <h2 className="text-[22px] sm:text-[28px] font-black text-white text-center">
            Kako ovo ide
          </h2>

          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                broj: 1,
                naslov: "Javite šta se desilo",
                opis: "Opišite kvar i dodajte fotografiju ako možete. Sa slikom znamo šta da ponesemo.",
              },
              {
                broj: 2,
                naslov: "Šaljemo svog čovjeka",
                opis: "Ne spisak brojeva. Jednog majstora koji radi za nas, i nadzornika ako vas nema kod kuće.",
              },
              {
                broj: 3,
                naslov: "Gotovo je",
                opis: "Plaćate kad je posao završen. Ako nešto krene naopako, zovete nas. Ne majstora.",
              },
            ].map((k) => (
              <div key={k.broj} className="text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl sunshine-gradient flex items-center justify-center shadow-glow">
                  <span className="text-[20px] font-black text-black">{k.broj}</span>
                </div>
                <div className="mt-3 font-black text-white text-[16px]">{k.naslov}</div>
                <div className="mt-1.5 text-[13px] font-semibold text-white/65 leading-relaxed">
                  {k.opis}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-[14px] sm:text-[15px] font-bold text-white/80 max-w-lg mx-auto leading-relaxed">
              Poslije prvog poziva više ne tražite nikoga. Broj je isti i sljedeći put,
              i onaj poslije njega.
            </p>
            <DugmeJaviteKvar onClick={otvoriFormu} klasa="mt-5 h-12 px-7 text-[14px]" />
          </div>
        </div>
      </section>

      {/* ── 9. FAQ ── */}
      <Pitanja />

      {/* ── 7. FOOTER ── */}
      <footer className="plum-gradient text-white mt-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
            <div className="sm:col-span-1">
              <ReddyLogo />
              <p className="mt-3 text-[12.5px] font-semibold text-white/60 leading-relaxed">
                Reddy popravlja i sređuje ono što treba u stanu i lokalu.
                Voda, struja, moleraj, fasada. Podgorica.
              </p>
            </div>

            <div>
              <div className="text-[12px] font-black uppercase tracking-wider text-[var(--sunshine)]">
                Šta radimo
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px] font-bold text-white/75">
                <li>Vodoinstalater</li>
                <li>Električar</li>
                <li>Moleraj</li>
                <li>Fasada</li>
              </ul>
            </div>

            <div>
              <div className="text-[12px] font-black uppercase tracking-wider text-[var(--sunshine)]">
                Šta imate od nas
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px] font-bold text-white/75">
                <li>Trideset dana garancije na urađeno</li>
                <li>Otkazivanje bez naknade</li>
                <li>Zakasnimo li, dobijate popust</li>
                <li>Nadzornik kad vas nema kod kuće</li>
                <li>Zovete nas, ne majstora</li>
              </ul>
            </div>

            <div>
              <div className="text-[12px] font-black uppercase tracking-wider text-[var(--sunshine)]">
                Kontakt
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px] font-bold text-white/75">
                <li>
                  <a href={TELEFON_LINK} className="hover:text-[var(--sunshine)] transition">
                    {TELEFON}
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${EMAIL}?subject=${encodeURIComponent("Upit sa sajta")}`}
                    className="hover:text-[var(--sunshine)] transition"
                  >
                    {EMAIL}
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/thereddy.me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--sunshine)] transition"
                  >
                    <Instagram className="w-4 h-4" /> @thereddy.me
                  </a>
                </li>
                <li>Podgorica</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-white/10 text-[12px] font-bold text-white/50">
            © 2026 REDDY
          </div>
        </div>
      </footer>

      {formaOtvorena && (
        <Forma
          problem={problem}
          adresa={adresa.trim()}
          zatvori={() => setFormaOtvorena(false)}
        />
      )}
    </div>
  );
}

/* ── 9. FAQ ──────────────────────────────────────────────────────────────── */

const PITANJA = [
  {
    pitanje: "Šta ako posao ne bude urađen kako treba?",
    odgovor: "Zovete nas, ne majstora. Trideset dana garancije na urađeno. Vrati se isti kvar u tom roku, dolazimo ponovo i rad ne naplaćujemo.",
  },
  {
    pitanje: "Ko mi dolazi u stan?",
    odgovor: "Majstor koji radi za Reddy. Ime dobijate prije nego krene. Ako vas nema kod kuće, sa njim dolazi i naš nadzornik.",
  },
  {
    pitanje: "Ne mogu da budem kod kuće. Može li se ipak uraditi?",
    odgovor: "Može. Nadzornik iz Reddyja otvara, ostaje dok se radi i zaključava. Dobijete fotografije kad je gotovo.",
  },
  {
    pitanje: "Koliko košta?",
    odgovor: "Cijenu vam kaže majstor kad vidi kvar, prije nego počne da radi. Ne odgovara vam, ne radi se.",
  },
  {
    pitanje: "Šta ako se predomislim?",
    odgovor: "Otkazujete bez naknade. Ništa ne plaćate.",
  },
];

function Pitanja() {
  const [otvoreno, setOtvoreno] = useState<number | null>(0);

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 mt-12">
      <div className="space-y-2.5">
        {PITANJA.map((p, i) => {
          const aktivno = otvoreno === i;
          return (
            <div
              key={p.pitanje}
              className={`rounded-2xl border bg-white transition ${
                aktivno ? "border-[var(--sunshine-deep)] shadow-soft" : "border-[var(--beige-border)]"
              }`}
            >
              <button
                onClick={() => setOtvoreno(aktivno ? null : i)}
                aria-expanded={aktivno}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="flex-1 font-black text-[14px] leading-snug">{p.pitanje}</span>
                <ChevronDown
                  className={`w-4.5 h-4.5 shrink-0 text-[var(--sunshine-deep)] transition ${aktivno ? "rotate-180" : ""}`}
                />
              </button>
              {aktivno && (
                <p className="px-4 pb-4 -mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/70 leading-relaxed chat-pop">
                  {p.odgovor}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. FORMA — dva koraka
   ═══════════════════════════════════════════════════════════════════════════ */

interface Fotografija {
  naziv: string;
  fajl: File;
  pregled: string; // za prikaz sličice u formi
}

function Forma({
  problem,
  adresa,
  zatvori,
}: {
  problem: string;
  adresa: string;
  zatvori: () => void;
}) {
  const [korak, setKorak] = useState(1);

  // Korak 1
  const [opis, setOpis] = useState("");
  const [fotografije, setFotografije] = useState<Fotografija[]>([]);
  const [prevlacenje, setPrevlacenje] = useState(false);
  const fajlRef = useRef<HTMLInputElement>(null);

  // Korak 2
  const [ime, setIme] = useState("");
  const [prezime, setPrezime] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [ulica, setUlica] = useState(adresa);
  const [stan, setStan] = useState("");
  const [salje, setSalje] = useState(false);

  const korak1Ok = opis.trim().length > 0;
  const korak2Ok =
    ime.trim().length > 0 &&
    prezime.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    telefon.replace(/\D/g, "").length >= 8 &&
    ulica.trim().length > 0;

  const dodajFajlove = (lista: FileList | null) => {
    if (!lista) return;
    const nove = [...lista]
      .filter((x) => x.type.startsWith("image/"))
      .map((x) => ({ naziv: x.name, fajl: x, pregled: URL.createObjectURL(x) }));
    setFotografije((f) => [...f, ...nove]);
  };

  const ukloniFotografiju = (i: number) => {
    setFotografije((p) => {
      URL.revokeObjectURL(p[i].pregled);
      return p.filter((_, x) => x !== i);
    });
  };

  const formatTelefon = (sirovo: string) => {
    const c = sirovo.replace(/\D/g, "").slice(0, 9);
    if (c.length <= 3) return c;
    if (c.length <= 6) return `${c.slice(0, 3)} ${c.slice(3)}`;
    return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}`;
  };

  const posalji = async () => {
    if (!korak2Ok || salje) return;
    setSalje(true);
    await posaljiPrijavu(
      {
        problem,
        opis: opis.trim(),
        fotografije: fotografije.map((f) => f.naziv),
        ime: ime.trim(),
        prezime: prezime.trim(),
        email: email.trim(),
        telefon,
        adresa: ulica.trim(),
        stan: stan.trim(),
        poslato: new Date().toISOString(),
      },
      fotografije.map((f) => f.fajl),
    );
    setSalje(false);
    setKorak(3);
  };

  const naslovKoraka =
    korak === 1 ? "Šta se desilo?"
    : korak === 2 ? "Gdje i na koji broj"
    : "Prijava je stigla.";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <button aria-label="Zatvori" onClick={zatvori} className="absolute inset-0 bg-[var(--plum-deep)]/60 backdrop-blur-sm cursor-default" />

      <div className="relative w-full max-w-[480px] max-h-[94vh] bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col chat-pop">

        {/* Zaglavlje forme */}
        <div className="plum-gradient text-white px-5 pt-4 pb-4 shrink-0">
          <div className="flex items-center justify-between gap-2">
            {korak === 2 ? (
              <button
                onClick={() => setKorak(1)}
                aria-label="Nazad"
                className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-[var(--sunshine)]" />
              </div>
            )}
            <div className="text-center min-w-0">
              {korak < 3 && (
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--sunshine)]">
                  Korak {korak} od 2
                </div>
              )}
              <div className="text-[15px] font-black leading-tight truncate">{naslovKoraka}</div>
            </div>
            <button
              onClick={zatvori}
              aria-label="Zatvori"
              className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {korak < 3 && (
            <>
              <div className="mt-3 flex gap-1.5">
                {[1, 2].map((k) => (
                  <div key={k} className={`h-1.5 flex-1 rounded-full transition ${korak >= k ? "sunshine-gradient" : "bg-white/15"}`} />
                ))}
              </div>
              <div className="mt-2 text-center text-[10.5px] font-bold text-white/55">{problem}</div>
            </>
          )}
        </div>

        <div key={korak} className="flex-1 overflow-y-auto px-5 py-4 slide-up">

          {/* ── KORAK 1 ── */}
          {korak === 1 && (
            <>
              <label className="text-[13px] font-black">Opišite kvar</label>
              <textarea
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                placeholder="Npr. curi ispod sudopere, voda se skuplja na podu"
                rows={4}
                className="mt-2 w-full rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-4 py-3 text-[13px] font-bold outline-none placeholder:text-[var(--plum-deep)]/35 focus:border-[var(--sunshine-deep)] transition resize-none"
              />

              <label className="mt-4 block text-[13px] font-black">
                Dodajte fotografiju <span className="font-bold text-[var(--plum-deep)]/45">(nije obavezno)</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setPrevlacenje(true); }}
                onDragLeave={() => setPrevlacenje(false)}
                onDrop={(e) => { e.preventDefault(); setPrevlacenje(false); dodajFajlove(e.dataTransfer.files); }}
                onClick={() => fajlRef.current?.click()}
                className={`mt-2 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                  prevlacenje
                    ? "border-[var(--sunshine-deep)] bg-[var(--sunshine)]/10"
                    : "border-[var(--beige-border)] bg-[var(--cream)] hover:border-[var(--sunshine-deep)]/60"
                }`}
              >
                <input
                  ref={fajlRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { dodajFajlove(e.target.files); e.target.value = ""; }}
                />
                <div className="w-11 h-11 mx-auto rounded-2xl sunshine-gradient flex items-center justify-center shadow-glow">
                  <Camera className="w-5 h-5 text-black" />
                </div>
                <div className="mt-2 text-[13px] font-black">Kliknite da dodate sliku</div>
              </div>
              <p className="mt-2 text-[12px] font-bold text-[var(--plum-deep)]/55">
                Sa slikom znamo šta da ponesemo.
              </p>

              {/* Sličice — da čovjek odmah vidi da je slika stvarno dodata */}
              {fotografije.length > 0 && (
                <div className="mt-3 chat-pop">
                  <div className="flex items-center gap-1.5 text-[12px] font-black text-[var(--success)]">
                    <Check className="w-4 h-4" />
                    {fotografije.length === 1
                      ? "Dodali ste 1 sliku"
                      : `Dodali ste ${fotografije.length} slike`}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {fotografije.map((f, i) => (
                      <div
                        key={`${f.naziv}-${i}`}
                        className="relative aspect-square rounded-xl overflow-hidden border-2 border-[var(--success)] bg-[var(--cream)]"
                      >
                        <img src={f.pregled} alt={f.naziv} className="w-full h-full object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); ukloniFotografiju(i); }}
                          aria-label="Ukloni sliku"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hitno je? Zovite */}
              <a
                href={TELEFON_LINK}
                className="mt-4 w-full rounded-2xl border border-[var(--beige-border)] bg-[var(--cream)] p-3.5 flex items-center gap-3 hover:border-[var(--sunshine-deep)] transition"
              >
                <div className="w-9 h-9 rounded-xl sunshine-gradient flex items-center justify-center shrink-0">
                  <Phone className="w-4.5 h-4.5 text-black" />
                </div>
                <span className="text-[13px] font-bold text-[var(--plum-deep)]/70">
                  Hitno je?{" "}
                  <span className="font-black text-[var(--sunshine-deep)]">Zovite {TELEFON}</span>
                </span>
              </a>

              <button
                onClick={() => setKorak(2)}
                disabled={!korak1Ok}
                className={`mt-5 w-full h-12 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2 transition ${
                  korak1Ok
                    ? "sunshine-gradient text-black shadow-glow active:scale-[0.98]"
                    : "bg-[var(--beige)] text-[var(--plum-deep)]/40"
                }`}
              >
                Dalje <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </>
          )}

          {/* ── KORAK 2 ── */}
          {korak === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">Ime</label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                    <User className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                    <input value={ime} onChange={(e) => setIme(e.target.value)} placeholder="Ana" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">Prezime</label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                    <User className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                    <input value={prezime} onChange={(e) => setPrezime(e.target.value)} placeholder="Popović" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
                  </div>
                </div>
              </div>

              <label className="mt-3.5 block text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">Email</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                <Mail className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ana.popovic@email.com" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
                {/\S+@\S+\.\S+/.test(email) && <Check className="w-4 h-4 text-[var(--success)] shrink-0" />}
              </div>

              <label className="mt-3.5 block text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">Broj telefona</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                <Phone className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                <input value={telefon} onChange={(e) => setTelefon(formatTelefon(e.target.value))} inputMode="tel" placeholder="067 123 456" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
                {telefon.replace(/\D/g, "").length >= 8 && <Check className="w-4 h-4 text-[var(--success)] shrink-0" />}
              </div>

              <label className="mt-3.5 block text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">Adresa, ulica i broj</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                <MapPin className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                <input value={ulica} onChange={(e) => setUlica(e.target.value)} placeholder="Njegoševa 12" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
                {ulica.trim().length > 0 && <Check className="w-4 h-4 text-[var(--success)] shrink-0" />}
              </div>

              <label className="mt-3.5 block text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/50">
                Sprat i stan <span className="normal-case text-[var(--plum-deep)]/35">(nije obavezno)</span>
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] px-3.5 h-12 focus-within:border-[var(--sunshine-deep)] transition">
                <KeyRound className="w-4 h-4 text-[var(--plum-deep)]/40 shrink-0" />
                <input value={stan} onChange={(e) => setStan(e.target.value)} placeholder="III sprat, stan 7" className="w-full bg-transparent outline-none text-[13px] font-bold placeholder:text-[var(--plum-deep)]/35" />
              </div>

              <p className="mt-3.5 text-[12px] font-bold text-[var(--plum-deep)]/60 leading-snug">
                Broj koristimo da vas nazovemo za ovaj kvar. Ništa drugo.
              </p>

              <button
                onClick={posalji}
                disabled={!korak2Ok || salje}
                className={`mt-5 w-full h-12 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2 transition ${
                  korak2Ok && !salje
                    ? "sunshine-gradient text-black shadow-glow active:scale-[0.98]"
                    : "bg-[var(--beige)] text-[var(--plum-deep)]/40"
                }`}
              >
                {salje ? "Šaljem…" : "Pošaljite prijavu"}
              </button>
              <p className="mt-2.5 text-center text-[12px] font-bold text-[var(--plum-deep)]/55">
                Zovemo vas na broj koji ste ostavili i dogovaramo termin.
              </p>
            </>
          )}

          {/* ── EKRAN POSLIJE SLANJA ── */}
          {korak === 3 && (
            <div className="py-8 text-center">
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[var(--success)] opacity-30 map-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-[var(--success)] flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-white" />
                </div>
              </div>

              <h3 className="mt-5 text-[22px] font-black">Prijava je stigla.</h3>
              <p className="mt-3 text-[14px] font-semibold text-[var(--plum-deep)]/65 max-w-sm mx-auto leading-relaxed">
                Zovemo vas na broj koji ste ostavili i dogovaramo termin. Ako je hitno,
                možete i vi nas:{" "}
                <a href={TELEFON_LINK} className="font-black text-[var(--sunshine-deep)] hover:underline whitespace-nowrap">
                  {TELEFON}
                </a>
              </p>

              <button
                onClick={zatvori}
                className="mt-6 w-full h-12 rounded-2xl sunshine-gradient text-black font-black text-[14px] shadow-glow active:scale-[0.98] transition"
              >
                Zatvori
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STRANICA
   ═══════════════════════════════════════════════════════════════════════════ */

function PrototypePage() {
  const [formaIzHeadera, setFormaIzHeadera] = useState(false);

  return (
    <div className="min-h-screen text-[var(--plum-deep)]">
      <Zaglavlje otvoriFormu={() => setFormaIzHeadera(true)} />
      <Naslovna />
      <MobilniPoziv />

      {formaIzHeadera && (
        <Forma
          problem={PROBLEMI[0]}
          adresa=""
          zatvori={() => setFormaIzHeadera(false)}
        />
      )}
    </div>
  );
}
