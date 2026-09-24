import { PrototypePage, type TekstStranice } from "./routes/index";
import { glavaUsluge, nadjiUslugu } from "./usluge";

/** Sve što ruti usluge treba — da svaki route fajl ostane na par redova. */
export function rutaUsluge(putanja: string) {
  const u = nadjiUslugu(putanja);
  const tekst: TekstStranice = {
    naslovGore: u.naslovGore,
    naslovDolje: u.naslovDolje,
    podnaslov: u.podnaslov,
    pocetniProblem: u.problem,
  };

  return {
    component: () => <PrototypePage {...tekst} />,
    head: () => glavaUsluge(u),
  };
}
