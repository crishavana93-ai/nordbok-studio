-- 006_delad_atkomst.sql — read-only access for an accountant (revisor).
--
-- DESIGN: ADDITIVE, NEVER REWRITE
-- Every existing policy is `for all using (auth.uid() = user_id) with check (...)`.
-- PostgreSQL combines permissive policies with OR, so granting a second party read
-- access needs only an EXTRA select policy per table. The owner's policy is untouched.
-- Rewriting fifty working policies to add a clause would risk both directions at once:
-- locking the owner out, or opening a table too far. Nothing below alters an existing
-- policy.
--
-- WHAT A REVISOR CAN SEE — the books, not the person
--   shared: settings, clients, invoices, invoice_items, invoice_series, receipts,
--           documents, bank_tx, trips, business_trips, venture_identity
--   NOT:    studio_assistant_log  (private conversations with the assistant)
--           studio_notif_prefs    (push tokens — device identifiers, not accounting)
--           studio_tasks          (personal to-do list)
-- An accountant needs verifikationer and ledgers. They do not need his chat history.
--
-- WRITE ACCESS IS NOT GRANTED, AT ALL
-- Every policy below is `for select`. A member cannot insert, update or delete
-- anything, in any table, by any path. Read-only is enforced by the database, not by
-- hiding buttons in the UI.
--
-- REVOCATION IS IMMEDIATE
-- `can_read` requires status = 'active'. Setting a membership to 'revoked' cuts access
-- on the very next query — no session to expire, no cache to clear.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Who may read whose books
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_memberships (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  member_id     uuid references auth.users(id) on delete cascade,  -- null until accepted
  invited_email text not null,
  role          text not null default 'revisor' check (role in ('revisor')),
  status        text not null default 'pending' check (status in ('pending','active','revoked')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  note          text,
  unique (owner_id, invited_email)
);

comment on table public.studio_memberships is
  'Read-only access grants. owner_id owns the books; member_id is the accountant. Write access is never granted through this table.';

-- The index RLS leans on: can_read() runs once per statement per owner, but the
-- acceptance lookup runs per login.
create index if not exists idx_memberships_member_active
  on public.studio_memberships (member_id, status) where status = 'active';
create index if not exists idx_memberships_email
  on public.studio_memberships (lower(invited_email));

alter table public.studio_memberships enable row level security;

-- The owner manages their own grants.
drop policy if exists memberships_owner_all on public.studio_memberships;
create policy memberships_owner_all on public.studio_memberships
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- A member may see the grants that name them, so the app can tell them whose books
-- they can open. They cannot change them.
drop policy if exists memberships_member_read on public.studio_memberships;
create policy memberships_member_read on public.studio_memberships
  for select using (auth.uid() = member_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The predicate every shared policy uses
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the lookup cannot recurse into studio_memberships' own RLS.
-- search_path is pinned: without it a definer function is a privilege-escalation
-- vector, because the caller could resolve `studio_memberships` to a table of
-- their own making.
create or replace function public.can_read(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_owner = auth.uid()
    or exists (
      select 1
      from public.studio_memberships m
      where m.owner_id  = p_owner
        and m.member_id = auth.uid()
        and m.status    = 'active'
    );
$$;

revoke all on function public.can_read(uuid) from public;
grant execute on function public.can_read(uuid) to authenticated;

comment on function public.can_read(uuid) is
  'True if the caller owns p_owner''s books or holds an active membership on them. Read only — never used to authorise a write.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · One extra SELECT policy per shared table. Nothing existing is modified.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  shared text[] := array[
    'studio_settings','studio_clients','studio_invoices','studio_invoice_items',
    'studio_invoice_series','studio_receipts','studio_documents','studio_bank_tx',
    'studio_trips','studio_business_trips','studio_venture_identity'
  ];
begin
  foreach t in array shared loop
    if to_regclass('public.' || t) is null then
      raise notice 'hoppar över %, tabellen finns inte', t;
      continue;
    end if;
    execute format('drop policy if exists shared_read on public.%I', t);
    execute format(
      'create policy shared_read on public.%I for select using (public.can_read(user_id))', t);
    raise notice 'delad läsning på %', t;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · The verifikationer themselves
-- ─────────────────────────────────────────────────────────────────────────────
-- Storage paths are `<owner uuid>/<hash prefix>/<hash>.<ext>`, so the first path
-- segment is the owner. Read only; upload/update/delete policies are untouched.
drop policy if exists shared_read_receipt_files on storage.objects;
create policy shared_read_receipt_files on storage.objects
  for select using (
    bucket_id = 'studio-receipts'
    and public.can_read(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists shared_read_document_files on storage.objects;
create policy shared_read_document_files on storage.objects
  for select using (
    bucket_id = 'studio-documents'
    and public.can_read(((storage.foldername(name))[1])::uuid)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Invite, accept, revoke
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bjud_in_revisor(p_email text, p_note text default null)
returns public.studio_memberships
language plpgsql
security invoker            -- runs as the owner; their own RLS applies
set search_path = public, pg_temp
as $$
declare r public.studio_memberships;
begin
  if auth.uid() is null then raise exception 'Inte inloggad.'; end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'Ogiltig e-postadress.';
  end if;
  if lower(p_email) = lower(coalesce(auth.email(), '')) then
    raise exception 'Du kan inte bjuda in dig själv.';
  end if;

  insert into public.studio_memberships (owner_id, invited_email, note)
  values (auth.uid(), lower(p_email), p_note)
  on conflict (owner_id, invited_email) do update
    set status = 'pending', revoked_at = null, note = coalesce(excluded.note, studio_memberships.note)
  returning * into r;
  return r;
end $$;

-- The invitee claims the grant. SECURITY DEFINER because the pending row belongs to
-- the owner, so the invitee cannot see or update it under their own RLS.
create or replace function public.acceptera_inbjudan()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Inte inloggad.'; end if;
  if auth.email() is null then raise exception 'Kontot saknar e-postadress.'; end if;

  update public.studio_memberships
     set member_id = auth.uid(), status = 'active', accepted_at = now()
   where lower(invited_email) = lower(auth.email())
     and status = 'pending'
     and (member_id is null or member_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.acceptera_inbjudan() from public;
grant execute on function public.acceptera_inbjudan() to authenticated;

create or replace function public.aterkalla_atkomst(p_membership uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.studio_memberships
     set status = 'revoked', revoked_at = now(), member_id = null
   where id = p_membership and owner_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · Kontroll — kör detta och läs svaret
-- ─────────────────────────────────────────────────────────────────────────────
select 'delade läspolicies' as kontroll, tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname = 'shared_read'
order by tablename;

-- Måste vara 0 rader: ingen delad policy får tillåta skrivning.
select 'SKRIVFEL — ska vara tomt' as kontroll, tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname like 'shared%' and cmd <> 'SELECT';

-- Måste vara 0 rader: dessa tre tabeller ska aldrig delas.
select 'LÄCKA — ska vara tomt' as kontroll, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('studio_assistant_log','studio_notif_prefs','studio_tasks')
  and policyname like 'shared%';

select 'ägarpolicies orörda' as kontroll, count(*) as antal
from pg_policies
where schemaname = 'public' and policyname like 'own%';
