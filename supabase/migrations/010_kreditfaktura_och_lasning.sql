-- 010_kreditfaktura_och_lasning.sql
-- Correcting an invoice, and making sure that is the ONLY way to correct one.
--
-- WHY THESE TWO SHIP TOGETHER
-- Bokforingslagen 5 kap. and the faktura rules in mervardesskattelagen point the same
-- way: a document that has left your hands is a fact in someone else's accounts and
-- must not change afterwards. Today nothing stops an UPDATE on a sent invoice -- so
-- the only way to fix 2026-0002 is exactly the illegal one.
--
-- Locking sent invoices without giving a lawful way to correct them would just trap
-- you. So the lock and the andringsfaktura arrive in the same migration.
--
-- TERMINOLOGY
-- Under the mervardesskattelag in force since 2023-07-01 what everyone still calls a
-- kreditfaktura is an ANDRINGSFAKTURA. It must carry:
--   1. the change to the original invoice,
--   2. a sarskild och otvetydig hanvisning to that original invoice,
--   3. what was changed.
-- It is itself a faktura, so it takes its own number from the same unbroken series.
--
-- WHY NEGATIVE AMOUNTS AND NOT A FLAG
-- A credit note stores its totals negative. Every sum() already written over
-- studio_invoices -- revenue, outstanding, the moms figures -- then corrects itself
-- with no special-casing. A boolean flag would require every one of those call sites
-- to remember it, and the one that forgets is a wrong tax return.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.studio_invoices
  add column if not exists document_type text not null default 'invoice',
  add column if not exists credit_of     uuid references public.studio_invoices(id) on delete restrict,
  add column if not exists credit_reason text,
  add column if not exists credited_at   timestamptz;

alter table public.studio_invoices
  drop constraint if exists studio_invoices_document_type_check;
alter table public.studio_invoices
  add constraint studio_invoices_document_type_check
  check (document_type in ('invoice','credit_note'));

-- An andringsfaktura with no reference to what it changes is not one.
alter table public.studio_invoices
  drop constraint if exists studio_invoices_credit_needs_ref;
alter table public.studio_invoices
  add constraint studio_invoices_credit_needs_ref
  check (document_type <> 'credit_note' or credit_of is not null) not valid;

-- ...and it may never increase what is owed.
alter table public.studio_invoices
  drop constraint if exists studio_invoices_credit_is_negative;
alter table public.studio_invoices
  add constraint studio_invoices_credit_is_negative
  check (document_type <> 'credit_note' or total <= 0) not valid;

create index if not exists ix_studio_invoices_credit_of
  on public.studio_invoices (credit_of) where credit_of is not null;

comment on column public.studio_invoices.credit_of is
  'The invoice this andringsfaktura corrects. This IS the sarskilda och otvetydiga hanvisning the law requires -- it is not decoration, do not allow it to be null on a credit note.';

-- ── The lock ────────────────────────────────────────────────────────────────
-- Fields that DEFINE the document are frozen once sent_at is set. Fields that record
-- what happened to it afterwards stay open, because payment is not a rewrite.
create or replace function public.studio_invoices_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.sent_at is not null then
      raise exception 'Faktura % är skickad och får inte raderas. Rätta med en ändringsfaktura i stället.',
        coalesce(old.invoice_number, old.id::text)
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Drafts are freely editable. That is what a draft is for.
  if old.sent_at is null then
    return new;
  end if;

  if new.invoice_number is distinct from old.invoice_number
     or new.document_type  is distinct from old.document_type
     or new.credit_of      is distinct from old.credit_of
     or new.client_id      is distinct from old.client_id
     or new.issue_date     is distinct from old.issue_date
     or new.due_date       is distinct from old.due_date
     or new.currency       is distinct from old.currency
     or new.subtotal       is distinct from old.subtotal
     or new.vat_amount     is distinct from old.vat_amount
     or new.total          is distinct from old.total
     or new.vat_breakdown  is distinct from old.vat_breakdown
     or new.reverse_charge is distinct from old.reverse_charge
     or new.rot_amount     is distinct from old.rot_amount
     or new.rut_amount     is distinct from old.rut_amount
     or new.ocr_number     is distinct from old.ocr_number
     or new.venture        is distinct from old.venture
     or new.notes          is distinct from old.notes
     or new.sent_at        is distinct from old.sent_at
  then
    raise exception 'Faktura % är skickad. Innehållet får inte ändras — utfärda en ändringsfaktura.',
      coalesce(old.invoice_number, old.id::text)
      using errcode = 'check_violation',
            hint = 'Betalstatus, credited_at och pdf_url får fortfarande uppdateras.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_studio_invoices_guard on public.studio_invoices;
create trigger trg_studio_invoices_guard
  before update or delete on public.studio_invoices
  for each row execute function public.studio_invoices_guard();

