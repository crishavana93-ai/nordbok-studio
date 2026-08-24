-- 009_nummerserie_aterlamning.sql
-- Give a number back when the send fails, and keep a record of every gap.
--
-- WHAT WENT WRONG
-- 002 made allocation atomic so two tabs could never share a number. It did not
-- consider the other direction: a number allocated for a send that then FAILS is
-- consumed forever. On 2026-08-24 the Resend key could not see the domain, the send
-- returned 502 -- and 2026-0001 had already been handed out. The series jumped
-- straight to 2026-0002. Exactly the gap the whole design exists to prevent.
--
-- THE FIX HAS TWO HALVES
--  1. The route now verifies the transport BEFORE asking for a number (app code).
--  2. When a send fails anyway, the number is handed back here -- but ONLY if it is
--     still the highest one issued. If another invoice was allocated in between, the
--     number is genuinely spent and decrementing would hand out a duplicate, which is
--     far worse than a gap. In that case we record the gap instead of hiding it.
--
-- WHY RECORD GAPS AT ALL
-- Bokforingslagen wants an unbroken series. Where one does break, what saves you at a
-- revision is being able to say what happened and when -- not pretending it did not.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

-- ── A log of numbers that were issued and never used ────────────────────────
create table if not exists public.studio_invoice_number_gaps (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  series         text not null default 'default',
  year           int  not null,
  invoice_number text not null,
  reason         text,
  reclaimed      boolean not null default false,  -- true = handed back, no gap remains
  created_at     timestamptz not null default now()
);

alter table public.studio_invoice_number_gaps enable row level security;

drop policy if exists "own gaps" on public.studio_invoice_number_gaps;
create policy "own gaps" on public.studio_invoice_number_gaps
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Hand a number back ──────────────────────────────────────────────────────
-- Returns true if the series was rewound, false if the number is spent and a gap
-- has been logged instead. Never raises: a failed send must not become two errors.
create or replace function public.release_invoice_number(
  p_number text,
  p_reason text default null,
  p_series text default 'default',
  p_year   int  default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_year int  := coalesce(p_year, split_part(p_number, '-', 1)::int);
  v_no   int  := split_part(p_number, '-', 2)::int;
  v_last int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the series row so a concurrent allocation cannot slip between the read and
  -- the write. Without this, two failed sends could both believe they were last.
  select last_no into v_last
    from public.studio_invoice_series
   where user_id = v_user and series = p_series and year = v_year
     for update;

  if v_last = v_no then
    update public.studio_invoice_series
       set last_no = last_no - 1
     where user_id = v_user and series = p_series and year = v_year;

    insert into public.studio_invoice_number_gaps
      (user_id, series, year, invoice_number, reason, reclaimed)
      values (v_user, p_series, v_year, p_number, p_reason, true);
    return true;
  end if;

  -- Somebody else took the next number already. The gap is real; log it plainly.
  insert into public.studio_invoice_number_gaps
    (user_id, series, year, invoice_number, reason, reclaimed)
    values (v_user, p_series, v_year, p_number, p_reason, false);
  return false;
end;
$$;

revoke all on function public.release_invoice_number(text, text, text, int) from public;
grant execute on function public.release_invoice_number(text, text, text, int) to authenticated;

-- ── Record the gap that already happened, so the books explain themselves ───
-- 2026-0001 was allocated at 09:31 on 2026-08-24 and the send failed on an
-- unverified sending domain. It was never issued to anyone.
insert into public.studio_invoice_number_gaps (user_id, series, year, invoice_number, reason, reclaimed)
select s.user_id, 'default', 2026, '2026-0001',
       'Tilldelat vid utskicksförsök 2026-08-24 09:31. Utskicket misslyckades (avsändardomänen ej verifierad hos e-postleverantören). Fakturan skickades aldrig och existerar inte.',
       false
  from public.studio_invoice_series s
 where s.year = 2026
   and not exists (
     select 1 from public.studio_invoices i
      where i.user_id = s.user_id and i.invoice_number = '2026-0001')
   and not exists (
     select 1 from public.studio_invoice_number_gaps g
      where g.user_id = s.user_id and g.invoice_number = '2026-0001');

-- ── Blindkopia: a copy of every invoice into a mailbox you control ──────────
alter table public.studio_settings
  add column if not exists invoice_bcc text;

alter table public.studio_venture_identity
  add column if not exists bcc text;

comment on column public.studio_settings.invoice_bcc is
  'Address blind-copied on every invoice send. Resend delivers through its own servers, so nothing appears in your mail client Sent folder -- this is how a copy reaches your mailbox.';
