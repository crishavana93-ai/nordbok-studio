-- 002_invoice_series.sql
-- Gap-free invoice numbering + per-venture invoice identity.
--
-- WHY A DATABASE FUNCTION AND NOT APP CODE
-- Swedish law requires invoice numbers to run in an unbroken sequence. Two browser
-- tabs, a double-clicked button, or a retried request can all allocate the same
-- number if the "read max, add one" happens in JavaScript. The allocation below runs
-- inside a single statement under a row lock, so concurrent callers queue instead of
-- colliding. A number, once handed out, is never handed out again.
--
-- Format: 2026-0001, resetting each year.
--
-- Run in Supabase → SQL Editor. Safe to re-run.

-- ── Number series ───────────────────────────────────────────────────────────
create table if not exists public.studio_invoice_series (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  series     text    not null default 'default',  -- room for per-venture series later
  year       int     not null,
  last_no    int     not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, series, year)
);

alter table public.studio_invoice_series enable row level security;

drop policy if exists "own series" on public.studio_invoice_series;
create policy "own series" on public.studio_invoice_series
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Atomic allocation ───────────────────────────────────────────────────────
-- Returns the next number as text, e.g. '2026-0001'.
-- The INSERT ... ON CONFLICT DO UPDATE takes a row lock for the duration of the
-- statement, which is what makes concurrent calls safe.
create or replace function public.next_invoice_number(
  p_series text default 'default',
  p_year   int  default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_year int  := coalesce(p_year, extract(year from current_date)::int);
  v_no   int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.studio_invoice_series (user_id, series, year, last_no)
    values (v_user, p_series, v_year, 1)
  on conflict (user_id, series, year)
    do update set last_no = studio_invoice_series.last_no + 1
  returning last_no into v_no;

  return v_year::text || '-' || lpad(v_no::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number(text, int) from public;
grant execute on function public.next_invoice_number(text, int) to authenticated;

-- ── Per-venture invoice identity ────────────────────────────────────────────
-- One legal entity, one org.nr, one momsdeklaration — but the name at the top of
-- the invoice should match the venture the work was done under. Only names actually
-- registered at Bolagsverket may appear as the seller.
create table if not exists public.studio_venture_identity (
  user_id        uuid not null references auth.users(id) on delete cascade,
  venture        text not null,
  display_name   text not null,         -- what prints at the top of the invoice
  registered     boolean not null default false,  -- registered at Bolagsverket?
  logo_url       text,
  invoice_footer text,
  created_at     timestamptz not null default now(),
  primary key (user_id, venture),
  constraint studio_venture_identity_venture_check check (venture in
    ('the_next_cigar','turquino','skattenavigator','zamacharters','cruiseshuttle','ifmba','other'))
);

alter table public.studio_venture_identity enable row level security;

drop policy if exists "own venture identity" on public.studio_venture_identity;
create policy "own venture identity" on public.studio_venture_identity
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Invoice columns the compliance module needs ─────────────────────────────
alter table public.studio_invoices
  -- Date the goods/services were actually supplied. Must be shown on the invoice
  -- when it differs from the invoice date.
  add column if not exists supply_date      date,
  -- The stated legal ground for any 0% line that isn't reverse charge.
  add column if not exists vat_exempt_note  text,
  -- Cached breakdown per rate: [{rate, net, vat, gross}, ...]. Stored so a
  -- historical invoice always reproduces exactly as it was sent.
  add column if not exists vat_breakdown    jsonb,
  add column if not exists payment_terms_days int not null default 30;

comment on column public.studio_invoices.vat_breakdown is
  'Beskattningsunderlag per momssats, frozen at send time. Required by ML 17 kap. for mixed-rate invoices.';
