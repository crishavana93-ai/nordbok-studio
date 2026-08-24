-- 011_moms_i_kronor.sql
-- An invoice in euros must still state the moms in kronor.
--
-- THE RULE
-- A Swedish business keeping its books in SEK may invoice in any currency, but when it
-- does, the VAT amount must ALSO be expressed in Swedish kronor on the invoice itself.
-- The rate must be either the latest published by the ECB or the most recent average
-- on the most representative Swedish currency market -- and it is the rate at the time
-- the tax liability arises, not the day someone happens to pay.
--
-- Nordbok has been issuing EUR invoices with no kronor anywhere on them. 2026-0002
-- went out that way.
--
-- WHY SEPARATE COLUMNS AND NOT total_sek
-- total_sek / vat_sek / fx_rate already exist and belong to a DIFFERENT conversion:
-- the one scripts/backfill-fx.mjs performs at PAYMENT date, because under
-- kontantmetoden that is when the moms is reported. The figure printed on the document
-- is fixed at the tax point and must never move afterwards. Two different questions,
-- two different dates, two different answers -- so two sets of columns. Collapsing them
-- would make the printed invoice change every time a payment was recorded.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

alter table public.studio_invoices
  add column if not exists doc_vat_sek  numeric,
  add column if not exists doc_fx_rate  numeric,
  add column if not exists doc_fx_date  date,
  add column if not exists doc_fx_source text;

comment on column public.studio_invoices.doc_vat_sek is
  'The moms in kronor AS PRINTED on the invoice. Frozen at send. Never recompute it — the customer holds a copy of the number that was there.';
comment on column public.studio_invoices.doc_fx_rate is
  'Rate used for doc_vat_sek, at the tax point. Printed alongside it so the figure can be checked without asking us.';

-- Frozen with everything else once the document has left. The guard from 010 lists the
-- fields that define the document; these now do too.
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
     -- printed on the document, therefore frozen with it
     or new.doc_vat_sek    is distinct from old.doc_vat_sek
     or new.doc_fx_rate    is distinct from old.doc_fx_rate
     or new.doc_fx_date    is distinct from old.doc_fx_date
  then
    raise exception 'Faktura % är skickad. Innehållet får inte ändras — utfärda en ändringsfaktura.',
      coalesce(old.invoice_number, old.id::text)
      using errcode = 'check_violation',
            hint = 'Betalstatus, SEK-omräkning för momsdeklarationen (total_sek) och pdf_url får fortfarande uppdateras.';
  end if;

  return new;
end;
$$;
