-- 012_kreditfaktura_rader.sql
-- Fix: skapa_andringsfaktura() never worked. Not once.
--
-- WHAT WAS WRONG
-- 010 introduced the andringsfaktura as the only lawful way to correct a sent
-- invoice, and in the same migration made sent invoices immutable. The line-item
-- copy omitted user_id:
--
--   insert into public.studio_invoice_items
--     (invoice_id, position, description, quantity, unit, unit_price, vat_rate, rot_rut_hours)
--
-- studio_invoice_items.user_id is NOT NULL (001). The function is security definer,
-- so it bypasses RLS -- but not a constraint. Every call raised and rolled back,
-- including the header inserted moments earlier.
--
-- The consequence was worse than a broken feature: with the guard refusing every
-- UPDATE and DELETE on a sent invoice, and the only sanctioned escape hatch failing
-- on its first statement, a wrong sent invoice had NO lawful correction path at all.
-- The lock and the hatch were built together precisely so that could not happen.
--
-- Had it succeeded it would have been worse still. Items with user_id IS NULL match
-- neither own_invoice_items (auth.uid() = user_id -> NULL) nor shared_read
-- (can_read(user_id) -> NULL), so the credit note's lines would have been invisible
-- to everyone while its negative header totals fed every sum().
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

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
  v_rader int;
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
    null, 'draft', current_date, current_date,
    v_src.reference, v_src.ocr_number, v_src.currency, v_src.language, v_src.venture,
    -v_src.subtotal, -v_src.vat_amount, -v_src.total,
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

  -- user_id is the fix. It is NOT NULL, it carries the RLS predicate, and without
  -- it neither the owner nor an invited revisor can see the lines.
  insert into public.studio_invoice_items
    (invoice_id, user_id, position, description, quantity, unit, unit_price, vat_rate, rot_rut_hours)
  select v_new, v_user, position, description, -quantity, unit, unit_price, vat_rate,
         case when rot_rut_hours is null then null else -rot_rut_hours end
    from public.studio_invoice_items
   where invoice_id = p_invoice_id
   order by position;

  get diagnostics v_rader = row_count;

  -- A credit note with no lines is not a correction of anything. Refuse loudly here
  -- rather than let it reach ComplianceGate as "Fakturan saknar rader".
  if v_rader = 0 then
    raise exception 'Ursprungsfakturan % har inga rader att kreditera.', v_src.invoice_number;
  end if;

  return v_new;
end;
$$;

revoke all on function public.skapa_andringsfaktura(uuid, text) from public;
grant execute on function public.skapa_andringsfaktura(uuid, text) to authenticated;
