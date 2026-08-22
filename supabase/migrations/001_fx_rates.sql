-- 001_fx_rates.sql
-- FX rate cache + per-transaction rate provenance.
--
-- The cache exists to avoid hammering the ECB, but the important half of this
-- migration is the columns added to studio_invoices and studio_receipts. Skatteverket
-- expects you to show WHICH rate you applied and WHEN. Storing the rate on the row
-- means a future rate revision, provider change or API outage can never alter a
-- figure you have already reported.
--
-- Run in Supabase → SQL Editor. Safe to re-run.

-- ── Rate cache ──────────────────────────────────────────────────────────────
create table if not exists public.fx_rates (
  currency   text        not null,
  date       date        not null,            -- the date the money moved
  rate       numeric(18,8) not null,          -- SEK per 1 unit of `currency`
  source     text        not null,            -- 'ecb' | 'riksbank'
  rate_date  date        not null,            -- observation date actually used
  created_at timestamptz not null default now(),
  primary key (currency, date)
);

comment on table  public.fx_rates       is 'Cached SEK conversion rates. rate_date may precede date across weekends/holidays.';
comment on column public.fx_rates.rate  is 'SEK per 1 unit of currency.';

alter table public.fx_rates enable row level security;

-- Reference data, not user data: readable by any signed-in user, writable only
-- by the service role (the server writes through on a cache miss).
drop policy if exists "fx_rates readable by authenticated" on public.fx_rates;
create policy "fx_rates readable by authenticated"
  on public.fx_rates for select
  to authenticated
  using (true);

-- ── Provenance on transactions ──────────────────────────────────────────────
alter table public.studio_invoices
  add column if not exists currency    text          not null default 'SEK',
  add column if not exists fx_rate     numeric(18,8),
  add column if not exists fx_source   text,
  add column if not exists fx_date     date,
  add column if not exists total_sek   numeric(14,2),
  add column if not exists vat_sek     numeric(14,2),
  add column if not exists venture     text;

alter table public.studio_receipts
  add column if not exists currency    text          not null default 'SEK',
  add column if not exists fx_rate     numeric(18,8),
  add column if not exists fx_source   text,
  add column if not exists fx_date     date,
  add column if not exists total_sek   numeric(14,2),
  add column if not exists vat_sek     numeric(14,2),
  add column if not exists venture     text,
  -- VAT treatment, so the moms engine never has to re-infer it from the vendor name
  add column if not exists vat_treatment text;      -- see check below

-- 'domestic'       Swedish supplier, Swedish moms → ruta 48
-- 'rc_eu'          service from an EU supplier    → ruta 21 + 30, deduct 48
-- 'rc_non_eu'      service from outside the EU    → ruta 22 + 30, deduct 48
-- 'oss_non_ded'    foreign supplier charged SE VAT via OSS → NOT deductible, appears nowhere
-- 'exempt'         no VAT (e.g. international passenger transport)
alter table public.studio_receipts
  drop constraint if exists studio_receipts_vat_treatment_check;
alter table public.studio_receipts
  add constraint studio_receipts_vat_treatment_check
  check (vat_treatment is null or vat_treatment in
    ('domestic','rc_eu','rc_non_eu','oss_non_ded','exempt'));

-- ── Venture tagging ─────────────────────────────────────────────────────────
-- One legal entity, one momsdeklaration, one NE-bilaga. Six P&Ls for decisions.
alter table public.studio_invoices
  drop constraint if exists studio_invoices_venture_check;
alter table public.studio_invoices
  add constraint studio_invoices_venture_check
  check (venture is null or venture in
    ('the_next_cigar','turquino','skattenavigator','zamacharters','cruiseshuttle','ifmba','other'));

alter table public.studio_receipts
  drop constraint if exists studio_receipts_venture_check;
alter table public.studio_receipts
  add constraint studio_receipts_venture_check
  check (venture is null or venture in
    ('the_next_cigar','turquino','skattenavigator','zamacharters','cruiseshuttle','ifmba','other'));

-- ── Indexes the moms engine will lean on ────────────────────────────────────
-- Kontantmetoden reports on the date money moved, so paid_at is the hot column.
create index if not exists idx_invoices_paid_at   on public.studio_invoices (paid_at);
create index if not exists idx_invoices_venture   on public.studio_invoices (venture);
create index if not exists idx_receipts_date      on public.studio_receipts (receipt_date);
create index if not exists idx_receipts_treatment on public.studio_receipts (vat_treatment);
create index if not exists idx_receipts_venture   on public.studio_receipts (venture);
