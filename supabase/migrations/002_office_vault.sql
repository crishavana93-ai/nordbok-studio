-- ═════════════════════════════════════════════════════════════════════════════
-- NORDBOK STUDIO — Office vault: long-term documents, deadlines, assistant log
-- Treats the app as a digital office: 7-year retention per Bokföringslagen.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Documents (contracts, leases, registreringsbevis, supplier T&Cs, payslips) ──
create table if not exists public.studio_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  doc_type        text,                 -- contract | registreringsbevis | invoice_in | invoice_out | bank_statement | sie | tax_filing | id | other
  category        text,                 -- "Skatteverket", "Bank", "Försäkring", "Hyresavtal", ...
  storage_path    text not null,        -- Supabase storage object path
  mime_type       text,
  size_bytes      bigint,
  issued_date     date,
  retention_until date,                  -- e.g. issued_date + 7 years (Bokföringslagen)
  tags            text[] default '{}',
  related_invoice uuid references public.studio_invoices(id) on delete set null,
  related_receipt uuid references public.studio_receipts(id) on delete set null,
  related_client  uuid references public.studio_clients(id)  on delete set null,
  notes           text,
  created_at      timestamptz default now()
);
create index if not exists idx_studio_documents_user on public.studio_documents(user_id);
create index if not exists idx_studio_documents_type on public.studio_documents(user_id, doc_type);
create index if not exists idx_studio_documents_retention on public.studio_documents(retention_until);

-- ─── Tasks / deadlines / reminders ──────────────────────────────────────────
create table if not exists public.studio_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  description     text,
  due_at          timestamptz not null,
  remind_at       timestamptz,                       -- when to email/push
  category        text,                              -- "tax_deadline" | "invoice_followup" | "filing" | "manual" | "recurring"
  source          text default 'manual',             -- "manual" | "system" | "assistant"
  recurring_rule  text,                              -- iCal RRULE, e.g. "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=12"
  priority        text default 'normal',             -- "low" | "normal" | "high"
  status          text default 'open',               -- "open" | "done" | "snoozed" | "cancelled"
  related_invoice uuid references public.studio_invoices(id) on delete set null,
  related_receipt uuid references public.studio_receipts(id) on delete set null,
  notified_at     timestamptz,
  done_at         timestamptz,
  created_at      timestamptz default now()
);
create index if not exists idx_studio_tasks_user_due on public.studio_tasks(user_id, due_at);
create index if not exists idx_studio_tasks_status on public.studio_tasks(user_id, status);

-- ─── Notification preferences ───────────────────────────────────────────────
create table if not exists public.studio_notif_prefs (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  email_digest         boolean default true,           -- weekly summary
  email_deadlines      boolean default true,
  email_invoice_paid   boolean default true,
  email_invoice_overdue boolean default true,
  push_enabled         boolean default false,
  webpush_subscription jsonb,
  digest_day           int default 1,                  -- 1=Mon
  digest_hour          int default 8                   -- local hour
);

-- ─── Assistant conversation log (chat with Claude over your data) ───────────
create table if not exists public.studio_assistant_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  thread_id       uuid not null,
  role            text not null,            -- "user" | "assistant" | "tool"
  content         text not null,
  tool_calls      jsonb,
  created_at      timestamptz default now()
);
create index if not exists idx_studio_assistant_log on public.studio_assistant_log(user_id, thread_id, created_at);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.studio_documents      enable row level security;
alter table public.studio_tasks          enable row level security;
alter table public.studio_notif_prefs    enable row level security;
alter table public.studio_assistant_log  enable row level security;

drop policy if exists own_documents on public.studio_documents;
create policy own_documents on public.studio_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_tasks on public.studio_tasks;
create policy own_tasks on public.studio_tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_notif_prefs on public.studio_notif_prefs;
create policy own_notif_prefs on public.studio_notif_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_assistant_log on public.studio_assistant_log;
create policy own_assistant_log on public.studio_assistant_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Seed Swedish tax deadlines for the current year ────────────────────────
-- Run this once per user via the app (see lib/seed-deadlines.js). Examples:
-- moms-deklaration kvartal: 12 maj, 17 aug, 12 nov, 12 feb
-- NE-bilaga / inkomstdeklaration 1: 2 maj
-- F-skatt månadsbetalning: 12 varje månad
-- Förtroendet/årsmöte/kontrolluppgifter: 31 jan
