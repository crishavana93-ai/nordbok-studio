-- ═════════════════════════════════════════════════════════════════════════════
-- Multi-currency + locale tweaks. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

-- Settings: preferred display locale + default invoice currency
alter table public.studio_settings
  add column if not exists preferred_locale text default 'sv-SE',
  add column if not exists default_currency text default 'SEK';

-- Clients: optional preferred currency + language
alter table public.studio_clients
  add column if not exists preferred_currency text,
  add column if not exists language text default 'sv';

-- Invoices: ensure currency column exists (it should from migration 001) + payment terms snapshot
alter table public.studio_invoices
  add column if not exists payment_terms_days int default 30,
  add column if not exists language text default 'sv';

-- Receipts: ensure currency column exists, plus exchange rate at capture (so we can convert later if needed)
alter table public.studio_receipts
  add column if not exists fx_rate_to_sek numeric;
