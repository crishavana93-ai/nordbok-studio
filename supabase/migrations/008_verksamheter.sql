-- 008_verksamheter.sql
-- Which name goes at the top of the invoice, and which address it is sent from.
--
-- THE PROBLEM THIS SOLVES
-- One enskild firma. One personnummer, one momsregistrering, one NE-bilaga -- but
-- several brands doing the work. Skatteverket's position is that the seller named on a
-- faktura is the LEGAL name: a name registered at Bolagsverket, or failing that the
-- person's own name. A brand may appear next to it; it may never replace it. Get this
-- wrong and it is the CUSTOMER whose avdrag for ingaende moms is questioned.
--
-- So a venture is not free text. It declares what kind of name it is:
--
--   primary   The registered foretagsnamn. It IS the seller. Prints alone.
--   sarskilt  A registered sarskilt foretagsnamn (formerly bifirma). May head the
--             invoice, but the main name must appear with it -- so we print both.
--   brand     Not registered anywhere. A marketing name. NEVER the seller. It appears
--             as a reference line ("Avser: The Next Cigar") while the header stays
--             legal.
--
-- `registered` is kept in sync by trigger so nothing can drift out of agreement with
-- name_type. Do not set it by hand.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

-- ── Venture identity gains a name classification and its own sender ─────────
alter table public.studio_venture_identity
  add column if not exists name_type  text,
  add column if not exists from_email text,
  add column if not exists reply_to   text;

update public.studio_venture_identity
  set name_type = case when registered then 'primary' else 'brand' end
  where name_type is null;

alter table public.studio_venture_identity
  alter column name_type set default 'brand',
  alter column name_type set not null;

alter table public.studio_venture_identity
  drop constraint if exists studio_venture_identity_name_type_check;

alter table public.studio_venture_identity
  add constraint studio_venture_identity_name_type_check
  check (name_type in ('primary','sarskilt','brand'));

-- `registered` is derived, never authored.
create or replace function public.studio_venture_sync_registered()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.registered := (new.name_type <> 'brand');
  return new;
end;
$$;

drop trigger if exists trg_venture_sync_registered on public.studio_venture_identity;
create trigger trg_venture_sync_registered
  before insert or update on public.studio_venture_identity
  for each row execute function public.studio_venture_sync_registered();

-- At most one primary name. There is one legal entity; it has one main name.
create unique index if not exists uq_venture_primary_per_user
  on public.studio_venture_identity (user_id)
  where name_type = 'primary';

comment on column public.studio_venture_identity.from_email is
  'Sender address for invoices issued under this venture, e.g. hello@turquinostudios.com. The domain must be verified in Resend or the send fails.';

-- ── The invoice records which venture it was issued under ───────────────────
-- Deliberately NOT a foreign key. A venture may be renamed or retired years from now;
-- an invoice already sent must keep reproducing exactly as it was sent, and a cascade
-- or a set-null would quietly rewrite history. Bokforingslagen 7 kap. wants the
-- opposite of that.
alter table public.studio_invoices
  add column if not exists venture text;

comment on column public.studio_invoices.venture is
  'Venture key this invoice was issued under. Null means the primary registered name.';

-- What address it actually went out from. Part of the audit trail: months later,
-- "which mailbox did this leave from" is a question with one answer, not a guess.
alter table public.studio_invoices
  add column if not exists sent_from text;

-- ── Fallback sender for the whole business ──────────────────────────────────
alter table public.studio_settings
  add column if not exists from_email text;

comment on column public.studio_settings.from_email is
  'Default sender address when the venture has none. Domain must be verified in Resend.';
