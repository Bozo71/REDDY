-- REDDY za firme — nalozi po poslovnici.
-- Pokreni jednom u Supabase → SQL Editor. Može i više puta, ništa ne kvari.

/* Firmi treba samo naziv. Podaci za račun (PIB, sjedište, PDV) dolaze kad
   se bude pravio račun — nema smisla tražiti ih prije nego zatrebaju. */
create table if not exists firme (
  id          uuid primary key default gen_random_uuid(),
  naziv       text not null,
  pauzirana   boolean not null default false,
  napravljena timestamptz not null default now()
);

create table if not exists poslovnice (
  id          uuid primary key default gen_random_uuid(),
  firma_id    uuid not null references firme(id) on delete cascade,
  naziv       text not null,
  -- Adresa stoji ovdje da je poslovnica ne kuca pri svakoj prijavi.
  adresa      text not null,
  lokacija    text not null default 'Podgorica',
  telefon     text,
  pauzirana   boolean not null default false,
  napravljena timestamptz not null default now()
);

/* Nalog za ulaz u /firme.
   Poslovnica ima poslovnica_id, direktor ga nema — on vidi cijelu firmu. */
create table if not exists firma_nalozi (
  id            uuid primary key default gen_random_uuid(),
  firma_id      uuid not null references firme(id) on delete cascade,
  poslovnica_id uuid references poslovnice(id) on delete cascade,
  vrsta         text not null default 'poslovnica',   -- poslovnica | direktor
  ime           text not null,
  nadimak       text not null unique,
  sifra_hash    text not null,
  pauziran      boolean not null default false,
  napravljen    timestamptz not null default now()
);

-- Posao zna iz koje je poslovnice stigao. Prazno = obična prijava sa sajta.
alter table poslovi add column if not exists poslovnica_id uuid
  references poslovnice(id) on delete set null;

/* I ko ga je tačno prijavio. Kad poslovnica ima više naloga, direktor vidi
   ime, ne samo poslovnicu. Nalog se briše, posao ostaje — zato set null. */
alter table poslovi add column if not exists prijavio_id uuid
  references firma_nalozi(id) on delete set null;

create index if not exists idx_poslovnice_firma    on poslovnice(firma_id);
create index if not exists idx_firma_nalozi_firma  on firma_nalozi(firma_id);
create index if not exists idx_poslovi_poslovnica  on poslovi(poslovnica_id);

/* Direktorov pregled: sve prijave njegove firme — ko je šta prijavio, u
   kojoj poslovnici, i dokle je stiglo. Ime i telefon majstora se vide tek
   kad je posao kupljen — dotad nema koga prikazati. */
create or replace view prijave_firmi as
select
  p.id,
  p.poslovnica_id,
  pl.firma_id,
  pl.naziv            as poslovnica,
  n.ime               as prijavio,
  p.kategorija,
  p.opis,
  p.adresa,
  p.fotografije,
  p.cijena,
  p.status,
  p.napravljen,
  m.ime               as majstor_ime,
  m.telefon           as majstor_telefon
from poslovi p
join poslovnice pl on pl.id = p.poslovnica_id
left join firma_nalozi n on n.id = p.prijavio_id
left join majstori m on m.id = p.kupac_id
where p.poslovnica_id is not null;

/* ── Zaštita ──────────────────────────────────────────────────────────────
   Kao i ostale tabele: samo server sa service_role ključem. Ovdje su šifre
   poslovnica i spisak kvarova cijele firme. */
alter table firme        enable row level security;
alter table poslovnice   enable row level security;
alter table firma_nalozi enable row level security;
