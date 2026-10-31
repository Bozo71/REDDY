-- Obavještenja na telefon. Pokreni jednom u Supabase → SQL Editor.
-- Može i više puta, ništa ne kvari.

create table if not exists push_pretplate (
  id         uuid primary key default gen_random_uuid(),
  vrsta      text not null,              -- majstor | admin
  ko_id      uuid not null,
  endpoint   text not null unique,       -- adresa koju da je pregledač; jedinstvena po uređaju
  podaci     jsonb not null,             -- ključevi za šifrovanje poruke
  napravljen timestamptz not null default now()
);

create index if not exists idx_push_ko on push_pretplate(vrsta, ko_id);

-- Isto kao ostale tabele: čita se samo preko servera, nikad iz pregledača.
alter table push_pretplate enable row level security;