-- The lines are part of the document too. Locking the header alone would be theatre.
create or replace function public.studio_invoice_items_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sent timestamptz;
  v_id   uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  select sent_at into v_sent from public.studio_invoices where id = v_id;
  if v_sent is not null then
    raise exception 'Fakturan är skickad. Raderna får inte ändras — utfärda en ändringsfaktura.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_studio_invoice_items_guard on public.studio_invoice_items;
create trigger trg_studio_invoice_items_guard
  before insert or update or delete on public.studio_invoice_items
  for each row execute function public.studio_invoice_items_guard();

-- ── Creating the andringsfaktura ────────────────────────────────────────────
-- A database function rather than app code, for the same reason next_invoice_number()
-- is: the copy must be exact and the negation must be total. A UI that builds this by
-- hand will one day forget one field, and that field will be the moms.
--
-- Returns the new DRAFT's id. It is a draft on purpose -- it goes out through the same
-- ComplianceGate and gets its number at send, like any other faktura.
create or replace function public.skapa_andringsfaktura(
  p_invoice_id uuid,
  p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_src  public.studio_invoices%rowtype;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'En ändringsfaktura måste ange vad som ändrats.';
  end if;

  select * into v_src from public.studio_invoices
   where id = p_invoice_id and user_id = v_user;
  if not found then
    raise exception 'Fakturan hittades inte.';
  end if;
  if v_src.sent_at is null then
    raise exception 'Utkast krediteras inte — ändra utkastet direkt.';
  end if;
  if v_src.document_type = 'credit_note' then
    raise exception 'En ändringsfaktura kan inte krediteras.';
  end if;
  if exists (select 1 from public.studio_invoices
              where credit_of = p_invoice_id and status <> 'cancelled') then
    raise exception 'Det finns redan en ändringsfaktura för faktura %.', v_src.invoice_number;
  end if;

  insert into public.studio_invoices (
    user_id, client_id, document_type, credit_of, credit_reason,
    invoice_number, status, issue_date, due_date,
    reference, ocr_number, currency, language, venture,
    subtotal, vat_amount, total, vat_breakdown,
    rot_amount, rut_amount, rot_rut_type, reverse_charge, oss_country,
    notes
  ) values (
    v_user, v_src.client_id, 'credit_note', v_src.id, btrim(p_reason),
    null,                       -- allocated at send, like every other faktura
    'draft', current_date, current_date,
    v_src.reference, v_src.ocr_number, v_src.currency, v_src.language, v_src.venture,
    -v_src.subtotal, -v_src.vat_amount, -v_src.total,
    -- ->> returns TEXT. Without the cast the frozen breakdown comes back as
    -- {"rate":"25"} where the original held {"rate":25}, and every consumer that
    -- compares the rate numerically silently stops matching. Caught in test.
    (select jsonb_agg(jsonb_build_object(
        'rate', (r->>'rate')::numeric,
        'net',  -((r->>'net')::numeric),
        'vat',  -((r->>'vat')::numeric),
        'gross',-((r->>'gross')::numeric)))
       from jsonb_array_elements(coalesce(v_src.vat_breakdown, '[]'::jsonb)) r),
    -coalesce(v_src.rot_amount,0), -coalesce(v_src.rut_amount,0),
    v_src.rot_rut_type, v_src.reverse_charge, v_src.oss_country,
    'Ändringsfaktura avseende faktura ' || v_src.invoice_number || '. ' || btrim(p_reason)
  ) returning id into v_new;

  -- Negate the quantity, not the price: "-1 st" reads correctly on the printed
  -- document, where "1 st a -999,76 kr" reads like a discount nobody agreed to.
  insert into public.studio_invoice_items
    (invoice_id, position, description, quantity, unit, unit_price, vat_rate, rot_rut_hours)
  select v_new, position, description, -quantity, unit, unit_price, vat_rate,
         case when rot_rut_hours is null then null else -rot_rut_hours end
    from public.studio_invoice_items
   where invoice_id = p_invoice_id
   order by position;

  return v_new;
end;
$$;

revoke all on function public.skapa_andringsfaktura(uuid, text) from public;
grant execute on function public.skapa_andringsfaktura(uuid, text) to authenticated;

-- ── Mark the original once the credit note actually goes out ────────────────
create or replace function public.studio_mark_credited()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.document_type = 'credit_note'
     and new.sent_at is not null
     and (old.sent_at is null)
     and new.credit_of is not null
  then
    update public.studio_invoices
       set credited_at = new.sent_at,
           status = case when abs(new.total) >= abs(studio_invoices.total) then 'cancelled' else status end
     where id = new.credit_of;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_studio_mark_credited on public.studio_invoices;
create trigger trg_studio_mark_credited
  after update on public.studio_invoices
  for each row execute function public.studio_mark_credited();
