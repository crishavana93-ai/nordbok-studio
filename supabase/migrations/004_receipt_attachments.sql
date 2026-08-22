-- 004_receipt_attachments.sql
-- Makes the stored image evidence rather than decoration.
--
-- WHY THE HASH MATTERS
-- Since 2024-07-01 a paper receipt may be destroyed once digitised. That makes the
-- stored file the PRIMARY accounting record, not a convenience copy. A SHA-256 taken
-- at upload proves the image has not changed since it was booked — and it gives us
-- duplicate detection for free, which this dataset already needed: the Anthropic
-- receipt NLCLAITV-0007 exists twice in /Recipts as two differently-named PDFs of the
-- same €116,04 transaction.
--
-- Run in Supabase → SQL Editor. Safe to re-run.

alter table public.studio_receipts
  add column if not exists file_hash   text,        -- sha256 hex of the stored bytes
  add column if not exists file_mime   text,
  add column if not exists file_size   bigint,
  add column if not exists file_name   text,        -- original name, for the archive
  add column if not exists uploaded_at timestamptz,
  -- Mixed-use apportionment. 1 = fully business. Applied to input VAT in ruta 48.
  add column if not exists business_share numeric default 1
    check (business_share >= 0 and business_share <= 1),
  -- Set when the period containing this receipt is filed. After that it is frozen:
  -- a receipt that changes after you have reported it invalidates a signed return.
  add column if not exists locked_at   timestamptz;

comment on column public.studio_receipts.file_hash is
  'SHA-256 of the stored file at upload. Proves the verifikation has not changed since booking.';
comment on column public.studio_receipts.locked_at is
  'Set when the VAT period containing this receipt is filed. Non-null = immutable.';

-- One receipt per file, per user. Makes re-uploading the same photo a no-op instead
-- of a duplicate deduction.
create unique index if not exists uq_receipt_file_hash
  on public.studio_receipts (user_id, file_hash)
  where file_hash is not null;

create index if not exists idx_receipts_locked on public.studio_receipts (locked_at);

-- ── Refuse edits to a filed receipt ─────────────────────────────────────────
-- A UI rule is a suggestion; a trigger is a guarantee. It survives a bug in a route
-- handler, a direct SQL edit, and a future developer who hasn't read the docs.
create or replace function public.reject_locked_receipt()
returns trigger
language plpgsql
as $$
begin
  if OLD.locked_at is not null then
    -- Allow only the lock itself to be cleared by an explicit unlock (omprövning).
    if TG_OP = 'DELETE' then
      raise exception 'Kvittot ingår i en inlämnad momsdeklaration (låst %) och kan inte tas bort.', OLD.locked_at;
    end if;
    if NEW.locked_at is not null then
      raise exception 'Kvittot ingår i en inlämnad momsdeklaration (låst %) och kan inte ändras. Gör en omprövning i stället.', OLD.locked_at;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_lock_filed_receipts on public.studio_receipts;
create trigger trg_lock_filed_receipts
  before update or delete on public.studio_receipts
  for each row
  execute function public.reject_locked_receipt();
