-- ═══════════════════════════════════════════════════════════════════════════
-- 015 — Momsperioder: att en deklaration är lämnad ska vara ett faktum
--
-- lib/moms-period.js härledde "filed" så här:
--
--     const locked = receipts.length > 0 && receipts.every((r) => r.locked_at);
--
-- studio_receipts har ingen kolumn locked_at. Uttrycket blev alltså alltid
-- false, ingenting kunde bygga på det, och en missad momsdeklaration gick
-- obemärkt förbi. Förseningsavgiften är 625 kr per utebliven deklaration och
-- tas ut även när deklarationen visar noll eller ett belopp att få tillbaka.
--
-- Att en period är lämnad är ingenting man räknar fram ur kvittona. Det är en
-- händelse med ett datum. Den registreras här.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.studio_moms_perioder (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  period_key    text not null,            -- '2026-Q2'
  period_start  date not null,
  period_end    date not null,
  deadline      date not null,            -- sista dag enligt lib/moms-status.js

  lamnad_at     timestamptz not null default now(),
  belopp        numeric,                  -- ruta 49: + att betala, − att få tillbaka
  rutor         jsonb,                    -- fryst kopia av deklarationen som lämnades
  anteckning    text,

  created_at    timestamptz default now()
);

-- En period lämnas en gång. Två rader för samma kvartal är alltid ett misstag.
create unique index if not exists studio_moms_perioder_unik
  on public.studio_moms_perioder (user_id, period_key);

create index if not exists studio_moms_perioder_deadline
  on public.studio_moms_perioder (user_id, deadline);

alter table public.studio_moms_perioder
  drop constraint if exists studio_moms_perioder_ordning;
alter table public.studio_moms_perioder
  add constraint studio_moms_perioder_ordning
  check (period_end >= period_start and deadline >= period_end);

alter table public.studio_moms_perioder enable row level security;

drop policy if exists own_moms_perioder on public.studio_moms_perioder;
create policy own_moms_perioder on public.studio_moms_perioder
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.studio_moms_perioder is
  'En rad per lämnad momsdeklaration. Frånvaron av en rad betyder att perioden '
  'inte är lämnad — det är hela poängen med tabellen.';

comment on column public.studio_moms_perioder.rutor is
  'Rutorna som faktiskt lämnades, frysta. Räknar man om dem senare ur kvitton '
  'som hunnit ändras får man ett annat svar än det Skatteverket har.';

-- ── Det som lämnats till Skatteverket kan inte ändras i efterhand ──────────
-- Ett fel rättas med en ny deklaration hos Skatteverket, inte genom att skriva
-- om historiken här. Raden får däremot tas bort: har man råkat markera fel
-- period som lämnad måste det gå att ångra, och det riktiga beskedet finns
-- ändå hos Skatteverket, inte i den här tabellen.
create or replace function public.studio_moms_perioder_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.period_key   is distinct from old.period_key)
  or (new.period_start is distinct from old.period_start)
  or (new.period_end   is distinct from old.period_end)
  or (new.belopp       is distinct from old.belopp)
  or (new.rutor        is distinct from old.rutor)
  or (new.lamnad_at    is distinct from old.lamnad_at) then
    raise exception
      'En lämnad momsdeklaration ändras inte i efterhand. Rätta hos Skatteverket, '
      'eller ta bort raden om perioden markerats som lämnad av misstag.';
  end if;
  return new;
end;
$$;

drop trigger if exists studio_moms_perioder_guard_trg on public.studio_moms_perioder;
create trigger studio_moms_perioder_guard_trg
  before update on public.studio_moms_perioder
  for each row execute function public.studio_moms_perioder_guard();
