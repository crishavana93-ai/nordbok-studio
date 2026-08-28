-- 017_kvittorattelse.sql
-- Att rätta ett kvitto utan att sudda ut vad som stod där förut.
--
-- VARFÖR DET HÄR ÄR EN TABELL OCH INTE ETT UPDATE
-- Ett kvitto kunde skapas men aldrig ändras. Det lät försiktigt, men blev
-- motsatsen: en rad med fel momsbehandling gick inte att rätta i appen alls,
-- och den enda kvarvarande vägen var att gå in i databasen och skriva över
-- den — utan spår, utan datum, utan vad som stod där innan.
--
-- Bokföringslagen 5 kap. 5 § kräver vid rättelse att det framgår VAD som
-- rättats och NÄR. Ett rent UPDATE uppfyller inte det. Två skrivningar i
-- samma begäran gör det: den nya raden, och en oföränderlig anteckning om
-- vad den ersatte.
--
-- VAD SOM ALDRIG FÅR RÄTTAS
-- storage_path och file_hash står inte med bland de rättningsbara fälten i
-- lib/kvitto-regler.js. Underlaget ska bevaras i den form det kom in
-- (7 kap. 1 §); går filen att byta ut i efterhand bevisar kontrollsumman
-- ingenting alls.
--
-- Kör i Supabase -> SQL Editor. Går att köra om.

create table if not exists public.studio_receipt_corrections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  receipt_id  uuid not null references public.studio_receipts(id) on delete cascade,

  -- Vilka fält som ändrades, och vad de var före och efter. Bara de ändrade
  -- fälten -- inte hela raden. En diff går att läsa; en dubblett gör det inte.
  fore        jsonb not null,
  efter       jsonb not null,
  falt        text[] not null,

  -- Varför. Frivilligt, men det är den enda delen som en revisor faktiskt
  -- vill läsa, så gränssnittet frågar efter det.
  skal        text,

  created_at  timestamptz not null default now()
);

create index if not exists ix_rattelse_kvitto
  on public.studio_receipt_corrections (receipt_id, created_at desc);
create index if not exists ix_rattelse_user
  on public.studio_receipt_corrections (user_id, created_at desc);

alter table public.studio_receipt_corrections enable row level security;

-- Läsa och skapa: ja. Ändra och ta bort: nej -- det är hela anledningen till
-- att tabellen finns. En rättelsehistorik som går att redigera är ingen
-- historik, och till skillnad från felloggen ÄR det här räkenskapsinformation
-- som ska bevaras till utgången av det sjunde året efter räkenskapsåret.
drop policy if exists "egna rattelser las" on public.studio_receipt_corrections;
create policy "egna rattelser las" on public.studio_receipt_corrections
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "egna rattelser skriv" on public.studio_receipt_corrections;
create policy "egna rattelser skriv" on public.studio_receipt_corrections
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Ingen update-policy och ingen delete-policy. RLS nekar det som inte uttryckligen
-- tillåts, så raderna är oföränderliga genom API:et. En trigger säger dessutom
-- ifrån med ett begripligt fel i stället för ett tyst "0 rows".
create or replace function public.studio_rattelse_orubblig()
returns trigger
language plpgsql
as $$
begin
  raise exception 'En rättelse kan inte ändras eller tas bort. Rätta kvittot igen i stället — den nya rättelsen läggs till efter den här.';
end;
$$;

drop trigger if exists trg_rattelse_orubblig on public.studio_receipt_corrections;
create trigger trg_rattelse_orubblig
  before update or delete on public.studio_receipt_corrections
  for each row execute function public.studio_rattelse_orubblig();

comment on table public.studio_receipt_corrections is
  'Rättelsehistorik för kvitton (BFL 5 kap. 5 §). Oföränderlig. Räkenskapsinformation — bevaras i sju år, till skillnad från studio_error_log.';
