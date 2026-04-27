-- ═════════════════════════════════════════════════════════════════════════════
-- NORDBOK STUDIO — Supabase schema for daily accounting (enskild firma)
-- Tables are namespaced `studio_*` so they don't collide with the existing
-- skattenavigator tables in the same Supabase project.
-- Every table has RLS enabled with policies that lock rows to the owning user.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Settings / business profile (one row per user) ──────────────────────────
create table if not exists public.studio_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  business_name     text,
  personnummer      text,           -- EF uses personnummer as ID; format YYYYMMDD-XXXX
  org_nr            text,           -- optional voluntary org-nr (10 digits)
  vat_number        text,           -- "SE" + 12 digits, e.g. SE197506019295 01
  f_skatt_approved  boolean default true,
  address_street    text,
  address_zip       text,
  address_city      text,
  iban              text,
  bankgiro          text,
  plusgiro          text,
  default_payment_terms_days int default 30,
  default_vat_rate  numeric default 25,   -- 25, 12, 6, or 0
  invoice_logo_url  text,
  invoice_footer    text,
  oss_registered    boolean default false, -- One-Stop-Shop VAT
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ─── Clients (people/companies you invoice) ──────────────────────────────────
create table if not exists public.studio_clients (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  contact_person   text,
  email            text,
  org_nr           text,         -- or personnummer for ROT/RUT private customers
  vat_number       text,         -- EU VAT for B2B reverse-charge
  address_street   text,
  address_zip      text,
  address_city     text,
  country_code     text default 'SE',  -- ISO 3166-1 alpha-2 — drives OSS logic
  fastighetsbeteckning text,     -- ROT compliance for villa
  brf_org_nr       text,         -- ROT compliance for apartment
  notes            text,
  archived         boolean default false,
  created_at       timestamptz default now()
);
create index if not exists idx_studio_clients_user on public.studio_clients(user_id);

-- ─── Invoices ────────────────────────────────────────────────────────────────
create table if not exists public.studio_invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  client_id        uuid references public.studio_clients(id) on delete set null,
  invoice_number   text not null,
  status           text not null default 'draft',
                   -- draft | sent | partially_paid | paid | overdue | cancelled
  issue_date       date not null default current_date,
  due_date         date not null,
  reference        text,                   -- OCR/Bankgiro reference
  ocr_number       text,                   -- generated 7+1 mod-10 OCR
  currency         text not null default 'SEK',
  subtotal         numeric not null default 0,
  vat_amount       numeric not null default 0,
  total            numeric not null default 0,
  rot_amount       numeric default 0,      -- subsidy held back for Skatteverket (50% of arbetskostnad, max 50k/y)
  rut_amount       numeric default 0,      -- 50% of arbetskostnad, max 75k/y combined
  rot_rut_type     text,                   -- 'ROT' | 'RUT' | null
  reverse_charge   boolean default false,  -- omvänd skattskyldighet (B2B EU services / construction)
  oss_country      text,                   -- destination country for OSS B2C EU sale
  pdf_url          text,
  sent_at          timestamptz,
  paid_at          timestamptz,
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_studio_invoices_user on public.studio_invoices(user_id);
create index if not exists idx_studio_invoices_status on public.studio_invoices(user_id, status);
create unique index if not exists uq_studio_invoice_number on public.studio_invoices(user_id, invoice_number);

-- ─── Invoice line items ──────────────────────────────────────────────────────
create table if not exists public.studio_invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.studio_invoices(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  position         int not null default 0,
  description      text not null,
  quantity         numeric not null default 1,
  unit             text default 'st',
  unit_price       numeric not null default 0,
  vat_rate         numeric not null default 25,  -- 25 | 12 | 6 | 0
  rot_rut_hours    numeric,                       -- arbetstimmar for ROT/RUT line
  bas_account      text                           -- e.g. 3001 (försäljning 25% moms)
);
create index if not exists idx_studio_invoice_items_invoice on public.studio_invoice_items(invoice_id);

