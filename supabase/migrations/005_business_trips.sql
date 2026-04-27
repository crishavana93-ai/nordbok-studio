-- ═════════════════════════════════════════════════════════════════════════════
-- Affärsresor (business trips) — the per-trip audit trail Skatteverket asks for.
-- Captures syfte, deltagare, destination(s), and links to the receipts, körjournal
-- entries, and documents that prove the trip was business.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.studio_business_trips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,                       -- e.g. "Berlin — kundmöte Acme + CeBIT"
  destination     text,                                -- "Berlin, Tyskland"
  country_code    text,                                -- ISO alpha-2
  start_date      date not null,
  end_date        date not null,
  purpose         text not null,                       -- the WHY — Skatteverket cares
  contacts        jsonb default '[]'::jsonb,           -- [{name,company,role,email}, ...]
  conference      text,                                -- name of conference/event
  client_id       uuid references public.studio_clients(id) on delete set null,
  travel_mode     text,                                -- 'flight' | 'train' | 'car' | 'mixed'
  vehicle_reg     text,
  estimated_cost  numeric,
  actual_cost     numeric,                              -- computed from linked receipts; user can override
  currency        text default 'SEK',
  uses_traktamente boolean default true,                -- chose schablon vs receipts
  status          text default 'planned',               -- planned | ongoing | completed | cancelled
  private_days    int default 0,                        -- how many days of the trip were private
  notes           text,
  attached_documents uuid[] default '{}',               -- links to studio_documents
  attached_receipts  uuid[] default '{}',               -- links to studio_receipts
  attached_trips     uuid[] default '{}',               -- links to studio_trips (körjournal)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_studio_btrips_user on public.studio_business_trips(user_id, start_date desc);

alter table public.studio_business_trips enable row level security;
drop policy if exists own_business_trips on public.studio_business_trips;
create policy own_business_trips on public.studio_business_trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Optional convenience: tag receipts/trips/documents back-link to a business trip
alter table public.studio_receipts add column if not exists business_trip_id uuid references public.studio_business_trips(id) on delete set null;
alter table public.studio_trips    add column if not exists business_trip_id uuid references public.studio_business_trips(id) on delete set null;
alter table public.studio_documents add column if not exists business_trip_id uuid references public.studio_business_trips(id) on delete set null;
