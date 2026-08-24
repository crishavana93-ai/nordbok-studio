-- 013_felloggning.sql
-- Somewhere for errors to go.
--
-- WHY THIS IS A TABLE AND NOT A SERVICE
-- The audit's finding was blunt: no Sentry, no error boundary, no alerting, ten
-- console.error calls landing in a Vercel log stream nobody reads. If the send route
-- started failing tonight, the only signal would be a customer eventually asking where
-- their invoice went.
--
-- An external service is the right long-term answer, but it needs an account, a DSN
-- and a dependency. This needs none of those and works in the next deploy. It is also
-- the honest fit for a single-operator app: the person who needs to know is the person
-- already signed in.
--
-- WHAT MUST NEVER END UP HERE
-- Errors carry context, and context in this app means personnummer, client names,
-- amounts and file paths. The `context` column takes a SMALL redacted object assembled
-- by hand at the call site -- never a whole row, never a request body. lib/report-error.js
-- enforces a size cap; this comment is the reason it exists.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.

create table if not exists public.studio_error_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  -- Where it happened: a stable string like "api/invoices/send" or "ui/receipts".
  scope      text not null,
  message    text not null,
  stack      text,
  -- Small, redacted, hand-assembled. See the note above.
  context    jsonb,
  url        text,
  -- 'error' stops the user; 'warn' is something that recovered but should not have.
  level      text not null default 'error',
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.studio_error_log
  drop constraint if exists studio_error_log_level_check;
alter table public.studio_error_log
  add constraint studio_error_log_level_check check (level in ('error','warn'));

create index if not exists ix_error_log_recent
  on public.studio_error_log (user_id, created_at desc);

create index if not exists ix_error_log_unseen
  on public.studio_error_log (user_id) where seen_at is null;

alter table public.studio_error_log enable row level security;

-- Own errors only. Deliberately NOT added to 006's shared_read set: an accountant
-- reviewing the books has no business reading crash reports, and a stack trace is
-- exactly the kind of thing that leaks more than intended.
drop policy if exists "own errors" on public.studio_error_log;
create policy "own errors" on public.studio_error_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- An error thrown before sign-in has no user_id and still needs somewhere to land.
-- Insert-only, and unreadable by anyone through the API.
drop policy if exists "anonymous errors insert" on public.studio_error_log;
create policy "anonymous errors insert" on public.studio_error_log
  for insert to anon
  with check (user_id is null);

-- ── Keep it from becoming a landfill ────────────────────────────────────────
-- Errors are operational, not räkenskapsinformation: no retention duty applies, and
-- an unbounded log on a free-tier project eventually becomes the problem it was
-- meant to report. 90 days is long enough to spot a pattern.
create or replace function public.studio_prune_error_log()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from public.studio_error_log where created_at < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.studio_prune_error_log() from public;
grant execute on function public.studio_prune_error_log() to authenticated;

comment on table public.studio_error_log is
  'Operational error log. Not räkenskapsinformation — pruned after 90 days by studio_prune_error_log(). Never share with a revisor.';