-- ─── Receipts (expenses, deductions) ─────────────────────────────────────────
create table if not exists public.studio_receipts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  receipt_date     date,
  vendor           text,
  total            numeric,
  vat_amount       numeric,
  vat_rate         numeric,
  currency         text default 'SEK',
  category         text,                          -- e.g. "Resor", "Kontorsmateriel", "Tele/IT"
  bas_account      text,                          -- e.g. 5410 (Förbrukningsinventarier)
  ne_row           text,                          -- target row on NE-bilaga (e.g. R5)
  payment_method   text,                          -- card | cash | swish | bank | private
  description      text,
  storage_path     text,                          -- Supabase Storage object path
  ocr_raw          jsonb,                         -- raw vision output for audit
  ocr_confidence   numeric,
  is_deductible    boolean default true,
  is_business      boolean default true,          -- false = privatuttag (egen)
  source           text default 'manual',         -- manual | scan | bank_csv | apple_wallet
  status           text default 'review',         -- review | approved | rejected
  created_at       timestamptz default now()
);
create index if not exists idx_studio_receipts_user on public.studio_receipts(user_id);
create index if not exists idx_studio_receipts_date on public.studio_receipts(user_id, receipt_date desc);

-- ─── Mileage / körjournal ────────────────────────────────────────────────────
create table if not exists public.studio_trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  trip_date        date not null,
  from_address     text not null,
  to_address       text not null,
  purpose          text not null,                 -- Skatteverket REQUIRES purpose
  km               numeric not null,
  odo_start        numeric,                        -- mätarställning start
  odo_end          numeric,                        -- mätarställning slut
  vehicle_reg      text,                           -- registreringsnummer
  vehicle_type     text default 'private_car',     -- private_car | company_car_petrol | company_car_ev
  is_business      boolean default true,
  rate_per_mil     numeric default 25,             -- 2026: 25 kr/mil for private car business use
  deduction        numeric,                        -- computed: km/10 * rate_per_mil
  created_at       timestamptz default now()
);
create index if not exists idx_studio_trips_user on public.studio_trips(user_id);
create index if not exists idx_studio_trips_date on public.studio_trips(user_id, trip_date desc);

-- ─── Bank transactions (CSV import; v1.5 will sync via PSD2) ─────────────────
create table if not exists public.studio_bank_tx (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  tx_date          date not null,
  description      text,
  amount           numeric not null,
  currency         text default 'SEK',
  bank             text,
  matched_receipt  uuid references public.studio_receipts(id) on delete set null,
  matched_invoice  uuid references public.studio_invoices(id) on delete set null,
  category         text,
  imported_at      timestamptz default now()
);
create index if not exists idx_studio_bank_tx_user on public.studio_bank_tx(user_id, tx_date desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — every table is locked per user_id
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.studio_settings       enable row level security;
alter table public.studio_clients        enable row level security;
alter table public.studio_invoices       enable row level security;
alter table public.studio_invoice_items  enable row level security;
alter table public.studio_receipts       enable row level security;
alter table public.studio_trips          enable row level security;
alter table public.studio_bank_tx        enable row level security;

drop policy if exists own_settings on public.studio_settings;
create policy own_settings on public.studio_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_clients on public.studio_clients;
create policy own_clients on public.studio_clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_invoices on public.studio_invoices;
create policy own_invoices on public.studio_invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_invoice_items on public.studio_invoice_items;
create policy own_invoice_items on public.studio_invoice_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_receipts on public.studio_receipts;
create policy own_receipts on public.studio_receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_trips on public.studio_trips;
create policy own_trips on public.studio_trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_bank_tx on public.studio_bank_tx;
create policy own_bank_tx on public.studio_bank_tx
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Storage bucket for receipt images (run separately if not exists) ────────
-- insert into storage.buckets (id, name, public) values ('studio-receipts', 'studio-receipts', false);
-- create policy "users can upload own receipts" on storage.objects
--   for insert with check (bucket_id = 'studio-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "users can read own receipts" on storage.objects
--   for select using (bucket_id = 'studio-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
