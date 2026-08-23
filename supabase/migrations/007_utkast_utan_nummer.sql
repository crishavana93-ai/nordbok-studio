-- 007_utkast_utan_nummer.sql
-- Drafts may exist without an invoice number.
--
-- WHY
-- 001 declared studio_invoices.invoice_number NOT NULL, back when the number was
-- guessed in JavaScript at create time. That guess bypassed next_invoice_number()
-- (002), which is the only thing that makes the series gap-free under a row lock --
-- two tabs or one double-click could hand out the same number twice.
--
-- The create form no longer writes a number; the send route allocates one. So a draft
-- legitimately has none, and NOT NULL is now the thing blocking every save:
--   null value in column "invoice_number" ... violates not-null constraint
--
-- Nothing about the legal requirement changes. Bokforingslagen cares about the series
-- of ISSUED invoices. An unsent draft is not issued, has no number, and cannot leave
-- a gap -- precisely because the number is handed out at send time and never before.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

alter table public.studio_invoices
  alter column invoice_number drop not null;

-- Uniqueness still holds for every number actually allocated. The index from 001 is
-- replaced by a partial one so the intent is explicit rather than relying on the
-- default that NULLs compare as distinct.
drop index if exists public.uq_studio_invoice_number;

create unique index if not exists uq_studio_invoice_number
  on public.studio_invoices (user_id, invoice_number)
  where invoice_number is not null;

-- A sent invoice without a number would be a defect, so say so at the table level.
alter table public.studio_invoices
  drop constraint if exists studio_invoices_sent_has_number;

alter table public.studio_invoices
  add constraint studio_invoices_sent_has_number
  check (status = 'draft' or status = 'cancelled' or invoice_number is not null)
  not valid;   -- `not valid` so existing rows are never rejected; new writes are checked

comment on column public.studio_invoices.invoice_number is
  'Null while the invoice is a draft. Allocated by next_invoice_number() at send time, under a row lock, so the series is gap-free.';
