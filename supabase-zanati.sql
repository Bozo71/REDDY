-- Zanati se sada drže u bazi, da se dodaju iz panela bez diranja koda.
-- Pokreni jednom u Supabase → SQL Editor. Može i više puta.

-- Cjenovnik dobija naziv, redoslijed i prekidač za gašenje.
alter table cjenovnik add column if not exists naziv      text;
alter table cjenovnik add column if not exists redoslijed integer not null default 100;
alter table cjenovnik add column if not exists aktivna    boolean not null default true;

-- Nazivi za zanate koji su do sada stajali u kodu.
update cjenovnik set naziv = 'Kućne popravke',            redoslijed = 10 where kategorija = 'kucne_popravke' and naziv is null;
update cjenovnik set naziv = 'Klime i grijanje',          redoslijed = 20 where kategorija = 'klime'          and naziv is null;
update cjenovnik set naziv = 'Vodoinstalater',            redoslijed = 30 where kategorija = 'vodoinstalater' and naziv is null;
update cjenovnik set naziv = 'Električar',                redoslijed = 40 where kategorija = 'elektricar'     and naziv is null;
update cjenovnik set naziv = 'Alarmi, kamere, interfoni', redoslijed = 50 where kategorija = 'sigurnost'      and naziv is null;
update cjenovnik set naziv = 'Bravar',                    redoslijed = 60 where kategorija = 'bravar'         and naziv is null;
update cjenovnik set naziv = 'Moler',                     redoslijed = 70 where kategorija = 'moler'          and naziv is null;
update cjenovnik set naziv = 'Fasader',                   redoslijed = 80 where kategorija = 'fasader'        and naziv is null;
update cjenovnik set naziv = 'Keramičar',                 redoslijed = 90 where kategorija = 'keramicar'      and naziv is null;

-- Ako je nešto ostalo bez naziva, neka bar ne bude prazno.
update cjenovnik set naziv = kategorija where naziv is null or naziv = '';

alter table cjenovnik alter column naziv set not null;
